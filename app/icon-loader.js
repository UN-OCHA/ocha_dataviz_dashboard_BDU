/**
 * IconLoader — fetches humanitarian icon SVGs from GitHub and caches them.
 *
 * The plugin and the online tool both source their icons from a single
 * GitHub repo so the catalog stays in sync automatically:
 *
 *   https://raw.githubusercontent.com/UN-OCHA/humanitarian-icons-2026-BDU/main
 *
 * This file is the browser-friendly mirror of the plugin's
 * client/svg-inline-utils.js + icons-panel.js loader. It uses `fetch()`
 * instead of Node `fs`, and persists downloaded SVGs to `localStorage` so
 * they survive across sessions.
 *
 * Caching layers (fastest → slowest):
 *   1. In-memory Map              — zero latency during a session
 *   2. localStorage (per icon)    — survives reload, ~4 KB per icon
 *   3. GitHub HTTP (fetch)        — network fallback, happens once per key
 *
 * Metadata (`metadata.json`) is fetched fresh on every session so the user
 * always sees the latest icon catalog as soon as new icons are added to
 * the GitHub repo. Individual SVGs are cached aggressively because they
 * change rarely and are the expensive part.
 *
 * ── Cross-tool note ────────────────────────────────────────────────
 * The GitHub URL, the metadata.json shape, and the icon key naming are
 * shared with the Illustrator plugin. Any change to those constants is a
 * cross-tool concern (see CLAUDE.md).
 */

/* global IconLoader:true, SvgParser */

var IconLoader = (function () {
  "use strict";

  var GITHUB_RAW = "https://raw.githubusercontent.com/UN-OCHA/humanitarian-icons-2026-BDU/main";
  var METADATA_URL = GITHUB_RAW + "/metadata.json";
  var SVG_URL = function (key) {
    return GITHUB_RAW + "/svg/" + encodeURIComponent(key) + ".svg";
  };
  var LS_PREFIX = "ocha-icon:";        // per-icon localStorage key
  var LS_METADATA_KEY = "ocha-icon-metadata";   // cached metadata fallback

  // ── In-memory caches (session lifetime) ────────────────
  var svgMem = {};                  // { key → raw svg string }
  var parsedMem = {};               // { key → { innerSvg, vbW, vbH } }
  var metaPromise = null;           // { ok: true, icons, families } | reject

  // ── localStorage helpers ───────────────────────────────
  function lsGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (e) { return false; }    // quota exceeded / private mode
  }
  function lsRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ── Metadata ──────────────────────────────────────────
  /**
   * Fetch the icon catalog from GitHub. Returns a promise that resolves to
   * { icons, families, lastUpdated }. Uses the most recent localStorage
   * copy as a fallback when the network request fails (offline editing).
   */
  function loadMetadata() {
    if (metaPromise) return metaPromise;

    metaPromise = fetch(METADATA_URL, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (raw) {
        var parsed = parseMetadata(raw);
        // Persist as a fallback for offline use
        try { lsSet(LS_METADATA_KEY, JSON.stringify(raw)); } catch (e) { /* ignore */ }
        return parsed;
      })
      .catch(function (err) {
        // Network failed → try the last-known-good copy from localStorage
        var cached = lsGet(LS_METADATA_KEY);
        if (cached) {
          try { return parseMetadata(JSON.parse(cached)); }
          catch (e) { /* fall through */ }
        }
        throw err;
      });
    return metaPromise;
  }

  function parseMetadata(raw) {
    var icons = raw && raw.icons ? raw.icons : {};
    var familiesList = (raw && raw.families) || [];
    // Build a flat, sortable array + a families map for the picker UI
    var flat = Object.keys(icons).map(function (key) {
      var ic = icons[key];
      return {
        key: key,                        // "Abduction-kidnapping"
        name: ic.name || key,            // "Abduction kidnapping"
        family: ic.family || "Other",
        dateAdded: ic.date_added || null
      };
    });
    // Sort alphabetically by display name — predictable browsing order
    flat.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    // Group by family for the picker's family filter
    var byFamily = {};
    flat.forEach(function (it) {
      if (!byFamily[it.family]) byFamily[it.family] = [];
      byFamily[it.family].push(it);
    });
    return {
      icons: flat,
      byFamily: byFamily,
      families: familiesList.length ? familiesList : Object.keys(byFamily),
      lastUpdated: raw && raw.meta && raw.meta.last_updated || null
    };
  }

  // ── Individual icon SVG ───────────────────────────────
  /**
   * Fetch an icon's SVG markup. Returns a promise that resolves to the
   * raw SVG string. Caches aggressively:
   *   - in-memory for the current session
   *   - localStorage across sessions
   */
  function loadIconSvg(key) {
    if (!key) return Promise.reject(new Error("Missing icon key"));
    // 1. In-memory
    if (svgMem[key]) return Promise.resolve(svgMem[key]);
    // 2. localStorage
    var ls = lsGet(LS_PREFIX + key);
    if (ls) {
      svgMem[key] = ls;
      return Promise.resolve(ls);
    }
    // 3. Network
    return fetch(SVG_URL(key), { cache: "force-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + key);
        return res.text();
      })
      .then(function (svg) {
        svgMem[key] = svg;
        lsSet(LS_PREFIX + key, svg);    // best-effort, ignores quota errors
        return svg;
      });
  }

  /**
   * Non-async synchronous lookup — returns the RAW SVG string if it's
   * already cached, otherwise null. Used by the picker UI to render a
   * preview thumbnail.
   */
  function getCachedSvg(key) {
    if (!key) return null;
    if (svgMem[key]) return svgMem[key];
    var ls = lsGet(LS_PREFIX + key);
    if (ls) { svgMem[key] = ls; return ls; }
    return null;
  }

  /**
   * Synchronous lookup that returns the PARSED object the chart engine
   * consumes: `{ innerSvg, vbW, vbH }`, or null if not yet loaded. Memoized
   * per key so the parse happens at most once.
   */
  function getParsedSvg(key) {
    if (!key) return null;
    if (parsedMem[key]) return parsedMem[key];
    var raw = getCachedSvg(key);
    if (!raw) return null;
    var parsed = SvgParser.parse(raw);
    if (parsed) parsedMem[key] = parsed;
    return parsed;
  }

  /**
   * Warm the cache for a list of icon keys. Returns a promise that
   * resolves when every key has been loaded (even if some failed).
   * The renderer calls this before painting a chart so that by the time
   * it reaches the paint step, every referenced icon is already in memory.
   */
  function prefetch(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return Promise.resolve();
    return Promise.all(keys.map(function (k) {
      return loadIconSvg(k).catch(function () { return null; });
    }));
  }

  // ── Refresh / clear ────────────────────────────────────
  /**
   * Drop all in-memory + localStorage caches and re-fetch metadata.
   * Use this when the user clicks a "Refresh icons" button and wants to
   * pull the latest catalog + re-download any SVGs they later use.
   */
  function refresh() {
    svgMem = {};
    parsedMem = {};
    metaPromise = null;
    // Clear per-icon SVG cache entries
    try {
      var rm = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) rm.push(k);
      }
      rm.forEach(lsRemove);
      lsRemove(LS_METADATA_KEY);
    } catch (e) { /* ignore */ }
    return loadMetadata();
  }

  /**
   * Best-effort estimate of how much space the icon cache is using in
   * localStorage (bytes). Useful for a diagnostic readout in the UI.
   */
  function cacheBytes() {
    var total = 0;
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && (k.indexOf(LS_PREFIX) === 0 || k === LS_METADATA_KEY)) {
          var v = lsGet(k);
          if (v) total += v.length + k.length;
        }
      }
    } catch (e) { /* ignore */ }
    return total;
  }

  return {
    loadMetadata: loadMetadata,
    loadIconSvg: loadIconSvg,
    getCachedSvg: getCachedSvg,
    getParsedSvg: getParsedSvg,
    prefetch: prefetch,
    refresh: refresh,
    cacheBytes: cacheBytes,
    GITHUB_RAW: GITHUB_RAW
  };
})();
