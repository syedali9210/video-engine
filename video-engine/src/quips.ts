// The engine's voice while it works. A verb that changes every couple of seconds ("Storyboarding…", "Kerning…"),
// and under it a line that changes more slowly: a quip, a maxim, or a tip that teaches the app while you wait.
// Lists are shuffled per session so a long render doesn't repeat the same order every time.

/** What the engine says it's doing, a gerund at a time. Film-flavoured, a little silly, never alarming. */
export const GERUNDS = [
  "Pondering",
  "Storyboarding",
  "Kerning",
  "Colour-grading",
  "Choreographing",
  "Keyframing",
  "Tweening",
  "Combobulating",
  "Framing the shot",
  "Easing the curves",
  "Lighting the set",
  "Clapping the slate",
  "Rolling camera",
  "Cutting on the beat",
  "Rehearsing the hook",
  "Polishing the glass",
  "Herding keyframes",
  "Untangling bezier curves",
  "Bribing the GPU",
  "Counting frames",
  "Tightening the cuts",
  "Fluffing the gradients",
  "Finessing",
  "Percolating",
  "Marinating",
  "Tinkering",
  "Conjuring",
  "Noodling",
]

/** Under the verb: quips, a few short maxims (attributed), and tips that teach the app. */
export const QUOTES: { text: string; by?: string; tip?: boolean }[] = [
  { text: "Less, but better.", by: "Dieter Rams" },
  { text: "The details are not the details. They make the design.", by: "Charles Eames" },
  { text: "Simplicity is the ultimate sophistication.", by: "Attributed to Leonardo da Vinci" },
  { text: "Creativity takes courage.", by: "Henri Matisse" },
  { text: "Good design is as little design as possible.", by: "Dieter Rams" },
  { text: "Art is never finished, only abandoned.", by: "Attributed to Leonardo da Vinci" },
  { text: "Somewhere, a keyframe is finding its curve." },
  { text: "The device is practising its best angle." },
  { text: "Titles land on the beat. We checked twice." },
  { text: "Pixels are being placed with unreasonable care." },
  { text: "No gradients were harmed in the making of this film." },
  { text: "The end card is fixing its hair." },
  { text: "A great hook lasts three seconds. Rendering takes a little longer." },
  { text: "Every cut has a carrier. Every carrier has a cut." },
  { text: "Your product looks good in this light." },
  { text: "Space plays the film; a click on the frame pauses it.", tip: true },
  { text: "Ctrl K finds any template, action or piece of your work.", tip: true },
  { text: "Quick draft renders at half size: great for checking the pacing.", tip: true },
  { text: "Drop your screens in Product once, and every template uses them.", tip: true },
  { text: "Click any word on the film to edit it right where it sits.", tip: true },
  { text: "Ctrl Z undoes a whole burst of changes in one step.", tip: true },
]

const shuffle = <T,>(a: T[]) => {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
/** One order per session, so two waits in a row don't open on the same words. */
export const SESSION_GERUNDS = shuffle(GERUNDS)
export const SESSION_QUOTES = shuffle(QUOTES)
