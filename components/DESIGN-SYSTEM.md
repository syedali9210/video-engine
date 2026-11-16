# Animation Engine design system

The rules every screen, panel and modal follows. The tokens live in `src/engine.css`, the primitives in `src/ui.tsx`, `src/controls.tsx`, `src/shell.tsx`, `src/Gloss.tsx`, `src/Thinking.tsx` and `src/FloatingPanel.tsx`.

> **Round 24 (2026-10-19): the system is Vercel's Geist now.** Neutral greys measured from Geist (`--canvas` #fafafa / #000, `--surface` #fff / #0a0a0a, hairlines at 8–9 %), flat buttons (ink fill, no gradient, no bevel; a white secondary with a hairline), depth by hairline, not shadow (`--in-hi` is gone in light, a whisper in dark). Panels are docked to the window's edges with hairlines, never floating cards. The header is a breadcrumb (mark / product) and text tabs with a sliding underline and a hover highlight that glides between them; places are Overview, Films, Creatives, Components, Lab. Pages open with a title, one or two lines, and one action. Where this file below says otherwise (bevels, floating panels, glossy tiles), round 24 wins.

> **Round 25 (2026-10-19): browse, then edit; one floating island.** Navigation is a glass bar floating at the bottom of the window (`Island` in shell.tsx): the mark, the places as glyph + name (Home, Library, Films, Creatives, Lab), a lit pill that springs to where you are, then find, to review, **New** (its menu opens upward) and you. There is no top bar. Library, Films and Creatives are **galleries** (Galleries.tsx): a 36 px title and one line, the thing to continue, then everything by category, drawn big. Opening one goes **full-screen into its editor**, and the editor's dock (the same glass) starts with "← Films / Creatives / Library" (`DockBack`, through the `Back` context). One control per kind of choice: `Pills` for a few categories, `SideList` for many (the Library), `Choices` (inspector presets) as soft chips in a recessed well with the pick lit, `Segmented` for settings. Places switch without a View Transition (its snapshot of Home cost ~800 ms); pages bring their own rise-in. Where anything below disagrees, this note wins.

## 1. Principles

- **The work is the colour.** Chrome is ink and greys. A hue means something: the selection (azure), a kind of thing (Raylight's per-kind colours), good / warn / bad, or the engine's own art (the signature gradient).
- **The work is the ground; everything else floats on it.** Panels are cards with a gap around them, never edge-to-edge columns with borders.
- **Raised things are lit, typed-into things are recessed.** A raised surface has a 1 px light along its top edge. A field, a slider or a well is sunk with an inner shade.
- **Progressive disclosure.** Show the decision most people make. Fold the rest one step away (sections, "N more", one-line launchers for tool windows). Prose explanations are tips, off until **?**.
- **Every action answers.** Presses give (scale 0.97), hovers veil, selections slide, arrivals rise. Nothing moves that doesn't mean something, and reduced motion stills it all.

## 2. Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#ececef` | `#0a0a0c` | the ground the panels float on |
| `--surface` | `#ffffff` | `#161618` | panels, cards |
| `--surface-2` | `#f2f2f4` | `#212124` | fields, wells, hover |
| `--surface-3` | `#e7e7eb` | `#2c2c30` | pressed, the active segment / place |
| `--overlay` | `#ffffff` | `#1b1b1e` | menus, popovers, modals |
| `--fg` / `--fg-2` / `--fg-3` | ink, 7.7:1, 5.3:1 | `#fafafa`, `#a1a1aa`, `#8b8b94` | text, every pair AA on its surface |
| `--sel` | `#0a84ff` | `#1f95ff` | selection, focus, the playhead |
| `--k-*` | per kind | per kind | scenes, devices, components, pictures, titles, shapes, cursors, callouts, motion, effects |
| `--brand` | `#3d6bff → #8b5cf6 → #ff6fae` | same | the engine's own graphics only (Gloss tiles, art); never a button or a control |

Tints, not paint: a kind colours its glyph and a hairline, and fills at 9–30 % (`color-mix(in srgb, var(--k-…) 9%, transparent)`).

## 3. Depth

| Token | What it is |
|---|---|
| `--in-hi` | the lit top edge of anything raised (inset 0 1px 0, white at 95 % / 6 %) |
| `--in-well` | the recess of anything you type into (inset shade + inset hairline) |
| `--sh-panel` | a floating panel: hairline plus one soft shadow |
| `--sh-md`, `--sh-lg` | menus, modals |
| `--btn-ink`, `--btn-ink-sh` | the primary button: ink (white in dark mode) with a lit top and a soft drop |
| `--btn-2`, `--btn-2-sh` | every other raised button and chip |
| `--scrim` | behind a modal: a dim, plus `blur(10px) saturate(1.15)` |

Classes: `.panel` (16 px radius, `--in-hi` + `--sh-panel`), `.well`, `.btn` + `.btn-ink` / `.btn-2` (a hover veil of its own colour), `.chip` (raised; ink when `aria-pressed`), `.lift` (a card that rises 2 px under the pointer), `.dock` (the bottom toolbar).

## 4. Type

Geist and Geist Mono. One name per job: `micro` 11, `caption` 12, `body` 13, `ui` 14, `heading` 16; page titles 26–28 tight (−0.025em). Section titles are `body` semibold in full ink; labels are `body` in `--fg-3` in a 96 px column. Uppercase only for micro captions, tracked +0.06–0.08em. Numbers that change are tabular.

## 5. Shape and space

Radii: 6 (kbd), 8 (fields, small buttons), 10–12 (buttons, menu items, list rows), 16 (panels, menus), 18–22 (sheets, modals, tool windows), full (chips, pill buttons). Spacing steps 4 · 8 · 12 · 16 · 24 · 32 · 48. Panels sit 8 px from each other and from the window.

## 6. Motion

| Token | Curve | For |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | arrivals, slides, hovers |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | sheets |
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | small pops (a switch's thumb, a toast) |

Durations: 100–160 ms for presses and hovers, 200–260 ms for slides and arrivals, 280 ms for sheets. Named animations: `rise-in` (up 4 px out of a 2 px blur), `pop-in` (toasts), `float-in` (tool windows), `fade-in`, the sliding pills (Segmented, the rail), `.side-sheet`, `.think-*` and `.shimmer` (the AI at work). All stop under `prefers-reduced-motion`.

## 7. Components

- **App bar** (`AppBar`, desktop): the mark (it dances on five clicks) and the product menu on the left; the places as **labelled** tabs with a sliding pill in the middle (Home, Videos, Creatives, Components, Lab with its count); search, To review, theme, help and **+ New** on the right. Navigation lives only here: the left panel below holds the place's own content (layers, the library, the Lab's sections) and never navigation. Never bare-icon navigation.
- **Focus** (Ctrl . or the corners button at the stage's top right) hides both side panels; the button at the stage's top left hides just the left one.
- **Panels**: a `BrandRow` naming the place, a `PanelHead`, content, a `PanelFoot`. Inspector sections fold (`Section`, `fold` for the rare ones) and remember it.
- **Fields**: `field` is filled and recessed. `SliderField` is the field itself (drag anywhere, click the number to type, double-click to reset) after its label. `Row` is a label and its control.
- **Segmented**: an inset well, a raised pill that slides to the pick.
- **Buttons**: primary (`btn-ink`), secondary (`btn-2`), ghost. Pill-shaped (`rounded-full`) for a modal's or a card's main action.
- **Menus** (`Popover` + `MenuItem`): 16 px radius, 18 px icons, a well for a group (the product menu's "Switch product").
- **Modals** (`Dialog` + `DialogHead`): a Gloss tile, a title and one line, the close; a blurred scrim behind.
- **Command palette** (`Palette`, Ctrl K): search, filter chips with icons, grouped results with keys.
- **Side sheet** (`ReviewSheet`): from the right over anything; the newest thing big, the rest down a timeline; tabs along its foot.
- **Tool window** (`FloatingPanel`): a grip and a close, a preview on top, rows, actions along the foot; not modal.
- **Icon tiles** (`Gloss`): what something is (a launch film, a creative, the lab): an outline glyph in its kind's colour on a soft tint of it, a lit top edge and a hairline. Never filled glyphs, never on a button's action.
- **Select** (`ui.tsx`): never the OS list. A field with a caret, a popover listbox with a check on the pick, arrows, Enter, Escape. It takes `<option>` / `<optgroup>` children like the native one.
- **Thinking**: a moving glyph (globe, scan, slide, breathe) and shimmering words, whenever the AI works.
- **Graphics**: the engine's own effects (`EffectPreview`): Home's pixel-dither sky. Real, alive, and in the engine's language, never stock art.

## 7b. Delight (fun.tsx)

Only for rare moments, never for things done all day, and all of it still under reduced motion:
- confetti (the engine's kind colours, shaped as dots, squares, easing curves and tiny phones, with real physics) when an export finishes, a film is kept, or an idea approved;
- places change through a View Transition (a fade and a 6 px rise; the app bar holds still); the theme turns with a circle growing from where you clicked;
- a paper plane crosses Home's sky now and then (catch it); the greeting follows the time of day;
- while films are made, each row's line changes every couple of seconds ("Arguing about kerning…");
- an empty review list is asleep (a moon, z's drifting up);
- secrets: five quick clicks on the mark or the Konami code (↑↑↓↓←→←→BA) throw a party; typing "party" or "barrel roll" in Ctrl K finds two hidden actions.

## 7c. Round 25 pieces

| Piece | Where | What it is |
|---|---|---|
| `Island` | shell.tsx, `.island*` in engine.css | the app's navigation: glass (`--glass`, `--glass-line`, `--glass-hi`, `--glass-sh`), 22 px radius, 44 px items, the lit `--glass-pill` springing on `--ease-island`; under 1080 px the places keep only their glyphs |
| `Page`, `PageTitle`, `PageSection` | shell.tsx | a gallery page: `.page-ground` (a faint blue and violet light from above), max 1280 wide, 36 px title (`text-page`), 15 px line (`text-lead`), 20 px sections (`text-section`) with an icon tile, room at the foot for the island |
| `Pills` | shell.tsx, `.pills` | the category control for a few kinds (and `CategoryChips` everywhere): pills in a well, the picked one raised, a pill sliding to it, counts in grey |
| `SideList` | shell.tsx, `.side-item` | the same choice for a long list (the Library's ten categories): rows with a glyph, name and count, a highlight that slides down to the pick |
| `Card`, `Continue`, `Act` | Galleries.tsx | a gallery card (the work in a 16 px frame that lifts, an open arrow on hover, name and one line); the wide "Continue" card; pill page actions (ink primary, quiet secondary) |
| `DockBack` | shell.tsx | the way out of an editor, first on its dock (also on the Studio's loading state) |
| `Choices`, device slots | studio/Studio.tsx | soft chips in a recessed well, the pick lit and raised: no bordered boxes |

## 7d. States (round 30, States.tsx)

Every place says what's true in each state, in one look: a glyph on a soft tile, a title, one line on why, the next step as a button.
- **Empty** (`Empty`): what will be here, and the one step that starts it ("Bring your product in" → Add your product).
- **Loading** (`Skeleton`): the shape of what's coming, a soft light passing over it. Never a spinner; the AI at work keeps `Thinking`.
- **Problem** (`Problem`, `compact` for a card's foot): `explain()` (trouble.ts) turns any error into its kind (server not running, offline, AI not set up, busy, out of requests, too slow, unknown), a plain title, why, and Try again / Settings. Raw error text in red is gone.

## 8. Icons

Phosphor, regular (outline) weight everywhere: 16–20 px in the chrome, active shown by a background, never by a filled glyph. Bold only for tiny carets. No filled icons anywhere in the app's UI (the Apple logo on a device frame is the device's, not ours).

## 9. Responsive

- Desktop (≥ 1280): the sidebar, the stage, the inspector (both panels 248–284 px, so the stage gets the most).
- 1024–1279: the Videos and Creatives sidebars fold away, with a toggle in the stage's top pill.
- The stage keeps 16 px around the frame and a strip under it for the add-toolbar, so the toolbar never covers the film.
- Upright tablet: the stage full width, a sheet under it.
- Phone: one top bar, a floating dock, one row of tuning, sheets.

Check every change at 390, 768, 1024, 1280, 1440 and 1920, in both themes.
