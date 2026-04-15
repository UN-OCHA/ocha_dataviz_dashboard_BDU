/**
 * table-editor.js — per-chart spreadsheet-style data editor.
 *
 * Mounted in the right "inspector" panel when a chart on the canvas is
 * clicked. Lets the user:
 *   - rename the chart title
 *   - change the chart type
 *   - reassign to a different section
 *   - edit data rows in a tabular grid (label, value, optional series)
 *   - add / delete rows
 *   - delete the chart
 *
 * Mutations are applied to the dashboard model in place; an `onChange`
 * callback is invoked after every edit so the host (main.js) can re-render
 * the dashboard preview.
 *
 * Designed to be replaceable: the inspector panel is a plain DOM container,
 * and this module just paints into it. No framework.
 */

/* global TableEditor:true, DashboardModel */

var TableEditor = (function () {
  "use strict";

  // Charts that don't use {label, value} data have specialized columns.
  function columnsFor(type) {
    if (type === "stacked-bar" || type === "stacked-col") {
      return [
        { key: "label", label: "Label", type: "text" },
        { key: "series", label: "Series", type: "text" },
        { key: "value", label: "Value", type: "number" }
      ];
    }
    if (type === "sankey") {
      return [
        { key: "label", label: "Source", type: "text" },
        { key: "series", label: "Target", type: "text" },
        { key: "value", label: "Value", type: "number" }
      ];
    }
    if (type === "timeline") {
      // Timeline uses { date, label, text } — no numeric value. Icon
      // assignment happens in the per-row icon section, not here.
      return [
        { key: "date",  label: "Date",        type: "text" },
        { key: "label", label: "Label",       type: "text" },
        { key: "text",  label: "Description", type: "text" }
      ];
    }
    if (type === "text") {
      return []; // text "charts" use config.text, not a data table
    }
    return [
      { key: "label", label: "Label", type: "text" },
      { key: "value", label: "Value", type: "number" }
    ];
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
  }

  // Resolve the current dashboard's style (ocha/hnrp/flash/gho) to the
  // primary accent color used for recoloring icon previews. Falls back
  // to OCHA blue when the chart engine isn't loaded yet.
  function currentStyleAccent(dashboard) {
    var name = (dashboard && dashboard.style) || "ocha";
    if (typeof ChartRegistry !== "undefined" && ChartRegistry.getStyle) {
      var s = ChartRegistry.getStyle(name);
      if (s && s.colors && s.colors[0]) return s.colors[0];
    }
    if (name === "hnrp")  return "#F58220";
    if (name === "flash") return "#ED1847";
    if (name === "gho")   return "#FFC800";
    return "#009EDB";
  }

  function mount(container, ctx) {
    // ctx = { dashboard, chartLocation, onChange, onClose }
    var d = ctx.dashboard;
    var loc = ctx.chartLocation;
    var chart = loc.chart;
    var section = loc.section;

    container.innerHTML = "";

    // ── Header ───────────────────────────────────
    var head = document.createElement("div");
    head.className = "inspector-head";
    head.innerHTML =
      '<div>' +
        '<div class="subtle">Chart</div>' +
        '<h2>' + escapeAttr(chart.title || "(untitled)") + '</h2>' +
      '</div>' +
      '<button class="btn icon" id="te-close" title="Close"><span class="ui-icon" data-ui-icon="close">' +
        (typeof UiIcons !== "undefined" ? UiIcons.svg("close") : "\u2715") +
      '</span></button>';
    container.appendChild(head);

    var body = document.createElement("div");
    body.className = "inspector-body";
    container.appendChild(body);

    // ── Title ────────────────────────────────────
    body.appendChild(field("Chart title", function (wrap) {
      var input = document.createElement("input");
      input.type = "text";
      input.value = chart.title || "";
      input.placeholder = "e.g. People in need by region";
      input.addEventListener("input", function () {
        chart.title = input.value;
        head.querySelector("h2").textContent = chart.title || "(untitled)";
        ctx.onChange();
      });
      wrap.appendChild(input);
    }));

    // ── Chart type ───────────────────────────────
    body.appendChild(field("Chart type", function (wrap) {
      var select = document.createElement("select");
      var TYPES = [
        ["hbar", "Horizontal bar"], ["vbar", "Vertical bar"],
        ["stacked-bar", "Stacked bar"], ["stacked-col", "Stacked column"],
        ["donut", "Donut"], ["pie", "Pie"],
        ["line", "Line"], ["bubble", "Bubble"],
        ["sankey", "Sankey"], ["icon", "Icon / pictogram"],
        ["table", "Table"], ["text", "Text block"]
      ];
      TYPES.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t[0]; o.textContent = t[1];
        if (t[0] === chart.type) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener("change", function () {
        chart.type = select.value;
        ctx.onChange();
        // Re-render the inspector so the table columns update
        mount(container, ctx);
      });
      wrap.appendChild(select);
    }));

    // ── Data table ───────────────────────────────
    if (chart.type === "text") {
      body.appendChild(field("Text content", function (wrap) {
        var ta = document.createElement("textarea");
        ta.value = (chart.config && chart.config.text) || "";
        ta.style.width = "100%";
        ta.style.minHeight = "120px";
        ta.style.padding = "8px 10px";
        ta.style.border = "1px solid var(--border)";
        ta.style.borderRadius = "var(--radius)";
        ta.style.fontFamily = "inherit";
        ta.style.fontSize = "13px";
        ta.addEventListener("input", function () {
          chart.config = chart.config || {};
          chart.config.text = ta.value;
          ctx.onChange();
        });
        wrap.appendChild(ta);
      }));
    } else {
      body.appendChild(field("Data", function (wrap) {
        wrap.appendChild(buildTable(chart, ctx));
      }));

      // ── Per-row icons / flags (chart types that support them) ──
      if (chartSupportsRowIcons(chart.type)) {
        body.appendChild(buildRowIconSection(chart, ctx));
      }

      // ── Chart options (collapsible) ────────────
      body.appendChild(buildChartOptions(chart, ctx));
    }

    // ── Delete ───────────────────────────────────
    var del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Delete chart";
    del.addEventListener("click", function () {
      if (!confirm("Delete \"" + (chart.title || "this chart") + "\"?")) return;
      DashboardModel.deleteChart(d, chart.id);
      ctx.onChange();
      ctx.onClose();
    });
    body.appendChild(del);

    // ── Close button ─────────────────────────────
    container.querySelector("#te-close").addEventListener("click", function () {
      ctx.onClose();
    });
  }

  function field(label, builder) {
    var wrap = document.createElement("div");
    var lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);
    builder(wrap);
    return wrap;
  }

  // Visual 12-column picker. The user clicks on cell N to set span=N.
  // Cells 1..N are highlighted as the "filled" portion. Hover preview too.
  function buildColumnPicker(initialSpan, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "col-picker";

    var current = Math.max(1, Math.min(12, initialSpan || 1));
    var cells = [];

    function paint(highlightTo) {
      cells.forEach(function (c, i) {
        if (i < highlightTo) c.classList.add("on");
        else c.classList.remove("on");
        if (i + 1 === current) c.classList.add("current");
        else c.classList.remove("current");
      });
      label.textContent = highlightTo + " / 12";
    }

    var track = document.createElement("div");
    track.className = "col-picker-track";
    for (var i = 0; i < 12; i++) {
      (function (idx) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "col-picker-cell";
        cell.setAttribute("aria-label", (idx + 1) + " of 12 columns");
        cell.addEventListener("mouseenter", function () { paint(idx + 1); });
        cell.addEventListener("focus",      function () { paint(idx + 1); });
        cell.addEventListener("click", function () {
          current = idx + 1;
          paint(current);
          if (typeof onChange === "function") onChange(current);
        });
        track.appendChild(cell);
        cells.push(cell);
      })(i);
    }
    track.addEventListener("mouseleave", function () { paint(current); });

    var label = document.createElement("div");
    label.className = "col-picker-label";

    wrap.appendChild(track);
    wrap.appendChild(label);
    paint(current);
    return wrap;
  }

  function buildTable(chart, ctx) {
    var cols = columnsFor(chart.type);
    var data = chart.data || (chart.data = []);

    var holder = document.createElement("div");
    holder.className = "table-editor";

    function paint() {
      holder.innerHTML = "";
      var table = document.createElement("table");

      // Header
      var thead = document.createElement("thead");
      var tr = document.createElement("tr");
      cols.forEach(function (c) {
        var th = document.createElement("th");
        th.textContent = c.label;
        tr.appendChild(th);
      });
      var thAct = document.createElement("th");
      thAct.style.width = "28px";
      tr.appendChild(thAct);
      thead.appendChild(tr);
      table.appendChild(thead);

      // Body
      var tbody = document.createElement("tbody");
      data.forEach(function (row, ri) {
        var rowEl = document.createElement("tr");
        cols.forEach(function (c) {
          var td = document.createElement("td");
          if (c.type === "number") td.className = "cell-num";
          var input = document.createElement("input");
          input.type = "text"; // use text + manual parsing so users can paste freely
          input.value = row[c.key] != null ? String(row[c.key]) : "";
          input.addEventListener("input", function () {
            if (c.type === "number") {
              var n = Number(String(input.value).replace(/[\s,]/g, ""));
              row[c.key] = isNaN(n) ? 0 : n;
            } else {
              row[c.key] = input.value;
            }
            ctx.onChange();
          });
          td.appendChild(input);
          rowEl.appendChild(td);
        });
        // Delete row
        var tdAct = document.createElement("td");
        tdAct.className = "cell-actions";
        var btn = document.createElement("button");
        btn.className = "row-del";
        btn.title = "Delete row";
        btn.textContent = "\u00d7";
        btn.addEventListener("click", function () {
          data.splice(ri, 1);
          ctx.onChange();
          paint();
        });
        tdAct.appendChild(btn);
        rowEl.appendChild(tdAct);
        tbody.appendChild(rowEl);
      });
      table.appendChild(tbody);
      holder.appendChild(table);

      // Add row button
      var add = document.createElement("button");
      add.className = "add-row";
      add.textContent = "+ Add row";
      add.addEventListener("click", function () {
        var newRow = {};
        cols.forEach(function (c) { newRow[c.key] = c.type === "number" ? 0 : ""; });
        data.push(newRow);
        ctx.onChange();
        paint();
      });
      holder.appendChild(add);
    }

    paint();
    return holder;
  }

  // Move a chart from its current section to a section with the given title,
  // creating that section if it doesn't exist.
  function moveChartToSection(d, chart, targetTitle) {
    var fromLoc = DashboardModel.findChart(d, chart.id);
    if (!fromLoc) return;
    if ((fromLoc.section.title || "(untitled)") === targetTitle) return;
    fromLoc.section.charts.splice(fromLoc.chartIndex, 1);

    var target = null;
    for (var i = 0; i < d.sections.length; i++) {
      if ((d.sections[i].title || "(untitled)") === targetTitle) { target = d.sections[i]; break; }
    }
    if (!target) {
      target = { title: targetTitle === "(untitled)" ? "" : targetTitle, text: "", charts: [] };
      d.sections.push(target);
    }
    target.charts.push(chart);
  }

  // ── Chart options (collapsible inspector section) ───
  // Universal fields for every chart type, plus per-type fields. Each
  // field reads/writes chart.config in place and triggers a re-render
  // through ctx.onChange().
  // Which chart types render an inline icon column? The chart engine
  // already supports this via config.iconColType + per-row _iconSvg.
  function chartSupportsRowIcons(type) {
    return type === "hbar" || type === "vbar" ||
           type === "stacked-bar" || type === "stacked-col" ||
           type === "icon" || type === "timeline";
  }

  // Build the "Icons / flags" section of the chart inspector. Lets the
  // user pick the icon column mode (off / icons / flags) and, for each
  // data row, attach a specific humanitarian icon or country flag.
  //
  // Storage shape in the dashboard JSON:
  //   chart.config.iconColType = "none" | "icons" | "flags"
  //   data[i].iconKey  = "Abduction-kidnapping"  (when icons)
  //   data[i].flagCode = "AFG"                   (when flags)
  // The raw _iconSvg is injected by the renderer at paint time.
  function buildRowIconSection(chart, ctx) {
    var wrap = document.createElement("div");

    // Timeline has a simpler icon model: each row's iconRef is a
    // humanitarian icon key (no flags, no mode switch). Handle it
    // with its own lightweight branch so we don't have to squeeze
    // the icon-column semantics into a chart type that doesn't need
    // them.
    if (chart.type === "timeline") {
      var lblT = document.createElement("label");
      lblT.textContent = "Event icons (optional)";
      wrap.appendChild(lblT);

      var hintT = document.createElement("p");
      hintT.className = "hint";
      hintT.style.margin = "0 0 8px";
      hintT.textContent =
        "Attach a humanitarian icon to each event. Icons appear above " +
        "(horizontal) or to the left of (vertical) each event marker.";
      wrap.appendChild(hintT);

      var tData = chart.data || [];
      if (tData.length === 0) {
        var emptyT = document.createElement("p");
        emptyT.className = "hint";
        emptyT.textContent = "Add events in the data table above to attach icons.";
        wrap.appendChild(emptyT);
        return wrap;
      }

      tData.forEach(function (row, idx) {
        var rowWrap = document.createElement("div");
        rowWrap.style.marginBottom = "8px";
        var rowLabel = document.createElement("div");
        rowLabel.className = "hint";
        rowLabel.style.margin = "0 0 4px";
        var parts = [];
        if (row.date)  parts.push(row.date);
        if (row.label) parts.push(row.label);
        rowLabel.textContent = parts.join(" \u00b7 ") || ("Event " + (idx + 1));
        rowWrap.appendChild(rowLabel);

        var p = IconPicker.create({
          mode: "icon",
          current: row.iconRef || null,
          accent: currentStyleAccent(ctx.dashboard),
          onPick: function (key) {
            row.iconRef = key;
            ctx.onChange();
          },
          onClear: function () {
            delete row.iconRef;
            ctx.onChange();
          }
        });
        rowWrap.appendChild(p.element);
        wrap.appendChild(rowWrap);
      });
      return wrap;
    }

    var lbl = document.createElement("label");
    lbl.textContent = "Icons / flags";
    wrap.appendChild(lbl);

    chart.config = chart.config || {};
    var current = chart.config.iconColType || "none";

    // Mode selector
    var modeRow = document.createElement("div");
    modeRow.style.display = "flex";
    modeRow.style.gap = "6px";
    modeRow.style.marginBottom = "8px";
    ["none", "icons", "flags"].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (current === m ? " primary" : "");
      b.style.flex = "1 1 0";
      b.textContent = m === "none" ? "None" : (m === "icons" ? "Icons" : "Flags");
      b.addEventListener("click", function () {
        chart.config.iconColType = m;
        ctx.onChange();
        // Re-render just this section
        var next = buildRowIconSection(chart, ctx);
        wrap.parentNode.replaceChild(next, wrap);
      });
      modeRow.appendChild(b);
    });
    wrap.appendChild(modeRow);

    if (current === "none") {
      var hint = document.createElement("p");
      hint.className = "hint";
      hint.style.margin = "4px 0 0";
      hint.textContent = "Turn on icons or flags to show a small image next to each row.";
      wrap.appendChild(hint);
      return wrap;
    }

    // Per-row pickers
    var data = chart.data || [];
    if (data.length === 0) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Add data rows above to attach icons to them.";
      wrap.appendChild(empty);
      return wrap;
    }

    // For stacked charts the same label repeats across multiple rows
    // (one per series). Deduplicate by label so the user picks an icon
    // once per label, not per series.
    var isStacked = chart.type === "stacked-bar" || chart.type === "stacked-col";
    var seen = {};
    var labelRows = [];
    data.forEach(function (row, i) {
      var key = row.label || ("Row " + (i + 1));
      if (isStacked && seen[key]) return;
      seen[key] = true;
      labelRows.push({ label: key, firstIndex: i });
    });

    labelRows.forEach(function (row) {
      var rowWrap = document.createElement("div");
      rowWrap.style.marginBottom = "8px";

      var rowLabel = document.createElement("div");
      rowLabel.className = "hint";
      rowLabel.style.margin = "0 0 4px";
      rowLabel.textContent = row.label;
      rowWrap.appendChild(rowLabel);

      var d0 = data[row.firstIndex];
      var currentKey = current === "flags" ? (d0.flagCode || null) : (d0.iconKey || null);

      var picker = IconPicker.create({
        mode: current === "flags" ? "flag" : "icon",
        current: currentKey,
        accent: currentStyleAccent(ctx.dashboard),
        onPick: function (key) {
          // Write to every data row that shares this label (handles stacked)
          data.forEach(function (r) {
            if ((r.label || "") === row.label) {
              if (current === "flags") r.flagCode = key; else r.iconKey = key;
            }
          });
          ctx.onChange();
        },
        onClear: function () {
          data.forEach(function (r) {
            if ((r.label || "") === row.label) {
              if (current === "flags") delete r.flagCode; else delete r.iconKey;
            }
          });
          ctx.onChange();
        }
      });
      rowWrap.appendChild(picker.element);
      wrap.appendChild(rowWrap);
    });

    return wrap;
  }

  function buildChartOptions(chart, ctx) {
    chart.config = chart.config || {};
    var details = document.createElement("details");
    details.className = "chart-options";
    details.open = false;
    var summary = document.createElement("summary");
    summary.textContent = "Chart options";
    details.appendChild(summary);

    var box = document.createElement("div");
    box.className = "chart-options-body";
    details.appendChild(box);

    // ── Universal fields (apply to every chart type) ──
    box.appendChild(textOption("Subtitle", chart, "subtitle", ctx, "Optional secondary heading"));
    box.appendChild(textOption("Footer note", chart, "footer", ctx, "e.g. Source: OCHA"));
    box.appendChild(selectOption("Number format", chart, "numberFormat", [
      ["auto",     "Auto (1.6M)"],
      ["short",    "Short (1.6M)"],
      ["full",     "Full (1,600,000)"],
      ["percent",  "Percent (16%)"]
    ], ctx, "auto"));
    box.appendChild(textOption("Value prefix", chart, "valuePrefix", ctx, '$'));
    box.appendChild(textOption("Value suffix", chart, "valueSuffix", ctx, '%, USD, …'));

    // ── Per-type fields ───────────────────────────────
    var t = chart.type;

    if (t === "hbar" || t === "vbar" || t === "stacked-bar" || t === "stacked-col") {
      box.appendChild(selectOption("Value labels", chart, "barLabelMode", [
        ["outside", "Outside the bar"],
        ["inside",  "Inside the bar"],
        ["none",    "Hidden"]
      ], ctx, "outside"));
    }

    if (t === "donut") {
      box.appendChild(sliderOption("Hole size", chart, "donutHole", 0, 80, 5, ctx, 60, "%"));
    }
    if (t === "donut" || t === "pie") {
      box.appendChild(selectOption("Label position", chart, "pieLabelMode", [
        ["outside", "Outside slices (with leader lines)"],
        ["inside",  "Inside slices"],
        ["none",    "Hidden"]
      ], ctx, "outside"));
      box.appendChild(selectOption("Label content", chart, "pieLabelContent", [
        ["label-pct",   "Label + percent"],
        ["label-value", "Label + value"],
        ["label",       "Label only"],
        ["pct",         "Percent only"],
        ["value",       "Value only"]
      ], ctx, "label-pct"));
    }

    if (t === "bubble") {
      box.appendChild(selectOption("Layout", chart, "bubbleOrientation", [
        ["horizontal", "Horizontal row"],
        ["vertical",   "Vertical stack"]
      ], ctx, "horizontal"));
      box.appendChild(sliderOption("Bubble spacing", chart, "bubbleSeparation", -100, 100, 5, ctx, 0));
    }

    if (t === "timeline") {
      box.appendChild(selectOption("Layout", chart, "timelineOrientation", [
        ["horizontal", "Horizontal (auto S-shape)"],
        ["vertical",   "Vertical stack"]
      ], ctx, "horizontal"));
      // Event spacing drives the fold-into-S-shape threshold for the
      // horizontal timeline: more spacing → fewer events per row →
      // more rows. Range 60-250 px matches the plugin.
      box.appendChild(sliderOption("Event spacing", chart, "timelineEventSpacing", 60, 250, 5, ctx, 90, "px"));
    }

    if (t === "sankey") {
      box.appendChild(sliderOption("Node width", chart, "sankeyNodeWidth", 10, 40, 1, ctx, 20));
      box.appendChild(sliderOption("Node padding", chart, "sankeyNodePadding", 5, 40, 1, ctx, 15));
      box.appendChild(sliderOption("Link opacity", chart, "sankeyLinkOpacity", 10, 100, 5, ctx, 40, "%"));
      box.appendChild(selectOption("Labels", chart, "sankeyLabelMode", [
        ["both",  "Name + value"],
        ["name",  "Name only"],
        ["value", "Value only"],
        ["none",  "Hidden"]
      ], ctx, "both"));
      box.appendChild(selectOption("Colors", chart, "sankeyColorMode", [
        ["single",     "Single color"],
        ["multicolor", "Multicolor"]
      ], ctx, "single"));
    }

    if (t === "line") {
      box.appendChild(checkboxOption("Shade area under line", chart, "shade", ctx));
    }

    return details;
  }

  // ── Reusable inspector field builders ────────────

  function readVal(chart, key) {
    return chart.config && chart.config[key];
  }
  function writeVal(chart, key, value, ctx) {
    chart.config = chart.config || {};
    chart.config[key] = value;
    ctx.onChange();
  }

  function textOption(label, chart, key, ctx, placeholder) {
    var wrap = document.createElement("div");
    wrap.className = "opt-row";
    var lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);
    var input = document.createElement("input");
    input.type = "text";
    input.value = readVal(chart, key) || "";
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener("input", function () {
      writeVal(chart, key, input.value || null, ctx);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function selectOption(label, chart, key, options, ctx, defaultValue) {
    var wrap = document.createElement("div");
    wrap.className = "opt-row";
    var lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);
    var select = document.createElement("select");
    var current = readVal(chart, key) || defaultValue;
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      if (opt[0] === current) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      writeVal(chart, key, select.value, ctx);
    });
    wrap.appendChild(select);
    return wrap;
  }

  function sliderOption(label, chart, key, min, max, step, ctx, defaultValue, suffix) {
    var wrap = document.createElement("div");
    wrap.className = "opt-row opt-slider";
    var lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);

    var inner = document.createElement("div");
    inner.className = "opt-slider-inner";
    var range = document.createElement("input");
    range.type = "range";
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    var current = readVal(chart, key);
    if (current == null || isNaN(Number(current))) current = defaultValue;
    range.value = String(current);

    var num = document.createElement("span");
    num.className = "opt-slider-value";
    num.textContent = String(current) + (suffix || "");

    range.addEventListener("input", function () {
      var v = Number(range.value);
      num.textContent = String(v) + (suffix || "");
      writeVal(chart, key, v, ctx);
    });

    inner.appendChild(range);
    inner.appendChild(num);
    wrap.appendChild(inner);
    return wrap;
  }

  function checkboxOption(label, chart, key, ctx) {
    var wrap = document.createElement("div");
    wrap.className = "opt-row";
    var row = document.createElement("label");
    row.className = "checkbox-row";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!readVal(chart, key);
    cb.addEventListener("change", function () {
      writeVal(chart, key, cb.checked, ctx);
    });
    var span = document.createElement("span");
    span.textContent = label;
    row.appendChild(cb);
    row.appendChild(span);
    wrap.appendChild(row);
    return wrap;
  }

  // ── Key figures editor ───────────────────────────
  // ctx = { dashboard, onChange, onClose }
  function mountKpis(container, ctx) {
    var d = ctx.dashboard;
    if (!Array.isArray(d.keyFigures)) d.keyFigures = [];

    container.innerHTML = "";

    var head = document.createElement("div");
    head.className = "inspector-head";
    head.innerHTML =
      '<div>' +
        '<div class="subtle">Module</div>' +
        '<h2>Key figures</h2>' +
      '</div>' +
      '<button class="btn icon" id="te-close" title="Close"><span class="ui-icon" data-ui-icon="close">' +
        (typeof UiIcons !== "undefined" ? UiIcons.svg("close") : "\u2715") +
      '</span></button>';
    container.appendChild(head);

    var body = document.createElement("div");
    body.className = "inspector-body";
    container.appendChild(body);

    body.appendChild(field("Top-of-dashboard key figures", function (wrap) {
      wrap.appendChild(buildKpiTable(d, ctx));
    }));

    // Per-KPI icon picker(s) — each KPI card can show a humanitarian icon
    // next to its number. Uses the shared IconPicker component.
    body.appendChild(field("Icons (optional)", function (wrap) {
      var hint = document.createElement("p");
      hint.className = "hint";
      hint.style.margin = "0 0 8px";
      hint.textContent = "Choose an icon to display on each key figure card.";
      wrap.appendChild(hint);
      d.keyFigures.forEach(function (kpi, idx) {
        var row = document.createElement("div");
        row.style.marginBottom = "8px";
        var label = document.createElement("div");
        label.className = "hint";
        label.style.margin = "0 0 4px";
        label.textContent = (kpi.label || "Key figure " + (idx + 1));
        row.appendChild(label);
        var picker = IconPicker.create({
          mode: "icon",
          current: kpi.iconKey || null,
          accent: currentStyleAccent(d),
          onPick: function (key) {
            kpi.iconKey = key;
            ctx.onChange();
          },
          onClear: function () {
            delete kpi.iconKey;
            ctx.onChange();
          }
        });
        row.appendChild(picker.element);
        wrap.appendChild(row);
      });
    }));

    container.querySelector("#te-close").addEventListener("click", function () {
      ctx.onClose();
    });
  }

  function buildKpiTable(d, ctx) {
    var holder = document.createElement("div");
    holder.className = "table-editor";

    function paint() {
      holder.innerHTML = "";
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      thead.innerHTML =
        '<tr>' +
          '<th>Label</th>' +
          '<th>Value</th>' +
          '<th>Unit</th>' +
          '<th style="width:28px"></th>' +
        '</tr>';
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      d.keyFigures.forEach(function (kpi, ri) {
        var tr = document.createElement("tr");

        var tdLabel = document.createElement("td");
        var iL = document.createElement("input");
        iL.type = "text";
        iL.value = kpi.label || "";
        iL.placeholder = "e.g. People in need";
        iL.addEventListener("input", function () { kpi.label = iL.value; ctx.onChange(); });
        tdLabel.appendChild(iL);
        tr.appendChild(tdLabel);

        var tdVal = document.createElement("td");
        tdVal.className = "cell-num";
        var iV = document.createElement("input");
        iV.type = "text";
        iV.value = kpi.value != null ? String(kpi.value) : "";
        iV.placeholder = "e.g. 21600000";
        iV.addEventListener("input", function () {
          var n = Number(String(iV.value).replace(/[\s,]/g, ""));
          kpi.value = isNaN(n) ? 0 : n;
          ctx.onChange();
        });
        tdVal.appendChild(iV);
        tr.appendChild(tdVal);

        var tdU = document.createElement("td");
        var iU = document.createElement("input");
        iU.type = "text";
        iU.value = kpi.unit || "";
        iU.placeholder = "USD, %, …";
        iU.addEventListener("input", function () {
          kpi.unit = iU.value || null;
          ctx.onChange();
        });
        tdU.appendChild(iU);
        tr.appendChild(tdU);

        var tdAct = document.createElement("td");
        tdAct.className = "cell-actions";
        var del = document.createElement("button");
        del.className = "row-del";
        del.title = "Delete key figure";
        del.textContent = "\u00d7";
        del.addEventListener("click", function () {
          d.keyFigures.splice(ri, 1);
          ctx.onChange();
          paint();
        });
        tdAct.appendChild(del);
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      holder.appendChild(table);

      var add = document.createElement("button");
      add.className = "add-row";
      add.textContent = "+ Add key figure";
      add.addEventListener("click", function () {
        d.keyFigures.push({ label: "", value: 0, unit: null });
        ctx.onChange();
        paint();
      });
      holder.appendChild(add);
    }
    paint();
    return holder;
  }

  // ── Section text editor ──────────────────────────
  // ctx = { dashboard, sectionIndex, onChange, onClose }
  function mountSectionText(container, ctx) {
    var d = ctx.dashboard;
    var section = d.sections[ctx.sectionIndex];
    if (!section) { ctx.onClose(); return; }

    container.innerHTML = "";

    var head = document.createElement("div");
    head.className = "inspector-head";
    head.innerHTML =
      '<div>' +
        '<div class="subtle">Section text</div>' +
        '<h2>' + escapeAttr(section.title || "(untitled section)") + '</h2>' +
      '</div>' +
      '<button class="btn icon" id="te-close" title="Close"><span class="ui-icon" data-ui-icon="close">' +
        (typeof UiIcons !== "undefined" ? UiIcons.svg("close") : "\u2715") +
      '</span></button>';
    container.appendChild(head);

    var body = document.createElement("div");
    body.className = "inspector-body";
    container.appendChild(body);

    body.appendChild(field("Section title", function (wrap) {
      var input = document.createElement("input");
      input.type = "text";
      input.value = section.title || "";
      input.placeholder = "e.g. Food Security";
      input.addEventListener("input", function () {
        section.title = input.value;
        head.querySelector("h2").textContent = section.title || "(untitled section)";
        ctx.onChange();
      });
      wrap.appendChild(input);
    }));

    body.appendChild(field("Text content", function (wrap) {
      var ta = document.createElement("textarea");
      ta.value = section.text || "";
      ta.style.width = "100%";
      ta.style.minHeight = "160px";
      ta.style.padding = "8px 10px";
      ta.style.border = "1px solid var(--border)";
      ta.style.borderRadius = "var(--radius)";
      ta.style.fontFamily = "inherit";
      ta.style.fontSize = "13px";
      ta.addEventListener("input", function () {
        section.text = ta.value;
        ctx.onChange();
      });
      wrap.appendChild(ta);
    }));

    var del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Clear text block";
    del.addEventListener("click", function () {
      if (!confirm("Remove this text block?")) return;
      section.text = "";
      ctx.onChange();
      ctx.onClose();
    });
    body.appendChild(del);

    container.querySelector("#te-close").addEventListener("click", function () {
      ctx.onClose();
    });
  }

  // ── Section editor (title, text, list of charts) ──
  // ctx = { dashboard, sectionIndex, onChange, onClose }
  function mountSection(container, ctx) {
    var d = ctx.dashboard;
    var section = d.sections[ctx.sectionIndex];
    if (!section) { ctx.onClose(); return; }

    container.innerHTML = "";

    var head = document.createElement("div");
    head.className = "inspector-head";
    head.innerHTML =
      '<div>' +
        '<div class="subtle">Section</div>' +
        '<h2>' + escapeAttr(section.title || "(untitled section)") + '</h2>' +
      '</div>' +
      '<button class="btn icon" id="te-close" title="Close"><span class="ui-icon" data-ui-icon="close">' +
        (typeof UiIcons !== "undefined" ? UiIcons.svg("close") : "\u2715") +
      '</span></button>';
    container.appendChild(head);

    var body = document.createElement("div");
    body.className = "inspector-body";
    container.appendChild(body);

    body.appendChild(field("Section title", function (wrap) {
      var input = document.createElement("input");
      input.type = "text";
      input.value = section.title || "";
      input.placeholder = "e.g. Food Security";
      input.addEventListener("input", function () {
        section.title = input.value;
        head.querySelector("h2").textContent = section.title || "(untitled section)";
        ctx.onChange();
      });
      wrap.appendChild(input);
    }));

    // Hide title toggle
    body.appendChild(field("Display", function (wrap) {
      var row = document.createElement("label");
      row.className = "checkbox-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!section.hideTitle;
      cb.addEventListener("change", function () {
        section.hideTitle = cb.checked;
        ctx.onChange();
      });
      var span = document.createElement("span");
      span.textContent = "Hide section title in dashboard";
      row.appendChild(cb);
      row.appendChild(span);
      wrap.appendChild(row);
    }));

    // Layout — vertical (stack) vs horizontal (side by side)
    body.appendChild(field("Layout", function (wrap) {
      var hint = document.createElement("p");
      hint.className = "hint";
      hint.style.margin = "0 0 6px";
      hint.textContent =
        "How charts are arranged inside this section. Horizontal will " +
        "auto-grow the section width so every chart fits without cropping.";
      wrap.appendChild(hint);

      var row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "6px";
      var current = section.orientation === "horizontal" ? "horizontal" : "vertical";

      function makeBtn(value, label, role) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn" + (current === value ? " primary" : "");
        b.style.flex = "1 1 0";
        var icon = (typeof UiIcons !== "undefined")
          ? '<span class="ui-icon" data-ui-icon="' + role + '">' + UiIcons.svg(role) + '</span>'
          : "";
        b.innerHTML = icon + " <span>" + label + "</span>";
        b.addEventListener("click", function () {
          if (section.orientation === value) return;
          section.orientation = value;
          ctx.onChange();
          // Re-render this inspector so the toggle state updates
          mountSection(container, ctx);
        });
        return b;
      }
      row.appendChild(makeBtn("vertical",   "Vertical",   "layout-vertical"));
      row.appendChild(makeBtn("horizontal", "Horizontal", "layout-horizontal"));
      wrap.appendChild(row);
    }));

    // Width (12-col picker) — user still has manual control, but the
    // minimum will auto-grow if the section has charts that need more
    // room (see sectionMinSpan in dashboard-renderer.js).
    body.appendChild(field("Width", function (wrap) {
      wrap.appendChild(buildColumnPicker(section.span || 4, function (n) {
        section.span = n;
        ctx.onChange();
      }));
    }));

    body.appendChild(field("Section text (optional)", function (wrap) {
      var ta = document.createElement("textarea");
      ta.value = section.text || "";
      ta.style.width = "100%";
      ta.style.minHeight = "100px";
      ta.style.padding = "8px 10px";
      ta.style.border = "1px solid var(--border)";
      ta.style.borderRadius = "var(--radius)";
      ta.style.fontFamily = "inherit";
      ta.style.fontSize = "13px";
      ta.addEventListener("input", function () {
        section.text = ta.value;
        ctx.onChange();
      });
      wrap.appendChild(ta);
    }));

    // Chart list
    body.appendChild(field("Charts in this section", function (wrap) {
      var list = document.createElement("div");
      list.className = "section-chart-list";
      var charts = section.charts || [];
      if (charts.length === 0) {
        var empty = document.createElement("div");
        empty.className = "hint";
        empty.style.padding = "8px 0";
        empty.textContent = "No charts yet. Use the “+ Add chart” button below the section.";
        list.appendChild(empty);
      }
      charts.forEach(function (chart, idx) {
        var row = document.createElement("div");
        row.className = "section-chart-row";
        row.innerHTML =
          '<span class="muted">' + (idx + 1) + '.</span> ' +
          '<span>' + escapeAttr(chart.title || "(untitled)") + '</span> ' +
          '<span class="muted small"> · ' + chart.type + '</span>';
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }));

    // Delete section button
    var del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Delete section";
    del.addEventListener("click", function () {
      if (!confirm("Delete this section and all its charts?")) return;
      d.sections.splice(ctx.sectionIndex, 1);
      ctx.onChange();
      ctx.onClose();
    });
    body.appendChild(del);

    container.querySelector("#te-close").addEventListener("click", function () {
      ctx.onClose();
    });
  }

  return {
    mount: mount,
    mountKpis: mountKpis,
    mountSectionText: mountSectionText,
    mountSection: mountSection
  };
})();
