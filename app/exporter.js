/**
 * exporter.js — PDF (vector) and PNG (raster) export.
 *
 * PDF strategy
 * ────────────
 *   Old approach: html2canvas → raster → embed image in jsPDF.  This produced
 *   a PDF that was actually just a screenshot — text wasn't selectable, lines
 *   were pixelated when zoomed, and chart strokes lost crispness.
 *
 *   New approach: open the dashboard in an isolated PRINT-PREVIEW WINDOW with
 *   a print stylesheet (`@page { size: A4 landscape }`) and let the browser's
 *   native print engine convert it to PDF.  The browser walks the DOM and
 *   emits text, vectors, and SVG elements as real PDF objects — selectable
 *   text, scalable charts, no rasterisation.  The user clicks "Save as PDF"
 *   in the system print dialog.
 *
 *   The preview window also gives the user control BEFORE printing:
 *     • A "Fit to one page" button computes the scale that makes the entire
 *       dashboard fit on a single A4 landscape page.
 *     • A scale slider lets the user override that and zoom in/out.
 *     • A live A4-sized preview shows exactly what will print.
 *
 *   Editor-only chrome (move arrows, "+ Add chart" buttons, the FAB, hover
 *   outlines) is stripped from the cloned dashboard via the `.export-mode`
 *   CSS class so they never appear in the printed output.
 *
 * PNG strategy
 * ────────────
 *   PNG is a raster format by definition, so html2canvas is still the right
 *   tool. We just clone the dashboard with `.export-mode` first to suppress
 *   editor chrome.
 */

/* global Exporter:true, html2canvas */

var Exporter = (function () {
  "use strict";

  // Print width for the off-screen PNG clone (px). 1400 gives a comfortable
  // 12-col layout that maps cleanly onto A4 landscape (297mm wide).
  var PRINT_WIDTH = 1400;

  // ── Helpers ───────────────────────────────────────────

  function safeFilename(title) {
    var name = (title || "dashboard").toString().trim().toLowerCase();
    name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return name || "dashboard";
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function canvasToBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("toBlob returned null"));
        }, type);
      } else {
        try {
          var dataUrl = canvas.toDataURL(type);
          var bin = atob(dataUrl.split(",")[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: type }));
        } catch (err) { reject(err); }
      }
    });
  }

  function nextFrame() {
    return new Promise(function (res) { requestAnimationFrame(function () { res(); }); });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Clone the user's dashboard into an off-screen container at a fixed
   * width.  Strips editor-only chrome via the `.export-mode` class so the
   * exported image / PDF shows only dashboard content.
   */
  function cloneAtFixedWidth(previewEl, width) {
    var dashboard = previewEl.querySelector(".dashboard");
    if (!dashboard) return null;

    var holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-20000px";
    holder.style.top = "0";
    holder.style.width = width + "px";
    holder.style.padding = "0";
    holder.style.background = "#ffffff";
    holder.style.zIndex = "-1";

    var clone = dashboard.cloneNode(true);
    clone.classList.add("export-mode");
    clone.style.width = width + "px";
    clone.style.maxWidth = width + "px";
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    clone.style.margin = "0";
    holder.appendChild(clone);
    document.body.appendChild(holder);
    return { holder: holder, dashboard: clone };
  }

  // ── PNG export ────────────────────────────────────────
  // Raster — html2canvas at 2× DPI gives a sharp, share-friendly image.

  async function exportPNG(dashboard, previewEl) {
    if (typeof html2canvas === "undefined") {
      alert("Image library still loading — try again in a second.");
      return;
    }
    var c = cloneAtFixedWidth(previewEl, PRINT_WIDTH);
    if (!c) { alert("Couldn't find the dashboard to export."); return; }

    try {
      await nextFrame();
      var canvas = await html2canvas(c.dashboard, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false
      });
      var blob = await canvasToBlob(canvas, "image/png");
      downloadBlob(blob, safeFilename(dashboard.title) + ".png");
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("PNG export failed: " + err.message);
    } finally {
      c.holder.parentNode.removeChild(c.holder);
    }
  }

  // ── PDF export (vector via browser print) ─────────────

  /**
   * Open a print-preview window with the dashboard sized to A4 landscape.
   * The user can adjust scale, click "Fit to one page", and then trigger
   * the system print dialog to save as a true vector PDF.
   */
  function exportPDF(dashboard, previewEl) {
    var dashboardEl = previewEl.querySelector(".dashboard");
    if (!dashboardEl) { alert("Couldn't find the dashboard to export."); return; }

    // Clone, strip editor chrome
    var clone = dashboardEl.cloneNode(true);
    clone.classList.add("export-mode");
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    clone.style.margin = "0";
    clone.style.maxWidth = "none";
    clone.style.width = "100%";

    // Pull every <link rel="stylesheet"> URL from the parent so the print
    // window inherits exactly the same fonts, variables, and chart styling.
    var stylesheetLinks = Array.prototype.slice
      .call(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(function (l) { return l.outerHTML; })
      .join("\n");

    var title = (dashboard && dashboard.title) || "Dashboard";
    var dashHtml = clone.outerHTML;

    var html = buildPrintWindowHtml(title, stylesheetLinks, dashHtml);

    var win = window.open("", "_blank", "width=1280,height=900");
    if (!win) {
      alert("Couldn't open print preview — please allow pop-ups for this site.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function buildPrintWindowHtml(title, stylesheetLinks, dashHtml) {
    return [
'<!DOCTYPE html>',
'<html lang="en">',
'<head>',
'<meta charset="UTF-8">',
'<title>' + escapeHtml(title) + ' — Print preview</title>',
stylesheetLinks,
'<style>',
'  /* A4 landscape print page. Margin is 0 here because the .pp-page',
'     element below provides the 10mm white margin itself — that way',
'     the page is exactly 297×210mm and all the math stays simple. */',
'  @page { size: A4 landscape; margin: 0; }',
'  html, body {',
'    margin: 0; padding: 0; background: #525659;',
'    font-family: Roboto, Arial, sans-serif;',
'    color: #1b1f23;',
'  }',
'  /* Top toolbar (screen only) */',
'  .pp-toolbar {',
'    position: fixed; inset: 0 0 auto 0; height: 56px; z-index: 9999;',
'    display: flex; align-items: center; gap: 14px;',
'    padding: 0 20px;',
'    background: #1f2937; color: #fff;',
'    font-size: 13px;',
'    box-shadow: 0 2px 12px rgba(0,0,0,0.35);',
'  }',
'  .pp-toolbar strong { font-size: 14px; letter-spacing: 0.2px; }',
'  .pp-toolbar .sep { width: 1px; height: 24px; background: rgba(255,255,255,0.2); }',
'  .pp-toolbar label { color: #d1d5db; }',
'  .pp-toolbar input[type=range] { width: 200px; }',
'  .pp-toolbar .scale-value { min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; color: #fff; }',
'  .pp-toolbar button {',
'    background: #374151; color: #fff; border: 1px solid #4b5563;',
'    padding: 7px 14px; font: inherit; cursor: pointer;',
'    border-radius: 0;',
'  }',
'  .pp-toolbar button:hover { background: #4b5563; }',
'  .pp-toolbar button.primary {',
'    background: #009EDB; border-color: #009EDB; font-weight: 600;',
'  }',
'  .pp-toolbar button.primary:hover { background: #007BB0; border-color: #007BB0; }',
'  .pp-toolbar .spacer { flex: 1; }',
'  .pp-toolbar .hint { color: #9ca3af; font-size: 12px; }',
'  /* A4 page area */',
'  .pp-stage {',
'    padding: 84px 24px 32px;',
'    display: flex; justify-content: center;',
'    min-height: 100vh;',
'    box-sizing: border-box;',
'  }',
'  .pp-page {',
'    background: #ffffff;',
'    width: 297mm;',
'    height: 210mm;',
'    box-sizing: border-box;',
'    box-shadow: 0 8px 40px rgba(0,0,0,0.45);',
'    position: relative;',
'    overflow: hidden;',
'  }',
'  /* Dedicated clipping box that holds the content INSIDE the white',
'     margin. No matter what zoom level the user picks, the content can',
'     never paint over the .pp-page edges — the 10mm gutter is always',
'     visible on screen and on the printed sheet. */',
'  .pp-clip {',
'    position: absolute;',
'    top: 10mm;',
'    left: 10mm;',
'    right: 10mm;',
'    bottom: 10mm;',
'    overflow: hidden;',
'    background: #ffffff;',
'  }',
'  /* The dashboard scales via the CSS `zoom` property (set inline by JS).',
'     Unlike `transform: scale()`, zoom actually shrinks the layout box,',
'     which the browsers print reliably — transforms get dropped or end up',
'     drawing the content off the printable area, producing blank pages. */',
'  .pp-content { width: 100%; }',
'  /* When printing, drop the screen chrome and let the .pp-page fill the',
'     A4 sheet. Crucially we keep .pp-page at exactly 297×210mm (the same',
'     as on screen) so the inline `zoom` value stays correct. */',
'  @media print {',
'    html, body { background: #fff; }',
'    .pp-toolbar { display: none !important; }',
'    .pp-stage { padding: 0; min-height: 0; display: block; }',
'    .pp-page {',
'      box-shadow: none !important;',
'      margin: 0 !important;',
'    }',
'  }',
'  /* Tighten the dashboard inside the page */',
'  .pp-page .dashboard {',
'    box-shadow: none !important;',
'    border-radius: 0 !important;',
'    padding: 0 !important;',
'    margin: 0 !important;',
'    background: transparent !important;',
'    max-width: none !important;',
'    width: 100% !important;',
'  }',
'  .pp-page .dashboard-header { padding-top: 0; }',
'</style>',
'</head>',
'<body>',
'  <div class="pp-toolbar">',
'    <strong>Print preview</strong>',
'    <span class="hint">A4 landscape</span>',
'    <span class="sep"></span>',
'    <label for="pp-scale">Scale</label>',
'    <input type="range" id="pp-scale" min="30" max="120" value="100" step="1">',
'    <span class="scale-value" id="pp-scale-value">100%</span>',
'    <button id="pp-fit">Fit to one page</button>',
'    <span class="spacer"></span>',
'    <span class="hint">Save as PDF in the next dialog →</span>',
'    <button onclick="window.close()">Cancel</button>',
'    <button class="primary" id="pp-print">Print / Save as PDF</button>',
'  </div>',
'  <div class="pp-stage">',
'    <div class="pp-page" id="pp-page">',
'      <div class="pp-clip" id="pp-clip">',
'        <div class="pp-content" id="pp-content">',
dashHtml,
'        </div>',
'      </div>',
'    </div>',
'  </div>',
'  <script>',
'  (function () {',
'    var content = document.getElementById("pp-content");',
'    var clip = document.getElementById("pp-clip");',
'    var page = document.getElementById("pp-page");',
'    var slider = document.getElementById("pp-scale");',
'    var scaleValue = document.getElementById("pp-scale-value");',
'    var fitBtn = document.getElementById("pp-fit");',
'    var printBtn = document.getElementById("pp-print");',
'',
'    function applyScale(pct) {',
'      var s = pct / 100;',
'      // CSS `zoom` shrinks the actual layout box (not just the visual',
'      // bitmap like `transform: scale()` does), so the print engine sees',
'      // properly-sized content at the right position. Setting both `zoom`',
'      // and `MozTransform` covers Firefox, which still ignores zoom.',
'      content.style.zoom = s;',
'      content.style.MozTransform = "scale(" + s + ")";',
'      content.style.MozTransformOrigin = "top left";',
'      scaleValue.textContent = Math.round(pct) + "%";',
'    }',
'',
'    function fitToOnePage() {',
'      // Fixed defaults that print well on A4 landscape with the standard',
'      // OCHA dashboard layout. The footer adds an extra row of content,',
'      // so it needs a slightly tighter fit.',
'      var hasFooter = !!content.querySelector(".dashboard-footer");',
'      var pct = hasFooter ? 66 : 78;',
'      slider.value = pct;',
'      applyScale(pct);',
'    }',
'',
'    slider.addEventListener("input", function () { applyScale(slider.value); });',
'    fitBtn.addEventListener("click", fitToOnePage);',
'    printBtn.addEventListener("click", function () { window.print(); });',
'',
'    // Wait for fonts + layout, then auto-fit on first load',
'    function ready() {',
'      setTimeout(fitToOnePage, 100);',
'    }',
'    if (document.fonts && document.fonts.ready) {',
'      document.fonts.ready.then(ready);',
'    } else {',
'      window.addEventListener("load", ready);',
'    }',
'  })();',
'  </script>',
'</body>',
'</html>'
    ].join("\n");
  }

  return {
    exportPNG: exportPNG,
    exportPDF: exportPDF
  };
})();
