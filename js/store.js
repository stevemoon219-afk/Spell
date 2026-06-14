/* store.js — persistence for the Spellbook (localStorage based) */
(function (global) {
  "use strict";

  const KEY = "spellbook.v1";

  function uid() {
    return "spell_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data.spells) ? data.spells : [];
    } catch (e) {
      console.warn("Spellbook: failed to load, starting fresh.", e);
      return [];
    }
  }

  function save(spells) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, spells }));
      return true;
    } catch (e) {
      console.error("Spellbook: failed to save.", e);
      return false;
    }
  }

  // A few starter spells so the board is never intimidating on first open.
  function seeds() {
    return [
      {
        id: uid(), name: "Coffee Run", glyph: "☕️", color: "#ffd36e",
        incantation: "Caffeina, awaken!", x: 40, y: 40,
        actions: [
          { type: "open_url", params: { url: "maps://?q=coffee" } }
        ]
      },
      {
        id: uid(), name: "I'm Driving", glyph: "🚗", color: "#7aa8ff",
        incantation: "Roads, rise to meet me.", x: 230, y: 40,
        actions: [
          { type: "run_shortcut", params: { name: "Driving Focus", input: "" } },
          { type: "speak", params: { text: "Driving mode engaged. Stay safe.", rate: "1", pitch: "1" } }
        ]
      },
      {
        id: uid(), name: "SOS Text Home", glyph: "🛟", color: "#ff7adb",
        incantation: "Hearth, hear me.", x: 420, y: 40,
        actions: [
          { type: "sms", params: { number: "", body: "On my way home now." } }
        ]
      }
    ];
  }

  global.Store = { KEY, uid, load, save, seeds };
})(window);
