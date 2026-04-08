/**
 * dashboard-renderer.js — turns a Dashboard JSON object into a row-aligned
 * grid of SECTION CARDS. Each section is a self-contained module with a
 * title, optional text, and one or more charts stacked vertically inside.
 *
 * Layout rules:
 *   - Sections flow in order, grouped into rows of N (default 3)
 *   - Sections in the same row share the 12 columns equally (12 / N each)
 *   - Sections in the same row have equal heights (CSS align-items: stretch)
 *   - Charts inside a section stack vertically and can be reordered
 *
 * Section span override: a section can declare its own span via
 * section.span (1-12). When provided, that section is given that span and
 * the row-fit algorithm packs other auto-span sections around it.
 *
 * Chart titles are rendered in HTML at the top of each chart card so we can
 * left-align them with CSS. The chart engine's SVG title is suppressed by
 * passing an empty title.
 */

/* global DashboardRenderer:true, ChartRegistry */

var DashboardRenderer = (function () {
  "use strict";

  var R = ChartRegistry;

  // Default: how many sections fit in one row when sections don't declare a span.
  var DEFAULT_SECTIONS_PER_ROW = 3;

  // Three preset size buckets, each mapped to a 12-col span (for charts).
  var SIZE_PRESETS = { small: 3, medium: 6, large: 12 };

  var DEFAULT_SIZE = {
    "hbar":        "medium",
    "vbar":        "small",
    "stacked-bar": "medium",
    "stacked-col": "small",
    "bubble":      "medium",
    "icon":        "medium",
    "donut":       "small",
    "pie":         "small",
    "line":        "large",
    "sankey":      "large",
    "table":       "large",
    "keyfigures":  "large",
    "text":        "medium"
  };
  var DEFAULT_SPANS = {};
  Object.keys(DEFAULT_SIZE).forEach(function (k) {
    DEFAULT_SPANS[k] = SIZE_PRESETS[DEFAULT_SIZE[k]];
  });
  DEFAULT_SPANS["donut"] = 4;
  DEFAULT_SPANS["pie"]   = 4;

  // Approx chart width in px for a given column span — used to feed
  // config.width to the chart engine. The actual rendered width is set
  // via CSS (svg width: 100%).
  function chartWidthForSpan(span) {
    var dashWidth = 1280;
    var dashPad = 48;
    var gridGap = 16;
    var usable = dashWidth - dashPad;
    var colW = (usable - gridGap * 11) / 12;
    return Math.max(280, Math.round(colW * span + gridGap * (span - 1)));
  }

  // Uniform target sizes — same labels and titles across every chart.
  var TARGET_LABEL_SIZE = 11;
  var TARGET_TITLE_SIZE = 13;

  function uniformScales(width) {
    var rs = R.responsive(width);
    return {
      labelScale: Math.round((TARGET_LABEL_SIZE / rs.labelSize) * 100),
      textScale:  Math.round((TARGET_TITLE_SIZE / rs.titleSize) * 100)
    };
  }

  var UNIFORM_BAR_THICKNESS = 20;
  var UNIFORM_BAR_GAP = 8;

  // For HORIZONTAL bar charts (hbar/stacked-bar) the chart engine reads
  // config.barThickness directly to compute plotHeight = N * (thickness +
  // gap). For VERTICAL bar charts (vbar/stacked-col) we don't pass
  // barThickness — the bandScale override handles bar width AND
  // compression so the chart adapts to the available column width.
  function dynamicBarThickness(chartType) {
    if (chartType === "hbar" || chartType === "stacked-bar") {
      return UNIFORM_BAR_THICKNESS;
    }
    return null;
  }

  function formatKpi(n, unit) {
    if (typeof n !== "number" || isNaN(n)) return String(n || "");
    var abs = Math.abs(n);
    var out;
    if (abs >= 1e9) out = (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + "B";
    else if (abs >= 1e6) out = (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
    else if (abs >= 1e3) out = (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + "K";
    else out = String(n);
    if (unit) out = out + " " + unit;
    return out;
  }

  // ── Data reshaping ──────────────────────────────────

  // Resolve a row's stored iconKey / flagCode to the PARSED object the
  // chart engine expects: { innerSvg, vbW, vbH }. Returns null if the icon
  // hasn't been loaded yet — in that case the paint pass happens without
  // the icon and a subsequent pass (after prefetch resolves) fills it in.
  function resolveRowIcon(row, iconColType) {
    if (!row) return null;
    if (iconColType === "flags" && row.flagCode && typeof FlagLoader !== "undefined") {
      return FlagLoader.getParsedSvg(row.flagCode);
    }
    if (iconColType === "icons" && row.iconKey && typeof IconLoader !== "undefined") {
      return IconLoader.getParsedSvg(row.iconKey);
    }
    return null;
  }

  function reshapeSingle(data, iconColType) {
    return data.map(function (d) {
      var out = { label: d.label, value: d.value };
      var svg = resolveRowIcon(d, iconColType);
      if (svg) out._iconSvg = svg;
      return out;
    });
  }

  function reshapeStacked(data, iconColType) {
    var labels = [], labelIndex = {}, seriesNames = [], seriesIndex = {};
    data.forEach(function (d) {
      if (labelIndex[d.label] === undefined) {
        labelIndex[d.label] = labels.length;
        var row = { label: d.label, values: [] };
        var svg = resolveRowIcon(d, iconColType);
        if (svg) row._iconSvg = svg;
        labels.push(row);
      }
      var s = d.series || "Value";
      if (seriesIndex[s] === undefined) {
        seriesIndex[s] = seriesNames.length;
        seriesNames.push(s);
      }
    });
    labels.forEach(function (l) { l.values = new Array(seriesNames.length).fill(0); });
    data.forEach(function (d) {
      var li = labelIndex[d.label];
      var si = seriesIndex[d.series || "Value"];
      labels[li].values[si] = d.value;
    });
    return { data: labels, seriesNames: seriesNames };
  }

  function reshapeSankey(data) {
    return data
      .filter(function (d) { return d.label && d.series; })
      .map(function (d) { return { source: d.label, target: d.series, value: d.value }; });
  }

  // ── Bar position override (vbar/stacked-col): fixed step when there's
  // room, else compress proportionally so bars never overflow the plot.
  // This makes column charts responsive: thin bars when many data points,
  // hefty 20px bars when there's space.
  function withFixedBandScale(fn) {
    var orig = R.bandScale;
    R.bandScale = function (count, rangeMin, rangeMax /* , padding */) {
      var rangeWidth = (rangeMax || 0) - (rangeMin || 0);
      var fixedStep = UNIFORM_BAR_THICKNESS + UNIFORM_BAR_GAP;   // 28
      var fixedTotal = count * fixedStep;
      var step, bw;
      if (fixedTotal <= rangeWidth || count <= 0) {
        // Comfortable: full 20px bars at 28px step, left-aligned.
        step = fixedStep;
        bw = UNIFORM_BAR_THICKNESS;
      } else {
        // Crowded: shrink proportionally. Keep ~72% bar / 28% gap ratio.
        step = rangeWidth / count;
        bw = Math.max(2, Math.round(step * 0.72));
      }
      return {
        bandwidth: bw,
        step: step,
        position: function (index) { return rangeMin + index * step; }
      };
    };
    try { return fn(); }
    finally { R.bandScale = orig; }
  }

  // ── Render one chart to an SVG string. Title is suppressed (rendered
  // in HTML by buildChartCard). Bar charts get uniform thickness/gap.
  function renderChartSvg(chart, styleName, width) {
    if (chart.type === "text") return null;

    var config = Object.assign({}, chart.config || {});
    config.style = styleName;
    config.width = width;

    var scales = uniformScales(width);
    if (config.labelScale == null) config.labelScale = scales.labelScale;
    if (config.textScale  == null) config.textScale  = scales.textScale;

    if (config.barThickness == null) {
      var bt = dynamicBarThickness(chart.type);
      if (bt != null) config.barThickness = bt;
    }
    if (chart.type === "donut" || chart.type === "pie") {
      if (config.pieLabelMode == null) config.pieLabelMode = "outside";
    }

    var data = chart.data || [];
    var shaped;
    var needsFixedBands = (chart.type === "vbar" || chart.type === "stacked-col");
    var iconColType = config.iconColType || "none";

    // IMPORTANT: pass empty title — chart-card renders the title in HTML.
    var emptyTitle = "";

    if (chart.type === "stacked-bar" || chart.type === "stacked-col") {
      shaped = reshapeStacked(data, iconColType);
      config.seriesNames = shaped.seriesNames;
      if (needsFixedBands) {
        return withFixedBandScale(function () {
          return R.render(chart.type, emptyTitle, shaped.data, config);
        });
      }
      return R.render(chart.type, emptyTitle, shaped.data, config);
    }
    if (chart.type === "sankey") {
      shaped = reshapeSankey(data);
      return R.render(chart.type, emptyTitle, shaped, config);
    }
    shaped = reshapeSingle(data, iconColType);
    if (needsFixedBands) {
      return withFixedBandScale(function () {
        return R.render(chart.type, emptyTitle, shaped, config);
      });
    }
    return R.render(chart.type, emptyTitle, shaped, config);
  }

  // Collect every icon/flag key a chart needs to paint, so callers can
  // prefetch them before calling paintChart. Keeps icon resolution fully
  // synchronous inside the render loop.
  function collectChartAssetKeys(chart) {
    var out = { icons: [], flags: [] };
    if (!chart || !chart.config) return out;
    var mode = chart.config.iconColType;
    if (mode !== "icons" && mode !== "flags") return out;
    (chart.data || []).forEach(function (row) {
      if (mode === "flags" && row.flagCode) out.flags.push(row.flagCode);
      if (mode === "icons" && row.iconKey)  out.icons.push(row.iconKey);
    });
    return out;
  }

  // ── KPI row ─────────────────────────────────────────
  function buildKpiRow(keyFigures, styleName) {
    if (!keyFigures || keyFigures.length === 0) return null;
    var style = R.getStyle ? R.getStyle(styleName) : null;
    var accent = style && style.colors ? style.colors[0] : "#009EDB";

    var row = document.createElement("div");
    row.className = "kpi-row span-12 editable-kpi";
    row.setAttribute("data-kpi-row", "1");

    // Collect icon keys we'll need to paint, and prefetch the ones that
    // aren't in memory yet. When the prefetch resolves we mutate the
    // already-inserted .kpi-icon elements in-place — no full re-render.
    var missingIcons = [];
    keyFigures.forEach(function (kpi) {
      if (kpi.iconKey && typeof IconLoader !== "undefined" && !IconLoader.getCachedSvg(kpi.iconKey)) {
        missingIcons.push(kpi.iconKey);
      }
    });

    keyFigures.forEach(function (kpi, idx) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      if (kpi.iconKey) card.classList.add("has-icon");
      card.setAttribute("data-kpi-index", String(idx));

      // Resolve the icon SVG right now if it's cached, else leave an
      // empty placeholder that the prefetch callback will fill in.
      var iconHtml = "";
      if (kpi.iconKey && typeof IconLoader !== "undefined") {
        var cached = IconLoader.getCachedSvg(kpi.iconKey);
        iconHtml = '<div class="kpi-icon" data-icon-key="' +
          escapeHtml(kpi.iconKey) + '" style="color:' + accent + '">' +
          (cached ? recolorSvg(cached, accent) : "") +
          '</div>';
      }

      // Real DOM element for the colored top bar — html2canvas mis-renders
      // CSS `box-shadow: inset` as a solid fill, so we use an actual <div>.
      card.innerHTML =
        '<div class="kpi-bar" style="background:' + accent + '"></div>' +
        iconHtml +
        '<div class="kpi-value" style="color:' + accent + '">' +
        escapeHtml(formatKpi(kpi.value, kpi.unit)) + '</div>' +
        '<div class="kpi-label">' + escapeHtml(kpi.label) + '</div>';
      row.appendChild(card);
    });

    if (missingIcons.length > 0) {
      IconLoader.prefetch(missingIcons).then(function () {
        row.querySelectorAll(".kpi-icon[data-icon-key]").forEach(function (el) {
          var key = el.getAttribute("data-icon-key");
          var svg = IconLoader.getCachedSvg(key);
          if (svg && !el.firstChild) {
            el.innerHTML = recolorSvg(svg, accent);
          }
        });
      });
    }

    return row;
  }

  // Rewrite the OCHA-blue reference colour in a humanitarian icon SVG to
  // the current style accent, mirroring the plugin's icon-recolor step.
  function recolorSvg(svg, accent) {
    if (!svg || !accent) return svg;
    return svg.replace(/#009[eE][dD][bB]/g, accent);
  }

  // ── Reorder arrows + duplicate button (visible on hover) ───
  function makeArrows(direction, indexLabel) {
    var arrows = document.createElement("div");
    arrows.className = "card-arrows " + (direction === "horizontal" ? "arrows-h" : "arrows-v");
    var leftSym  = direction === "horizontal" ? "\u25c2" : "\u25b4";
    var rightSym = direction === "horizontal" ? "\u25b8" : "\u25be";
    var inner = '<button class="card-arrow" data-move="up" title="Move earlier">' + leftSym + '</button>';
    if (indexLabel != null) {
      inner += '<span class="card-index">' + indexLabel + '</span>';
    }
    inner += '<button class="card-arrow" data-move="down" title="Move later">' + rightSym + '</button>';
    inner += '<button class="card-arrow card-arrow-dup" data-action="duplicate" title="Duplicate">\u2398</button>';
    arrows.innerHTML = inner;
    return arrows;
  }

  // ── Chart card (rendered inside a section) ─────────
  // The chart's SVG is rendered at the chart card's ACTUAL width (not a
  // hard-coded design width), so the chart engine picks the correct
  // breakpoint and lays out at native pixel sizes. A ResizeObserver
  // re-renders the chart whenever the card width changes, so charts
  // genuinely adapt to their container instead of being CSS-scaled.
  function buildChartCard(chart, sectionSpan, styleName, chartSpan) {
    if (chartSpan == null) chartSpan = 12;
    var card = document.createElement("div");
    card.className = "chart-card chart-type-" + chart.type;
    if (chart.id) card.setAttribute("data-chart-id", chart.id);

    card.appendChild(makeArrows("vertical"));

    if (chart.title || chart.type !== "text") {
      var t = document.createElement("h3");
      t.className = "chart-title";
      t.textContent = chart.title || "(untitled)";
      card.appendChild(t);
    }

    if (chart.type === "text") {
      var pp = document.createElement("p");
      pp.className = "chart-text";
      pp.textContent = (chart.config && chart.config.text) || "";
      // text cards still get a resize handle so the user can pin a
      // text-block alongside a chart in the same row.
      card.appendChild(makeChartResize(chartSpan));
      return card;
    }

    var holder = document.createElement("div");
    holder.className = "chart-svg-holder";
    card.appendChild(holder);

    // Initial pixel width to render at: a rough estimate based on the
    // section's column span × the chart's intra-section span. The
    // ResizeObserver below re-renders at the real measured width once
    // the card lays out for real.
    var firstPassW = Math.round(chartWidthForSpan(sectionSpan) * (chartSpan / 12));
    paintChart(holder, chart, styleName, firstPassW);
    observeAndRender(holder, chart, styleName);

    // In-section resize handle (only meaningful when the section has more
    // than one chart side-by-side, but cheap to render either way).
    card.appendChild(makeChartResize(chartSpan));

    return card;
  }

  // Right-edge resize handle on a chart card. Mirrors the section-level
  // handle but works against the parent .section-charts grid.
  function makeChartResize(chartSpan) {
    var resize = document.createElement("div");
    resize.className = "chart-resize";
    resize.title = "Drag to resize · " + chartSpan + " of 12";
    resize.innerHTML = '<span class="chart-resize-grip" aria-hidden="true"></span>';
    return resize;
  }

  // Render or re-render a chart's SVG inside the given holder at a target
  // pixel width. The SVG is rendered at the exact width (no CSS scaling),
  // which means the chart engine's responsive system kicks in correctly.
  //
  // After insertion we auto-fit the viewBox to the actual content bbox, so
  // any element that drew outside the chart engine's nominal svgW/svgH
  // (oversized labels, leader lines, headers, etc.) stays fully visible
  // instead of being clipped.
  // Chart types whose intrinsic aspect ratio is ~1:1 — making the section
  // wider would otherwise make these grow taller too. We render them at a
  // capped width so they stop growing once the section is big enough, then
  // center the SVG horizontally in the holder so there's no empty shift.
  var ASPECT_LOCKED = { donut: true, pie: true, bubble: true };
  var ASPECT_LOCK_MAX = 360;

  function paintChart(holder, chart, styleName, width) {
    if (width < 60) width = 60; // floor to avoid garbage SVGs

    // Kick off a prefetch for any icons/flags this chart references but
    // hasn't loaded yet. When they arrive, schedule a repaint at the
    // current width. The first paint still runs now so the chart appears
    // immediately (without icons), then icons fill in on the next pass.
    var keys = collectChartAssetKeys(chart);
    if (keys.icons.length > 0 && typeof IconLoader !== "undefined") {
      var missing = keys.icons.filter(function (k) { return !IconLoader.getCachedSvg(k); });
      if (missing.length > 0) {
        IconLoader.prefetch(missing).then(function () {
          if (holder.isConnected) {
            paintChart(holder, chart, styleName, Math.floor(holder.getBoundingClientRect().width) || width);
          }
        });
      }
    }
    if (keys.flags.length > 0 && typeof FlagLoader !== "undefined") {
      var missingF = keys.flags.filter(function (k) { return !FlagLoader.getCachedSvg(k); });
      if (missingF.length > 0) {
        FlagLoader.prefetch(missingF).then(function () {
          if (holder.isConnected) {
            paintChart(holder, chart, styleName, Math.floor(holder.getBoundingClientRect().width) || width);
          }
        });
      }
    }


    // For aspect-locked types, cap the render width (never the holder
    // width) so the resulting square SVG stays the same size no matter
    // how wide the section grows.
    var renderWidth = width;
    var isLocked = !!ASPECT_LOCKED[chart.type];
    if (isLocked) renderWidth = Math.min(width, ASPECT_LOCK_MAX);

    var svgStr = renderChartSvg(chart, styleName, renderWidth);
    if (!svgStr) {
      holder.innerHTML = '<div class="chart-error">Could not render ' +
        escapeHtml(chart.type) + '</div>';
      return;
    }

    holder.innerHTML = svgStr;
    var svg = holder.querySelector("svg");
    if (!svg) return;

    svg.style.display = "block";
    svg.style.overflow = "visible";
    svg.removeAttribute("width");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Read the chart engine's native viewBox so we can lock height in
    // pixels. Without this, CSS `height: auto` would make the displayed
    // height scale with the container width — so making the section wider
    // would visually stretch the chart taller. Locking height to viewBox
    // pixels means width changes only change width.
    function lockHeight() {
      var vb = (svg.getAttribute("viewBox") || "").split(/\s+|,/).map(parseFloat);
      var vbW = vb[2] || renderWidth;
      var vbH = vb[3] || renderWidth;
      if (isLocked) {
        // Render at the natural capped width, centered if the holder is
        // wider. No width:100% — we don't want it to grow past the cap.
        svg.style.width = vbW + "px";
        svg.style.maxWidth = "100%";
        svg.style.marginLeft = "auto";
        svg.style.marginRight = "auto";
      } else {
        // Fill the holder width, but pin height to the viewBox ratio at
        // the actual render width (not the container width). Since we
        // always re-render at the current holder width, vbW === width and
        // the ratio is 1:1 → visible height equals vbH.
        svg.style.width = "100%";
        svg.style.maxWidth = "100%";
      }
      svg.style.height = vbH + "px";
    }

    lockHeight();

    // Auto-fit viewBox to the actual content bounding box, then re-lock
    // the height in case fit expanded the viewBox (e.g. oversized labels).
    requestAnimationFrame(function () {
      fitViewBoxToContent(svg);
      lockHeight();
    });
  }

  // Expand the SVG viewBox so it includes every drawn element. Never
  // shrinks below the original viewBox — only grows when something would
  // otherwise be clipped on the top, bottom, left or right.
  function fitViewBoxToContent(svg) {
    if (!svg || !svg.getBBox) return;
    var bbox;
    try { bbox = svg.getBBox(); } catch (e) { return; }
    if (!bbox || !isFinite(bbox.width) || bbox.width <= 0) return;

    // Read the existing viewBox (the chart engine sets one).
    var vbAttr = svg.getAttribute("viewBox");
    var ox = 0, oy = 0, ow = 0, oh = 0;
    if (vbAttr) {
      var parts = vbAttr.split(/\s+|,/).map(parseFloat);
      ox = parts[0]; oy = parts[1]; ow = parts[2]; oh = parts[3];
    } else {
      ow = parseFloat(svg.getAttribute("width"))  || bbox.width;
      oh = parseFloat(svg.getAttribute("height")) || bbox.height;
    }

    // Small breathing-room pad so anti-aliased strokes/labels never sit
    // exactly on the edge.
    var pad = 2;
    var nx = Math.min(ox, bbox.x - pad);
    var ny = Math.min(oy, bbox.y - pad);
    var nr = Math.max(ox + ow, bbox.x + bbox.width  + pad);
    var nb = Math.max(oy + oh, bbox.y + bbox.height + pad);

    // No change? Skip the DOM write.
    if (nx === ox && ny === oy && (nr - nx) === ow && (nb - ny) === oh) return;

    svg.setAttribute("viewBox", nx + " " + ny + " " + (nr - nx) + " " + (nb - ny));
  }

  // Watch the chart's holder for width changes and re-render the chart
  // whenever the available width changes by more than a few pixels. This
  // makes every chart truly responsive: bubbles, lines, sankey, donuts,
  // bars — all adapt their internal layout to the container.
  function observeAndRender(holder, chart, styleName) {
    if (typeof ResizeObserver === "undefined") return;

    var lastWidth = 0;
    var renderTimer = null;

    function scheduleRender(target) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(function () {
        var w = Math.floor(target.getBoundingClientRect().width);
        if (w > 0 && Math.abs(w - lastWidth) >= 4) {
          lastWidth = w;
          paintChart(holder, chart, styleName, w);
        }
      }, 60);
    }

    // Initial sync render once the card is in the DOM
    requestAnimationFrame(function () {
      var w = Math.floor(holder.getBoundingClientRect().width);
      if (w > 0) {
        lastWidth = w;
        paintChart(holder, chart, styleName, w);
      }
      var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          scheduleRender(entries[i].target);
        }
      });
      ro.observe(holder);
      // Stash the observer on the holder so we can disconnect it if needed
      holder._chartResizeObserver = ro;
    });
  }

  // ── Section card (top-level grid item) ─────────────
  function buildSectionCard(section, sectionIndex, span, styleName) {
    var card = document.createElement("div");
    card.className = "section-card span-" + span;
    if (section.hideTitle) card.classList.add("section-no-title");
    card.setAttribute("data-section-index", String(sectionIndex));

    // Section reorder arrows + position number (top-right of section card)
    card.appendChild(makeArrows("horizontal", String(sectionIndex + 1)));

    if (!section.hideTitle) {
      var head = document.createElement("div");
      head.className = "section-head";
      head.setAttribute("data-section-head", String(sectionIndex));

      var h = document.createElement("h2");
      h.className = "section-title";
      h.textContent = section.title || "Untitled section";
      head.appendChild(h);
      card.appendChild(head);
    }

    if (section.text) {
      var p = document.createElement("p");
      p.className = "section-text-block";
      p.setAttribute("data-section-text-index", String(sectionIndex));
      p.textContent = section.text;
      card.appendChild(p);
    }

    var charts = section.charts || [];
    if (charts.length > 0) {
      var inner = document.createElement("div");
      inner.className = "section-charts";
      charts.forEach(function (chart) {
        // Each chart's intra-section span (1-12). Default 12 = full width,
        // which preserves the previous "stack vertically" behaviour.
        var chartSpan = (typeof chart.span === "number" && chart.span >= 1 && chart.span <= 12)
          ? Math.round(chart.span)
          : 12;
        var cardEl = buildChartCard(chart, span, styleName, chartSpan);
        cardEl.style.gridColumn = "span " + chartSpan;
        cardEl.classList.add("chart-span-" + chartSpan);
        inner.appendChild(cardEl);
      });
      card.appendChild(inner);
    }

    // Add-chart-to-section button at the bottom of every section card
    var addBtn = document.createElement("button");
    addBtn.className = "section-add-chart";
    addBtn.setAttribute("data-add-chart-section", String(sectionIndex));
    addBtn.innerHTML = "+ Add chart to this section";
    card.appendChild(addBtn);

    // Right-edge resize handle. Drag to change the section's column span
    // (1-12) without opening the inspector. Only visible on hover.
    var resize = document.createElement("div");
    resize.className = "section-resize";
    resize.setAttribute("data-section-resize", String(sectionIndex));
    resize.title = "Drag to resize · " + span + " of 12 columns";
    resize.innerHTML =
      '<span class="section-resize-grip" aria-hidden="true"></span>';
    card.appendChild(resize);

    // Span badge — direct child of the section card (not the narrow resize
    // column) so it has room to grow without clipping against the card's
    // overflow:hidden. Sits at the bottom-right corner. The ← / → arrows
    // make it clear this badge represents an adjustable WIDTH.
    var badge = document.createElement("div");
    badge.className = "section-resize-badge";
    badge.innerHTML =
      '<span class="badge-arrow">\u2190</span>' +
      '<span class="badge-value">' + span + '/12</span>' +
      '<span class="badge-arrow">\u2192</span>';
    card.appendChild(badge);

    return card;
  }

  // ── Per-section spans ──────────────────────────────
  // Each section declares its own span (1-12). The CSS grid wraps to a new
  // row whenever the next section can't fit in the remaining columns.
  // Default span = 4 (3 sections per row).
  function defaultSectionSpan() { return 4; }

  // Convert a target pixel width into a column span. Uses the same numbers
  // as chartWidthForSpan() so the round-trip is consistent.
  function spanForWidth(targetWidth) {
    var dashWidth = 1280;
    var dashPad = 48;
    var gridGap = 16;
    var usable = dashWidth - dashPad;
    var colW = (usable - gridGap * 11) / 12;     // ~88
    var step = colW + gridGap;
    var span = Math.ceil((targetWidth + gridGap) / step);
    return Math.max(1, Math.min(12, span));
  }

  // Absolute MINIMUM span needed for a chart to render legibly. The bar
  // chart is now responsive (bars compress to fit) so the minimum is much
  // lower than the "comfortable" width — only triggers auto-grow if even
  // very thin bars (~6px step) wouldn't fit.
  function chartMinSpan(chart) {
    var n = (chart.data || []).length;
    var t = chart.type;
    var px;
    var H_MARGINS = 80;
    // Minimum tolerable bar step (vbar): ~6px → still legible
    var MIN_BAR_STEP = 6;

    if (t === "vbar" || t === "stacked-col") {
      px = n * MIN_BAR_STEP + H_MARGINS;
    } else if (t === "line") {
      // Lines need ~12px per point at minimum
      px = Math.max(220, n * 12 + H_MARGINS);
    } else if (t === "sankey") {
      px = 320;
    } else if (t === "donut" || t === "pie") {
      px = 240;
    } else if (t === "table") {
      px = 240;
    } else if (t === "hbar" || t === "stacked-bar") {
      px = 220;
    } else if (t === "icon") {
      px = 200;
    } else if (t === "text") {
      px = 180;
    } else {
      px = 220;
    }
    return spanForWidth(px);
  }

  // Minimum span the section needs based on its content.
  function sectionMinSpan(section) {
    var charts = section.charts || [];
    var min = 1;
    for (var i = 0; i < charts.length; i++) {
      var s = chartMinSpan(charts[i]);
      if (s > min) min = s;
    }
    return min;
  }

  // Effective span: max(declared, computed minimum). Mutates section.span
  // when the user's declared value would cause overflow, so the picker
  // reflects the actual rendered width on the next inspector open.
  function getSectionSpan(section) {
    var declared = (typeof section.span === "number" && section.span >= 1 && section.span <= 12)
      ? Math.round(section.span)
      : defaultSectionSpan();
    var minNeeded = sectionMinSpan(section);
    var effective = Math.max(declared, minNeeded);
    if (section.span !== effective) section.span = effective;
    return effective;
  }

  // ── Main render ─────────────────────────────────────

  function render(dashboard, mount) {
    mount.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "dashboard dashboard-style-" + (dashboard.style || "ocha");
    mount.appendChild(wrap);

    if (dashboard.title) {
      var header = document.createElement("header");
      header.className = "dashboard-header";
      var h1 = document.createElement("h1");
      h1.textContent = dashboard.title;
      header.appendChild(h1);
      wrap.appendChild(header);
    }

    var grid = document.createElement("div");
    grid.className = "page-grid";
    wrap.appendChild(grid);

    var kpis = buildKpiRow(dashboard.keyFigures, dashboard.style);
    if (kpis) grid.appendChild(kpis);

    var sections = dashboard.sections || [];
    sections.forEach(function (section, sectionIndex) {
      var span = getSectionSpan(section);
      grid.appendChild(buildSectionCard(section, sectionIndex, span, dashboard.style));
    });

    // Dashboard footer (supports **bold** and [text](url))
    if (dashboard.footer && String(dashboard.footer).trim()) {
      var footerEl = document.createElement("footer");
      footerEl.className = "dashboard-footer";
      footerEl.innerHTML = renderInlineMarkdown(dashboard.footer);
      wrap.appendChild(footerEl);
    }
  }

  // Tiny safe inline-markdown parser. Only `**bold**` and `[text](url)` are
  // recognised. Everything else is HTML-escaped first so user input can't
  // inject script tags or arbitrary markup.
  function renderInlineMarkdown(src) {
    var safe = escapeHtml(src);
    // Links: [text](url) — only http(s) and mailto allowed
    safe = safe.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, url) {
      if (!/^(https?:\/\/|mailto:)/i.test(url)) return text;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });
    // Bold: **text**
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Newlines → <br>
    safe = safe.replace(/\n/g, "<br>");
    return safe;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    render: render,
    DEFAULT_SPANS: DEFAULT_SPANS,
    SIZE_PRESETS: SIZE_PRESETS,
    // Exposed so the editor's auto-layout button can pack rows using the
    // exact same minimum-span logic the renderer enforces.
    _sectionMinSpan: sectionMinSpan
  };
})();
