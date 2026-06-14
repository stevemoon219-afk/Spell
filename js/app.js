/* app.js — Spellbook: draw a glyph on the whiteboard to cast a spell.
 * Settings (gear) let you change the board's look and create spells by
 * drawing a sample shape, then binding actions to it. */
(function () {
  "use strict";

  const { ACTIONS, cast } = window.Actions;
  const Store = window.Store;
  const Recognizer = window.Recognizer;

  const COLORS = ["#8b6cff", "#ff7adb", "#ffd36e", "#7aa8ff", "#7ee3a7", "#ff9b6b", "#c08bff", "#ff6b81"];
  const THEMES = [
    { id: "nebula", label: "Nebula", bg: "linear-gradient(135deg,#2a1b54,#3a1840)" },
    { id: "abyss", label: "Abyss", bg: "linear-gradient(135deg,#0c2740,#04060f)" },
    { id: "ember", label: "Ember", bg: "linear-gradient(135deg,#4a1d1d,#5c2a12)" },
    { id: "forest", label: "Forest", bg: "linear-gradient(135deg,#123524,#06120c)" },
    { id: "parchment", label: "Scroll", bg: "linear-gradient(135deg,#efe2c0,#e7d6ad)" }
  ];
  const MATCH_THRESHOLD = 0.78;

  let spells = Store.load();
  if (!spells.length && !localStorage.getItem("spellbook.seeded")) {
    spells = Store.seeds();
    localStorage.setItem("spellbook.seeded", "1");
    Store.save(spells);
  }
  let appearance = Store.loadAppearance();

  const $ = (s) => document.querySelector(s);

  /* ===================== Appearance ===================== */
  function applyAppearance() {
    document.body.dataset.theme = appearance.theme;
    document.body.dataset.grid = appearance.grid ? "on" : "off";
  }
  applyAppearance();

  /* ===================== Whiteboard drawing ===================== */
  const board = $("#board");
  const bctx = board.getContext("2d");
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function sizeBoard() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    board.width = Math.floor(innerWidth * dpr);
    board.height = Math.floor(innerHeight * dpr);
    board.style.width = innerWidth + "px";
    board.style.height = innerHeight + "px";
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeBoard();
  window.addEventListener("resize", sizeBoard);

  let strokes = [];        // array of strokes; each stroke is [{x,y}, …]
  let drawing = false;
  let recognizeTimer = null;

  function strokeStyle() {
    bctx.lineWidth = 4;
    bctx.lineCap = "round";
    bctx.lineJoin = "round";
    bctx.strokeStyle = appearance.ink;
    if (appearance.glow) { bctx.shadowBlur = 16; bctx.shadowColor = appearance.ink; }
    else bctx.shadowBlur = 0;
  }

  function drawSegment(a, b) {
    strokeStyle();
    bctx.beginPath();
    bctx.moveTo(a.x, a.y);
    bctx.lineTo(b.x, b.y);
    bctx.stroke();
  }

  function redrawAll(alpha) {
    bctx.clearRect(0, 0, innerWidth, innerHeight);
    bctx.globalAlpha = alpha;
    strokes.forEach((st) => {
      for (let i = 1; i < st.length; i++) drawSegment(st[i - 1], st[i]);
    });
    bctx.globalAlpha = 1;
  }

  function boardPoint(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function onBoardDown(e) {
    // Ignore touches that begin on HUD / open sheets.
    if (e.target.closest(".hud") || e.target.closest(".overlay") || e.target.closest(".console")) return;
    if (!anyOverlayOpen()) {
      drawing = true;
      clearTimeout(recognizeTimer);
      strokes.push([boardPoint(e)]);
      hideHint();
    }
  }
  function onBoardMove(e) {
    if (!drawing) return;
    const st = strokes[strokes.length - 1];
    const p = boardPoint(e);
    drawSegment(st[st.length - 1], p);
    st.push(p);
  }
  function onBoardUp() {
    if (!drawing) return;
    drawing = false;
    clearTimeout(recognizeTimer);
    recognizeTimer = setTimeout(tryCastFromBoard, 650);
  }

  board.addEventListener("pointerdown", onBoardDown);
  window.addEventListener("pointermove", onBoardMove);
  window.addEventListener("pointerup", onBoardUp);
  window.addEventListener("pointercancel", onBoardUp);

  function tryCastFromBoard() {
    const pts = strokes.flat();
    if (pts.length < 8) { fadeAndClear(); return; }
    const result = Recognizer.recognize(pts, spells);
    if (result && result.score >= MATCH_THRESHOLD) {
      flashSpell(result.spell);
      fadeAndClear();
      castSpell(result.spell);
    } else {
      const near = result ? ` (closest: ${result.spell.name})` : "";
      toast("No spell matched — trace it closer to your sample" + near);
      fadeAndClear();
    }
  }

  function fadeAndClear() {
    let a = 1;
    const step = () => {
      a -= 0.08;
      if (a <= 0) { strokes = []; bctx.clearRect(0, 0, innerWidth, innerHeight); return; }
      redrawAll(a);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function flashSpell(spell) {
    const f = $("#cast-flash");
    f.textContent = (spell.glyph || "✨") + " " + spell.name;
    f.style.color = spell.color || COLORS[0];
    f.classList.remove("show");
    void f.offsetWidth;
    f.classList.add("show");
  }

  let hintHidden = false;
  function hideHint() {
    if (hintHidden) return;
    hintHidden = true;
    $("#hint").style.opacity = "0";
  }

  /* ===================== Casting console ===================== */
  const consoleEl = $("#console");
  const consoleLog = $("#console-log");
  function openConsole() { consoleLog.innerHTML = ""; consoleEl.classList.remove("hidden"); }
  function logLine(text, level) {
    const li = document.createElement("li");
    const icon = level === "ok" ? "✓" : level === "err" ? "✕" : "•";
    li.innerHTML = `<span class="log-icon log-${level}">${icon}</span><span>${escapeHtml(text)}</span>`;
    consoleLog.appendChild(li);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }
  $("#console-close").addEventListener("click", () => consoleEl.classList.add("hidden"));

  async function castSpell(spell) {
    openConsole();
    await cast(spell, { log: logLine, wait: (ms) => new Promise((r) => setTimeout(r, ms)) });
  }

  /* ===================== Settings sheet ===================== */
  const settingsOverlay = $("#settings-overlay");
  function openSettings() { renderSettings(); settingsOverlay.classList.remove("hidden"); }
  function closeSettings() { settingsOverlay.classList.add("hidden"); }
  $("#btn-settings").addEventListener("click", openSettings);
  $("#settings-close").addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSettings(); });

  function renderSettings() {
    // Theme swatches
    const tw = $("#theme-swatches");
    tw.innerHTML = "";
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "theme-swatch" + (t.id === appearance.theme ? " selected" : "");
      b.style.background = t.bg;
      b.textContent = t.label;
      b.addEventListener("click", () => {
        appearance.theme = t.id; Store.saveAppearance(appearance); applyAppearance(); renderSettings();
      });
      tw.appendChild(b);
    });
    // Ink swatches
    const iw = $("#ink-swatches");
    iw.innerHTML = "";
    ["#ffd36e", "#ffffff", "#8b6cff", "#ff7adb", "#7aa8ff", "#7ee3a7", "#ff6b81"].forEach((c) => {
      const s = document.createElement("button");
      s.className = "swatch" + (c === appearance.ink ? " selected" : "");
      s.style.background = c; s.style.color = c;
      s.addEventListener("click", () => { appearance.ink = c; Store.saveAppearance(appearance); renderSettings(); });
      iw.appendChild(s);
    });
    $("#toggle-glow").checked = !!appearance.glow;
    $("#toggle-grid").checked = !!appearance.grid;
    renderSpellList();
  }
  $("#toggle-glow").addEventListener("change", (e) => { appearance.glow = e.target.checked; Store.saveAppearance(appearance); });
  $("#toggle-grid").addEventListener("change", (e) => { appearance.grid = e.target.checked; Store.saveAppearance(appearance); applyAppearance(); });

  function renderSpellList() {
    const list = $("#spell-list");
    list.innerHTML = "";
    $("#spell-list-empty").classList.toggle("hidden", spells.length > 0);
    spells.forEach((spell) => {
      const li = document.createElement("li");
      li.className = "spell-row";
      const count = (spell.actions || []).length;
      li.innerHTML = `
        <span class="sr-glyph" style="--sr-color:${spell.color || COLORS[0]}">${escapeHtml(spell.glyph || "✨")}</span>
        <span class="sr-text">
          <div class="sr-name">${escapeHtml(spell.name || "Untitled")}</div>
          <div class="sr-meta">${count} action${count === 1 ? "" : "s"}${spell.gesture ? "" : " · no gesture"}</div>
        </span>
        <button class="sr-edit" aria-label="Edit">✎</button>`;
      li.querySelector(".sr-edit").addEventListener("click", () => { closeSettings(); openEditor(spell); });
      list.appendChild(li);
    });
  }

  $("#btn-new-spell").addEventListener("click", () => { closeSettings(); openEditor(null); });

  /* ===================== Spell editor + gesture recorder ===================== */
  const editorOverlay = $("#editor-overlay");
  const stepsList = $("#steps-list");
  const stepsEmpty = $("#steps-empty");
  let editing = null;
  let editingColor = COLORS[0];

  // Recorder canvas
  const rec = $("#record-canvas");
  const rctx = rec.getContext("2d");
  let recStrokes = [];
  let recDrawing = false;

  function sizeRecorder() {
    const w = rec.clientWidth || 320, h = rec.clientHeight || 220;
    rec.width = Math.floor(w * dpr); rec.height = Math.floor(h * dpr);
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawRecorder();
  }
  function recPoint(e) {
    const r = rec.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function redrawRecorder() {
    rctx.clearRect(0, 0, rec.clientWidth, rec.clientHeight);
    rctx.lineWidth = 4; rctx.lineCap = "round"; rctx.lineJoin = "round";
    rctx.strokeStyle = editingColor; rctx.shadowBlur = 12; rctx.shadowColor = editingColor;
    recStrokes.forEach((st) => {
      rctx.beginPath();
      st.forEach((p, i) => (i ? rctx.lineTo(p.x, p.y) : rctx.moveTo(p.x, p.y)));
      rctx.stroke();
    });
    rctx.shadowBlur = 0;
    const has = recStrokes.some((s) => s.length > 1);
    $("#record-hint").classList.toggle("hidden", has);
  }
  rec.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recDrawing = true;
    recStrokes.push([recPoint(e)]);
    rec.setPointerCapture(e.pointerId);
  });
  rec.addEventListener("pointermove", (e) => {
    if (!recDrawing) return;
    recStrokes[recStrokes.length - 1].push(recPoint(e));
    redrawRecorder();
  });
  rec.addEventListener("pointerup", () => { recDrawing = false; });
  rec.addEventListener("pointercancel", () => { recDrawing = false; });
  $("#record-clear").addEventListener("click", () => { recStrokes = []; redrawRecorder(); });

  function openEditor(spell) {
    const isNew = !spell;
    editing = spell ? JSON.parse(JSON.stringify(spell))
      : { id: Store.uid(), name: "", glyph: "✨", color: COLORS[Math.floor(Math.random() * COLORS.length)], incantation: "", gesture: null, actions: [] };
    editingColor = editing.color || COLORS[0];

    $("#editor-title").textContent = isNew ? "New Spell" : "Edit Spell";
    $("#spell-glyph").value = editing.glyph || "✨";
    $("#spell-name").value = editing.name || "";
    $("#spell-incantation").value = editing.incantation || "";
    $("#spell-delete").style.display = isNew ? "none" : "";

    // Load existing gesture into the recorder as a single stroke for preview.
    recStrokes = editing.gesture && editing.gesture.length ? [editing.gesture.map((p) => ({ x: p.x, y: p.y }))] : [];

    renderSwatches();
    renderSteps();
    editorOverlay.classList.remove("hidden");
    requestAnimationFrame(sizeRecorder);
    if (isNew) setTimeout(() => $("#spell-name").focus(), 50);
  }
  function closeEditor() { editorOverlay.classList.add("hidden"); editing = null; }

  function renderSwatches() {
    const wrap = $("#color-swatches");
    wrap.innerHTML = "";
    COLORS.forEach((c) => {
      const s = document.createElement("button");
      s.className = "swatch" + (c === editingColor ? " selected" : "");
      s.style.background = c; s.style.color = c;
      s.addEventListener("click", () => { editingColor = c; renderSwatches(); redrawRecorder(); });
      wrap.appendChild(s);
    });
  }

  function renderSteps() {
    stepsList.innerHTML = "";
    const acts = editing.actions || [];
    stepsEmpty.classList.toggle("hidden", acts.length > 0);
    acts.forEach((step, idx) => {
      const def = ACTIONS[step.type];
      if (!def) return;
      const li = document.createElement("li");
      li.className = "step";
      const badge = def.category === "shortcuts" ? '<span class="step-badge">Shortcuts</span>' : '<span class="step-badge web">Web</span>';
      const head = document.createElement("div");
      head.className = "step-head";
      head.innerHTML = `
        <span class="step-icon">${def.icon}</span>
        <span class="step-title">${escapeHtml(def.label)}</span>${badge}
        <span class="step-ctrls">
          <button data-up>↑</button><button data-down>↓</button><button data-del>✕</button>
        </span>`;
      li.appendChild(head);

      const fields = document.createElement("div");
      fields.className = "step-fields";
      step.params = step.params || {};
      def.fields.forEach((f) => {
        const lbl = document.createElement("label");
        lbl.className = "field";
        const span = document.createElement("span"); span.textContent = f.label; lbl.appendChild(span);
        let input;
        if (f.type === "textarea") input = document.createElement("textarea");
        else if (f.type === "select") {
          input = document.createElement("select");
          (f.options || []).forEach((o) => { const op = document.createElement("option"); op.value = o; op.textContent = o; input.appendChild(op); });
        } else { input = document.createElement("input"); input.type = f.type || "text"; }
        if (f.placeholder) input.placeholder = f.placeholder;
        input.value = step.params[f.key] != null ? step.params[f.key] : "";
        input.addEventListener("input", () => { step.params[f.key] = input.value; });
        lbl.appendChild(input); fields.appendChild(lbl);
      });
      li.appendChild(fields);

      head.querySelector("[data-up]").addEventListener("click", () => moveStep(idx, -1));
      head.querySelector("[data-down]").addEventListener("click", () => moveStep(idx, 1));
      head.querySelector("[data-del]").addEventListener("click", () => { acts.splice(idx, 1); renderSteps(); });
      stepsList.appendChild(li);
    });
  }
  function moveStep(idx, dir) {
    const a = editing.actions, j = idx + dir;
    if (j < 0 || j >= a.length) return;
    [a[idx], a[j]] = [a[j], a[idx]]; renderSteps();
  }

  function collectEditor() {
    editing.glyph = $("#spell-glyph").value.trim() || "✨";
    editing.name = $("#spell-name").value.trim();
    editing.incantation = $("#spell-incantation").value.trim();
    editing.color = editingColor;
    const pts = recStrokes.flat();
    if (pts.length >= 8) editing.gesture = pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  }

  $("#spell-save").addEventListener("click", () => {
    collectEditor();
    if (!editing.name) { toast("Give your spell a name ✦"); $("#spell-name").focus(); return; }
    if (!editing.gesture || editing.gesture.length < 8) { toast("Draw a shape for this spell first ✍️"); return; }
    Recognizer.clearTemplate(editing);
    const i = spells.findIndex((s) => s.id === editing.id);
    if (i >= 0) spells[i] = editing; else spells.push(editing);
    Store.save(spells);
    toast("Spell saved ✨ — draw it to cast");
    closeEditor();
  });

  $("#spell-test").addEventListener("click", () => { collectEditor(); castSpell(editing); });

  $("#spell-delete").addEventListener("click", () => {
    if (!confirm("Delete “" + (editing.name || "this spell") + "”?")) return;
    spells = spells.filter((s) => s.id !== editing.id);
    Store.save(spells);
    closeEditor();
    toast("Spell unmade");
  });

  $("#editor-close").addEventListener("click", closeEditor);
  editorOverlay.addEventListener("click", (e) => { if (e.target === editorOverlay) closeEditor(); });

  /* ===================== Action picker ===================== */
  const pickerOverlay = $("#picker-overlay");
  const pickerList = $("#picker-list");
  const pickerSearch = $("#picker-search");
  function openPicker() { pickerSearch.value = ""; renderPicker(""); pickerOverlay.classList.remove("hidden"); setTimeout(() => pickerSearch.focus(), 50); }
  function closePicker() { pickerOverlay.classList.add("hidden"); }
  function renderPicker(query) {
    query = (query || "").toLowerCase();
    pickerList.innerHTML = "";
    const groups = { shortcuts: [], web: [] };
    Object.keys(ACTIONS).forEach((type) => {
      const def = ACTIONS[type];
      if (!query || (def.label + " " + def.summary).toLowerCase().includes(query)) groups[def.category].push({ type, def });
    });
    const titles = { shortcuts: "Apple Shortcuts bridge", web: "Built-in web actions" };
    ["shortcuts", "web"].forEach((cat) => {
      if (!groups[cat].length) return;
      const h = document.createElement("div"); h.className = "picker-cat"; h.textContent = titles[cat]; pickerList.appendChild(h);
      groups[cat].forEach(({ type, def }) => {
        const item = document.createElement("button");
        item.className = "picker-item";
        item.innerHTML = `<span class="pi-icon">${def.icon}</span><span class="pi-text"><b>${escapeHtml(def.label)}</b><small>${escapeHtml(def.summary)}</small></span>`;
        item.addEventListener("click", () => { editing.actions.push({ type, params: {} }); renderSteps(); closePicker(); });
        pickerList.appendChild(item);
      });
    });
  }
  pickerSearch.addEventListener("input", () => renderPicker(pickerSearch.value));
  $("#add-step").addEventListener("click", openPicker);
  $("#picker-close").addEventListener("click", closePicker);
  pickerOverlay.addEventListener("click", (e) => { if (e.target === pickerOverlay) closePicker(); });

  /* ===================== Import / export ===================== */
  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 2, spells }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "spellbook.json";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Grimoire exported ⬆");
  });
  const fileInput = $("#file-input");
  $("#btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : data.spells;
        if (!Array.isArray(incoming)) throw new Error("No spells found");
        incoming.forEach((s) => { s.id = Store.uid(); Recognizer.clearTemplate(s); });
        spells = spells.concat(incoming);
        Store.save(spells); renderSpellList();
        toast("Imported " + incoming.length + " spell(s) ⬇");
      } catch (e) { toast("Could not import: " + e.message); }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });

  /* ===================== Helpers ===================== */
  function anyOverlayOpen() {
    return [settingsOverlay, editorOverlay, pickerOverlay].some((o) => !o.classList.contains("hidden"));
  }
  function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!pickerOverlay.classList.contains("hidden")) closePicker();
    else if (!editorOverlay.classList.contains("hidden")) closeEditor();
    else if (!settingsOverlay.classList.contains("hidden")) closeSettings();
  });
})();
