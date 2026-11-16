# Effect guidelines

The rulebook for the canvas's background effects: animated raster artwork drawn on the GPU (src/canvas/effects.ts
holds the data, public/canvas.js draws it). The template lab's AI reads it before proposing an effect, `lintEffect`
checks what a machine can, and the admin approves the rest. It was written from reference artwork: dithered posters
(a two-tone lime print, a pink wave rising out of navy), halftone prints (blue dots over white, a grey dot globe on
black), an ASCII hero (towers of glowing characters), cross-stitch rings, a 1970s scanline poster (MIT Lincoln
Laboratory) and an LED wall out of focus (huge soft pixels with bloom); then a second set (Syed's Figma, 2026-10-24):
old televisions (a blue pixel mesh, a band of glare, a pastel afterglow, a cloud in cyan dots, a painting on the glass),
a sky over a still sea, an ink-and-wash coast and an oil coast, 1970s swirls and circles, Bauhaus tiles, a tunnel of
neon rectangles and blocks of stepped colour.

## 1. What an effect is

A field moves under a grid; each cell draws one shape, sized and coloured by the field there. Or it's a scene: a
picture drawn whole, at every pixel, in a palette (§1b).

- `source`: what moves. `flow` (domain-warped noise, slow organic blobs), `waves` (a crest rising and falling across
  the frame), `rings` (concentric ripples), `orb` (two soft lights drifting), `picture` (a picture, drifting and
  breathing; `tint` takes each cell's colour from it, and `under` (0–1) shows the picture itself, soft, beneath the
  cells: characters over a blurred photo, each lifted a little so it reads), `clouds` (billowing clouds that gather
  low in the frame and drift: fine `dot` cells with some dither and grain make them print-like, `smooth` cells make
  them a soft bank; lavender, peach and white inks for dusk, blue-greys for night), `beam` (soft bands of light
  sweeping slowly along `angle`: a screen's glare; `angle` −52 runs it from the top left to the bottom right),
  `cumulus` (a tower of billowing cloud rising left of centre with a low bank beside it, lit from above and shaded in
  its folds: in fine `dot` cells on navy it's a cloud on an old screen).
- `cell`: what each cell draws. `pixel` (squares), `dot` (halftone circles), `cross` (cross-stitches), `char`
  (characters from `chars`, lightest to densest), `line` (three phosphor stripes per block), `block` (soft squares),
  `smooth` (no cells at all: the field itself, a gradient that moves, like an aurora or a mesh gradient; `size` then
  only sets how fine the field is, 16–28 px is right, and a little `grain` keeps its long blends from banding).
- `size` (3–120 px, the cell), `gap` (0–0.9 of it left empty), `sizeBy` (0 every shape the same, 1 halftone: dense
  places draw big shapes), `dither` (0 smooth, 1 ordered two-tone dither: each shape on or off), `soft` (0–1).
- `contrast` (0.2–3) and `level` (−1 to 1: less ink or more), `invert`, `scale` (0.2–5: how big the field's forms
  are), `speed` (0 still, to 3), `angle` (the flow's direction, degrees), `seed` (another field, same settings).
- `colors`: the ground, then one to three inks the field runs through (the last ink is also the glow's colour); a
  `transparent` ground lets the frame's own background show through. A scene takes up to six inks (§1b).
- `glow` (0–1: soft light from the field behind the cells), `grain` (0–1), `fade` (none, bottom, top, edges, round).
- `screen` (0–1): an old television. The glass sits in a dark bezel and bulges (everything on it, cells included,
  curves with it), darkens toward its edges, with a phosphor mask and scanlines over smooth fields and scenes (cells
  are their own grid, so they keep only the curve). Around 0.2 it's a hint of glass; 1 is a set in a dark room.
- `paper` (0–1): fibres and blotches that stay still under the ink, for prints (0.4–0.6).

## 1b. Scenes

Drawn whole at every pixel, crisp at any size, with no cells (`cell`, `size`, `gap`, `sizeBy`, `dither`, `soft` don't
apply). The ground and inks paint named parts; `scale`, `speed`, `seed` work as before.

- `horizon`: a sky over a still sea. Ground: the sky's top; inks: the haze at the horizon, the sea, the cirrus.
  `level` moves the horizon; `contrast` thickens the cirrus. Mist breathes along the horizon.
- `coast`: a painted coast: sky, clouds, hills and a town across the water, two sailboats rocking with their
  reflections, gulls, the sun's road on the waves, a rocky cliff in front with scrub, a tree leaning over it. Ground:
  the sky; inks: the glow at the horizon, the sea, ink (rock, shadows, outlines), the sun, clouds, leaves. `level` is
  the sun's height; below −0.6 it's an oil painting (no disc, white gulls, an olive tree and daisies), above it an
  ink-and-wash one (a red sun, an inked pine). `contrast`: how cloudy. With `paper` it's a print; with `screen` and
  a palette of blues it's a memory on an old television.
- `swirl`: 1970s swirls, contour bands of slow interfering waves: ribbons of three stripes with a gap of the ground
  between, the inks turning from ribbon to ribbon. `contrast`: how many bands.
- `circles`: clusters of overlapping discs in the inks, darker where they cross (ink over ink), floating, with small
  dots between. The ground shows between them (it can be `transparent`).
- `tiles`: Bauhaus tiles: half and quarter discs, triangles, circles, rings and fields of dots, stripes, two-tone
  halves, in the inks; the last ink draws the grid. One tile turns a quarter now and then.
- `tunnel`: nested rounded rectangles rising from the foot, flowing outward; the first ink is the heart, the last the
  outside, then the ground. `contrast`: how many bands.
- `blocks`: squares, dominoes and L shapes fitted together with a seam of the ground; each block is one ink stepping
  from pale at its edge through the full hue to deep at its heart (or back), the steps flowing inward.

## 2. It's a background

1. **Type goes on it.** A dark ground for white titles, a light one for dark titles; keep the ink's contrast low
   where titles sit (a fade, or a level below 0), or give the title frosted glass.
2. **It drifts; it never competes.** Speed 0.15–0.5 for a background; above 1.5 it pulls the eye off the content.
3. **One idea of colour.** A ground and one ink is a print; two or three inks are a ramp of one hue, or a hue and
   one accent (blue and gold), never a rainbow. A scene's palette is still one idea: a 1970s print (cream, olive,
   mustard, orange, rust, brown), a neon ramp (white, pink, orange, red, magenta, violet), one blue for a television.
4. **Light on glass, or ink on paper.** A screen and paper at once is neither.

## 3. The craft

1. **Cells read from about 6 px.** Smaller and the pattern blurs into a texture; characters read from about 9 px
   and stop being a texture above about 28 px.
2. **Halftone sizes, dither switches.** For a print, use `sizeBy` 1 with dither 0 (dots that swell); for a screen,
   dither 1 with `sizeBy` 0 (pixels on or off).
3. **Glow wants grain.** A strong glow bands on screens; a little grain (0.15–0.35) breaks the steps up.
4. **Big blocks become light.** Above about 30 px with softness and glow, pixels stop being pixels and become an LED
   wall out of focus: atmosphere behind small type.
5. **Fade into the content.** A background that ends at a hard edge looks pasted; fade it at the bottom (or the edges)
   where the page goes on.
6. **A scene stays a picture.** It moves only where weather would: water, clouds, a tree, wings, at the speed of an
   afternoon (0.15–0.3). A pattern scene (tiles, circles, blocks) moves one thing at a time.
7. **On a screen, the picture glows.** Lift the inks a step; the bezel frames it, so it needs no fade.

## 4. How a proposal is judged

- It must be a valid effect (`validateEffect`): every field in range, a ground and at least one ink.
- The checker flags breaks of sections 2 and 3; the admin approves or rejects. A rejection's reason is read by the
  next run: a rejected idea is not proposed again in another form.
- A proposal says what it's for (the kind of page and type it suits) and why it works, citing the rule.
