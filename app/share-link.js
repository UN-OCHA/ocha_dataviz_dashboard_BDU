/**
 * share-link.js — encode/decode a dashboard into a URL fragment.
 *
 * Uses the browser's CompressionStream when available (Chrome/Edge/Firefox
 * recent versions) and falls back to plain base64 otherwise. The encoded
 * data lives in the URL fragment (#d=...) so it is never sent to any
 * server.
 *
 * This is a nice-to-have for Phase 1 — PDF/PNG export is the primary way
 * users will share their work.
 */

/* global ShareLink:true, DashboardModel */

var ShareLink = (function () {
  "use strict";

  function base64urlEncode(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function base64urlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var binary = atob(str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function compress(bytes) {
    if (typeof CompressionStream === "undefined") return bytes;
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function decompress(bytes) {
    if (typeof DecompressionStream === "undefined") return bytes;
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      var buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      return bytes; // fall back to assuming it wasn't compressed
    }
  }

  // Two URL shapes, both carrying the same gzip+base64 payload:
  //   #d=<payload>  — edit link (default). Opening loads the dashboard
  //                   into the full editor with sidebar + inspector.
  //   #v=<payload>  — view-only link. Opening loads the dashboard in
  //                   view mode: sidebar, inspector, resize handles,
  //                   card arrows, and FAB are all hidden so the
  //                   recipient sees a clean dashboard. They can click
  //                   "Edit a copy" to flip into edit mode with the
  //                   same payload.
  async function encodePayload(dashboard) {
    var json = JSON.stringify(dashboard);
    var bytes = new TextEncoder().encode(json);
    var comp = await compress(bytes);
    return base64urlEncode(comp);
  }

  async function encode(dashboard) {
    var b64 = await encodePayload(dashboard);
    return location.origin + location.pathname + "#d=" + b64;
  }

  async function encodeViewLink(dashboard) {
    var b64 = await encodePayload(dashboard);
    return location.origin + location.pathname + "#v=" + b64;
  }

  // Decode whatever payload is in the current URL hash. Returns
  //   { dashboard, mode }          on success
  //   null                         when the hash isn't a share link
  // `mode` is "edit" for #d= links and "view" for #v= links.
  async function decodeFromHash() {
    var hash = location.hash || "";
    var m = hash.match(/#(d|v)=([A-Za-z0-9\-_]+)/);
    if (!m) return null;
    var mode = m[1] === "v" ? "view" : "edit";
    try {
      var bytes = base64urlDecode(m[2]);
      var dec = await decompress(bytes);
      var json = new TextDecoder().decode(dec);
      var d = JSON.parse(json);
      var v = DashboardModel.validate(d);
      if (!v.ok) return null;
      return { dashboard: d, mode: mode };
    } catch (err) {
      console.error("Failed to decode share link:", err);
      return null;
    }
  }

  // Sync version that wraps the async call for simple click handlers.
  function encodeSync(dashboard, cb) {
    encode(dashboard).then(cb);
  }

  return {
    encode: encode,
    encodeViewLink: encodeViewLink,
    decodeFromHash: decodeFromHash,
    encodeSync: encodeSync
  };
})();
