/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Line Chart Renderer — v9.3
 *
 * v9.3 changes:
 * - Proportional circle (dot) radius based on chart width
 * - Horizontal labels when chart is large enough
 * - Smart label positioning: labels move below point or to the side
 *   when they would overlap the line
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

    // Labels: horizontal when chart is large (md/lg), rotated when small or many labels
    var forceRotate = data.length > rs.labelRotateThreshold;
    var rotateLabels = forceRotate && (rs.breakpoint === "xs" || rs.breakpoint === "sm");
    // Extra bottom space: baseline gap (12) + label height below it
    var marginBottom = rotateLabels ? Math.max(rs.marginBottom * 3, 65) : Math.max(rs.marginBottom * 2, 48);

    var shade = !!config.shade;

    // Header
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var plotTop = header.height || (rs.marginTop + 4);
    var plotWidth = svgW - marginLeft - marginRight;
    var plotHeight = config.height ? (config.height - plotTop - marginBottom) : rs.defaultPlotHeight;

    // Footer
    var footerStartY = plotTop + plotHeight + marginBottom;
    var footer = R.renderFooter({
      x: marginLeft, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var svgH = config.height || (footerStartY + footer.height);

    // Data range
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < data.length; i++) {
      if (data[i].value < minVal) minVal = data[i].value;
      if (data[i].value > maxVal) maxVal = data[i].value;
    }

    var scaleMin = minVal;
    var scale = R.niceScale(scaleMin, maxVal, rs.maxTicks);

    var yScale = R.linearScale(scale.min, scale.max, plotHeight, 0);
    // Inset first/last points by dot radius so circles don't extend past margins
    var xInset = 5;  // small padding to keep dots within margin
    var usablePlotW = plotWidth - xInset * 2;
    var xStep = data.length > 1 ? usablePlotW / (data.length - 1) : usablePlotW / 2;

    var lineColor = config.colors[0];

    // Proportional dot radius: scales with width
    var dotRadius;
    if (svgW >= 550) dotRadius = 5;
    else if (svgW >= 350) dotRadius = 4;
    else if (svgW >= 200) dotRadius = 3;
    else dotRadius = 2.5;

    var strokeW = rs.strokeWidth;

    // Calculate points
    var points = [];
    for (var p = 0; p < data.length; p++) {
      var px = data.length > 1 ? xInset + p * xStep : plotWidth / 2;
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

      if (labelPos === "below") {
        labelAbove = false;
      } else if (labelPos === "above") {
        labelAbove = true;
      } else {
        // "auto" — geometric overlap check against line segments
        // Use actual label center (valX) not point x, so shifted first/last labels are checked correctly
        var aboveTop = points[d].y - gap - labelH;
        var aboveBot = points[d].y - gap;
        var belowTop = points[d].y + gap;
        var belowBot = points[d].y + gap + labelH;

        var abovePenalty = calcLinePenalty(points, d, valX, halfText, aboveTop, aboveBot);
        var belowPenalty = calcLinePenalty(points, d, valX, halfText, belowTop, belowBot);

        labelAbove = abovePenalty <= belowPenalty;

        // Boundary safety: only flip if the alternative is at least as good
        if (labelAbove && aboveTop < 0 && belowPenalty <= abovePenalty) {
          labelAbove = false;
        }
        if (!labelAbove && belowBot > plotHeight && abovePenalty <= belowPenalty) {
          labelAbove = true;
        }
      }

      var valY;
      if (labelAbove) {
        valY = points[d].y - gap;
      } else {
        valY = points[d].y + gap + rs.valueSize;
      }

      var valAnchor = "middle";

      // Label background rectangle
      if (labelBg !== "none") {
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

      svg.push('    <text x="' + valX.toFixed(1) + '" y="' + valY.toFixed(1) +
        '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
        '" fill="' + valColor + '" text-anchor="' + valAnchor + '">' + valText + '</text>');
    }

    // X-axis labels — placed below the baseline
    var baselineGap = 12;
    var baselineY = plotHeight + baselineGap;
    for (var k = 0; k < data.length; k++) {
      var lx = data.length > 1 ? xInset + k * xStep : plotWidth / 2;
      var ly = baselineY + rs.labelSize + 4;
      var label = R.truncate(data[k].label, rs.maxLabelChars);

      // Anchor: first label "start", last label "end", rest "middle"
      var anchor = "middle";
      if (data.length > 2) {
        if (k === 0) anchor = "start";
        else if (k === data.length - 1) anchor = "end";
      }

      if (rotateLabels) {
        svg.push('    <text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + st.labelColor + '" text-anchor="end" transform="rotate(-45,' + lx.toFixed(1) + ',' + ly.toFixed(1) + ')">' +
          R.escapeXml(label) + '</text>');
      } else {
        svg.push('    <text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + st.labelColor + '" text-anchor="' + anchor + '">' + R.escapeXml(label) + '</text>');
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
