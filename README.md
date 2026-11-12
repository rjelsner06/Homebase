# Homebase

My personal dashboard. Plain HTML, CSS and JavaScript: no build step, no npm. Open `index.html` with VS Code's **Open with Live Server**, or visit https://rjelsner06.github.io/Homebase.

> Opening `index.html` by double-clicking it (a `file://` address) won't fully work: the Lifts app is fetched from `apps/lifts.html`, and browsers block that for plain files. Use Live Server.

## Files

```
index.html            The page itself: header, pages, dialogs (all the HTML markup), plus the
                      theme-before-first-paint snippet. Loads everything below, in order.
css/base.css          Layout, header, widgets (clock, weather, mail, to-do), calendar, to-do rows,
                      import, pages, dialogs, colors and light/dark themes.
css/notes.css         Notes page: folders, note cards, the editor, toolbar pop-ups, full screen.
css/home.css          Home screens: the tile grid, edit mode, the widget panel, the ⋯ menu.
css/settings.css      Links row and link pop-up, Daily facts, Reminders, Types, Settings layout, Sync.
js/import-core.js     Pure import logic: turns PDF / CSV / .ics text into items (no page access).
js/core.js            The foundation: config (types, categories), helpers ($, $$, esc, dates),
                      Store (items), Sync (Supabase), Settings, theme, course colors, type order.
js/ui.js              Shared pieces: row selection, bulk actions, toast + undo, confirm box;
                      clock, weather and mail widgets.
js/calendar.js        Calendar: Day / Week / Month / Year.
js/todo.js            Home to-do tile, To-do page, All items, Recently Deleted, the item panel.
js/notes.js           Notes: folders, cards, editor, tables, toolbar, HTML clean-up (cleanHTML).
js/home.js            Home screens (tile grid, widget fitting), the ⋯ menu, page routing
                      (#home, #todo, #notes, #items, #deleted) and renderAll().
js/import.js          "Import schedule": AI assist (Ollama / Claude), file readers, paste and
                      screenshot (OCR), the review screen.
js/links.js           Settings sync wiring, small helpers (downloadText, safeJSON), the links row,
                      the link pop-up, uploaded HTML apps.
js/lifts.js           Connects Lifts to Homebase's synced storage and loads apps/lifts.html.
js/settings.js        Settings → Links and Types, the type menu, the Settings dialog layout.
js/facts.js           Daily facts (from your local Ollama model).
js/reminders.js       Reminders pushed to your iPhone through ntfy.
js/app.js             Settings → Sync & account, setup links, and BOOT (starts everything).
apps/lifts.html       The Lifts app itself (its own HTML, CSS and JS). Runs in its own frame.
```

## Where do I edit…?

| I want to change… | Edit |
|---|---|
| Colors, fonts, light/dark variables | `css/base.css` (the `:root` blocks at the top) |
| How the Notes page or editor looks | `css/notes.css` |
| Notes behavior (editor, folders, toolbar) | `js/notes.js` |
| To-do page, All items, Recently Deleted, item panel | `js/todo.js` |
| Calendar | `js/calendar.js` (styles in `css/base.css`) |
| Home tiles / widgets / home screens | `js/home.js` + `css/home.css` |
| Clock, weather, mail widgets | `js/ui.js` |
| Item types and categories (built-in list) | `js/core.js` (CONFIG at the top) |
| Settings → Types screen | `js/settings.js` |
| Data saving and Supabase sync | `js/core.js` (Store, Sync) |
| Theme rules (auto / light / dark) | `js/core.js` **and** the small snippet in the `<head>` of `index.html` (keep them matching) |
| Importing PDFs / CSV / .ics / screenshots | `js/import.js` (parsing rules: `js/import-core.js`) |
| Links row and link pop-up | `js/links.js` |
| The Lifts app | `apps/lifts.html` (its storage bridge: `js/lifts.js`) |
| Daily facts | `js/facts.js` |
| Reminders (ntfy) | `js/reminders.js` |
| Sync & account settings | `js/app.js` |
| Any page markup, buttons or dialogs | `index.html` |

## Rules for editing (so nothing breaks)

1. **Script order matters.** All the `js/` files share one global scope, like one big script cut into pieces. A file can use anything from files above it right away. Anything from files below it can only be used inside a function that runs later (on a click, or from BOOT). `js/app.js` must stay last.
2. **CSS order matters too.** Later files can override earlier ones, so keep the `<link>` order in `index.html`.
3. **Names are shared.** Two files can't both declare the same top-level name (`const x` in one and `function x` in another). If you add a new top-level name, search all of `js/` first.
4. **New file?** Add a `<script src="js/….js"></script>` (or a `<link>`) in `index.html`, in the right spot.
5. After a push, GitHub Pages can serve old copies of some files for about 10 minutes. If the phone looks broken right after a push, wait a few minutes and reload.
