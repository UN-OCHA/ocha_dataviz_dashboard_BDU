/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Data Table Renderer — v9
 *
 * Renders a styled SVG data table.
 * Alternating row colors, header styling, fixed column widths.
 * Works with simple label/value data (uses all headers + rows from DataStore).
 * v10: inline icon/flag support — icon inside first cell, left-aligned with 8px margin.
 */

/* global ChartRegistry, DataStore */

(function () {
  "use strict";

  var R = ChartRegistry;

  function render(title, data, config) {
    if (!data.length) return null;

    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    var marginLeft = 10;
    var marginRight = 10;

    // Header text block
    var header = R.renderHeader({
      x: marginLeft,
      startY: 6,
      title: title,
      subtitle: config.subtitle,
      comments: config.comments,
      rs: rs,
      style: st,
      vPad: vPad,
      maxWidth: svgW
    });

    var tableTop = header.height || (rs.marginTop + 4);

    // Read full data from DataStore for table rendering
    var headers = DataStore.headers || ["Label", "Value"];
    var rows = DataStore.rows || [];

    if (!rows.length) return null;

    var colCount = headers.length;
    var tableWidth = svgW - marginLeft - marginRight;
    var dataColWidth = tableWidth / colCount;

    // Icon detection (picker-based: icon inside first cell)
    var hasIcons = config.iconColType && config.iconColType !== "none" && config.iconSvgMap;
    var iconSvgMap = hasIcons ? config.iconSvgMap : {};
    var iconSelections = (hasIcons && config.iconSelections) ? config.iconSelections : [];

    // Row dimensions
    var fontSize = rs.labelSize;
    var isFlags = config.iconColType === "flags";
    var iconNorm = hasIcons ? (isFlags ? 1.5 : 1.0) : false;
    var headerFontSize = Math.max(8, fontSize + 1);
    var rowHeight = Math.round(Math.max(20, fontSize * 2.2) * vPad);
    var headerRowH = Math.round(Math.max(24, headerFontSize * 2.4) * vPad);
    var cellPadX = 8;

    // Icon size proportional to font
    var iconH = hasIcons ? Math.round(fontSize * 1.3) : 0;
    var iconMarginR = 8; // margin right of icon before label text

    // Pre-compute fixed text offset for first column (max icon width across all rows)
    var fixedIconOffset = 0;
    if (hasIcons) {
      for (var fi = 0; fi < rows.length; fi++) {
        var fiRef = iconSelections[fi];
        if (fiRef && iconSvgMap[fiRef]) {
          var fiDims = R.getIconDims(iconSvgMap[fiRef], iconH, iconNorm);
          if (fiDims.w > fixedIconOffset) fixedIconOffset = fiDims.w;
        }
      }
      if (fixedIconOffset > 0) fixedIconOffset += iconMarginR;
    }

    // Table height
    var tableH = headerRowH + rows.length * rowHeight;

    // Footer
    var footerStartY = tableTop + tableH;
    var footer = R.renderFooter({
      x: marginLeft,
      startY: footerStartY,
      footer: config.footer,
      rs: rs,
      style: st,
      vPad: vPad,
      maxWidth: svgW
    });

    var svgH = config.height || (footerStartY + footer.height + rs.marginBottom);

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    // Table group
    svg.push('  <g transform="translate(' + marginLeft + ',' + tableTop + ')">');

    // Header row background
    svg.push('    <rect x="0" y="0" width="' + tableWidth + '" height="' + headerRowH +
      '" fill="' + (config.colors[0] || '#009EDB') + '"/>');

    // Header text
    for (var c = 0; c < colCount; c++) {
      var hx = c * dataColWidth + cellPadX;
      svg.push('    <text x="' + hx + '" y="' + (headerRowH / 2 + headerFontSize * 0.35) +
        '" font-family="' + fonts.heading + '" font-size="' + headerFontSize +
        '" font-weight="bold" fill="#ffffff">' + R.escapeXml(headers[c]) + '</text>');
    }

    // Data rows
    for (var r = 0; r < rows.length; r++) {
      var ry = headerRowH + r * rowHeight;
      var isOdd = r % 2 === 1;

      // Alternating row bg
      if (isOdd) {
        svg.push('    <rect x="0" y="' + ry + '" width="' + tableWidth +
          '" height="' + rowHeight + '" fill="#f5f5f5"/>');
      }

      // Row border
      svg.push('    <line x1="0" y1="' + (ry + rowHeight) + '" x2="' + tableWidth +
        '" y2="' + (ry + rowHeight) + '" stroke="' + st.gridColor + '" stroke-width="0.5"/>');

      // Icon inside first cell (left-aligned with margin)
      if (hasIcons && iconSelections[r]) {
        var icoRef = iconSelections[r];
        var resolved = iconSvgMap[icoRef];
        if (resolved) {
          var dims = R.getIconDims(resolved, iconH, iconNorm);
          var icoX = cellPadX;
          var icoY = ry + (rowHeight - dims.h) / 2;
          var icoColor = !isFlags ? (config.rowIconColor || "#009EDB") : null;
          svg.push('    ' + R.buildIconGroup(resolved, iconH, icoX, icoY, icoColor, iconNorm));
        }
      }

      // Cell values
      for (var cc = 0; cc < colCount; cc++) {
        var val = rows[r][cc];
        if (val == null) val = "";

        var cellX = cc * dataColWidth + cellPadX;
        // First column: offset text by fixed amount if icons are present
        if (cc === 0 && fixedIconOffset > 0) {
          cellX += fixedIconOffset;
        }
        var cellY = ry + rowHeight / 2 + fontSize * 0.35;
        var availW = dataColWidth - cellPadX * 2 - (cc === 0 ? fixedIconOffset : 0);
        var cellText = R.truncate(String(val), Math.floor(availW / (fontSize * 0.55)));

        // Right-align numbers
        var isNum = (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)) && val !== ""));
        var textAnchor = isNum ? "end" : "start";
        var textX = isNum ? ((cc + 1) * dataColWidth - cellPadX) : cellX;

        svg.push('    <text x="' + textX + '" y="' + cellY.toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + fontSize +
          '" fill="' + st.valueColor + '" text-anchor="' + textAnchor + '">' +
          R.escapeXml(cellText) + '</text>');
      }
    }

    // Outer border
    svg.push('    <rect x="0" y="0" width="' + tableWidth + '" height="' + tableH +
      '" fill="none" stroke="' + st.gridColor + '" stroke-width="1"/>');

    // Column separators
    for (var cs = 1; cs < colCount; cs++) {
      var csx = cs * dataColWidth;
      svg.push('    <line x1="' + csx + '" y1="0" x2="' + csx + '" y2="' + tableH +
        '" stroke="' + st.gridColor + '" stroke-width="0.5"/>');
    }

    svg.push('  </g>');

    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("table", "Data Table", render);
})();
