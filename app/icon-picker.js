/**
 * IconPicker — inline inspector picker for humanitarian icons + flags.
 *
 * Visual language mirrors the Illustrator plugin's icons-panel: search
 * input at the top, OCHA-style color swatch bar, collapsible family
 * filter chip row (icons only), and a scrollable list grouped by family
 * with icon cards underneath each family header. No pagination — the
 * full catalog loads into a scrollable container and the user scrolls.
 *
 * Two modes:
 *   - mode "icon": humanitarian icons from IconLoader (GitHub-backed)
 *   - mode "flag": country flags from FlagLoader (static assets)
 *
 * Usage:
 *   var picker = IconPicker.create({
 *     mode: "icon",
 *     current: kpi.iconKey || null,
 *     accent: "#009EDB",       // current dashboard style accent
 *     onPick:  function (key) { ... },
 *     onClear: function ()    { ... }
 *   });
 *   container.appendChild(picker.element);
 *
 * Picker behaviour:
 *   - Mounts closed: shows a card-style trigger with the chosen icon
 *     (or an "Add" affordance if none), plus an inline clear (✕) button.
 *   - Click anywhere on the trigger card to open the expanded panel.
 *   - Expanded panel has an explicit close (×) in its header.
 *   - The expanded panel is an overlay inside the inspector (not a modal)
 *     so the inspector context is preserved.
 *
 * Cross-tool note: the UX mirrors the plugin's icons-panel, but the
 * component is web-only — nothing here is shared with the plugin.
 */

/* global IconPicker:true, IconLoader, FlagLoader */

var IconPicker = (function () {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var mode    = opts.mode || "icon";
    var current = opts.current || null;
    var accent  = opts.accent || "#009EDB";
    var onPick  = opts.onPick  || function () {};
    var onClear = opts.onClear || function () {};

    var root = document.createElement("div");
    root.className = "picker2 picker2-" + mode;

    // ── Closed-state trigger card ──────────────────────
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "picker2-trigger";
    trigger.setAttribute("aria-label",
      mode === "flag" ? "Choose a country flag" : "Choose an icon");
    root.appendChild(trigger);

    var thumb = document.createElement("div");
    thumb.className = "picker2-trigger-thumb";
    trigger.appendChild(thumb);

    var triggerLabel = document.createElement("span");
    triggerLabel.className = "picker2-trigger-label";
    trigger.appendChild(triggerLabel);

    var clearBtn = document.createElement("span");
    clearBtn.className = "picker2-trigger-clear";
    clearBtn.setAttribute("role", "button");
    clearBtn.setAttribute("aria-label", "Remove");
    clearBtn.title = "Remove";
    clearBtn.innerHTML = (typeof UiIcons !== "undefined")
      ? '<span class="ui-icon" data-ui-icon="remove">' + UiIcons.svg("remove") + "</span>"
      : "\u2715";
    clearBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      current = null;
      renderTrigger();
      onClear();
    });
    trigger.appendChild(clearBtn);

    trigger.addEventListener("click", function () {
      if (isOpen) { close(); } else { open(); }
    });

    // ── Expanded panel ─────────────────────────────────
    var panel = document.createElement("div");
    panel.className = "picker2-panel";
    panel.style.display = "none";
    root.appendChild(panel);

    var panelHead = document.createElement("div");
    panelHead.className = "picker2-panel-head";
    panel.appendChild(panelHead);

    var panelTitle = document.createElement("div");
    panelTitle.className = "picker2-panel-title";
    panelTitle.textContent = mode === "flag" ? "Choose a country flag" : "Choose an icon";
    panelHead.appendChild(panelTitle);

    var panelClose = document.createElement("button");
    panelClose.type = "button";
    panelClose.className = "picker2-panel-close";
    panelClose.title = "Close";
    panelClose.setAttribute("aria-label", "Close picker");
    panelClose.innerHTML = (typeof UiIcons !== "undefined")
      ? '<span class="ui-icon" data-ui-icon="close">' + UiIcons.svg("close") + "</span>"
      : "\u00d7";
    panelClose.addEventListener("click", close);
    panelHead.appendChild(panelClose);

    var search = document.createElement("input");
    search.type = "search";
    search.className = "picker2-search";
    search.placeholder = mode === "flag" ? "Search country\u2026" : "Search icons\u2026";
    panel.appendChild(search);

    // Family filter chip row (icons only)
    var familyWrap = null;
    if (mode === "icon") {
      familyWrap = document.createElement("div");
      familyWrap.className = "picker2-families";
      panel.appendChild(familyWrap);
    }

    var status = document.createElement("div");
    status.className = "picker2-status";
    panel.appendChild(status);

    var list = document.createElement("div");
    list.className = "picker2-list";
    panel.appendChild(list);

    var refreshBtn = null;
    if (mode === "icon") {
      var foot = document.createElement("div");
      foot.className = "picker2-foot";
      refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.className = "picker2-refresh";
      var refreshIcon = (typeof UiIcons !== "undefined")
        ? '<span class="ui-icon" data-ui-icon="refresh">' + UiIcons.svg("refresh") + "</span>"
        : "\u21bb";
      refreshBtn.innerHTML = refreshIcon + "&nbsp;Refresh from GitHub";
      refreshBtn.title = "Re-download metadata and icons from the GitHub repo";
      refreshBtn.addEventListener("click", function () {
        status.textContent = "Refreshing\u2026";
        loaded = false;
        IconLoader.refresh().then(function () { ensureLoaded(); });
      });
      foot.appendChild(refreshBtn);
      panel.appendChild(foot);
    }

    // ── State ──────────────────────────────────────────
    var allItems = [];    // [{ key, name, family? }]
    var isOpen = false;
    var loaded = false;
    var searchQuery = "";
    var activeFamily = "";   // "" = all

    // ── Open / close ──────────────────────────────────
    function open() {
      isOpen = true;
      panel.style.display = "";
      root.classList.add("open");
      ensureLoaded();
      setTimeout(function () { search.focus(); }, 0);
    }
    function close() {
      isOpen = false;
      panel.style.display = "none";
      root.classList.remove("open");
    }
    // Close the picker when the user clicks outside of it
    document.addEventListener("click", function (ev) {
      if (!isOpen) return;
      if (root.contains(ev.target)) return;
      close();
    });

    // ── Data load ─────────────────────────────────────
    function ensureLoaded() {
      if (loaded) return;
      if (mode === "flag") {
        allItems = FlagLoader.listAll();
        loaded = true;
        renderList();
        return;
      }
      status.textContent = "Loading icon catalog\u2026";
      IconLoader.loadMetadata().then(function (meta) {
        allItems = meta.icons;
        status.textContent =
          allItems.length + " icons \u00b7 updated " + (meta.lastUpdated || "unknown");
        buildFamilyChips(meta);
        loaded = true;
        renderList();
      }).catch(function (err) {
        status.textContent = "Couldn't load icons: " + err.message;
      });
    }

    function buildFamilyChips(meta) {
      if (!familyWrap) return;
      familyWrap.innerHTML = "";
      var allChip = makeChip("", "All", allItems.length);
      familyWrap.appendChild(allChip);
      meta.families.forEach(function (fam) {
        var count = (meta.byFamily[fam] || []).length;
        if (!count) return;
        familyWrap.appendChild(makeChip(fam, fam, count));
      });
    }
    function makeChip(value, label, count) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "picker2-chip";
      if (value === activeFamily) chip.classList.add("active");
      chip.innerHTML = label + ' <span class="picker2-chip-count">' + count + "</span>";
      chip.addEventListener("click", function () {
        activeFamily = value;
        familyWrap.querySelectorAll(".picker2-chip").forEach(function (c) {
          c.classList.toggle("active",
            (c === chip));
        });
        renderList();
      });
      return chip;
    }

    // ── Filter / render list ──────────────────────────
    search.addEventListener("input", function () {
      searchQuery = search.value.trim().toLowerCase();
      renderList();
    });

    function renderList() {
      var filtered = allItems.filter(function (it) {
        if (activeFamily && it.family !== activeFamily) return false;
        if (searchQuery) {
          var hay = (it.name + " " + it.key).toLowerCase();
          if (hay.indexOf(searchQuery) === -1) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        list.innerHTML = '<div class="picker2-empty">No ' +
          (mode === "flag" ? "flags" : "icons") + " match your filters.</div>";
        return;
      }

      list.innerHTML = "";

      // Group by family when searching across all families and in icon mode
      if (mode === "icon" && !activeFamily) {
        var grouped = {};
        var familyOrder = [];
        filtered.forEach(function (it) {
          if (!grouped[it.family]) {
            grouped[it.family] = [];
            familyOrder.push(it.family);
          }
          grouped[it.family].push(it);
        });
        familyOrder.forEach(function (fam) {
          var group = document.createElement("div");
          group.className = "picker2-group";
          var label = document.createElement("div");
          label.className = "picker2-group-label";
          label.innerHTML = escapeHtml(fam) +
            ' <span class="picker2-group-count">' + grouped[fam].length + "</span>";
          group.appendChild(label);
          var grid = document.createElement("div");
          grid.className = "picker2-grid";
          grouped[fam].forEach(function (it) { grid.appendChild(buildCell(it)); });
          group.appendChild(grid);
          list.appendChild(group);
        });
        return;
      }

      // Flat grid for flag mode or when a single family is selected
      var grid = document.createElement("div");
      grid.className = "picker2-grid";
      filtered.forEach(function (it) { grid.appendChild(buildCell(it)); });
      list.appendChild(grid);
    }

    function buildCell(it) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "picker2-cell";
      cell.title = it.name;
      cell.setAttribute("data-key", it.key);
      if (it.key === current) cell.classList.add("selected");

      var thumbEl = document.createElement("div");
      thumbEl.className = "picker2-cell-thumb";
      cell.appendChild(thumbEl);

      var nameEl = document.createElement("div");
      nameEl.className = "picker2-cell-name";
      nameEl.textContent = it.name;
      cell.appendChild(nameEl);

      loadThumb(thumbEl, it.key);

      cell.addEventListener("click", function () {
        current = it.key;
        list.querySelectorAll(".picker2-cell").forEach(function (c) {
          c.classList.toggle("selected", c.getAttribute("data-key") === current);
        });
        renderTrigger();
        onPick(it.key);
      });
      return cell;
    }

    function loadThumb(el, key) {
      var loader = mode === "flag" ? FlagLoader : IconLoader;
      var cached = loader.getCachedSvg(key);
      if (cached) {
        el.innerHTML = mode === "icon" ? recolor(cached, accent) : cached;
        return;
      }
      (mode === "flag" ? FlagLoader.loadFlagSvg(key) : IconLoader.loadIconSvg(key))
        .then(function (svg) {
          el.innerHTML = mode === "icon" ? recolor(svg, accent) : svg;
        })
        .catch(function () {
          el.innerHTML = '<span class="picker2-miss">?</span>';
        });
    }

    // ── Trigger render ────────────────────────────────
    function renderTrigger() {
      if (!current) {
        var plusIcon = (typeof UiIcons !== "undefined")
          ? '<span class="ui-icon" data-ui-icon="add">' + UiIcons.svg("add") + "</span>"
          : '<span class="picker2-trigger-plus">+</span>';
        thumb.innerHTML = plusIcon;
        triggerLabel.textContent = mode === "flag" ? "Add flag" : "Add icon";
        clearBtn.style.display = "none";
        trigger.classList.remove("has-value");
        return;
      }
      trigger.classList.add("has-value");
      var loader = mode === "flag" ? FlagLoader : IconLoader;
      var cached = loader.getCachedSvg(current);
      thumb.innerHTML = cached
        ? (mode === "icon" ? recolor(cached, accent) : cached)
        : '<span class="picker2-trigger-load">\u2026</span>';
      if (!cached) {
        (mode === "flag" ? FlagLoader.loadFlagSvg(current) : IconLoader.loadIconSvg(current))
          .then(function (svg) {
            if (current) thumb.innerHTML = mode === "icon" ? recolor(svg, accent) : svg;
          })
          .catch(function () {});
      }
      var displayName = current;
      if (mode === "flag") {
        var rec = FlagLoader.resolve(current);
        if (rec) displayName = rec.name;
      } else {
        for (var i = 0; i < allItems.length; i++) {
          if (allItems[i].key === current) { displayName = allItems[i].name; break; }
        }
      }
      triggerLabel.textContent = displayName;
      clearBtn.style.display = "";
    }

    // ── Recoloring helper (icons only) ────────────────
    function recolor(svg, color) {
      if (!svg || !color) return svg;
      return svg.replace(/#009[eE][dD][bB]/g, color);
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    renderTrigger();

    return {
      element: root,
      setCurrent: function (key) { current = key; renderTrigger(); },
      setAccent:  function (c)   { accent = c; renderTrigger(); renderList(); },
      getCurrent: function () { return current; }
    };
  }

  return { create: create };
})();
