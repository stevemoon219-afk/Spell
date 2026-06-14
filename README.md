# 🪄 Spellbook — a whiteboard for custom spells

Spellbook is a mobile-first web app where you write **custom spells** — named
incantations bound to a sequence of actions, just like Shortcuts on iPhone.
Drop spells onto a magical whiteboard, arrange them, and **cast** them with a tap.

A spell can do real things on your iPhone two ways:

- **🔮 Apple Shortcuts bridge** — a spell can run any Shortcut by name (passing
  text input), or open any `x-callback-url` / app deep link. This is the
  legitimate way a web app triggers native iOS automation, so a spell can
  effectively do *anything* you can build in the Shortcuts app.
- **🌐 Built-in web actions** — open URLs/app links, call, text (SMS), email,
  FaceTime, Maps, web search, copy to clipboard, speak aloud, notify, vibrate,
  share sheet, and wait/delay.

Each spell can mix both kinds of actions, run top-to-bottom.

## Run it

It's a static site — no build step, no server code.

```bash
# from the repo root, start any static server, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000 on your computer,
# or http://<your-computer-ip>:8000 on your iPhone (same Wi-Fi)
```

For real use, host the folder anywhere static (GitHub Pages, Netlify, etc.) and
open it in **Safari on your iPhone**. Then **Share → Add to Home Screen** to
install it like a native app (custom schemes such as `shortcuts://`, `tel:`,
`sms:`, and `maps://` only hand off to apps on the device itself).

## Using it

1. Tap **✦ New Spell**.
2. Give it a name, a glyph (emoji), an optional incantation, and a colour.
3. Tap **＋ Add action** and pick from the Shortcuts bridge or web actions.
4. Fill in each action's fields. Reorder with ↑ / ↓.
5. **▶ Test cast** while editing, or **Save** and tap **✦ Cast** on the card.
6. Drag cards anywhere; **▦** tidies them into a grid.

Spells are stored locally in your browser. Use **⬆ Export** / **⬇ Import** to
back them up or move them between devices (a `spellbook.json` file).

### Example spells (included on first run)

- **Coffee Run** → opens Maps searching for coffee.
- **I'm Driving** → runs a "Driving Focus" Shortcut, then speaks a confirmation.
- **SOS Text Home** → opens Messages with "On my way home now."

## Tips for the Shortcuts bridge

- The **Shortcut name must match exactly** what's in your Shortcuts app.
- To pass data in, fill the *Text input* field; in your Shortcut, read it with
  **Shortcut Input**.
- Want a spell to file a reminder, toggle a smart light, or post to an app?
  Build that flow once in Shortcuts, then point a spell's **Run a Shortcut**
  action at it.

## Project layout

```
index.html              # markup + app shell
css/styles.css          # magical dark theme
js/store.js             # localStorage persistence + seed spells
js/actions.js           # action registry + the casting engine
js/app.js               # whiteboard UI: render, drag, edit, cast, import/export
manifest.webmanifest    # PWA / Add-to-Home-Screen metadata
icons/                  # generated app icons (+ generator script)
```

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

The editor builds its form from `fields` automatically, and the action shows
up in the picker under its category.
