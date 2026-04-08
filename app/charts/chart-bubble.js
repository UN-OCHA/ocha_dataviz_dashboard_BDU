/**
 * Bubble Chart Renderer — v9.4
 *
 * v9.4 changes:
 * - All labels centered (removed first/last anchoring)
 * - Separation slider: negative = overlap (multiply blend), 0 = touching, positive = spacing
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;

  function render(title, data, config) {
    if (!data.length) return null;

    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    var orientation = config.bubbleOrientation || "horizontal";
    var isHorizontal = orientation === "horizontal";
    var separation = config.bubbleSeparation || 0;
    var isOverlap = separation < 0;

    var marginRight = rs.marginRight + 10;
    var marginLeft = rs.marginLeft + 10;
    var marginBottom = rs.marginBottom + 10;

    // Header
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var plotTop = header.height || (rs.marginTop + 4);

    // Normalize data
    var bubbles = [];
    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      var sizeVal;
      if (d.values && d.values.length) {
        sizeVal = Math.abs(d.values[0]) || 0;
      } else {
        sizeVal = Math.abs(d.value) || 0;
      }
      bubbles.push({ label: d.label, size: sizeVal });
    }

    // Size range
    var sMin = Infinity, sMax = -Infinity;
    for (var r = 0; r < bubbles.length; r++) {
      if (bubbles[r].size < sMin) sMin = bubbles[r].size;
      if (bubbles[r].size > sMax) sMax = bubbles[r].size;
    }
    if (sMax === 0) sMax = 1;

    var plotWidth = svgW - marginLeft - marginRight;
    var maxR, minR;

    // ── FORK PATCH (online tool): tighter slot multiplier so bubbles
    // pack closer together in narrow containers. Was 2.5 → 2.1.
    if (isHorizontal) {
      maxR = Math.min(40, plotWidth / (bubbles.length * 2.1 + 1));
      minR = Math.max(5, maxR * 0.25);
    } else {
      maxR = Math.min(40, plotWidth / 4);
      minR = Math.max(5, maxR * 0.25);
    }

    function bubbleR(size) {
      if (sMax === sMin) return (maxR + minR) / 2;
      var t = (size - sMin) / (sMax - sMin);
      var area = minR * minR + t * (maxR * maxR - minR * minR);
      return Math.sqrt(area);
    }

    var radii = [];
    for (var br = 0; br < bubbles.length; br++) {
      radii.push(bubbleR(bubbles[br].size));
    }

    var bubbleColor = config.colors ? config.colors[0] : "#009EDB";

    // Separation factor: 1.0 = normal touching, <1 = overlap, >1 = spread
    var spacingFactor = 1 + (separation / 100);

    if (isHorizontal) {
      // Determine if labels need tilting: when small or many labels
      var avgLabelLen = 0;
      for (var al = 0; al < bubbles.length; al++) avgLabelLen += bubbles[al].label.length;
      avgLabelLen = bubbles.length > 0 ? avgLabelLen / bubbles.length : 0;

      var spacing = bubbles.length > 1 ? plotWidth / (bubbles.length - 1) : 0;
      var tiltLabels = false;

      // Tilt when spacing is tight relative to label character width
      if (bubbles.length > 1) {
        var approxLabelWidth = avgLabelLen * rs.labelSize * 0.55;
        if (spacing < approxLabelWidth + 4) {
          tiltLabels = true;
        }
      }
      // Also tilt at small breakpoints with 3+ items
      if ((rs.breakpoint === "xs" || rs.breakpoint === "sm") && bubbles.length >= 3) {
        tiltLabels = true;
      }

      var labelBottomExtra = tiltLabels ? rs.labelSize * 2.5 : rs.labelSize + 6;
      var plotHeight = maxR * 2 + labelBottomExtra + rs.valueSize + 30;
      var axisY = maxR + rs.valueSize + 8;

      // Inset first/last bubbles by their radii so circles don't extend past margins
      var firstR = radii[0] || 0;
      var lastR = radii[bubbles.length - 1] || 0;
      var usableWidth = plotWidth - firstR - lastR;
      var totalSpread = usableWidth * spacingFactor;
      var effectiveSpacing = bubbles.length > 1 ? totalSpread / (bubbles.length - 1) : 0;

      // First bubble offset by its radius so left edge aligns with title margin
      var startX = bubbles.length > 1 ? firstR : plotWidth / 2;

      var footerStartY = plotTop + plotHeight + marginBottom;
      var footer = R.renderFooter({
        x: marginLeft, startY: footerStartY,
        footer: config.footer, rs: rs, style: st, vPad: vPad,
        maxWidth: svgW
      });
      var svgH = config.height || (footerStartY + footer.height);

      var svg = [];
      svg.push(R.svgOpen(svgW, svgH));
      svg.push(R.svgBg(svgW, svgH));
      for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

      svg.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

      for (var b = 0; b < bubbles.length; b++) {
        var bx = bubbles.length > 1 ? startX + b * effectiveSpacing : startX;
        var by = axisY;
        var bRad = radii[b];

        var circleStyle = isOverlap
          ? ' style="mix-blend-mode:multiply" fill-opacity="0.7"'
          : ' fill-opacity="0.8"';
        svg.push('    <circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) +
          '" r="' + bRad.toFixed(1) + '" fill="' + bubbleColor + '" stroke="none"' + circleStyle + '/>');

        // Value above — always centered
        svg.push('    <text x="' + bx.toFixed(1) + '" y="' + (by - bRad - 4).toFixed(1) +
          '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
          '" fill="' + st.valueColor + '" text-anchor="middle" font-weight="bold">' +
          R.formatNumber(bubbles[b].size, config.numFmt) + '</text>');

        // Label below: tilted or straight — always centered
        var labelY = by + bRad + rs.labelSize + 6;
        var labelStr = R.escapeXml(R.truncate(bubbles[b].label, rs.maxLabelChars));

        if (tiltLabels) {
          svg.push('    <text x="' + bx.toFixed(1) + '" y="' + labelY.toFixed(1) +
            '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
            '" fill="' + st.labelColor + '" text-anchor="end"' +
            ' transform="rotate(-45,' + bx.toFixed(1) + ',' + labelY.toFixed(1) + ')">' +
            labelStr + '</text>');
        } else {
          svg.push('    <text x="' + bx.toFixed(1) + '" y="' + labelY.toFixed(1) +
            '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
            '" fill="' + st.labelColor + '" text-anchor="middle">' +
            labelStr + '</text>');
        }
      }

      svg.push('  </g>');
      for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);
      svg.push('</svg>');
      return svg.join("\n");

    } else {
      // Vertical layout
      // ── FORK PATCH (online tool): drop the 50px floor and tighten the
      // multiplier so vertical bubbles pack tighter in narrow sections.
      var vSpacingBase = bubbles.length > 1 ? maxR * 2.1 : 0;
      var vSpacing = vSpacingBase * spacingFactor;
      var plotHeightV = (bubbles.length - 1) * vSpacing + maxR * 2 + 20;
      // Left-align: bubble center at maxR so left edge touches the title margin
      var lineX = maxR;

      var footerStartYv = plotTop + plotHeightV + marginBottom;
      var footerV = R.renderFooter({
        x: marginLeft, startY: footerStartYv,
        footer: config.footer, rs: rs, style: st, vPad: vPad,
        maxWidth: svgW
      });
      var svgHv = config.height || (footerStartYv + footerV.height);

      var svgV = [];
      svgV.push(R.svgOpen(svgW, svgHv));
      svgV.push(R.svgBg(svgW, svgHv));
      for (var hiv = 0; hiv < header.svg.length; hiv++) svgV.push(header.svg[hiv]);

      svgV.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

      var vStartY = maxR + 10;

      for (var bv = 0; bv < bubbles.length; bv++) {
        var bvy = vStartY + bv * vSpacing;
        var bvx = lineX;
        var bvRad = radii[bv];

        var vCircleStyle = isOverlap
          ? ' style="mix-blend-mode:multiply" fill-opacity="0.7"'
          : ' fill-opacity="0.8"';
        svgV.push('    <circle cx="' + bvx.toFixed(1) + '" cy="' + bvy.toFixed(1) +
          '" r="' + bvRad.toFixed(1) + '" fill="' + bubbleColor + '" stroke="none"' + vCircleStyle + '/>');

        // Value: inside if big, else above
        if (bvRad > 16) {
          svgV.push('    <text x="' + bvx.toFixed(1) + '" y="' + (bvy + rs.valueSize * 0.35).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
            '" fill="#ffffff" text-anchor="middle" font-weight="bold">' +
            R.formatNumber(bubbles[bv].size, config.numFmt) + '</text>');
        } else {
          svgV.push('    <text x="' + bvx.toFixed(1) + '" y="' + (bvy - bvRad - 4).toFixed(1) +
            '" font-family="' + fonts.value + '" font-size="' + rs.valueSize +
            '" fill="' + st.valueColor + '" text-anchor="middle" font-weight="bold">' +
            R.formatNumber(bubbles[bv].size, config.numFmt) + '</text>');
        }

        // Label right of bubble
        svgV.push('    <text x="' + (bvx + bvRad + 8).toFixed(1) + '" y="' + (bvy + rs.labelSize * 0.35).toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + rs.labelSize +
          '" fill="' + st.labelColor + '" text-anchor="start">' +
          R.escapeXml(R.truncate(bubbles[bv].label, rs.maxLabelChars)) + '</text>');
      }

      svgV.push('  </g>');
      for (var fiv = 0; fiv < footerV.svg.length; fiv++) svgV.push(footerV.svg[fiv]);
      svgV.push('</svg>');
      return svgV.join("\n");
    }
  }

  R.register("bubble", "Bubble Chart", render);
})();
