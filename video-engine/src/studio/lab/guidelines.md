# Template guidelines

The rulebook for every template script in the engine. The template lab's AI reads it before proposing anything
(and the Studio's New scenes, by the rules or by Gemini, before suggesting a shot), the checker (`lintScript`)
enforces what a machine can check, and the admin approves the rest. It was written from
the reference films measured with motiscope (three Raylight films, Apple's iPhone 17 and 18 films, three SaaS
launch ads), and from what went wrong when templates were generated without it.

## 1. What a script is

A film, shot by shot. Each shot has `name`, `dur` (seconds), `cut` (how it comes in: cut, flash, dissolve, fade,
push, zoom, blur), `why` (one sentence: what the shot does for the film), and some of:

- `device`: a phone (or `{device}`) in 3D. `from` is the camera's framing at the start, `to` where it glides by the
  end, `ease` the curve (`cubic-bezier(x1, y1, x2, y2)`). A framing has `angle` (front, hero, heroLeft, side, tilt,
  float, flat, low, back, macro), `zoom` (1 = the whole device fills the frame; 2–3 is a macro), `yaw` (turn, degrees),
  `pitch` (lean back, negative = the top away from you), `roll` (rotate in the frame), `elev` (camera height,
  degrees), `rise` (shift the device up the frame, in frame heights; negative shows its top, positive its bottom),
  `pan` (shift right, in frame widths). Or `move`: one of the engine's named moves (reveal, spin, turn, pull, orbit,
  sway, push, rise, tour, drift, flip).
- `layers`: flat layers, back to front: `text` (placeholders {name}, {hook}, {tagline}, {cta}, {feature1}–{feature3},
  {part}), `shape` (rect or ellipse filled with a paint stack), `cursor` (a collaborator's arrow and name), `component`
  (`anim` is a library animation or {screen}, {screen2}, {screen3}), `image`, `breakdown` (the screen taken apart:
  table, stack, focus, assemble). Each has `box` {x, y, w} in fractions of the frame (centre and width), an `enter`
  preset (fade, rise, scale, blur; titles also words, sweep, type, mask, part, letters, settle, and `custom` with an
  `animation`, below), optional `entry`
  {at, dur, ease} and `exit` {kind, at, dur, ease}, and `tweens`: blocks of one property (position [dx, dy] in frame
  fractions, scale, rotate degrees, opacity 0–1, blur, tilt [x°, y°]) going `from` → `to`, `at` seconds for `dur`.
- `ground` (a backdrop id: white, seamless, studio, navy, black, midnight, sand, iris, aurora, sunset, ocean, dusk;
  or a hex colour), `paint` (a gradient preset: night-glow, sky, pastel-mesh, spotlight, sunrise, diamond, glass,
  swirl), `fx` (a preset: clean, cinematic, macro, dreamy, retro, noir; or values: focus {at, to, size, blur, angle},
  bloom, vignette, grain, split, grade).

## 2. Story

1. **Details before the whole.** Open close: a macro of the most familiar part of the interface. Earn the wide shot
   of the whole device after two to four details.
2. **The interface is the subject; the device is the frame.** Never take the hardware apart for an app.
3. **One idea per shot.** If a shot does two things, it's two shots.
4. **End on the name**, small, or on the name and one call to action.
5. 4 to 9 shots. 8 to 45 seconds in all.

## 3. Camera

1. **The camera never stops.** Every device shot moves: a glide (rise or pan changing at a fixed zoom), a push
   (zoom up 5–20 %), a pull, a turn, a rise into frame, a drop with a push. A held, centred device is a still photo.
2. **Glides are linear** (`cubic-bezier(0, 0, 1, 1)`): a long move at constant speed reads as one continuous dolly cut
   into pieces.
3. **Into a cut, accelerate** (ease-in `0.42, 0, 1, 1`): the motion carries the eye across the cut.
4. **Landings spring** (`0.34, 1.56, 0.64, 1`): a phone dropping in, letters arriving.
5. **Arrivals ease out** (`0.16, 1, 0.3, 1` or `0.23, 1, 0.32, 1`): a phone rising into the reveal.
6. Macro framings: zoom 2.2–3.0, the part you want brought to the middle with rise (top: about −0.6; bottom: about
   +0.6), a few degrees of roll and yaw so the screen isn't flat to the lens.
7. Side macros: yaw 30–40° and a little pan, so the edge is in the foreground and the screen recedes.
8. The ¾ hero lying back: pitch about −50°, roll about −25°, yaw about −15°, elev about 25°, zoom about 1.

## 4. Depth of field

1. **Every close shot (zoom ≥ 1.8) has depth of field**: `fx.focus` with blur 0.45–0.75 and a band 0.2–0.4 tall.
   Without it a macro reads as a cropped screenshot.
2. **The band follows the read**: when the camera glides down a screen, rack the focus (`to`) or keep the band
   where the next thing to read arrives.
3. Tilt the band with the device's roll (`angle`).
4. Wide shots are sharp.

## 5. Cuts and transitions: every cut has a carrier

A cut feels made when something on screen brings the next shot in; it jolts when nothing does. The checker reads how
each shot's camera moves at its ends (the same poses the renderer draws) and names every cut with nothing to carry it.

1. **A hard cut between two distinct framings**, on the beat, is clean. Two framings that are alike (the same angle,
   about as close, about as turned) jump on a hard cut: change one, or carry it.
2. **Designed carriers**: `whip` (a fast horizontal swing with motion blur, the way the camera was going), `through`
   (the camera pushes on through the frame and lands in the next shot), `iris` (the next shot opens out of the subject
   in a circle, a thin ring at its edge), `wipe` (a line of light sweeps across and carries the next shot in), `flash`
   (false colour round a hard cut, twice a film at most).
3. **Motion carries a hard cut.** When the camera is gliding, the next shot glides on the same way at the same speed
   (one dolly, cut in two); two pushes cut into each other read as one push. A move that reverses at the cut jolts:
   turn the next glide round.
4. **A new ground arrives inside a carrier** (a whip, a push through, a wipe, an iris): never flipped on a bare cut.
5. **Which carrier**: a shot that ends in a whip whips out; one diving into the screen goes through; one pushing in
   goes through; a fast swing sideways whips; from a device to a card, an iris opens the card out of the device (or the
   push goes through); from a card to a device, the words push past (or an iris for an arrival); card to card, a wipe.
   Don't use one carrier three cuts running.
6. **Never** a dip to a flat colour (`fade`), never a dissolve between two device shots. The screen never goes empty.

## 6. Type

1. **Rare and small.** Most device shots carry no type. One idea, two to five words.
2. At most one title per shot (two when one is a small label).
3. Big type (size above 9) only on title cards, never over a device.
4. Titles arrive piece by piece (words, letters, sweep, type) or blur in; they never just appear.
5. The end card's name is small (size 3–5), letters landing.

## 7. Ground and colour

1. **One ground per film, owned completely** (two at most, e.g. a canvas and a dark end card). Colour comes from
   the product.
2. A dark room (navy, black) for glowing screens and keynote reveals; white seamless for light, friendly products.
3. No busy backgrounds: no grids, dots or glows behind a device.
4. Gradients move (drift, spin, breathe) when they're the subject (an end card); they stay quiet behind a device.

## 8. Effects

1. Vignette 0.4–0.6 in dark rooms; none on white.
2. Bloom 0.15–0.3 on glowing screens; never above 0.5.
3. Grain only for a filmic or retro brief.
4. Motion blur is an export setting: fine for fast moves.

## 9. Pacing

1. Macros: 3–4.5 s each. Wide reveals: 3–4 s. Title cards: 1.5–2.5 s. Flash shots: 1–1.6 s.
2. Total 8–45 s. A loopable film ends on a frame that cuts back to its first.

## 10. Why generated templates failed before (never do these)

1. A centred device held still while text animates around it.
2. Every pixel sharp: no depth of field.
3. The whole device first, staying wide.
4. Dissolves and fades on every cut.
5. One easing for everything (ease-out on glides, cuts and landings alike).
6. The frame filled with headlines.
7. Busy grounds (grids, dots, glows), several backgrounds per film.
8. Moves recombined from many references into something that resembles none of them. Rebuild one reference's
   structure, then change the product.

## 11. How a proposal is judged

- The checker rejects proposals that don't compile and flags breaks of sections 2–9.
- The admin approves or rejects every proposal. The reasons are fed back the next night: a rejected idea is not
  proposed again in another form.
- A proposal says what changed and why, citing the rule it follows (for example "4.1: depth of field on the macro").
- Change the fewest things that make the film better. A proposal that rewrites everything is rejected.

## 12. Extending a film: new shots from the ones before

The Studio's *New scenes* proposes shots that continue a film from the scene picked, so a film can keep growing
(`nextShots` in script.ts applies these rules without AI; Gemini is held to them and checked the same way).

1. **Read the shot before.** A new shot belongs to the film: its ground, its look (vignette, bloom, grade), its
   device, its pace (device shots at the film's own length, inside 3–4.5 s). It changes one thing: what it shows,
   or how the camera moves.
2. **Pick up where the camera stopped.** The simplest next shot starts on the last shot's end framing and keeps the
   same move going: the same direction, the same speed, the same curve, cut hard on the beat. One dolly, cut in two.
   A held shot goes on as a slow push.
3. **Show what the film hasn't.** Before the whole device, the parts of the interface it hasn't been close to, in
   this order: the top, the bottom (where the thumb goes), the edge (yaw 30–40°, the screen receding), the middle.
   Never the same part twice. Close shots keep 4.1: depth of field where the eye reads, tilted with the roll.
4. **Earn the whole.** A film with no wide shot gets the reveal after its details: the device rising into the frame
   and settling, on an ease-out arrival (3.5).
5. **One more screen or one more feature, never both in a shot**: another of the product's screens on its own
   (`{screen2}`, rising in while the frame pushes in), or a feature it hasn't said (`{feature2}`) on a title card,
   and a title card only in a film that already has them (6.1).
6. **The end stays the end.** New shots go before the ending (the shot that names the product, when it's one of the
   last two). A film without one gets one: the name, small, letters landing (2.4, 6.5).
7. **Ideas are proposals.** Each says why it's there and the rule it follows; whoever edits the film picks which to
   add and where. Adding one moves on to it, so the next ideas continue from the new shot.

## 13. Learning from the films the lab studied

Each night the lab watches real launch films and writes them down shot by shot (the *Studied* list): where each
cut falls, the angle, how the device turns within the shot, the focus, the easing, the type.

1. **Measure, then borrow.** Compare a script with the films: where they cut on a beat and the script holds, where
   they turn the device through a shot and the script only glides, where they go closer than it does. Bring over
   that one thing, in this engine's terms (a framing, a move, a cut, a turn), and cite the film it comes from.
2. **One film at a time** (10.8). A change takes one film's structure: its order of shots, its rhythm of cuts. It
   never mixes a move from one film with the cut of another.
3. **Their craft, our rules.** A studied film doesn't overrule sections 2–9: a turn it makes still travels on the curve
   its kind of move takes (3.2–3.5), a close shot still keeps depth of field (4.1), and its quick title swaps still
   keep type rare (6.1).
4. **Never their content.** A film's product, words, brand colours and footage stay theirs. Only the cinematography
   comes over.

## 14. The whole vocabulary: invent with it

A new film is new when its shots are, not when old shots come in a new order. The engine invents films from this
vocabulary (`studio/invent.ts`), and the lab's new templates start from them.

1. **Angles** (`device.from.angle`): `hero`, `heroLeft`, `front`, `side`, `tilt`, `float`, `flat`, `low`, `back`,
   `macro`, and:
   - `top`: straight down onto it lying on the table, turned off square;
   - `worm`: from below on a wide lens, so it towers (one shot, not a film of them);
   - `profile`: edge on (the band, the buttons, the thinness);
   - `dutch`: rolled off the level, for energy between steadier shots;
   - `lying`: lying back on a table, seen from three quarters above;
   - `edge`: close along the band, the screen receding (keep 4.1, depth of field);
   - `over`: looking down over the top edge.
2. **Moves** (`device.move`): `reveal`, `spin`, `turn`, `pull`, `orbit`, `sway`, `push`, `rise`, `tour`, `drift`,
   `flip`, and:
   - `turntable`: one whole turn at an even speed (loops);
   - `crane`: lowers onto the shot from high above (an arrival: 3.5);
   - `arc`: travels round it, closing in;
   - `vertigo`: the dolly zoom, once a film at most;
   - `fall`: drops in under gravity and bounces to rest (a landing: 3.4);
   - `whip`: drifts, then swings away fast; the next shot cuts in on the swing (3.3);
   - `roll`: rolls in a quarter turn and settles;
   - `dive`: turns to face the camera and pushes into the screen; the next shot cuts in on the interface (a `zoom` or
     a hard cut).
3. **Looks** (`look` on the film, `look` on a shot): a harmony of the product's own colour (read off its screen), so
   a film is matched, not grey: `tonal` (its hue, deep, the device in a case of it), `deep` (a dark room, one
   coloured light), `light` (paper, a whisper of the colour), `pop` (the colour itself, saturated), `complement` (the
   opposite hue, so the colour pops), `analogous` (a soft blend through neighbouring hues), `studio` (neutral).
   One harmony for the film; a shot may take a second one (a light title card in a dark film). Never more than two
   (7: one ground per film, two at most). `"case": true` puts the devices in a case of the look's colour.
4. **Shapes** the inventor writes from: a night reveal (details in the dark, a drop or a crane, a turn, a light card,
   the name), a tonal tour (over the top, close, into the screen, a card, a roll, edge on), a pop cut (a hook in
   letters, whips, from below, a spin, a card, an arc), a paper calm (from above, lying back, a card, a rise, a dolly
   zoom), a keynote (a swept line, a spin from the back, edge on, a turntable), a blend. A new shape is welcome; say
   what it's for.

## 15. Titles, measured, and the kinds of film

1. **A title's own animation** (`"enter": "custom"` with `"animation"`), the way the studied films' titles move:
   - `by`: what moves on its own: `all` (the title), `line` (split where the title breaks), `word`, `char`;
   - `from`: where each piece starts, easing to rest: `x`, `y` (em of the type's own size), `scale`, `rotate`,
     `flip` (tipped back on its baseline, degrees), `skew`, `blur` (em), `opacity`, `spacing` (extra tracking, em);
   - `dur` (one piece, seconds), `stagger` (between two pieces starting), `ease` (cubic-bezier), `order` (`first`,
     `last`, `middle`, `random`), `mask` (each piece rises from behind its own line), `tint` (a colour each piece
     starts in), `idle` (once in: `wave`, `float`, `shimmer`).
   - Measured off a real film, it is the title's look: copy the numbers, don't round them into a preset. One title
     animation per film, two at most (a hook and the rest), so the film has a typographic voice (6).
2. **Kinds of film** (`category` on the script): each kind has its own shape. Write a template of a kind from the
   references of that kind first (the lab gives them in that order).
   - `product-launch`: a hook, the reveal, what it does (two or three beats), the name. 30–60 s.
   - `feature-launch`: one feature: the problem in a beat, the feature at work on the real interface (macro, the
     cursor, the result), why it matters, the name with the feature's. 20–45 s.
   - `product-demo`: the product in use, step by step, on the screen: few cuts, the camera following the work,
     small type naming each step. 30–90 s.
   - `teaser`: short and withholding: details, never the whole, a date or "soon". 8–20 s.
   - `brand`: the idea behind the product: mood, light, colour, few words. 20–60 s.
   - `social`: vertical, fast, a hook in the first second, the name by the end. 6–20 s, 9:16.

## 16. Ideas, replicas and what the decisions teach

1. **An idea** is a film before it has shots: a hook (the first two seconds), a spine (the structure), one signature
   (the visual idea that carries it, with the carrier its cuts lean on), a look, and beats in the inventor's grammar
   (`detail-top`, `edge`, `over`, `top`, `lying`, `profile`, `dutch`, `worm`, `dive`, `end`, `reveal:<move>`,
   `turn:<move>`, `swing:<angle>:<name>`, `card:{…}:<enter>`, `feature:{…}`), each with its intent. Every idea is
   different from the others and from the gallery.
2. **The critic** reads any film on eight things: the hook (short and already moving), clarity (one idea at a time,
   words in at most half the shots), flow (the cuts, §5), craft (these guidelines), pacing (against the films
   studied), variety (angles and moves), novelty (unlike the gallery's films, by the order of their shots) and taste
   (what the admin keeps). A film under 65 is reworked before it's proposed.
3. **A replica** keeps its reference's cut points, length and transitions exactly; only the product's words and
   screens change (placeholders). Live action becomes the product's device, framed the same way, and says so.
   Measured, not imitated: a replica shows how close it is, part by part and shot by shot.
4. **What the decisions teach**: every approval and rejection weighs the features of its film (cuts, angles, moves,
   pace, look, kind), and a rejection's reason becomes a rule every new proposal is checked against (too much text,
   too fast, abrupt cuts, flashes, colour, a still camera). Follow the learned taste; never re-propose what it turned
   down.

## 17. The Artist: whole launch films, not angles

1. **A launch film is a story, not a reel of device angles.** The Artist (`artist.ts`) writes each kind of film from
   set pieces:
   - the hook slammed in, or words cut on the beat;
   - the name revealed in a gradient fill;
   - the device arriving between parting words;
   - the feature beside the real interface, with a cursor that clicks;
   - three cards, a split, the screen taken apart, every screen together, a montage, a breath;
   - the proof, the end card with its button, or the call typed out.

   Device shots are a few of them, not all of them.
2. **An art direction holds a film together**: one harmony of the product's colour, a gradient world for each part of
   the story (`gradients.ts`: mesh, aurora, spotlight, swirl, horizon, duotone, prism, glow, dusk, noir), one type
   system (a face, a weight, how each role's titles arrive), one card style, one tempo, the carriers its cuts lean on.
3. **Timed to a beat.** Every shot is a whole number of beats at the film's tempo; titles land on beats; words on the
   beat hand over on it.
4. **Type that reads.** Titles are stacked by their measured height, never overlapping. Ink is checked against the
   gradient under it (7:1, labels 4.5:1), a button's label against the button. Placeholders, never invented facts.
5. **Taste chooses, and still explores.** The art directions are ranked by what the admin keeps (exports, picks,
   approvals, thumbs), with room to try one it hasn't tried much.


## 18. Content that places itself, faces, own directions, verdicts

1. **Read the product before laying it out.** The content reader (`content.ts`) turns a product into an inventory:
   its screens, components, words, features, numbers in its words ("2,000 teams", "10×", "99.9%") and real counts
   ("12 screens"), each with how much it matters. A grid (a bento, a split) gives each cell what suits its shape and
   size, the biggest cells the most important things, nothing twice while there's something new. The name and a
   screen always get a cell.
2. **A set piece with nothing to say stays out.** No three cards for one feature, no collage for one screen, no
   breakdown without a live interface, no proof without a number. Counts are the product's own, never invented.
3. **Faces come from the curated set** (`faces.ts`), each asked for only with the weights it really has. A face
   without the weight asked for shows its nearest: never a synthesised bold.
4. **The admin's own art directions** (`.engine-data/lab/directions.json`) stand beside the six and are ranked by the
   same taste. A direction read off pictures takes light or dark from their ground, energy from their chroma, the
   harmony from how far their hues reach, and gradient worlds to match.
5. **Verdicts are the strongest signal.** A kept film (accept) outweighs an export; "not yet" (rework) counts against
   its features, and its tags become rules: Cuts means the cuts were abrupt, Type means too much text, and so on.
