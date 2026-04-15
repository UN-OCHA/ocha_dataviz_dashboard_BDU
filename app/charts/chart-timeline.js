/**
 * Timeline Chart Renderer — v0.3 (horizontal + vertical)
 *
 * Renders a sequence of events along a line. Each event has:
 *   - date (free text, e.g. "Jan 2024", "2024-01-15", "Q1 2024")
 *   - label (key figure or headline, e.g. "2.3M")
 *   - text (description)
 *   - iconRef (optional) → resolved by ChartBuilder to _iconSvg
 *
 * Orientation:
 *   - horizontal: events left to right on one line
 *     → auto-folds into S-shape when events > S_SHAPE_THRESHOLD (Phase 5)
 *   - vertical: events top to bottom on a vertical line
 *     → icon + date on the left of the dot, label + description on the right
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;

  // Default minimum column width per event (in SVG units). When an event's
  // block would be narrower than this, the horizontal timeline auto-folds
  // into a serpentine S-shape with the appropriate number of rows.
  // User-overridable via `config.timelineEventSpacing` (a px slider).
  var DEFAULT_EVENT_SPACING = 90;

  // ── Shared helpers ──────────────────────────────────────

  function computeFonts(rs) {
    return {
      dateSize:  rs.labelSize,
      labelSize: Math.round(rs.valueSize * 1.4),
      descSize:  Math.round(rs.labelSize * 0.9)
    };
  }

  function dotRadius(svgW) {
    if (svgW >= 600) return 6;
    if (svgW >= 400) return 5;
    return 4;
  }

  function hasAnyIcon(data) {
    for (var i = 0; i < data.length; i++) {
      if (data[i]._iconSvg) return true;
    }
    return false;
  }

  // Draw one event block centered on (cx, lineY).
  //
  // New layout (requested): dates sit BELOW the dot, everything else above.
  //
  //   icon        (optional, top)
  //   description (wrapped)
  //   LABEL       (bold)
  //   ──●──       (line with dot)
  //   date        (below dot)
  //
  // Shared between single-row horizontal and S-shape renderers.
  function drawHorizontalEvent(body, ev, descLines, cx, lineY, style) {
    var f = style.f, fonts = style.fonts, st = style.st;
    var iconH = style.iconH, iconGap = style.iconGap, dateGap = style.dateGap;
    var labelGap = style.labelGap, descGap = style.descGap, lineHDesc = style.lineHDesc;
    var iconColor = style.iconColor, lineColor = style.lineColor;
    var strokeW = style.strokeW, dotR = style.dotR, anyIcon = style.anyIcon;

    // ── Above the line (content) ──
    //
    // Bottom-up: label just above the line, then description above label,
    // then icon at the top.

    // Label baseline just above the line
    if (ev.label) {
      var lblBaselineY = lineY - labelGap;
      body.push('    <text x="' + cx.toFixed(1) + '" y="' + lblBaselineY.toFixed(1) +
        '" font-family="' + fonts.value + '" font-weight="700" font-size="' + f.labelSize +
        '" fill="' + st.valueColor + '" text-anchor="middle">' +
        R.escapeXml(R.truncate(ev.label, 16)) + '</text>');
    }

    // Description (wrapped) above label. Lines stack upward from just above the label.
    if (descLines && descLines.length) {
      var descBottomBaselineY = lineY - labelGap - f.labelSize - descGap;
      // Last line sits at descBottomBaselineY; previous lines above it.
      for (var dl = 0; dl < descLines.length; dl++) {
        var lineIdxFromBottom = descLines.length - 1 - dl;
        var dy = descBottomBaselineY - lineIdxFromBottom * lineHDesc;
        body.push('    <text x="' + cx.toFixed(1) + '" y="' + dy.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + f.descSize +
          '" fill="' + st.labelColor + '" text-anchor="middle">' +
          R.escapeXml(descLines[dl]) + '</text>');
      }
    }

    // Icon at the top of the stack (above description)
    if (anyIcon && ev._iconSvg) {
      var descTotalH = (descLines ? descLines.length : 0) * lineHDesc;
      // Top of description block (or top of label if no description)
      var contentTopY;
      if (descLines && descLines.length) {
        // Top of the highest description line = its baseline - descSize
        contentTopY = lineY - labelGap - f.labelSize - descGap - descTotalH;
      } else if (ev.label) {
        contentTopY = lineY - labelGap - f.labelSize;
      } else {
        contentTopY = lineY;
      }
      var dims = R.getIconDims(ev._iconSvg, iconH, 1.0);
      var icoX = cx - dims.w / 2;
      var icoY = contentTopY - iconGap - iconH;
      body.push('    ' + R.buildIconGroup(ev._iconSvg, iconH, icoX, icoY, iconColor, 1.0));
    }

    // ── On the line: the dot ──
    body.push('    <circle cx="' + cx.toFixed(1) + '" cy="' + lineY.toFixed(1) +
      '" r="' + dotR + '" fill="#ffffff" stroke="' + lineColor +
      '" stroke-width="' + (strokeW * 0.9).toFixed(1) + '"/>');

    // ── Below the line: date ──
    if (ev.date) {
      var dateBaselineY = lineY + dateGap + f.dateSize;
      body.push('    <text x="' + cx.toFixed(1) + '" y="' + dateBaselineY.toFixed(1) +
        '" font-family="' + fonts.label + '" font-size="' + f.dateSize +
        '" fill="' + st.labelColor + '" text-anchor="middle">' +
        R.escapeXml(R.truncate(ev.date, 24)) + '</text>');
    }
  }

  // ── Horizontal layout ───────────────────────────────────

  function renderHorizontal(data, ctx, config) {
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;
    var f = computeFonts(rs);
    var n = data.length;

    // Events per row given the available plot width and the event spacing.
    // If all events fit on one row → straight horizontal; otherwise → serpentine S.
    var eventSpacing = Math.max(60, config.timelineEventSpacing || DEFAULT_EVENT_SPACING);
    var availableW = svgW - rs.marginLeft - rs.marginRight;
    var maxPerRow = Math.max(1, Math.floor(availableW / eventSpacing));
    if (n > maxPerRow) {
      return renderSShape(data, ctx, config, maxPerRow);
    }

    var marginLeft = rs.marginLeft;
    var marginRight = rs.marginRight;

    // Header
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: ctx.title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var plotTop = header.height || (rs.marginTop + 4);
    var plotWidth = svgW - marginLeft - marginRight;
    // Column width is the greater of user's requested spacing and an even split.
    var colW = Math.max(eventSpacing, plotWidth / n);
    // If spacing is tight we pack events but still constrain to plotWidth.
    var totalW = colW * n;
    if (totalW > plotWidth) colW = plotWidth / n;

    var anyIcon = hasAnyIcon(data);
    var iconH = anyIcon ? Math.round(rs.valueSize * 1.8) : 0;
    var iconGap = anyIcon ? 5 : 0;
    var dateGap = 6;
    var labelGap = 10;
    var descGap = 4;
    var lineHDesc = f.descSize * 1.2;

    // Wrap descriptions against the usable column width.
    var descMaxW = Math.max(40, colW - 8);
    var wrappedDescs = [];
    var maxDescLines = 0;
    for (var wi = 0; wi < n; wi++) {
      var lines = data[wi].text ? R.wrapText(data[wi].text, f.descSize, descMaxW, 0.55) : [];
      if (lines.length > 4) lines = lines.slice(0, 4);
      wrappedDescs.push(lines);
      if (lines.length > maxDescLines) maxDescLines = lines.length;
    }
    var descBlockH = maxDescLines * lineHDesc;

    // Above the line: icon + description block + label + gap before line
    var aboveLineH = iconH + (anyIcon ? iconGap : 0) + descBlockH + (descBlockH > 0 ? descGap : 0) + f.labelSize + labelGap;
    // Below the line: date + small pad
    var belowLineH = dateGap + f.dateSize + 4;
    var plotHeight = aboveLineH + belowLineH;

    var lineY = aboveLineH;

    // Footer
    var footerStartY = plotTop + plotHeight + 20;
    var footer = R.renderFooter({
      x: marginLeft, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });
    var svgH = config.height || (footerStartY + footer.height);

    var lineColor = (config.colors && config.colors[0]) || "#009EDB";
    var iconColor = config.rowIconColor || lineColor;
    var strokeW = rs.strokeWidth;
    var dotR = dotRadius(svgW);

    var style = {
      f: f, fonts: fonts, st: st,
      iconH: iconH, iconGap: iconGap, dateGap: dateGap,
      labelGap: labelGap, descGap: descGap, lineHDesc: lineHDesc,
      iconColor: iconColor, lineColor: lineColor,
      strokeW: strokeW, dotR: dotR, anyIcon: anyIcon
    };

    var body = [];
    body.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    // Center the row in the available plot width
    var rowW = colW * n;
    var xOffset = (plotWidth - rowW) / 2;

    function cx(i) { return xOffset + (i + 0.5) * colW; }

    // Main horizontal line
    var firstCx = cx(0);
    var lastCx  = cx(n - 1);
    if (n === 1) { firstCx = lastCx = plotWidth / 2; }
    body.push('    <line x1="' + firstCx.toFixed(1) + '" y1="' + lineY.toFixed(1) +
      '" x2="' + lastCx.toFixed(1) + '" y2="' + lineY.toFixed(1) +
      '" stroke="' + lineColor + '" stroke-width="' + strokeW +
      '" stroke-linecap="round"/>');

    for (var i = 0; i < n; i++) {
      var xc = n > 1 ? cx(i) : plotWidth / 2;
      drawHorizontalEvent(body, data[i], wrappedDescs[i], xc, lineY, style);
    }

    body.push('  </g>');
    return R.wrapSVG(svgW, svgH, header, footer, body);
  }

  // ── S-shape layout (serpentine, N rows, semicircle corners) ────
  //
  // When a horizontal timeline has more events than fit on one row at
  // MIN_EVENT_WIDTH, it folds into a snake pattern:
  //   Row 0: L → R
  //   Row 1: R → L   (connected by 180° arc bulging right)
  //   Row 2: L → R   (connected by 180° arc bulging left)
  //   Row 3: R → L   ...
  //
  // Each corner is a true semicircle (rx = ry = rowGapY/2) rendered as
  // a single SVG `A` command. The whole snake is one `<path>` so AI
  // imports it as one editable curve.

  function renderSShape(data, ctx, config, eventsPerRow) {
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;
    var f = computeFonts(rs);
    var n = data.length;
    var k = eventsPerRow;               // events per full row
    var rows = Math.ceil(n / k);        // total number of rows

    var marginLeft = rs.marginLeft;
    var marginRight = rs.marginRight;

    // Header
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: ctx.title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });
    var plotTop = header.height || (rs.marginTop + 4);

    var plotWidth = svgW - marginLeft - marginRight;

    var anyIcon = hasAnyIcon(data);
    var iconH = anyIcon ? Math.round(rs.valueSize * 1.8) : 0;
    var iconGap = anyIcon ? 5 : 0;
    var dateGap = 6;
    var labelGap = 10;
    var descGap = 4;
    var lineHDesc = f.descSize * 1.2;

    // Helper: wrap all descriptions against a given column width.
    function wrapAll(w) {
      var out = [];
      var maxLines = 0;
      for (var wi = 0; wi < n; wi++) {
        var lines = data[wi].text ? R.wrapText(data[wi].text, f.descSize, Math.max(40, w - 8), 0.55) : [];
        if (lines.length > 4) lines = lines.slice(0, 4);
        out.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      }
      return { lines: out, maxLines: maxLines };
    }

    function rowBlockFor(descBlockH) {
      var aboveH = iconH + (anyIcon ? iconGap : 0) + descBlockH + (descBlockH > 0 ? descGap : 0) + f.labelSize + labelGap;
      var belowH = dateGap + f.dateSize + 4;
      return { above: aboveH, below: belowH, total: aboveH + belowH };
    }

    // Provisional layout pass: no arc margin yet
    var colW = plotWidth / k;
    var wrappedProv = wrapAll(colW);
    var descBlockH = wrappedProv.maxLines * lineHDesc;
    var rb = rowBlockFor(descBlockH);
    var rowBlockH = rb.total;
    var aboveLineH = rb.above;

    // Arc radius = half the row gap. Tighter than before (was 35% of rowBlockH).
    var rowGapY = Math.max(36, Math.round(rowBlockH * 0.25));
    var arcRadius = rowGapY / 2;

    // Refine: subtract arc budget from plot width and re-wrap.
    var eventsPlotW = plotWidth - arcRadius * 2;
    colW = eventsPlotW / k;
    var wrapped = wrapAll(colW);
    descBlockH = wrapped.maxLines * lineHDesc;
    rb = rowBlockFor(descBlockH);
    rowBlockH = rb.total;
    aboveLineH = rb.above;
    rowGapY = Math.max(36, Math.round(rowBlockH * 0.25));
    arcRadius = rowGapY / 2;
    eventsPlotW = plotWidth - arcRadius * 2;
    colW = eventsPlotW / k;

    // Row line y-positions
    var rowYs = [];
    var plotHeight = 0;
    for (var ri = 0; ri < rows; ri++) {
      rowYs.push(plotHeight + aboveLineH);
      plotHeight += rowBlockH;
      if (ri < rows - 1) plotHeight += rowGapY;
    }

    // Footer
    var footerStartY = plotTop + plotHeight + 20;
    var footer = R.renderFooter({
      x: marginLeft, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });
    var svgH = config.height || (footerStartY + footer.height);

    var lineColor = (config.colors && config.colors[0]) || "#009EDB";
    var iconColor = config.rowIconColor || lineColor;
    var strokeW = rs.strokeWidth;
    var dotR = dotRadius(svgW);

    var style = {
      f: f, fonts: fonts, st: st,
      iconH: iconH, iconGap: iconGap, dateGap: dateGap,
      labelGap: labelGap, descGap: descGap, lineHDesc: lineHDesc,
      iconColor: iconColor, lineColor: lineColor,
      strokeW: strokeW, dotR: dotR, anyIcon: anyIcon
    };

    // Column x-center helper
    function cellCx(col) { return arcRadius + (col + 0.5) * colW; }

    // Map global event index → visual {row, col}.
    // Even rows are left-aligned (L→R). Odd rows are right-aligned (R→L).
    // This keeps all arcs as clean vertical semicircles — even when the
    // final row is partial, arcs always land where an event exists.
    function eventPos(i) {
      var row = Math.floor(i / k);
      var localIdx = i - row * k;
      var rowEvents = Math.min(k, n - row * k);
      var col;
      if (row % 2 === 0) {
        col = localIdx;                // L→R, left-aligned
      } else {
        col = (k - 1) - localIdx;      // R→L, right-aligned
      }
      return { row: row, col: col, rowEvents: rowEvents };
    }

    // Build snake path: each row's line segment + semicircle arc to next row.
    // Even rows span cellCx(0) → cellCx(rowEvents-1).
    // Odd rows span cellCx(k-1) → cellCx(k-rowEvents).
    var dseg = [];
    for (var r = 0; r < rows; r++) {
      var rowEvents = (r === rows - 1) ? (n - r * k) : k;
      var y = rowYs[r];
      var rowStartX, rowEndX;
      if (r % 2 === 0) {
        rowStartX = cellCx(0);
        rowEndX   = cellCx(rowEvents - 1);
      } else {
        rowStartX = cellCx(k - 1);
        rowEndX   = cellCx(k - rowEvents);
      }

      if (r === 0) {
        dseg.push("M" + rowStartX.toFixed(1) + "," + y.toFixed(1));
      }
      dseg.push("L" + rowEndX.toFixed(1) + "," + y.toFixed(1));

      if (r < rows - 1) {
        var nextY = rowYs[r + 1];
        if (r % 2 === 0) {
          // Right-bulge semicircle: (rightCx, y) → (rightCx, nextY). sweep=1 (CW).
          var rightX = cellCx(k - 1);
          dseg.push("A" + arcRadius.toFixed(1) + "," + arcRadius.toFixed(1) +
            " 0 0 1 " + rightX.toFixed(1) + "," + nextY.toFixed(1));
        } else {
          // Left-bulge semicircle: (leftCx, y) → (leftCx, nextY). sweep=0 (CCW).
          var leftX = cellCx(0);
          dseg.push("A" + arcRadius.toFixed(1) + "," + arcRadius.toFixed(1) +
            " 0 0 0 " + leftX.toFixed(1) + "," + nextY.toFixed(1));
        }
      }
    }

    var body = [];
    body.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');
    body.push('    <path d="' + dseg.join(" ") + '" fill="none" stroke="' + lineColor +
      '" stroke-width="' + strokeW + '" stroke-linecap="round" stroke-linejoin="round"/>');

    // Events on top
    for (var i = 0; i < n; i++) {
      var pos = eventPos(i);
      drawHorizontalEvent(body, data[i], wrapped.lines[i], cellCx(pos.col), rowYs[pos.row], style);
    }

    body.push('  </g>');
    return R.wrapSVG(svgW, svgH, header, footer, body);
  }

  // ── Vertical layout ─────────────────────────────────────
  //
  // Layout (per event):
  //
  //   icon    │     LABEL (bold)
  //   date    ●     description (wrapped)
  //           │
  //
  // Line runs top-to-bottom through the dots. Left column holds
  // icon + date, right column holds label + description.

  function renderVertical(data, ctx, config) {
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;
    var f = computeFonts(rs);
    var n = data.length;

    var marginLeft = rs.marginLeft;
    var marginRight = rs.marginRight;

    // Header
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: ctx.title, subtitle: config.subtitle, comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var plotTop = header.height || (rs.marginTop + 4);
    var plotWidth = svgW - marginLeft - marginRight;

    // Layout columns: leftCol (icon + date) | gutter | rightCol (label + description)
    // Line runs through the vertical divider between left and right (near ~35% mark).
    var leftColW = Math.max(60, Math.round(plotWidth * 0.30));
    var gutter   = 16;           // space reserved for the line + dot
    var rightColX = leftColW + gutter;
    var rightColW = plotWidth - rightColX;
    var lineX = leftColW + gutter / 2;

    var anyIcon = hasAnyIcon(data);
    var iconH = anyIcon ? Math.round(rs.valueSize * 1.8) : 0;

    // Per-event row height: max of (icon + date) left and (label + wrapped desc) right.
    var lineHDesc = f.descSize * 1.2;
    var rowGapY = 22; // breathing space between events

    // Wrap descriptions against the right column width
    var wrappedDescs = [];
    var rowHeights = [];
    for (var wi = 0; wi < n; wi++) {
      var lines = data[wi].text ? R.wrapText(data[wi].text, f.descSize, rightColW - 8, 0.55) : [];
      if (lines.length > 6) lines = lines.slice(0, 6);
      wrappedDescs.push(lines);

      var rightH = (data[wi].label ? f.labelSize + 4 : 0) + lines.length * lineHDesc;
      var leftH = (anyIcon && data[wi]._iconSvg ? iconH + 4 : 0) + (data[wi].date ? f.dateSize : 0);
      var h = Math.max(rightH, leftH, 30);
      rowHeights.push(h);
    }

    // Total plot height = sum of row heights + gaps
    var plotHeight = 0;
    for (var ri = 0; ri < n; ri++) {
      plotHeight += rowHeights[ri];
      if (ri < n - 1) plotHeight += rowGapY;
    }

    // Footer
    var footerStartY = plotTop + plotHeight + 20;
    var footer = R.renderFooter({
      x: marginLeft, startY: footerStartY,
      footer: config.footer, rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });
    var svgH = config.height || (footerStartY + footer.height);

    var lineColor = (config.colors && config.colors[0]) || "#009EDB";
    var iconColor = config.rowIconColor || lineColor;
    var strokeW = rs.strokeWidth;
    var dotR = dotRadius(svgW);

    var body = [];
    body.push('  <g transform="translate(' + marginLeft + ',' + plotTop + ')">');

    // Main vertical line (from first dot to last dot)
    // Dot sits at y = <center of each row>.
    var dotYs = [];
    var y = 0;
    for (var ci = 0; ci < n; ci++) {
      dotYs.push(y + rowHeights[ci] / 2);
      y += rowHeights[ci] + rowGapY;
    }

    if (n > 1) {
      body.push('    <line x1="' + lineX.toFixed(1) + '" y1="' + dotYs[0].toFixed(1) +
        '" x2="' + lineX.toFixed(1) + '" y2="' + dotYs[n - 1].toFixed(1) +
        '" stroke="' + lineColor + '" stroke-width="' + strokeW +
        '" stroke-linecap="round"/>');
    }

    for (var i = 0; i < n; i++) {
      var ev = data[i];
      var dy = dotYs[i];

      // --- Left column: icon (top) then date (below it, both right-aligned near the line) ---
      var leftTextX = leftColW; // right-align against end of left column, 8px before line
      var leftAnchor = "end";
      var leftGapFromLine = 10;
      var leftRightEdge = lineX - leftGapFromLine;

      var leftY = dy; // vertical center of row

      // Stack icon above date: compute individual baselines
      var hasIcon = anyIcon && ev._iconSvg;
      var hasDate = !!ev.date;

      if (hasIcon) {
        var dims = R.getIconDims(ev._iconSvg, iconH, false);
        var icoX = leftRightEdge - dims.w;
        var icoY = leftY - (hasDate ? (iconH + 4 + f.dateSize / 2) : iconH / 2);
        // If only icon, center vertically on dot
        body.push('    ' + R.buildIconGroup(ev._iconSvg, iconH, icoX, icoY, iconColor, false));
      }

      if (hasDate) {
        var dateBaselineY;
        if (hasIcon) {
          // Date baseline sits below icon
          dateBaselineY = leftY + (iconH / 2) - 2;
        } else {
          // Only date — center it on the dot line
          dateBaselineY = leftY + f.dateSize / 2 - 1;
        }
        body.push('    <text x="' + leftRightEdge.toFixed(1) + '" y="' + dateBaselineY.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + f.dateSize +
          '" fill="' + st.labelColor + '" text-anchor="' + leftAnchor + '">' +
          R.escapeXml(R.truncate(ev.date, 24)) + '</text>');
      }

      // --- Dot on the line ---
      body.push('    <circle cx="' + lineX.toFixed(1) + '" cy="' + dy.toFixed(1) +
        '" r="' + dotR + '" fill="#ffffff" stroke="' + lineColor +
        '" stroke-width="' + (strokeW * 0.9).toFixed(1) + '"/>');

      // --- Right column: label then description ---
      var rx = rightColX;
      var rightTopY = dy - rowHeights[i] / 2;
      var rAnchor = "start";

      var cursorY = rightTopY + f.labelSize; // first baseline
      if (ev.label) {
        body.push('    <text x="' + rx.toFixed(1) + '" y="' + cursorY.toFixed(1) +
          '" font-family="' + fonts.value + '" font-weight="700" font-size="' + f.labelSize +
          '" fill="' + st.valueColor + '" text-anchor="' + rAnchor + '">' +
          R.escapeXml(R.truncate(ev.label, 40)) + '</text>');
        cursorY += 4; // small gap before description
      }

      var descLines = wrappedDescs[i];
      if (descLines && descLines.length) {
        var dYstart = cursorY + f.descSize;
        for (var dl = 0; dl < descLines.length; dl++) {
          body.push('    <text x="' + rx.toFixed(1) + '" y="' + (dYstart + dl * lineHDesc).toFixed(1) +
            '" font-family="' + fonts.label + '" font-size="' + f.descSize +
            '" fill="' + st.labelColor + '" text-anchor="' + rAnchor + '">' +
            R.escapeXml(descLines[dl]) + '</text>');
        }
      }
    }

    body.push('  </g>');
    return R.wrapSVG(svgW, svgH, header, footer, body);
  }

  // ── Entry point ─────────────────────────────────────────

  function render(title, data, config) {
    if (!data || !data.length) return null;

    var ctx = R.initRender(config);
    ctx.title = title;

    var orient = config.timelineOrientation || "horizontal";

    if (orient === "vertical") {
      return renderVertical(data, ctx, config);
    }
    // default: horizontal
    return renderHorizontal(data, ctx, config);
  }

  R.register("timeline", "Timeline", render);
})();
