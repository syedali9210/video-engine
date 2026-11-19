// The hues a field of colour is lit in, from one: the brand's, then two neighbours stepping the same way round the
// wheel (teal → azure → violet, violet → magenta → pink), so a gradient reads as one family moving, not a rainbow.
// A step that would land in the yellow-greens (where a pale field turns muddy) goes the other way round instead.
// Shared by the generator's worlds (server/generate.ts) and the unfold film's field (animations/film-unfold).

const wrap = (h: number) => ((h % 360) + 360) % 360
/** yellow-green: muddy as a pale light, sour as a deep one */
const muddy = (h: number) => wrap(h) > 72 && wrap(h) < 150
/** `h` and two neighbours, `step` degrees apart, all one way round */
export function neighbours(h: number, step = 40): [number, number, number] {
  const up = [wrap(h + step), wrap(h + 2 * step)]
  const down = [wrap(h - step), wrap(h - 2 * step)]
  const pick = up.some(muddy) && !down.some(muddy) ? down : up
  return [wrap(h), pick[0], pick[1]]
}
