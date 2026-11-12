# Homebase

My personal dashboard. Plain HTML, CSS and JavaScript: no build step, no npm. Open `index.html` with VS Code's **Open with Live Server**, or visit https://rjelsner06.github.io/Homebase.

> Opening `index.html` by double-clicking it (a `file://` address) won't fully work: the Lifts app is fetched from `Apps/lifts.html`, and browsers block that for plain files. Use Live Server.

> **File and folder names are case-sensitive on GitHub Pages** (your phone), but not in Live Server on Windows (your laptop). `Apps/lifts.html` and `apps/lifts.html` are the same file on the laptop and two different files on GitHub Pages. If something works on the laptop but not on the phone, check that the capital letters in the code match the real names exactly.

## Files

```
index.html            The page itself: header, pages, dialogs (all the HTML markup), plus the
                      theme-before-first-paint snippet. Loads everything below, in order
                      (the list is at the very bottom, in HBStore.boot([...])).
css/base.css          Layout, header, widgets (clock, weather, mail, to-do), calendar, to-do rows,
                      import, pages, dialogs, colors and light/dark themes.
css/notes.css         Notes page: folders, note cards, the editor, toolbar pop-ups, full screen.
css/home.css          Home screens: the tile grid, edit mode, the widget panel, the ⋯ menu.
css/week.css          The This Week widget (tasks by day, weekly goals).
css/settings.css      Links row and link pop-up, Daily facts, Reminders, Types, Settings layout, Sync.
css/viewer.css        Files in Notes: the document viewer, file cards (badge, thumbnail), the
                      "Import files" dialog.
js/storage.js         Loads first. The local cache in the browser's IndexedDB (HBStore), the
                      one-time move from localStorage, cached files, and the script loader.
js/import-core.js     Pure import logic: turns PDF / CSV / .ics text into items (no page access).
js/core.js            The foundation: config (types, categories), helpers ($, $$, esc, dates),
                      Store (items), Sync (Supabase), Settings, theme, course colors, type order.
js/ui.js              Shared pieces: row selection, bulk actions, toast + undo, confirm box;
                      clock, weather and mail widgets.
js/calendar.js        Calendar: Day / Week / Month / Year.
js/todo.js            Home to-do tile, To-do page, All items, Recently Deleted, the item panel.
js/notes.js           Notes: folders, cards, editor, tables, toolbar, HTML clean-up (cleanHTML).
                      Also file notes (Notes.addFile) and removing their files when deleted for good.
js/home.js            Home screens (tile grid, widget fitting, page scrolling over widgets), the ⋯ menu,
                      page routing (#home, #todo, #notes, #items, #deleted) and renderAll().
js/import.js          "Import schedule": AI assist (Ollama / Claude), file readers, paste and
                      screenshot (OCR), the review screen.
js/links.js           Settings sync wiring, small helpers (downloadText, safeJSON), the links row,
                      the link pop-up, uploaded HTML apps.
js/lifts.js           Connects Lifts to Homebase's synced storage and loads Apps/lifts.html.
js/settings.js        Settings → Links and Types, the type menu, the Settings dialog layout.
js/facts.js           Daily facts (from your local Ollama model).
js/week.js            This Week widget (tasks due this week by day, weekly goals; kind "weekgoal").
js/reminders.js       Reminders pushed to your iPhone through ntfy.
js/files.js           Files kept in Supabase Storage (Files.upload / getUrl / open / delete)
                      and Settings → Storage (usage meters, files list).
js/notefiles.js       Importing PDF / Word / PowerPoint files into Notes (the Import button and
                      drag-and-drop), their thumbnails and text, and the AI text summary.
js/viewer.js          The document viewer for files in Notes: pages, zoom, thumbnails, search,
                      download.
js/app.js             Settings → Sync & account, setup links, and BOOT (starts everything).
Apps/lifts.html       The Lifts app itself (its own HTML, CSS and JS). Runs in its own frame.
supabase-storage-setup.sql  SQL to paste into Supabase once: the private hb-files bucket, its
                      policies, and the hb_usage() function behind Settings → Storage.
```

## Where things are saved

- **This browser:** IndexedDB (database "homebase"), through `HBStore` in `js/storage.js`. Only the theme
  (`homebase.theme.v1`, read before the page draws), the sync project address, the sign-in session, the
  Claude API key and a couple of tiny UI settings stay in localStorage.
- **Supabase:** every record in the `hb_docs` table (synced across devices), and files in the private
  `hb-files` bucket, one folder per user.
- Live Server (`127.0.0.1:5500`) and GitHub Pages are different sites to the browser, so each has its own
  local cache. Both fill themselves from Supabase after you sign in.

## Files in Notes (PDF, Word, PowerPoint)

- **Import:** Notes → **Import** (or drop files on the Notes page). Several at once, up to 50 MB each.
  Files go into the open folder, or into a folder named after a course code in the file names
  (e.g. `ECE20002_Lecture7.pdf` → "ECE 20002").
- **Stored as:** a normal note with a `file` part (which file to show, its type, page count, a small
  first-page picture, its text for search) and an empty `annotations` place for page comments later.
  The file itself is in the `hb-files` bucket, through `Files` in `js/files.js`.
- **Viewer:** PDF with PDF.js, Word with docx-preview (loaded from a CDN when first needed).
  PowerPoint can't be shown reliably in a browser: export it as a PDF from PowerPoint and import the PDF
  together with the .pptx (same name), or attach the PDF later from the viewer. Both stay in one note.
- **Deleting:** a deleted file goes to Recently Deleted. Deleting it for good there also removes the file from
  Supabase (if you're offline or signed out, that waits until sync is connected).
- **AI summary:** "✦ Text summary" in the viewer (only shown when AI is on in Settings) makes a new, editable
  note from the document's text.

## Where do I edit…?

| I want to change… | Edit |
|---|---|
| Colors, fonts, light/dark variables | `css/base.css` (the `:root` blocks at the top) |
| How the Notes page or editor looks | `css/notes.css` |
| Notes behavior (editor, folders, toolbar) | `js/notes.js` |
| Importing files into Notes, AI summary of a file | `js/notefiles.js` |
| The file viewer (pages, zoom, search, download) | `js/viewer.js` + `css/viewer.css` |
| To-do page, All items, Recently Deleted, item panel | `js/todo.js` |
| Calendar | `js/calendar.js` (styles in `css/base.css`) |
| Home tiles / widgets / home screens | `js/home.js` + `css/home.css` |
| Clock, weather, mail widgets | `js/ui.js` |
| Item types and categories (built-in list) | `js/core.js` (CONFIG at the top) |
| Settings → Types screen | `js/settings.js` |
| Data saving and Supabase sync | `js/core.js` (Store, Sync) |
| The browser cache (IndexedDB) and script loading | `js/storage.js` |
| Files in Supabase Storage, Settings → Storage | `js/files.js` (styles in `css/settings.css`) |
| Theme rules (auto / light / dark) | `js/core.js` **and** the small snippet in the `<head>` of `index.html` (keep them matching) |
| Importing schedules (PDF / CSV / .ics / screenshots) | `js/import.js` (parsing rules: `js/import-core.js`) |
| Links row and link pop-up | `js/links.js` |
| The Lifts app | `Apps/lifts.html` (its storage bridge: `js/lifts.js`) |
| Daily facts | `js/facts.js` |
| This Week widget (tasks by day, weekly goals) | `js/week.js` + `css/week.css` |
| Reminders (ntfy) | `js/reminders.js` |
| Sync & account settings | `js/app.js` |
| Any page markup, buttons or dialogs | `index.html` |

## Rules for editing (so nothing breaks)

1. **Script order matters.** The order is the list in `HBStore.boot([...])` at the bottom of `index.html`. All the `js/` files share one global scope, like one big script cut into pieces. A file can use anything from files above it right away. Anything from files below it can only be used inside a function that runs later (on a click, or from BOOT). `js/app.js` must stay last.
2. **CSS order matters too.** Later files can override earlier ones, so keep the `<link>` order in `index.html`.
3. **Names are shared.** Two files can't both declare the same top-level name (`const x` in one and `function x` in another). If you add a new top-level name, search all of `js/` first.
4. **New file?** Add `"js/….js",` to the `HBStore.boot([...])` list in `index.html` (or a `<link>` for CSS), in the right spot. The name in the list must match the file's name exactly, capital letters and dashes included.
   Don't add plain `<script src>` tags for these files: they would run before the saved data is loaded.
5. **Replacing a file?** Paste the new contents over the file with the same name. Check the top line of the file afterward: each `js/` file starts with a comment saying what it is (for example `/* Homebase: DOCUMENT VIEWER…` in `js/viewer.js`).
6. After a push, GitHub Pages can serve old copies of some files for about 10 minutes. To make browsers
   fetch fresh copies of the scripts, change the version text in `index.html` (in `js/storage.js?v=…` and
   `HBStore.boot("…", [`) whenever you change files in `js/`. If the phone still looks broken right after a
   push, wait a few minutes and reload.
7. **Saved data:** read and write it with `HBStore.get(key)` / `HBStore.set(key, value)` (or a `DocStore`),
   not `localStorage`, so it lands in IndexedDB.