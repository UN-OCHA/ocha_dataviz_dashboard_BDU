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

  async function encode(dashboard) {
    var json = JSON.stringify(dashboard);
    var bytes = new TextEncoder().encode(json);
    var comp = await compress(bytes);
    var b64 = base64urlEncode(comp);
    return location.origin + location.pathname + "#d=" + b64;
  }

  async function decodeFromHash() {
    var hash = location.hash || "";
    var m = hash.match(/#d=([A-Za-z0-9\-_]+)/);
    if (!m) return null;
    try {
      var bytes = base64urlDecode(m[1]);
      var dec = await decompress(bytes);
      var json = new TextDecoder().decode(dec);
      var d = JSON.parse(json);
      var v = DashboardModel.validate(d);
      return v.ok ? d : null;
    } catch (err) {
      console.error("Failed to decode share link:", err);
      return null;
    }
  }

  // Sync versions that wrap the async calls for convenience in simple handlers.
  function encodeSync(dashboard, cb) {
    encode(dashboard).then(cb);
  }

  return {
    encode: function (d) {
      // Main.js uses this with .then() in a clipboard callback, so return a promise.
      return encode(d);
    },
    decodeFromHash: decodeFromHash,
    encodeSync: encodeSync
  };
})();
