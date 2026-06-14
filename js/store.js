/* store.js — persistence for the Spellbook (localStorage based).
 * Stores spells (each with a drawn gesture) and whiteboard appearance. */
(function (global) {
  "use strict";

  const KEY = "spellbook.v2";
  const APPEARANCE_KEY = "spellbook.appearance.v1";

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
      // Drop runtime-only cached templates before persisting.
      const clean = spells.map((s) => {
        const c = Object.assign({}, s);
        delete c._tpl;
        return c;
      });
      localStorage.setItem(KEY, JSON.stringify({ version: 2, spells: clean }));
      return true;
    } catch (e) {
      console.error("Spellbook: failed to save.", e);
      return false;
    }
  }

  const DEFAULT_APPEARANCE = {
    theme: "nebula",   // nebula | abyss | ember | forest | parchment
    ink: "#ffd36e",
    glow: true,
    grid: true
  };

  function loadAppearance() {
    try {
      const raw = localStorage.getItem(APPEARANCE_KEY);
      return Object.assign({}, DEFAULT_APPEARANCE, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_APPEARANCE);
    }
  }

  function saveAppearance(a) {
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a)); } catch (e) {}
  }

  /* ---- Geometry helpers for seed gestures (so the demos are traceable) ---- */
  function circlePts(cx, cy, r, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return out;
  }
  function linePts(a, b, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      out.push({ x: a.x + (b.x - a.x) * (i / n), y: a.y + (b.y - a.y) * (i / n) });
    }
    return out;
  }
  function polyPts(corners, perEdge) {
    let out = [];
    for (let i = 0; i < corners.length - 1; i++) {
      out = out.concat(linePts(corners[i], corners[i + 1], perEdge));
    }
    return out;
  }

  // Starter spells using ONLY built-in web actions, so they work with no setup.
  function seeds() {
    return [
      {
        id: uid(), name: "Coffee Run", glyph: "◯", color: "#ffd36e",
        incantation: "Trace a circle.",
        gesture: circlePts(120, 120, 80, 32),
        actions: [{ type: "maps", params: { query: "coffee", mode: "Search" } }]
      },
      {
        id: uid(), name: "Reveal Knowledge", glyph: "△", color: "#7aa8ff",
        incantation: "Trace a triangle.",
        gesture: polyPts([{ x: 120, y: 40 }, { x: 40, y: 200 }, { x: 200, y: 200 }, { x: 120, y: 40 }], 14),
        actions: [{ type: "web_search", params: { query: "spell of the day" } }]
      },
      {
        id: uid(), name: "Speak, Spirit", glyph: "Z", color: "#ff7adb",
        incantation: "Trace a Z.",
        gesture: polyPts([{ x: 40, y: 50 }, { x: 200, y: 50 }, { x: 40, y: 200 }, { x: 200, y: 200 }], 16),
        actions: [{ type: "speak", params: { text: "The spell is cast.", rate: "1", pitch: "1" } }]
      }
    ];
  }

  global.Store = {
    KEY, uid, load, save, seeds,
    loadAppearance, saveAppearance, DEFAULT_APPEARANCE
  };
})(window);
