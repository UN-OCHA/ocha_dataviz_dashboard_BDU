/**
 * ChartTypeIcons — inline SVG shapes for each chart type.
 *
 * Ported from the Illustrator plugin's .sidebar-btn chart-type icons.
 * Same shapes the plugin uses in its Chart Type panel, so the two tools
 * read visually identically when you pick a chart type.
 *
 * Each icon is a minimal 32×32 SVG. Paths/rects/lines use
 * stroke="currentColor" by default (CSS inherits the parent's text
 * color); filled elements are marked with class="fill-el" so the CSS
 * rule in styles.css can paint them with fill="currentColor" too.
 *
 * Call ChartTypeIcons.svg("hbar") to get the raw SVG string, or
 * ChartTypeIcons.inject(el, type) to populate an element.
 *
 * Cross-tool note: if either tool changes the shape of one of these
 * icons, the other should be updated to match so chart types stay
 * visually consistent across the two surfaces.
 */

/* global ChartTypeIcons:true */

var ChartTypeIcons = (function () {
  "use strict";

  var ICONS = {
    "hbar":
      '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect class="fill-el" x="4" y="5" width="20" height="4.5" rx="1.5"/>' +
        '<rect class="fill-el" x="4" y="13.5" width="13" height="4.5" rx="1.5"/>' +
        '<rect class="fill-el" x="4" y="22" width="24" height="4.5" rx="1.5"/>' +
      '</svg>',

    "vbar":
      '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect class="fill-el" x="4" y="12" width="5.5" height="16" rx="1.5"/>' +
        '<rect class="fill-el" x="13" y="4" width="5.5" height="24" rx="1.5"/>' +
        '<rect class="fill-el" x="22.5" y="16" width="5.5" height="12" rx="1.5"/>' +
      '</svg>',

    "stacked-bar":
      '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect class="fill-el" x="4" y="5" width="12" height="4.5" rx="1.5"/>' +
        '<rect class="fill-el" x="16" y="5" width="8" height="4.5" rx="1.5" opacity="0.4"/>' +
        '<rect class="fill-el" x="4" y="13.5" width="8" height="4.5" rx="1.5"/>' +
        '<rect class="fill-el" x="12" y="13.5" width="14" height="4.5" rx="1.5" opacity="0.4"/>' +
        '<rect class="fill-el" x="4" y="22" width="15" height="4.5" rx="1.5"/>' +
        '<rect class="fill-el" x="19" y="22" width="7" height="4.5" rx="1.5" opacity="0.4"/>' +
      '</svg>',

    "stacked-col":
      '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect class="fill-el" x="4" y="17" width="5.5" height="11" rx="1.5"/>' +
        '<rect class="fill-el" x="4" y="9" width="5.5" height="8" rx="1.5" opacity="0.4"/>' +
        '<rect class="fill-el" x="13" y="13" width="5.5" height="15" rx="1.5"/>' +
        '<rect class="fill-el" x="13" y="4" width="5.5" height="9" rx="1.5" opacity="0.4"/>' +
        '<rect class="fill-el" x="22.5" y="20" width="5.5" height="8" rx="1.5"/>' +
        '<rect class="fill-el" x="22.5" y="13" width="5.5" height="7" rx="1.5" opacity="0.4"/>' +
      '</svg>',

    "line":
      '<svg viewBox="0 0 32 32" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="4,24 11,13 19,18 28,6"/>' +
        '<circle cx="4" cy="24" r="2.2" class="fill-el"/>' +
        '<circle cx="11" cy="13" r="2.2" class="fill-el"/>' +
        '<circle cx="19" cy="18" r="2.2" class="fill-el"/>' +
        '<circle cx="28" cy="6" r="2.2" class="fill-el"/>' +
      '</svg>',

    "pie":
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="0">' +
        '<path d="M16,4 A12,12 0 1,1 9,26 L16,16 Z" class="fill-el"/>' +
        '<path d="M9,26 A12,12 0 0,1 10,6 L16,16 Z" class="fill-el" opacity="0.35"/>' +
        '<path d="M10,6 A12,12 0 0,1 16,4 L16,16 Z" class="fill-el" opacity="0.5"/>' +
      '</svg>',

    "donut":
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="0">' +
        '<path d="M16,4 A12,12 0 1,1 9,26 L12.5,21 A6,6 0 1,0 16,10 Z" class="fill-el"/>' +
        '<path d="M9,26 A12,12 0 0,1 10,6 L13,11 A6,6 0 0,0 12.5,21 Z" class="fill-el" opacity="0.35"/>' +
        '<path d="M10,6 A12,12 0 0,1 16,4 L16,10 A6,6 0 0,0 13,11 Z" class="fill-el" opacity="0.5"/>' +
      '</svg>',

    "bubble":
      '<svg viewBox="0 0 32 32" fill="none" stroke-width="1.8" stroke-linecap="round">' +
        '<circle cx="9" cy="17" r="7" class="fill-el"/>' +
        '<circle cx="21" cy="17" r="4.5" class="fill-el"/>' +
        '<circle cx="28" cy="17" r="2.5" class="fill-el"/>' +
      '</svg>',

    "icon":
      '<svg viewBox="0 0 32 32" stroke="none" stroke-width="0">' +
        '<circle cx="8" cy="8" r="3.2" class="fill-el"/>' +
        '<circle cx="16" cy="8" r="3.2" class="fill-el"/>' +
        '<circle cx="24" cy="8" r="3.2" class="fill-el"/>' +
        '<circle cx="8" cy="16" r="3.2" class="fill-el"/>' +
        '<circle cx="16" cy="16" r="3.2" class="fill-el"/>' +
        '<circle cx="24" cy="16" r="3.2" class="fill-el" opacity="0.4"/>' +
        '<circle cx="8" cy="24" r="3.2" class="fill-el" opacity="0.4"/>' +
        '<circle cx="16" cy="24" r="3.2" class="fill-el" opacity="0.4"/>' +
        '<circle cx="24" cy="24" r="3.2" class="fill-el" opacity="0.4"/>' +
      '</svg>',

    "table":
      '<svg viewBox="0 0 32 32" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="4" y="4" width="24" height="24" rx="3"/>' +
        '<line x1="4" y1="12" x2="28" y2="12"/>' +
        '<line x1="4" y1="20" x2="28" y2="20"/>' +
        '<line x1="14" y1="4" x2="14" y2="28"/>' +
      '</svg>',

    "sankey":
      '<svg viewBox="0 0 32 32" fill="none" stroke="none">' +
        '<rect class="fill-el" x="3" y="4" width="4" height="10" rx="1"/>' +
        '<rect class="fill-el" x="3" y="18" width="4" height="10" rx="1"/>' +
        '<rect class="fill-el" x="25" y="2" width="4" height="12" rx="1"/>' +
        '<rect class="fill-el" x="25" y="18" width="4" height="12" rx="1"/>' +
        '<path d="M7,7 C16,7 16,5 25,5" stroke="currentColor" stroke-width="3" opacity="0.3" fill="none"/>' +
        '<path d="M7,11 C16,11 16,22 25,22" stroke="currentColor" stroke-width="2" opacity="0.3" fill="none"/>' +
        '<path d="M7,21 C16,21 16,10 25,10" stroke="currentColor" stroke-width="3" opacity="0.3" fill="none"/>' +
        '<path d="M7,25 C16,25 16,27 25,27" stroke="currentColor" stroke-width="2" opacity="0.3" fill="none"/>' +
      '</svg>',

    "keyfigures":
      '<svg viewBox="0 0 32 32" fill="none" stroke="none">' +
        '<rect class="fill-el" x="3" y="4" width="12" height="3" rx="0.5"/>' +
        '<rect x="3" y="9" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect class="fill-el" x="18" y="4" width="12" height="3" rx="0.5"/>' +
        '<rect x="18" y="9" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect class="fill-el" x="3" y="17" width="12" height="3" rx="0.5"/>' +
        '<rect x="3" y="22" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect class="fill-el" x="18" y="17" width="12" height="3" rx="0.5"/>' +
        '<rect x="18" y="22" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<line x1="16" y1="2" x2="16" y2="13" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>' +
        '<line x1="16" y1="15" x2="16" y2="26" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>' +
      '</svg>',

    "timeline":
      '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="7" cy="16" r="2.5" class="fill-el"/>' +
        '<circle cx="16" cy="16" r="2.5" class="fill-el"/>' +
        '<circle cx="25" cy="16" r="2.5" class="fill-el"/>' +
        '<rect x="4" y="6" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect x="13" y="6" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect x="22" y="6" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>' +
        '<rect x="4" y="23" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>' +
        '<rect x="13" y="23" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>' +
        '<rect x="22" y="23" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>' +
      '</svg>'
  };

  /** Return raw SVG markup for a chart type, or an empty string. */
  function svg(type) {
    return ICONS[type] || "";
  }

  /** Set an element's innerHTML to the chart type icon. */
  function inject(el, type) {
    if (el) el.innerHTML = svg(type);
  }

  /**
   * Walk the document and populate every [data-chart-type-icon="…"]
   * element with the corresponding SVG. Cheap to call repeatedly.
   */
  function refreshAll(root) {
    root = root || document;
    var nodes = root.querySelectorAll("[data-chart-type-icon]");
    for (var i = 0; i < nodes.length; i++) {
      var type = nodes[i].getAttribute("data-chart-type-icon");
      if (type) nodes[i].innerHTML = svg(type);
    }
  }

  /** Set data-chart-type-icon + inject markup in one call. */
  function mark(el, type) {
    if (!el) return;
    el.setAttribute("data-chart-type-icon", type);
    el.innerHTML = svg(type);
  }

  return {
    svg: svg,
    inject: inject,
    mark: mark,
    refreshAll: refreshAll,
    TYPES: Object.keys(ICONS)
  };
})();
