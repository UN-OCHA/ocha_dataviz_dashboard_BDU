/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Stacked Vertical Column Chart Renderer — v9
 *
 * Expects multi-value data: [{label, values: [v1, v2, ...]}]
 * Each segment is a different color from the palette.
 * Labels on bottom, segments stacked vertically.
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

    var marginRight = rs.marginRight;
    var marginLeft = rs.marginLeft;

    // Icon column
    var hasIcons = config.iconColType && config.iconColType !== "none";
    var isFlags = config.iconColType === "flags";
    var iconNorm = hasIcons ? (isFlags ? 1.5 : 1.0) : false;
    var iconSize = Math.min(rs.labelSize * 1.2, 18);
    var iconGap = 4;
    var iconMaxH = hasIcons ? R.maxIconHeight(data, iconSize, iconNorm) : 0;

    var rotateLabels = data.length > rs.labelRotateThreshold;
    var marginBottom = rotateLabels ? Math.max(rs.marginBottom * 3, 55) : Math.max(rs.marginBottom * 2, 35);
    if (iconMaxH > 0) {
      marginBottom += iconMaxH + iconGap;
    }

    // Number of series
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

    // ── FORK PATCH (online tool): reserve room above the plot for the
    // total-value label that sits on top of each column. Without this the
    // label above the tallest column gets clipped above the SVG.
    var topLabelReserve = (config.barLabelMode === "none" || config.barLabelMode === "inside")
      ? 0
      : Math.ceil(rs.valueSize + 6);
    var plotTop = (header.height || (rs.marginTop + 4)) + topLabelReserve;
    var plotWidth = svgW - marginLeft - marginRight;
    var plotHeight = config.height ? (config.height - plotTop - marginBottom) : rs.defaultPlotHeight;

    // Max row total for scale
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

    var scale = R.niceScale(0, maxTotal, rs.maxTicks);
    var yScale = R.linearScale(0, scale.max, plotHeight, 0);
    var band = R.bandScale(data.length, 0, plotWidth, 0.25);

    // Footer
    var footerStartY = plotTop + plotHeight + marginBottom;
    var footer = R.renderFooter({
      x: marginLeft,
      startY: footerStartY,
      footer: config.footer,
      rs: rs,
      style: st,
      vPad: vPad,
      maxWidth: svgW
    });

    var svgH = config.height || (footerStartY + footer.height);

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    // No gridlines — direct labelling provides values

    // Column width: use barThickness override or default band width
    var colW = band.bandwidth;
    if (config.barThickness && config.barThickness > 0) {
      colW = Math.min(config.barThickness, band.step - 2);
    }
    var colOffset = (band.bandwidth - colW) / 2;

    // Stroke config
    var hasStroke = config.stackedStroke;
    var strokeAttr = hasStroke
      ? ' stroke="' + (config.stackedStrokeColor || "#FFFFFF") + '" stroke-width="' + (config.stackedStrokeWidth || 1) + '"'
      : '';

    // Columns
    for (var j = 0; j < data.length; j++) {
      var x = band.position(j) + colOffset;
      var yOff = plotHeight; // start from bottom

      for (var s = 0; s < data[j].values.length; s++) {
        var segVal = Math.abs(data[j].values[s]);
        if (segVal === 0) continue;
        var segH = plotHeight - yScale(segVal);
        var segColor = config.colors[s % config.colors.length];

        yOff -= segH;

        var actualH = Math.max(1, segH);

        svg.push('    <rect x="' + x.toFixed(1) + '" y="' + yOff.toFixed(1) +
          '" width="' + colW.toFixed(1) + '" height="' + actualH.toFixed(1) +
          '" fill="' + segColor + '"' + strokeAttr + '/>');

        // Value inside segment if tall enough
        var lblMode = config.barLabelMode || "outside";
        if (lblMode !== "none" && lblMode !== "total" && segH > 16) {
          var txtColor = config.labelColor ? st.valueColor : R.contrastText(segColor);
          svg.push('    <text x="' + (x + colW / 2).toFixed(1) + '" y="' +
            (yOff + segH / 2 + Math.max(6, rs.valueSize - 1) * 0.35).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + Math.max(6, rs.valueSize - 1) +
            '" fill="' + txtColor + '" text-anchor="middle">' + R.formatNumber(segVal, config.numFmt) + '</text>');
        }
      }

      // Total above column
      var lblMode2 = config.barLabelMode || "outside";
      if (lblMode2 === "outside" || lblMode2 === "total") {
        var rowTot = 0;
        for (var rv = 0; rv < data[j].values.length; rv++) rowTot += Math.abs(data[j].values[rv]);
        svg.push('    <text x="' + (x + colW / 2).toFixed(1) + '" y="' + (yOff - 4).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + st.valueColor + '" text-anchor="middle">' + R.formatNumber(rowTot, config.numFmt) + '</text>');
      }

      // Icon above label (between column and label)
      var labelX = x + colW / 2;
      var iconBottomY = plotHeight + iconGap;
      if (iconMaxH > 0 && data[j]._iconSvg) {
        var dims = R.getIconDims(data[j]._iconSvg, iconSize, iconNorm);
        var icoX = labelX - dims.w / 2;
        var icoY = iconBottomY;
        var icoColor = !isFlags ? (config.rowIconColor || "#009EDB") : null;
        svg.push('    ' + R.buildIconGroup(data[j]._iconSvg, iconSize, icoX, icoY, icoColor, iconNorm));
      }

      // X-axis label (at very bottom, below icon)
      var labelY = iconMaxH > 0
        ? (iconBottomY + iconMaxH + iconGap + rs.labelSize)
        : (plotHeight + rs.labelSize + 4);
      var label = R.truncate(data[j].label, rs.maxLabelChars);

      if (rotateLabels) {
        svg.push('    <text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + st.labelColor + '" text-anchor="end" transform="rotate(-45,' + labelX.toFixed(1) + ',' + labelY.toFixed(1) + ')">' +
          R.escapeXml(label) + '</text>');
      } else {
        svg.push('    <text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + st.labelColor + '" text-anchor="middle">' + R.escapeXml(label) + '</text>');
      }
    }

    svg.push('  </g>');

    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("stacked-col", "Stacked Column", render);
})();
