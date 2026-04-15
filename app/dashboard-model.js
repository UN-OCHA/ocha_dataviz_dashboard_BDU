/**
 * Dashboard data model — the unit of sharing for the online tool.
 *
 * A dashboard is a plain JSON object. This file defines the shape, a few
 * helpers for creating/validating one, and constants for supported styles
 * and chart types. The rest of the app only ever touches dashboards through
 * this module.
 */

/* global DashboardModel:true */

var DashboardModel = (function () {
  "use strict";

  var STYLES = ["ocha", "hnrp", "flash", "gho"];

  // Keep in sync with copilot-prompt.md and the chart-*.js registered ids.
  var CHART_TYPES = [
    "hbar", "vbar", "stacked-bar", "stacked-col",
    "line", "donut", "pie", "bubble", "sankey",
    "icon", "table", "keyfigures", "timeline", "text"
  ];

  function empty() {
    var now = new Date().toISOString();
    return {
      version: 1,
      title: "",
      style: "ocha",
      footer: "",
      meta: {
        createdAt: now,
        updatedAt: now
      },
      keyFigures: [],
      sections: []
    };
  }

  // Stamp the dashboard's meta.updatedAt with the current time. Called
  // by main.js on every renderPreview() so the timestamp always
  // reflects the latest edit. Also initialises meta + createdAt on
  // older dashboards that were saved before this field existed.
  function touch(d) {
    if (!d) return d;
    if (!d.meta) d.meta = {};
    var now = new Date().toISOString();
    if (!d.meta.createdAt) d.meta.createdAt = now;
    d.meta.updatedAt = now;
    return d;
  }

  // Generate a stable id for a chart so the editor can track it across re-renders.
  var _idCounter = 0;
  function newChartId() {
    _idCounter++;
    return "ch_" + Date.now().toString(36) + "_" + _idCounter;
  }

  // Walk a dashboard and ensure every chart has an id.
  function ensureChartIds(d) {
    if (!d || !Array.isArray(d.sections)) return d;
    d.sections.forEach(function (s) {
      (s.charts || []).forEach(function (c) {
        if (!c.id) c.id = newChartId();
      });
    });
    return d;
  }

  // Find a chart by id, returning {chart, section, sectionIndex, chartIndex} or null.
  function findChart(d, id) {
    if (!d || !d.sections) return null;
    for (var si = 0; si < d.sections.length; si++) {
      var s = d.sections[si];
      var charts = s.charts || [];
      for (var ci = 0; ci < charts.length; ci++) {
        if (charts[ci].id === id) {
          return { chart: charts[ci], section: s, sectionIndex: si, chartIndex: ci };
        }
      }
    }
    return null;
  }

  function deleteChart(d, id) {
    var loc = findChart(d, id);
    if (!loc) return false;
    loc.section.charts.splice(loc.chartIndex, 1);
    return true;
  }

  // Build a flat ordered list of every renderable item in the dashboard,
  // matching the order the renderer emits them. Each entry is one of:
  //   { kind: "section-text", sectionIndex }
  //   { kind: "chart", sectionIndex, chartIndex, chartId }
  function buildFlatList(d) {
    var list = [];
    (d.sections || []).forEach(function (s, si) {
      if (s.text) list.push({ kind: "section-text", sectionIndex: si });
      (s.charts || []).forEach(function (c, ci) {
        list.push({ kind: "chart", sectionIndex: si, chartIndex: ci, chartId: c.id });
      });
    });
    return list;
  }

  // Move a chart earlier (-1) or later (+1) in the global flat order.
  // If the swap target is in a different section, the chart moves between
  // sections. Section-text blocks are skipped over (they anchor to their
  // section).
  function moveChartInOrder(d, chartId, direction) {
    var list = buildFlatList(d);
    var fromIdx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === "chart" && list[i].chartId === chartId) { fromIdx = i; break; }
    }
    if (fromIdx === -1) return false;

    // Find next chart slot in the requested direction (skip section-text).
    var toIdx = fromIdx;
    var step = direction < 0 ? -1 : 1;
    while (true) {
      toIdx += step;
      if (toIdx < 0 || toIdx >= list.length) return false;
      if (list[toIdx].kind === "chart") break;
    }

    var src = list[fromIdx];
    var dst = list[toIdx];
    var srcSection = d.sections[src.sectionIndex];
    var dstSection = d.sections[dst.sectionIndex];
    var chart = srcSection.charts[src.chartIndex];

    if (src.sectionIndex === dst.sectionIndex) {
      // Same-section swap
      srcSection.charts[src.chartIndex] = dstSection.charts[dst.chartIndex];
      dstSection.charts[dst.chartIndex] = chart;
    } else {
      // Cross-section move: remove from src, insert into dst at the right slot.
      srcSection.charts.splice(src.chartIndex, 1);
      // If we removed from a lower index in the same section, shift dst index.
      var insertAt = dst.chartIndex;
      if (direction < 0) insertAt = dst.chartIndex;       // before the dst chart
      else               insertAt = dst.chartIndex + 1;   // after the dst chart
      // Cap insertAt at section length
      if (insertAt > dstSection.charts.length) insertAt = dstSection.charts.length;
      dstSection.charts.splice(insertAt, 0, chart);
    }
    return true;
  }

  // Move a section-text block earlier/later among other section-text blocks.
  // For simplicity this just swaps the entire section objects, which keeps
  // the section's charts grouped with their text.
  function moveSectionInOrder(d, sectionIndex, direction) {
    var step = direction < 0 ? -1 : 1;
    var target = sectionIndex + step;
    if (target < 0 || target >= d.sections.length) return false;
    var tmp = d.sections[sectionIndex];
    d.sections[sectionIndex] = d.sections[target];
    d.sections[target] = tmp;
    return true;
  }

  // Add a brand-new chart at the end of the dashboard. Returns the new
  // chart's id so callers can open the inspector for it.
  function addChart(d, type) {
    if (!Array.isArray(d.sections) || d.sections.length === 0) {
      d.sections = [{ title: "New section", text: "", charts: [] }];
    }
    var section = d.sections[d.sections.length - 1];
    return addChartToSection(d, section, type);
  }

  // Add a new chart to a specific section.
  function addChartToSection(d, sectionOrIndex, type) {
    var section = (typeof sectionOrIndex === "number")
      ? d.sections[sectionOrIndex]
      : sectionOrIndex;
    if (!section) return null;
    if (!section.charts) section.charts = [];
    var chart = {
      id: newChartId(),
      type: type,
      title: titleForType(type),
      data: sampleDataForType(type),
      config: {}
    };
    section.charts.push(chart);
    return chart.id;
  }

  // Add a brand-new section with one starter chart.
  //
  // Sections have an optional `orientation` field ("vertical" | "horizontal")
  // that controls how their charts are laid out. Defaults to "vertical" —
  // charts stack top to bottom. Setting it to "horizontal" arranges them
  // side by side in a flex row; the renderer's sectionMinSpan() auto-grows
  // the section width to accommodate every chart without cropping.
  function addSection(d, opts) {
    opts = opts || {};
    if (!Array.isArray(d.sections)) d.sections = [];
    var section = {
      title: opts.title || "New section",
      text: opts.text || "",
      orientation: opts.orientation || "vertical",
      charts: []
    };
    d.sections.push(section);
    if (opts.starterChartType) {
      addChartToSection(d, section, opts.starterChartType);
    }
    return d.sections.length - 1;
  }

  // Move a chart up/down within its own section. Returns true if moved.
  function moveChartWithinSection(d, chartId, direction) {
    var loc = findChart(d, chartId);
    if (!loc) return false;
    var charts = loc.section.charts;
    var target = loc.chartIndex + (direction < 0 ? -1 : 1);
    if (target < 0 || target >= charts.length) return false;
    var tmp = charts[loc.chartIndex];
    charts[loc.chartIndex] = charts[target];
    charts[target] = tmp;
    return true;
  }

  // ── Duplicate helpers ──────────────────────────────
  // Both deep-clone via JSON to drop any DOM/cache references, then mint
  // fresh chart IDs so the editor can track the new copies independently.

  // Duplicate a chart, inserting the copy immediately after the original
  // in the same section. Returns the new chart's id.
  function duplicateChart(d, chartId) {
    var loc = findChart(d, chartId);
    if (!loc) return null;
    var clone = JSON.parse(JSON.stringify(loc.chart));
    clone.id = newChartId();
    if (clone.title) clone.title = clone.title + " (copy)";
    loc.section.charts.splice(loc.chartIndex + 1, 0, clone);
    return clone.id;
  }

  // Duplicate a section, inserting the copy immediately after the original.
  // Every chart inside the cloned section gets a fresh id. Returns the new
  // section's index.
  function duplicateSection(d, sectionIndex) {
    if (!d || !Array.isArray(d.sections)) return -1;
    if (sectionIndex < 0 || sectionIndex >= d.sections.length) return -1;
    var clone = JSON.parse(JSON.stringify(d.sections[sectionIndex]));
    if (clone.title) clone.title = clone.title + " (copy)";
    (clone.charts || []).forEach(function (c) { c.id = newChartId(); });
    d.sections.splice(sectionIndex + 1, 0, clone);
    return sectionIndex + 1;
  }

  // Add a brand-new section that contains only a text block.
  function addTextSection(d) {
    if (!Array.isArray(d.sections)) d.sections = [];
    var section = {
      title: "New section",
      text: "Click to edit this text block.",
      charts: []
    };
    d.sections.push(section);
    return d.sections.length - 1;
  }

  function sampleDataForType(type) {
    if (type === "stacked-bar" || type === "stacked-col") {
      return [
        { label: "A", series: "Series 1", value: 10 },
        { label: "A", series: "Series 2", value: 6 },
        { label: "B", series: "Series 1", value: 14 },
        { label: "B", series: "Series 2", value: 8 }
      ];
    }
    if (type === "sankey") {
      return [
        { label: "Source A", series: "Target X", value: 20 },
        { label: "Source A", series: "Target Y", value: 10 },
        { label: "Source B", series: "Target X", value: 15 }
      ];
    }
    if (type === "donut" || type === "pie") {
      return [
        { label: "Category A", value: 60 },
        { label: "Category B", value: 25 },
        { label: "Category C", value: 15 }
      ];
    }
    if (type === "timeline") {
      // Dated events: date text, headline label, short description.
      // iconRef is optional and resolved at paint time like other row icons.
      return [
        { date: "Jan 2025", label: "Event one",   text: "Short description for the first event." },
        { date: "Apr 2025", label: "Event two",   text: "Short description for the second event." },
        { date: "Sep 2025", label: "Event three", text: "Short description for the third event." }
      ];
    }
    return [
      { label: "Item 1", value: 30 },
      { label: "Item 2", value: 50 },
      { label: "Item 3", value: 20 }
    ];
  }

  function titleForType(type) {
    var map = {
      "hbar": "New bar chart",
      "vbar": "New column chart",
      "stacked-bar": "New stacked bar chart",
      "stacked-col": "New stacked column chart",
      "donut": "New donut chart",
      "pie": "New pie chart",
      "line": "New line chart",
      "bubble": "New bubble chart",
      "sankey": "New sankey",
      "icon": "New pictogram",
      "table": "New table",
      "timeline": "New timeline",
      "text": "New text block"
    };
    return map[type] || "New chart";
  }

  function isValidStyle(s) {
    return STYLES.indexOf(s) !== -1;
  }

  function isValidChartType(t) {
    return CHART_TYPES.indexOf(t) !== -1;
  }

  /**
   * Lightweight validation — returns { ok: true } or { ok: false, errors: [] }.
   * Does NOT throw; the editor surfaces errors inline.
   */
  function validate(d) {
    var errors = [];
    if (!d || typeof d !== "object") {
      return { ok: false, errors: ["Dashboard is empty or not an object."] };
    }
    if (d.version !== 1) {
      errors.push("Unsupported dashboard version: " + d.version);
    }
    if (typeof d.title !== "string") {
      errors.push("`title` must be a string.");
    }
    if (!isValidStyle(d.style)) {
      errors.push("`style` must be one of: " + STYLES.join(", "));
    }
    if (!Array.isArray(d.keyFigures)) {
      errors.push("`keyFigures` must be an array.");
    } else {
      d.keyFigures.forEach(function (kpi, i) {
        if (typeof kpi.label !== "string" || !kpi.label) {
          errors.push("Key figure #" + (i + 1) + ": missing label.");
        }
        if (typeof kpi.value !== "number" || isNaN(kpi.value)) {
          errors.push("Key figure #" + (i + 1) + ": value must be a number.");
        }
      });
    }
    if (!Array.isArray(d.sections)) {
      errors.push("`sections` must be an array.");
    } else {
      d.sections.forEach(function (section, si) {
        if (typeof section.title !== "string") {
          errors.push("Section #" + (si + 1) + ": missing title.");
        }
        if (!Array.isArray(section.charts)) {
          errors.push("Section #" + (si + 1) + ": `charts` must be an array.");
          return;
        }
        section.charts.forEach(function (chart, ci) {
          if (!isValidChartType(chart.type)) {
            errors.push(
              "Section #" + (si + 1) + " chart #" + (ci + 1) +
              ": unknown chart type `" + chart.type + "`."
            );
          }
          if (chart.type !== "text") {
            if (!Array.isArray(chart.data)) {
              errors.push(
                "Section #" + (si + 1) + " chart #" + (ci + 1) +
                ": `data` must be an array."
              );
            }
          }
        });
      });
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors: errors };
  }

  /** Merge a partial into an existing dashboard (pure — returns a new object). */
  function merge(base, patch) {
    var next = JSON.parse(JSON.stringify(base || empty()));
    if (!patch) return next;
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.style !== undefined) next.style = patch.style;
    if (patch.keyFigures !== undefined) next.keyFigures = patch.keyFigures;
    if (patch.sections !== undefined) next.sections = patch.sections;
    return next;
  }

  return {
    STYLES: STYLES,
    CHART_TYPES: CHART_TYPES,
    empty: empty,
    touch: touch,
    validate: validate,
    merge: merge,
    isValidStyle: isValidStyle,
    isValidChartType: isValidChartType,
    newChartId: newChartId,
    ensureChartIds: ensureChartIds,
    findChart: findChart,
    deleteChart: deleteChart,
    buildFlatList: buildFlatList,
    moveChartInOrder: moveChartInOrder,
    moveSectionInOrder: moveSectionInOrder,
    addChart: addChart,
    addChartToSection: addChartToSection,
    addSection: addSection,
    addTextSection: addTextSection,
    moveChartWithinSection: moveChartWithinSection,
    duplicateChart: duplicateChart,
    duplicateSection: duplicateSection
  };
})();
