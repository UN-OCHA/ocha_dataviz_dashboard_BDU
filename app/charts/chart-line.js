/**
 * Line Chart Renderer
 *
 * Single-series line with optional dots and value labels. Dot radius
 * is proportional to chart width; value labels are placed above the
 * point by default, but auto-shift below or to the side when they'd
 * overlap the line itself.
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;

  function render(title, data, config) {
    if (!data.length) return null;

    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    // Flush-left: drop the legacy `rs.marginLeft` gutter. The first
    // dot's left edge now sits at x=0 (its center is offset right by
    // dotRadius via xInset below).
    var marginRight = rs.marginRight;
    var marginLeft = 0;

    // Labels: horizontal when chart is large (md/lg), rotated when small or many labels
    var forceRotate = data.length > rs.labelRotateThreshold;
    var rotateLabels = forceRotate && (rs.breakpoint === "xs" || rs.breakpoint === "sm");

    var shade = !!config.shade;

    // Header
    var header = R.renderHeader({
      x: 0, startY: 6,
      title: title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW, widthPercent: config.headerTextWidth
    });

    var plotTop = R.computePlotTop(rs, header);
    var plotWidth = svgW - marginLeft - marginRight;

    // Pre-wrap horizontal x-axis labels so marginBottom can grow to
    // fit multi-line labels. Labels in line charts are usually short
    // (years, quarters), so this rarely produces multi-line content,
    // but we still pre-wrap so very long category names don't blow
    // past the budget.
    var labelStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
    var labelWraps = [];
    var maxLabelLines = 1;
    if (!rotateLabels) {
      var wrapMaxW = Math.max(40, labelStep - 4);
      for (var pw = 0; pw < data.length; pw++) {
        var lw = R.wrapToFit(String(data[pw].label || ""),
          rs.labelSize, wrapMaxW, 3, R.LABEL_ADVANCE);
        labelWraps.push(lw);
        if (lw.lines.length > maxLabelLines) maxLabelLines = lw.lines.length;
      }
    }
    var marginBottom = R.measureXAxisLabelBudget(data, rs, rotateLabels, maxLabelLines);
    var plotHeight = config.height ? (config.height - plotTop - marginBottom) : rs.defaultPlotHeight;

    // Footer — plot bottom is the baseline + the label row that sits below it.
    // computeFooterStart adds the breakpoint gap only when footer has text.
    var footerStartY = R.computeFooterStart(rs, plotTop + plotHeight + marginBottom, !!config.footer);
    var footer = R.renderFooter({
      x: 0, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW, widthPercent: config.footerTextWidth
    });

    var svgH = config.height || (footerStartY + footer.height);

    // Data range
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < data.length; i++) {
      if (data[i].value < minVal) minVal = data[i].value;
      if (data[i].value > maxVal) maxVal = data[i].value;
    }

    var scaleMin = minVal;
    // User-fixed scale anchor takes precedence over nice-rounded auto max.
    // Preserves the auto-computed min (so non-zero baselines still work)
    // while anchoring the top of the axis to the user's typed value.
    var scale;
    if (config.axisMax != null && config.axisMax > 0) {
      scale = { min: scaleMin, max: config.axisMax };
    } else {
      scale = R.niceScale(scaleMin, maxVal, rs.maxTicks);
    }

    var yScale = R.linearScale(scale.min, scale.max, plotHeight, 0);

    // Fixed data-point radius (user-configurable via Design tab slider).
    // Does NOT scale with chart width or height by design — labels and
    // dots stay the same size regardless of canvas dimensions.
    var dotRadius = (config.lineDotSize != null ? config.lineDotSize : 4);
    if (dotRadius < 1) dotRadius = 1;

    // Asymmetric inset for flush-left: first dot's center sits at
    // x = dotRadius so its LEFT EDGE lands at x=0, aligned with title.
    // Last dot still inset by dotRadius so its right edge fits cleanly.
    var leftInset = dotRadius;
    var rightInset = dotRadius;
    var usablePlotW = plotWidth - leftInset - rightInset;
    var xStep = data.length > 1 ? usablePlotW / (data.length - 1) : usablePlotW / 2;

    var lineColor = config.colors[0];

    var strokeW = rs.strokeWidth;

    // Calculate points
    var points = [];
    for (var p = 0; p < data.length; p++) {
      var px = data.length > 1 ? leftInset + p * xStep : plotWidth / 2;
      var py = yScale(data[p].value);
      points.push({ x: px, y: py });
    }

    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    // Area fill
    if (shade) {
      var areaPath = 'M' + points[0].x.toFixed(1) + ',' + plotHeight;
      for (var a = 0; a < points.length; a++) {
        areaPath += ' L' + points[a].x.toFixed(1) + ',' + points[a].y.toFixed(1);
      }
      areaPath += ' L' + points[points.length - 1].x.toFixed(1) + ',' + plotHeight + ' Z';
      svg.push('    <path d="' + areaPath + '" fill="' + lineColor + '" fill-opacity="0.1"/>');
    }

    // Line
    var linePath = 'M' + points[0].x.toFixed(1) + ',' + points[0].y.toFixed(1);
    for (var l = 1; l < points.length; l++) {
      linePath += ' L' + points[l].x.toFixed(1) + ',' + points[l].y.toFixed(1);
    }
    svg.push('    <path d="' + linePath + '" fill="none" stroke="' + lineColor +
      '" stroke-width="' + strokeW + '" stroke-linejoin="round" stroke-linecap="round"/>');

    // Options
    var showDots = config.lineShowDots !== false;
    var labelPos = config.lineLabelPos || "auto";
    var labelBg = config.lineLabelBg || "none";

    // Helper: calculate overlap penalty between a label box and line segments near point d
    function segPenalty(p1, p2, cx, halfW, boxTop, boxBot) {
      var dx = p2.x - p1.x;
      if (Math.abs(dx) < 0.1) return 0;
      // Clamp label x range to segment x range
      var left = Math.max(cx - halfW, Math.min(p1.x, p2.x));
      var right = Math.min(cx + halfW, Math.max(p1.x, p2.x));
      if (left >= right) return 0;
      // Line y at clamped edges
      var yL = p1.y + (p2.y - p1.y) * (left - p1.x) / dx;
      var yR = p1.y + (p2.y - p1.y) * (right - p1.x) / dx;
      var lineTop = Math.min(yL, yR);
      var lineBot = Math.max(yL, yR);
      // Check vertical overlap
      var oTop = Math.max(lineTop, boxTop);
      var oBot = Math.min(lineBot, boxBot);
      if (oTop < oBot) return 10 + (oBot - oTop); // direct overlap
      // Proximity penalty — only when line is very close to entering the label box
      var dist = lineTop > boxBot ? lineTop - boxBot : boxTop - lineBot;
      if (dist < 2) return 2 - dist;
      return 0;
    }

    function calcLinePenalty(pts, idx, cx, halfW, boxTop, boxBot) {
      var pen = 0;
      if (idx > 0) pen += segPenalty(pts[idx - 1], pts[idx], cx, halfW, boxTop, boxBot);
      if (idx < pts.length - 1) pen += segPenalty(pts[idx], pts[idx + 1], cx, halfW, boxTop, boxBot);
      return pen;
    }

    // Data points + smart value labels
    for (var d = 0; d < points.length; d++) {
      // Circle (optional)
      if (showDots) {
        svg.push('    <circle cx="' + points[d].x.toFixed(1) + '" cy="' + points[d].y.toFixed(1) +
          '" r="' + dotRadius + '" fill="#ffffff" stroke="' + lineColor +
          '" stroke-width="' + (strokeW * 0.8).toFixed(1) + '"/>');
      }

      var valText = R.formatNumber(data[d].value, config.numFmt);
      var estTextW = valText.length * rs.valueSize * 0.6;
      var halfText = estTextW / 2;

      // Compute actual label x position first (shifted for first/last to prevent overflow)
      var valX = points[d].x;
      if (valX - halfText < 0) valX = halfText;
      if (valX + halfText > plotWidth) valX = plotWidth - halfText;

      // Label positioning
      var labelAbove = true;
      // Extra clearance when label background is drawn so box doesn't overlap the dot
      var gap = (showDots ? dotRadius : 0) + (labelBg !== "none" ? 7 : 4);
      var labelH = rs.valueSize;

      // Plot-area bounds for the label's glyph BOX. The text baseline
      // sits at valY; the glyph extends roughly from valY-0.8·labelH
      // (cap top) to valY+0.2·labelH (descender). For the auto path
      // we use the conservative box [y-labelH, y] (cap-to-baseline).
      // The baseline of the chart sits a few pixels below plotHeight
      // (drawn at plotHeight+baselineGap) — a label whose descender
      // crowds the baseline still reads as "too close to the axis",
      // so we keep a small safety margin above plotHeight too.
      var BASELINE_SAFETY = 3; // visual breathing room above the X axis line
      var aboveTop = points[d].y - gap - labelH;
      var aboveBot = points[d].y - gap;
      var belowTop = points[d].y + gap;
      var belowBot = points[d].y + gap + labelH;

      // Does each side overflow the plot? Boolean — used as a hard
      // constraint, not a soft preference.
      var aboveOverflow = aboveTop < 0;
      var belowOverflow = belowBot > (plotHeight - BASELINE_SAFETY);

      if (labelPos === "below") {
        labelAbove = false;
      } else if (labelPos === "above") {
        labelAbove = true;
      } else {
        // "auto" — geometric overlap check against line segments
        // Use actual label center (valX) not point x, so shifted first/last labels are checked correctly
        var abovePenalty = calcLinePenalty(points, d, valX, halfText, aboveTop, aboveBot);
        var belowPenalty = calcLinePenalty(points, d, valX, halfText, belowTop, belowBot);

        // Plot-bound overflow is a HARD constraint — line overlap is
        // a softer aesthetic concern. Add a large penalty when a side
        // would overflow so the other side wins regardless of line
        // overlap. If both would overflow we still pick the lesser
        // line-penalty (graceful degradation on tiny charts).
        if (aboveOverflow) abovePenalty += 1000;
        if (belowOverflow) belowPenalty += 1000;

        labelAbove = abovePenalty <= belowPenalty;
      }

      // Forced-mode safety net: even when the user pinned the label
      // above or below, never let the label punch through the chart's
      // top or bottom edge. The user's preference is best-effort; a
      // visually broken label is worse than honouring the request.
      if (labelAbove && aboveOverflow && !belowOverflow) {
        labelAbove = false;
      } else if (!labelAbove && belowOverflow && !aboveOverflow) {
        labelAbove = true;
      }

      var valY;
      if (labelAbove) {
        valY = points[d].y - gap;
      } else {
        valY = points[d].y + gap + rs.valueSize;
      }

      var valAnchor = "middle";

      // Suppress label + background when value is 0 and the user ticked
      // "Hide 0 value labels". The dot on the line still renders.
      var hideThisLabel = config.hideZeroLabels && data[d].value === 0;

      // Label background rectangle
      if (!hideThisLabel && labelBg !== "none") {
        var bgPadX = 3;
        var bgPadY = 2;
        var bgX = valX - halfText;
        var bgY = valY - rs.valueSize + bgPadY;

        svg.push('    <rect x="' + (bgX - bgPadX).toFixed(1) + '" y="' + (bgY - bgPadY).toFixed(1) +
          '" width="' + (estTextW + bgPadX * 2).toFixed(1) + '" height="' + (rs.valueSize + bgPadY * 2).toFixed(1) +
          '" fill="' + (labelBg === "black" ? "#000000" : "#ffffff") +
          '" rx="2" opacity="0.85"/>');
      }

      var valColor = labelBg === "black" ? "#ffffff" : labelBg === "white" ? "#333333" : st.valueColor;

      if (!hideThisLabel) {
        svg.push('    <text x="' + valX.toFixed(1) + '" y="' + valY.toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + valColor + '" text-anchor="' + valAnchor + '">' + valText + '</text>');
      }
    }

    // X-axis labels — placed below the baseline.
    // Rotated mode: single line, fade if extremely long.
    // Horizontal mode: pre-wrapped multi-line, fade if truncated.
    var baselineGap = 12;
    var baselineY = plotHeight + baselineGap;
    var lineH = Math.round(rs.labelSize * 1.2);
    for (var k = 0; k < data.length; k++) {
      var lx = data.length > 1 ? leftInset + k * xStep : plotWidth / 2;
      var ly = baselineY + rs.labelSize + 4;

      // Anchor: first label "start", last label "end", rest "middle"
      var anchor = "middle";
      if (data.length > 2) {
        if (k === 0) anchor = "start";
        else if (k === data.length - 1) anchor = "end";
      }

      if (rotateLabels) {
        var rotMaxChars = rs.maxLabelChars * 2;
        var rotText = String(data[k].label || "");
        var rotTruncated = rotText.length > rotMaxChars;
        if (rotTruncated) rotText = rotText.substring(0, rotMaxChars - 1) + "…";
        var rotColor = rotTruncated ? R.FADED_LABEL_COLOR : st.labelColor;
        if (rotTruncated) {
          R.pushWarning("label-truncated", { count: 1,
            suggestion: "Try a wider chart or shorter category labels" });
        }
        svg.push('    <text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + rotColor + '" text-anchor="end" transform="rotate(-45,' + lx.toFixed(1) + ',' + ly.toFixed(1) + ')">' +
          R.escapeXml(rotText) + '</text>');
      } else {
        var wrap = labelWraps[k];
        if (!wrap.fits) {
          R.pushWarning("label-truncated", { count: 1,
            suggestion: "Try a wider chart or shorter category labels" });
        }
        var wrapColor = wrap.truncated ? R.FADED_LABEL_COLOR : st.labelColor;
        var wrapLines = wrap.lines.length ? wrap.lines : [""];
        for (var ln = 0; ln < wrapLines.length; ln++) {
          svg.push('    <text x="' + lx.toFixed(1) + '" y="' + (ly + ln * lineH).toFixed(1) +
            '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
            '" fill="' + wrapColor + '" text-anchor="' + anchor + '">' +
            R.escapeXml(wrapLines[ln]) + '</text>');
        }
      }
    }

    // Baseline — already computed above for label placement
    svg.push('    <line x1="0" y1="' + baselineY.toFixed(1) + '" x2="' + plotWidth +
      '" y2="' + baselineY.toFixed(1) + '" stroke="' + st.baselineColor + '" stroke-width="' + rs.gridStrokeWidth + '"/>');

    svg.push('  </g>');

    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("line", "Line Chart", render);
})();
