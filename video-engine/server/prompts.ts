// The lab's newer asks of Gemini: the closer watch a replica is built from (every shot of a film in the engine's exact
// camera values) and ideas for films (a hook, a spine, a signature, beats in the inventor's grammar). The schemas the
// answers come in and the instructions that go with them; what's kept of an answer is checked in the app's own code
// (studio/replica.ts, studio/invent.ts).
import { CATEGORIES } from "../src/refs.ts"

/** The engine's own words, from its modules (loaded through Vite on the server: poses.ts, cuts.ts, theme.ts). */
export type Vocab = {
  angles: { id: string; name: string; pose: { yaw?: number; pitch?: number; elev?: number; zoom?: number } }[]
  moves: { id: string; hint: string }[]
  transitions: string[]
  harmonies: string[]
}

// a title's animation, as the teardown measures one
const ANIM_PROPS = {
  by: { type: "string", enum: ["all", "line", "word", "char"] },
  from: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, scale: { type: "number" }, rotate: { type: "number" }, flip: { type: "number" }, skew: { type: "number" }, blur: { type: "number" }, opacity: { type: "number" }, spacing: { type: "number" } } },
  dur: { type: "number" },
  stagger: { type: "number" },
  ease: { type: "string" },
  order: { type: "string", enum: ["first", "last", "middle", "random"] },
  mask: { type: "boolean" },
}

/* ---------------- replicas: the closer watch ---------------- */

export const preciseSchema = (V: Vocab) => ({
  type: "object",
  properties: {
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "number", description: "the shot's number in the list, from 0" },
          subject: { type: "string", enum: ["device", "screen", "title", "other"], description: "device: a phone, tablet or laptop on screen; screen: the interface filling the frame; title: only words (and a ground); other: what the engine can't draw (people, a place, a product that isn't a device)" },
          device: { type: "string", enum: ["iphone", "ipad", "macbook"] },
          angle: { type: "string", enum: V.angles.map((a) => a.id) },
          zoom: { type: "number", description: "1: the whole device fills the frame with a margin; 2 to 3: a close detail; 0.6: small in the frame" },
          yaw: { type: "number", description: "degrees turned, on top of the angle's own" },
          elev: { type: "number", description: "degrees the camera sits higher than the angle's own" },
          roll: { type: "number", description: "degrees the device is rolled in the frame" },
          pitch: { type: "number", description: "degrees the device is tipped back (negative) or forward" },
          rise: { type: "number", description: "which part fills a close shot: -0.7 the top of the device, 0 its middle, 0.7 its bottom" },
          pan: { type: "number", description: "-0.5 its left edge, 0.5 its right edge" },
          toZoom: { type: "number", description: "where a glide ends, in the same units (leave out what doesn't change)" },
          toYaw: { type: "number" },
          toElev: { type: "number" },
          toRoll: { type: "number" },
          toRise: { type: "number" },
          toPan: { type: "number" },
          move: { type: "string", enum: V.moves.filter((m) => m.id !== "framings").map((m) => m.id), description: "one of the engine's named moves, when the camera does that rather than glide between two framings" },
          ease: { type: "string", description: "the glide's curve as cubic-bezier(x1, y1, x2, y2); an even glide is cubic-bezier(0, 0, 1, 1)" },
          cut: { type: "string", enum: V.transitions, description: "how it comes in from the shot before" },
          ground: { type: "string", description: "the background's colour, hex" },
          dof: { type: "number", description: "how soft what's out of focus is, 0 (all sharp) to 1" },
          titles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                role: { type: "string", enum: ["hook", "kicker", "name", "feature", "tagline", "cta", "label"] },
                font: { type: "string", enum: ["display", "text", "mono"] },
                weight: { type: "number" },
                size: { type: "number", description: "% of the frame's width" },
                color: { type: "string" },
                align: { type: "string", enum: ["left", "center", "right"] },
                x: { type: "number", description: "the title's centre, fraction of the frame's width" },
                y: { type: "number", description: "its centre, fraction of the frame's height" },
                w: { type: "number", description: "its width, fraction of the frame's width" },
                ...ANIM_PROPS,
              },
              required: ["text", "role", "size", "x", "y", "w"],
            },
          },
        },
        required: ["i", "subject", "angle", "zoom", "cut"],
      },
    },
  },
  required: ["shots"],
})

const angleWords = (a: Vocab["angles"][number]) => [a.pose.yaw && `turned ${a.pose.yaw} deg`, a.pose.pitch && `tipped ${a.pose.pitch} deg`, a.pose.elev && `camera ${a.pose.elev} deg up`, a.pose.zoom && `zoom ${a.pose.zoom}`].filter(Boolean).join(", ")

export const preciseSystem = (V: Vocab) =>
  [
    "You measure films for an animation engine that will replicate them shot for shot, so be exact: the engine plays your numbers back.",
    "You get the film and its shot list from a first watch (cut points, and what each shot shows). For every shot in the list, in order, give:",
    "- what it shows: a device, the interface filling the frame, only words, or something else (people, a place);",
    "- the camera in the engine's own terms: the nearest of its angles, then the zoom, turn, height, roll, tip and which part of the device fills a close shot; where a glide ends and on what curve, or the engine's named move when the camera does that instead;",
    "- how it comes in from the shot before, as one of the engine's transitions: cut (hard), whip (a fast swing with motion blur), through (the camera pushing on through the frame into the next), iris (opening out of a circle), wipe (a line sweeping across), flash (a flash of colour round a cut), push (one shot sliding the other out), zoom, blur, dissolve, fade (a dip to a flat colour);",
    "- the ground's colour, and how soft the focus is;",
    "- every title on screen: its words, role, face, weight, size, colour, place and animation (what moves on its own, from where, how long one piece takes, the gap between pieces, the curve).",
    `The angles: ${V.angles.map((a) => `${a.id} (${a.name}${angleWords(a) ? `: ${angleWords(a)}` : ""})`).join("; ")}.`,
    `The named moves: ${V.moves.filter((m) => m.id !== "framings")
      .map((m) => `${m.id} (${m.hint})`)
      .join(" ")}`,
    "Describe only what you see. Where the film shows something the engine can't draw, still frame it as if the product's device were there.",
  ].join("\n")

/* ---------------- ideas for films ---------------- */

export const ideasSchema = (beats: string[], V: Vocab) => ({
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "the idea in a few words" },
          logline: { type: "string", description: "the film in two sentences: how it opens, what carries it, how it ends" },
          category: { type: "string", enum: CATEGORIES.film.map((c) => c.id) },
          hook: { type: "string", description: "what grabs in the first two seconds, and how" },
          signature: { type: "string", description: "the one visual idea that carries the whole film" },
          carrier: { type: "string", enum: ["cut", "whip", "through", "iris", "wipe"], description: "the transition its cuts lean on" },
          harmony: { type: "string", enum: V.harmonies },
          beats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                beat: { type: "string", description: `one of: ${beats.join(", ")}; or card:{hook|tagline|feature1|feature2|feature3}:letters|words|sweep|mask|settle; or feature:{feature1|feature2|feature3}; or swing:<angle>:<a name for the shot>` },
                intent: { type: "string", description: "what this beat does for the film" },
              },
              required: ["beat", "intent"],
            },
          },
          why: { type: "array", items: { type: "string" } },
        },
        required: ["title", "logline", "category", "hook", "signature", "carrier", "harmony", "beats", "why"],
      },
    },
  },
  required: ["ideas"],
})

export const ideasSystem = (guidelines: string) =>
  [
    "You come up with ideas for product launch films for an animation engine: the real interface on 3D devices, camera moves, depth of field, rare small type.",
    "An idea is a film before it has shots: a hook that grabs in the first two seconds, a spine (the structure), one signature visual idea that carries it, the transition its cuts lean on, a look, and its beats in the engine's grammar, each with its intent.",
    "Every idea is clearly different from the others and from the films the engine already has. Draw on the films the lab studied, and cite them.",
    "Every cut has a carrier: never plan a dip to a flat colour. Titles use the placeholders; never invent product facts. Never propose what the admin turned down, in any form.",
    "",
    "<guidelines>",
    guidelines,
    "</guidelines>",
  ].join("\n")
