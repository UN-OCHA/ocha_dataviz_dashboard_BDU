/**
 * file-io.js — download / upload the dashboard as a .json file.
 *
 * Pure client-side. Download uses a Blob URL; upload uses a
 * FileReader on an <input type="file"> the caller provides. Neither
 * direction touches any server.
 *
 * Useful for:
 *   - Backing up a dashboard outside the browser (email, Dropbox,
 *     version control, etc.)
 *   - Moving a dashboard between computers / profiles
 *   - Sharing a dashboard with someone in a way that isn't size-
 *     limited like URL share links (which cap at ~8-12 KB gzip-
 *     equivalent before the URL bar chokes)
 */

/* global FileIO:true, DashboardModel */

var FileIO = (function () {
  "use strict";

  // Turn a title like "Yemen HNO 2026" into "yemen-hno-2026" for use
  // as a filename. Matches exporter.js's safeFilename().
  function safeFilename(title) {
    var name = (title || "dashboard").toString().trim().toLowerCase();
    name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return name || "dashboard";
  }

  /**
   * Trigger a browser download of the dashboard as a .json file.
   * The JSON is pretty-printed (2-space indent) so someone opening
   * it in a text editor gets readable output.
   */
  function downloadAsJson(dashboard) {
    if (!dashboard) return;
    var json = JSON.stringify(dashboard, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeFilename(dashboard.title) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke the blob URL after the click has fired. 1 second is a
    // generous safety margin that matches the exporter's pattern.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * Read a File object (from an <input type="file"> change event)
   * and return a promise that resolves to the parsed dashboard.
   * Rejects with a human-readable error string if the file is
   * unreadable, not valid JSON, or fails model validation.
   */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject("No file provided."); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || "");
          var parsed = JSON.parse(text);
          var v = (typeof DashboardModel !== "undefined")
            ? DashboardModel.validate(parsed)
            : { ok: true };
          if (!v.ok) {
            reject(
              "That file isn't a valid OCHA dashboard:\n" +
              (v.errors || []).join("\n")
            );
            return;
          }
          resolve(parsed);
        } catch (err) {
          reject("Couldn't parse JSON: " + err.message);
        }
      };
      reader.onerror = function () {
        reject("Couldn't read the file.");
      };
      reader.readAsText(file);
    });
  }

  /**
   * Convenience: open a transient file picker, wait for the user to
   * choose a .json file, and resolve with the parsed dashboard.
   * Rejects if the user cancels or the file doesn't validate.
   */
  function openPicker() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";
      document.body.appendChild(input);

      var settled = false;
      function cleanup() {
        try { document.body.removeChild(input); } catch (e) { /* ignore */ }
      }
      input.addEventListener("change", function () {
        settled = true;
        var file = input.files && input.files[0];
        if (!file) { cleanup(); reject("No file selected."); return; }
        readFile(file).then(function (d) {
          cleanup();
          resolve(d);
        }, function (err) {
          cleanup();
          reject(err);
        });
      });
      // Give the file dialog a reasonable window to open. If the
      // user dismisses without picking, there's no reliable event
      // for that; we just leave the input attached until the next
      // GC, which is fine.
      input.click();
      // Safety cleanup after 60 s in case neither "change" nor a
      // cancel event ever fires.
      setTimeout(function () { if (!settled) cleanup(); }, 60000);
    });
  }

  return {
    downloadAsJson: downloadAsJson,
    readFile: readFile,
    openPicker: openPicker
  };
})();
