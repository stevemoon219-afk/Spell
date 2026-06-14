/* actions.js — the spell action registry + the casting engine.
 *
 * Two families of actions:
 *   - "shortcuts": bridge to Apple Shortcuts via shortcuts:// / x-callback-url.
 *                  These are the legitimate way a web app triggers native iOS automation.
 *   - "web":       things the browser itself can do (open links, copy, speak, notify, …).
 *
 * Each action declares the form fields it needs, plus a run(params, ctx) function.
 * ctx exposes { log(text, level), wait(ms) } so actions can report progress.
 */
(function (global) {
  "use strict";

  const enc = encodeURIComponent;

  // Open a URL/scheme. On iOS, custom schemes (tel:, sms:, shortcuts:, maps:)
  // hand off to the relevant app. We use a transient anchor click so Safari
  // treats it as a user-initiated navigation where possible.
  function go(url) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const ACTIONS = {
    /* ---------------- Apple Shortcuts bridge ---------------- */
    run_shortcut: {
      label: "Run a Shortcut", icon: "🔮", category: "shortcuts",
      summary: "Run an Apple Shortcut by name (with optional input).",
      fields: [
        { key: "name", label: "Shortcut name", type: "text", placeholder: "Exact name in the Shortcuts app" },
        { key: "input", label: "Text input (optional)", type: "text", placeholder: "Passed to the shortcut" }
      ],
      describe: (p) => `Run “${p.name || "?"}”`,
      run: (p, ctx) => {
        if (!p.name) throw new Error("No shortcut name set");
        let url = "shortcuts://run-shortcut?name=" + enc(p.name);
        if (p.input) url += "&input=text&text=" + enc(p.input);
        ctx.log("Invoking Shortcut “" + p.name + "”", "ok");
        go(url);
      }
    },
    open_shortcuts_url: {
      label: "Custom x-callback / scheme URL", icon: "⛓️", category: "shortcuts",
      summary: "Open any URL scheme (x-callback-url, app deep link, etc.).",
      fields: [
        { key: "url", label: "URL", type: "text", placeholder: "e.g. things:///add?title=Milk" }
      ],
      describe: (p) => `Open ${truncate(p.url, 28)}`,
      run: (p, ctx) => {
        if (!p.url) throw new Error("No URL set");
        ctx.log("Opening " + p.url, "ok");
        go(p.url);
      }
    },

    /* ---------------- Built-in web actions ---------------- */
    open_url: {
      label: "Open URL / app link", icon: "🌐", category: "web",
      summary: "Open a website or app scheme (maps:, music:, https:, …).",
      fields: [{ key: "url", label: "URL", type: "text", placeholder: "https://… or maps://?q=…" }],
      describe: (p) => `Open ${truncate(p.url, 28)}`,
      run: (p, ctx) => {
        if (!p.url) throw new Error("No URL set");
        const url = /^[a-z][a-z0-9+.-]*:/i.test(p.url) ? p.url : "https://" + p.url;
        ctx.log("Opening " + url, "ok");
        go(url);
      }
    },
    call: {
      label: "Phone call", icon: "📞", category: "web",
      summary: "Start a phone call to a number.",
      fields: [{ key: "number", label: "Phone number", type: "tel", placeholder: "+1 555 0100" }],
      describe: (p) => `Call ${p.number || "?"}`,
      run: (p, ctx) => {
        if (!p.number) throw new Error("No number set");
        ctx.log("Calling " + p.number, "ok");
        go("tel:" + enc(p.number));
      }
    },
    sms: {
      label: "Send a text (SMS)", icon: "💬", category: "web",
      summary: "Open Messages pre-filled with a recipient and body.",
      fields: [
        { key: "number", label: "Recipient (optional)", type: "tel", placeholder: "+1 555 0100" },
        { key: "body", label: "Message", type: "textarea", placeholder: "On my way!" }
      ],
      describe: (p) => `Text ${p.number || "someone"}`,
      run: (p, ctx) => {
        let url = "sms:" + enc(p.number || "");
        if (p.body) url += (/[?&]/.test(url) ? "&" : "&") + "body=" + enc(p.body);
        ctx.log("Opening Messages", "ok");
        go(url);
      }
    },
    email: {
      label: "Compose email", icon: "✉️", category: "web",
      summary: "Open Mail with a draft.",
      fields: [
        { key: "to", label: "To", type: "text", placeholder: "name@example.com" },
        { key: "subject", label: "Subject", type: "text", placeholder: "" },
        { key: "body", label: "Body", type: "textarea", placeholder: "" }
      ],
      describe: (p) => `Email ${p.to || "someone"}`,
      run: (p, ctx) => {
        const q = [];
        if (p.subject) q.push("subject=" + enc(p.subject));
        if (p.body) q.push("body=" + enc(p.body));
        ctx.log("Opening Mail", "ok");
        go("mailto:" + enc(p.to || "") + (q.length ? "?" + q.join("&") : ""));
      }
    },
    facetime: {
      label: "FaceTime", icon: "📹", category: "web",
      summary: "Start a FaceTime call.",
      fields: [{ key: "target", label: "Number or Apple ID", type: "text", placeholder: "+1 555 0100" }],
      describe: (p) => `FaceTime ${p.target || "?"}`,
      run: (p, ctx) => {
        if (!p.target) throw new Error("No target set");
        ctx.log("Starting FaceTime", "ok");
        go("facetime:" + enc(p.target));
      }
    },
    maps: {
      label: "Open in Maps", icon: "🗺️", category: "web",
      summary: "Search or navigate in Apple Maps.",
      fields: [
        { key: "query", label: "Place / address", type: "text", placeholder: "Blue Bottle Coffee" },
        { key: "mode", label: "Action", type: "select", options: ["Search", "Directions"] }
      ],
      describe: (p) => `Maps: ${p.query || "?"}`,
      run: (p, ctx) => {
        if (!p.query) throw new Error("No place set");
        const url = p.mode === "Directions"
          ? "maps://?daddr=" + enc(p.query)
          : "maps://?q=" + enc(p.query);
        ctx.log((p.mode === "Directions" ? "Routing to " : "Searching ") + p.query, "ok");
        go(url);
      }
    },
    web_search: {
      label: "Web search", icon: "🔍", category: "web",
      summary: "Search the web in your browser.",
      fields: [{ key: "query", label: "Search for", type: "text", placeholder: "tide times today" }],
      describe: (p) => `Search “${p.query || "?"}”`,
      run: (p, ctx) => {
        if (!p.query) throw new Error("No query set");
        ctx.log("Searching the web", "ok");
        go("https://duckduckgo.com/?q=" + enc(p.query));
      }
    },
    copy: {
      label: "Copy text to clipboard", icon: "📋", category: "web",
      summary: "Place text on the clipboard.",
      fields: [{ key: "text", label: "Text", type: "textarea", placeholder: "" }],
      describe: (p) => `Copy text`,
      run: async (p, ctx) => {
        const text = p.text || "";
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          // Fallback for browsers blocking async clipboard.
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
        }
        ctx.log("Copied to clipboard", "ok");
      }
    },
    speak: {
      label: "Speak text aloud", icon: "🗣️", category: "web",
      summary: "Read text aloud with the device voice.",
      fields: [
        { key: "text", label: "What to say", type: "textarea", placeholder: "Your potion is ready." },
        { key: "rate", label: "Rate (0.5–2)", type: "text", placeholder: "1" },
        { key: "pitch", label: "Pitch (0–2)", type: "text", placeholder: "1" }
      ],
      describe: (p) => `Say “${truncate(p.text, 20)}”`,
      run: (p, ctx) => new Promise((resolve) => {
        if (!("speechSynthesis" in window)) { ctx.log("Speech not supported", "err"); return resolve(); }
        const u = new SpeechSynthesisUtterance(p.text || "");
        u.rate = clampNum(p.rate, 0.5, 2, 1);
        u.pitch = clampNum(p.pitch, 0, 2, 1);
        u.onend = resolve; u.onerror = resolve;
        ctx.log("Speaking…", "ok");
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        setTimeout(resolve, 8000); // safety net
      })
    },
    notify: {
      label: "Show a notification", icon: "🔔", category: "web",
      summary: "Post a local notification (asks permission once).",
      fields: [
        { key: "title", label: "Title", type: "text", placeholder: "Spell complete" },
        { key: "body", label: "Body", type: "text", placeholder: "" }
      ],
      describe: (p) => `Notify “${truncate(p.title, 20)}”`,
      run: async (p, ctx) => {
        if (!("Notification" in window)) { ctx.log("Notifications not supported", "err"); return; }
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          new Notification(p.title || "Spellbook", { body: p.body || "" });
          ctx.log("Notification posted", "ok");
        } else {
          ctx.log("Notification permission denied", "err");
        }
      }
    },
    vibrate: {
      label: "Vibrate", icon: "📳", category: "web",
      summary: "Buzz the device (where supported).",
      fields: [{ key: "pattern", label: "Pattern (ms, comma-separated)", type: "text", placeholder: "200,100,200" }],
      describe: () => "Vibrate",
      run: (p, ctx) => {
        const pattern = (p.pattern || "200").split(",").map((n) => parseInt(n.trim(), 10) || 0);
        if (navigator.vibrate) { navigator.vibrate(pattern); ctx.log("Buzzed", "ok"); }
        else ctx.log("Vibration not supported on this device", "info");
      }
    },
    share: {
      label: "Share sheet", icon: "📤", category: "web",
      summary: "Open the native share sheet.",
      fields: [
        { key: "title", label: "Title", type: "text", placeholder: "" },
        { key: "text", label: "Text", type: "text", placeholder: "" },
        { key: "url", label: "URL", type: "text", placeholder: "https://…" }
      ],
      describe: () => "Open share sheet",
      run: async (p, ctx) => {
        if (!navigator.share) { ctx.log("Share not supported here", "info"); return; }
        try {
          await navigator.share({ title: p.title || "", text: p.text || "", url: p.url || "" });
          ctx.log("Shared", "ok");
        } catch (e) { ctx.log("Share cancelled", "info"); }
      }
    },
    wait: {
      label: "Wait", icon: "⏳", category: "web",
      summary: "Pause before the next action.",
      fields: [{ key: "seconds", label: "Seconds", type: "text", placeholder: "2" }],
      describe: (p) => `Wait ${p.seconds || "0"}s`,
      run: async (p, ctx) => {
        const s = clampNum(p.seconds, 0, 600, 1);
        ctx.log("Waiting " + s + "s…", "info");
        await ctx.wait(s * 1000);
      }
    }
  };

  function truncate(s, n) {
    s = (s || "").toString();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function clampNum(v, min, max, fallback) {
    const n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // Cast a whole spell: run its actions in order, reporting to ctx.log.
  async function cast(spell, ctx) {
    ctx.log("✦ Casting “" + spell.name + "”", "info");
    if (!spell.actions || !spell.actions.length) {
      ctx.log("This spell has no actions", "err");
      return;
    }
    for (let i = 0; i < spell.actions.length; i++) {
      const step = spell.actions[i];
      const def = ACTIONS[step.type];
      if (!def) { ctx.log("Unknown action: " + step.type, "err"); continue; }
      try {
        await def.run(step.params || {}, ctx);
      } catch (e) {
        ctx.log((def.label || step.type) + " failed: " + e.message, "err");
      }
    }
    ctx.log("✓ Spell complete", "ok");
  }

  global.Actions = { ACTIONS, cast, truncate };
})(window);
