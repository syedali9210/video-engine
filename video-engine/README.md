# Video Engine

Launch films and creatives of your product. A film starts from a template or is directed by the Artist, and is edited
scene by scene with your product live on 3D iPhone, iPad and MacBook mockups, then exported as a video or a still.
Creatives (a hero, a bento, a poster, a post) are made on a canvas, layer by layer.

```bash
npm install
npm run dev      # http://localhost:5180
npm run check    # the engine's self-checks
npm run build    # the site, without the Lab
```

## Places

The sidebar on the left holds **New**, Search (Ctrl K), the Inbox and the places; Ctrl \ folds it to its glyphs.

- **Home**: one composer that finds or starts anything, the ways to start under it, a three-step guide to your first
  film, what's waiting for a verdict, what to pick up again (your film, your canvas, your product), templates and your
  review links.
- **Product**: drop your screens, a recording, the logo and the words once; every film and template takes them.
- **Films**: continue your film, or start from a template by kind (product launch, feature, demo, brand, social, device
  mockup). Opening one goes into the Studio.
- **Creatives**: continue your canvas, or start from a layout. Opening one goes into the Canvas.
- **Shaders**: moving gradients (ShaderGradient's look), gradients on 3D shapes (stacked slabs, glass discs, pills, an
  orb, a ring, bento tiles), logos and words in liquid metal, and React Three Fiber scenes, rendered as videos that
  loop. *Make new ones* builds them by rule from a mood or your brand's colour; open one to tune it live, render it,
  then download it or *Use in film* (it goes full frame at the back of the scene you're on). Rendering needs the dev
  server; the rules, the placement guide for shape gradients and the pipeline are in
  [src/shader/SHADERS.md](src/shader/SHADERS.md).
- **Lab** (on your machine only, see below).

Your product's screen on the devices is a component from the library (`src/animations/`): **Switch** on Films and
Creatives, or the name at the top of the Studio, picks another. Tuning components and building screens from them is
the Components app's job ([../components](../components)).

## The Lab runs on your machine only

The Lab (new films to keep or pass, template ideas, studied films, what it learned, and its Settings, where the Gemini
keys and the Work API live) needs the dev server: its routes run there, and the keys stay in `.env.local`, which is
never committed. `npm run dev` shows it; a build for the web (`npm run build`, what Vercel serves) leaves it out, along
with the AI's status, what's waiting, your kits and your review links on Home. Films, templates, the Studio, the Artist
and the Canvas all work in the browser; exporting a video needs the dev server (headless Chrome and ffmpeg).

## Studio

Open a film (Films → *Continue*, or a template) to make a composition: scenes played one after another, each made of layers, over one background. Layers on the left, the stage and its timeline in the middle, the picked thing's settings on the right.

- **Devices, matched** — up to three devices per scene: a primary in the middle and one either side (pick them in the scene's *Devices*, or drag a device chip onto a place or onto the stage). Each stands at its real size against the primary, the side ones turned in and the smaller ones a step forward, all under one camera, so scale, distance and perspective agree. iPhone 16 Pro, iPhone Duo (folded / half open / open), iPad Pro 11″, MacBook Pro 14″, each in Apple's finishes, each screen live: whatever's open in the engine, any animation from the library, or a picture.
- **Components beside them** — add any animation as a component outside a device. With devices in the scene they move to one side and the component takes the other (*Devices sit* left, middle or right flips the layout). Drag a component, picture or title on the stage to move it; its corner resizes it.
- **Pictures and titles** — drop an image on the page (or *Add → Picture*) and it becomes a layer. Titles come in the launch films' ways:
  - a light **sweeping** across dim words;
  - words **parting** around a device (a `|` marks the split);
  - **typed** with a caret;
  - lines rising out of a **mask**;
  - **word by word**;
  - or rise, fade, blur in.

  Their faces are Text, Display (the brand's, set tight) or Label (spaced caps).
- **Component shots** — a component can be filmed tilted back and settling, on a slow dolly, in an extreme **macro** close-up gliding across one part of it (drawn at that size, so it stays sharp), floating, or orbited.
- **Breakdown** — *Add → Breakdown* takes a screen apart into its components: the header, search, tabs, cards, tab bar and so on. Each is a live plate cut from the running screen, drawn at the size it's seen, so it stays sharp. Four views:
  - **On the table:** the components lift out of the device and are laid out beside it, numbered, each leaving a dashed socket where it was.
  - **In layers:** the device lies tilted and its components float above it. Each layer carries the screen's outline at its height, and all are labelled with leader lines.
  - **Close up:** one component, large, the camera closing in on its key element (its biggest heading or main control).
  - **Assemble:** from the table back into the screen, then the device glides to the middle.

  Components come from the code: `data-component="Name"` on a wrapper names one. Without it, they're found by structure. A title can say `{part}` (the close-up's component) or `{note}` (what's in it).
- **Teardowns** — the iPhone, iPad and MacBook are also modelled in parts:
  - phones and tablets: display, logic board, battery, frame, back glass, camera system;
  - the MacBook: keyboard, trackpad, display, enclosure.

  A scene can take the hardware apart, hold it apart or assemble it, with every part labelled.
- **Callouts** — a label with a leader line to any point, like a technical drawing's.
- **Hairline** — any device screen, component or picture can be redrawn as thin ink lines, live. It's drawn from the page itself:
  - every surface becomes its own outline, filled with the ground so overlapping things hide each other;
  - text stays text, icons keep their strokes, and pictures and canvases become the edges of their brightness.

  Switched on, the page draws in back to front, layer by layer.
- **Scenes** — each has a length, a camera, a move and how its devices arrive (in place, drop in, slide in), plus a transition in: cut, colour flash, dissolve, dip, push, zoom or blur. *+* adds the next shot with the same devices and camera.
  - The camera: an angle (¾ right or left, Front, Side, Tilted, Floating, Flat lay, Low, Back, Macro, Top down, Worm's eye, Profile, Dutch, Lying ¾, Edge macro, Over the top), a lens and a zoom. Drag the stage to turn it, scroll or pinch to zoom.
  - The move: Reveal, Spin in, Hero turn, Pull back, Orbit, Sway, Push in, Rise, Tour, Drift, Flip in, Turntable (a whole turn that loops), Crane, Arc, Dolly zoom, Fall (under gravity, bouncing to rest), Whip (a cut hides in the swing), Roll in, Dive in (into the screen until it fills the frame), or Two framings: a glide from where the shot starts to where it ends, on your own curve.
- **Looks** — *Background → Look* matches the whole film to one colour: the screen's own (read off it), your brand's, or any you pick. Seven harmonies (Tonal, Night, Paper, Pop, Contrast, Blend, Studio) each set the ground and its slowly drifting lights, the light on the devices, each device's real finish, the titles' ink, and with *In a case*, a matte case in the look's colour on every device. Every look's type is checked to read on its ground. A device's own panel has the case too, in any colour.
- **Perspective and turns** — the camera's *Lens* is the perspective (low is a long, flat product-photo lens; high is wide and dramatic), and it turns, tilts and rolls the devices (Alt-drag the stage to tilt and roll). *Turns during the shot* makes the device turn within the clip: a quarter turn, a half turn, a full spin, tilting back, rolling in, or turning and tilting at once. Each is a Two framings move, so the Start and End framings stay editable and its curve sets how it turns.
- **Design | Animate** — a picked title, picture, component, shape or cursor has Raylight's two tabs.
  - **Design** sets where it sits (align, across, down, size), its tilt, opacity, blur and a selection frame.
  - **Animate** sets its **In** (a preset, with when it starts, how long it takes and its curve) and its **Out**. It also holds **animation blocks**: one property each (position, scale, rotation, opacity, blur or tilt) going from one value to another.

  The blocks sit on the timeline's lanes (the lanes button under the timeline). Drag a block to move it, or its edges to stretch it; blocks snap to each other.
- **Shapes and cursors** — rectangles and ellipses filled with a paint stack, and a collaborator's cursor with its name, from the toolbar over the stage. Dragged layers snap to the centre, the thirds and each other (`Alt` drags freely).
- **Words** — *Background → Words* lists every title, label and cursor name in the film, scene by scene, to make a template yours in one place.
- **Templates** — films replicated from reference ads, each its kind of film (Films → *Start from a template*, or *Templates* in the Studio), each a launch film below with your product's name, words and colour:
  - **Product launch:** Horizon launch, Verb drop, Liquid prompt.
  - **Feature launch:** Feature spotlight (1:1), Quad grid.
  - **Product demo:** Macro glide, Site flyover, Prompt to page.
  - **Brand film:** Blueprint, Pop blue.
  - **Social (9:16):** Sketch to screen, Lit desk.
  - **Device mockup:** Hero shot, Device + component, Family (built from what's open).

  Each opens as its own scenes, cut where the film cuts (Feature spotlight: Your app, Introducing, The feature, Four words, The mark, The icon). Played in order they're the whole film, frame for frame; retime, reorder or drop any of them, or put your own scenes between. The timeline drives the film's clock, so scrubbing shows the right moment and each scene plays its slice (*Starts at* in the Film layer moves it). The film's words and screens (*Your words and screens* on a scene) change in every scene of it. A screen takes the film's own drawing, a library animation, a picture or video, or a *Code file…*: a component (.tsx/.jsx/.js, with its CSS) or a page (.html) the importer reads and adds to the library, running live inside the film (and stepped frame by frame in an export).

  The Studio waits for Play: the button on the frame when a film opens, the timeline's, or Space; a click on the frame pauses it. Point at a part of a film (a screen, the logo, a headline, a picture) and it's outlined and named; click it and you edit it on the film: a word gets a field over itself (a list like the typed words edits just the piece clicked; it writes as you pause, Enter keeps, Escape puts back), a screen gets its chooser on it (picture or video, code file, library animation, the film's own), and a picture, video or code file dropped on a screen goes straight in. Every part of a film can be picked, not only its words and screens: a click selects exactly what's under it (a tag, a button, a dot, a picture, a word; inside drawn layers too) with a toolbar on the film: colour, fill, smaller / bigger, turn, hide, another picture (for a picture), put back, the screen it's on (picture, video, code file, library animation, film's own), and ↑ for the part that holds it; drag the part to move it. Editing has an editor's basics: **Undo / Redo** (the buttons by Export, Ctrl Z, Ctrl Shift Z or Ctrl Y; a burst of changes, typing or a drag, is one step, 100 deep), **Copy, Cut, Paste, Duplicate, Delete** for the layer or scene picked (Ctrl C X V D, Del; through the system clipboard, so a scene copies between tabs, and a picture on the clipboard pastes in as a picture layer, or into the screen of the film part picked), and on a part of a film Ctrl C / V copy its style (colour, fill, size, turn) onto another part, Del hides it, the arrows nudge it (Shift: ten). Right-click on the stage for a menu of all of it. Changes are kept as the film's `looks` (CSS by where each element is written in the film's code: a Vite plugin tags every element `data-k="film:line:col"`), drawn over live parts and into baked drawings, so they play and export; copies made by one line (a row of tags) change together. The film says what's at a point itself (`kit.tsx` `pickAt`): its screens and drawings are marked (`Slot pick`, `Baked pick`, `data-pick`), its words are matched to the film's text fields.

  Each card shows a still of its film. *Undo* puts back what you had. The older templates (Typed, Glass and Prompt launch, App film, Keynote reveal, the Raylight scripts, the invented films) are gone; the lab's approved scripts still drive `make_video`'s `template`, but they no longer show as templates.
- **Copy writer** — reads what the component is and shows (its name, description, the text it renders, its buttons, the strings in its code) and writes the film's lines: a hook, feature lines, a split line, a tagline, a call to action. The name is the product's: the brand you set, or `brand` in the component's meta ("Swiggy"). It never invents a number, and a name on the screen isn't a feature. With `ANTHROPIC_API_KEY` set for the dev server it asks Claude (`STUDIO_COPY_MODEL` picks the model); without it, it writes them by rule. Titles show its lines to pick from.
- **Brand** — *Background → Use your design system*: drop its CSS (custom properties, shadcn's HSL, Tailwind v4's `@theme`), a Tailwind config, a theme file, a tokens JSON, a page's HTML or a screenshot. The engine reads:
  - its ground, surface, ink, muted colour, accent and the colour on the accent;
  - its text, display and mono fonts (loaded from Google Fonts when they're there).

  You check and adjust them, with a contrast warning, and the film uses them.
- **Background director** — with *Director* on, each scene's background is chosen from what's in it:
  - a dark room for a reveal or a line-up;
  - paper or the brand's light for a feature;
  - a pale table for components laid out, a dark room for their layers, the brand's light for a close-up;
  - a technical drawing for a hardware teardown;
  - the brand's colour for the end card.

  Neighbouring scenes alternate dark and light, and one ground blends into the next across the cut. Set a scene's background by hand and the director learns it for scenes like that one. Any scene can keep its own.
- **Background** — studio sweeps, colour fields, transparent, or any colour (the eyedropper picks one off the screen in Chrome and Edge; swatches drag onto the stage), plus one effect over it: glow, dots, grid, lines, grain, dither or a drawing sheet (ruled border, zone references, title block), with its amount and colour. Light: Studio, Keynote (a dark room, bright rims) or Soft.
- **Layers** — scenes and their layers front first; the dot marks what's animated, the eye hides a layer, drag (or `Alt ↑↓`) reorders, ⋯ duplicates, moves or deletes; `Delete` removes the picked layer.
- **Title animations.** A title's In can be *Custom*, its own animation piece by piece:
  - what moves on its own: the title, each line, each word or each letter;
  - where each piece starts: lower, to one side, scaled, turned, tipped back, leaning, blurred, faded, spaced out, in a colour;
  - how long each piece takes, the gap between them, the order (first to last, last to first, from the middle, in no order), the curve, and whether each rises from behind its own line;
  - once in: still, a wave, a float or a glint.

  *Title animations* in the Animate tab shows the kit's fourteen (Blur up, Mask lines, Mask letters, Tracking in, Slam, Flip up, Cascade, Slide in, Skew rise, Spotlight, Scatter, Bloom, Wave, Glint) playing, plus every one the lab measured off a film. The canvas plays the same ones.
- **Kit.** The left panel's second tab: pieces to drag onto the stage, or click to add.
  - **Titles** come with their exact animation: the built-in ones, and each title a film's teardown measured, in its face, size, colour and place.
  - **Backgrounds** are a film's grounds and their lights; one sets the scene's background.
  - **Shots** are a film's shots rebuilt in the engine's words; one comes in as the next scene.

  Narrow it to a kind of film (Product launch, Feature launch, Product demo, Teaser, Brand film, Social). Everything dropped is an ordinary layer, edited in the inspector.
- **Templates by kind.** The template gallery is split the same way. Every template says what kind of film it is, and the invented ones follow the kind you pick.

**Export** renders the composition in headless Chrome on the dev server: an image of the picked scene (settled, camera as set; a transparent background gives alpha), or a video of every scene stepped frame by frame so nothing drops (H.264 MP4, or ProRes 4444 with alpha over a transparent background) at 16:9 (1080p or 4K), 4:3, 1:1, 4:5 or 9:16, 30 or 60 fps. Needs Chrome or Edge, and ffmpeg for video (`STUDIO_CHROME` / `STUDIO_FFMPEG` point at them if they aren't found). Pictures are kept by the dev server, so they survive a reload.

**Speed.** A video is split at its hard cuts between up to four Chromes rendering side by side, as many as free memory and cores allow (`STUDIO_WORKERS` sets the number). All of them feed one encoder in film order, and the picture is the one a single renderer makes. Finished exports are deleted from the temp folder after a day.

## Canvas

*Canvas* is the second workspace, beside the Studio (Creatives → *Continue*, or a layout). It designs an interactive piece for a site the way a design tool does: one frame on an endless canvas. What you see is what ships, because the editor draws the frame with the same small runtime a site uses (`public/canvas.js`).
- **Live devices and components.** Drag an iPhone, iPad, MacBook or Duo from *Assets* onto the frame, and pick its screen: a library animation running at the device's own viewport. Library components come in as live pages too. In *Play* you can scroll and tap them.
- **Drawing.**
  - Tools: Rectangle (R), Ellipse (O), Text (T), Pencil (P), Picture, Move (V), Hand (H or Space).
  - Zoom with Ctrl + wheel at the pointer, Shift 1 to fit, Ctrl 0 for 100%.
  - Pink guides snap to the frame and to other layers; Alt skips snapping.
  - Shift keeps proportions and turns in 15° steps; devices keep their shape.
  - Arrows nudge (Shift for ten), Ctrl D duplicates, Ctrl [ and ] reorder, Ctrl Z and Ctrl Shift Z undo and redo.
  - Double-click a text to edit it in place, or a device to change its screen.
- **Interactions, per layer** (the *Interact* tab):
  - comes in as it's first seen: fade, rise, scale or blur, with a delay;
  - under the pointer: lift, grow or tilt;
  - follows the pointer: drift or turn;
  - moves with the scroll, or links somewhere.
- **Motion paths.** Hold a layer for a moment (or take the Path tool, M) and draw where it goes. It follows the line with real physics, worked out step by step rather than eased:
  - **Spring**, **Elastic**, **Glide** and **Float** are springs, from settled to loose;
  - **Slide** coasts to a stop on friction;
  - **Bounce** and **Drop** fall under gravity and bounce on the end, Drop with a squash.

  It plays as it's seen, with the scroll, on a loop, on hover or on click, with how bouncy, how fast and how long after. It can fade in, turn with the path, or come in along it and stop where you placed it. *Play it* replays it in the editor.
- **Background effects.** Animated artwork drawn on the GPU, after dithered posters, halftone prints and LED walls. Fourteen to start: Characters, Lime dither, Halftone flow, Cross-stitch rings, Dot globe, Pink wave, Scanline mosaic, Glow blocks, Dusk clouds, Night clouds, and the moving gradients Aurora, Mesh, Silk and Lava, plus whatever the template lab adds. Set one as the frame's background (*Frame → Background effect*, or *Effect* in the toolbar), or drop one anywhere as a layer. Everything is editable:
  - the pattern: pixels, dots, crosses, characters (your own set), scanlines, soft blocks, or smooth (no cells: a gradient), with cell size, gap, sizing, a two-tone dither and softness;
  - what moves under it: a flow, waves, rings, an orb, clouds (billowing, gathering low, drifting), or a picture of yours, drifting, its colours on the cells and, if you like, the picture itself softly under them (characters over a blurred photo);
  - scale, speed, direction, contrast and how much ink;
  - the colours (a ground and up to three inks, or a see-through ground), glow, grain and a fade into the page.

  One WebGL context draws every effect on a page. Each runs only while it's on screen, and under reduced motion it holds one still.
- **Blur, glow and glass.** Any layer can be blurred, glow in a colour, or sit on frosted glass (blur, tint, corners, how far it reaches): around a title, or behind a device.
- **Real devices.** A device layer is the Studio's own 3D model: Apple's dimensions, real titanium and glass, lit by the Studio's photography set, with the live screen (or its picture) on the glass. It loads as `canvas-3d.js` beside `canvas.js`, the first time a page has a device. Until then, or without WebGL, a drawn device stands in. That one is solid too: the band round the edge is a fan of narrow faces, so a turned corner reads smooth, and one light lights every face as it turns.
  - Turn one with the ball beside it, the way a 3D tool's gizmo works: the red ring tilts it (X), the green ring turns it (Y), the blue ring rolls it (Z), and inside the rings it turns freely. Shift snaps to 15°, and a double-click on a ring straightens that axis.
  - Or use *Front*, *Left*, *Right*, *Lying back*, *Side* and *Back*, the *Tilt · X*, *Turn · Y* and *Roll · Z* sliders, and the *Lens* (long and flat, or wide).
  - Pick one of the device's real finishes, put it in a case of any colour, or turn its shadow off.
  - In *Interact*, a device can turn with the scroll or by itself.
- **Typefaces.** A text can be set in one of the curated Google faces (*Text → Typeface*), and *Create* sets every title in one (*Titles in*). The runtime loads only the faces a canvas uses, and never fakes a bold a face doesn't have.
- **Looks.** *Frame → Look* matches the canvas to a colour: read off its screens, picked, or taken with the eyedropper. Seven harmonies each set the frame's ground and the light behind the main device, the type's colours, each device's finish (or a case) and the background effect's palette.
- **Create.** Whole compositions in one pick, from the product's own screens and components, on a look matched to its colour. Each is shown drawn small on the look you choose, *Another round* varies them, and everything they make stays editable (Undo puts back what you had). Split into kinds:
  - **Hero:** Spotlight, Split, Aurora.
  - **Story:** Mission, a huge serif word behind a card of drifting clouds, a bank of clouds along the foot, and your line lighting up word by word as the page scrolls.
  - **Showcase:** Cascade, Orbit.
  - **Bento:** the frosted one, and Paper bento: white cards on pale grey holding a mood picture with a notice on it, your screen, the phone's corner up close (seen through its card), a number with a folder, and your line. *Smart bento* (paper or glass, `src/canvas/smart.ts`) fills itself: it reads what the product has (screens, components, words, numbers in them, real counts) and gives each cell what suits its shape, the biggest cells the most important things, a folder holding the count of its screens. A new grid each round.
  - **Poster.**
  - **Studio:** work presented the way a design studio shows it, invented anew each round (`src/canvas/arrange.ts`). Ten systems:
    - Plate: one device on a seamless, captioned in a corner under a hairline;
    - Triptych: three screens on one baseline, numbered;
    - Anatomy: the components lifted off the phone on leader lines;
    - Isometric field: screens lying in a rotated grid that runs off the frame;
    - Line-up: receding into depth, softer as they go;
    - Pair: two overlapping, turned against each other;
    - Specimen: components in an indexed grid;
    - Editorial: a serif headline the phone breaks through;
    - Fan: three screens pivoting from one point;
    - Satellites: components on a golden spiral.

    Each round draws new variables (side, turn, count, depth, corners), and each one lays out for portrait and square frames too.
  - **Your references:** every page or creative the lab studied, rebuilt from its measured layers. Its pictures are cut from the reference until you swap them, and its body copy becomes your own line.
- **Titles.** A Serif face beside Text, Display and Label. Any title can take one of the Studio's title animations, playing when it's seen or with the scroll (a line that lights up word by word as you read it).
- **Seen through a card.** A layer can be clipped to another layer's box and corners (`clip`): a phone's corner in a bento card, a photo in a window.
- **Graphics.** *Assets → Graphics* makes a soft light, an organic blob, a ring, a frosted glass card or a moving gradient, in the look you put on last. Moving gradients (Aurora, Mesh, Silk, Lava) are effects with no cells at all: the field itself, smooth.
- **Components fit themselves.** A component dropped on the frame measures what it paints and takes that size, so it comes without empty space round it. A page-filling one (an app's search bar or tab bar) is cut down to just the part that paints. One added by a click finds a free place instead of landing on the last one; one placed by a composition shrinks to fit its card.
- **A phone layout.** Under 744 px wide the canvas takes its phone layout. The *Phone* view makes one automatically (the layers stacked in reading order, titles at a size a phone reads), and you can move and size things there without touching the desktop one. A canvas exported without one gets the automatic one.
- **On every device.** See it embedded in a page on a Mac, an iPad, an iPhone and a Duo at once.
- **Export.** The JSON (a few KB, every layer, layout and interaction) plus one script, as HTML, React or the JSON itself. *Open a JSON…* brings one back to edit.

```html
<div data-engine-canvas="/hero.json"></div>
<script type="module" src="https://<where the engine is deployed>/canvas.js"></script>
```

Or from code: `import { mount } from "https://<engine>/canvas.js"`, then `mount(element, doc)`, which returns `{ update, destroy }`. `effect(element, settings)` from the same script draws one background effect on its own. A device's screen can also be a picture of a product's own screen, travelling inside the JSON. The MCP server makes those from a running app.

### The film on a site

*Studio → Export → For a site* makes the Studio's film a page that plays by itself (`play.html`), for a portfolio or a site.
- **Responsive by itself.** The embed is the film's frame plus one script, `embed.js`. The script gives the frame the shape you pick for each width: a laptop from 1024 px (16:9 by default), a tablet or an open Duo from 744 px (4:3), a phone or a folded Duo below (4:5). It keeps that shape as the page resizes, and the film reflows to it. Without the script, the frame keeps the laptop's shape.
- **How it plays.** *By itself* loops, and rests while it's off screen. *With the scroll* scrubs the film as it crosses the screen, start to end.
- **The pointer.** The device leans toward the pointer on a spring, as far as you set. A click or Space pauses, if you want it to. With reduced motion it holds one still.
- **The code.** Copy it, open the player, or save the film's JSON to host yourself (`play.html?src=` its address). The film rides packed in the link, so nothing needs hosting but the engine: deploy it (`npm run build`) and set *Plays from* to its address.
- Pictures you dropped stay on your machine and aren't in the web film.

### Many embeds on one page

Both scripts are made for pages with many: a portfolio of films, a landing page of canvases.
- **Films** (`embed.js`):
  - each embed's link waits in `data-src` until the film comes within 600 px of the screen;
  - the nearest loads first, two at a time;
  - at most four stay loaded, and the farthest off screen is let go and loaded again on the way back, so memory stays flat however many there are;
  - films off screen rest, and the engine's address is preconnected once.

  On a page of eight films, only the first loads at the top, and no more than four are ever loaded at once.
- **Canvases** (`canvas.js`):
  - one watcher covers every canvas, and each JSON is read and drawn only as it comes near;
  - live screens load three at a time, the nearest first;
  - pointer and scroll effects run only while a canvas is on screen, and reduced motion stills them;
  - canvases a single-page app adds later are picked up by themselves.
- Keep pictures light: a phone screen travels in the JSON as WebP, about 30 KB at 2×.

## The Artist

*Studio → Artist* (or the top of *Templates*) directs a whole launch film for what's open, the way a studio would (`src/studio/artist.ts`):
- **The brief:** the kind of film (product launch, feature launch, product demo, teaser, brand film, social), how long (short, standard, long), the shape (16:9, 9:16, 1:1, 4:5), the product's colour, and an art direction or your taste's pick.
- **Six art directions:** Keynote, Gradient pop, Editorial, Neon, Soft glass, Mono bold. Each is a harmony of the product's colour, a gradient world for each part of the story, a type system (face, weight, how each role's titles arrive), a card style, a tempo, effects, and the carriers its cuts lean on.
- **A story from set pieces:**
  - the hook slammed in, or words cut on the beat;
  - the name revealed in a gradient fill;
  - the device arriving between parting words;
  - the feature beside the live interface, a cursor finding the thing and clicking;
  - three cards, words beside the device, the screen taken apart, every screen fanned together, a montage, a breath;
  - the proof, and the end card with its button, or the call typed out.
- **Timed to a beat** (92 to 128 bpm): every shot is a whole number of beats, titles land on beats, every cut is carried. Titles are stacked by measured height and checked to read on their gradient.
- **Three takes**, drawn as storyboards and scored by the critic. Use one and it opens in the Studio: every scene, title, gradient and cut stays editable (Undo puts back what you had). *Mockups* makes six stills on the same art direction (hero, from above, close on the top, from below, edge on, over the top) to export as pictures.
- **It learns.** The take you use, the ones you pass over, your thumbs, and every video you export teach the taste (`taste.ts`), and the Artist ranks its art directions by it while still exploring.
- **It reads the product** (`content.ts`): its screens, components, features, numbers in its words ("2,000 teams") and real counts ("12 screens"). A piece with nothing to say is left out (no three cards for one feature, no collage for one screen), and *Counted* shows the real counts on the beat.
- **Words and type:** every line the film says is editable before the takes are made, and its titles and words can be set in a curated Google face (`faces.ts`: Geist, Inter Tight, Manrope, Space Grotesk, Sora, Syne, Unbounded, Outfit, Instrument Serif, Fraunces, Playfair Display, DM Serif Display). The export loads the same faces.
- **Your direction:** make your own art direction, from one of the six or *From your pictures* (a moodboard, references, your brand's posts: it reads light or dark, how vivid, how far the hues reach and the accent). Tune its colour, harmony, a gradient for each part of the story, energy, faces, title entrances, cards, corners and tempo, with the film previewed as you go. Saved directions sit beside the six (`.engine-data/lab/directions.json`).

**Your verdict** (*Export*, under *Export video*): say why you'd keep a film or what's not there yet, with tags (Hook, Story, Pacing, Cuts, Type…) and your words. Kept films weigh most in the taste; what could be better becomes rules for the next films (*Learning* lists them).

**A video on a device's screen** (*Device → Screen fit*): *Fill* crops it to the screen, *Whole* shows all of it, *Auto-turn* turns a landscape film to fill a portrait phone (or the other way round), and *Picture turned* turns it by hand. It applies to every scene showing that picture.

**Gradients** (`src/studio/gradients.ts`, *Background → Gradients*): ten moving worlds made from one colour:
- the worlds: Mesh, Aurora, Spotlight, Swirl, Horizon, Duotone, Prism, Glow, Dusk, Noir;
- a harmony;
- Energy (how vivid), Drift (how fast it moves, still at 0) and Hue spread;
- *Another arrangement*.

Each world is an ordinary paint stack, edited layer by layer under it, for the whole film or one scene. Titles take gradient fills from the same palette.

**New scenes** offers the Artist's set pieces too (words on the beat, the feature in the interface, three cards, a breath, the end card), on the film's own colour, beside the shots made from the film's own.

**From Claude:** the MCP's `make_video` is directed by the Artist unless a template is named. It takes `kind` (or reads it from `brief`), `style` and `length`. A captured app's screenshots go where a live screen would.

## Launch films

The *Launch films* category holds whole films, each a deterministic timeline: every frame is a function of one clock, so an export renders it exactly. Each one is cut shot by shot from a real launch ad, with the product's live screens running inside it and the words as params. The copy writer fills the words; edit them in the inspector.

Each is replicated from a reference in `Desktop/video` (its style guide and shot list are in `Desktop/video/studio/<film>/`):
- **Feature spotlight** (9.5 s, 1:1): an app window, a click on +, a tab growing into “Introducing…”, the feature huge among its tags, words typed over the app, the mark becoming an icon.
- **Horizon launch** (23.6 s): deep space, a planet's lit horizon, the name in light, glass panels turned in the dark, pills, a comet in orbits, an aurora end card.
- **Macro glide** (15.4 s): an editor laid flat in the dark, a glide over its timeline, macro shots in shallow focus, the play button glowing and pressed.
- **Blueprint** (31 s): a diagram on light grey, a post beside each rule in a line-drawn room, numbers counting on sliding rails, the mark in orbit.
- **Verb drop** (11.8 s): six verbs each wearing what it does, a line taken apart into an app icon, the app turning in, its pen tool drawing a leaf.
- **Site flyover** (19.3 s): a website laid down and flown over in shallow focus, cards lifting off it, the whole page at once, the closing headline flat.
- **Liquid prompt** (14 s): metaballs gathering into the mark, a chat face, the ideas, a prompt typed, the glowing send, thinking.
- **Prompt to page** (14 s): a 2×2 mosaic, each quarter cutting through the same story on its own clock.
- **Quad grid** (10.5 s): four little ads looping at once.
- **Pop blue** (11.3 s): one loud blue, digits rolling into an amount, pills, clouds, cards counting, the wordmark.
- **Sketch to screen** (17.4 s, 9:16): a hand-drawn wireframe beside the screen it became.
- **Lit desk** (29.1 s, 9:16): a phone filming a laptop in the dark, the screen lighting the keys.
- **provider-guard Launch** (46 s): a film for one real product, built from its own UI code (the Studio's stylesheet and markup) and the numbers published in vercel/ai#20932.
- **Animation Engine Launch** (57 s): the engine's own film, made of the engine.
  - The hook: the usual way to make a launch video as a pile of windows (record, crop, mock up, keyframe, export, again).
  - It all collapses into a dot that draws the mark: an easing curve, which then wipes between acts.
  - Your animations live in the real device frames.
  - The Studio's own three.js phone, over the top and then turning.
  - The Kit's title animations.
  - The templates and the canvas, as real screenshots.
  - One sentence to Claude through the MCP.
  - The lab learning your taste.
  - The end card is the command that connects it.

  Pages it frames (HTML or WebGL animations that fill their own window) step with the export's clock too.

To make one: pick the film in Studio → *Templates*. It fills the frame at 16:9 and its scene runs for the film's length. *Export → Video* renders it. The films share `src/animations/_film/` (the clock, the stage, the easing, typed text, a cursor, live screens, phones, confetti). A new film is a new folder that draws `render(t)` with that kit.

## Template lab

The lab's templates are **scripts** (none ship in the repo now; approved ones are kept in `.engine-data/lab`). Each is a film shot by shot: every shot says why it's there, and the film says what makes it work and what it must never do. A script compiles into a composition (*Studio → Templates*). The rules every script follows are in `src/studio/lab/guidelines.md`. `lintScript` checks the ones a machine can.

The **template lab** improves them. Open it from the flask at the bottom of the library, or from ⋯ on a phone.
- **Every night** (00:00 by default, or when the engine next starts if the machine was off), it asks Google's Gemini to improve the script the checker likes least, and to propose new ones by the guidelines.
- **Every proposal is checked:** it must be a script the engine can compile, or it never reaches you.
- **The Inbox shows each proposal:** what changed and why, the rule it follows, what the checker says, its shots against the version it replaces, and *Preview in the Studio*.
- **You decide, and say why.** *Approve* asks what works and adds it to the gallery; *Reject* asks why not. The next run reads the reasons.
- **New films** (*Lab → Review*): the Artist makes four films for the product that's open, each a different kind of film and art direction (the ones your taste leans to first). Each plays as it will render (the web player, the export's own renderer). *Keep it* or *Pass*, and either way say why: tap what works and what doesn't (Hook, Story, Pacing, Cuts, Type…) or write it; there's no verdict without a reason. A kept film joins the gallery. Kept films weigh most in the taste, a pass's words become rules, and the next batch is directed by both. The section says what it's leaning to so far.
- **When Gemini has trouble, the lab says so plainly and keeps what it can.**
  - Gemini thinks before it writes, and the thinking counts against what it may write, so each reply gets the model's whole allowance (65,536 tokens on Gemini).
  - A reply cut off part way still yields the proposals it finished, with a note on the run.
  - A busy model (503), a dropped connection or a one-minute rate limit is tried again, three times in all.
  - A model whose day of free requests is used up is named, with when they're back. The nightly run skips it until then, and Settings suggests another model (each has its own allowance).
  - *Runs* explains every failure in words.
- **New proposals are announced.** A notice says so when the engine opens. Allow notifications in the lab's Settings to hear about them while it's in the background.
- **On demand:** *Films* improves any script, or the film in the Studio, with *Fix by rules* (no AI) or *Improve with AI*.
- **References**, split by area (Films, Canvas, Creatives, Effects) and, inside each, by kind (a product launch, a feature launch, a demo…; a hero, a story; a bento, a poster; a photo effect, a pattern…). Drop a video or a picture, or paste a YouTube film. Gemini tears it down:
  - **A film:** every shot and cut; every title with its animation measured (what moves, from where, how fast, in what order, on what curve); its backgrounds, its hook and its pacing; and the whole film rebuilt as a script. The rebuild waits in the Inbox as a template of its kind, and its titles, backgrounds and shots go to the Studio's kit.
  - **A page or a creative:** its layers, boxes, type and colours. It becomes a layout in the canvas's Create.
  - **An effect:** its cells, colours and what shows under them. The effect waits in the Inbox, drawn over your picture.

  A file keeps its name until Gemini names it, and the kind you filed it under stays. When the chosen model's day of free requests is used up, or it's busy, a study moves on to the next model.
- **Write a template** of one kind: the compile step. Gemini gets everything studied of that kind first (structures, hooks, pacing, shots, measured title animations), then the rest, and writes a new film of that kind, citing what it took. It waits in the Inbox.
- **It studies launch films by itself.** Before proposing, it searches the web (Google Search, through Gemini) for product launch films on YouTube and watches each one's first two minutes. Each night's proposals are measured against what it has studied, next to what our films already do. Every address is checked with YouTube before it's watched.
- **New films start from invented ones.** Each night's new templates start from films the engine invented that night, made the AI's own with what the studied films do. They use the whole vocabulary: every angle and move, and a look (guidelines §14). Rearranging old shots isn't a new film.
- **Canvas effects too.** It proposes new background effects for the canvas by `src/canvas/effects.md`, and `lintEffect` checks each one. *Effects* shows every effect running, proposes one from a note, or improves one. A proposal waits in the Inbox with a live preview, and once approved it joins the canvas's effects.

- **Every cut has a carrier** (`src/studio/cuts.ts`, guidelines §5). The planner reads how each shot's camera moves at its ends, from the same poses the renderer draws, and gives every cut what carries it:
  - the move running on across a hard cut (the next glide turned round, or started where the last one stopped, so it never reverses or jumps);
  - a **whip** (a horizontal swing with directional motion blur, the way the camera was going);
  - a **push through** the frame;
  - an **iris** opening out of the subject;
  - a **light wipe** carrying a new colour across.

  Never a dip to a flat colour. Invented films, *Fix by rules* and New scenes all use it. The checker names every abrupt cut, and *Critic* lists them cut by cut.
- **Ideas.** Films before they have shots: a hook, a spine and a signature (the one visual idea, with the carrier its cuts lean on). They come by rules (weighted by your taste), from Gemini, or after a film the lab studied. Each is developed into a film on the spot and read by **the critic**: hook, clarity, flow, craft, pacing (against the films studied), variety, novelty (against the gallery) and your taste, each with its reason, the weakest with what to do. Preview one, send it to the Inbox, or keep it. *Critic* reads any film: the one in the Studio, a template, an invented one.
- **Replicate.** A launch film rebuilt as a template, measured. Find one (search, the lab's verified list, a link, a video file, or a film it has studied). It's watched twice: first its cuts and what each shot shows, then every shot's exact camera values (angle, zoom, turn, height, roll, where it glides and on what curve), transition, ground, focus and titles. A file's cut points are measured by ffmpeg. The replica is built from those numbers by `src/studio/replica.ts` (not written by the model), keeps the film's cut points, and puts your product's words and screens where its own were. It's scored part by part and shot by shot against the film. One request for a film the lab has watched, two for a new one.
- **Study** shows each studied film analysed: its shots as a strip in time with its acts, its pace, its cuts as the engine's transitions, the camera words its shots use. *Ideas from this film* and *Replicate it* sit beside it.
- **Learning.** What your decisions taught: every approval and rejection weighs its film's features (cuts, angles, moves, pace, look, kind) against how often you approve in general. A rejection's reason becomes a rule every new proposal is checked against. The generators read it: the shapes and carriers you keep come up more. It also reads the inventor's own shapes with the critic, the weakest first (one click improves its weakest film), and re-reads the gallery the same way.

**Setup**
1. Create a key in Google AI Studio (aistudio.google.com/apikey → *Get API key*).
2. Paste it in the lab's Settings. It's written to `.env.local`, which git ignores, and never reaches the page.
3. Pick a model (`gemini-3.8-flash` by default; `gemini-3.5-flash-lite` is lighter), then *Test the key*.

**New scenes.** In the Studio, the lightbulb by the shot strip proposes shots that continue the film from the scene you pick. Each one is made from the film's own shots: their framings, ground, look, device, pace and easing, by the rules in `guidelines.md` §12. The ideas include:
- the camera going on from where it stopped;
- a part of the interface the film hasn't been close to;
- the wide reveal, if the film hasn't earned it yet;
- one more screen or feature;
- the end card, if there isn't one.

Each says why and which rule. They come by the rules (no AI), or *Ask Gemini* for more, held to the same rules and checked the same way. Adding one moves on to it, so the film grows a shot at a time (and Undo takes it back).

Or put `GEMINI_API_KEY=…` in `.env.local` at the project's root yourself. A night is a handful of requests: a search, one to three films watched at a low resolution (a few thousand tokens each), then the proposals (about 40k tokens), inside the free tier (AI Studio shows your limits). Searching the web has a quota of its own, and a free key may have none. Without it, the lab studies the next film on its own list, `src/studio/lab/films.json`: official launch films, each checked with YouTube, and you can add more. When you ask for films about something, it asks the model's memory instead, keeping only addresses that exist on YouTube and whose real titles match, and it says what it found. A pasted film is always watched. The lab keeps its proposals, films and effects in `.engine-data/lab/`. `GEMINI_BASE_URL` points it at another OpenAI-compatible endpoint. Watching and searching call Gemini's native API at the same address, without its `/openai`.

## The film maker

A product's launch film from one of the film templates, made by rule with the fewest AI calls (Product → *The film
maker*, the `/__film/*` routes in `server/maker.ts`, the MCP's `make_film` and `edit_film`).

1. **The brief, once per product** (one call, then kept): what it is, who it's for, the pain it ends, how people do it
   today, the change it makes, its features each with what it lets you do, real proof only, the tone, the call, the
   address, and where each was read from. You can correct it; the next films read yours.
2. **The pick** (code, no tokens): every film template has a **story contract** (`src/studio/contracts.ts`): its idea,
   the story it tells, the products it suits and doesn't, its tone and pace, what it needs (features, a real number,
   the site), each shot's job, and what every line *means* (the pain, the old way, the promise, feature 2's verb, the
   call…) with how to write it. The picker scores the templates against the brief and says why.
3. **The lines, one call**: every line of the chosen template, each with its meaning and limits; a second call only
   for lines that didn't fit. The name and the address are filled from the brief by code.
4. **The checks** (code): each line fits; nothing is still the reference film's words; no figure, price or address the
   brief doesn't have; none of the reference film's brand; no hype words, none the brand bans.
5. **Render** by the Studio itself (a draft at half size and 30 fps, or the final), **the critic** (stills of the
   draft read against the brief; lines it flags rewritten), **a note in plain words** to change it (“make the hook
   punchier”, “use the glide template”, “9:16”), and *Keep* / *Pass*, which the picker learns from.

**The template wears the product.** A template is the reference film's choreography; everything it shows is the
product's:

- **Colours and type.** At build, every colour a film's code names becomes a variable (`vite.config.ts`
  `filmTones`), and `src/animations/_film/tone.ts` maps the template's palette onto the product's brand (read off
  its site: *Read the site* in the kit). Its ground becomes the product's ground, its ink the product's ink, and the
  greys in between land in between. Cards lifted off the ground become the product's surface, and the accent's family
  turns to the product's accent; a black-and-white brand takes its ink as the accent. The contract says how far:
  `theme: "product"`, or `"accent"` for a template whose look is the point (deep space, a night studio). In the
  panel: *Colours and type*.
- **Its screens, by the story.** The shot that opens on the app gets the product's home screen. Each later screen
  gets the screen of the feature it carries (the brief's features in order, matched to the kit's files by name and by
  what the reader says each shows), not just whatever has the right shape.
- **No reference product left.** Every panel a template drew of its reference product's interface takes the
  product's own screen when there is one: Horizon's send, import and ledger panels, Mosaic's made page and mark,
  Pop's four cards, Verbs' window, Spotlight's editor and the faces under its words, the Sketch reel's app. Each
  contract also lists the reference's names (`refs`: its product, its models, the brands in its interface). A line
  still holding one fails the checks, and a line that held the reference's name gets room for this product's.
- **A score cut to it** (`server/music.ts`, synthesized, nothing licensed). There are four moods (calm, bright,
  driving, dark), chosen from the contract's pace and tone. The tempo is picked so the template's cuts land on its
  beats, the band plays as much as each shot's energy asks, and each cut gets a hit, a whoosh or a riser. The last shot
  rings out on a bar at the film's end. It's made once per film shape (about 2 s) and kept in `.engine-data/music`.
  In the panel: *Music*.
- **Versions.** Every edit is a new version; *Go back* restores an earlier one (its template, size and lines) as a
  new version, at no cost.
- **Longer films from several templates** (`POST /__film/sequence { kit, parts: [{ template, shots?, screens? }],
  length? }`). Each part keeps the shots you name, and its lines are written in parallel (only the lines those shots
  show). All parts share one theme (the product's, ground and all) and one score. Screens carry on from part to part
  (or are named, as a director casts them), the seams dissolve, and the last shot holds to the length. A sequence
  can't be edited yet: change its parts and make it again (the parts' lines come back from the cache).
  Cast screens that fill the camera's path: Glide's macro crosses the screen's middle and bottom, so a screen with an
  empty canvas there films as a white blur.

**Directed films** (*Direct a film*, `POST /__film/direct`, the MCP's `direct_film`). These start from a story, not a
template (`src/studio/screenplay.ts`):

1. **The spine, one call.** The writer gets the brief and what can carry each beat: the line alone, the liquid mark,
   each of the product's screens and recordings as the reader saw them, and the shape metaphors. It returns four acts:
   - the hook: the pain, in the audience's words
   - the turn: the product arriving as its mark
   - the show: three or four moments of the product working, each an action and what you get, on the screen or
     recording that shows it
   - the payoff: the promise again, then the mark and the call

   Code holds it to the rules: lines of at most 7 words, each screen used once, the mark exactly twice, the length.
2. **One world.** A shader field in the brand's colours runs under every shot. Exports seek every video to the film's
   clock, so it flows through the cuts. The liquid mark is cut from the logo's own lines and screen-blended over the
   world. Shapes stand for ideas (a fanning stack: every format). Screens go on 3D devices, and recordings go on cards,
   placed so they start on the action when their shot starts. The art direction (the Artist's) sets the type, the
   entrances, the tempo every beat is cut on, and the cuts between acts. A score is cut to it.
3. **The scorecard** (`POST /__film/review`, or `review: true`). Stills of every shot are scored 1–5 on story,
   product, look, words and carriers. While a score is under 4, the critic's notes go into the next story call (two
   rounds at most), and the best film is kept.
4. **Recordings of the product** come from the kit's tours (`POST /__kit/tour`): the running app driven through a flow
   with real clicks and a drawn cursor, filmed at 2×.
5. **Features built from their panels.** Give the director the product's codebase (`project`, or code files dropped in
   the kit) and it reads the panels in it (`src/studio/panels.ts`): a heading with its properties (label and value),
   its lines and its buttons, in its components and pages. A proof whose words match a panel (its title most, then
   its component's name, then the rest) is carried by that panel, whatever carried it before, and gets 7 s. It's said
   in type, then a hard cut to the panel built in front of the viewer (*Feature unfold*, `src/animations/film-unfold`).
   With the kit's address (`url`, the app while it runs), it's the product's own component: the panel is frozen from the
   running app in headless Chrome (`public/panel-capture.js`, `POST /__film/panel-capture { url, panel }`), found by
   its title, its labels and its buttons. Every element's look is inlined, its `::before`/`::after` made real, and its
   pictures, fonts and SVG sprites carried as data. Its title, rows and buttons are marked to be built one by one. The
   script also runs pasted in a browser's console (`await __capturePanel({ title, rows, ctas })`), and
   `POST /__film/panel-snapshot { html }` keeps what it returns. Without an address, the panel is drawn from its words.
   - a blob lands (with the icon that leads the title, if it has one)
   - it stretches into a pill that hugs the title as it's typed, the camera riding along with its edge
   - a beat's hold, then it drops open: the properties arrive as the bottom edge passes them, the camera following it
     down
   - the buttons form at the bottom the way the title did (a blob stretching into each), the main one is pressed
   - the camera pulls back to the whole panel

   The camera looks at it from a held angle (`angle`, 16° by default) and follows the container's moving edge with a
   little lag, leaning a few degrees more the way it moves, so it feels carried rather than keyed. The depth of field
   is soft (`blur`): what's far from where the camera looks goes a little out of focus, and the frame's top and bottom
   edges soften. It's never a blur over the whole frame. Under it, a composed field (below) with this scene's own
   grain. A drawn panel's value that the code only works out as it runs is a soft bar, never made up.
   `GET /__film/panels?kit=&project=` lists what it found.

**motionmaxxing** (Tejas Makwana's skill, Apache-2.0, vendored whole in `public/motionmaxxing` with its LICENSE and
NOTICE, its bundled GSAP 3.12.5 under GreenSock's own license; only `docs/media` left out). The director follows its
rules, measured on 53 frame-accurate professional films:
- every beat buys one belief, in four roles (hook, turn, proof, cta)
- proofs are a claim in type, then a hard cut to the product performing it, big, with nothing over it
- cuts are hard and on motion, and almost nothing fades
- the mark crashes in from oversize
- the end card is the name alone, at most a quarter of the film, holding at most 1.4 s
- no page chrome, no slogans

Its runtime plays inside the renderer: a motion.js film (`window.__seek`) is a library animation with
`public/motionmaxxing-driver.js`, which seeks it every frame from the page's clock. So the export's stepped clock
renders it frame for frame; *Motion runtime demo* is its own demo film.

**The generator** (`server/generate.ts`, `GET /__film/assets`, `POST /__film/asset { kit, kind, id? }`) makes, for the
product's brand:
- the world: a shader field in colour, never grey, with no grain of its own. Its hue is the brand's accent; a
  black-and-white brand takes the most colourful colour in its logo, then its screens, then one picked from its name
  (the same every time). A directed film no longer sits on it: see *composed fields* below.
- the mark: the logo's own lines, picked out of its tile, in liquid metal
- six shapes that each stand for one idea: formats (fanning slabs), layers (glass discs), outputs (tiles), steps
  (pills), core (an orb), loop (a ring)

The director is offered all of them, and only the ones a beat uses are rendered (about a minute each the first time,
then kept).

**Flow films** (`flow: true` on `POST /__film/direct` and the MCP's `direct_film`, or a flow written by hand with no
product kit: `POST /__film/flow { flow, mood? }`, then `POST /__film/render { id }`; captured panels, screenshots and
logos in `.engine-data/films/media` are served at `/__film/media/<name>`). A launch film with no cuts, the way
the reference films move: every scene becomes the next through a shape they share. Three parts, nothing about any one
scene baked into the drawing:
1. **The plan** (`src/studio/flow.ts`): which scenes the story needs, from what the product has.
   - its hooks as lines
   - the prompt, when it takes a request (the story writes `prompt`)
   - the mark
   - each proof as the product: its panel from the code, its screen or recording
   - cards, when there are results to show
   - the call

   Each scene gets at least what the measured pace needs, its transitions included (half a window each side).
2. **The generator** (`src/studio/compose.ts`): the plan composed into a **motion graph** (`src/studio/graph.ts`),
   every element a set of keyframes under one camera. Each scene kind has a builder with variants:
   - words: thrown in huge and pulled back from, wiped on, or risen
   - prompt: a box opening between two words, or in the middle
   - mark: out of a dot and an iris of white, or risen
   - app: opened from its icon, or flown in
   - panel (the unfold), cards morphing, a stack rising, the call round a glass pill
   - tour: the product's screen, the camera snapping close onto parts of it and a cursor pressing
   - orbit: the integrations arriving out of a glow to circle the mark, then spinning up into the cut
   - cards from a grey placeholder (the call to action's way)

   Each cut takes a transition from a library:
   - **morph:** the shape one scene ends on IS the shape the next starts from, one element going on (prompt box →
     dot → name pill → the panel's blob; app window → card → card → stack → glass pill)
   - **iris:** a disc of the next ground opening
   - **push:** the camera going through
   - **blur:** one thing becoming another in place, the new words coming up from below
   - **slide:** the camera moving on
   - **snap:** a cut: the next framing at once, the next scene landing on a fast ease-out
   - **dot:** the line's full stop swelling into a disc that fills the frame with the next ground
   - **wipe:** a disc of the next ground from the corner
   - **sweep:** a glow crossing the frame, one view becoming the next under it

   The rules pick them from what two scenes can hand each other, the film's **motion style**, the product's tone (from
   the art direction: calm, bright, bold) and a seed from its name. Any choice can be made by hand: `choices: { tone, seed, variants: [...],
   transitions: [...] }`. Every transition has a window centred on the cut. What leaves holds until the window is under
   way, and in crossings it leaves while the next arrives, over the same stretch, so there's never a gap or an early
   end.
3. **The renderer** (`src/animations/film-flow`): draws any graph.
   - **Curves:** every number follows a monotone cubic through its keys, so speed carries through a key and a move
     stops only where it holds, never overshooting.
   - **Camera:** one path over the whole film, followed with a little lag. While a panel is built it follows the
     panel's growing edge, at an angle.
   - **Motion blur and focus:** elements blur a little with their own speed, and the frame's edges soften where the
     graph asks for depth.
   - **Panels:** the unfold's body (`PanelBody` in `film-unfold/view.tsx`) is one element, so the mark's pill can
     morph straight into the blob the panel is built from.

`npm run check` holds it to that:
- every morph hands on exactly (same place, size and colour)
- no crossing has a gap
- nothing ends before its transition window
- a hand-made choice is kept

Cards can be the product's own: give them by their words (`cards: [{ lines }]`) and, with the kit's address, each is
frozen from the running app (`POST /__film/card-capture { url, text }`, `__captureCard` in
`public/panel-capture.js`).

**Measuring a reference** (`npm run measure -- <video> [--name <profile>]`, `src/studio/pace.ts`). motiscope's method
(github.com/KumarSashank/motiscope, MIT) on macOS's own AVFoundation (`scripts/motion/measure.swift`), or on ffmpeg
elsewhere:
- a per-frame motion-energy curve, localized to the busiest tenth of the frame
- moves and holds split at a threshold anchored to the 75th percentile
- each move's easing fitted from the integral of its speed
- hard cuts as whole-frame spikes
- each stretch's ground named from its colour

It writes `.engine-data/profiles/<name>.json`, and `pace: "<name>"` cuts a flow film to it. The built-in
`soft-morph` is the reference's own:
- moves of ~1.4 s easing out, holds of ~0.4 s, morphs of ~0.64 s
- prompts typed at ~75 letters a second, lines wiped on at ~40
- no cuts

For its curated keyframes too, install motiscope (`~/.motiscope/install.sh`, with ffmpeg) and run
`motiscope ingest <video>`.

**Motion styles** (`src/studio/styles.ts`, `motion: "<id>"` on a flow film or `direct_film`). How a film moves, measured
from reference films one at a time (a grid of four was cut into its quadrants and each measured on its own, frame
doubling undone). Each style sets the transition window, the hold, the curves for entering, leaving, morphing and
the camera, the camera's lag, how words arrive, and the cuts it reaches for first:

| Style | From | Window | Hold | Cuts first | Words |
|---|---|---|---|---|---|
| `soft` | the soft morph reference | 0.96 s | 0.4 s | morph, blur | wiped on |
| `kinetic` | kinetic type | 0.45 s | 0.3 s | snap, morph | swapped in place |
| `tour` | a product UI tour | 0.5 s | 0.5 s | snap, sweep | — |
| `orbit` | a logo orbit | 0.6 s | 0.8 s | iris, dot | rotated in |
| `cta` | a call-to-action card | 0.3 s | 1.0 s | dot, wipe | word by word |

With none asked for, the tone picks: bold is kinetic, bright is a tour when the product has screens (else cta), calm
is soft. `styleFromProfile` turns any `npm run measure` profile into a style. Every scene lasts until its own
choreography is done, plus the style's hold, plus the lead-in of the transition after it (`fit` in `compose.ts`
lengthens scenes until that's true), so no scene leaves before it's finished.

**The camera generator** (`src/studio/camera.ts`). Four parts, each from the motion style, laid over the framing
each scene asks for:
- **shots:** each still scene is seen from an angle and moved through.
  - Angles: front, three-quarter, low, high, dutch, over the shoulder, close, wide.
  - Moves: push, pull, truck, orbit, crane, roll, drift.
  - The shot is chosen by the scene's kind, the style (a style of cuts takes the bolder angles) and a seed.
  - **No angle twice in a film:** every scene is seen from an angle of its own. That includes the product scenes' own
    cameras (a tour, a component being built, a panel), which take theirs from the same library (`angleFor`). The
    judge refuses a repeat.
- **in a scene:** a punch (a quick zoom, settling back) on a beat
- **between scenes:** through the cut (closing in and coming out into the next), or a snap to the next framing
- **on an interaction:** a little before something is typed into or pressed, the camera goes close on it (never past
  filling most of the frame), holds while it happens, then goes back

The grounds move against the camera with depth: its turn and tilt shift them, its roll turns them, its zoom scales them,
each by less than the world (they're further away), so an angle reads in a gradient too.

**Satin** (`satinField` in `src/studio/field.ts`, drawn by `src/animations/_film/satin.tsx`). A `field` ground's
default finish is the material of the reference picture, a satin weave, drawn as a WebGL fragment shader (a pure
function of the clock):
- the composed field's colours and places;
- broad slow folds, lit by a light that wanders, throwing a long soft sheen;
- fine diagonal threads, each a little uneven, showing most where the light catches them.

It moves against the camera like every ground. `finish: "matte"` keeps the plain composed field. Every colour stays in
the brand's hue family: no role turns more than half the guardrail's 40° from it, and the judge checks each gradient.

**Backdrops** (`src/studio/backdrop.ts`, drawn by `src/animations/_film/backdrop.tsx`). A scene of words alone stands on
moving graphics, so it's never a still:
- **The kinds:** orbs, ribbons, a grid receding to a horizon, rings opening from behind the words, streaks, dust, or
  contour lines.
- **The choice:** by what the product's words say it is, then the motion style's tempo; never the kind the film has
  already used.
- **Colours:** in the brand's hue (light and chroma spread, the hue barely turning).
- **Behaviour:** quiet behind the words, lifted as each word lands, moving against the camera with depth.

**Assembly** (`src/studio/assemble.ts`, drawn by `src/animations/_film/assembly.tsx`; a `component` scene). A
component of the product's own, built in front of the camera one piece at a time. Every piece lands exactly where it is
in the product.
- **Capture:** `public/panel-capture.js` marks the component's parts (surfaces, dividers, words, icons, pictures,
  buttons, controls) with their boxes and nesting, and wraps each word.
- **Order:** row by row from the top, left to right.
- **How each kind arrives:**
  - the title is typed with a caret;
  - other words rise word by word out of a little blur;
  - buttons form from a dot;
  - dividers draw;
  - surfaces open down;
  - icons pop.
- **The outline:** grows from a pill to the full component as rows arrive.
- **The camera:** follows each row at an angle, pulls back to the whole, and the button is pressed.
- **Accuracy:** only opacity, transform, clip and blur are touched, over each part's captured look, so when it's done
  it's the product's component to the pixel.

**The guardrails** (`src/studio/guardrails.ts`): taste, written down as numbers the generator builds inside. `judge`
reads every film against them before it's made:
- **complete:** every scene plays all of its own animation, holds, then leaves. `doneOf` finds when a scene is really
  done: the scene is built again 30 s longer, and every key that doesn't move with its end is choreography.
- **read:** words are up long enough to read.
- **still:** nothing sits dead still for over a second.
- **camera:** angles and zoom in bounds.
- **blur:** capped.
- **colour:** one hue family, the brand's.
- **cuts:** never three alike running.
- **product:** its own captured screens and components.
- **type:** readable.

`review(flow)` in `compose.ts` composes and judges it. `POST /__film/flow` refuses a film that breaks one (422, with
the findings).

**The pipeline from the command line:**
- `npm run shoot -- screen <url> <out.png> [--hide "name"] [--click "button"]` takes a 2× screenshot for a tour.
- `npm run shoot -- component <url> --title "…" --rows "…" --ctas "…" [--click "…"]` freezes a component with its
  parts, for a `component` scene.
- `npm run film -- <plan.json> [--check] [--draft]` judges, makes, renders and saves a film, and prints how long each
  part took.
- The MCP's `flow_film` does the same.
- `CLAUDE.md` and the `launch-film` skill (`.claude/skills`) point every session at this pipeline.

**The image library** (`/images.html`, `server/images.ts`, `src/studio/images.ts`). Upload pictures for films to open
on. Each is read once with ffmpeg for its vibe: its palette, hue, how light, vivid, warm and busy, and whether it looks
like sky, greenery, texture or something minimal. A directed flow film picks the one that suits the product: nearest
its brand's hue, as light or deep as its brand, as vivid as its tone, and near what its own words say it is. It avoids
the pictures used most. `POST /__images/pick { kit, tone }` shows the ranking and why.

**Composed fields** (`src/studio/field.ts`, drawn by `src/animations/_film/field.tsx`, the *Composed field* film).
A directed film sits on a gradient laid out the way a designer lays one out, not scattered blobs. It's one hue family,
the brand's, across a wide range of light, each colour with a job and a place:
- a saturated mass filling one side
- a lighter glow where it thins out
- a near-white highlight opposite the mass
- a soft streak a step round the wheel
- a pale tint haze low in the frame
- a deep corner that gives it depth

The compositions are a diagonal, its mirror, a horizon and a spotlight. The hook and the call are on the diagonal, the
mark in the spotlight, and the proofs on the horizon and the mirror in turn, so the film changes as it goes without
leaving its family. Each shot's field starts its clock where the shot sits in the film, so it drifts on through the
cuts. It's drawn live, so nothing is rendered for it. Titles take the field's ink, and grain is a scene's own: on the
words, a little on the mark, none under the product.

**Meaning:** every shot keeps what it's for (`scene.meaning`: its role, the belief it buys, its words, what carries
it, what it shows). A directed film writes it from its spine. A template film takes its shot's role and its job from
the template's contract.

**The cross-checker** (`src/studio/crosscheck.ts`, and `POST /__film/review`) runs two passes:
1. **Code, free:** motionmaxxing's gates on the composition. These are the end card (G3), page chrome and addresses in
   the close (G5), a title over the product (deck layout), the product too small to read (G1), fades between beats,
   slogan copy, pinned objects, and shots that buy nothing.
2. **A look:** one still a shot, each checked against what it's meant to show, and the film scored.

Failed gates and shots off their meaning become the director's notes, and with `review: true` it directs again (two
rounds at most).

**Quick look:** *Quick look* (`POST /__film/render { stills: true }`) renders two frames a second at a quarter size.
That's every shot of a 30 s film in under a minute, where a draft takes about two. The kit reader now reads eight
pictures a call instead of one, and a cut-off AI reply is asked again with more room and never cached.

Every step is logged with its time and tokens (`.engine-data/films/runs.jsonl`, and on each film). Measured on the
engine's own kit: the brief 1.4k tokens, a film's lines 1.0–1.7k (answers are cached: the same request again costs
nothing), the critic about 6.6k (optional), reading the kit's 9 pictures 11.6k once; a film's words in about a
minute, an 8.3 s draft in about 70 s, its 2048² 60 fps final in about 150 s. A template without a contract gets one drafted
(`POST /__film/contract`); a draft never overrides a shipped or approved one.

The Work API (the AI the film work runs on): when the model picked in Settings can't take a request (one that only
answers Google's Interactions API, or has no eyes) or is busy or out of its day's requests, it asks the provider's
other models in turn (`server/work.ts`), and every answer reports its tokens.

## Claude (MCP server)

`mcp/server.mjs` lets Claude (Claude Code, Claude Desktop, any MCP client) make a film or a canvas of a codebase in one call. Claude gives the request and waits. The engine does the work and answers with where the file is, so no tokens go on the making.

```bash
claude mcp add animation-engine -- node "C:/Users/you/Desktop/Animation engine mobile/mcp/server.mjs"
```

For Claude Desktop, add `"animation-engine": { "command": "node", "args": ["…/mcp/server.mjs"] }` under `mcpServers` in its config. Then ask: *"Make an intro video for this codebase. The app runs at http://localhost:3000."*

| Tool | What it does |
| --- | --- |
| `make_video` | Reads the project, captures the running app (`url`, optional `paths`), builds the film (the Artist directs it from `brief` and `kind`, or a lab script named in `template`), renders it and saves the MP4. Options: `size` (9x16 for Reels), `fps`, `features`, `cta`, `out`. |
| `make_interactive` | The same reading and capture, then a canvas: the name, its line, and the app's screen in an iPhone that turns to the pointer. Saves the JSON and returns a preview link and the two lines to embed it. |
| `make_shader_video` | A looping shader video: `kind` (gradient, shape, liquid, scene) and a `preset`, or a new one made by the rules from `mood` or `brand`; `colors`, `text` or `logo` (liquid), `size`, `fps`, `seconds`, `transparent` (ProRes with alpha), `out`. |
| `list_shader_presets` | The shader presets by kind. |
| `make_film` | A film from a film template for a product (`project` and `url`, or a product `kit`): the brief, the pick (`template`: `auto` or an id), every line written and checked, rendered (`draft` for a quick look, `critic` to review a draft first) and saved, with its cost. |
| `edit_film` | Changes a `make_film` film from a `note` in plain words, and renders it again. |
| `job_status` | Follows a render started with `wait: false` and saves it when it's done. |
| `list_templates` · `engine_status` | The film templates (with the lab's approved versions); whether the engine and Chrome are ready. |

How a call runs:
1. The engine's dev server starts if it isn't running.
2. The project is read: README and `package.json` for the name, the line and up to three features; the theme CSS, Tailwind config or `index.html` for the brand, read by the Studio's design-system reader.
3. The app is captured at iPhone size in headless Chrome, the page below the status bar and the strip painted in its own colour, the way Safari shows it.
4. The film is built in the engine through `window.__engine`, rendered on the dev server, followed with progress, and saved in the project's `engine-exports/` folder (or `out`).

A 15-second film takes about a minute and a half on a laptop. `ENGINE_URL` points the server at another engine; `STUDIO_CHROME` at a browser.
