# OCHA Humanitarian DataViz — Online Dashboard Editor

This is the **web/online** tool. The sibling **Illustrator plugin** lives one
level up at `../` (folder: `ocha_dataviz_plugin/`). The two tools used to
share a chart engine; they are now fully decoupled and have independent git
repos. See `c257a9e` (Decouple from plugin) for the rationale.

---

## Cross-tool change tracking

Some concepts genuinely belong to BOTH tools (the same brand colors, the
same number formatting, the same chart data shapes). When Claude is about
to edit code that maps to one of those concepts, it must:

1. **STOP before applying the change.**
2. **Tell the user what's about to change** in plain language.
3. **Ask:** "This may also affect the Illustrator plugin at
   `../ocha_dataviz_plugin/`. Should I apply the same change there too?"
4. **Wait for the user's explicit answer** — never auto-apply to both.
5. If the user says yes, navigate to the sibling repo and make the matching
   change there as a separate commit.
6. If the user says no, continue with just the online-tool change and move on.

Claude must apply this rule **before** writing the change, not after.

### Shared concerns inventory

Treat any edit that touches one of these as a cross-tool flag:

- **Brand color tokens**
  - OCHA blue `#009EDB` and dark `#007BB0`
  - HNRP orange `#F58220`
  - Flash Appeal red
  - GHO gold
  - Any change to these hex values, the variable names, or the style IDs.
- **Style identifiers**
  - The string keys `ocha`, `hnrp`, `flash`, `gho`. Renaming, adding, or
    removing one of these.
- **KPI number formatting**
  - The K / M / B abbreviation logic in `formatKpi()`
    (`app/dashboard-renderer.js`). Both tools format numbers the same way
    today; if one diverges, it should be intentional.
- **Chart data shapes**
  - Single-series:    `[{label, value}]`
  - Stacked:          `[{label, series, value}]` → reshaped to `{label, values[]}`
  - Sankey:           `[{label, series, value}]` → reshaped to `{source, target, value}`
  - Timeline:         `[{date, label, text, iconRef}]` (date, label, text are
    free-form strings; iconRef is a humanitarian icon key from the same
    GitHub catalog everything else uses)
  - If any of these wire formats change, both tools need to agree.
- **Chart type names**
  - `hbar`, `vbar`, `stacked-bar`, `stacked-col`, `cluster`, `cluster-donut`,
    `donut`, `pie`, `bubble`, `line`, `sankey`, `icon`, `table`,
    `keyfigures`, `timeline`. Renaming or adding a type means both tools
    need to know about it.
- **Chart engine semantics that aren't web-specific**
  - Donut/pie percentage calculation
  - Color palette assignment order
  - Default sort order for chart slices
  - Stacked-data normalisation
  - These are math, not layout, so they should match across tools unless
    the user wants them to diverge.

### NOT cross-tool concerns (web-only, never flag these)

These are genuinely web-specific and should NEVER trigger a sibling check:

- CSS, layout, container queries, responsive behaviour
- ResizeObserver, `paintChart`, `observeAndRender`, height locking
- Drag-resize handles, masonry experiments, auto-layout button
- Print preview window, `exporter.js`, html2canvas, jsPDF
- The `box-shadow: inset` → `kpi-bar` div fix (html2canvas-only bug)
- bandScale overrides (`withFixedBandScale`) — these compress bars to fit
  responsive widths, which the plugin doesn't need
- viewBox auto-fit (`fitViewBoxToContent`) — same reason
- Donut/pie/bubble width caps (`ASPECT_LOCKED`, `ASPECT_LOCK_MAX`)
- Inspector / table editor / sidebar / FAB / share link / footer toolbar

When in doubt, ask the user — but lean toward NOT flagging for anything
under `app/dashboard-renderer.js`'s rendering layer, `app/main.js`'s editor
shell, or `app/exporter.js`. Lean toward flagging for anything inside
`app/charts/*.js` that touches data math, color logic, or label content
(as opposed to layout / responsiveness).

---

## Project layout

```
ocha_dataviz_online/
├── app/                       editor app
│   ├── charts/                chart engine (was a fork; now owned here)
│   ├── csv-parser.js          CSV → dashboard JSON
│   ├── dashboard-model.js     in-memory data model + helpers
│   ├── dashboard-renderer.js  JSON → DOM, includes paintChart + masonry
│   ├── exporter.js            PNG (raster) + PDF (vector via print preview)
│   ├── main.js                editor shell, click routing, drag-resize
│   ├── share-link.js          gzip + base64 URL fragment encoding
│   ├── sample-data.js
│   └── table-editor.js        inspector / editor panels
├── assets/
├── vendor/
├── index.html
└── styles.css
```

## Project Owner
Javier Cueto

## Maintained by
**OCHA Brand and Design Unit (BDU)**
- Team: ochavisual@un.org
- Focal point: Javier Cueto (cuetoj@un.org)
