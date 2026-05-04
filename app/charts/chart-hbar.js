/**
 * Horizontal Bar Chart Renderer
 *
 * Each row → one bar whose width encodes its value. Labels sit on
 * the left column with optional inline icon/flag, and the value is
 * drawn at the bar end. The label column auto-grows to fit the
 * widest wrapped label so the longest label sits flush at x ≈ 0.
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
    // User-configurable bar spacing (vertical gap between rows).
    // Auto = the responsive default. Manual = whatever the user picked.
    var barGap = (config.barSpacing && config.barSpacing > 0) ? config.barSpacing : rs.barGap;

    // Flush-left composition (matches stacked-bar pattern):
    //   ┌── label column ──┬── icon ──┬── bar zone ──┐
    //   x=0                                          plotWidth
    // Labels are right-aligned within `labelColW`, so the longest
    // label's left edge sits at x ≈ 0 (perceptually flush with the
    // title). Shorter labels indent inward.
    var marginLeft = 0;
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

    // Pre-wrap each category label into up to 3 lines that fit within
    // the capped label column width. Multi-line labels grow the row
    // gap so adjacent rows' labels don't overlap. A label that even
    // at 3 lines doesn't fit gets the last line ellipsised and is
    // rendered in faded grey + reported via pushWarning so the panel
    // surfaces a banner.
    var LABEL_LINE_H = Math.round(rs.labelSize * 1.2);
    var labelTargetW = Math.min(svgW * 0.35, 200);
    var wrappedLabels = [];
    var maxLineW = 0;
    var maxLines = 1;
    var truncCount = 0;
    for (var i = 0; i < data.length; i++) {
      var wrap = R.wrapToFit(String(data[i].label || ""),
        rs.labelSize, labelTargetW, 3, R.LABEL_ADVANCE);
      wrappedLabels.push(wrap);
      if (!wrap.fits) truncCount++;
      if (wrap.lines.length > maxLines) maxLines = wrap.lines.length;
      for (var l = 0; l < wrap.lines.length; l++) {
        var lw = wrap.lines[l].length * rs.labelSize * R.LABEL_ADVANCE;
        if (lw > maxLineW) maxLineW = lw;
      }
    }
    if (truncCount > 0) {
      R.pushWarning("label-truncated", {
        count: truncCount,
        suggestion: "Try a wider chart or shorter category labels"
      });
    }

    // Column width = actual longest wrapped line + 2-px glyph-bearing
    // safety. Capped at 35% of canvas (the wrap target) so bars still
    // get room.
    var labelColW = Math.min(svgW * 0.35, maxLineW + 2);
    var labelToBarGap = 12;
    var iconSlotW = iconMaxW > 0 ? (iconMaxW + iconGap) : 0;
    var barStartX = labelColW + labelToBarGap + iconSlotW;

    // Row height: bar thickness OR multi-line label block, whichever
    // taller. We grow the inter-row gap (effBarGap) by twice the label
    // overhang so adjacent rows don't have their labels overlap.
    var labelBlockH = maxLines * LABEL_LINE_H;
    var labelOverhang = Math.max(0, (labelBlockH - barThickness) / 2);
    var effBarGap = barGap + labelOverhang * 2;

    // Header block
    var header = R.renderHeader({
      x: 0,
      startY: 6,
      title: title,
      subtitle: config.subtitle,
      comments: config.comments,
      rs: rs,
      style: st,
      vPad: vPad,
      maxWidth: svgW, widthPercent: config.headerTextWidth
    });

    var plotTop = R.computePlotTop(rs, header);

    // Data area — bars occupy the zone right of the label column.
    // Reserve a little space on the right for outside value labels.
    var plotWidth = svgW - marginLeft - marginRight;
    var valueLabelBudget = Math.max(32, rs.valueSize * 4);
    var barsZoneW = Math.max(20, plotWidth - barStartX - valueLabelBudget);
    var plotHeight = data.length * (barThickness + effBarGap) - effBarGap;

    // Footer — computeFooterStart adds rs.footerGap when there's footer
    // text, otherwise no gap is consumed.
    var footerStartY = R.computeFooterStart(rs, plotTop + plotHeight, !!config.footer);
    var footer = R.renderFooter({
      x: 0,
      startY: footerStartY,
      footer: config.footer,
      rs: rs,
      style: st,
      vPad: vPad,
      maxWidth: svgW, widthPercent: config.footerTextWidth
    });

    var svgH = config.height || (footerStartY + footer.height + rs.marginBottom);

    // If user set a fixed height, recalculate bar thickness
    if (config.height) {
      var availH = svgH - plotTop - footer.height - rs.marginBottom;
      barThickness = Math.max(6, Math.floor((availH + effBarGap) / data.length) - effBarGap);
      plotHeight = data.length * (barThickness + effBarGap) - effBarGap;
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
    // User-fixed scale anchor: lets two charts be directly comparable.
    if (config.axisMax != null && config.axisMax > 0) maxVal = config.axisMax;
    var xScale = R.linearScale(0, maxVal, 0, barsZoneW);

    var barColor = config.colors[0];

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    // Header text
    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    for (var j = 0; j < data.length; j++) {
      var y = j * (barThickness + effBarGap);
      // Zero value → no bar. We keep the row's slot, the category label
      // on the left, and the "0" value label on the right, but skip the
      // rect so the reader doesn't see a misleading 1px sliver.
      var val = data[j].value;
      var barW = val === 0 ? 0 : Math.max(1, xScale(val));

      // Multi-line label, right-aligned at the end of the label column,
      // vertically centered against the bar. Truncated labels get the
      // FADED_LABEL_COLOR so the user can see at a glance which ones
      // overflowed. Longest label's left edge sits at x ≈ 2 (flush).
      var lblWrap = wrappedLabels[j];
      var lblLines = lblWrap.lines.length ? lblWrap.lines : [""];
      var lblColor = lblWrap.truncated ? R.FADED_LABEL_COLOR : st.labelColor;
      // Stack lines centred on the bar's vertical centre.
      var blockH = lblLines.length * LABEL_LINE_H;
      var firstBaselineY = y + barThickness / 2 - blockH / 2 + rs.labelSize;
      for (var ln = 0; ln < lblLines.length; ln++) {
        svg.push('    <text x="' + labelColW.toFixed(1) + '" y="' + (firstBaselineY + ln * LABEL_LINE_H).toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + lblColor + '" text-anchor="end">' + R.escapeXml(lblLines[ln]) + '</text>');
      }

      // Icon (right of label column, before the bar)
      if (iconMaxW > 0 && data[j]._iconSvg) {
        var dims = R.getIconDims(data[j]._iconSvg, iconH, iconNorm);
        var icoX = labelColW + labelToBarGap + (iconMaxW - dims.w) / 2;
        var icoY = y + (barThickness - dims.h) / 2;
        var icoColor = !isFlags ? (config.rowIconColor || "#009EDB") : null;
        svg.push('    ' + R.buildIconGroup(data[j]._iconSvg, iconH, icoX, icoY, icoColor, iconNorm));
      }

      // Bar — starts at barStartX (after label column + icon slot).
      if (barW > 0) {
        svg.push('    <rect x="' + barStartX.toFixed(1) + '" y="' + y + '" width="' + barW.toFixed(1) +
          '" height="' + barThickness + '" fill="' + barColor + '"/>');
      }

      // Value label — suppressed when value is 0 and user ticked
      // "Hide 0 value labels" in the Design tab.
      var lblMode = config.barLabelMode || "outside";
      var hideThisLabel = config.hideZeroLabels && val === 0;
      if (!hideThisLabel) {
        if (lblMode === "outside") {
          svg.push('    <text x="' + (barStartX + barW + 6).toFixed(1) + '" y="' + (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
            '" fill="' + st.valueColor + '">' + R.formatNumber(val, config.numFmt) + '</text>');
        } else if (lblMode === "inside") {
          var insX = Math.max(barStartX + barW - 6, barStartX + 4);
          svg.push('    <text x="' + insX.toFixed(1) + '" y="' + (y + barThickness / 2 + rs.valueSize * 0.35).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
            '" fill="' + (config.labelColor || "#ffffff") + '" text-anchor="end">' + R.formatNumber(val, config.numFmt) + '</text>');
        }
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
