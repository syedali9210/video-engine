---
name: launch-film
description: Make a launch video, product film, promo or demo video of a product with Video Engine. Use whenever someone asks for a video or film of a product (including Video Engine itself). Films are generated from a plan through the engine's generator and judged against its guardrails, never hand-written as animation components.
---

# Making a launch film

Follow `CLAUDE.md` in this folder (the pipeline section). In short:

1. **Start the engine:** `npm run dev`, which serves on port 5180.
2. **Capture the product as itself:**
   - **Screens:** `npm run shoot -- screen <url> .engine-data/films/media/<name>.png --hide "<any person's name>"`
   - **Components:** `npm run shoot -- component <url> --title "<heading>" --rows "A,B" --ctas "Button" [--click "<opens it>"]`
3. **Write the plan:** `.engine-data/films/plans/<name>.json`, a flow (`src/studio/flow.ts`). It has:
   - the brand's accent;
   - a tone;
   - scenes: `words`, `prompt`, `brand`, `tour`, `component`, `orbit`, `cards` and `end`;
   - durations as minimums.
   Start from `.engine-data/films/plans/video-engine-launch-v2.json`.
4. **Judge it, then make it:**
   - `npm run film -- <plan.json> --check` judges it.
   - `npm run film -- <plan.json>` renders it and reports its timings.
   Fix whatever the guardrails find by changing the plan, never by loosening `src/studio/guardrails.ts`.

**Never:**
- write a new `src/animations/<name>/` component for the film;
- use multi-hue rainbow gradients;
- put grain over the whole film;
- draw fake UI;
- cut a scene shorter than its animation.
