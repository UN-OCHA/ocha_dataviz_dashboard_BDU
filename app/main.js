/**
 * main.js — app shell for the editor.
 *
 * Two ways to edit a dashboard:
 *   1. Click a chart on the canvas → the right inspector panel opens with a
 *      spreadsheet-style table editor for that chart's data.
 *   2. Bulk import / paste a CSV via the collapsible "CSV source" panel on
 *      the left.
 *
 * The dashboard model (in-memory JSON) is the source of truth. Both editing
 * paths mutate that model and trigger a re-render.
 */

/* global DashboardModel, CSVParser, DashboardRenderer, SampleData,
          Exporter, ShareLink, TableEditor */

(function () {
  "use strict";

  var appRoot, textarea, messagesEl, previewEl, previewMount,
      styleSelect, titleInput, inspectorEl, csvCollapsible, footerInput;

  var currentDashboard = null;
  var selectedChartId = null;

  function init() {
    appRoot      = document.querySelector(".app");
    textarea     = document.getElementById("csv-input");
    messagesEl   = document.getElementById("messages");
    previewEl    = document.getElementById("preview");
    previewMount = document.getElementById("preview-mount");
    styleSelect  = document.getElementById("style-select");
    titleInput   = document.getElementById("title-input");
    inspectorEl  = document.getElementById("inspector");
    csvCollapsible = document.getElementById("csv-collapsible");
    footerInput  = document.getElementById("footer-input");

    // CSV section starts collapsed
    csvCollapsible.querySelector(".collapsible-header").addEventListener("click", function () {
      csvCollapsible.classList.toggle("open");
    });

    // Sidebar collapse toggle
    var sidebarToggle = document.getElementById("btn-sidebar-toggle");
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function () {
        appRoot.classList.toggle("sidebar-collapsed");
      });
    }

    // Bootstrap dashboard
    var saved = localStorage.getItem("ocha-dataviz-last-csv");
    textarea.value = saved || SampleData.csv;

    // If a share link is present, load that and skip CSV parsing
    if (window.ShareLink && location.hash.indexOf("#d=") === 0) {
      ShareLink.decodeFromHash().then(function (d) {
        if (d) {
          d = DashboardModel.ensureChartIds(d);
          currentDashboard = d;
          styleSelect.value = d.style;
          titleInput.value = d.title;
          setFooterEditorHtml(d.footer || "");
          renderPreview();
          return;
        }
        rerenderFromCSV();
      });
    } else {
      rerenderFromCSV();
    }

    // Debounced re-parse from textarea
    var timer = null;
    textarea.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(rerenderFromCSV, 200);
    });

    styleSelect.addEventListener("change", function () {
      if (currentDashboard) {
        currentDashboard.style = styleSelect.value;
        renderPreview();
      }
    });

    titleInput.addEventListener("input", function () {
      if (currentDashboard) {
        currentDashboard.title = titleInput.value;
        renderPreview();
      }
    });

    // Footer is a contenteditable div with a tiny formatting toolbar.
    // We persist the footer as the same lightweight markdown the renderer
    // already understands (`**bold**` and `[text](url)`), so the dashboard
    // JSON shape doesn't change and existing share links keep working.
    footerInput.addEventListener("input", function () {
      if (currentDashboard) {
        currentDashboard.footer = footerEditorToMarkdown();
        renderPreview();
      }
    });
    footerInput.addEventListener("blur", function () {
      if (currentDashboard) {
        currentDashboard.footer = footerEditorToMarkdown();
        renderPreview();
      }
    });
    // Cmd/Ctrl+B for bold (browsers handle it natively, but we still want
    // to flush our markdown serialisation right after).
    footerInput.addEventListener("keyup", function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === "b" || ev.key === "B")) {
        currentDashboard.footer = footerEditorToMarkdown();
        renderPreview();
      }
    });
    // Toolbar buttons
    var footerToolbar = document.querySelector(".footer-toolbar");
    if (footerToolbar) {
      footerToolbar.addEventListener("mousedown", function (ev) {
        // Prevent the editor from losing focus when a tool button is clicked
        if (ev.target.closest(".footer-tool")) ev.preventDefault();
      });
      footerToolbar.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".footer-tool");
        if (!btn) return;
        var cmd = btn.getAttribute("data-cmd");
        footerInput.focus();
        if (cmd === "bold") {
          document.execCommand("bold", false, null);
        } else if (cmd === "link") {
          var existing = currentLinkHref();
          var url = prompt("Link URL (https:// or mailto:)", existing || "https://");
          if (url) {
            // execCommand("createLink") needs a non-empty selection
            if (document.getSelection().isCollapsed && !existing) {
              document.execCommand("insertText", false, url);
              // re-select the just-inserted text
              var sel = window.getSelection();
              var r = sel.getRangeAt(0);
              r.setStart(r.endContainer, r.endOffset - url.length);
              sel.removeAllRanges(); sel.addRange(r);
            }
            document.execCommand("createLink", false, url);
          }
        } else if (cmd === "unlink") {
          document.execCommand("unlink", false, null);
        }
        currentDashboard.footer = footerEditorToMarkdown();
        renderPreview();
      });
    }
    // Auto layout button
    var autoLayoutBtn = document.getElementById("btn-auto-layout");
    if (autoLayoutBtn) {
      autoLayoutBtn.addEventListener("click", function () {
        if (!currentDashboard) return;
        autoArrangeSections(currentDashboard);
        renderPreview();
      });
    }

    // Export buttons
    document.getElementById("btn-pdf").addEventListener("click", function () {
      if (!currentDashboard) return;
      Exporter.exportPDF(currentDashboard, previewMount);
    });
    document.getElementById("btn-png").addEventListener("click", function () {
      if (!currentDashboard) return;
      Exporter.exportPNG(currentDashboard, previewMount);
    });
    document.getElementById("btn-share").addEventListener("click", function () {
      if (!currentDashboard) return;
      if (!window.ShareLink) return;
      ShareLink.encode(currentDashboard).then(function (url) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            showMessage("Share link copied to clipboard.", false);
          }, function () {
            prompt("Copy this share link:", url);
          });
        } else {
          prompt("Copy this share link:", url);
        }
      });
    });

    // Click handling: route to the right editor based on what was clicked.
    previewEl.addEventListener("click", function (ev) {
      // 0a. Reorder arrow (chart-level OR section-level depending on host)
      var arrow = ev.target.closest(".card-arrow");
      if (arrow) {
        var dir = arrow.getAttribute("data-move") === "up" ? -1 : 1;
        var chartHost = arrow.closest(".chart-card");
        if (chartHost && chartHost.hasAttribute("data-chart-id")) {
          handleChartReorder(chartHost, dir);
        } else {
          var sectionHost = arrow.closest(".section-card");
          if (sectionHost) handleSectionReorder(sectionHost, dir);
        }
        ev.stopPropagation();
        return;
      }
      // 0b. "Add chart to this section" button
      var addBtn = ev.target.closest(".section-add-chart");
      if (addBtn) {
        var sIdx = parseInt(addBtn.getAttribute("data-add-chart-section"), 10);
        if (!isNaN(sIdx)) addChartToSectionPrompt(sIdx);
        ev.stopPropagation();
        return;
      }
      // 1. KPI card or KPI row
      var kpiHost = ev.target.closest(".kpi-row, .kpi-card");
      if (kpiHost) {
        selectKpis();
        ev.stopPropagation();
        return;
      }
      // 2. Section text block
      var sectionTextEl = ev.target.closest("[data-section-text-index]");
      if (sectionTextEl) {
        var stIdx = parseInt(sectionTextEl.getAttribute("data-section-text-index"), 10);
        if (!isNaN(stIdx)) selectSectionText(stIdx);
        ev.stopPropagation();
        return;
      }
      // 3. Section header (the title bar of a section card)
      var sectionHead = ev.target.closest("[data-section-head]");
      if (sectionHead) {
        var sIdx2 = parseInt(sectionHead.getAttribute("data-section-head"), 10);
        if (!isNaN(sIdx2)) selectSection(sIdx2);
        ev.stopPropagation();
        return;
      }
      // 4. Chart card (must have data-chart-id)
      var card = ev.target.closest(".chart-card[data-chart-id]");
      if (card) {
        var id = card.getAttribute("data-chart-id");
        if (id) selectChart(id);
        ev.stopPropagation();
        return;
      }
      // Clicked outside any editable element
      closeInspector();
    });

    // ── Section resize handle (drag to set column span 1-12) ─
    // Pointerdown on the handle starts a drag. We compute the target span
    // live from the cursor X relative to the section's left edge and the
    // grid's column step (column width + grid gap), update section.span on
    // the fly, and re-render. Releasing the pointer commits.
    previewEl.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest(".section-resize");
      if (!handle) return;
      ev.preventDefault();
      ev.stopPropagation();

      var sectionCard = handle.closest(".section-card");
      if (!sectionCard || !currentDashboard) return;
      var idx = parseInt(sectionCard.getAttribute("data-section-index"), 10);
      if (isNaN(idx) || !currentDashboard.sections[idx]) return;

      startSectionResize(idx, sectionCard, ev.clientX);
    });

    // ── Floating + button to add new modules ─────────
    var fabBtn = document.getElementById("fab-add");
    var fabMenu = document.getElementById("fab-menu");
    fabBtn.addEventListener("click", function (ev) {
      var open = fabMenu.classList.toggle("open");
      fabBtn.classList.toggle("open", open);
      ev.stopPropagation();
    });
    document.addEventListener("click", function (ev) {
      if (!fabMenu.contains(ev.target) && ev.target !== fabBtn) {
        fabMenu.classList.remove("open");
        fabBtn.classList.remove("open");
      }
    });
    fabMenu.addEventListener("click", function (ev) {
      var item = ev.target.closest(".fab-menu-item");
      if (!item) return;
      var sectionKind = item.getAttribute("data-add-section");
      var sectionChartType = item.getAttribute("data-add-section-chart");
      if (sectionKind) {
        addNewSection(sectionKind);
      } else if (sectionChartType) {
        addNewSection("chart", sectionChartType);
      }
      fabMenu.classList.remove("open");
      fabBtn.classList.remove("open");
      ev.stopPropagation();
    });
  }

  // ── Reorder handlers ─────────────────────────────────
  function handleChartReorder(card, direction) {
    if (!currentDashboard || !card) return;
    var chartId = card.getAttribute("data-chart-id");
    if (!chartId) return;
    DashboardModel.moveChartWithinSection(currentDashboard, chartId, direction);
    renderPreview();
  }

  // Drag-resize a section's column span. We snap on grid column boundaries
  // by reading the parent .page-grid's actual column-template metrics, so
  // the snap matches whatever the grid is rendering at right now (12-col,
  // 6-col container-query break, etc.).
  function startSectionResize(sectionIndex, sectionCard, startX) {
    if (!currentDashboard) return;
    var section = currentDashboard.sections[sectionIndex];
    if (!section) return;

    var grid = sectionCard.parentNode;
    if (!grid || !grid.classList.contains("page-grid")) return;

    var gridRect = grid.getBoundingClientRect();
    var cardRect = sectionCard.getBoundingClientRect();
    var styles = window.getComputedStyle(grid);
    // Read the actual rendered column count from grid-template-columns,
    // falling back to 12 (the design grid).
    var cols = (styles.gridTemplateColumns || "").trim().split(/\s+/).length || 12;
    // Read the actual gap (column-gap) in px.
    var gapPx = parseFloat(styles.columnGap || styles.gap || "0") || 0;
    // Effective col + gap step in px
    var totalGap = gapPx * (cols - 1);
    var colW = (gridRect.width - totalGap) / cols;
    var stepW = colW + gapPx;

    // The section's left column index (1-based) within the grid. We
    // approximate it from cardRect.left vs gridRect.left.
    var leftOffsetPx = cardRect.left - gridRect.left;
    var startCol = Math.max(0, Math.round(leftOffsetPx / stepW));   // 0..cols-1
    var maxSpan = cols - startCol;
    var minSpan = 1;

    var currentSpan = section.span || 4;
    var badgeValue = sectionCard.querySelector(".section-resize-badge .badge-value");

    sectionCard.classList.add("section-resizing");
    document.body.classList.add("section-resizing");

    function onMove(e) {
      var x = e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX);
      if (x == null) return;
      // Mouse position in grid coords → which column the right edge sits on.
      var gridX = x - gridRect.left;
      // End col index (1-based, exclusive). Snap to nearest column step.
      var rightCol = Math.round((gridX + gapPx / 2) / stepW);
      var span = rightCol - startCol;
      span = Math.max(minSpan, Math.min(maxSpan, span));
      if (span === currentSpan) return;
      currentSpan = span;
      section.span = span;
      // Live update the badge text without a full re-render flicker
      if (badgeValue) badgeValue.textContent = span + "/" + cols;
      // Re-render so the layout updates immediately. Charts re-paint via
      // their ResizeObserver after the new width settles.
      renderPreview();
      // The card was destroyed by re-render — re-find it for further drags
      sectionCard = previewMount.querySelector(
        '.section-card[data-section-index="' + sectionIndex + '"]'
      );
      if (sectionCard) {
        sectionCard.classList.add("section-resizing");
        badgeValue = sectionCard.querySelector(".section-resize-badge .badge-value");
        // Re-measure grid metrics in case wrapping changed the row layout.
        var newGridRect = grid.getBoundingClientRect();
        var newCardRect = sectionCard.getBoundingClientRect();
        gridRect = newGridRect;
        cardRect = newCardRect;
        leftOffsetPx = cardRect.left - gridRect.left;
        startCol = Math.max(0, Math.round(leftOffsetPx / stepW));
        maxSpan = cols - startCol;
      }
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("section-resizing");
      // Final clean re-render so the badge picks up the committed span
      renderPreview();
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);

    // Run one move with the initial position so the badge updates immediately
    onMove({ clientX: startX });
  }

  function handleSectionReorder(sectionCard, direction) {
    if (!currentDashboard || !sectionCard) return;
    var idx = parseInt(sectionCard.getAttribute("data-section-index"), 10);
    if (isNaN(idx)) return;
    DashboardModel.moveSectionInOrder(currentDashboard, idx, direction);
    renderPreview();
  }

  // ── Add helpers ──────────────────────────────────────
  function addChartToSectionPrompt(sectionIndex) {
    if (!currentDashboard) return;
    // For now: default to hbar. The inspector lets the user change the type.
    var newId = DashboardModel.addChartToSection(currentDashboard, sectionIndex, "hbar");
    renderPreview();
    setTimeout(function () { selectChart(newId); }, 80);
  }

  function addNewSection(kind, chartType) {
    if (!currentDashboard) return;
    var opts = { title: "New section" };
    if (kind === "text") {
      opts.text = "Click to edit this text block.";
    } else if (kind === "chart" && chartType) {
      opts.starterChartType = chartType;
    }
    var newSi = DashboardModel.addSection(currentDashboard, opts);
    renderPreview();
    setTimeout(function () { selectSection(newSi); }, 80);
  }

  function rerenderFromCSV() {
    var text = textarea.value;
    localStorage.setItem("ocha-dataviz-last-csv", text);

    var result = CSVParser.parse(text);
    if (!result.ok) {
      showMessages(result.errors, true);
      currentDashboard = null;
      previewMount.innerHTML = '<div class="empty-state">Fix the errors on the left to preview your dashboard.</div>';
      return;
    }
    if (result.warnings && result.warnings.length > 0) {
      showMessages(result.warnings, false);
    } else {
      hideMessages();
    }

    var d = DashboardModel.ensureChartIds(result.dashboard);
    currentDashboard = d;
    styleSelect.value = d.style;
    titleInput.value = d.title;
    setFooterEditorHtml(d.footer || "");
    selectedChartId = null;
    closeInspector();
    renderPreview();
  }

  function renderPreview() {
    if (!currentDashboard) return;
    DashboardRenderer.render(currentDashboard, previewMount);
    if (selectedChartId) {
      var card = previewMount.querySelector('[data-chart-id="' + selectedChartId + '"]');
      if (card) card.classList.add("selected");
    }
  }

  // No-op kept for compatibility with the existing call sites; the
  // row-aligned grid layout doesn't need a JS pack pass.
  function relayoutMasonry() {}

  function clearSelection() {
    Array.from(previewMount.querySelectorAll(".selected")).forEach(function (el) {
      el.classList.remove("selected");
    });
  }

  function selectChart(id) {
    selectedChartId = id;
    clearSelection();
    var card = previewMount.querySelector('[data-chart-id="' + id + '"]');
    if (card) card.classList.add("selected");

    var loc = DashboardModel.findChart(currentDashboard, id);
    if (!loc) { closeInspector(); return; }

    appRoot.classList.add("inspector-open");
    TableEditor.mount(inspectorEl, {
      dashboard: currentDashboard,
      chartLocation: loc,
      onChange: function () { renderPreview(); },
      onClose: function () { closeInspector(); }
    });
    setTimeout(relayoutMasonry, 220);
  }

  function selectKpis() {
    selectedChartId = null;
    clearSelection();
    var row = previewMount.querySelector(".kpi-row");
    if (row) row.classList.add("selected");

    appRoot.classList.add("inspector-open");
    TableEditor.mountKpis(inspectorEl, {
      dashboard: currentDashboard,
      onChange: function () { renderPreview(); },
      onClose: function () { closeInspector(); }
    });
    setTimeout(relayoutMasonry, 220);
  }

  function selectSectionText(sectionIndex) {
    selectedChartId = null;
    clearSelection();
    var el = previewMount.querySelector('[data-section-text-index="' + sectionIndex + '"]');
    if (el) {
      var card = el.closest(".section-card");
      if (card) card.classList.add("selected");
    }

    appRoot.classList.add("inspector-open");
    TableEditor.mountSectionText(inspectorEl, {
      dashboard: currentDashboard,
      sectionIndex: sectionIndex,
      onChange: function () { renderPreview(); },
      onClose: function () { closeInspector(); }
    });
    setTimeout(relayoutMasonry, 220);
  }

  function selectSection(sectionIndex) {
    selectedChartId = null;
    clearSelection();
    var card = previewMount.querySelector('.section-card[data-section-index="' + sectionIndex + '"]');
    if (card) card.classList.add("selected");

    appRoot.classList.add("inspector-open");
    TableEditor.mountSection(inspectorEl, {
      dashboard: currentDashboard,
      sectionIndex: sectionIndex,
      onChange: function () { renderPreview(); },
      onClose: function () { closeInspector(); }
    });
    setTimeout(relayoutMasonry, 220);
  }

  function closeInspector() {
    selectedChartId = null;
    appRoot.classList.remove("inspector-open");
    inspectorEl.innerHTML = "";
    clearSelection();
    setTimeout(relayoutMasonry, 220);
  }

  // ── Footer editor helpers ───────────────────────────
  // The footer is stored in the dashboard JSON as lightweight markdown
  // (`**bold**` and `[text](url)`). The contenteditable element holds HTML,
  // so we convert in both directions.

  function setFooterEditorHtml(markdown) {
    if (!footerInput) return;
    footerInput.innerHTML = markdownToFooterHtml(markdown || "");
  }

  function markdownToFooterHtml(src) {
    var safe = escapeHtml(src);
    safe = safe.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, url) {
      if (!/^(https?:\/\/|mailto:)/i.test(url)) return text;
      return '<a href="' + url + '">' + text + '</a>';
    });
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\n/g, "<br>");
    return safe;
  }

  // Walk the contenteditable's DOM and serialise it back to the same
  // markdown subset. Anything not understood is dropped to plain text.
  function footerEditorToMarkdown() {
    if (!footerInput) return "";
    function walk(node) {
      if (node.nodeType === 3) return node.nodeValue || "";   // text
      if (node.nodeType !== 1) return "";
      var tag = node.tagName.toLowerCase();
      var inner = "";
      for (var i = 0; i < node.childNodes.length; i++) {
        inner += walk(node.childNodes[i]);
      }
      if (tag === "br") return "\n";
      if (tag === "div" || tag === "p") {
        // Block boundaries → newline
        return (inner ? inner + "\n" : "\n");
      }
      if (tag === "strong" || tag === "b") return "**" + inner + "**";
      if (tag === "a") {
        var href = node.getAttribute("href") || "";
        if (/^(https?:\/\/|mailto:)/i.test(href)) {
          return "[" + inner + "](" + href + ")";
        }
        return inner;
      }
      return inner;
    }
    var out = walk(footerInput).replace(/\n+$/, "");
    return out;
  }

  // If the cursor is inside an <a>, return its href.
  function currentLinkHref() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var node = sel.getRangeAt(0).startContainer;
    while (node && node !== footerInput) {
      if (node.nodeType === 1 && node.tagName === "A") return node.getAttribute("href");
      node = node.parentNode;
    }
    return null;
  }

  // ── Auto layout ─────────────────────────────────────
  // Walks the dashboard's sections and assigns each one a span (1–12) so
  // every row exactly fills the 12-column dashboard width. Greedy packer:
  //   1. Compute each section's MINIMUM span needed for its content.
  //   2. Walk sections in order, accumulating into a row until the next
  //      section wouldn't fit.
  //   3. Distribute leftover columns proportionally so the row sums to 12.
  function autoArrangeSections(d) {
    if (!d || !Array.isArray(d.sections) || d.sections.length === 0) return;
    var DR = window.DashboardRenderer;
    function minSpanFor(section) {
      // Use the renderer's logic when available; otherwise fall back to a
      // sensible default (4 = 3 per row).
      if (DR && typeof DR._sectionMinSpan === "function") {
        return DR._sectionMinSpan(section);
      }
      var charts = section.charts || [];
      var n = charts.length;
      if (n === 0) return 4;
      // Rough heuristic mirroring the renderer's chartMinSpan
      var min = 3;
      for (var i = 0; i < n; i++) {
        var t = charts[i].type;
        if (t === "line" || t === "sankey" || t === "table") min = Math.max(min, 6);
        else if (t === "vbar" || t === "stacked-col") {
          var cnt = (charts[i].data || []).length;
          min = Math.max(min, Math.min(12, Math.ceil(cnt / 4) + 2));
        }
      }
      return min;
    }

    var items = d.sections.map(function (section) {
      return { section: section, min: Math.min(12, Math.max(1, minSpanFor(section))) };
    });

    // Greedy first-fit packing into rows of up to 4 sections.
    var rows = [];
    var current = [];
    var used = 0;
    items.forEach(function (it) {
      if (current.length >= 4 || used + it.min > 12) {
        if (current.length > 0) rows.push({ items: current, used: used });
        current = [];
        used = 0;
      }
      current.push(it);
      used += it.min;
    });
    if (current.length > 0) rows.push({ items: current, used: used });

    // Re-balance: never leave a row with a single section if we can help it.
    // A lonely section gets stretched to span 12, which looks unbalanced —
    // far better to share that row with a neighbour so charts stay
    // proportional. We repeatedly steal one section from a fatter neighbour
    // (rows of 3+, then rows of 2+) into the lonely row, as long as the
    // resulting row total still fits within 12 columns.
    function totalUsed(r) {
      var t = 0;
      for (var i = 0; i < r.items.length; i++) t += r.items[i].min;
      return t;
    }
    if (rows.length >= 2) {
      var safety = 50;
      while (safety-- > 0) {
        var orphanIdx = -1;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].items.length === 1) { orphanIdx = i; break; }
        }
        if (orphanIdx < 0) break;
        var orphan = rows[orphanIdx];
        var orphanUsed = totalUsed(orphan);

        // Find the best donor: prefer the adjacent row with the most items
        // (and where the closest section can actually fit into the orphan row).
        function tryDonate(donorIdx, takeFromEnd) {
          if (donorIdx < 0 || donorIdx >= rows.length) return false;
          var donor = rows[donorIdx];
          if (donor.items.length < 2) return false;
          var item = takeFromEnd
            ? donor.items[donor.items.length - 1]
            : donor.items[0];
          if (orphanUsed + item.min > 12) return false;
          // Pull it across, preserving section order.
          if (takeFromEnd) {
            donor.items.pop();
            orphan.items.unshift(item);
          } else {
            donor.items.shift();
            orphan.items.push(item);
          }
          return true;
        }
        // Try previous row first (steal its trailing section), then next.
        var donated = tryDonate(orphanIdx - 1, true) ||
                      tryDonate(orphanIdx + 1, false);
        if (!donated) break;   // nothing fits — leave it as a full-width row
      }
    }

    // Recompute used totals after rebalancing.
    rows.forEach(function (r) { r.used = totalUsed(r); });

    // Distribute leftover columns within each row so it sums to exactly 12.
    rows.forEach(function (row) {
      var leftover = 12 - row.used;
      while (leftover > 0) {
        // Hand the next column to whichever item is currently smallest, so
        // the row tends toward equal widths.
        var idx = 0;
        for (var i = 1; i < row.items.length; i++) {
          if (row.items[i].min < row.items[idx].min) idx = i;
        }
        row.items[idx].min += 1;
        leftover -= 1;
      }
      row.items.forEach(function (it) { it.section.span = it.min; });
    });
  }

  function showMessage(text, isError) { showMessages([text], !!isError); }
  function showMessages(list, isError) {
    messagesEl.className = "messages" + (isError ? " error" : "");
    messagesEl.style.display = "block";
    if (list.length === 1) {
      messagesEl.textContent = list[0];
    } else {
      messagesEl.innerHTML = "<strong>" + (isError ? "Errors" : "Notices") + ":</strong><ul>" +
        list.map(function (m) { return "<li>" + escapeHtml(m) + "</li>"; }).join("") + "</ul>";
    }
  }
  function hideMessages() { messagesEl.style.display = "none"; }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
