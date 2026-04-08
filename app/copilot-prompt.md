# OCHA Humanitarian DataViz — Copilot Data-Prep Prompt

Give this document (or a link to it) to Microsoft Copilot along with your raw
data. Copilot will reshape your data into the two CSV blocks the
**Humanitarian DataViz online tool** expects. Once you have the cleaned CSVs,
paste them into the tool — a dashboard is generated automatically.

---

## What the tool expects

A dashboard is described by **two CSV blocks**, separated by a single empty
line, in this order:

1. **Key Figures block** (optional) — the top row of big numbers
2. **Charts block** (required) — every chart on the dashboard

If you only paste one block, the tool tries to auto-detect which one it is
based on the column headers.

### Dashboard metadata (optional first line)

Before the two blocks, you MAY add a single metadata line:

```
#dashboard, title=Yemen HNO 2026, style=hnrp
```

- `style` must be one of: `ocha`, `hnrp`, `flash`, `gho`
- `title` is free text
- If omitted, the dashboard uses the OCHA blue style and an empty title.

---

## Key Figures block

**Required columns:** `kpi_label`, `kpi_value`
**Optional columns:** `kpi_icon`, `kpi_unit`

```csv
kpi_label,kpi_value,kpi_icon,kpi_unit
People in need,21600000,people,
People targeted,17300000,target,
Funding required,4300000000,funding,USD
```

- `kpi_value` must be a plain number (no commas, no "M", no "%"). The tool
  formats it automatically.
- `kpi_icon` is an OCHA icon slug. Leave blank if you don't know one —
  the tool falls back to a neutral style.
- `kpi_unit` is a short suffix like `USD`, `%`, `ha`. Optional.

---

## Charts block

**Required columns:** `section`, `chart_type`, `chart_title`, `label`, `value`
**Optional columns:** `series`, `sort`, `note`

```csv
section,chart_type,chart_title,label,value,series,sort,note
Food Security,hbar,Severity by Governorate,Hajjah,2100000,,1,
Food Security,hbar,Severity by Governorate,Al Hudaydah,1800000,,2,
Food Security,hbar,Severity by Governorate,Sana'a,1500000,,3,
Health,donut,Facilities by Status,Functional,62,,,
Health,donut,Facilities by Status,Partially Functional,28,,,
Health,donut,Facilities by Status,Non-Functional,10,,,
Protection,stacked-bar,Incidents by Type,Jan,120,GBV,,
Protection,stacked-bar,Incidents by Type,Jan,80,Child,,
Protection,stacked-bar,Incidents by Type,Feb,140,GBV,,
Protection,stacked-bar,Incidents by Type,Feb,75,Child,,
```

### Columns explained

| Column | Required | What it means |
|---|---|---|
| `section` | yes | Groups charts into a themed block on the dashboard. Charts with the same `section` render together under one heading. |
| `chart_type` | yes | One of the supported types (see below). |
| `chart_title` | yes | Rows that share the same `section` + `chart_type` + `chart_title` belong to the same chart. |
| `label` | yes | The category/axis label. For stacked charts, this is the group (e.g. month, region). |
| `value` | yes | A plain number. No commas, no currency symbols, no percent signs. |
| `series` | no | For stacked or multi-series charts only. Names the sub-series. |
| `sort` | no | Optional integer — controls row order within a chart. Leave blank for source order. |
| `note` | no | Free text note attached to the chart (renders as footer). |

### Text-only sections

To add a paragraph of plain text above a section's charts, include a row where
`chart_type` is `text`, the `label` holds the paragraph, and `value` is blank:

```csv
Food Security,text,,"Food insecurity remains the largest driver of humanitarian need across the country. The figures below focus on the three worst-affected governorates.",,,,
```

---

## Supported chart types

Use exactly these values in the `chart_type` column:

| `chart_type` | What it renders | Typical shape |
|---|---|---|
| `hbar` | Horizontal bar | label + value per row |
| `vbar` | Vertical bar | label + value per row |
| `stacked-bar` | Horizontal stacked bar | label + value + series |
| `stacked-col` | Vertical stacked column | label + value + series |
| `line` | Line chart | label (x) + value (y), optional series for multi-line |
| `donut` | Donut | label + value per slice |
| `pie` | Pie | label + value per slice |
| `bubble` | Bubble | label + value, plus a second value column via `series` if needed |
| `sankey` | Sankey | label = source, series = target, value = flow |
| `icon` | Icon/pictogram | label + value |
| `table` | Data table | renders all columns as-is |
| `keyfigures` | Key figures block (rarely needed — prefer the KPI block above) | label + value |
| `text` | Plain paragraph (no chart) | label holds the paragraph text |

---

## Rules for the AI assistant

When a user asks you to prepare data for the OCHA DataViz tool, you must:

1. **Never invent numbers.** Only use values present in the user's source data.
2. **Clean numeric values.** Strip thousand separators, currency symbols,
   percent signs, and unit suffixes before writing them to the `value` column.
   Preserve the unit in `kpi_unit` (for KPIs) or `note` (for charts) if the
   context matters.
3. **Group related charts.** Put charts that belong together under the same
   `section` name (e.g. all food security charts under `Food Security`).
4. **Keep chart titles short** — under 60 characters.
5. **Emit the two blocks separated by exactly one empty line**, in the order:
   metadata line (optional) → Key Figures block → Charts block.
6. **Quote any field that contains commas, quotes, or line breaks** using
   standard CSV double-quote escaping.
7. **Return the CSVs inside a single ```csv fenced code block** so the user
   can copy-paste in one click.
8. **Ask the user** which OCHA style to use (`ocha`, `hnrp`, `flash`, `gho`)
   if it's not obvious from the context.

### Minimal example output

```csv
#dashboard, title=Example Country HNO, style=ocha

kpi_label,kpi_value,kpi_icon,kpi_unit
People in need,5200000,people,
People targeted,3800000,target,
Funding required,820000000,funding,USD

section,chart_type,chart_title,label,value,series,sort,note
Overview,text,,"Humanitarian needs remain concentrated in the northern governorates.",,,,
Food Security,hbar,People in need by region,North,2100000,,1,
Food Security,hbar,People in need by region,Centre,1600000,,2,
Food Security,hbar,People in need by region,South,900000,,3,
Health,donut,Facilities by status,Functional,62,,,
Health,donut,Facilities by status,Partial,28,,,
Health,donut,Facilities by status,Non-functional,10,,,
```

That's the entire contract. If the user's raw data doesn't map cleanly to
these blocks, explain which columns you're missing before emitting any CSV.
