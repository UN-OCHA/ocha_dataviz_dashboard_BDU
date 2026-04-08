/* ──────────────────────────────────────────────────────────────────
 * TEMPORARY FORK from ocha_dataviz_plugin v2026.0.2 (Phase 1 beta).
 * This file will be consolidated into ../shared/ during Phase 0 once
 * the online tool is validated. If you fix a bug here, apply the
 * same fix to the plugin copy in ocha_dataviz_plugin/client/.
 * ────────────────────────────────────────────────────────────────── */

/**
 * Sankey Diagram Renderer — v1.0
 *
 * Renders a Sankey flow diagram showing connections between nodes.
 * Data: 3-column rows — Source, Target, Value.
 * Auto-detects multi-level flows (A->B->C) by layering nodes.
 * Uses shared header/footer, responsive system, and style palettes.
 */

/* global ChartRegistry */

(function () {
  "use strict";

  var R = ChartRegistry;

  function render(title, data, config) {
    if (!data || !data.length) return null;

    config = config || {};
    var ctx = R.initRender(config);
    var svgW = ctx.svgW, rs = ctx.rs, vPad = ctx.vPad, st = ctx.st, fonts = ctx.fonts;

    var colors = config.colors || ["#009EDB"];
    var nodeWidth = config.sankeyNodeWidth || 20;
    var nodePadding = config.sankeyNodePadding || 15;
    var linkOpacity = (config.sankeyLinkOpacity != null ? config.sankeyLinkOpacity : 0.4);
    var labelMode = config.sankeyLabelMode || "both";

    var marginLeft = 10;
    var marginRight = 10;

    // ── Header ────────────────────────────────────────
    var header = R.renderHeader({
      x: marginLeft, startY: 6,
      title: title,
      subtitle: config.subtitle,
      comments: config.comments,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var chartTop = header.height || (rs.marginTop + 4);

    // ── Parse data: build nodes and links ─────────────
    var nodeMap = {}; // name -> { name, incoming: num, outgoing: num, index }
    var links = [];
    var nodeIndex = 0;

    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      if (!nodeMap[d.source]) {
        nodeMap[d.source] = { name: d.source, incoming: 0, outgoing: 0, index: nodeIndex++ };
      }
      if (!nodeMap[d.target]) {
        nodeMap[d.target] = { name: d.target, incoming: 0, outgoing: 0, index: nodeIndex++ };
      }
      nodeMap[d.source].outgoing += d.value;
      nodeMap[d.target].incoming += d.value;
      links.push({ source: d.source, target: d.target, value: d.value });
    }

    // Build node list
    var nodes = [];
    for (var name in nodeMap) {
      if (nodeMap.hasOwnProperty(name)) {
        var n = nodeMap[name];
        n.totalFlow = Math.max(n.incoming, n.outgoing);
        nodes.push(n);
      }
    }

    // ── Assign levels via BFS ─────────────────────────
    // Nodes with no incoming = level 0 (pure sources)
    // Others: level = max(upstream level) + 1
    var levelMap = {};
    var maxLevel = 0;

    // Build adjacency: source -> [target]
    var adj = {};
    for (var li = 0; li < links.length; li++) {
      if (!adj[links[li].source]) adj[links[li].source] = [];
      adj[links[li].source].push(links[li].target);
    }

    // Initial: pure sources at level 0
    var queue = [];
    for (var ni = 0; ni < nodes.length; ni++) {
      if (nodes[ni].incoming === 0) {
        levelMap[nodes[ni].name] = 0;
        queue.push(nodes[ni].name);
      }
    }

    // If no pure sources found (circular), assign all to level 0
    if (queue.length === 0) {
      for (var ci = 0; ci < nodes.length; ci++) {
        levelMap[nodes[ci].name] = 0;
        queue.push(nodes[ci].name);
      }
    }

    // BFS to assign levels
    var visited = {};
    while (queue.length > 0) {
      var current = queue.shift();
      if (visited[current]) continue;
      visited[current] = true;

      var targets = adj[current] || [];
      for (var ti = 0; ti < targets.length; ti++) {
        var tgt = targets[ti];
        var newLevel = (levelMap[current] || 0) + 1;
        if (levelMap[tgt] == null || newLevel > levelMap[tgt]) {
          levelMap[tgt] = newLevel;
        }
        if (newLevel > maxLevel) maxLevel = newLevel;
        queue.push(tgt);
      }
    }

    // Group nodes by level
    var levels = [];
    for (var lv = 0; lv <= maxLevel; lv++) levels.push([]);

    for (var gi = 0; gi < nodes.length; gi++) {
      var lvl = levelMap[nodes[gi].name] || 0;
      nodes[gi].level = lvl;
      levels[lvl].push(nodes[gi]);
    }

    // Sort nodes within each level by total flow (largest on top)
    for (var sl = 0; sl < levels.length; sl++) {
      levels[sl].sort(function (a, b) { return b.totalFlow - a.totalFlow; });
    }

    // ── Compute positions ─────────────────────────────
    var chartWidth = svgW - marginLeft - marginRight;
    var numLevels = levels.length;

    // Label measurement: estimate max label width for left and right columns
    var fontSize = rs.labelSize;
    var avgCharW = fontSize * 0.55;

    // Estimate label widths for left and right labels
    var leftLabelW = 0;
    var rightLabelW = 0;
    for (var eli = 0; eli < levels.length; eli++) {
      for (var eni = 0; eni < levels[eli].length; eni++) {
        var nd = levels[eli][eni];
        var lblText = buildLabelText(nd.name, nd.totalFlow, labelMode, config.numFmt);
        var lblW = lblText.length * avgCharW + 6;
        if (eli === 0) leftLabelW = Math.max(leftLabelW, lblW);
        if (eli === levels.length - 1) rightLabelW = Math.max(rightLabelW, lblW);
      }
    }

    // Diagram area: leave room for left and right labels
    var diagramLeft = Math.min(leftLabelW + 4, chartWidth * 0.25);
    var diagramRight = chartWidth - Math.min(rightLabelW + 4, chartWidth * 0.25);
    var diagramWidth = diagramRight - diagramLeft;

    // X positions for each level
    var levelX = [];
    if (numLevels === 1) {
      levelX.push(diagramLeft + diagramWidth / 2 - nodeWidth / 2);
    } else {
      for (var xi = 0; xi < numLevels; xi++) {
        levelX.push(diagramLeft + (xi / (numLevels - 1)) * (diagramWidth - nodeWidth));
      }
    }

    // Compute total flow across levels to determine chart height
    var maxLevelHeight = 0;
    for (var mli = 0; mli < levels.length; mli++) {
      var totalLevelFlow = 0;
      for (var mni = 0; mni < levels[mli].length; mni++) {
        totalLevelFlow += levels[mli][mni].totalFlow;
      }
      var levelH = totalLevelFlow + nodePadding * (levels[mli].length - 1);
      if (levelH > maxLevelHeight) maxLevelHeight = levelH;
    }

    // Scale factor: fit within available height
    var availableH = Math.max(120, rs.defaultPlotHeight * vPad);
    var scaleFactor = maxLevelHeight > 0 ? Math.min(availableH / maxLevelHeight, 3) : 1;

    // Position nodes vertically within each level
    var nodePositions = {}; // name -> { x, y, height }

    for (var pl = 0; pl < levels.length; pl++) {
      var colNodes = levels[pl];
      var totalH = 0;
      for (var pni = 0; pni < colNodes.length; pni++) {
        totalH += colNodes[pni].totalFlow * scaleFactor;
      }
      totalH += nodePadding * (colNodes.length - 1);

      var yStart = 0; // relative to chartTop
      for (var pn = 0; pn < colNodes.length; pn++) {
        var nh = colNodes[pn].totalFlow * scaleFactor;
        nodePositions[colNodes[pn].name] = {
          x: levelX[pl],
          y: yStart,
          height: Math.max(nh, 2)
        };
        yStart += nh + nodePadding;
      }
    }

    // ── Compute link paths (source/target port offsets) ──
    // Track how much of each node's height has been "used" for links
    var sourceOffsets = {};
    var targetOffsets = {};
    for (var oi = 0; oi < nodes.length; oi++) {
      sourceOffsets[nodes[oi].name] = 0;
      targetOffsets[nodes[oi].name] = 0;
    }

    // Sort links by value (largest first) for better visual layering
    links.sort(function (a, b) { return b.value - a.value; });

    var linkPaths = [];
    for (var lk = 0; lk < links.length; lk++) {
      var link = links[lk];
      var srcPos = nodePositions[link.source];
      var tgtPos = nodePositions[link.target];
      if (!srcPos || !tgtPos) continue;

      var srcNode = nodeMap[link.source];
      var tgtNode = nodeMap[link.target];

      // Link thickness proportional to value
      var linkH = (link.value / srcNode.totalFlow) * srcPos.height;
      var linkHtgt = (link.value / tgtNode.totalFlow) * tgtPos.height;

      // Source port: right edge
      var sx = srcPos.x + nodeWidth;
      var sy = srcPos.y + sourceOffsets[link.source];
      sourceOffsets[link.source] += linkH;

      // Target port: left edge
      var tx = tgtPos.x;
      var ty = tgtPos.y + targetOffsets[link.target];
      targetOffsets[link.target] += linkHtgt;

      // Cubic bezier control point at horizontal midpoint
      var mx = (sx + tx) / 2;

      linkPaths.push({
        source: link.source,
        target: link.target,
        value: link.value,
        sy: sy, sh: linkH,
        ty: ty, th: linkHtgt,
        sx: sx, tx: tx, mx: mx,
        sourceIndex: srcNode.index
      });
    }

    // ── Compute total chart height ────────────────────
    var maxNodeBottom = 0;
    for (var nbi in nodePositions) {
      if (nodePositions.hasOwnProperty(nbi)) {
        var bot = nodePositions[nbi].y + nodePositions[nbi].height;
        if (bot > maxNodeBottom) maxNodeBottom = bot;
      }
    }

    var chartH = maxNodeBottom + 10;

    // ── Footer ────────────────────────────────────────
    var footerStartY = chartTop + chartH;
    var footer = R.renderFooter({
      x: marginLeft, startY: footerStartY,
      footer: config.footer,
      rs: rs, style: st, vPad: vPad,
      maxWidth: svgW
    });

    var svgH = config.height || (footerStartY + footer.height + rs.marginBottom);

    // ── Build SVG ─────────────────────────────────────
    var svg = [];
    svg.push(R.svgOpen(svgW, svgH));
    svg.push(R.svgBg(svgW, svgH));

    // Header
    for (var hi = 0; hi < header.svg.length; hi++) svg.push(header.svg[hi]);

    // Chart group
    svg.push('  <g transform="translate(' + marginLeft + ',' + chartTop + ')">');

    // ── Draw links (behind nodes) ─────────────────────
    for (var di = 0; di < linkPaths.length; di++) {
      var lp = linkPaths[di];
      var colorIdx = lp.sourceIndex % colors.length;
      var linkColor = colors[colorIdx];

      // Cubic bezier path (filled band)
      var d = "M" + lp.sx.toFixed(1) + "," + lp.sy.toFixed(1) +
        " C" + lp.mx.toFixed(1) + "," + lp.sy.toFixed(1) +
        " " + lp.mx.toFixed(1) + "," + lp.ty.toFixed(1) +
        " " + lp.tx.toFixed(1) + "," + lp.ty.toFixed(1) +
        " L" + lp.tx.toFixed(1) + "," + (lp.ty + lp.th).toFixed(1) +
        " C" + lp.mx.toFixed(1) + "," + (lp.ty + lp.th).toFixed(1) +
        " " + lp.mx.toFixed(1) + "," + (lp.sy + lp.sh).toFixed(1) +
        " " + lp.sx.toFixed(1) + "," + (lp.sy + lp.sh).toFixed(1) +
        " Z";

      svg.push('    <path d="' + d + '" fill="' + linkColor +
        '" opacity="' + linkOpacity.toFixed(2) + '"/>');
    }

    // ── Draw nodes ────────────────────────────────────
    for (var ndi = 0; ndi < nodes.length; ndi++) {
      var node = nodes[ndi];
      var pos = nodePositions[node.name];
      if (!pos) continue;

      var cIdx = node.index % colors.length;
      var nodeColor = colors[cIdx];
      var nh = Math.max(pos.height, 2);

      svg.push('    <rect x="' + pos.x.toFixed(1) + '" y="' + pos.y.toFixed(1) +
        '" width="' + nodeWidth + '" height="' + nh.toFixed(1) +
        '" fill="' + nodeColor + '"/>');
    }

    // ── Draw labels ───────────────────────────────────
    if (labelMode !== "none") {
      for (var lb = 0; lb < nodes.length; lb++) {
        var lNode = nodes[lb];
        var lPos = nodePositions[lNode.name];
        if (!lPos) continue;

        var text = buildLabelText(lNode.name, lNode.totalFlow, labelMode, config.numFmt);
        if (!text) continue;

        var textY = lPos.y + lPos.height / 2 + fontSize * 0.35;
        var textX, anchor;

        if (lNode.level === 0) {
          // Leftmost: label to the left of node
          textX = lPos.x - 4;
          anchor = "end";
        } else if (lNode.level === maxLevel) {
          // Rightmost: label to the right of node
          textX = lPos.x + nodeWidth + 4;
          anchor = "start";
        } else {
          // Middle: label to the right of node
          textX = lPos.x + nodeWidth + 4;
          anchor = "start";
        }

        // Truncate if needed
        var maxLabelW = (lNode.level === 0 || lNode.level === maxLevel)
          ? chartWidth * 0.25 : chartWidth * 0.15;
        var maxChars = Math.floor(maxLabelW / avgCharW);
        var displayText = R.truncate(text, maxChars);

        svg.push('    <text x="' + textX.toFixed(1) + '" y="' + textY.toFixed(1) +
          '" font-family="' + fonts.label + '" font-size="' + fontSize +
          '" fill="' + st.labelColor + '" text-anchor="' + anchor + '">' +
          R.escapeXml(displayText) + '</text>');
      }
    }

    svg.push('  </g>');

    // Footer
    for (var fi = 0; fi < footer.svg.length; fi++) svg.push(footer.svg[fi]);

    svg.push('</svg>');
    return svg.join("\n");
  }

  // ── Label text builder ──────────────────────────────
  function buildLabelText(name, value, mode, numFmt) {
    if (mode === "name") return name;
    if (mode === "value") return R.formatNumber(value, numFmt);
    if (mode === "both") return name + " (" + R.formatNumber(value, numFmt) + ")";
    return "";
  }

  R.register("sankey", "Sankey Diagram", render);
})();
