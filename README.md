# Goya

An infinite canvas for brainstorming and mind-mapping — the spatial freedom of FigJam/Miro with the keyboard-first interaction model of Notion and Gamma.

The core idea: **you never leave the canvas to find a tool.** Press `/` anywhere and a command menu appears at your cursor. Filter as you type, hit Enter, and the element lands right where you were pointing — already in edit mode.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5183.

## Interactions

| Action | How |
| --- | --- |
| Boards | Top-left switcher — create, rename, switch, delete boards (each autosaves separately) |
| Back up / restore | Boards panel → Export file (`.goya.json`) and Import file |
| Frame an area | `/frame` — drag it by its title tab (contents move with it), export it as PNG or PDF from its toolbar |
| Text size | Select text or a heading — pick a preset size from the dropdown |
| Bold / align / font color | In the same toolbar: B, left/center/right, and a 🎨 row (incl. black) |
| Resize | Drag any edge or the corner handle; hold Shift for a perfect square/circle (shapes) or locked aspect ratio (everything else) |
| Z-order | Bring to front / send to back from the selection toolbar |
| Curve a connector | Drag the line itself; it snaps back to straight near zero |
| Move a connector label | Drag the label anywhere along the curve |
| Add anything | Press `/` — filter, arrow keys, Enter |
| Quick text | Double-click empty canvas (Esc on an empty text removes it) |
| Edit an element | Double-click it (or select + Enter) — works on stickies and shapes too |
| Branch a mind-map | Drag from a note's edge port to empty canvas — spawns a connected sticky |
| Connect two elements | Drag from one element's port onto another — the ports you drag from and drop near pin the attachment sides (top-to-top works even for side-by-side elements) |
| Reattach a connector | Select it, then drag either endpoint handle onto a different element (or a different side of the same one) |
| Label a connector | Double-click the arrow, or use the label button in its toolbar |
| Connector line style | Select the arrow — solid / dashed / dotted in its toolbar |
| Shape fill & outline | Select a shape — Fill and Line swatch rows (both support "none", so outlined shapes can enclose things) |
| Move | Drag; marquee-select on empty canvas for groups |
| Copy / cut / paste | `⌘C` / `⌘X` / `⌘V` (pastes at the cursor; connectors between copied elements come along) |
| Paste or drop an image file | `⌘V` with an image on the clipboard, or drag a file onto the canvas |
| Recolor / duplicate / delete | Floating toolbar above the selection |
| Pan | Scroll / trackpad, or hold Space and drag |
| Zoom | Pinch or `⌘`+scroll (cursor-anchored), controls bottom-left |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Duplicate | `⌘D` |

## Slash menu contents

- **Basics** — Sticky note, Text, Heading 1–4
- **Media** — Icon (searchable, 1,500+ Lucide icons), Emoji (full searchable emoji picker), Image from web (keyless search via Openverse with Wikimedia Commons fallback; openly licensed results), Upload image (downscaled client-side so autosave stays within localStorage limits)
- **Shapes** — Rectangle, Ellipse, Frame

## Architecture

Vite + React + TypeScript, no state library.

- `src/App.tsx` — canvas orchestration: pan/zoom viewport, pointer gestures (drag, resize, marquee, connect/reconnect), keyboard shortcuts, clipboard
- `src/state.ts` — multi-board store with snapshot undo/redo, localStorage autosave, and doc-format migrations
- `src/geometry.ts` — connector routing (side-pinned or nearest-anchor bezier curves)
- `src/exporting.ts` — frame → PNG/PDF (html-to-image `toSvg` + manual rasterization; `toPng`'s `img.decode()` stalls on foreignObject SVGs in Chromium) and board file export/import
- `src/components/` — element renderers, connector layer, slash menu, icon/emoji/image pickers, selection + connector toolbars, boards panel
- `src/imageSearch.ts` — web image search (Openverse → Wikimedia fallback)

Boards autosave to localStorage (one key per board plus an index); the board file format is versioned JSON (`.goya.json`).
