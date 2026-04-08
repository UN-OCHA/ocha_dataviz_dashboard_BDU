/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Vertical Bar Chart Renderer — v9
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

    var marginRight = rs.marginRight;
    var marginLeft = rs.marginLeft;

    // Icon column
    var hasIcons = config.iconColType && config.iconColType !== "none";
    var isFlags = config.iconColType === "flags";
    var iconNorm = hasIcons ? (isFlags ? 1.5 : 1.0) : false;
    var iconSize = Math.min(rs.labelSize * 1.2, 18);
    var iconGap = 4;
    // Area normalization: max height varies due to different aspect ratios
    var iconMaxH = hasIcons ? R.maxIconHeight(data, iconSize, iconNorm) : 0;

    // Bottom margin: extra space if labels rotate, plus icon space
    var rotateLabels = data.length > rs.labelRotateThreshold;
    var marginBottom = rotateLabels ? Math.max(rs.marginBottom * 3, 55) : Math.max(rs.marginBottom * 2, 35);
    if (iconMaxH > 0) {
      marginBottom += iconMaxH + iconGap;
    }

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
    // value label that sits above each bar (mode "outside"). Without this
    // the label above the tallest bar gets clipped above the SVG.
    var topLabelReserveV = (config.barLabelMode === "none" || config.barLabelMode === "inside")
      ? 0
      : Math.ceil(rs.valueSize + 6);
    var plotTop = (header.height || (rs.marginTop + 4)) + topLabelReserveV;

    // Plot area
    var plotWidth = svgW - marginLeft - marginRight;
    var plotHeight = config.height ? (config.height - plotTop - marginBottom) : rs.defaultPlotHeight;

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

    // Data range
    var maxVal = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i].value > maxVal) maxVal = data[i].value;
    }
    if (maxVal === 0) maxVal = 1;

    var scale = R.niceScale(0, maxVal, rs.maxTicks);
    var yScale = R.linearScale(0, scale.max, plotHeight, 0);
    var band = R.bandScale(data.length, 0, plotWidth, 0.25);

    var barColor = config.colors[0];

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    // No gridlines — direct labelling provides values

    // Bar width: use barThickness override or default band width
    var barW = band.bandwidth;
    if (config.barThickness && config.barThickness > 0) {
      barW = Math.min(config.barThickness, band.step - 2);
    }
    var barOffset = (band.bandwidth - barW) / 2;

    // Bars
    for (var j = 0; j < data.length; j++) {
      var x = band.position(j) + barOffset;
      var barH = plotHeight - yScale(data[j].value);
      var y = plotHeight - barH;

      svg.push('    <rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, barH).toFixed(1) +
        '" fill="' + barColor + '"/>');

      // Value label
      var lblMode = config.barLabelMode || "outside";
      if (lblMode === "outside") {
        svg.push('    <text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + st.valueColor + '" text-anchor="middle">' + R.formatNumber(data[j].value, config.numFmt) + '</text>');
      } else if (lblMode === "inside") {
        var insY = Math.min(y + barH - 4, plotHeight - 4);
        svg.push('    <text x="' + (x + barW / 2).toFixed(1) + '" y="' + insY.toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + (config.labelColor || "#ffffff") + '" text-anchor="middle">' + R.formatNumber(data[j].value, config.numFmt) + '</text>');
      }

      // Icon above label (between bar and label) — centered on bar width
      var labelX = x + barW / 2;
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

  R.register("vbar", "Vertical Bar", render);
})();
