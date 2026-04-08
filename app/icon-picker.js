/**
 * IconPicker — reusable inline picker component for the inspector.
 *
 * Supports two modes:
 *   - mode "icon": humanitarian icons from the GitHub-backed IconLoader.
 *     Search box + family filter + paginated grid of SVG thumbnails.
 *   - mode "flag": country flags from the static FlagLoader.
 *     Search box + grid of country flag thumbnails.
 *
 * Usage (from table-editor.js):
 *
 *   var picker = IconPicker.create({
 *     mode: "icon",                    // or "flag"
 *     current: kpi.iconKey || null,
 *     onPick: function (key) {
 *       kpi.iconKey = key;             // dashboard JSON field
 *       ctx.onChange();
 *     },
 *     onClear: function () {
 *       delete kpi.iconKey;
 *       ctx.onChange();
 *     }
 *   });
 *   inspectorBody.appendChild(picker.element);
 *
 * The picker mounts closed (shows a "Choose icon" button with the current
 * selection preview) and only expands the grid when the user clicks.
 * This keeps the inspector compact by default.
 */

/* global IconPicker:true, IconLoader, FlagLoader */

var IconPicker = (function () {
  "use strict";

  var PAGE_SIZE = 60;  // icons per page of the grid

  function create(opts) {
    opts = opts || {};
    var mode = opts.mode || "icon";
    var current = opts.current || null;
    var onPick = opts.onPick || function () {};
    var onClear = opts.onClear || function () {};

    var root = document.createElement("div");
    root.className = "icon-picker icon-picker-" + mode;

    // ── Trigger row (closed state) ─────────────────────
    var trigger = document.createElement("div");
    trigger.className = "icon-picker-trigger";
    root.appendChild(trigger);

    var preview = document.createElement("div");
    preview.className = "icon-picker-preview";
    trigger.appendChild(preview);

    var label = document.createElement("button");
    label.type = "button";
    label.className = "icon-picker-open-btn";
    trigger.appendChild(label);

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "icon-picker-clear";
    clearBtn.textContent = "\u2715";
    clearBtn.title = "Remove";
    clearBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      current = null;
      renderPreview();
      onClear();
    });
    trigger.appendChild(clearBtn);

    // ── Expanded grid area ────────────────────────────
    var panel = document.createElement("div");
    panel.className = "icon-picker-panel";
    panel.style.display = "none";
    root.appendChild(panel);

    var controls = document.createElement("div");
    controls.className = "icon-picker-controls";
    panel.appendChild(controls);

    var searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "icon-picker-search";
    searchInput.placeholder = mode === "flag" ? "Search country\u2026" : "Search icons\u2026";
    controls.appendChild(searchInput);

    var familySelect = null;
    if (mode === "icon") {
      familySelect = document.createElement("select");
      familySelect.className = "icon-picker-family";
      controls.appendChild(familySelect);
    }

    var refreshBtn = null;
    if (mode === "icon") {
      refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.className = "icon-picker-refresh";
      refreshBtn.textContent = "\u21BB";
      refreshBtn.title = "Refresh icons from GitHub";
      controls.appendChild(refreshBtn);
    }

    var status = document.createElement("div");
    status.className = "icon-picker-status";
    panel.appendChild(status);

    var grid = document.createElement("div");
    grid.className = "icon-picker-grid";
    panel.appendChild(grid);

    var footer = document.createElement("div");
    footer.className = "icon-picker-footer";
    panel.appendChild(footer);

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "icon-picker-nav";
    prevBtn.textContent = "\u2039 Prev";
    footer.appendChild(prevBtn);

    var pageLabel = document.createElement("span");
    pageLabel.className = "icon-picker-page";
    footer.appendChild(pageLabel);

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "icon-picker-nav";
    nextBtn.textContent = "Next \u203a";
    footer.appendChild(nextBtn);

    // ── State ──────────────────────────────────────────
    var allItems = [];        // [{ key, name, family? }]
    var filtered = [];
    var page = 0;
    var isOpen = false;
    var familyFilter = "";
    var searchQuery = "";

    // ── Trigger interactions ──────────────────────────
    label.addEventListener("click", function () {
      if (isOpen) { collapse(); }
      else        { expand(); }
    });
    trigger.addEventListener("click", function (ev) {
      if (ev.target === trigger || ev.target === preview) {
        if (isOpen) { collapse(); }
        else        { expand(); }
      }
    });

    function expand() {
      isOpen = true;
      panel.style.display = "";
      root.classList.add("open");
      ensureLoaded();
    }
    function collapse() {
      isOpen = false;
      panel.style.display = "none";
      root.classList.remove("open");
    }

    // ── Data loading ──────────────────────────────────
    var loaded = false;
    function ensureLoaded() {
      if (loaded) return;
      if (mode === "flag") {
        allItems = FlagLoader.listAll();
        loaded = true;
        rebuild();
        return;
      }
      // icon mode: pull catalog from GitHub-backed IconLoader
      status.textContent = "Loading icon catalog\u2026";
      IconLoader.loadMetadata().then(function (meta) {
        allItems = meta.icons;
        status.textContent = allItems.length + " icons \u00b7 updated " +
          (meta.lastUpdated || "unknown");
        // Populate family dropdown
        if (familySelect) {
          familySelect.innerHTML = "";
          var optAll = document.createElement("option");
          optAll.value = "";
          optAll.textContent = "All families (" + allItems.length + ")";
          familySelect.appendChild(optAll);
          meta.families.forEach(function (fam) {
            var count = (meta.byFamily[fam] || []).length;
            if (!count) return;
            var o = document.createElement("option");
            o.value = fam;
            o.textContent = fam + " (" + count + ")";
            familySelect.appendChild(o);
          });
        }
        loaded = true;
        rebuild();
      }).catch(function (err) {
        status.textContent = "Couldn't load icons: " + err.message;
      });
    }

    // ── Filtering + rendering ─────────────────────────
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      page = 0;
      rebuild();
    });
    if (familySelect) {
      familySelect.addEventListener("change", function () {
        familyFilter = familySelect.value;
        page = 0;
        rebuild();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        status.textContent = "Refreshing\u2026";
        loaded = false;
        IconLoader.refresh().then(function () { ensureLoaded(); });
      });
    }
    prevBtn.addEventListener("click", function () {
      if (page > 0) { page--; rebuild(); }
    });
    nextBtn.addEventListener("click", function () {
      var maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
      if (page < maxPage) { page++; rebuild(); }
    });

    function rebuild() {
      filtered = allItems.filter(function (it) {
        if (familyFilter && it.family !== familyFilter) return false;
        if (searchQuery) {
          var hay = (it.name + " " + it.key).toLowerCase();
          if (hay.indexOf(searchQuery) === -1) return false;
        }
        return true;
      });
      var maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
      if (page > maxPage) page = maxPage;
      var slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      grid.innerHTML = "";
      slice.forEach(function (it) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "icon-picker-cell";
        cell.title = it.name;
        cell.setAttribute("data-key", it.key);
        if (it.key === current) cell.classList.add("selected");
        var thumb = document.createElement("div");
        thumb.className = "icon-picker-cell-thumb";
        cell.appendChild(thumb);
        var lbl = document.createElement("div");
        lbl.className = "icon-picker-cell-label";
        lbl.textContent = it.name;
        cell.appendChild(lbl);
        loadThumb(thumb, it.key);
        cell.addEventListener("click", function () {
          current = it.key;
          grid.querySelectorAll(".icon-picker-cell").forEach(function (c) {
            c.classList.toggle("selected", c.getAttribute("data-key") === current);
          });
          renderPreview();
          onPick(it.key);
        });
        grid.appendChild(cell);
      });

      pageLabel.textContent = filtered.length
        ? "Page " + (page + 1) + " / " + (maxPage + 1) + " \u00b7 " + filtered.length + " results"
        : "No results";
      prevBtn.disabled = page === 0;
      nextBtn.disabled = page >= maxPage;
    }

    function loadThumb(thumbEl, key) {
      var loader = mode === "flag" ? FlagLoader : IconLoader;
      var cached = loader.getCachedSvg(key);
      if (cached) { thumbEl.innerHTML = cached; return; }
      (mode === "flag" ? FlagLoader.loadFlagSvg(key) : IconLoader.loadIconSvg(key))
        .then(function (svg) { thumbEl.innerHTML = svg; })
        .catch(function () {
          thumbEl.innerHTML = "<span class='icon-picker-miss'>?</span>";
        });
    }

    function renderPreview() {
      if (!current) {
        preview.innerHTML = "<span class='icon-picker-empty'>No icon</span>";
        label.textContent = mode === "flag" ? "Choose flag\u2026" : "Choose icon\u2026";
        clearBtn.style.display = "none";
        return;
      }
      var loader = mode === "flag" ? FlagLoader : IconLoader;
      var cached = loader.getCachedSvg(current);
      preview.innerHTML = cached
        ? cached
        : "<span class='icon-picker-loading'>\u2026</span>";
      if (!cached) {
        (mode === "flag" ? FlagLoader.loadFlagSvg(current) : IconLoader.loadIconSvg(current))
          .then(function (svg) { if (current) preview.innerHTML = svg; })
          .catch(function () {});
      }
      // Best-effort display name — for icons we rely on metadata if loaded,
      // for flags we look up in FlagsData
      var displayName = current;
      if (mode === "flag") {
        var rec = FlagLoader.resolve(current);
        if (rec) displayName = rec.name;
      } else if (loaded) {
        for (var i = 0; i < allItems.length; i++) {
          if (allItems[i].key === current) { displayName = allItems[i].name; break; }
        }
      }
      label.textContent = displayName;
      clearBtn.style.display = "";
    }

    renderPreview();

    return {
      element: root,
      setCurrent: function (key) { current = key; renderPreview(); },
      getCurrent: function () { return current; }
    };
  }

  return { create: create };
})();
