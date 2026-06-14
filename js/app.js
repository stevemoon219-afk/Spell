/* app.js — Spellbook whiteboard UI: render, drag, edit, cast, import/export. */
(function () {
  "use strict";

  const { ACTIONS, cast, truncate } = window.Actions;
  const Store = window.Store;

  const COLORS = ["#8b6cff", "#ff7adb", "#ffd36e", "#7aa8ff", "#7ee3a7", "#ff9b6b", "#c08bff", "#ff6b81"];

  let spells = Store.load();
  if (!spells.length && !localStorage.getItem("spellbook.seeded")) {
    spells = Store.seeds();
    localStorage.setItem("spellbook.seeded", "1");
    Store.save(spells);
  }

  // Editor working state
  let editing = null; // the spell being edited (a clone)
  let editingColor = COLORS[0];

  const $ = (sel) => document.querySelector(sel);
  const canvas = $("#canvas");
  const emptyState = $("#empty-state");

  /* ---------------- Rendering the whiteboard ---------------- */
  function render() {
    canvas.innerHTML = "";
    emptyState.classList.toggle("hidden", spells.length > 0);

    spells.forEach((spell) => {
      const card = document.createElement("div");
      card.className = "spell-card";
      card.style.left = (spell.x || 20) + "px";
      card.style.top = (spell.y || 20) + "px";
      card.style.setProperty("--card-color", spell.color || COLORS[0]);
      card.dataset.id = spell.id;

      const count = (spell.actions || []).length;
      card.innerHTML = `
        <div class="card-glyph">${escapeHtml(spell.glyph || "✨")}</div>
        <div class="card-name">${escapeHtml(spell.name || "Untitled spell")}</div>
        <div class="card-incantation">${escapeHtml(spell.incantation || "")}</div>
        <div class="card-meta">${count} action${count === 1 ? "" : "s"}</div>
        <div class="card-buttons">
          <button class="cast-btn" data-cast>✦ Cast</button>
          <button class="edit-btn" data-edit aria-label="Edit">✎</button>
        </div>`;

      card.querySelector("[data-cast]").addEventListener("click", (e) => {
        e.stopPropagation();
        castSpell(spell, card);
      });
      card.querySelector("[data-edit]").addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(spell);
      });

      makeDraggable(card, spell);
      canvas.appendChild(card);
    });
  }

  /* ---------------- Dragging cards ---------------- */
  function makeDraggable(card, spell) {
    let startX, startY, origX, origY, moved = false, dragging = false;

    const onDown = (e) => {
      // Ignore drags that start on the buttons.
      if (e.target.closest("button")) return;
      dragging = true; moved = false;
      const pt = point(e);
      startX = pt.x; startY = pt.y;
      origX = spell.x || 20; origY = spell.y || 20;
      card.classList.add("dragging");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const pt = point(e);
      const dx = pt.x - startX, dy = pt.y - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      spell.x = Math.max(0, origX + dx);
      spell.y = Math.max(0, origY + dy);
      card.style.left = spell.x + "px";
      card.style.top = spell.y + "px";
    };
    const onUp = () => {
      dragging = false;
      card.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) persist();
    };
    card.addEventListener("pointerdown", onDown);
  }

  function point(e) {
    return { x: e.clientX, y: e.clientY };
  }

  /* ---------------- Casting ---------------- */
  const consoleEl = $("#console");
  const consoleLog = $("#console-log");

  function openConsole() {
    consoleLog.innerHTML = "";
    consoleEl.classList.remove("hidden");
  }
  function logLine(text, level) {
    const li = document.createElement("li");
    const icon = level === "ok" ? "✓" : level === "err" ? "✕" : "•";
    li.innerHTML = `<span class="log-icon log-${level}">${icon}</span><span>${escapeHtml(text)}</span>`;
    consoleLog.appendChild(li);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  async function castSpell(spell, cardEl) {
    if (cardEl) {
      cardEl.classList.remove("casting");
      void cardEl.offsetWidth; // restart animation
      cardEl.classList.add("casting");
    }
    openConsole();
    const ctx = {
      log: logLine,
      wait: (ms) => new Promise((r) => setTimeout(r, ms))
    };
    await cast(spell, ctx);
  }

  $("#console-close").addEventListener("click", () => consoleEl.classList.add("hidden"));

  /* ---------------- Editor modal ---------------- */
  const editorOverlay = $("#editor-overlay");
  const stepsList = $("#steps-list");
  const stepsEmpty = $("#steps-empty");

  function openEditor(spell) {
    const isNew = !spell;
    editing = spell
      ? JSON.parse(JSON.stringify(spell))
      : { id: Store.uid(), name: "", glyph: "✨", color: COLORS[Math.floor(Math.random() * COLORS.length)],
          incantation: "", x: scrollX_() + 40, y: scrollY_() + 40, actions: [] };

    editingColor = editing.color || COLORS[0];
    $("#editor-title").textContent = isNew ? "New Spell" : "Edit Spell";
    $("#spell-glyph").value = editing.glyph || "✨";
    $("#spell-name").value = editing.name || "";
    $("#spell-incantation").value = editing.incantation || "";
    $("#spell-delete").style.display = isNew ? "none" : "";

    renderSwatches();
    renderSteps();
    editorOverlay.classList.remove("hidden");
    if (isNew) setTimeout(() => $("#spell-name").focus(), 50);
  }

  function closeEditor() {
    editorOverlay.classList.add("hidden");
    editing = null;
  }

  function renderSwatches() {
    const wrap = $("#color-swatches");
    wrap.innerHTML = "";
    COLORS.forEach((c) => {
      const s = document.createElement("button");
      s.className = "swatch" + (c === editingColor ? " selected" : "");
      s.style.background = c;
      s.style.color = c;
      s.addEventListener("click", () => { editingColor = c; renderSwatches(); });
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
      const badge = def.category === "shortcuts"
        ? '<span class="step-badge">Shortcuts</span>'
        : '<span class="step-badge web">Web</span>';

      const head = document.createElement("div");
      head.className = "step-head";
      head.innerHTML = `
        <span class="step-icon">${def.icon}</span>
        <span class="step-title">${escapeHtml(def.label)}</span>
        ${badge}
        <span class="step-ctrls">
          <button data-up title="Move up">↑</button>
          <button data-down title="Move down">↓</button>
          <button data-del title="Remove">✕</button>
        </span>`;
      li.appendChild(head);

      const fields = document.createElement("div");
      fields.className = "step-fields";
      step.params = step.params || {};
      def.fields.forEach((f) => {
        const lbl = document.createElement("label");
        lbl.className = "field";
        const span = document.createElement("span");
        span.textContent = f.label;
        lbl.appendChild(span);

        let input;
        if (f.type === "textarea") {
          input = document.createElement("textarea");
        } else if (f.type === "select") {
          input = document.createElement("select");
          (f.options || []).forEach((o) => {
            const opt = document.createElement("option");
            opt.value = o; opt.textContent = o;
            input.appendChild(opt);
          });
        } else {
          input = document.createElement("input");
          input.type = f.type || "text";
        }
        if (f.placeholder) input.placeholder = f.placeholder;
        input.value = step.params[f.key] != null ? step.params[f.key] : "";
        input.addEventListener("input", () => { step.params[f.key] = input.value; });
        lbl.appendChild(input);
        fields.appendChild(lbl);
      });
      li.appendChild(fields);

      head.querySelector("[data-up]").addEventListener("click", () => moveStep(idx, -1));
      head.querySelector("[data-down]").addEventListener("click", () => moveStep(idx, 1));
      head.querySelector("[data-del]").addEventListener("click", () => { acts.splice(idx, 1); renderSteps(); });

      stepsList.appendChild(li);
    });
  }

  function moveStep(idx, dir) {
    const acts = editing.actions;
    const j = idx + dir;
    if (j < 0 || j >= acts.length) return;
    [acts[idx], acts[j]] = [acts[j], acts[idx]];
    renderSteps();
  }

  function collectEditor() {
    editing.glyph = $("#spell-glyph").value.trim() || "✨";
    editing.name = $("#spell-name").value.trim();
    editing.incantation = $("#spell-incantation").value.trim();
    editing.color = editingColor;
  }

  $("#spell-save").addEventListener("click", () => {
    collectEditor();
    if (!editing.name) { toast("Give your spell a name first ✦"); $("#spell-name").focus(); return; }
    const i = spells.findIndex((s) => s.id === editing.id);
    if (i >= 0) spells[i] = editing; else spells.push(editing);
    persist();
    render();
    toast("Spell saved ✨");
    closeEditor();
  });

  $("#spell-test").addEventListener("click", () => {
    collectEditor();
    castSpell(editing, null);
  });

  $("#spell-delete").addEventListener("click", () => {
    if (!confirm("Delete “" + (editing.name || "this spell") + "”?")) return;
    spells = spells.filter((s) => s.id !== editing.id);
    persist();
    render();
    closeEditor();
    toast("Spell unmade");
  });

  $("#editor-close").addEventListener("click", closeEditor);
  editorOverlay.addEventListener("click", (e) => { if (e.target === editorOverlay) closeEditor(); });

  /* ---------------- Action picker ---------------- */
  const pickerOverlay = $("#picker-overlay");
  const pickerList = $("#picker-list");
  const pickerSearch = $("#picker-search");

  function openPicker() {
    pickerSearch.value = "";
    renderPicker("");
    pickerOverlay.classList.remove("hidden");
    setTimeout(() => pickerSearch.focus(), 50);
  }
  function closePicker() { pickerOverlay.classList.add("hidden"); }

  function renderPicker(query) {
    query = (query || "").toLowerCase();
    pickerList.innerHTML = "";
    const groups = { shortcuts: [], web: [] };
    Object.keys(ACTIONS).forEach((type) => {
      const def = ACTIONS[type];
      const hay = (def.label + " " + def.summary).toLowerCase();
      if (!query || hay.includes(query)) groups[def.category].push({ type, def });
    });

    const titles = { shortcuts: "Apple Shortcuts bridge", web: "Built-in web actions" };
    ["shortcuts", "web"].forEach((cat) => {
      if (!groups[cat].length) return;
      const h = document.createElement("div");
      h.className = "picker-cat";
      h.textContent = titles[cat];
      pickerList.appendChild(h);
      groups[cat].forEach(({ type, def }) => {
        const item = document.createElement("button");
        item.className = "picker-item";
        item.innerHTML = `
          <span class="pi-icon">${def.icon}</span>
          <span class="pi-text"><b>${escapeHtml(def.label)}</b><small>${escapeHtml(def.summary)}</small></span>`;
        item.addEventListener("click", () => {
          editing.actions.push({ type, params: {} });
          renderSteps();
          closePicker();
        });
        pickerList.appendChild(item);
      });
    });
  }

  pickerSearch.addEventListener("input", () => renderPicker(pickerSearch.value));
  $("#add-step").addEventListener("click", openPicker);
  $("#picker-close").addEventListener("click", closePicker);
  pickerOverlay.addEventListener("click", (e) => { if (e.target === pickerOverlay) closePicker(); });

  /* ---------------- Top bar actions ---------------- */
  $("#btn-new").addEventListener("click", () => openEditor(null));
  emptyState.addEventListener("click", (e) => {
    if (e.target.dataset.action === "new-empty") openEditor(null);
  });

  $("#btn-grid").addEventListener("click", () => {
    const cols = Math.max(1, Math.floor((canvas.clientWidth - 40) / 188));
    spells.forEach((s, i) => {
      s.x = 20 + (i % cols) * 188;
      s.y = 20 + Math.floor(i / cols) * 210;
    });
    persist();
    render();
    toast("Spells tidied ▦");
  });

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 1, spells }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "spellbook.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Grimoire exported ⬆");
  });

  const fileInput = $("#file-input");
  $("#btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : data.spells;
        if (!Array.isArray(incoming)) throw new Error("No spells found");
        incoming.forEach((s) => { s.id = Store.uid(); }); // avoid id clashes
        spells = spells.concat(incoming);
        persist();
        render();
        toast("Imported " + incoming.length + " spell(s) ⬇");
      } catch (e) {
        toast("Could not import: " + e.message);
      }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });

  /* ---------------- Helpers ---------------- */
  function persist() { Store.save(spells); }
  function scrollX_() { return $("#whiteboard").scrollLeft; }
  function scrollY_() { return $("#whiteboard").scrollTop; }

  function escapeHtml(s) {
    return (s == null ? "" : String(s))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2400);
  }

  // Close modals on Escape (handy on desktop).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!pickerOverlay.classList.contains("hidden")) closePicker();
    else if (!editorOverlay.classList.contains("hidden")) closeEditor();
  });

  render();
})();
