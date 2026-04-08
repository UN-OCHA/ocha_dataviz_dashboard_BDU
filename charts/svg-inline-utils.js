/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * SvgInlineUtils — Reads flag/icon SVGs from disk and prepares them
 * for inline embedding inside chart SVGs.
 *
 * Runs in the CEP panel context (Chromium + Node.js).
 * Chart renderers receive pre-resolved SVG content via data items.
 */

/* global FlagsData */

var SvgInlineUtils = (function () {
  "use strict";

  var fs;
  try { fs = require("fs"); } catch (e) { fs = null; }

  var idCounter = 0;
  var cache = {}; // keyed by filePath → { innerSvg, vbW, vbH }

  // ── Flag lookup index (built once) ──────────────────────

  var flagByCode = null; // lazy init: { "AFG": { name, code, file }, ... }
  var flagByName = null; // lazy init: { "afghanistan": { name, code, file }, ... }

  function ensureFlagIndex() {
    if (flagByCode) return;
    flagByCode = {};
    flagByName = {};
    if (typeof FlagsData === "undefined") return;
    for (var i = 0; i < FlagsData.length; i++) {
      var f = FlagsData[i];
      if (f.code) flagByCode[f.code.toUpperCase()] = f;
      if (f.name) flagByName[f.name.toLowerCase()] = f;
    }
  }

  // ── SVG content processing ──────────────────────────────

  /**
   * Read an SVG file, strip outer wrapper, scope IDs, extract viewBox.
   * Returns { innerSvg, vbW, vbH } or null.
   */
  function readAndProcess(filePath) {
    if (!fs) return null;
    if (cache[filePath]) return cache[filePath];

    try {
      if (!fs.existsSync(filePath)) return null;
      var content = fs.readFileSync(filePath, "utf8");

      // Strip XML preamble and DOCTYPE
      content = content.replace(/<\?xml[^?]*\?>/gi, "");
      content = content.replace(/<!DOCTYPE[^>]*>/gi, "");

      // Extract viewBox
      var vbMatch = content.match(/viewBox="([^"]+)"/);
      if (!vbMatch) return null;
      var parts = vbMatch[1].trim().split(/\s+/);
      var vbW = parseFloat(parts[2]);
      var vbH = parseFloat(parts[3]);
      if (!vbW || !vbH || vbW <= 0 || vbH <= 0) return null;

      // Inline class-based fills/strokes before stripping <style>
      var styleBlocks = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (styleBlocks) {
        for (var si = 0; si < styleBlocks.length; si++) {
          var cssInner = styleBlocks[si].replace(/<\/?style[^>]*>/gi, "");
          // Parse class rules: .cls-1{fill:#009edb;stroke:#fff;...}
          var ruleRe = /\.([\w-]+)\s*\{([^}]*)\}/g;
          var rm;
          while ((rm = ruleRe.exec(cssInner)) !== null) {
            var className = rm[1];
            var props = rm[2];
            // Extract fill and stroke values
            var fillM = props.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/);
            var strokeM = props.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/);
            var opacityM = props.match(/(?:^|;)\s*opacity\s*:\s*([^;]+)/);
            // Build inline style additions
            var inlineAttrs = "";
            if (fillM) inlineAttrs += ' fill="' + fillM[1].trim() + '"';
            if (strokeM) inlineAttrs += ' stroke="' + strokeM[1].trim() + '"';
            if (opacityM) inlineAttrs += ' opacity="' + opacityM[1].trim() + '"';
            if (inlineAttrs) {
              // Add inline attrs to elements using this class
              var cRe = new RegExp('class="([^"]*\\b' + className + '\\b[^"]*)"', 'g');
              content = content.replace(cRe, function (m) { return m + inlineAttrs; });
            }
          }
        }
      }

      // Strip <style> blocks (they reference class names that may collide)
      content = content.replace(/<style[\s\S]*?<\/style>/gi, "");
      // Strip only the outer viewBox-bounds clipPath (simple rect matching
      // the viewBox dimensions) which causes Illustrator "Clipping will be
      // lost on roundtrip" warnings. Keep internal design clipPaths (circles,
      // paths) that are part of the flag artwork (e.g. Brasil globe).
      if (vbW && vbH) {
        var boundsClipIds = [];
        content.replace(/<clipPath[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/clipPath>/gi, function (match, clipId, inner) {
          var rectMatch = inner.match(/<rect[^>]*\/?\s*>/i);
          if (!rectMatch) return;
          var rStr = rectMatch[0];
          var rW = (rStr.match(/width="([^"]+)"/) || [])[1];
          var rH = (rStr.match(/height="([^"]+)"/) || [])[1];
          if (parseFloat(rW) === vbW && parseFloat(rH) === vbH) {
            boundsClipIds.push(clipId);
          }
        });
        for (var bci = 0; bci < boundsClipIds.length; bci++) {
          var cid = boundsClipIds[bci];
          content = content.replace(new RegExp('<clipPath[^>]*id="' + cid + '"[^>]*>[\\s\\S]*?</clipPath>', 'gi'), '');
          content = content.replace(new RegExp('\\s*clip-path="url\\(#' + cid + '\\)"', 'g'), '');
        }
      }
      // Strip empty <defs> blocks left after style/clipPath removal
      content = content.replace(/<defs>\s*<\/defs>/gi, "");
      // Remove class attributes (fills already inlined; prevents CSS collisions
      // with raw SVGs loaded elsewhere on the page, e.g. icons panel)
      content = content.replace(/\s*class="[^"]*"/g, "");

      // Scope IDs with unique prefix to prevent collisions
      var scope = "ic" + (idCounter++);
      content = content.replace(/\bid="([^"]+)"/g, 'id="' + scope + '_$1"');
      content = content.replace(/url\(#([^)]+)\)/g, 'url(#' + scope + '_$1)');
      content = content.replace(/xlink:href="#([^"]+)"/g, 'xlink:href="#' + scope + '_$1"');
      content = content.replace(/href="#([^"]+)"/g, 'href="#' + scope + '_$1"');

      // Extract inner content (between <svg...> and </svg>)
      var svgOpenMatch = content.match(/<svg[^>]*>/);
      if (!svgOpenMatch) return null;
      var svgOpenEnd = content.indexOf(svgOpenMatch[0]) + svgOpenMatch[0].length;
      var svgCloseIdx = content.lastIndexOf("</svg>");
      if (svgCloseIdx === -1) return null;

      var innerSvg = content.substring(svgOpenEnd, svgCloseIdx).trim();

      var result = { innerSvg: innerSvg, vbW: vbW, vbH: vbH };
      cache[filePath] = result;
      return result;
    } catch (e) {
      return null;
    }
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Resolve a flag SVG by ISO3 code (or country name).
   * Returns { innerSvg, vbW, vbH } or null.
   */
  function resolveFlag(ref, flagsDir) {
    if (!ref || !flagsDir) return null;
    ensureFlagIndex();

    var key = ref.trim();
    var flag = flagByCode[key.toUpperCase()] || flagByName[key.toLowerCase()];
    if (!flag) return null;

    return readAndProcess(flagsDir + "/" + flag.file);
  }

  /**
   * Resolve an OCHA icon SVG by key name.
   * Returns { innerSvg, vbW, vbH } or null.
   */
  function resolveIcon(ref, iconsDir) {
    if (!ref || !iconsDir) return null;

    var key = ref.trim();
    // Try exact match first, then with dashes for spaces
    var filePath = iconsDir + "/" + key + ".svg";
    var result = readAndProcess(filePath);
    if (result) return result;

    // Try replacing spaces with dashes
    var dashedKey = key.replace(/\s+/g, "-");
    if (dashedKey !== key) {
      filePath = iconsDir + "/" + dashedKey + ".svg";
      result = readAndProcess(filePath);
      if (result) return result;
    }

    return null;
  }

  /**
   * Batch-resolve icon/flag SVGs for an array of data items.
   * Each item must have an `iconRef` property (raw cell value).
   * Attaches `item._iconSvg = { innerSvg, vbW, vbH }` or null.
   */
  function resolveDataIcons(data, iconColType, flagsDir, iconsDir) {
    if (!data || !data.length) return;
    var resolveMap = {}; // cache by ref value within this batch

    for (var i = 0; i < data.length; i++) {
      var ref = data[i].iconRef;
      if (!ref) { data[i]._iconSvg = null; continue; }

      var refKey = ref.trim();
      if (resolveMap.hasOwnProperty(refKey)) {
        data[i]._iconSvg = resolveMap[refKey];
        continue;
      }

      var resolved = null;
      if (iconColType === "flags") {
        resolved = resolveFlag(refKey, flagsDir);
      } else if (iconColType === "icons") {
        resolved = resolveIcon(refKey, iconsDir);
      }

      resolveMap[refKey] = resolved;
      data[i]._iconSvg = resolved;
    }
  }

  /**
   * Build an SVG <g> element with the resolved icon content,
   * positioned and scaled to fit targetH (preserving aspect ratio).
   * Returns SVG string or "".
   */
  function buildIconGroup(resolved, targetH, x, y) {
    if (!resolved || !resolved.innerSvg) return "";
    var scale = targetH / resolved.vbH;
    var w = resolved.vbW * scale;
    return '<svg x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + w.toFixed(2) + '" height="' + targetH.toFixed(2) +
      '" viewBox="0 0 ' + resolved.vbW + ' ' + resolved.vbH +
      '" overflow="hidden">' + resolved.innerSvg + '</svg>';
  }

  /**
   * Get the rendered width of an icon at a given target height.
   */
  function getIconWidth(resolved, targetH) {
    if (!resolved || !resolved.vbH) return 0;
    return resolved.vbW * (targetH / resolved.vbH);
  }

  /**
   * Build an iconSvgMap for table rendering.
   * Keyed by cell value → resolved SVG.
   */
  function buildIconMap(rows, iconCol, iconColType, flagsDir, iconsDir) {
    var map = {};
    if (iconCol == null) return map;

    for (var r = 0; r < rows.length; r++) {
      var ref = String(rows[r][iconCol] || "").trim();
      if (!ref || map.hasOwnProperty(ref)) continue;

      if (iconColType === "flags") {
        map[ref] = resolveFlag(ref, flagsDir);
      } else if (iconColType === "icons") {
        map[ref] = resolveIcon(ref, iconsDir);
      }
    }
    return map;
  }

  /**
   * Get an HTML string with inline SVG for displaying a preview
   * in the data grid picker cells (small thumbnail).
   * Returns HTML string or "" if not found.
   */
  function getPreviewHtml(ref, type, flagsDir, iconsDir) {
    if (!ref) return "";
    var resolved = null;
    if (type === "flags") {
      resolved = resolveFlag(ref, flagsDir);
    } else if (type === "icons") {
      resolved = resolveIcon(ref, iconsDir);
    }
    if (!resolved || !resolved.innerSvg) return "";
    return '<svg viewBox="0 0 ' + resolved.vbW + ' ' + resolved.vbH +
      '" overflow="hidden" xmlns="http://www.w3.org/2000/svg">' + resolved.innerSvg + '</svg>';
  }

  /**
   * Clear the file cache (call if icon files change on disk).
   */
  function clearCache() {
    cache = {};
    idCounter = 0;
  }

  return {
    resolveFlag: resolveFlag,
    resolveIcon: resolveIcon,
    resolveDataIcons: resolveDataIcons,
    buildIconGroup: buildIconGroup,
    getIconWidth: getIconWidth,
    buildIconMap: buildIconMap,
    getPreviewHtml: getPreviewHtml,
    clearCache: clearCache
  };
})();
