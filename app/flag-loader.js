/**
 * FlagLoader — serves country flag SVGs from the static ./assets/flags/
 * directory. Unlike humanitarian icons (which are fetched from GitHub so
 * the catalog updates as new icons are added), the flag catalog is stable,
 * so the SVGs ship with the online tool as static assets.
 *
 * Relies on app/flags-data.js (global `FlagsData`) for the country → file
 * lookup table — same shape the Illustrator plugin uses:
 *
 *     [ { name: "Afghanistan", code: "AFG", file: "Afghanistan (AFG).svg" }, … ]
 *
 * ── Cross-tool note ────────────────────────────────────────────────
 * The FlagsData shape and the flag filenames are shared with the plugin.
 * If either drifts, both tools need updating (see CLAUDE.md).
 */

/* global FlagLoader:true, FlagsData, SvgParser */

var FlagLoader = (function () {
  "use strict";

  var ASSETS_DIR = "assets/flags/";   // relative to index.html

  // In-memory caches of fetched SVG text and its parsed chart-engine form,
  // both keyed by uppercase ISO3 code.
  var svgMem = {};
  var parsedMem = {};

  // Indexes (lazy-built on first lookup)
  var byCode = null;
  var byName = null;

  function ensureIndex() {
    if (byCode) return;
    byCode = {};
    byName = {};
    if (typeof FlagsData === "undefined") return;
    for (var i = 0; i < FlagsData.length; i++) {
      var f = FlagsData[i];
      if (f.code) byCode[f.code.toUpperCase()] = f;
      if (f.name) byName[f.name.toLowerCase()] = f;
    }
  }

  /** Resolve a user-facing string (ISO3 code or country name) to a flag record. */
  function resolve(input) {
    if (!input) return null;
    ensureIndex();
    var s = String(input).trim();
    if (s.length === 3 && byCode[s.toUpperCase()]) return byCode[s.toUpperCase()];
    if (byName[s.toLowerCase()]) return byName[s.toLowerCase()];
    return null;
  }

  /**
   * List every flag in alphabetical order, for populating the picker UI.
   * Returns an array of { key, name, code } where `key` is the ISO3 code
   * (used as the stable identifier stored in the dashboard JSON).
   */
  function listAll() {
    ensureIndex();
    if (typeof FlagsData === "undefined") return [];
    return FlagsData.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).map(function (f) {
      return { key: f.code, name: f.name, code: f.code };
    });
  }

  /** URL of a flag SVG given a code or name. */
  function urlFor(input) {
    var rec = resolve(input);
    if (!rec) return null;
    return ASSETS_DIR + encodeURIComponent(rec.file);
  }

  /**
   * Fetch a flag SVG's raw markup. Caches per-code in memory (no
   * localStorage needed — the assets are already local). Returns a
   * promise that resolves to the SVG string.
   */
  function loadFlagSvg(input) {
    var rec = resolve(input);
    if (!rec) return Promise.reject(new Error("Unknown flag: " + input));
    var code = rec.code.toUpperCase();
    if (svgMem[code]) return Promise.resolve(svgMem[code]);
    return fetch(urlFor(rec.code))
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for flag " + code);
        return res.text();
      })
      .then(function (svg) {
        svgMem[code] = svg;
        return svg;
      });
  }

  /** Synchronous lookup for picker thumbnails — returns raw SVG or null. */
  function getCachedSvg(input) {
    var rec = resolve(input);
    if (!rec) return null;
    return svgMem[rec.code.toUpperCase()] || null;
  }

  /**
   * Synchronous lookup that returns the PARSED object the chart engine
   * consumes: `{ innerSvg, vbW, vbH }`, or null if not yet loaded.
   */
  function getParsedSvg(input) {
    var rec = resolve(input);
    if (!rec) return null;
    var code = rec.code.toUpperCase();
    if (parsedMem[code]) return parsedMem[code];
    var raw = svgMem[code];
    if (!raw) return null;
    var parsed = SvgParser.parse(raw);
    if (parsed) parsedMem[code] = parsed;
    return parsed;
  }

  /** Warm the cache for a list of codes. Returns a settling promise. */
  function prefetch(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return Promise.resolve();
    return Promise.all(codes.map(function (c) {
      return loadFlagSvg(c).catch(function () { return null; });
    }));
  }

  return {
    resolve: resolve,
    listAll: listAll,
    urlFor: urlFor,
    loadFlagSvg: loadFlagSvg,
    getCachedSvg: getCachedSvg,
    getParsedSvg: getParsedSvg,
    prefetch: prefetch
  };
})();
