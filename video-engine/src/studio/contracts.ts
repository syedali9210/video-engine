// Story contracts: what each film template is for and what every one of its slots means, so an agent can tell a
// product's story in it rather than pour words into labelled boxes. A contract says the film's idea, the story it tells
// (story.ts shapes), the products it suits and doesn't, its tone and pace, what it needs from the product (features,
// screens, a real number), each shot's job, and for each slot: what it means in the story, how to write it, and which
// feature it carries. The slot writer gets the contract; the picker scores templates against a brief with it; the
// checks read it. Plain data and no DOM: the dev server and `npm run check` read it.
// Contracts for new templates are drafted by the film maker (server/maker.ts) and kept in .engine-data/contracts.
import type { Shape } from "./story.ts"

/** What a line does in the story. */
export const MEANINGS = ["name", "product", "kicker", "hook", "pain", "old-way", "promise", "benefit", "feature", "feature-list", "action", "detail", "proof", "tagline", "cta", "url", "ui", "example"] as const
export type Meaning = (typeof MEANINGS)[number]
export type SlotRule = {
  means: Meaning
  /** how to write it, in a line */
  say: string
  /** which of the product's features it carries (0 = the strongest) */
  feature?: number
  /** a real figure or address only: never invented (left as the template's own words, or written without numbers) */
  factual?: boolean
}
export type Contract = {
  /** the film template's library id */
  film: string
  idea: string
  arc: Shape
  /** the kinds of product it suits, as words a brief's kind or audience may contain */
  fits: string[]
  avoid?: string[]
  tone: string
  pace: 1 | 2 | 3
  /** `site`: a full-page picture of the product's site (without one, the template draws its reference product's page) */
  needs: { features: number; proof?: boolean; site?: boolean }
  shots: Record<string, string>
  slots: Record<string, SlotRule>
  /** how far it takes the product's colours (animations/_film/tone.ts): "product" its ground, ink and accent; "accent"
      only the accent (its look is the point: deep space, a night studio). Default "product". */
  theme?: "product" | "accent"
  /** the reference film's own names (its product, its models, the brands in its interface): never left on screen */
  refs?: string[]
  /** who wrote it: shipped here, drafted by the director, or approved by you */
  by?: "engine" | "draft" | "you"
}

// the rules every line keeps, said once to the writer
export const HOUSE = [
  "Every line keeps its job in the film and its limits (pieces split by |, characters, words).",
  "Use only the product's real features, voice and facts. Never invent a number, price, customer, quote, URL or integration.",
  "Never name another company or product (no competitor, no brand in a list). Where the template shows one, write a generic noun.",
  "No hype words: revolutionary, seamless, game-changing, unleash, supercharge, next-level, cutting-edge.",
  "Where a line is the product's interface (tabs, menus, a log), write what this product's own interface would say.",
]

const C = (c: Contract): Contract => ({ by: "engine", ...c })

export const CONTRACTS: Contract[] = [
  C({
    film: "film-spotlight",
    theme: "product",
    refs: ["Paper", "Xavier"],
    idea: "One new feature introduced inside the product's own window: a tab opened, the feature named huge among the product's nouns, four words typed over the app as it slides by, the mark becoming the app icon.",
    arc: "launch",
    fits: ["design", "saas", "web app", "productivity", "creative", "editor", "workspace", "feature"],
    avoid: ["hardware", "consumer finance"],
    tone: "calm, crafted, warm paper",
    pace: 2,
    needs: { features: 1 },
    shots: { "Your app": "the product as it is, its home screen in a window", Introducing: "a new tab typed open: something new", "The feature": "the hook: the feature's name, huge, among everything else the product has", "Four words": "what it lets you do, typed over the product", "The mark": "the brand", "The icon": "the app, clicked: try it" },
    slots: {
      name: { means: "name", say: "The product's name, as short as it goes." },
      user: { means: "ui", say: "A believable first and last name for the signed-in user; not a public figure." },
      feature: { means: "feature", feature: 0, say: "The new feature's name in one word, shown huge." },
      tags: { means: "feature-list", say: "Twenty short labels from this product's own world (its areas, objects, tools), four rows of five; keep “Introducing…” as the seventh." },
      words: { means: "benefit", feature: 0, say: "Four words that make one short sentence about what the feature lets you do, one word a piece." },
      tabs: { means: "ui", say: "Four tab or page names this product's users would have open." },
      pages: { means: "ui", say: "Four file or page names a user of this product would make." },
      headline: { means: "promise", say: "The product's promise as a page headline." },
    },
  }),
  C({
    film: "film-horizon",
    theme: "accent",
    refs: ["Arcane", "SOL", "Solana", "Jupiter", "Magic Eden"],
    idea: "A product launched like a mission from deep space: the change it makes (from the old way to the new), its promise, its features on glass panels and in pills, an end card with the belief behind it.",
    arc: "launch",
    fits: ["fintech", "payments", "crypto", "wallet", "privacy", "security", "consumer app", "money"],
    avoid: ["design tool", "editor", "developer tool"],
    tone: "cosmic, calm, premium",
    pace: 2,
    needs: { features: 3 },
    shots: { Grid: "the hook: the product's icon held in a selection", Horizon: "the change: from the old way to the new, then the promise", Panels: "the main feature on glass", Addresses: "the second feature among the details", Pills: "two actions, each with its line", Orbit: "two benefits under a comet", Switch: "the last panel: the call to switch", "End card": "the name, the belief, the address" },
    slots: {
      name: { means: "name", say: "The brand name alone, one word if it can be." },
      product: { means: "product", say: "The product's full name as it's introduced." },
      from: { means: "old-way", say: "Starts with “From”: the way people do it today, Title Case." },
      to: { means: "promise", say: "Starts with “To”: what it becomes with the product, Title Case." },
      promise: { means: "promise", say: "The promise in two or three words, Title Case." },
      send: { means: "action", feature: 0, say: "The main feature as a verb and how it feels (like “Send Easily”), Title Case." },
      wallet: { means: "detail", feature: 0, say: "What the main feature works on, Title Case." },
      import: { means: "feature", feature: 1, say: "The second feature as a short phrase." },
      easy: { means: "benefit", feature: 1, say: "How easy the second feature is, a few words." },
      pills: { means: "feature-list", say: "Action|its line|action|its line: two one-word actions, each with a line saying what it does." },
      orbit: { means: "benefit", feature: 2, say: "Two benefits, one per line, Title Case." },
      switch: { means: "cta", say: "A line|the button: the button reads “Switch To <name>” or another short call." },
      tagline: { means: "tagline", say: "The belief behind the product, one sentence." },
      url: { means: "url", factual: true, say: "The product's real address; never made up." },
      unit: { means: "ui", say: "The unit the product counts in (a currency, credits, files); a short word." },
    },
  }),
  C({
    film: "film-glide",
    theme: "accent",
    idea: "The product's editor laid flat in the dark and filmed with a macro lens: clips growing onto the timeline, a slow glide in shallow focus, the play button lit and pressed.",
    arc: "walkthrough",
    fits: ["editor", "video", "audio", "timeline", "creative", "animation", "design", "music"],
    avoid: ["fintech", "consumer finance", "chat"],
    tone: "quiet, cinematic, precise",
    pace: 1,
    needs: { features: 0 },
    shots: { Wide: "the whole editor, the work growing in", Macro: "the craft up close", Play: "press play: see it" },
    slots: {
      tracks: { means: "ui", say: "Six layer or track names from this product's own editor." },
      sections: { means: "ui", say: "Five section names, some with a time (like “Drop 3.4s”)." },
      clips: { means: "ui", say: "Four clip names a user of this product would have." },
    },
  }),
  C({
    film: "film-blueprint",
    theme: "product",
    idea: "The product explained as a technical diagram: a headline among connector lines, a real example of its work, the rules it applies one by one, the result on a phone, real numbers counting, the close.",
    arc: "walkthrough",
    fits: ["marketing", "ads", "social", "content", "analytics", "creative", "saas", "agency"],
    avoid: ["hardware"],
    tone: "clear, methodical, confident",
    pace: 1,
    needs: { features: 5, proof: true },
    shots: { Opening: "what it helps you do", Picture: "an example of the work", Rules: "the rules it applies, one by one beside the example", Phone: "the result where people see it", Proof: "real numbers", Close: "the outcome", Again: "the mark" },
    slots: {
      name: { means: "name", say: "The product's name; its first letter becomes the mark." },
      start: { means: "promise", say: "An action|its object (like “Start Building|Beautiful Ads”)." },
      account: { means: "example", say: "A believable sample customer's name for the example; not a real company." },
      handle: { means: "example", say: "That sample customer's @handle." },
      post: { means: "example", say: "A sample of what the product helps make, in its customer's voice." },
      overlay: { means: "example", say: "Two short lines set on the example's picture." },
      tips: { means: "feature-list", say: "Five things the product does or checks, each a short imperative." },
      proof: { means: "proof", say: "What the numbers prove, a line." },
      stats: { means: "proof", factual: true, say: "Number|what it counts, three times: only figures in the brief." },
      close: { means: "tagline", say: "The outcome in two short sentences." },
      chips: { means: "feature-list", say: "Three things it judges, one word each." },
    },
  }),
  C({
    film: "film-verbs",
    theme: "product",
    refs: ["Illustrator", "Adobe", "Vector Studio"],
    idea: "The product as everything it lets you do: eight huge verbs, each wearing what it does; then what it replaces, its icon, the app tilting in, one tool drawing.",
    arc: "launch",
    fits: ["design", "creative", "editor", "illustration", "tool", "productivity", "app"],
    avoid: ["fintech", "payments"],
    tone: "playful, bold, graphic",
    pace: 3,
    needs: { features: 3 },
    shots: { Verbs: "the hook: eight things you can do", Line: "what it replaces", Meet: "meet the app", Pen: "one tool in use" },
    slots: {
      name: { means: "name", say: "The product's name." },
      verbs: { means: "feature-list", say: "Eight one-word verbs: things you do in the product, strongest first." },
      glyph: { means: "ui", say: "The key that undoes the old way, on a key cap: ⌘Z (keep it, unless this product's own undo key is another). It and the line read as one sentence: “⌘Z your expensive subscription.”" },
      line: { means: "old-way", say: "The rest of that sentence after the key: the old way this product makes you undo, in the audience's words, without naming another product (like “your expensive subscription.”, “a week of editing.”)." },
      tool: { means: "feature", feature: 0, say: "One tool or feature's name." },
      how: { means: "detail", feature: 0, say: "How that tool is used, two very short sentences." },
    },
  }),
  C({
    film: "film-flyover",
    theme: "product",
    refs: ["TrustMRR", "Substack", "Mailchimp", "beehiiv"],
    idea: "The product's own website tilted back and flown over in shallow focus, section by section; a whip back to the whole page, a dive into the app for the closing line.",
    arc: "walkthrough",
    fits: ["saas", "web app", "website", "newsletter", "marketing", "startup", "landing page", "b2b"],
    tone: "confident, editorial, smooth",
    pace: 2,
    needs: { features: 2, site: true },
    shots: { "The hero": "the site's first screen: what it is", "Down the page": "the features, the story, the price", "The whole page": "everything at once", "Into the app": "the product itself", "The closing line": "the call" },
    slots: {
      name: { means: "name", say: "The product's name." },
      url: { means: "url", factual: true, say: "The product's real address (a page of it is fine); never made up." },
      hero: { means: "promise", say: "Two lines: what it does|why it's better (no competitor named, no number unless real)." },
      sub: { means: "detail", say: "Two lines of the sub-heading: how it works or who it's for." },
      features: { means: "feature-list", say: "Two lines titling the features section." },
      ai: { means: "feature", feature: 0, say: "Two lines: its standout capability." },
      aiLine: { means: "detail", feature: 0, say: "A line under it saying how." },
      why: { means: "ui", say: "A short title for the founder's story section." },
      plans: { means: "ui", say: "A title for the pricing section, no price in it." },
      price: { means: "proof", factual: true, say: "The real starting price from the brief; otherwise “Free” only if it's true, else “Plans”." },
      faq: { means: "ui", say: "The questions section's title, one word." },
      campaign: { means: "example", say: "Something a user made in the product, as its title." },
      subject: { means: "example", say: "A line from that thing, as its subtitle; no invented figures." },
      close: { means: "cta", say: "An imperative|its payoff (the second in italic)." },
    },
  }),
  C({
    film: "film-liquid",
    theme: "accent",
    idea: "For an AI product: a liquid sphere pulled into the mark, an invitation typed huge, ideas of what to ask wheeling past, one sent as the prompt, the agent thinking.",
    arc: "launch",
    fits: ["ai", "assistant", "agent", "chat", "copilot", "llm", "automation"],
    avoid: ["hardware", "physical product"],
    tone: "fluid, intelligent, inviting",
    pace: 2,
    needs: { features: 1 },
    shots: { Liquid: "the hook: the mark formed from liquid", Ask: "the invitation and what you can ask", Prompt: "one ask, sent", Think: "it works on it" },
    slots: {
      name: { means: "name", say: "The product's name." },
      ask: { means: "promise", say: "The invitation, like “Ask about anything”, in this product's words." },
      ideas: { means: "feature-list", say: "Eight short things people ask this product to do, real uses only; the last one is picked." },
      prompt: { means: "example", say: "A realistic request this product gets, specific and plain." },
      thinking: { means: "ui", say: "One word shown while it works." },
      reply: { means: "example", say: "How its answer to that request begins." },
    },
  }),
  C({
    film: "film-mosaic",
    theme: "product",
    refs: ["Alpaca", "Opus", "Claude"],
    idea: "Four quarters cutting through one story on their own clocks: the model picked, the request typed, the agent's work logged, the result on a monitor and a phone, the tools connected, ready.",
    arc: "walkthrough",
    fits: ["ai", "agent", "builder", "no-code", "developer", "website builder", "automation"],
    avoid: ["consumer finance", "hardware"],
    tone: "fast, technical, satisfying",
    pace: 2,
    needs: { features: 2 },
    shots: { "The prompt": "the request", "The making": "the agent working", "The page": "what it made, on screens", Ready: "done, connected" },
    slots: {
      name: { means: "name", say: "The product's name." },
      model: { means: "ui", say: "A model or mode name this product shows." },
      begin: { means: "hook", say: "The opening question the product asks." },
      prompt: { means: "example", say: "A realistic request, lower case, plain." },
      log: { means: "ui", say: "What the agent did, as its log summary." },
      made: { means: "example", say: "What it made, in two words." },
      ready: { means: "proof", say: "“<what it made> ready!”" },
      connect: { means: "feature", feature: 1, say: "The call to connect its tools." },
      team: { means: "detail", say: "The rest of that line." },
      tools: { means: "ui", say: "Eight integrations it really has from the brief; otherwise generic kinds (Mail, Calendar, Docs), never brand names." },
    },
  }),
  C({
    film: "film-quad",
    theme: "accent",
    refs: ["SOL", "Solana", "unipcs", "Cea Industries", "Pons"],
    idea: "Four little ads cut on the beat for one feature: the feature beside the app, the name among flying coins, an action button raining coins, a receipt of what you got.",
    arc: "teaser",
    fits: ["fintech", "payments", "crypto", "trading", "consumer app", "rewards", "mobile"],
    avoid: ["b2b", "developer tool", "editor"],
    tone: "loud, quick, rewarding",
    pace: 3,
    needs: { features: 1, proof: true },
    shots: { "The feature": "the hook: the feature and the screen", "Your name": "the product, loud", Deposit: "the action", Received: "the result" },
    slots: {
      name: { means: "name", say: "The product's name, set bold." },
      app: { means: "name", say: "The app's short name." },
      feature: { means: "feature", feature: 0, say: "The feature's name, lower case." },
      intro: { means: "kicker", say: "One word that introduces it (like “introducing”)." },
      action: { means: "action", say: "The main button's label." },
      received: { means: "proof", factual: true, say: "Two lines: what you got|how much more, only with a real figure; otherwise a benefit without numbers." },
      than: { means: "proof", say: "What it's compared with, no competitor named." },
      would: { means: "detail", say: "The rest of the comparison." },
      balances: { means: "ui", say: "Three amounts shown in the app, as the app would show them." },
    },
  }),
  C({
    film: "film-pop",
    theme: "product",
    idea: "One loud colour: a word with its line over shards, digits rolling into an amount, clouds, pills, cards counting up, the wordmark with a trail of faces.",
    arc: "teaser",
    fits: ["consumer app", "fintech", "payments", "social", "lifestyle", "mobile", "split"],
    avoid: ["developer tool", "b2b"],
    tone: "loud, friendly, bouncy",
    pace: 3,
    needs: { features: 2 },
    shots: { Hook: "a word and its line", Amount: "the figure", Sky: "what you skip", Mark: "three words in pills", Cards: "people using it", "End card": "the wordmark" },
    slots: {
      name: { means: "name", say: "The wordmark, lower case if the brand is." },
      hook: { means: "hook", say: "A word|a line: the thing it makes easy, then how easy." },
      amount: { means: "proof", say: "An amount shown in the app, as the app would show it." },
      share: { means: "ui", say: "A smaller amount, as the app shows it." },
      skip: { means: "benefit", say: "Two lines, each “skip the …”: what the product removes." },
      words: { means: "feature-list", say: "Three one-word qualities." },
      social: { means: "tagline", say: "What it is, in a short line." },
    },
  }),
  C({
    film: "reel-sketch",
    theme: "accent",
    refs: ["Tempo", "Opus", "Claude", "Spotify"],
    idea: "A vertical reel: a hand-drawn wireframe beside the finished screen, cut on every new sketch; a search typed in the rain, a list, a wall of covers, a word roller, a poster, back to the mark.",
    arc: "teaser",
    fits: ["consumer app", "music", "media", "discovery", "design", "mobile", "creative"],
    tone: "dreamy, made by hand, rhythmic",
    pace: 3,
    needs: { features: 2 },
    shots: { Sketch: "the hook: sketch to screen", "Your mark": "the brand", "Search in the rain": "the main use", Playlist: "what it gives you", Covers: "its world", Roller: "what you can do", Poster: "the line", "Back to the mark": "the brand and the call" },
    slots: {
      name: { means: "name", say: "The product's name." },
      made: { means: "ui", say: "“Made with …”: the tool the screens were made with (the product itself if it is one)." },
      query: { means: "example", say: "A search someone would type in this product; *words* take the accent." },
      playlist: { means: "example", say: "What that search gives back, as its title." },
      moods: { means: "feature-list", say: "Six one-word verbs or moods; the last is boxed and leads the poster." },
      poster: { means: "tagline", say: "A small italic word|the huge one." },
      line: { means: "tagline", say: "The end line, a few words." },
      cta: { means: "cta", say: "The call to action; *words* in the accent." },
    },
  }),
  C({
    film: "reel-desk",
    theme: "accent",
    refs: ["Claude", "Opus", "Anthropic"],
    idea: "A vertical reel shot like a phone filming a laptop in the dark: the screen plays the story and its light washes the keys; a prompt dived into, thinking, a word drum of edits, the product, a ring of fire, a typed line.",
    arc: "teaser",
    fits: ["ai", "creative", "agent", "assistant", "design", "video", "automation"],
    tone: "intimate, late-night, hot",
    pace: 2,
    needs: { features: 3 },
    shots: { Opening: "the caption: the hook", "The prompt": "the ask", "While it thinks": "it works", "Word drum": "what it can do", "The product": "together", "Ring of fire": "the big word", Sunset: "the line", "The sun": "the close" },
    slots: {
      caption: { means: "hook", say: "A caption that stops the scroll, lower case." },
      ask: { means: "kicker", say: "The heading over the prompt, casual." },
      prompt: { means: "example", say: "A realistic request to the product." },
      model: { means: "ui", say: "A model or mode name the product shows." },
      effort: { means: "ui", say: "A setting's value, one word." },
      edit: { means: "example", say: "A second, short request." },
      thinking: { means: "ui", say: "Four words for working (like Pondering)." },
      verbs: { means: "feature-list", say: "Nine one-word edits or actions it does." },
      together: { means: "tagline", say: "Three pieces of a sentence about making it together." },
      everything: { means: "promise", say: "One big word." },
      line: { means: "tagline", say: "The typed closing line." },
    },
  }),
]

/** A film's contract: one you approved, else the shipped one, else one the film maker drafted (a draft never overrides
    either). */
export const contractFor = (film: string, extra: Contract[] = []) => extra.find((c) => c.film === film && c.by === "you") ?? CONTRACTS.find((c) => c.film === film) ?? extra.find((c) => c.film === film)
