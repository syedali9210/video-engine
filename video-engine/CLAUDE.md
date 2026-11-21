# Video Engine: making a film

**Films are generated, never hand-written.** A launch film, product video or promo is made by the engine's generator from
a plan, judged against the guardrails, then rendered. Don't write a new `src/animations/<name>/` component for a product
film: hand-written films come out with hard-coded timings, rainbow gradients, made-up UI and animations cut off by the
next scene, which is everything the generator exists to prevent.

## The pipeline

1. **Start the engine:** `npm run dev` (port 5180).
2. **Capture the product as itself.** Never draw a stand-in.
   - A screen, for a `tour` or `app` scene:
     `npm run shoot -- screen <url> .engine-data/films/media/<name>.png [--hide "<a person's name>"] [--click "<button>"]`
     gives `image:/__film/media/<name>.png`.
   - A component, for a `component` scene, built piece by piece:
     `npm run shoot -- component <url> --title "<its heading>" --rows "Label,Label" --ctas "Button" [--click "<what opens it>"]`
     (or `--selector "<css>"`, or `--text "<words in it>"`) gives its `src`.
   - A picture to open on: the image library at `/images.html`. `POST /__images/pick { kit, tone }` ranks them for the
     product.
3. **Write the plan:** `.engine-data/films/plans/<name>.json`, a flow (`src/studio/flow.ts`):
   `{ name, accent: "#rrggbb", tone?: calm|bright|bold, motion?: soft|kinetic|tour|orbit|cta, scenes: [...] }`.
   - **Scene kinds:** `words`, `prompt`, `brand`, `tour`, `component`, `panel`, `app`, `orbit`, `cards`, `stack`, `end`,
     each with a `ground` (`field`, `dark`, `light`, `white` or `image`).
   - `dur` is a minimum. The generator lengthens every scene until its own animation has finished and held, so never
     shorten one to make a length: change the plan.
   - Example: `.engine-data/films/plans/video-engine-launch-v2.json`.
4. **Judge it, then make it:**
   - `npm run film -- <plan.json> --check` judges it only.
   - `npm run film -- <plan.json>` judges, renders and saves it, and prints how long each part took.
   - The MCP's `flow_film` does the same.
   - A plan that breaks a guardrail isn't made; fix what the findings say.

## What the generator does (don't redo it by hand)

- **Motion styles** (`src/studio/styles.ts`), measured from reference films (`npm run measure`): transition windows,
  holds, curves, the cuts each style reaches for.
- **Composition** (`src/studio/compose.ts`): every scene's choreography, the transitions, and when each scene is really
  done (`doneOf`).
- **The camera** (`src/studio/camera.ts`):
  - shots, chosen per scene: angles (three-quarter, low, high, dutch, over the shoulder) and moves (push, pull, truck,
    orbit, crane, roll);
  - zooms through cuts;
  - close-ups on what's pressed.
- **Backdrops** (`src/studio/backdrop.ts`): moving graphics (orbs, ribbons, grid, rings, streaks, dust, contours) under
  scenes of words alone, in the brand's hue.
- **Assembly** (`src/studio/assemble.ts`): a captured component built in front of the camera, piece by piece:
  - the title is typed;
  - words rise in one by one;
  - buttons form, dividers draw;
  - then the button is pressed.
- **Rendering** (`src/animations/film-flow`): grounds and backdrops move against the camera's angle (parallax).

## The guardrails (`src/studio/guardrails.ts`): taste, written down

Every film is judged against these before it's made:

- **complete:** a scene plays all its animation, holds, then leaves.
- **read:** words stay up long enough to read.
- **still:** nothing sits dead still for more than 1 s.
- **camera:** at most 14° tilt, 20° turn and 6° roll; zoom 0.5 to 8; no angle twice in a film.
- **blur:** soft, never smeared.
- **colour:** one hue family, the brand's (gradients included: a field is satin by default, never a rainbow), with
  grain per scene and light.
- **cuts:** never three alike running.
- **product:** its own captured screens and components.
- **type:** readable at 1080p.

Don't loosen a guardrail to pass a film; change the film. (`src/studio/taste.ts` is something else: what the Lab
learns from your verdicts.)
