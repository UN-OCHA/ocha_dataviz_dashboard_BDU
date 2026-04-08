/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * ChartRegistry — Chart type registry, shared SVG utilities, styles & fonts.
 *
 * v9: Added STYLES, FONTS, shared text block rendering, vertical padding support.
 *
 * Responsive system: breakpoint-based presets (not continuous scaling).
 *   - FIXED: fonts, strokes, margins, bar thickness (step at breakpoints)
 *   - SCALES: data area, bar lengths, point positions (proportional to space)
 *   - ADAPTS: tick count, label rotation, legend position (breakpoint rules)
 */

var ChartRegistry = (function () {
  "use strict";

  var registry = {};
  var renderers = {};

  // ── OCHA Color Palette ────────────────────────────────

  registry.OCHA_COLORS = [
    "#009EDB", // OCHA Blue (primary)
    "#F2645A", // Red
    "#1EBFB3", // Teal
    "#FFB92A", // Amber
    "#7B68EE", // Slate Blue
    "#E86E5A", // Salmon
    "#78B7D0", // Light Blue
    "#AAC85C", // Yellow-Green
    "#C77CFF", // Purple
    "#FF8C69"  // Pink
  ];

  // ── UN Blue Colour Ramp + Grey (official OCHA palette) ──
  registry.ICON_PALETTE = [
    "#009EDB", // UN Blue — Primary
    "#E6E6E6", // OCHA Grey
    "#0074B7", // Blue 3
    "#E3EDF6", // Blue 7 (lightest)
    "#004987", // Blue 2
    "#C5DFEF", // Blue 6
    "#002E6E", // Blue 1 (darkest)
    "#64BDEA"  // Blue 5
  ];

  // ── Per-style Swatch Palettes (for color pickers) ─────

  registry.OCHA_SWATCHES = [
    { hex: "#002E6E", name: "Navy" },
    { hex: "#004987", name: "Dark Blue" },
    { hex: "#0074B7", name: "Blue" },
    { hex: "#009EDB", name: "UN Blue" },
    { hex: "#64BDEA", name: "Light Blue" },
    { hex: "#C5DFEF", name: "Pale Blue" },
    { hex: "#E3EDF6", name: "Ice Blue" },
    { hex: "#E6E6E6", name: "Grey" },
    { hex: "#FFFFFF", name: "White" },
    { hex: "#000000", name: "Black" }
  ];

  registry.HNRP_SWATCHES = [
    { hex: "#002E6E", name: "Navy" },
    { hex: "#004987", name: "Dark Blue" },
    { hex: "#0074B7", name: "Blue" },
    { hex: "#009EDB", name: "UN Blue" },
    { hex: "#70200C", name: "Dark Brown" },
    { hex: "#90371C", name: "Brown" },
    { hex: "#C15025", name: "Rust" },
    { hex: "#F58220", name: "Orange" },
    { hex: "#F9A870", name: "Light Orange" },
    { hex: "#FEDCBD", name: "Pale Orange" },
    { hex: "#E6E6E6", name: "Grey" },
    { hex: "#FFFFFF", name: "White" },
    { hex: "#000000", name: "Black" }
  ];

  registry.FLASH_SWATCHES = [
    { hex: "#520000", name: "Dark Maroon" },
    { hex: "#780B20", name: "Maroon" },
    { hex: "#A71F36", name: "Crimson" },
    { hex: "#ED1847", name: "Red" },
    { hex: "#F3859B", name: "Pink" },
    { hex: "#F9C0C5", name: "Light Pink" },
    { hex: "#F7DFDF", name: "Pale Pink" },
    { hex: "#E6E6E6", name: "Grey" },
    { hex: "#FFFFFF", name: "White" },
    { hex: "#000000", name: "Black" }
  ];

  registry.GHO_SWATCHES = [
    { hex: "#815017", name: "Dark Gold" },
    { hex: "#B16D03", name: "Gold" },
    { hex: "#CF9220", name: "Amber" },
    { hex: "#FFC800", name: "Yellow" },
    { hex: "#FFDE2F", name: "Light Yellow" },
    { hex: "#F8E66B", name: "Pale Yellow" },
    { hex: "#FAF0BB", name: "Cream" },
    { hex: "#4D4D4D", name: "Dark Grey" },
    { hex: "#FFFFFF", name: "White" },
    { hex: "#000000", name: "Black" }
  ];

  /** Get swatch palette for a given style name. */
  registry.getSwatches = function (styleName) {
    var map = { ocha: registry.OCHA_SWATCHES, hnrp: registry.HNRP_SWATCHES,
                flash: registry.FLASH_SWATCHES, gho: registry.GHO_SWATCHES };
    return map[styleName] || registry.OCHA_SWATCHES;
  };

  // ── Per-style Icon/Stacked Palettes ──────────────────

  registry.HNRP_ICON_PALETTE = [
    "#F58220", "#E6E6E6", "#C15025", "#FEDCBD",
    "#90371C", "#F9A870", "#70200C", "#FFEAD5"
  ];

  registry.FLASH_ICON_PALETTE = [
    "#ED1847", "#E6E6E6", "#A71F36", "#F9C0C5",
    "#780B20", "#F3859B", "#520000", "#F7DFDF"
  ];

  registry.GHO_ICON_PALETTE = [
    "#FFC800", "#4D4D4D", "#CF9220", "#FAF0BB",
    "#B16D03", "#F8E66B", "#815017", "#FFDE2F"
  ];

  /** Get icon/stacked palette for a given style name. */
  registry.getIconPalette = function (styleName) {
    var map = { ocha: registry.ICON_PALETTE, hnrp: registry.HNRP_ICON_PALETTE,
                flash: registry.FLASH_ICON_PALETTE, gho: registry.GHO_ICON_PALETTE };
    return map[styleName] || registry.ICON_PALETTE;
  };

  // ── Sequential Color Ramps (for choropleth maps) ──────

  registry.SEQUENTIAL_RAMPS = {
    ocha:  ["#E3EDF6", "#C5DFEF", "#64BDEA", "#009EDB", "#0074B7", "#004987", "#002E6E"],
    hnrp:  ["#FEDCBD", "#F9A870", "#F58220", "#C15025", "#90371C", "#70200C", "#4A1508"],
    flash: ["#F7DFDF", "#F9C0C5", "#F3859B", "#ED1847", "#A71F36", "#780B20", "#520000"],
    gho:   ["#FAF0BB", "#F8E66B", "#FFDE2F", "#FFC800", "#CF9220", "#B16D03", "#815017"]
  };

  registry.getSequentialRamp = function (styleName) {
    return registry.SEQUENTIAL_RAMPS[styleName] || registry.SEQUENTIAL_RAMPS.ocha;
  };

  // ── Font Families ──────────────────────────────────────

  registry.FONTS = {
    heading: "Roboto, Arial, Helvetica, sans-serif",
    label: "'Roboto Condensed', Arial, Helvetica, sans-serif",
    value: "'Roboto Condensed', Arial, Helvetica, sans-serif"
  };

  // ── Styles ─────────────────────────────────────────────

  // Shared base: fonts, text colors, grid — identical across all styles
  var STYLE_BASE = {
    fontHeading: "Roboto, Arial, Helvetica, sans-serif",
    fontLabel: "'Roboto Condensed', Arial, Helvetica, sans-serif",
    fontValue: "'Roboto Condensed', Arial, Helvetica, sans-serif",
    titleColor: "#1A1A1A",
    subtitleColor: "#555555",
    labelColor: "#555555",
    valueColor: "#333333",
    commentColor: "#777777",
    footerColor: "#999999",
    gridColor: "#e0e0e0",
    baselineColor: "#333333"
  };

  function makeStyle(name, colors) {
    var s = { name: name, colors: colors };
    for (var k in STYLE_BASE) { if (STYLE_BASE.hasOwnProperty(k)) s[k] = STYLE_BASE[k]; }
    return s;
  }

  registry.STYLES = {
    ocha: makeStyle("OCHA", [
      "#009EDB", "#F2645A", "#1EBFB3", "#FFB92A", "#7B68EE",
      "#E86E5A", "#78B7D0", "#AAC85C", "#C77CFF", "#FF8C69"
    ]),
    hnrp: makeStyle("HNRP", [
      "#F58220", "#009EDB", "#C15025", "#0074B7",
      "#90371C", "#64BDEA", "#F9A870", "#E6E6E6"
    ]),
    flash: makeStyle("Flash Appeal", [
      "#ED1847", "#A71F36", "#780B20", "#F3859B",
      "#F9C0C5", "#520000", "#F7DFDF", "#E6E6E6"
    ]),
    gho: makeStyle("GHO", [
      "#FFC800", "#CF9220", "#B16D03", "#FFDE2F",
      "#F8E66B", "#815017", "#4D4D4D", "#FAF0BB"
    ])
  };

  /**
   * Get the active style object. Falls back to OCHA.
   */
  registry.getStyle = function (styleName) {
    return registry.STYLES[styleName] || registry.STYLES.ocha;
  };

  // ── Registry ──────────────────────────────────────────

  registry.register = function (id, name, renderFn) {
    renderers[id] = { name: name, render: renderFn };
  };

  registry.render = function (type, title, data, config) {
    if (!renderers[type]) return null;
    config = config || {};

    // Resolve style colors (user override > style palette)
    var styleName = config.style || "ocha";
    var style = registry.getStyle(styleName);
    // Icon charts → style-specific icon palette (blue ramp); stacked/sankey → distinct main colors
    var useIconPalette = (type === "stacked-bar" || type === "stacked-col" || type === "icon" || type === "sankey");
    var defaultPalette = useIconPalette ? registry.getIconPalette(styleName) : style.colors;
    config.colors = config.colors || defaultPalette;

    // Clone style to avoid mutating the shared original
    var styleCopy = {};
    for (var sk in style) {
      if (style.hasOwnProperty(sk)) styleCopy[sk] = style[sk];
    }

    // Apply label color override (chart labels + values only — not title/subtitle/footer)
    if (config.labelColor) {
      styleCopy.labelColor = config.labelColor;
      styleCopy.valueColor = config.labelColor;
    }

    config.style = styleCopy;
    config.fonts = registry.FONTS;

    // Number format options for formatNumber
    config.numFmt = {
      format: config.numberFormat || "auto",
      prefix: config.valuePrefix || "",
      suffix: config.valueSuffix || ""
    };

    return renderers[type].render(title, data, config);
  };

  registry.getTypes = function () {
    var types = [];
    for (var id in renderers) {
      if (renderers.hasOwnProperty(id)) {
        types.push({ id: id, name: renderers[id].name });
      }
    }
    return types;
  };

  // ── Shared SVG Utilities ──────────────────────────────

  registry.escapeXml = function (str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  // Returns true if a hex color is light (needs dark text on top)
  registry.isLightColor = function (hex) {
    hex = hex.replace("#", "");
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    // Relative luminance (perceptual)
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6;
  };

  // Returns appropriate text color for overlay on a given background
  registry.contrastText = function (bgHex) {
    return registry.isLightColor(bgHex) ? "#333333" : "#ffffff";
  };

  registry.truncate = function (str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1) + "\u2026";
  };

  registry.svgOpen = function (w, h) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '">';
  };

  registry.svgBg = function (w, h) {
    return '  <rect width="' + w + '" height="' + h + '" fill="none"/>';
  };

  /**
   * wrapSVG — Assembles the common SVG scaffold used by all chart renderers.
   * @param {number} svgW  - SVG width
   * @param {number} svgH  - SVG height
   * @param {object} header - object with .svg array from renderHeader
   * @param {object} footer - object with .svg array from renderFooter
   * @param {string[]} bodyLines - chart-specific SVG lines (between header and footer)
   * @returns {string} Complete SVG string
   */
  registry.wrapSVG = function (svgW, svgH, header, footer, bodyLines) {
    var svg = [];
    svg.push(registry.svgOpen(svgW, svgH));
    svg.push(registry.svgBg(svgW, svgH));
    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);
    for (var bi = 0; bi < bodyLines.length; bi++) svg.push(bodyLines[bi]);
    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);
    svg.push('</svg>');
    return svg.join("\n");
  };

  // ── Shared Text Block Rendering ────────────────────────
  //
  // Renders title, subtitle, comments, footer as SVG text elements.
  // Returns { svg: string[], headerHeight: number, footerHeight: number }

  /**
   * Render the text header block (title + subtitle + comments).
   * Returns { svg: [], height: total height consumed }
   *
   * @param {object} opts
   *   - x: left x position
   *   - startY: starting y position
   *   - title: string
   *   - subtitle: string
   *   - comments: string (may be multi-line)
   *   - rs: responsive settings
   *   - style: style object
   *   - vPad: vertical padding multiplier (1 + verticalPadding/200)
   */
  /**
   * Word-wrap text into lines that fit within maxWidth pixels.
   * @param {string} text
   * @param {number} fontSize
   * @param {number} maxWidth  available width in px
   * @param {number} charFactor  avg char width as fraction of fontSize (0.55 normal, 0.6 bold)
   * @returns {string[]} array of lines
   */
  registry.wrapText = function (text, fontSize, maxWidth, charFactor) {
    if (!text) return [];
    var avgCharW = fontSize * (charFactor || 0.55);
    var maxChars = Math.floor(maxWidth / avgCharW);
    if (maxChars < 4) maxChars = 4;

    var words = text.split(/\s+/);
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (test.length > maxChars && cur) {
        lines.push(cur);
        cur = words[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  registry.renderHeader = function (opts) {
    var svg = [];
    var x = opts.x || 10;
    var y = opts.startY || 0;
    var rs = opts.rs;
    var st = opts.style;
    var vPad = opts.vPad || 1;
    var lineGap = Math.round(4 * vPad);
    var maxW = (opts.maxWidth || 380) - x;

    // Title (bold — use 0.6 charFactor)
    if (opts.title) {
      var titleLines = registry.wrapText(opts.title, rs.titleSize, maxW, 0.6);
      for (var ti = 0; ti < titleLines.length; ti++) {
        y += Math.round(rs.titleSize * 1.2);
        svg.push('  <text x="' + x + '" y="' + y +
          '" font-family="' + st.fontHeading + '" font-size="' + rs.titleSize +
          '" font-weight="bold" fill="' + st.titleColor + '">' +
          registry.escapeXml(titleLines[ti]) + '</text>');
      }
      y += lineGap;
    }

    // Subtitle
    if (opts.subtitle) {
      var subSize = Math.max(8, rs.titleSize - 2);
      var subLines = registry.wrapText(opts.subtitle, subSize, maxW, 0.55);
      for (var si = 0; si < subLines.length; si++) {
        y += Math.round(subSize * 1.2);
        svg.push('  <text x="' + x + '" y="' + y +
          '" font-family="' + st.fontHeading + '" font-size="' + subSize +
          '" fill="' + st.subtitleColor + '">' +
          registry.escapeXml(subLines[si]) + '</text>');
      }
      y += lineGap;
    }

    // Comments (up to 3 explicit lines, each wrapped)
    if (opts.comments) {
      var commentSize = rs.commentSize;
      var rawLines = opts.comments.split("\n").slice(0, 3);
      for (var i = 0; i < rawLines.length; i++) {
        var trimmed = rawLines[i].trim();
        if (!trimmed) continue;
        var wrapped = registry.wrapText(trimmed, commentSize, maxW, 0.55);
        for (var w = 0; w < wrapped.length; w++) {
          y += Math.round(commentSize * 1.3);
          svg.push('  <text x="' + x + '" y="' + y +
            '" font-family="' + st.fontLabel + '" font-size="' + commentSize +
            '" fill="' + st.commentColor + '">' +
            registry.escapeXml(wrapped[w]) + '</text>');
        }
      }
      y += lineGap;
    }

    // Add padding after header block — ensures gap before chart area
    // (extra room so value labels above tall bars don't overlap subtitle)
    if (opts.title || opts.subtitle || opts.comments) {
      y += Math.round(32 * vPad);
    }

    return { svg: svg, height: y };
  };

  /**
   * Render footer text below the chart.
   * Returns { svg: [], height: total height consumed }
   */
  registry.renderFooter = function (opts) {
    var svg = [];
    if (!opts.footer) return { svg: svg, height: 0 };

    var footerSize = opts.rs.footerSize;
    var st = opts.style;
    var vPad = opts.vPad || 1;
    var x = opts.x || 10;
    var maxW = (opts.maxWidth || 380) - x;
    var y = opts.startY + Math.round(14 * vPad);

    var footerLines = registry.wrapText(opts.footer, footerSize, maxW, 0.55);
    for (var i = 0; i < footerLines.length; i++) {
      y += Math.round(footerSize * 1.2);
      svg.push('  <text x="' + x + '" y="' + y +
        '" font-family="' + st.fontLabel + '" font-size="' + footerSize +
        '" fill="' + st.footerColor + '">' +
        registry.escapeXml(footerLines[i]) + '</text>');
    }

    y += Math.round(10 * vPad);
    return { svg: svg, height: y - opts.startY };
  };

  // ── Scale Functions ─────────────────────────────────

  registry.linearScale = function (domainMin, domainMax, rangeMin, rangeMax) {
    var domainSpan = domainMax - domainMin;
    if (domainSpan === 0) domainSpan = 1;
    var rangeSpan = rangeMax - rangeMin;
    return function (value) {
      return rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
    };
  };

  registry.bandScale = function (count, rangeMin, rangeMax, padding) {
    padding = padding != null ? padding : 0.2;
    var totalRange = rangeMax - rangeMin;
    if (count <= 0) return { bandwidth: totalRange, step: totalRange, position: function () { return rangeMin; } };

    var step = totalRange / count;
    var bandwidth = step * (1 - padding);
    var offset = (step - bandwidth) / 2;

    return {
      bandwidth: bandwidth,
      step: step,
      position: function (index) {
        return rangeMin + index * step + offset;
      }
    };
  };

  // ── Math Utilities ────────────────────────────────────

  registry.polarToCartesian = function (cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  registry.describeArc = function (cx, cy, r, startAngle, endAngle) {
    var start = registry.polarToCartesian(cx, cy, r, endAngle);
    var end = registry.polarToCartesian(cx, cy, r, startAngle);
    var largeArc = (endAngle - startAngle > 180) ? 1 : 0;

    return [
      "M", start.x.toFixed(2), start.y.toFixed(2),
      "A", r, r, 0, largeArc, 0, end.x.toFixed(2), end.y.toFixed(2)
    ].join(" ");
  };

  registry.describeDonutArc = function (cx, cy, outerR, innerR, startAngle, endAngle) {
    var outerStart = registry.polarToCartesian(cx, cy, outerR, endAngle);
    var outerEnd = registry.polarToCartesian(cx, cy, outerR, startAngle);
    var innerStart = registry.polarToCartesian(cx, cy, innerR, startAngle);
    var innerEnd = registry.polarToCartesian(cx, cy, innerR, endAngle);
    var largeArc = (endAngle - startAngle > 180) ? 1 : 0;

    return [
      "M", outerStart.x.toFixed(2), outerStart.y.toFixed(2),
      "A", outerR, outerR, 0, largeArc, 0, outerEnd.x.toFixed(2), outerEnd.y.toFixed(2),
      "L", innerStart.x.toFixed(2), innerStart.y.toFixed(2),
      "A", innerR, innerR, 0, largeArc, 1, innerEnd.x.toFixed(2), innerEnd.y.toFixed(2),
      "Z"
    ].join(" ");
  };

  registry.niceScale = function (dataMin, dataMax, maxTicks) {
    maxTicks = maxTicks || 6;
    if (dataMin === dataMax) {
      dataMax = dataMin + 1;
    }

    var range = dataMax - dataMin;
    var roughStep = range / (maxTicks - 1);

    var mag = Math.pow(10, Math.floor(Math.log(roughStep) / Math.LN10));
    var normalized = roughStep / mag;
    var niceStep;

    if (normalized <= 1) niceStep = 1 * mag;
    else if (normalized <= 2) niceStep = 2 * mag;
    else if (normalized <= 5) niceStep = 5 * mag;
    else niceStep = 10 * mag;

    var niceMin = Math.floor(dataMin / niceStep) * niceStep;
    var niceMax = Math.ceil(dataMax / niceStep) * niceStep;

    var ticks = [];
    for (var v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
      ticks.push(Math.round(v * 1000) / 1000);
    }

    return {
      min: niceMin,
      max: niceMax,
      step: niceStep,
      ticks: ticks
    };
  };

  /**
   * Format a number for display on charts.
   * @param {number} n - The value
   * @param {object} [opts] - { format, prefix, suffix }
   *   format: "auto" (default) | "full" | "K" | "M" | "B"
   *   prefix: string prepended (e.g. "US$ ")
   *   suffix: string appended (e.g. "%")
   */
  registry.formatNumber = function (n, opts) {
    opts = opts || {};
    var fmt = opts.format || "auto";
    var prefix = opts.prefix || "";
    var suffix = opts.suffix || "";

    var str;
    if (n === 0) {
      str = "0";
    } else if (fmt === "full") {
      // No abbreviation — add thousand separators
      str = addCommas(n);
    } else if (fmt === "K") {
      str = (n / 1000).toFixed(1) + "k";
    } else if (fmt === "M") {
      str = (n / 1000000).toFixed(1) + "M";
    } else if (fmt === "B") {
      str = (n / 1000000000).toFixed(1) + "B";
    } else {
      // "auto" — pick abbreviation based on magnitude
      if (Math.abs(n) >= 1000000000) str = (n / 1000000000).toFixed(1) + "B";
      else if (Math.abs(n) >= 1000000) str = (n / 1000000).toFixed(1) + "M";
      else if (Math.abs(n) >= 1000) str = (n / 1000).toFixed(1) + "k";
      else if (n % 1 !== 0) str = n.toFixed(1);
      else str = String(n);
    }

    // Strip trailing ".0" for cleaner display
    str = str.replace(/\.0([kMB%]?)$/, "$1");

    return prefix + str + suffix;
  };

  /** Add thousand separators (e.g. 1234567 → "1,234,567") */
  function addCommas(n) {
    var s = n % 1 !== 0 ? n.toFixed(1) : String(n);
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  // ── Responsive System ────────────────────────────────

  var BREAKPOINT_PRESETS = {
    xs: {
      titleSize: 10, labelSize: 8, valueSize: 7, legendSize: 8, commentSize: 7, footerSize: 7,
      marginTop: 24, marginBottom: 12, marginLeft: 30, marginRight: 10,
      barThickness: 14, barGap: 5,
      legendItemH: 14, legendSwatchW: 8, legendGap: 4,
      maxTicks: 3, labelRotateThreshold: 4, maxLabelChars: 10,
      legendPosition: "bottom", defaultPlotHeight: 140
    },
    sm: {
      titleSize: 11, labelSize: 9, valueSize: 8, legendSize: 9, commentSize: 8, footerSize: 8,
      marginTop: 30, marginBottom: 15, marginLeft: 40, marginRight: 15,
      barThickness: 18, barGap: 7,
      legendItemH: 16, legendSwatchW: 10, legendGap: 5,
      maxTicks: 5, labelRotateThreshold: 5, maxLabelChars: 14,
      legendPosition: "bottom", defaultPlotHeight: 180
    },
    md: {
      titleSize: 14, labelSize: 11, valueSize: 10, legendSize: 10, commentSize: 10, footerSize: 10,
      marginTop: 40, marginBottom: 20, marginLeft: 50, marginRight: 20,
      barThickness: 24, barGap: 10,
      legendItemH: 20, legendSwatchW: 12, legendGap: 6,
      maxTicks: 8, labelRotateThreshold: 7, maxLabelChars: 20,
      legendPosition: "right", defaultPlotHeight: 240
    },
    lg: {
      titleSize: 16, labelSize: 12, valueSize: 11, legendSize: 11, commentSize: 11, footerSize: 11,
      marginTop: 45, marginBottom: 25, marginLeft: 55, marginRight: 25,
      barThickness: 28, barGap: 12,
      legendItemH: 22, legendSwatchW: 14, legendGap: 7,
      maxTicks: 12, labelRotateThreshold: 10, maxLabelChars: 30,
      legendPosition: "right", defaultPlotHeight: 300
    }
  };

  // Breakpoint thresholds — single source of truth
  registry.BP_THRESHOLDS = { xs: 0, sm: 200, md: 350, lg: 550 };

  registry.getBreakpoint = function (width) {
    if (width < 200)      return "xs";
    if (width < 350)      return "sm";
    if (width < 550)      return "md";
    return "lg";
  };

  registry.responsive = function (width) {
    var bp = registry.getBreakpoint(width);

    var preset = BREAKPOINT_PRESETS[bp];
    var rs = {};
    for (var key in preset) {
      if (preset.hasOwnProperty(key)) {
        rs[key] = preset[key];
      }
    }

    // Always fixed
    rs.strokeWidth = 2;
    rs.gridStrokeWidth = 1;
    rs.dotRadius = 4;

    rs.breakpoint = bp;
    rs.width = width;

    return rs;
  };

  /**
   * Apply vertical padding multiplier to responsive settings.
   * Returns a new object with padded margins and gaps.
   */
  registry.applyVerticalPadding = function (rs, verticalPadding) {
    if (!verticalPadding) return rs;
    var vPad = 1 + (verticalPadding / 200);
    var padded = {};
    for (var key in rs) {
      if (rs.hasOwnProperty(key)) padded[key] = rs[key];
    }
    padded.marginTop = Math.round(rs.marginTop * vPad);
    padded.marginBottom = Math.round(rs.marginBottom * vPad);
    padded.barGap = Math.round(rs.barGap * vPad);
    padded.defaultPlotHeight = Math.round(rs.defaultPlotHeight * vPad);
    padded.legendItemH = Math.round(rs.legendItemH * vPad);
    return padded;
  };

  /**
   * Apply independent text and label scale multipliers.
   * textScale  (50–200%): title, subtitle, comments, footer
   * labelScale (50–200%): axis labels, data values, legend
   */
  registry.applyScales = function (rs, textScale, labelScale) {
    var ts = textScale || 100;
    var ls = labelScale || 100;
    if (ts === 100 && ls === 100) return rs;
    var scaled = {};
    for (var key in rs) {
      if (rs.hasOwnProperty(key)) scaled[key] = rs[key];
    }
    if (ts !== 100) {
      var tF = ts / 100;
      scaled.titleSize   = Math.max(6, Math.round(rs.titleSize * tF));
      scaled.commentSize = Math.max(5, Math.round(rs.commentSize * tF));
      scaled.footerSize  = Math.max(5, Math.round(rs.footerSize * tF));
    }
    if (ls !== 100) {
      var lF = ls / 100;
      scaled.labelSize  = Math.max(5, Math.round(rs.labelSize * lF));
      scaled.valueSize  = Math.max(5, Math.round(rs.valueSize * lF));
      scaled.legendSize = Math.max(5, Math.round(rs.legendSize * lF));
    }
    return scaled;
  };

  // ── Chart Init Helper ──────────────────────────────────
  // Eliminates the 7-line boilerplate repeated in every chart renderer.

  registry.initRender = function (config) {
    var svgW = config.width || 500;
    var rs = registry.responsive(svgW);
    var vPad = 1 + ((config.verticalPadding || 0) / 200);
    rs = registry.applyVerticalPadding(rs, config.verticalPadding);
    rs = registry.applyScales(rs, config.textScale, config.labelScale);
    var st = config.style || registry.getStyle("ocha");
    var fonts = config.fonts || registry.FONTS;
    return { svgW: svgW, rs: rs, vPad: vPad, st: st, fonts: fonts };
  };

  // ── Shared Pie/Donut Utilities ────────────────────────

  var PIE_MAX_SLICES = 7;

  registry.mergeSlices = function (data) {
    if (data.length <= PIE_MAX_SLICES) return data.slice();
    var sorted = data.slice().sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    var top = sorted.slice(0, PIE_MAX_SLICES - 1);
    var rest = sorted.slice(PIE_MAX_SLICES - 1);
    var othersVal = 0;
    for (var i = 0; i < rest.length; i++) othersVal += Math.abs(rest[i].value);
    top.push({ label: "Others", value: othersVal });
    return top;
  };

  registry.resolveOverlaps = function (labels, minGap) {
    var left = [], right = [];
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].isRight) right.push(labels[i]);
      else left.push(labels[i]);
    }
    function fixSide(arr) {
      arr.sort(function (a, b) { return a.y - b.y; });
      for (var j = 1; j < arr.length; j++) {
        var overlap = (arr[j - 1].y + minGap) - arr[j].y;
        if (overlap > 0) arr[j].y += overlap;
      }
    }
    fixSide(left);
    fixSide(right);
  };

  registry.buildPieLabelText = function (label, pct, absVal, contentMode, rs, numFmt) {
    switch (contentMode) {
      case "pct": return pct + "%";
      case "value": return registry.formatNumber(absVal, numFmt);
      case "label-value": return registry.truncate(label, rs.maxLabelChars) + " (" + registry.formatNumber(absVal, numFmt) + ")";
      case "label-pct":
      default: return registry.truncate(label, rs.maxLabelChars) + " (" + pct + "%)";
    }
  };

  // ── Inline Icon Helpers ────────────────────────────────

  /**
   * Compute rendered dimensions for an icon/flag.
   *
   * When normalize=false (default, for humanitarian icons):
   *   Simple height-based scaling: all icons get the same height.
   *
   * When normalize=true (for flags):
   *   Area-normalized scaling: all flags get roughly the same visual area,
   *   regardless of aspect ratio. A square flag (Switzerland 1:1) becomes
   *   slightly taller/wider while a wide flag (Sudan ~2:1) becomes slightly
   *   shorter. The reference area is that of a standard 3:2 flag at targetH.
   *
   * Returns { w, h, scale }.
   */
  registry.getIconDims = function (resolved, targetH, normalize) {
    if (!resolved || !resolved.vbH || !resolved.vbW) return { w: 0, h: 0, scale: 0 };

    var scale;
    if (normalize) {
      // normalize can be:
      //   true  → 1.5 (3:2 flag reference, backward compat)
      //   number → custom aspect ratio (e.g. 1.0 for square icons)
      var refRatio = (typeof normalize === "number") ? normalize : 1.5;
      var refArea = targetH * (targetH * refRatio);
      var srcArea = resolved.vbW * resolved.vbH;
      scale = Math.sqrt(refArea / srcArea);
    } else {
      scale = targetH / resolved.vbH;
    }

    return {
      w: resolved.vbW * scale,
      h: resolved.vbH * scale,
      scale: scale
    };
  };

  /**
   * Build an SVG <g> with resolved icon content.
   * Uses getIconDims for scaling (normalize=true for area-based flag sizing).
   * Optional fillColor applies a fill override (for humanitarian icons).
   * Returns SVG string or "".
   */
  registry.buildIconGroup = function (resolved, targetH, x, y, fillColor, normalize) {
    if (!resolved || !resolved.innerSvg) return "";
    var dims = registry.getIconDims(resolved, targetH, normalize);
    var content = resolved.innerSvg;
    var colorAttr = '';
    if (fillColor) {
      content = content.replace(/fill:\s*#[0-9a-fA-F]{3,8}\b/g, 'fill:' + fillColor);
      content = content.replace(/fill="[^"]*"/g, 'fill="' + fillColor + '"');
      colorAttr = ' fill="' + fillColor + '"';
    }
    // Wrap in nested <svg> with overflow hidden so flags whose clipPaths were
    // stripped still clip correctly to their viewBox bounds
    return '<svg x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + dims.w.toFixed(2) + '" height="' + dims.h.toFixed(2) +
      '" viewBox="0 0 ' + resolved.vbW + ' ' + resolved.vbH +
      '" overflow="hidden"' + colorAttr + '>' + content + '</svg>';
  };

  /**
   * Get the rendered width of an icon at a given target height.
   */
  registry.getIconWidth = function (resolved, targetH, normalize) {
    return registry.getIconDims(resolved, targetH, normalize).w;
  };

  /**
   * Get the rendered height of an icon at a given target height.
   * Only differs from targetH when normalize=true.
   */
  registry.getIconHeight = function (resolved, targetH, normalize) {
    return registry.getIconDims(resolved, targetH, normalize).h;
  };

  /**
   * Build a <path> for a rectangle with selective corner rounding.
   * @param {number} x - left edge
   * @param {number} y - top edge
   * @param {number} w - width
   * @param {number} h - height
   * @param {number} r - corner radius
   * @param {boolean} tl - round top-left
   * @param {boolean} tr - round top-right
   * @param {boolean} br - round bottom-right
   * @param {boolean} bl - round bottom-left
   * @returns {string} SVG path d attribute
   */
  registry.roundedRectPath = function (x, y, w, h, r, tl, tr, br, bl) {
    r = Math.min(r, w / 2, h / 2);
    var rtl = tl ? r : 0, rtr = tr ? r : 0, rbr = br ? r : 0, rbl = bl ? r : 0;
    return 'M' + (x + rtl).toFixed(1) + ',' + y.toFixed(1) +
      ' L' + (x + w - rtr).toFixed(1) + ',' + y.toFixed(1) +
      (rtr ? ' A' + rtr + ',' + rtr + ' 0 0 1 ' + (x + w).toFixed(1) + ',' + (y + rtr).toFixed(1) : '') +
      ' L' + (x + w).toFixed(1) + ',' + (y + h - rbr).toFixed(1) +
      (rbr ? ' A' + rbr + ',' + rbr + ' 0 0 1 ' + (x + w - rbr).toFixed(1) + ',' + (y + h).toFixed(1) : '') +
      ' L' + (x + rbl).toFixed(1) + ',' + (y + h).toFixed(1) +
      (rbl ? ' A' + rbl + ',' + rbl + ' 0 0 1 ' + x.toFixed(1) + ',' + (y + h - rbl).toFixed(1) : '') +
      ' L' + x.toFixed(1) + ',' + (y + rtl).toFixed(1) +
      (rtl ? ' A' + rtl + ',' + rtl + ' 0 0 1 ' + (x + rtl).toFixed(1) + ',' + y.toFixed(1) : '') +
      ' Z';
  };

  /**
   * Find the maximum icon width across data items at a given target height.
   * Returns 0 if no icons are present.
   */
  registry.maxIconWidth = function (data, targetH, normalize) {
    var maxW = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i]._iconSvg) {
        var w = registry.getIconWidth(data[i]._iconSvg, targetH, normalize);
        if (w > maxW) maxW = w;
      }
    }
    return maxW;
  };

  /**
   * Find the maximum icon height across data items at a given target height.
   * Only meaningful when normalize=true (heights vary per icon).
   */
  registry.maxIconHeight = function (data, targetH, normalize) {
    var maxH = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i]._iconSvg) {
        var h = registry.getIconHeight(data[i]._iconSvg, targetH, normalize);
        if (h > maxH) maxH = h;
      }
    }
    return maxH;
  };

  return registry;
})();
