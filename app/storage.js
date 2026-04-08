/**
 * storage.js — localStorage persistence for the dashboard editor.
 *
 * Two independent features live here:
 *
 *   1. Auto-save (single slot). Every change to the current dashboard
 *      is debounced-written to localStorage under AUTOSAVE_KEY. When
 *      the app reboots without a share link in the URL, the auto-save
 *      is restored so the user never loses their last edit. Think of
 *      this as the "reload-safe undo buffer" for the current session.
 *
 *   2. Library (many named slots). Users can explicitly save the
 *      current dashboard as a named entry, list their saves, load
 *      any back, rename, duplicate, and delete. The library lives
 *      under LIBRARY_KEY as a single JSON object keyed by entry id.
 *
 * Both features run fully client-side. No network, no server.
 *
 * Storage budget: localStorage is ~5 MB per origin. A typical
 * dashboard JSON is 2–10 KB (gzip equivalent), so the library can
 * comfortably hold hundreds of saves before running out of room.
 * We don't bother with IndexedDB for this volume.
 */

/* global Storage2:true */

var Storage2 = (function () {
  "use strict";

  var AUTOSAVE_KEY = "ocha-dataviz-autosave";
  var LIBRARY_KEY  = "ocha-dataviz-library";

  // ── Low-level helpers ────────────────────────────────
  function safeGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (e) { return false; } // quota exceeded / private mode
  }
  function safeRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ── Auto-save (single slot) ──────────────────────────

  /**
   * Save the given dashboard JSON to the auto-save slot. Returns true
   * on success, false on quota error. Called automatically by the
   * debounced writer in bootstrap.js; most callers should use
   * scheduleAutoSave() below instead of calling this directly.
   */
  function saveAutosave(dashboard) {
    if (!dashboard) return false;
    try {
      return safeSet(AUTOSAVE_KEY, JSON.stringify(dashboard));
    } catch (e) {
      return false;
    }
  }

  /**
   * Read the auto-save slot. Returns the dashboard object, or null
   * if nothing was saved (or the saved blob is corrupt). Does NOT
   * validate against the model schema — that's the caller's job.
   */
  function loadAutosave() {
    var raw = safeGet(AUTOSAVE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { return null; }
  }

  function clearAutosave() { safeRemove(AUTOSAVE_KEY); }

  // Debounced auto-save. Every call resets a ~400ms timer; when the
  // timer fires, the most recent dashboard is written. This keeps
  // rapid typing from hitting storage on every keystroke.
  var autosaveTimer = null;
  function scheduleAutoSave(dashboard, delayMs) {
    if (!dashboard) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      saveAutosave(dashboard);
    }, delayMs || 400);
  }

  // ── Library (many named slots) ────────────────────────
  //
  // Shape:
  //   localStorage[LIBRARY_KEY] = JSON.stringify({
  //     "<id>": {
  //       id:        "<id>",          // same as the key, for easier iteration
  //       name:      "My dashboard",  // user-facing label
  //       createdAt: "2026-04-08T…",  // first save time
  //       updatedAt: "2026-04-08T…",  // last save time
  //       dashboard: { …full JSON… }
  //     },
  //     …
  //   })

  function readLibrary() {
    var raw = safeGet(LIBRARY_KEY);
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) {
      return {};
    }
  }
  function writeLibrary(lib) {
    try {
      return safeSet(LIBRARY_KEY, JSON.stringify(lib));
    } catch (e) {
      return false;
    }
  }

  function newEntryId() {
    return "lib_" + Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 6);
  }

  /**
   * List every saved entry as an array sorted by updatedAt desc.
   * Each entry is { id, name, createdAt, updatedAt } — the full
   * dashboard JSON is NOT included to keep the list cheap. Call
   * libraryLoad(id) to get the dashboard itself.
   */
  function libraryList() {
    var lib = readLibrary();
    var out = [];
    Object.keys(lib).forEach(function (id) {
      var e = lib[id];
      if (!e) return;
      out.push({
        id: e.id || id,
        name: e.name || "(untitled)",
        createdAt: e.createdAt || null,
        updatedAt: e.updatedAt || e.createdAt || null
      });
    });
    out.sort(function (a, b) {
      var ta = Date.parse(a.updatedAt || "") || 0;
      var tb = Date.parse(b.updatedAt || "") || 0;
      return tb - ta;
    });
    return out;
  }

  /** Load a library entry's full dashboard JSON by id, or null. */
  function libraryLoad(id) {
    var lib = readLibrary();
    var e = lib[id];
    return (e && e.dashboard) ? e.dashboard : null;
  }

  /**
   * Save a new entry or overwrite an existing one.
   *   - If `id` is provided, the entry at that id is updated
   *     (preserving createdAt).
   *   - If not, a new id is minted and returned.
   * `dashboard` is deep-cloned before writing so the caller's
   * reference can keep mutating without affecting the saved copy.
   */
  function librarySave(dashboard, name, id) {
    if (!dashboard) return null;
    var lib = readLibrary();
    var now = new Date().toISOString();
    var entry = {
      id: id || newEntryId(),
      name: name || dashboard.title || "Untitled dashboard",
      createdAt: (id && lib[id] && lib[id].createdAt) || now,
      updatedAt: now,
      dashboard: JSON.parse(JSON.stringify(dashboard))
    };
    lib[entry.id] = entry;
    if (!writeLibrary(lib)) return null;
    return entry.id;
  }

  function libraryRename(id, name) {
    var lib = readLibrary();
    if (!lib[id]) return false;
    lib[id].name = name || "(untitled)";
    lib[id].updatedAt = new Date().toISOString();
    return writeLibrary(lib);
  }

  function libraryDelete(id) {
    var lib = readLibrary();
    if (!lib[id]) return false;
    delete lib[id];
    return writeLibrary(lib);
  }

  function libraryDuplicate(id) {
    var lib = readLibrary();
    var src = lib[id];
    if (!src) return null;
    var copyName = (src.name || "Untitled dashboard") + " (copy)";
    return librarySave(src.dashboard, copyName);
  }

  return {
    // Auto-save
    saveAutosave:     saveAutosave,
    loadAutosave:     loadAutosave,
    clearAutosave:    clearAutosave,
    scheduleAutoSave: scheduleAutoSave,

    // Library
    libraryList:      libraryList,
    libraryLoad:      libraryLoad,
    librarySave:      librarySave,
    libraryRename:    libraryRename,
    libraryDelete:    libraryDelete,
    libraryDuplicate: libraryDuplicate
  };
})();
