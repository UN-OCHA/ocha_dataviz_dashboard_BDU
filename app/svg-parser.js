/**
 * SvgParser — turns a raw SVG string into the pre-processed shape the
 * chart engine expects: `{ innerSvg, vbW, vbH }`.
 *
 * Chart modules (chart-hbar, chart-stacked-bar, chart-keyfigures, etc.)
 * all call R.buildIconGroup / R.getIconDims with a resolved object, not
 * a raw svg string. This module produces that shape for the web tool,
 * matching the plugin's `svg-inline-utils.readAndProcess` implementation
 * behaviour-for-behaviour (minus the Node `fs` reading).
 *
 * Parsing steps (in order):
 *   1. Strip XML preamble + DOCTYPE.
 *   2. Extract viewBox → `vbW`, `vbH`.
 *   3. Inline class-based fill/stroke/opacity rules from <style> blocks,
 *      then strip the <style> blocks so class references can't collide
 *      with other icons on the same page.
 *   4. Strip any "outer-bounds" clipPath (a rect the size of the viewBox).
 *      Kept internal clipPaths intact (e.g. Brasil's globe clip).
 *   5. Strip empty <defs> left behind.
 *   6. Strip class="…" attrs (fills already inlined).
 *   7. Scope every id/url(#…)/xlink:href to a unique prefix so two icons
 *      on the same page can share an id without colliding.
 *   8. Extract the inner markup between the outer <svg…> and </svg>.
 *
 * Cross-tool note: this implementation mirrors the plugin's parser
 * byte-for-byte at the behaviour level — same inlining, same id scoping,
 * same clipPath stripping rules — so charts render identically whether
 * rendered by the Illustrator plugin or the online tool. Any change to
 * the parser is a cross-tool concern (see CLAUDE.md).
 */

/* global SvgParser:true */

var SvgParser = (function () {
  "use strict";

  var idCounter = 0;

  /**
   * Parse a raw SVG string into { innerSvg, vbW, vbH }, or null if the
   * string doesn't look like a valid SVG (missing viewBox, missing
   * <svg> tag, etc.).
   */
  function parse(rawSvg) {
    if (typeof rawSvg !== "string" || rawSvg.length === 0) return null;
    var content = rawSvg;

    // 1. Strip XML preamble + DOCTYPE
    content = content.replace(/<\?xml[^?]*\?>/gi, "");
    content = content.replace(/<!DOCTYPE[^>]*>/gi, "");

    // 2. Extract viewBox
    var vbMatch = content.match(/viewBox="([^"]+)"/);
    if (!vbMatch) return null;
    var parts = vbMatch[1].trim().split(/\s+/);
    var vbW = parseFloat(parts[2]);
    var vbH = parseFloat(parts[3]);
    if (!vbW || !vbH || vbW <= 0 || vbH <= 0) return null;

    // 3. Inline class-based fills/strokes before stripping <style>.
    // The plugin's human icons (and many flags) define shared attributes
    // in a CSS block that looks like:
    //     <style>.cls-1{fill:#009edb;} .cls-2{stroke:#fff;}</style>
    // We extract those rules and attach the attributes directly to any
    // element using the class, so the shapes keep their fill/stroke even
    // after we throw the <style> block away.
    var styleBlocks = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleBlocks) {
      for (var si = 0; si < styleBlocks.length; si++) {
        var cssInner = styleBlocks[si].replace(/<\/?style[^>]*>/gi, "");
        var ruleRe = /\.([\w-]+)\s*\{([^}]*)\}/g;
        var rm;
        while ((rm = ruleRe.exec(cssInner)) !== null) {
          var className = rm[1];
          var props = rm[2];
          var fillM = props.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/);
          var strokeM = props.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/);
          var opacityM = props.match(/(?:^|;)\s*opacity\s*:\s*([^;]+)/);
          var inlineAttrs = "";
          if (fillM)    inlineAttrs += ' fill="' + fillM[1].trim() + '"';
          if (strokeM)  inlineAttrs += ' stroke="' + strokeM[1].trim() + '"';
          if (opacityM) inlineAttrs += ' opacity="' + opacityM[1].trim() + '"';
          if (inlineAttrs) {
            var cRe = new RegExp('class="([^"]*\\b' + className + '\\b[^"]*)"', 'g');
            content = content.replace(cRe, function (m) { return m + inlineAttrs; });
          }
        }
      }
    }
    content = content.replace(/<style[\s\S]*?<\/style>/gi, "");

    // 4. Strip outer-bounds clipPath only (an outer rect matching the
    //    viewBox). Keeps internal clipPaths intact so artwork like the
    //    Brazil flag's globe clip still renders correctly.
    if (vbW && vbH) {
      var boundsClipIds = [];
      content.replace(
        /<clipPath[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/clipPath>/gi,
        function (match, clipId, inner) {
          var rectMatch = inner.match(/<rect[^>]*\/?\s*>/i);
          if (!rectMatch) return match;
          var rStr = rectMatch[0];
          var rW = (rStr.match(/width="([^"]+)"/)  || [])[1];
          var rH = (rStr.match(/height="([^"]+)"/) || [])[1];
          if (parseFloat(rW) === vbW && parseFloat(rH) === vbH) {
            boundsClipIds.push(clipId);
          }
          return match;
        }
      );
      for (var bci = 0; bci < boundsClipIds.length; bci++) {
        var cid = boundsClipIds[bci];
        content = content.replace(
          new RegExp('<clipPath[^>]*id="' + cid + '"[^>]*>[\\s\\S]*?</clipPath>', 'gi'),
          ""
        );
        content = content.replace(
          new RegExp('\\s*clip-path="url\\(#' + cid + '\\)"', 'g'),
          ""
        );
      }
    }

    // 5. Strip empty <defs> blocks left after style/clipPath removal
    content = content.replace(/<defs>\s*<\/defs>/gi, "");

    // 6. Remove class attributes (fills already inlined)
    content = content.replace(/\s*class="[^"]*"/g, "");

    // 7. Scope IDs with unique prefix so two icons on the same page can't
    //    collide on shared ids (e.g. "a", "clip0", "gradient1").
    var scope = "ic" + (idCounter++);
    content = content.replace(/\bid="([^"]+)"/g, 'id="' + scope + '_$1"');
    content = content.replace(/url\(#([^)]+)\)/g, 'url(#' + scope + '_$1)');
    content = content.replace(/xlink:href="#([^"]+)"/g, 'xlink:href="#' + scope + '_$1"');
    content = content.replace(/href="#([^"]+)"/g, 'href="#' + scope + '_$1"');

    // 8. Extract inner content (between the outer <svg…> and </svg>)
    var svgOpenMatch = content.match(/<svg[^>]*>/);
    if (!svgOpenMatch) return null;
    var svgOpenEnd = content.indexOf(svgOpenMatch[0]) + svgOpenMatch[0].length;
    var svgCloseIdx = content.lastIndexOf("</svg>");
    if (svgCloseIdx === -1) return null;

    var innerSvg = content.substring(svgOpenEnd, svgCloseIdx).trim();

    return { innerSvg: innerSvg, vbW: vbW, vbH: vbH };
  }

  return { parse: parse };
})();
