// How a video export is split between renderers working side by side (server/studio.ts runs one Chrome per part, all
// feeding one encoder in film order). Plain logic, no imports: scripts/check.mjs runs it as it is.

export type Part = { a: number; b: number; join: number; first: number; visit: number[] }
/** Splits a video's frames between renderers so the picture is the one a single renderer makes. A part starts where a
    scene cuts in, so nothing of the scene before it shows. What it has to recreate is when the frames it shows loaded,
    because their clocks start there: a scene's live frames load as the playhead enters the scene before it. So a part
    joins the film at the scene before (or at the start), then visits the first moment of each scene up to its own
    without capturing. However far a clock jumps it steps in the same 1/60 s ticks, so the rest matches too. */
export function plan(scenes: { duration: number; transition?: string }[], start: number, n: number, k: number, sample: (i: number, j: number) => number, parts: number, /** split at every cut (the render cache's segments: one a scene, as far as the cuts allow) */ every = false): Part[] {
  const starts = scenes.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + scenes[i - 1].duration : 0], [])
  // the scene at t, the way the render page reads it (comp.ts `at`)
  const sceneAt = (t: number) => {
    const i = starts.findIndex((x, j) => start + t < x + scenes[j].duration)
    return i < 0 ? scenes.length - 1 : i
  }
  // the first moment the capture lands in each scene, and the first frame that starts in it
  const first: (number | undefined)[] = []
  const opens: (number | undefined)[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) first[sceneAt(sample(i, j))] ??= sample(i, j)
    opens[sceneAt(sample(i, 0))] ??= i
  }
  const cuts = scenes.flatMap((s, i) => (i && s.transition === "cut" && opens[i] ? [opens[i]!] : []))
  const K = Math.max(1, Math.min(parts, cuts.length + 1, Math.floor(n / 45)))
  // the cut nearest each even split (or every cut)
  const edges = [0]
  if (every) edges.push(...cuts.filter((f) => f > 0 && f < n))
  else
    for (let c = 1; c < K; c++) {
      const want = (c * n) / K
      const near = cuts.filter((f) => f > edges.at(-1)!).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0]
      if (near !== undefined) edges.push(near)
    }
  edges.push(n)
  return edges.slice(0, -1).map((a, c) => {
    const b = edges[c + 1]
    if (!a) return { a, b, join: 0, first: 0, visit: [] }
    const t0 = sample(a, 0)
    const i0 = sceneAt(t0)
    let J = i0 - 1
    while (J > 0 && first[J] === undefined) J--
    return { a, b, join: J > 0 ? first[J]! : 0, first: t0, visit: first.slice(J + 1, i0 + 1).filter((t): t is number => t !== undefined && t < t0) }
  })
}
