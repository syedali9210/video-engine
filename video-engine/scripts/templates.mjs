// Checks every launch film template through the running dev server (server/templates.ts): what each shot shows (the
// slot map, saved with --write), the reference's words left hard-coded, words cut off or too small or faint, and how
// far each shot has drifted from its golden frame.
// Run: npm run dev, then npm run templates [-- --save | --write] [film-id …]
//   --save   keep this render as the golden frames      --write   save the slot map (src/studio/lib/shows.json)
const base = process.env.ENGINE_URL ?? "http://localhost:5180";
const args = process.argv.slice(2);
const verbose = args.includes("--all");
const golden = args.includes("--save") ? "save" : "compare";
const r = await fetch(`${base}/__templates/probe`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ only: args.filter((a) => !a.startsWith("--")), golden, write: args.includes("--write") }),
}).catch(() => null);
if (!r) {
  console.error(`templates: no dev server at ${base} (start it with npm run dev)`);
  process.exit(1);
}
const body = await r.json();
if (!r.ok) {
  console.error("templates:", body.error);
  process.exit(1);
}
let bad = 0;
for (const f of body.films) {
  const lines = [...f.problems.map((p) => `  ✗ ${p}`), ...f.errors.map((e) => `  ✗ didn't render: ${e}`)];
  for (const s of f.shots) {
    const out = [];
    if (s.leaks.length) out.push(`hard-coded words: ${s.leaks.join(", ")}`);
    if (s.standIn?.length && verbose) out.push(`stand-in screen's words (replaced by yours): ${s.standIn.slice(0, 8).join(", ")}`);
    if (s.clipped.length) out.push(`cut off: ${[...new Set(s.clipped.map((c) => c.key))].join(", ")}`);
    if (s.small.length) out.push(`small words: ${[...new Set(s.small.map((c) => `${c.key} ${c.px}px`))].join(", ")}`);
    if (s.contrast.length) out.push(`faint: ${s.contrast.map((c) => `“${c.text.slice(0, 20)}” ${c.ratio}:1`).slice(0, 3).join(", ")}`);
    if (s.golden && typeof s.golden === "object" && s.golden.changed > 1) out.push(`changed from golden: ${s.golden.changed}% of pixels`);
    if (s.golden === "missing") out.push("no golden frame yet (npm run templates -- --save)");
    lines.push(`  ${out.length ? "•" : "✓"} ${s.name} (${s.t}s) shows ${s.shows.join(", ") || "nothing of the product"}${out.length ? `\n      ${out.join("\n      ")}` : ""}`);
    bad += out.length ? 1 : 0;
  }
  console.log(`${f.name} (${f.id})\n${lines.join("\n")}`);
}
console.log(`\ntemplates: ${body.films.length} films, ${bad} shots with something to look at${golden === "save" ? "; golden frames saved" : ""}`);
