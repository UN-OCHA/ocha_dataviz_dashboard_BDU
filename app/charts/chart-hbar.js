/**
 * Horizontal Bar Chart Renderer — v9
 *
 * v9 changes: Roboto fonts, shared header/footer, vertical padding, style colors.
 * v10: inline icon/flag column support.
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;

  function render(title, data, config) {
    if (!data.length) return null;

    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    // Bar thickness: user override → breakpoint default
    var barThickness = config.barThickness || rs.barThickness;
    var barGap = rs.barGap;

    var marginRight = rs.marginRight;

    // Icon column: check if any data items have resolved icons
    var hasIcons = config.iconColType && config.iconColType !== "none";
    var isFlags = config.iconColType === "flags";
    // Area normalization ratio: 1.5 for flags (3:2), 1.0 for icons (square)
    var iconNorm = hasIcons ? (isFlags ? 1.5 : 1.0) : false;
    var iconH = isFlags
      ? Math.round(rs.labelSize * 1.1)
      : Math.round(rs.labelSize * 1.3);
    var iconGap = 6;
    var iconMaxW = hasIcons ? R.maxIconWidth(data, iconH, iconNorm) : 0;

    // Left margin: estimate from longest label + icon + gap space
    var maxLabelLen = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i].label.length > maxLabelLen) maxLabelLen = data[i].label.length;
    }
    var marginLeft = Math.min(svgW * 0.35, Math.max(rs.marginLeft, maxLabelLen * rs.labelSize * 0.55));
    if (iconMaxW > 0) {
      marginLeft += iconMaxW + iconGap * 2; // space for icon between label and bar
    }

    // Header block
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

    var plotTop = header.height || rs.marginTop;

    // Data area
    var plotWidth = svgW - marginLeft - marginRight;
    var plotHeight = data.length * (barThickness + barGap) - barGap;

    // Footer
    var footerStartY = plotTop + plotHeight;
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

    // If user set a fixed height, recalculate bar thickness
    if (config.height) {
      var availH = svgH - plotTop - footer.height - rs.marginBottom;
      barThickness = Math.max(6, Math.floor((availH + barGap) / data.length) - barGap);
      plotHeight = data.length * (barThickness + barGap) - barGap;
      iconH = isFlags
        ? Math.round(rs.labelSize * 1.1)
        : Math.round(rs.labelSize * 1.3);
      iconMaxW = hasIcons ? R.maxIconWidth(data, iconH, iconNorm) : 0;
    }

    // Data scale
    var maxVal = 0;
    for (var m = 0; m < data.length; m++) {
      if (data[m].value > maxVal) maxVal = data[m].value;
    }
    if (maxVal === 0) maxVal = 1;

    // ── FORK PATCH (online tool): reserve room at the right of the plot
    // for the longest value label so the bar+label never escape the SVG.
    // Reserve = max(textwidth-based reserve, 18% of plot width) — the
    // percent floor catches edge cases where the text estimate is too low.
    var lblMode0 = config.barLabelMode || "outside";
    var labelReserve = 0;
    if (lblMode0 === "outside") {
      var maxValChars = 0;
      for (var lv = 0; lv < data.length; lv++) {
        var s = R.formatNumber(data[lv].value, config.numFmt);
        if (String(s).length > maxValChars) maxValChars = String(s).length;
      }
      var textBased = 6 + Math.ceil(maxValChars * rs.valueSize * 0.66) + 10;
      var percentBased = Math.ceil(plotWidth * 0.18);
      labelReserve = Math.max(textBased, percentBased);
    }
    var effectivePlotWidth = Math.max(20, plotWidth - labelReserve);
    var xScale = R.linearScale(0, maxVal, 0, effectivePlotWidth);

    var barColor = config.colors[0];

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    // Header text
    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    for (var j = 0; j < data.length; j++) {
      var y = j * (barThickness + barGap);
      // Hard cap so even a calculation slip can't push the bar past the
      // effective plot width (which already excludes label reserve).
      var barW = Math.max(1, Math.min(effectivePlotWidth, xScale(data[j].value)));

      // Label (right-aligned, left of icon)
      var labelX = iconMaxW > 0 ? -(iconMaxW + iconGap * 2) : -8;
      var label = R.truncate(data[j].label, rs.maxLabelChars);
      svg.push('    <text x="' + labelX + '" y="' + (y + barThickness / 2 + rs.labelSize * 0.35).toFixed(1) +
        '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
        '" fill="' + st.labelColor + '" text-anchor="end">' + R.escapeXml(label) + '</text>');

      // Icon (right of label, between label and bar)
      if (iconMaxW > 0 && data[j]._iconSvg) {
        var dims = R.getIconDims(data[j]._iconSvg, iconH, iconNorm);
        var icoX = -(iconMaxW + iconGap) + (iconMaxW - dims.w) / 2; // center in allocated space
        var icoY = y + (barThickness - dims.h) / 2;
        var icoColor = !isFlags ? (config.rowIconColor || "#009EDB") : null;
        svg.push('    ' + R.buildIconGroup(data[j]._iconSvg, iconH, icoX, icoY, icoColor, iconNorm));
      }

      // Bar
      svg.push('    <rect x="0" y="' + y + '" width="' + barW.toFixed(1) +
        '" height="' + barThickness + '" fill="' + barColor + '"/>');

      // Value label
      var lblMode = config.barLabelMode || "outside";
      if (lblMode === "outside") {
        svg.push('    <text x="' + (barW + 6).toFixed(1) + '" y="' + (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + st.valueColor + '">' + R.formatNumber(data[j].value, config.numFmt) + '</text>');
      } else if (lblMode === "inside") {
        var insX = Math.max(barW - 6, 4);
        svg.push('    <text x="' + insX.toFixed(1) + '" y="' + (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + (config.labelColor || "#ffffff") + '" text-anchor="end">' + R.formatNumber(data[j].value, config.numFmt) + '</text>');
      }
    }

    svg.push('  </g>');

    // Footer text
    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("hbar", "Horizontal Bar", render);
})();
