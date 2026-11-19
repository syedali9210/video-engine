# Shaders: gradients, shapes, liquid logos and 3D scenes, as videos

Moving gradients ([ShaderGradient](https://github.com/ruucm/shadergradient)'s look), gradients laid on 3D forms,
logos filled with liquid metal ([liquid-logo](https://github.com/collidingScopes/liquid-logo)) and React Three Fiber
scenes, each rendered to a video that loops. Both sources are MIT; their looks were rebuilt here for frame-exact video
(no wall clock, every frame a function of its time), not copied as packages.

## How it works

```
spec (plain JSON)  →  shader.html (R3F, one clock)  →  headless Chrome, frame(t) per frame  →  ffmpeg  →  .mp4 / .mov
                         ↑ the editor's live preview is this same page, so what you tune is what renders
```

- **One page, three uses.** `shader.html` previews (the editor's iframe), draws the gallery's stills (one hidden copy,
  one still at a time), and is what the export opens with `?render`. Every frame is `f(t)`: the scenes read
  `clock.t` / `clock.phase`, never the wall clock.
- **Every video loops.** Time walks a circle through the fourth dimension of the noise (`loopNoise` in `glsl.ts`), and
  everything else moves in sines over the loop or whole turns, so the last frame runs into the first. `Loop` sets the
  lap (3–20 s), `Laps` how many times round in the file.
- **The export** (`server/shaders.ts`): `POST /__shader/jobs` → headless Chrome on the GPU (the Studio's DevTools
  client) → JPEG q95 frames → x264 `-preset slow -crf 14`, `-tune grain` when there's grain, `aq-mode=3` (bits go to
  dark flat areas, where gradients band), BT.709 limited range, tagged. A clear ground exports ProRes 4444 with alpha
  (PNG frames). *Smoother* renders at twice the size and scales down with lanczos.
- **Cache.** A render is kept in `.engine-data/shaders/` by what it's made of (spec, size, fps, laps, and a hash of
  `src/shader/*`): asking again is instant; changing the shader code makes new ones.
- **Ways in:** the **Shaders** place (island → Shaders), the MCP tool `make_shader_video`, or plain HTTP:

```bash
curl -X POST localhost:5180/__shader/make -H "content-type: application/json" -d "{\"kind\":\"gradient\",\"mood\":\"warm\",\"width\":1920,\"height\":1080,\"fps\":60}"
```

## Gradients: the rules the generator follows

"Make new ones" never picks colours at random. It builds a palette by rule (`palette()` in `spec.ts`), checks it, and
puts it in a framing that works.

1. **One dominant hue.** Neighbours sit within ~80° in OKLCH (mono, analogous, pastel, night), or a complementary hue
   is used only as colour 3, which lands on the folds' peaks as a highlight (pop).
2. **Never muddy.** The shader mixes colours 1 and 2 in sRGB; a pair whose middle loses more than 45% of the ends'
   chroma (it goes grey) is thrown away.
3. **Not flat, not harsh.** The three colours' lightness spreads 0.1 to 0.8 (pastels may be flatter).
4. **Framings that work**, ShaderGradient's own, with the ranges their numbers looked good in: water filling the
   frame (density 1.05–1.8, depth 1.6–3.4, camera 92–118° from above), water seen at a slant, the halo plane across
   the frame, a sphere seen close through a long lens (zoom 9–16).
5. **Slow.** Speed 0.1–0.45: the colour drifts, it doesn't churn.
6. **Grain on most** (0.05–0.10): it's the look of the references and it breaks up 8-bit banding.
7. **Grain fields** (the five cards Syed sent: orange, ultramarine, butter, rust, lagoon): one hue, a deep and a lit
   side, density 0.7–0.8 and depth 1.4–1.6 so the field is soft (higher folds go pointy), grain 0.08–0.11.

*From your brand* takes the brand colour's hue: a pale brand makes pastels, a deep one a night, a vivid one its own
hue (mono or analogous).

## Shape gradients: where, at what angle, how dense, how it moves

The ramp is placed in each piece's own space, so it turns with the piece. Pick these four things.

**Where it runs** (`axis`)

| Runs | What it does | Use it for |
|---|---|---|
| Across (`across`) | over every piece at `angle`, like light falling on it | stacked slabs, tiles, orbs: the default |
| Through the stack (`stack`) | each piece one step of the ramp, darkest at the bottom | pills, fanned slabs: the stack reads as a scale |
| From the middle (`radial`) | rings out from each piece's centre | discs and tops seen from above |
| At the rims (`facing`) | by how a face turns from the camera | glass, chrome, anything see-through |
| Round it (`around`) | round the piece like a clock hand | rings, orbs turning |

**The rest**

- **Angle** (across only): 30–55° for stacks (a diagonal reads as light from the upper left; 0° or 90° looks printed
  on), ~70° for tiles.
- **Density**: 1 on almost everything (the ramp once over the piece). 1.2–1.4 on a single big form (orb, ring). Over 1
  on a stack reads as noise.
- **Faces**: *All* by default. *Top* when the sides should be one solid colour (a plinth): the base is then the
  ramp's darkest × 0.8. The sides are always drawn a step (28%) darker so the top reads.
- **Ramp order**: darkest first, lightest last, so `stack` and `across` read as light falling on the form.
- **Marbling** (`flow`): 0.2–0.45 on stacks (alive, still banded), 0.55–0.8 on tiles and orbs.
- **Ground**: deep under vivid (a near-black of the ramp's darkest hue), paper under deep. Glass needs a dark ground
  and a light under it (`under`: the ramp's hue + ~160°, a warm glow under cool glass); solids get a soft contact
  shadow by themselves.

**Recipes** (each is a preset, and what `makeShape` picks from)

| Form | Runs | Angle | Density | Faces | Material | Motion | Camera |
|---|---|---|---|---|---|---|---|
| Stacked slabs (the green stack) | across | 30–55° | 1 | all | solid | twist, stack or turn | 24–34° up, ~10 away |
| Fanned slabs | through the stack | – | 1 | top or all | solid | fan | 30–40° up, ~10 |
| Glass discs | at the rims | – | 1 | all | glass 0.75–0.9, glow 0.6–0.85, light under | breathe | 18–26° up, ~6.4 |
| Pills | through the stack | – | 1 | all | solid | stack or float | 24° up, ~9.5 |
| Orb | across (or at the rims for chrome) | 35° | 1.2 | – | solid | turn | 12° up, 5 |
| Ring | round it | – | 1 | – | glow 0.2–0.5 | turn | 28–40° up, 6 |
| Bento tiles (the five cards) | across, one hue a tile | 70° | 1 | – | flat, grain 0.11 | float | front, ~9.6 |

**Motion** (one main motion a video; all loop)

| Motion | What happens | Numbers |
|---|---|---|
| Stacking | pieces drop in one by one on a spring, hold, lift away together | each drop 0.2 of the loop, starts 0.5/n apart; out over the last 16% |
| Twisting | each piece turns against the next, top and bottom opposite | ±27° at the ends, a slow ±7° sway on the whole |
| Turning | the whole turns: under 1, a sway of that share of a half turn; 1 and up, whole turns a loop | |
| Breathing | the gaps open and close | gap × 1 → 2.4 → 1, ±8° sway |
| Floating | each piece bobs and tips, out of step with its neighbours | ±0.12 (tiles ±0.07), ±3° |
| Fanning | the pieces fan out from a corner and close | up to 57° for the top piece |

The camera holds a ¾ view (0.5 rad round) and sways ±3° over the loop; the light is a soft key from the upper left
with a specular and a rim in the ramp's lightest colour.

## Liquid logo

- **The shape**: a word (set in a heavy face), one of the engine's marks (sparkle, drop, ring, bolt: no one's brand),
  or your picture. A PNG or SVG with transparency is best; a JPEG on white works (its ink becomes the shape).
- **The look** is liquid-logo's field and colour curve (its ten presets, their numbers kept: Chrome, Oil slick, Glow,
  Rainbow, Liquid, Magic, Dusk, Galaxy, Smoke, Wisp; turbulence 4 as in the original). Three things are this engine's:
  the field is laid over the logo's own square (so it looks the same at any frame size); **Contours** (0.6) uses the
  logo's distance field so the bands follow the shape all the way in, not only at its one-pixel outline; **Bevel**
  (0.35) rounds the edge over and catches a light from the upper left.
- Its time only shows through cosines, so the loop runs a whole number of cycles (speed × loop ÷ 2π, at least 1).

## 3D scenes (React Three Fiber)

- **Showroom**: a lacquered pebble on a mirror floor, light strips passing over it (each moves one pitch a loop, so
  they're seamless) and reflected in it, a light line across its back in the accent colour.
- **Prism**: a beam in, a spectrum out, the beam swinging and the fan answering.
- **Candy**: glossy forms floating on a pastel ground, each turning once a loop, contact shadows.

Lighting is drei's `Environment` built from `Lightformer`s (nothing downloaded), redrawn every frame where lights move.

## Not done (yet)

- A physics pile (the falling caps in the R3F reference) needs a physics engine (Rapier): not added.
- One render at a time (they share the GPU), one Chrome per render.
