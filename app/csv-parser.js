/**
 * csv-parser.js — Parses the "long format" CSV described in copilot-prompt.md
 * into a DashboardModel object.
 *
 * Input: a string that may contain, in order:
 *   1. An optional metadata line:  #dashboard, title=..., style=...
 *   2. An optional Key Figures block (kpi_label, kpi_value, [kpi_icon, kpi_unit])
 *   3. A Charts block (section, chart_type, chart_title, label, value, [series, sort, note])
 *
 * Blocks are separated by one or more empty lines. The parser is tolerant of
 * quotes, CRLF line endings, and reordered columns.
 *
 * Output: { ok: true, dashboard } or { ok: false, errors: [...] }
 */

/* global CSVParser:true, DashboardModel */

var CSVParser = (function () {
  "use strict";

  // ── Low-level CSV tokenizer ───────────────────────────
  // RFC-4180-ish: handles quoted fields, embedded commas, embedded quotes ("")
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    var ch;

    while (i < text.length) {
      ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") {
        row.push(field); rows.push(row);
        row = []; field = ""; i++; continue;
      }
      field += ch; i++;
    }
    // flush last field / row
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  // Is this row "empty" (no content at all)?
  function isEmptyRow(row) {
    if (!row || row.length === 0) return true;
    for (var i = 0; i < row.length; i++) {
      if (String(row[i]).trim() !== "") return false;
    }
    return true;
  }

  // Split the raw rows into groups divided by empty lines.
  function splitBlocks(rows) {
    var blocks = [];
    var current = [];
    rows.forEach(function (r) {
      if (isEmptyRow(r)) {
        if (current.length > 0) { blocks.push(current); current = []; }
      } else {
        current.push(r);
      }
    });
    if (current.length > 0) blocks.push(current);
    return blocks;
  }

  // Parse a "#dashboard, key=value, key=value" metadata line.
  function parseMetaLine(row) {
    var meta = {};
    // first cell starts with "#dashboard"
    if (!row || row.length === 0) return meta;
    var first = String(row[0] || "").trim();
    if (first.toLowerCase().indexOf("#dashboard") !== 0) return null;
    // remaining cells are "key=value"
    for (var i = 1; i < row.length; i++) {
      var pair = String(row[i] || "").trim();
      var eq = pair.indexOf("=");
      if (eq > 0) {
        var k = pair.substring(0, eq).trim().toLowerCase();
        var v = pair.substring(eq + 1).trim();
        meta[k] = v;
      }
    }
    return meta;
  }

  // Build a { columnName: index } map from a header row.
  function headerMap(row) {
    var map = {};
    row.forEach(function (h, i) {
      map[String(h).trim().toLowerCase()] = i;
    });
    return map;
  }

  // Pull a named column, trimmed.
  function cell(row, map, name) {
    var idx = map[name];
    if (idx === undefined) return "";
    return String(row[idx] !== undefined ? row[idx] : "").trim();
  }

  // Clean a number: remove thousand sep / spaces. Returns NaN if not numeric.
  function parseNumber(s) {
    if (s === "" || s === null || s === undefined) return NaN;
    var cleaned = String(s).replace(/[\s,]/g, "");
    var n = Number(cleaned);
    return isNaN(n) ? NaN : n;
  }

  // Heuristic: is this block a Key Figures block or a Charts block?
  function detectBlockKind(block) {
    if (!block || block.length === 0) return "unknown";
    var headers = block[0].map(function (h) { return String(h).trim().toLowerCase(); });
    if (headers.indexOf("kpi_label") !== -1 || headers.indexOf("kpi_value") !== -1) return "kpi";
    if (
      headers.indexOf("section") !== -1 &&
      headers.indexOf("chart_type") !== -1
    ) return "charts";
    return "unknown";
  }

  // ── Block → partial dashboard ─────────────────────────

  function parseKpiBlock(block, errors) {
    var map = headerMap(block[0]);
    var out = [];
    for (var i = 1; i < block.length; i++) {
      var row = block[i];
      var label = cell(row, map, "kpi_label");
      var valueRaw = cell(row, map, "kpi_value");
      if (!label && !valueRaw) continue;
      var value = parseNumber(valueRaw);
      if (isNaN(value)) {
        errors.push("Key figure \"" + label + "\": value is not a number (" + valueRaw + ")");
        continue;
      }
      out.push({
        label: label,
        value: value,
        iconKey: cell(row, map, "kpi_icon") || null,
        unit: cell(row, map, "kpi_unit") || null
      });
    }
    return out;
  }

  function parseChartsBlock(block, errors) {
    var map = headerMap(block[0]);
    // Group rows by section → chart_title → chart_type (that's the chart identity).
    var sections = [];
    var sectionIndex = {};

    function getSection(name) {
      if (sectionIndex[name] !== undefined) return sections[sectionIndex[name]];
      var s = { title: name, text: "", charts: [], _chartIndex: {} };
      sectionIndex[name] = sections.length;
      sections.push(s);
      return s;
    }

    for (var i = 1; i < block.length; i++) {
      var row = block[i];
      if (isEmptyRow(row)) continue;
      var sectionName = cell(row, map, "section");
      var type = cell(row, map, "chart_type").toLowerCase();
      if (!sectionName) sectionName = ""; // rare, but allow untitled section
      if (!type) {
        errors.push("Row " + (i + 1) + ": missing chart_type.");
        continue;
      }
      if (!DashboardModel.isValidChartType(type)) {
        errors.push("Row " + (i + 1) + ": unknown chart_type \"" + type + "\".");
        continue;
      }

      var section = getSection(sectionName);

      // text rows: one per section, becomes section.text OR a standalone text chart
      if (type === "text") {
        var paragraph = cell(row, map, "label");
        // If section has no text yet, attach it to the section; otherwise make a text "chart"
        if (!section.text) {
          section.text = paragraph;
        } else {
          section.charts.push({ type: "text", title: "", data: [], config: { text: paragraph } });
        }
        continue;
      }

      var title = cell(row, map, "chart_title");
      var chartKey = type + "||" + title;
      var chart = section._chartIndex[chartKey];
      if (!chart) {
        chart = {
          type: type,
          title: title,
          data: [],
          config: {}
        };
        section.charts.push(chart);
        section._chartIndex[chartKey] = chart;
      }

      var label = cell(row, map, "label");
      var valueRaw = cell(row, map, "value");
      var series = cell(row, map, "series");
      var sortRaw = cell(row, map, "sort");
      var note = cell(row, map, "note");

      var value = parseNumber(valueRaw);
      if (isNaN(value)) {
        errors.push("Row " + (i + 1) + " (" + title + "): value is not a number (" + valueRaw + ")");
        continue;
      }

      var datum = { label: label, value: value };
      if (series) datum.series = series;
      if (sortRaw) {
        var sortNum = parseNumber(sortRaw);
        if (!isNaN(sortNum)) datum.sort = sortNum;
      }
      chart.data.push(datum);
      if (note && !chart.config.note) chart.config.note = note;
    }

    // Apply `sort` ordering inside each chart, then strip the helper index.
    sections.forEach(function (s) {
      delete s._chartIndex;
      s.charts.forEach(function (c) {
        if (c.data.some(function (d) { return d.sort !== undefined; })) {
          c.data.sort(function (a, b) {
            var as = a.sort === undefined ? Infinity : a.sort;
            var bs = b.sort === undefined ? Infinity : b.sort;
            return as - bs;
          });
          // Remove helper field so it doesn't leak into the renderers.
          c.data.forEach(function (d) { delete d.sort; });
        }
      });
    });

    return sections;
  }

  // ── Public API ────────────────────────────────────────

  function parse(text) {
    var errors = [];
    if (!text || !String(text).trim()) {
      return { ok: false, errors: ["No CSV provided."] };
    }
    var rows = parseCSV(String(text));
    var blocks = splitBlocks(rows);
    if (blocks.length === 0) {
      return { ok: false, errors: ["No data found in CSV."] };
    }

    var dashboard = DashboardModel.empty();

    // Check for metadata line on the very first row of the very first block.
    var meta = parseMetaLine(blocks[0][0]);
    if (meta) {
      if (meta.title) dashboard.title = meta.title;
      if (meta.style && DashboardModel.isValidStyle(meta.style)) {
        dashboard.style = meta.style;
      } else if (meta.style) {
        errors.push("Unknown style \"" + meta.style + "\" — falling back to ocha.");
      }
      // drop the meta row from block #1; if that empties the block, drop the block
      blocks[0] = blocks[0].slice(1);
      if (blocks[0].length === 0) blocks.shift();
    }

    // Walk remaining blocks and classify them.
    blocks.forEach(function (block) {
      var kind = detectBlockKind(block);
      if (kind === "kpi") {
        dashboard.keyFigures = parseKpiBlock(block, errors);
      } else if (kind === "charts") {
        dashboard.sections = parseChartsBlock(block, errors);
      } else {
        errors.push(
          "Couldn't identify a block — expected `kpi_label`/`kpi_value` or " +
          "`section`/`chart_type` headers. Got: " +
          block[0].join(", ")
        );
      }
    });

    var validation = DashboardModel.validate(dashboard);
    if (!validation.ok) {
      errors = errors.concat(validation.errors);
    }

    if (errors.length > 0 && dashboard.sections.length === 0 && dashboard.keyFigures.length === 0) {
      return { ok: false, errors: errors };
    }
    return { ok: true, dashboard: dashboard, warnings: errors };
  }

  return { parse: parse };
})();
