/**
 * UiIcons — use OCHA humanitarian icons for the editor chrome.
 *
 * All UI chrome icons (sidebar toggle, topbar buttons, card arrows,
 * FAB, duplicate, close buttons, etc.) come from the same humanitarian
 * icons GitHub repo the chart engine uses:
 *
 *   https://raw.githubusercontent.com/UN-OCHA/humanitarian-icons-2026-BDU/main
 *
 * The mapping between semantic UI role and humanitarian icon key lives
 * in MAP below — one place to find and edit every icon used in chrome.
 *
 * Why this module exists (instead of calling IconLoader directly):
 *   - Icons must render SYNCHRONOUSLY. IconLoader is async (first paint
 *     requires a fetch). UiIcons.warmup() prefetches every UI icon up
 *     front so by the time the editor calls svg(name) every icon is
 *     already cached in memory.
 *   - Icons must inherit CSS color. The humanitarian SVGs hard-code
 *     fills to OCHA blue (#009EDB). Before returning the markup we
 *     substitute the brand hex with `currentColor` so icons pick up
 *     whatever color the parent button defines. That's how a single
 *     icon can look tertiary-grey in the sidebar and active-blue in
 *     a hovered topbar button.
 *   - Graceful fallback. If warmup fails (offline / 404) every call
 *     returns a unicode fallback glyph so the UI keeps working.
 */

/* global UiIcons:true, IconLoader, SvgParser */

var UiIcons = (function () {
  "use strict";

  // ── Semantic role → humanitarian icon key + unicode fallback ──
  //
  // Keys on the left are what the rest of the app calls. Values are
  // { key: <humanitarian-icon-key>, fallback: <unicode-glyph> }. The
  // fallback ensures the UI still renders if the icon fetch fails.
  var MAP = {
    // Navigation / shell
    "menu":          { key: "Menu",          fallback: "\u2630" }, // ☰
    "close":         { key: "Exit-cancel",   fallback: "\u00d7" }, // ×
    "remove":        { key: "Remove",        fallback: "\u2715" }, // ✕

    // Card arrows (reorder + duplicate)
    "arrow-up":      { key: "Expand-up",     fallback: "\u25b4" }, // ▴
    "arrow-down":    { key: "Expand-down",   fallback: "\u25be" }, // ▾
    "arrow-left":    { key: "Expand-left",   fallback: "\u25c2" }, // ◂
    "arrow-right":   { key: "Expand-right",  fallback: "\u25b8" }, // ▸
    "copy":          { key: "Copy",          fallback: "\u2398" }, // ⎘

    // Primary actions
    "add":           { key: "Add",           fallback: "+"      },
    "download":      { key: "Download",      fallback: "\u2193" }, // ↓
    "share":         { key: "Share",         fallback: "\u21aa" }, // ↪
    "print":         { key: "Print",         fallback: "\u2399" }, // ⎙
    "link":          { key: "Link",          fallback: "\ud83d\udd17" }, // 🔗
    "refresh":       { key: "Return",        fallback: "\u21bb" }, // ↻

    // Layout + settings
    "layout-vertical":   { key: "Menu",      fallback: "\u25a4" }, // ▤
    "layout-horizontal": { key: "Apps",      fallback: "\u25a5" }, // ▥
    "apps":              { key: "Apps",      fallback: "\u25a6" }, // ▦
    "settings":          { key: "Settings",  fallback: "\u2699" }  // ⚙
  };

  var ROLES = Object.keys(MAP);

  // ── Cache of prepared "currentColor" SVG markup, per role ──
  // The raw SVG comes from IconLoader/SvgParser; we substitute the OCHA
  // blue reference with currentColor and memoize once per role.
  var preparedMem = {};

  // Transform a parsed humanitarian icon into UI-chrome SVG markup.
  // Produces a full <svg> element with the viewBox from the source,
  // class "ui-icon-svg", and fill="currentColor" at the outer level so
  // any nested element without its own fill inherits the parent's text
  // color. Also substitutes any hard-coded OCHA blue with currentColor
  // so fills that were painted with the brand hex follow the theme.
  function parsedToUiMarkup(parsed) {
    if (!parsed || !parsed.innerSvg) return null;
    var inner = parsed.innerSvg.replace(/#009[eE][dD][bB]/g, "currentColor");
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" class="ui-icon-svg" ' +
      'viewBox="0 0 ' + parsed.vbW + ' ' + parsed.vbH + '" ' +
      'fill="currentColor" aria-hidden="true" focusable="false">' +
      inner + "</svg>"
    );
  }

  // Look up the current prepared markup for a role. Returns null if
  // the underlying icon isn't yet cached — callers should fall back to
  // the role's unicode fallback in that case.
  function getPrepared(role) {
    var entry = MAP[role];
    if (!entry) return null;
    if (preparedMem[role]) return preparedMem[role];
    if (typeof IconLoader === "undefined") return null;
    var raw = IconLoader.getCachedSvg(entry.key);
    if (!raw) return null;
    // Parse once and cache
    var parsed = (typeof SvgParser !== "undefined") ? SvgParser.parse(raw) : null;
    var markup = parsedToUiMarkup(parsed);
    if (markup) preparedMem[role] = markup;
    return markup;
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Return SVG markup for a UI icon, ready to set as innerHTML of any
   * element. Falls back to the role's unicode character wrapped in a
   * plain <span> if the icon isn't cached yet — so the editor still
   * renders even before warmup resolves (or if it fails entirely).
   *
   * The returned markup has class="ui-icon-svg" on the outer svg,
   * fill="currentColor", and inherits `color` from the parent element.
   */
  function svg(role) {
    var prepared = getPrepared(role);
    if (prepared) return prepared;
    var entry = MAP[role];
    var glyph = entry ? entry.fallback : "";
    return '<span class="ui-icon-fallback" aria-hidden="true">' + glyph + "</span>";
  }

  /**
   * Replace an element's innerHTML with the icon markup. Convenience
   * wrapper around svg() for DOM-walking callers.
   */
  function inject(el, role) {
    if (el) el.innerHTML = svg(role);
  }

  /**
   * Prefetch every UI icon so chrome renders synchronously. Returns a
   * promise that resolves when all icons are cached (or fail). Call
   * once at app bootstrap, then call refresh() on any static chrome
   * afterwards so the fallback glyphs get swapped for real icons.
   */
  function warmup() {
    if (typeof IconLoader === "undefined") return Promise.resolve();
    var keys = ROLES.map(function (r) { return MAP[r].key; });
    // Deduplicate — some roles map to the same humanitarian key
    var unique = {};
    keys.forEach(function (k) { unique[k] = true; });
    var deduped = Object.keys(unique);
    return IconLoader.prefetch(deduped).then(function () {
      // Drop any stale prepared markup; the next svg() call rebuilds.
      preparedMem = {};
    });
  }

  /**
   * Refresh every element on the page that was previously rendered
   * with a UiIcons placeholder. Walks `[data-ui-icon]` elements and
   * re-injects the latest markup — call this after warmup() resolves
   * so any elements painted with unicode fallbacks get upgraded to
   * the real humanitarian SVG.
   */
  function refreshAll(root) {
    root = root || document;
    var nodes = root.querySelectorAll("[data-ui-icon]");
    for (var i = 0; i < nodes.length; i++) {
      var role = nodes[i].getAttribute("data-ui-icon");
      if (role) nodes[i].innerHTML = svg(role);
    }
  }

  /**
   * Mark an element as hosting a UI icon. Sets the data-ui-icon
   * attribute (so refreshAll() can find it) and injects the icon
   * markup immediately.
   */
  function mark(el, role) {
    if (!el) return;
    el.setAttribute("data-ui-icon", role);
    el.innerHTML = svg(role);
  }

  return {
    svg: svg,
    inject: inject,
    mark: mark,
    warmup: warmup,
    refreshAll: refreshAll,
    MAP: MAP
  };
})();
