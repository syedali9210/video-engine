# Video Engine design system

How every screen, panel and dialog is built. Tokens live in [`src/design/tokens.css`](src/design/tokens.css); the
component classes in [`src/engine.css`](src/engine.css); the React primitives in `src/ui.tsx`, `src/shell.tsx`,
`src/States.tsx`, `src/Thinking.tsx` and `src/RenderCard.tsx`. Earlier design rounds are in git history.

## 1. Principles

- **The work is the loudest thing.** Chrome is ink and greys. A colour always means something: what's picked (blue),
  a kind of thing in a film (its kind colour), good / warning / problem, or the engine's own art (the brand gradient).
- **Regions are tones, not boxes.** The ground, a panel and the stage are three greys side by side. A hairline only
  where tone can't separate (a white poster on a white page). No outlined containers, no recessed wells, no bevels.
- **Choices are words, not buttons.** A choice of a few is a row of words with the picked one in ink and a short
  underline that glides to it. Many choices go in a dropdown or a grid of the same words. Navigation (where you are)
  is a soft fill behind the row.
- **One ink button per view.** The thing to do next (Export, Make 4 films, Open in the Studio). Everything else is a
  quiet fill or a bare word.
- **Show the thing itself.** A template is its poster, a layout its sketch, a way to start a picture of what it
  makes. Words under the picture: a name and one line.
- **Every wait speaks, every problem helps.** Long work shows the engine's voice (a ring, a verb, a quip or a tip);
  an error says what happened in plain words and the step that helps.
- **Motion answers, never decorates, and stops when asked.** Presses give, hovers lift, marks glide. Under
  `prefers-reduced-motion` every duration token is 0 and every animation has a still twin.

## 2. Tokens

Three tiers. Components use only the semantic and component tiers, so a theme is a different set of primitives.

### 2.1 Primitives

| Group | Tokens | Notes |
|---|---|---|
| Gray | `--gray-1` … `--gray-12` | One meaning per step in both themes: 1 ground · 2 panel · 3 subtle fill · 4 hover · 5 selected · 6–8 lines (alpha) · 9 solid mark · 10 tertiary text · 11 secondary text · 12 primary text. Light is warm paper; dark is soft charcoal, never pure black. |
| Blue | `--blue-9`, `--blue-11`, `--blue-a3` | Selection, focus, the playhead. |
| Brand | `--brand-1/2/3` | Blue → violet → pink. The mark, the making ring, the Artist, posters. Never a control. |
| Status | `--green-9/11`, `--amber-9/11`, `--red-9/11` | Always with a word or a shape. |
| Space | `--space-0` … `--space-16` | A 4 px grid (0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Tailwind's spacing scale is the same grid. |
| Radius | `--radius-xs` 4 · `sm` 6 · `md` 8 · `lg` 12 · `xl` 16 · `2xl` 20 · `full` | Small things tight, big things soft. |
| Type | `--font-ui` (Geist), `--font-code` (Geist Mono), `--font-display` (Instrument Serif), weights, tracking | The serif is for one word in a hero title, nothing else. |
| Motion | `--dur-0` … `--dur-4` (0, 120, 200, 320, 500 ms), `--ease-out`, `--ease-in-out`, `--ease-spring`, `--ease-drawer` | |
| Elevation | `--shadow-1` … `--shadow-4` | Only floating things cast a shadow: menus (3), dialogs (4), the dock (3). |
| Layers | `--z-sticky` 10 · `panel` 30 · `dock` 40 · `popover` 60 · `tooltip` 70 · `toast` 80 · `card` 85 | |

### 2.2 Semantic

| Role | Token | Tailwind | Use |
|---|---|---|---|
| Ground | `--bg-app` | `bg-app` | The window: sidebar, rails, editor bars. |
| Panel | `--bg-panel` | `bg-panel` | Side panels, the page sheet, the timeline. |
| Stage | `--bg-stage` | `bg-stage` | Where the work sits in an editor. |
| Subtle | `--bg-subtle` | `bg-subtle` | Fields, a quiet group, a secondary button. |
| Hover / selected | `--bg-hover`, `--bg-selected` | `bg-hover`, `bg-selected` | Rows and tiles under the pointer / picked. |
| Raised | `--bg-raised` | `bg-raised` | Menus, popovers, dialogs, the dock. |
| Inverse | `--bg-inverse`, `--text-inverse` | `bg-inverse` | The one primary button, a toast. |
| Text | `--text-1`, `--text-2`, `--text-3`, `--text-disabled` | `text-fg`, `text-fg-2`, `text-fg-3` | Every pair is AA (4.5:1) on the surfaces it sits on. |
| Lines | `--border-1`, `--border-2`, `--border-3` | `border-line`, `border-line-strong` | Hairline, divider, strong (dashed drop zones). |
| Meaning | `--selection(-text, -soft)`, `--focus`, `--success`, `--warning`, `--danger` (+ `-text`) | `bg-selection`, `text-sel-ink`, `text-good`… | |

The names the app grew up with (`--canvas`, `--surface`, `--surface-2`, `--fg-2`, `--line`, `--sel`…) are aliases of
these at the foot of `tokens.css`; new code uses the semantic names.

### 2.3 Component

`--control-h-sm` 28 · `--control-h` 32 · `--control-h-lg` 40 · `--control-radius` · `--card-radius` ·
`--sidebar-w` 240 (`--sidebar-w-folded` 64) · `--rail-w` 52 · `--panel-w` 248 · `--inspector-w` 288 · `--bar-h` 48 ·
`--option-mark-h` 2.

## 3. Layout

- **Pages** (Home, Product, Films, Creatives, Lab): the sidebar on the ground, the page on one rounded sheet beside it
  (`.app-frame`, `.app-sheet`). A page opens with a title, one line and at most one primary action; then the work.
- **Editors** (Studio, Canvas): full-screen. A full-width bar on the ground (`.editor-bar`): the way back (`BarBack`),
  the panel toggle and what's open on the left; undo, history, focus, Check and **Export** on the right. Under it,
  three tones side by side: the panel (rail + drawer), the stage, the inspector. No rules between them.
- **Sidebar** (`Sidebar`): mark, **New**, Search (Ctrl K), Inbox, the places with a glide behind the current one,
  Recent, you. Ctrl \ folds it to glyphs (each names itself on hover); it folds by itself under 1280 px and in the Lab.
- **Rail** (`.rail`, `.rail-item`): one glyph per drawer down a panel's edge (Layers, Kit / Assets), plus shortcuts
  (Templates, the Artist). The open drawer's name is the panel's big title (`.panel-title`).

Check every change at 390, 768, 1024, 1280, 1440 and 1920, in both themes.

## 4. Components

| Component | Where | Rules |
|---|---|---|
| Button | `ui.tsx` `Button` | `primary` (ink, one per view) · `secondary` (subtle fill) · `ghost` (bare). 8 px radius, 28/32/40 high. |
| IconButton | `ui.tsx` | Bare; hover fill; pressed = selected fill. Always a tooltip with its name (and shortcut). |
| Options | `ui.tsx` `Segmented` | Words in a row, the pick in ink with a gliding 2 px underline. Up to ~5 short options. Icon options can hide their words. |
| Choices | `studio/Studio.tsx` `Choices` | A grid of the same words for presets (angles, moves, transitions); the pick underlined; "N more" in blue. |
| Categories | `shell.tsx` `Pills` / `CategoryChips` | The same words-and-underline at page size, with counts; a long row fades at its end. |
| Tiles | `ring()` in Studio | Picked = selected fill, the rest bare. Empty slots are dashed. |
| Nav list | `.nav-item`, `SideList`, the Lab's rooms | A soft fill behind the current row. |
| Section | `Section` (Studio, Motion) | A quiet 12.5 px title, folds, remembered; sections spaced, a hairline between. |
| Field | `controls.tsx` `field` | Subtle fill, no outline, focus ring. |
| Card | `Galleries.tsx` `Card` | The picture (frameless, 16 px radius, a hairline inside), name, one line. Lifts 3 px, the picture eases in. |
| Start card | `Home.tsx` `Start` | A card whose picture is what the action makes; a drop zone is dashed. |
| Menu / popover | `ui.tsx` `Popover`, `MenuItem` | Raised, shadow 3. `side="right"` opens beside a sidebar trigger. |
| Dialog | `ui.tsx` `Dialog` | Raised, shadow 4, a dim and blur behind. |
| Toast | `.toast` | An ink pill with a glyph, bottom centre, 2.6 s. |
| Floating panel | `.panel` | Raised, shadow 3: tool windows, notices, sheets. |

## 5. States

| State | Component | What it shows |
|---|---|---|
| Empty | `Empty` | A glyph in a soft ring (it floats a little), a title that says what will be here, one line, the step that starts it. |
| Loading a place | `Loading`, `Skeleton` | The engine's voice for a place, or the shape of what's coming with a light passing over. Never a bare spinner. |
| Making / exporting | `Making`, `RenderCard` | A ring that fills (brand gradient; spinning while unknown), a verb that changes every couple of seconds, and a quip, a short maxim or a **Tip**. Exports also show frame N of M and about how long is left, fold into a pill, and survive moving around the app. |
| Done | `RenderCard` | A tick that draws itself, the file's checks, the next step (thumbnails, a review link). |
| Problem | `Problem` (`trouble.ts` `explain`) | What happened in plain words (server down, offline, renderer missing, AI not set up, busy, out of requests, too slow), why, Try again / Settings. Never raw red text. |

The verbs and lines live in `src/quips.ts`, shuffled per session.

## 6. Motion

| What | How |
|---|---|
| Press | scale 0.97, `--dur-1` |
| Hover | a fill or a 1–3 px lift; icons nudge (scale 1.08–1.1, a few degrees) |
| Marks (option underline, nav glide, category line) | `useFlip`: placed at once, then played from where they were by transform, 240 ms |
| Arrivals | `rise-in` (6 px, 200 ms), `pop-in` for toasts, `card-in` for the render card |
| The mark | its ghosts fall back along the arc on hover; it runs the arc when it dances |
| Reduced motion | `--dur-*` → 0; every keyframe has a still twin; marks don't glide; words still change, slower |

## 7. The mark

A dot moving along an ease-out arc with two onion-skin ghosts of where it was (`Logo`, `LiveLogo`): motion, frame by
frame. Ink on whatever it sits on; on a tile (ink square, white dots) it's the app icon and the favicon. The wordmark
is "Video Engine" in Geist semibold, tracking −0.025em.

## 8. Icons

Phosphor, regular weight, 16–19 px in the chrome. Active is shown by a fill or ink, never by a filled glyph.

## 9. Voice

Plain, warm, short. Name things for what's in them ("Your work", "Add your product"). One line under a title, not a
paragraph. Waits are allowed to be a little silly; errors never are.

## 10. Do / don't

- Do separate regions by tone. Don't outline a container.
- Do use words with an underline for a choice. Don't build a row of pill buttons.
- Do show the thing itself. Don't describe it in a paragraph inside a box.
- Do keep one ink button per view. Don't make two things look like the primary.
- Do add a token when a value repeats. Don't hard-code a colour in a component.
