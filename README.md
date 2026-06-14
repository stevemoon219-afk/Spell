# 🪄 Spellbook — draw to cast

Spellbook is a mobile-first web app where the whole screen is a **whiteboard you
draw on**. Each spell is bound to a **drawn shape (a glyph/gesture)** — trace
that shape anywhere on the board and the spell **casts**, running a sequence of
actions just like an iPhone Shortcut.

No buttons to tap to cast — you literally draw the spell.

## How it works

- **Cast:** draw a spell's shape on the whiteboard. Spellbook recognises the
  closest match (it's tolerant of size, position and a bit of rotation) and runs
  it. A drawn shape needs to be reasonably close to the sample you recorded.
- **Create:** open **⚙ Settings → ✦ New spell**, draw a sample shape in the
  recorder, name it, pick a colour, and add actions. (You can draw in multiple
  strokes — e.g. a star.)
- **Customise the board:** Settings lets you change the **theme**, **ink
  colour**, **glow trail**, and **grid**.

A spell can do real things on your iPhone two ways:

- **🔮 Apple Shortcuts bridge** — run any Shortcut by name (passing text input),
  or open any `x-callback-url` / app deep link. ⚠️ The Shortcut must already
  exist in your Shortcuts app with that **exact name**, or iOS shows
  *"The file doesn't exist / Could not find the shortcut."*
- **🌐 Built-in web actions** — open URLs/app links, call, text (SMS), email,
  FaceTime, Maps, web search, copy, speak aloud, notify, vibrate, share, wait.

Each spell can mix both kinds, run top-to-bottom.

## Run it

It's a static site — no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000 on a computer, or use GitHub Pages on your phone
```

For real use, open it in **Safari on your iPhone** and **Share → Add to Home
Screen**. Custom schemes (`shortcuts://`, `tel:`, `sms:`, `maps://`) only hand
off to apps when the page is opened *on the device itself*.

> **Note on iOS prompts:** when a spell opens another app, iOS shows a security
> confirmation ("Open in …?"). This is enforced by the operating system and
> cannot be disabled by any website; adding the app to your Home Screen makes it
> less intrusive.

### Starter spells (included on first run)

These use only web actions, so they work with zero setup — just trace the shape:

- **◯ Circle** → Coffee Run (opens Maps for coffee)
- **△ Triangle** → Reveal Knowledge (web search)
- **Z** → Speak, Spirit (speaks "The spell is cast.")

## Project layout

```
index.html              # markup + app shell (full-screen drawing board)
css/styles.css          # themes, HUD, settings sheet, editor, recorder
js/store.js             # localStorage persistence, appearance, seed spells
js/recognizer.js        # $1 Unistroke gesture recognizer
js/actions.js           # action registry + the casting engine
js/app.js               # drawing, recognition, casting, settings, editor
manifest.webmanifest    # PWA / Add-to-Home-Screen metadata
icons/                  # generated app icons (+ generator script)
```

## Tips

- **Draw shapes that are distinct** from each other — a circle vs a triangle vs a
  Z are easy to tell apart; two similar squiggles may get confused.
- If a cast doesn't trigger, a toast tells you the closest spell — redraw a
  little closer to your original sample, or re-record the sample in the editor.
- Re-record a spell's shape anytime: Settings → ✎ on the spell → draw again →
  Save.

## Extending it with new actions

Add an entry to `ACTIONS` in `js/actions.js`:

```js
my_action: {
  label: "My action", icon: "✨", category: "web", // or "shortcuts"
  summary: "What it does (shown in the picker).",
  fields: [{ key: "thing", label: "Thing", type: "text", placeholder: "" }],
  describe: (p) => `Do ${p.thing}`,
  run: (p, ctx) => { ctx.log("Doing " + p.thing, "ok"); /* ... */ }
}
```

The editor builds the form from `fields` automatically and the action appears in
the picker under its category.
