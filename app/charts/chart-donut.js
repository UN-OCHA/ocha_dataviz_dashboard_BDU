/**
 * Donut Chart Renderer — v9.4
 *
 * v9.4 changes:
 * - Configurable label modes: none, outside, inside, auto
 * - Configurable label content: pct, value, label-pct, label-value
 * - Leader lines toggle
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;
  var DONUT_DEFAULT = "#009EDB";

  function render(title, data, config) {
    if (!data.length) return null;

    data = R.mergeSlices(data);
    // Sort largest-first when auto-sort is on; preserve table order otherwise
    if (config.autoSort !== false) {
      data.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    }

    var donutColor = (config.colors && config.colors[0]) || DONUT_DEFAULT;
    var labelMode = config.pieLabelMode || "auto";
    var labelContent = config.pieLabelContent || "label-pct";
    var showLeaders = config.pieLeaderLines !== false;

    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    var header = R.renderHeader({
      x: 10, startY: 6,
      title: title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var plotTop = header.height || (rs.marginTop + 4);

    // ── FORK PATCH (online tool): compute labelMargin from the actual
    // longest label text so labels never get cropped. The original
    // hard-coded svgW * 0.22 fails for narrow charts with long category
    // names. Capped at 38% of svgW so the donut never disappears.
    var labelSizeApprox = Math.max(7, rs.labelSize - 1);
    var labelMargin;
    if (labelMode === "inside" || labelMode === "none") {
      labelMargin = Math.min(svgW * 0.08, 30);
    } else {
      var maxLabelChars = 0;
      for (var li0 = 0; li0 < data.length; li0++) {
        var lt = R.buildPieLabelText(
          data[li0].label,
          Math.round((Math.abs(data[li0].value) /
            Math.max(1, data.reduce(function (a, b) { return a + Math.abs(b.value); }, 0))) * 100),
          Math.abs(data[li0].value),
          (config.pieLabelContent || "label-pct"),
          rs,
          config.numFmt
        );
        if (lt.length > maxLabelChars) maxLabelChars = lt.length;
      }
      // Use a conservative width estimate, BUT cap labelMargin at 28% of
      // svgW so the donut doesn't shrink to the point of being unreadable.
      // Long labels that don't fit are wrapped onto multiple lines below.
      var estTextW = Math.ceil(maxLabelChars * labelSizeApprox * 0.62);
      var leaderSpace = 14 + 8 + 4 + 6;
      var needed = estTextW + leaderSpace;
      var minMargin = Math.min(svgW * 0.16, 45);
      var maxMargin = svgW * 0.28;
      labelMargin = Math.max(minMargin, Math.min(needed, maxMargin));
    }

    var chartArea = svgW - labelMargin * 2;
    var outerR = Math.min(chartArea, 300) / 2 - 10;
    var innerR = outerR * ((config.donutHole || 60) / 100);
    var cx = svgW / 2;
    var cy = plotTop + outerR + 10;

    var total = 0;
    for (var i = 0; i < data.length; i++) total += Math.abs(data[i].value);
    if (total === 0) total = 1;

    var labelSize = Math.max(7, rs.labelSize - 1);
    var leaderRadius = outerR + 14;
    var elbowLen = 8;

    var svg = [];
    // Start at 0° — polarToCartesian already subtracts 90° internally,
    // so 0° maps to 12 o'clock (top center).
    var startAngle = 0;
    var sliceMids = [];

    for (var j = 0; j < data.length; j++) {
      var absVal = Math.abs(data[j].value);
      var sliceAngle = (absVal / total) * 360;
      var endAngle = startAngle + sliceAngle;
      var midAngle = startAngle + sliceAngle / 2;
      var pct = Math.round((absVal / total) * 100);
      sliceMids.push({
        midAngle: midAngle, pct: pct, label: data[j].label, absVal: absVal,
        sliceAngle: sliceAngle, startAngle: startAngle, endAngle: endAngle
      });
      startAngle = endAngle;
    }

    // Determine inside vs outside labels
    var outsideItems = [];
    var insideItems = [];

    if (labelMode !== "none") {
      var midR = (outerR + innerR) / 2;
      for (var k = 0; k < sliceMids.length; k++) {
        var sm = sliceMids[k];
        if (sm.pct < 1) continue;

        var placeInside = false;
        if (labelMode === "inside") {
          placeInside = true;
        } else if (labelMode === "auto") {
          // Donut ring is narrow — need a wider slice than pie to fit text inside.
          // Check both angle threshold and estimated text width vs arc length.
          var arcLen = (sm.sliceAngle / 360) * 2 * Math.PI * midR;
          var lText = R.buildPieLabelText(sm.label, sm.pct, sm.absVal, labelContent, rs, config.numFmt);
          var estTextW = lText.length * labelSize * 0.55;
          placeInside = sm.sliceAngle > 70 && estTextW < arcLen * 0.9;
        }

        if (placeInside) {
          insideItems.push(sm);
        } else {
          var leaderPt = R.polarToCartesian(cx, cy, leaderRadius, sm.midAngle);
          var isRight = (sm.midAngle >= 0 && sm.midAngle < 180);
          outsideItems.push({
            midAngle: sm.midAngle, pct: sm.pct, label: sm.label, absVal: sm.absVal,
            y: leaderPt.y, origY: leaderPt.y,
            leaderPtX: leaderPt.x, leaderPtY: leaderPt.y,
            isRight: isRight
          });
        }
      }
    }

    R.resolveOverlaps(outsideItems, labelSize + 4);

    var maxLabelY = cy + outerR + 20;
    for (var li = 0; li < outsideItems.length; li++) {
      if (outsideItems[li].y + labelSize > maxLabelY) maxLabelY = outsideItems[li].y + labelSize;
    }

    var footerStartY = maxLabelY + 10;
    var footer = R.renderFooter({
      x: 10, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var svgH = config.height || (footerStartY + footer.height + rs.marginBottom);

    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));
    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    // Draw slices
    for (var s = 0; s < sliceMids.length; s++) {
      var sl = sliceMids[s];
      if (data.length === 1 || sl.sliceAngle >= 359.99) {
        svg.push('  <circle cx="' + cx + '" cy="' + cy + '" r="' + outerR +
          '" fill="' + donutColor + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>');
      } else {
        var d = R.describeDonutArc(cx, cy, outerR, innerR, sl.startAngle, sl.endAngle);
        svg.push('  <path d="' + d + '" fill="' + donutColor + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>');
      }
    }

    // White center circle (drawn once after all slices)
    svg.push('  <circle cx="' + cx + '" cy="' + cy + '" r="' + innerR + '" fill="#ffffff"/>');

    // Center text
    var centerTitle = config.donutCenterTitle || "";
    var centerLabel = config.donutCenterLabel || "";

    if (centerTitle || centerLabel) {
      var cTitleSize = Math.max(10, rs.labelSize + 3);
      var cLabelSize = Math.max(9, rs.labelSize + 1);

      if (centerTitle && centerLabel) {
        svg.push('  <text x="' + cx + '" y="' + (cy - 4) +
          '" font-family="' + fonts.heading + '" font-size="' + cTitleSize +
          '" font-weight="bold" fill="' + st.valueColor + '" text-anchor="middle">' +
          R.escapeXml(centerTitle) + '</text>');
        svg.push('  <text x="' + cx + '" y="' + (cy + cLabelSize + 2) +
          '" font-family="' + fonts.value + '" font-size="' + cLabelSize +
          '" fill="' + st.labelColor + '" text-anchor="middle">' +
          R.escapeXml(centerLabel) + '</text>');
      } else if (centerTitle) {
        svg.push('  <text x="' + cx + '" y="' + (cy + cTitleSize * 0.35) +
          '" font-family="' + fonts.heading + '" font-size="' + cTitleSize +
          '" font-weight="bold" fill="' + st.valueColor + '" text-anchor="middle">' +
          R.escapeXml(centerTitle) + '</text>');
      } else {
        svg.push('  <text x="' + cx + '" y="' + (cy + cLabelSize * 0.35) +
          '" font-family="' + fonts.value + '" font-size="' + cLabelSize +
          '" fill="' + st.labelColor + '" text-anchor="middle">' +
          R.escapeXml(centerLabel) + '</text>');
      }
    } else {
      var defTitleSize = Math.max(10, rs.labelSize + 3);
      var defValueSize = Math.max(9, rs.labelSize + 1);
      svg.push('  <text x="' + cx + '" y="' + (cy - 4) +
        '" font-family="' + fonts.heading + '" font-size="' + defTitleSize +
        '" font-weight="bold" fill="' + st.valueColor + '" text-anchor="middle">Total</text>');
      svg.push('  <text x="' + cx + '" y="' + (cy + defValueSize + 2) +
        '" font-family="' + fonts.value + '" font-size="' + defValueSize +
        '" fill="' + st.labelColor + '" text-anchor="middle">' + R.formatNumber(total, config.numFmt) + '</text>');
    }

    // Inside labels (placed between inner and outer radius)
    for (var ins = 0; ins < insideItems.length; ins++) {
      var inItem = insideItems[ins];
      var midR = (outerR + innerR) / 2;
      var inPt = R.polarToCartesian(cx, cy, midR, inItem.midAngle);
      var inText = R.buildPieLabelText(inItem.label, inItem.pct, inItem.absVal, labelContent, rs, config.numFmt);
      svg.push('  <text x="' + inPt.x.toFixed(1) + '" y="' + (inPt.y + labelSize * 0.35).toFixed(1) +
        '" font-family="' + fonts.label + '" font-size="' + labelSize +
        '" fill="#ffffff" text-anchor="middle" font-weight="bold">' +
        R.escapeXml(inText) + '</text>');
    }

    // ── FORK PATCH (online tool): wrap long labels onto up to 3 lines so
    // they fit within the available horizontal margin instead of getting
    // visually cropped.
    var MAX_LABEL_LINES = 3;
    for (var m = 0; m < outsideItems.length; m++) {
      var item = outsideItems[m];
      var labelText = R.buildPieLabelText(item.label, item.pct, item.absVal, labelContent, rs, config.numFmt);

      var edgePt = R.polarToCartesian(cx, cy, outerR + 2, item.midAngle);
      var anchor = item.isRight ? "start" : "end";
      var elbowX = item.isRight ? item.leaderPtX + elbowLen : item.leaderPtX - elbowLen;

      if (showLeaders) {
        svg.push('  <polyline points="' +
          edgePt.x.toFixed(1) + ',' + edgePt.y.toFixed(1) + ' ' +
          item.leaderPtX.toFixed(1) + ',' + item.leaderPtY.toFixed(1) + ' ' +
          item.leaderPtX.toFixed(1) + ',' + item.y.toFixed(1) + ' ' +
          elbowX.toFixed(1) + ',' + item.y.toFixed(1) +
          '" fill="none" stroke="#999999" stroke-width="1" opacity="0.5"/>');
      }

      var textX = item.isRight ? elbowX + 4 : elbowX - 4;
      // Available width for the label text — from textX to the SVG edge,
      // with an 8px safety buffer for character-width estimation slop.
      var availWidth = item.isRight ? (svgW - textX - 8) : (textX - 8);
      if (availWidth < 30) availWidth = 30;

      // Wrap the label into up to MAX_LABEL_LINES lines.
      // charFactor 0.62 is a reasonable estimate for Roboto / Roboto Condensed.
      var allLines = R.wrapText(labelText, labelSize, availWidth, 0.62);
      var lines = allLines.slice(0, MAX_LABEL_LINES);
      // If we had to truncate, add an ellipsis to the last line.
      if (allLines.length > MAX_LABEL_LINES && lines.length > 0) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "…");
      }

      var lineH = Math.round(labelSize * 1.15);
      // Vertically center the wrapped block on item.y.
      var firstY = item.y - ((lines.length - 1) * lineH) / 2 + labelSize * 0.35;

      var tspans = "";
      for (var ln = 0; ln < lines.length; ln++) {
        tspans += '<tspan x="' + textX.toFixed(1) + '" dy="' +
          (ln === 0 ? 0 : lineH) + '">' + R.escapeXml(lines[ln]) + '</tspan>';
      }
      svg.push('  <text x="' + textX.toFixed(1) + '" y="' + firstY.toFixed(1) +
        '" font-family="' + fonts.label + '" font-size="' + labelSize +
        '" fill="' + st.labelColor + '" text-anchor="' + anchor + '">' +
        tspans + '</text>');
    }

    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);
    svg.push('</svg>');
    return svg.join("\n");
  }

  R.register("donut", "Donut Chart", render);
})();
