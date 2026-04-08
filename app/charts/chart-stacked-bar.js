/**
 * Stacked Horizontal Bar Chart Renderer — v9
 *
 * Expects multi-value data: [{label, values: [v1, v2, ...]}]
 * Each segment is a different color from the palette.
 * Labels on left, segments stacked horizontally.
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

    var barThickness = config.barThickness || rs.barThickness;
    var barGap = rs.barGap;
    var marginRight = rs.marginRight;

    // Icon column
    var hasIcons = config.iconColType && config.iconColType !== "none";
    var isFlags = config.iconColType === "flags";
    var iconNorm = hasIcons ? (isFlags ? 1.5 : 1.0) : false;
    var iconH = isFlags
      ? Math.round(rs.labelSize * 1.1)
      : Math.round(rs.labelSize * 1.3);
    var iconGap = 6;
    var iconMaxW = hasIcons ? R.maxIconWidth(data, iconH, iconNorm) : 0;

    // Left margin from longest label + icon + gap space
    var maxLabelLen = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i].label.length > maxLabelLen) maxLabelLen = data[i].label.length;
    }
    var marginLeft = Math.min(svgW * 0.35, Math.max(rs.marginLeft, maxLabelLen * rs.labelSize * 0.55));
    if (iconMaxW > 0) {
      marginLeft += iconMaxW + iconGap * 2; // space for icon between label and bar
    }

    // Number of series (value columns)
    var seriesCount = 0;
    for (var sc = 0; sc < data.length; sc++) {
      if (data[sc].values && data[sc].values.length > seriesCount) {
        seriesCount = data[sc].values.length;
      }
    }
    if (seriesCount === 0) return null;

    // Header
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
    var plotWidth = svgW - marginLeft - marginRight;
    var plotHeight = data.length * (barThickness + barGap) - barGap;

    // Find max row total for scale
    var maxTotal = 0;
    for (var mt = 0; mt < data.length; mt++) {
      if (!data[mt].values) continue;
      var rowTotal = 0;
      for (var mv = 0; mv < data[mt].values.length; mv++) {
        rowTotal += Math.abs(data[mt].values[mv]);
      }
      if (rowTotal > maxTotal) maxTotal = rowTotal;
    }
    if (maxTotal === 0) maxTotal = 1;
    // ── FORK PATCH (online tool): reserve room for the row total label
    // (rendered at the right of each row) so the longest row never escapes
    // the SVG. Reserve = max(text-width estimate, 18% of plot width).
    var totalTextChars = String(R.formatNumber(maxTotal, config.numFmt)).length;
    var textBased = 6 + Math.ceil(totalTextChars * rs.valueSize * 0.66) + 10;
    var percentBased = Math.ceil(plotWidth * 0.18);
    var labelReserve = Math.max(textBased, percentBased);
    var effectivePlotWidth = Math.max(20, plotWidth - labelReserve);
    var xScale = R.linearScale(0, maxTotal, 0, effectivePlotWidth);

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

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    for (var j = 0; j < data.length; j++) {
      var y = j * (barThickness + barGap);
      var xOff = 0;

      // Label (right-aligned, left of icon)
      var labelX = iconMaxW > 0 ? -(iconMaxW + iconGap * 2) : -8;
      var label = R.truncate(data[j].label, rs.maxLabelChars);
      svg.push('    <text x="' + labelX + '" y="' + (y + barThickness / 2 + rs.labelSize * 0.35).toFixed(1) +
        '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
        '" fill="' + st.labelColor + '" text-anchor="end">' + R.escapeXml(label) + '</text>');

      // Icon (right of label, between label and bar)
      if (iconMaxW > 0 && data[j]._iconSvg) {
        var dims = R.getIconDims(data[j]._iconSvg, iconH, iconNorm);
        var icoX = -(iconMaxW + iconGap) + (iconMaxW - dims.w) / 2;
        var icoY = y + (barThickness - dims.h) / 2;
        var icoColor = !isFlags ? (config.rowIconColor || "#009EDB") : null;
        svg.push('    ' + R.buildIconGroup(data[j]._iconSvg, iconH, icoX, icoY, icoColor, iconNorm));
      }

      // Stroke config
      var hasStroke = config.stackedStroke;
      var strokeAttr = hasStroke
        ? ' stroke="' + (config.stackedStrokeColor || "#FFFFFF") + '" stroke-width="' + (config.stackedStrokeWidth || 1) + '"'
        : '';

      // Stacked segments
      for (var s = 0; s < data[j].values.length; s++) {
        var segVal = Math.abs(data[j].values[s]);
        if (segVal === 0) continue;
        var segW = xScale(segVal);
        var segColor = config.colors[s % config.colors.length];

        var actualW = Math.max(1, segW);

        svg.push('    <rect x="' + xOff.toFixed(1) + '" y="' + y +
          '" width="' + actualW.toFixed(1) + '" height="' + barThickness +
          '" fill="' + segColor + '"' + strokeAttr + '/>');

        // Value inside segment if wide enough
        var lblMode = config.barLabelMode || "outside";
        if (lblMode !== "none" && lblMode !== "total" && segW > 24) {
          var txtColor = config.labelColor ? st.valueColor : R.contrastText(segColor);
          svg.push('    <text x="' + (xOff + segW / 2).toFixed(1) + '" y="' +
            (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + Math.max(7, rs.valueSize - 1) +
            '" fill="' + txtColor + '" text-anchor="middle">' + R.formatNumber(segVal, config.numFmt) + '</text>');
        }

        xOff += segW;
      }

      // Total value at end
      var lblMode2 = config.barLabelMode || "outside";
      if (lblMode2 === "outside" || lblMode2 === "total") {
        var rowTot = 0;
        for (var rv = 0; rv < data[j].values.length; rv++) rowTot += Math.abs(data[j].values[rv]);
        svg.push('    <text x="' + (xOff + 6).toFixed(1) + '" y="' +
          (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + st.valueColor + '">' + R.formatNumber(rowTot, config.numFmt) + '</text>');
      }
    }

    svg.push('  </g>');

    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("stacked-bar", "Stacked Bar", render);
})();
