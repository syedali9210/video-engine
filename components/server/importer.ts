// Import an animation from its code: drop a component file (React .tsx/.jsx/.ts/.js, with its CSS and helpers) or a
// page (.html), and it becomes a library animation whose values are editable. Nothing guesses with a model: the
// TypeScript compiler reads the code, and the values worth tuning are the ones in the places people tune them —
// colours anywhere, words on screen, timings and springs in motion props, sizes in style props, numbers in named
// constants. Each becomes a param; the code is rewritten to read it, and the engine's controls drive it.
//   POST /__studio/import/read  { files: [{ name, code }] }                     -> what it found (writes nothing)
//   POST /__studio/import/add   { files, name, category, keep: string[], labels } -> { id }
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

export type Found = {
  key: string
  label: string
  type: "color" | "text" | "number" | "easing"
  group: "Colours" | "Words" | "Motion" | "Size" | "Values"
  value: string | number
  min?: number
  max?: number
  step?: number
  unit?: string
  /** read once when the code first runs (it sits outside any function), so changing it restarts the animation */
  setup: boolean
  /** ticked to begin with: colours, words, motion and named constants are what people tune; sizes are there to add */
  suggested: boolean
  /** a JSX attribute's string (title="Hi"): it goes back in braces */
  brace?: boolean
  /** the line it came from, to show what it is */
  line: string
  /** where in the main file: replaced by the param */
  at: [number, number]
  /** how the param goes back in: as a value, inside a string, as JSX text */
  put: "expr" | "jsx" | "css-ms" | "css-s" | "px" | "bezier-array"
}
export type Read = {
  kind: "react" | "html"
  main: string
  name: string
  found: Found[]
  /** packages it imports that aren't installed (and how a known one was mapped) */
  missing: string[]
  mapped: [string, string][]
  /** relative imports that weren't among the dropped files */
  absent: string[]
  problem?: string
}

const COLOR = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)]*\))$/i
const BEZIER = /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/i
const TIME = /^(duration|delay|stagger|staggerChildren|delayChildren|repeatDelay|interval|timeout|ms|speed|period|lifeMs|enterMs|exitMs)$/i
const SPRING = /^(stiffness|damping|mass|bounce|velocity|restDelta|restSpeed|visualDuration)$/i
const SIZE = /^(width|height|size|radius|borderRadius|gap|padding|margin|x|y|scale|rotate|rotateX|rotateY|opacity|blur|fontSize|fontWeight|letterSpacing|lineHeight|strokeWidth|top|left|right|bottom|spread|count|amount|intensity|depth|offset|distance|thickness|zoom|perspective)$/i
const WORDS = /^(title|label|text|caption|heading|subtitle|description|placeholder|cta|button|message|name|alt|aria-label|tooltip|hint|badge|tag)$/i
const MAP: Record<string, string> = { "framer-motion": "motion/react" }
const INSTALLED = (root: string, pkg: string) => existsSync(join(root, "node_modules", pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0], "package.json"))

const words = (raw: string) =>
  (/^[A-Z0-9_]+$/.test(raw) ? raw.toLowerCase() : raw)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
const nice = (v: number) => {
  const m = 10 ** Math.floor(Math.log10(Math.max(1e-9, Math.abs(v))))
  return Math.ceil(Math.abs(v) / m) * m
}
/** A slider's range around a value, by what kind of value it is. */
function range(name: string, v: number): { min: number; max: number; step: number; unit?: string } {
  const n = name.toLowerCase()
  if (/opacity|bounce|amount|intensity/.test(n) && v <= 1) return { min: 0, max: 1, step: 0.01 }
  if (/scale|zoom/.test(n)) return { min: 0, max: Math.max(2, nice(v * 2)), step: 0.01 }
  if (/rotate/.test(n)) return { min: -180, max: 180, step: 1, unit: "°" }
  if (TIME.test(name) || /(Ms|_MS)$/.test(name) || /duration|delay/.test(n)) return v > 20 ? { min: 0, max: Math.max(1000, nice(v * 3)), step: 10, unit: "ms" } : { min: 0, max: Math.max(2, nice(v * 3)), step: 0.01, unit: "s" }
  if (/stiffness/.test(n)) return { min: 1, max: Math.max(500, nice(v * 3)), step: 1 }
  if (/damping|mass/.test(n)) return { min: 0, max: Math.max(50, nice(v * 3)), step: 0.1 }
  const max = v === 0 ? 100 : nice(Math.abs(v) * 3)
  return { min: v < 0 ? -max : 0, max, step: Math.abs(v) < 2 && !Number.isInteger(v) ? 0.01 : 1 }
}
const hex = (c: string) => {
  // rgb(…) to #rrggbb, so it gets a colour well; anything else stays as written
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*1(?:\.0+)?\s*)?\)$/i.exec(c)
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, "0")).join("")}`
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join("")}`.toLowerCase()
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase()
  return c
}

/* ---------------- React ---------------- */

function readReact(file: { name: string; code: string }, others: string[], root: string): Read {
  const code = file.code
  const sf = ts.createSourceFile(file.name, code, ts.ScriptTarget.Latest, true, /x$/i.test(file.name) ? ts.ScriptKind.TSX : /\.tsx?$/i.test(file.name) ? ts.ScriptKind.TS : ts.ScriptKind.JSX)
  const found: Found[] = []
  const taken = new Map<string, number>()
  const keyFor = (raw: string) => {
    const base = /^[A-Z0-9_]+$/.test(raw) ? raw.toLowerCase() : raw
    const k = base.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^[^a-zA-Z]+/, "").replace(/^./, (c) => c.toLowerCase()) || "value"
    const n = (taken.get(k) ?? 0) + 1
    taken.set(k, n)
    return n > 1 ? `${k}${n}` : k
  }
  const lineOf = (pos: number) => {
    const s = code.lastIndexOf("\n", pos) + 1
    const e = code.indexOf("\n", pos)
    return code.slice(s, e < 0 ? undefined : e).trim().slice(0, 140)
  }
  const inFunction = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true
    return false
  }
  /** the name a value sits under: its property, its JSX attribute, or the constant it's assigned to */
  const nameOf = (n: ts.Node): string => {
    const p = n.parent
    if (!p) return ""
    if (ts.isPropertyAssignment(p) && p.initializer === n) return p.name.getText(sf).replace(/['"]/g, "")
    if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return p.parent.name.getText(sf)
    if (ts.isJsxAttribute(p)) return p.name.getText(sf)
    if (ts.isVariableDeclaration(p) && p.initializer === n) return p.name.getText(sf)
    if ((ts.isBindingElement(p) || ts.isParameter(p)) && p.initializer === n) return p.name.getText(sf)
    if (ts.isArrayLiteralExpression(p) || ts.isPrefixUnaryExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) return nameOf(p)
    return ""
  }
  const skip = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p) || ts.isEnumDeclaration(p)) return true
      if (ts.isPropertyAssignment(p) && p.name === n) return true
      if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true
      if (ts.isCallExpression(p) && /^(require|import|addEventListener|removeEventListener|querySelector|querySelectorAll|getElementById|getContext|createElement|matchMedia)$/.test(p.expression.getText(sf).split(".").pop() ?? "")) return true
      if (ts.isJsxAttribute(p) && /^(className|class|key|id|href|src|role|type|htmlFor|ref|d|viewBox|xmlns|fill-rule|clipRule|fillRule|points|transform)$/.test(p.name.getText(sf))) return true
      if (ts.isPropertyAssignment(p) && /^(fontFamily|display|position|cursor|overflow|whiteSpace|textAlign|alignItems|justifyContent|flexDirection|pointerEvents|type)$/.test(p.name.getText(sf))) return true
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(sf))) return true
      if (ts.isCaseClause(p) || ts.isSwitchStatement(p)) return true
    }
    return false
  }
  /** the element a value styles or moves, by its tag ("button", "h2"), for telling two "Font size"s apart */
  const tagOf = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent)
      if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) return p.tagName.getText(sf).split(".").pop()!
    return ""
  }
  const add = (n: ts.Node, f: Omit<Found, "key" | "line" | "at" | "setup" | "suggested"> & { key?: string }, at?: [number, number]) => {
    if (found.length >= 64) return
    const tag = f.group === "Words" ? "" : tagOf(n)
    const constant = ts.isVariableDeclaration(n.parent)
    found.push({
      ...f,
      label: tag && !constant ? `${f.label}, ${tag}` : f.label,
      key: keyFor(f.key ?? f.label),
      line: lineOf(n.getStart(sf)),
      at: at ?? [n.getStart(sf), n.getEnd()],
      setup: !inFunction(n),
      suggested: f.group !== "Size" || constant,
      brace: !!n.parent && ts.isJsxAttribute(n.parent),
    })
  }
  /** a string that ends up as a JSX child, through a ternary, && / || / ?? or parentheses */
  const shown = (n: ts.Node): boolean => {
    let p = n.parent
    while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || (ts.isBinaryExpression(p) && /^(&&|\|\||\?\?)$/.test(p.operatorToken.getText(sf))))) p = p.parent
    return !!p && ts.isJsxExpression(p) && !!p.parent && !ts.isJsxAttribute(p.parent)
  }
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!skip(n)) {
        const s = n.text
        const name = nameOf(n)
        if (COLOR.test(s.trim())) add(n, { label: name ? words(name) : `Colour ${s}`, type: "color", group: "Colours", value: hex(s.trim()), put: "expr" })
        else if (BEZIER.test(s.trim())) add(n, { label: name ? words(name) : "Easing", type: "easing", group: "Motion", value: s.trim(), put: "expr" })
        else if (/^-?[\d.]+(ms|s)$/.test(s.trim()) && name) {
          const ms = s.trim().endsWith("ms")
          const v = parseFloat(s)
          add(n, { label: words(name), type: "number", group: "Motion", value: v, ...range(ms ? `${name}Ms` : name, ms ? Math.max(v, 21) : v), unit: ms ? "ms" : "s", put: ms ? "css-ms" : "css-s" })
        } else if (/^-?[\d.]+px$/.test(s.trim()) && name && SIZE.test(name)) {
          const v = parseFloat(s)
          add(n, { label: words(name), type: "number", group: "Size", value: v, ...range(name, v), unit: "px", put: "px" })
        } else if (s.trim().length >= 2 && s.length <= 160 && (WORDS.test(name) || shown(n)) && /[a-z]/i.test(s) && !/^[a-z]+(-[a-z]+)*$/.test(s))
          add(n, { label: name ? words(name) : `“${s.slice(0, 24)}${s.length > 24 ? "…" : ""}”`, key: name || s.split(/\s+/).slice(0, 3).join(" "), type: "text", group: "Words", value: s, put: "expr" })
      }
    } else if (ts.isJsxText(n)) {
      const s = n.getText(sf)
      const t = s.trim()
      if (t && /[a-z]/i.test(t) && t.length <= 200) {
        const start = n.getStart(sf) + s.indexOf(t)
        add(n, { label: `“${t.slice(0, 28)}${t.length > 28 ? "…" : ""}”`, key: t.split(/\s+/).slice(0, 3).join(" "), type: "text", group: "Words", value: t, put: "jsx" }, [start, start + t.length])
      }
    } else if (ts.isNumericLiteral(n) && !skip(n)) {
      const name = nameOf(n)
      const neg = ts.isPrefixUnaryExpression(n.parent) && n.parent.operator === ts.SyntaxKind.MinusToken
      const v = Number(n.text) * (neg ? -1 : 1)
      const at: [number, number] = neg ? [n.parent.getStart(sf), n.getEnd()] : [n.getStart(sf), n.getEnd()]
      const arr = n.parent && ts.isArrayLiteralExpression(neg ? n.parent.parent : n.parent) ? ((neg ? n.parent.parent : n.parent) as ts.ArrayLiteralExpression) : null
      // an easing written as four numbers: [0.23, 1, 0.32, 1]
      if (arr && arr.elements.length === 4 && /ease|easing/i.test(nameOf(arr)) && arr.elements[0] === (neg ? n.parent : n)) {
        const nums = arr.elements.map((e) => Number(e.getText(sf)))
        if (nums.every(Number.isFinite)) add(arr, { label: words(nameOf(arr)), type: "easing", group: "Motion", value: `cubic-bezier(${nums.join(", ")})`, put: "bezier-array" }, [arr.getStart(sf), arr.getEnd()])
      } else if (!arr || !/ease|easing/i.test(nameOf(arr))) {
        const ok = TIME.test(name) || SPRING.test(name) || SIZE.test(name) || (name && /^[A-Z][A-Z0-9_]+$/.test(name)) || (name && ts.isVariableDeclaration(arr ? arr.parent : n.parent) && /(ms|duration|delay|speed|size|count|gap|radius|scale|stiffness|damping|width|height)$/i.test(name))
        if (ok && !(v === 0 && !TIME.test(name)))
          add(n, { label: words(name), type: "number", group: TIME.test(name) || SPRING.test(name) ? "Motion" : SIZE.test(name) ? "Size" : "Values", value: v, ...range(name, v), put: "expr" }, at)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)

  const missing: string[] = []
  const mapped: [string, string][] = []
  const absent: string[] = []
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const spec = st.moduleSpecifier.text
    if (spec.startsWith(".")) {
      const base = spec.replace(/^\.\//, "").split("/").pop()!
      if (!others.some((o) => o === base || o.replace(/\.[^.]+$/, "") === base)) absent.push(spec)
    } else if (MAP[spec]) mapped.push([spec, MAP[spec]])
    else if (!INSTALLED(root, spec)) missing.push(spec)
  }
  const def = sf.statements.find((s) => (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) as ts.FunctionDeclaration | undefined
  const hasDefault = !!def || sf.statements.some((s) => ts.isExportAssignment(s))
  return {
    kind: "react",
    main: file.name,
    name: words(def?.name?.text ?? file.name.replace(/\.[^.]+$/, "")),
    found: found.sort((a, b) => a.at[0] - b.at[0]),
    missing,
    mapped,
    absent,
    problem: hasDefault ? undefined : "It has no default export: the engine needs the component as the file's default export (export default function …).",
  }
}

/** The component file rewritten to read its values from the engine: the module runs inside `make()`, so values read at
    setup come back when one of those changes, and the rest are read live from P as the component renders. */
function writeReact(r: Read, code: string, keep: Set<string>) {
  const sf = ts.createSourceFile(r.main, code, ts.ScriptTarget.Latest, true, /x$/i.test(r.main) ? ts.ScriptKind.TSX : /\.tsx?$/i.test(r.main) ? ts.ScriptKind.TS : ts.ScriptKind.JSX)
  type Edit = [number, number, string]
  const edits: Edit[] = []
  for (const f of r.found) {
    if (!keep.has(f.key)) continue
    const P = `P[${JSON.stringify(f.key)}]`
    const piece = f.put === "jsx" ? `{${P}}` : f.put === "css-ms" ? `\`\${${P}}ms\`` : f.put === "css-s" ? `\`\${${P}}s\`` : f.put === "px" ? `\`\${${P}}px\`` : f.put === "bezier-array" ? `__bezier(${P})` : P
    // a string inside JSX attributes needs braces: title="Hi" -> title={P.title}
    edits.push([f.at[0], f.at[1], f.brace ? `{${piece}}` : piece])
  }
  const imports: string[] = []
  let defName = ""
  for (const st of sf.statements) {
    const s = st.getStart(sf)
    const e = st.getEnd()
    if (ts.isImportDeclaration(st)) {
      let text = code.slice(s, e)
      const spec = (st.moduleSpecifier as ts.StringLiteral).text
      if (MAP[spec]) text = text.replace(spec, MAP[spec])
      imports.push(text)
      edits.push([s, e, ""])
    } else if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && /^use (client|server)$/.test(st.expression.text)) edits.push([s, e, ""])
    else if (ts.isExportAssignment(st)) edits.push([s, st.expression.getStart(sf), "const __default = "])
    else if (ts.isExportDeclaration(st)) edits.push([s, e, ""])
    else {
      const mods = (st as ts.HasModifiers).modifiers
      const exp = mods?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      const dft = mods?.find((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      if (exp) edits.push([exp.getStart(sf), exp.getEnd() + 1, ""])
      if (dft) {
        edits.push([dft.getStart(sf), dft.getEnd() + 1, ""])
        const named = (st as ts.FunctionDeclaration).name?.text
        if (named) defName = named
        else edits.push([st.getStart(sf), st.getStart(sf), ""]) // anonymous default function: named below
      }
    }
  }
  // anonymous `export default function () {}`: give it a name
  let body = code
  for (const [s, e, t] of edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])) body = body.slice(0, s) + t + body.slice(e)
  if (!defName && !/const __default = /.test(body)) body = body.replace(/(^|\n)(\s*)function\s*\(/, "$1$2function __Default(")
  const ret = defName || (/const __default = /.test(body) ? "__default" : "__Default")
  const setup = r.found.filter((f) => keep.has(f.key) && f.setup).map((f) => f.key)
  return `// @ts-nocheck — imported code keeps its own typing; the engine's type check skips it
// Imported into the Animation Engine from ${r.main}. Its tunable values are params: the code reads them from P.
// (The original module runs inside make(), so values it reads when it first runs come back when one of them changes.)
import { useMemo } from "react";
${imports.join("\n")}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: Record<string, any> = {};
const __bezier = (s: string) => (String(s).match(/-?[\\d.]+/g) ?? []).map(Number) as [number, number, number, number];
void __bezier;

function make() {
${body}
  return ${ret};
}

const SETUP = ${JSON.stringify(setup)};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Imported({ p }: { p: Record<string, any> }) {
  Object.assign(P, p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const C = useMemo(make, [SETUP.map((k) => JSON.stringify(p[k])).join("|")]);
  return <C />;
}
`
}

/* ---------------- HTML ---------------- */

function readHtml(file: { name: string; code: string }): Read {
  const code = file.code
  const found: Found[] = []
  const taken = new Set<string>()
  const key = (k: string) => {
    let x = k.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toLowerCase()) || "value"
    for (let i = 2; taken.has(x); i++) x = `${x.replace(/\d+$/, "")}${i}`
    taken.add(x)
    return x
  }
  const lineOf = (pos: number) => {
    const s = code.lastIndexOf("\n", pos) + 1
    const e = code.indexOf("\n", pos)
    return code.slice(s, e < 0 ? undefined : e).trim().slice(0, 140)
  }
  for (const m of code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1]
    const off = m.index! + m[0].indexOf(css)
    // CSS custom properties first: they're already the page's own knobs
    for (const v of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      const val = v[2].trim()
      const at: [number, number] = [off + v.index! + v[0].lastIndexOf(v[2]), off + v.index! + v[0].lastIndexOf(v[2]) + v[2].length]
      const name = words(v[1].slice(2))
      if (COLOR.test(val)) found.push({ key: key(v[1]), label: name, type: "color", group: "Colours", value: hex(val), setup: false, suggested: true, line: lineOf(at[0]), at, put: "expr" })
      else if (/^-?[\d.]+(ms|s|px)?$/.test(val)) {
        const n = parseFloat(val)
        const unit = val.replace(/^-?[\d.]+/, "")
        found.push({ key: key(v[1]), label: name, type: "number", group: unit === "px" ? "Size" : unit ? "Motion" : "Values", value: n, ...range(name, n), unit: unit || undefined, setup: false, suggested: true, line: lineOf(at[0]), at, put: "expr" })
      } else if (BEZIER.test(val)) found.push({ key: key(v[1]), label: name, type: "easing", group: "Motion", value: val, setup: false, suggested: true, line: lineOf(at[0]), at, put: "expr" })
    }
    // then every distinct colour written straight into a rule
    const seen = new Set<string>()
    for (const c of css.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\([^)]*\)/gi)) {
      const before = css.slice(Math.max(0, c.index! - 60), c.index!)
      if (/--[\w-]+\s*:\s*$/.test(before) || seen.has(c[0].toLowerCase()) || seen.size >= 16) continue
      seen.add(c[0].toLowerCase())
      const at: [number, number] = [off + c.index!, off + c.index! + c[0].length]
      found.push({ key: key(`colour ${hex(c[0]).replace("#", "")}`), label: `Colour ${hex(c[0])}`, type: "color", group: "Colours", value: hex(c[0]), setup: false, suggested: true, line: lineOf(at[0]), at, put: "expr" })
    }
  }
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(code)?.[1].trim()
  return { kind: "html", main: file.name, name: title || words(file.name.replace(/\.[^.]+$/, "")), found, missing: [], mapped: [], absent: [] }
}

/** The page with its values as CSS variables the engine sets: every found value becomes var(--ae-key), defined on :root
    from the params, and the bridge goes in first. A colour written in many rules changes everywhere at once. */
function writeHtml(r: Read, code: string, keep: Set<string>) {
  const kept = r.found.filter((f) => keep.has(f.key))
  const ruled = kept.filter((x) => x.label.startsWith("Colour "))
  // custom properties are replaced where they're defined
  let out = code
  for (const f of kept.filter((x) => !ruled.includes(x)).sort((a, b) => b.at[0] - a.at[0])) out = out.slice(0, f.at[0]) + `var(--ae-${f.key})` + out.slice(f.at[1])
  // a colour written straight into rules stands for every place it's written, in the stylesheets only (and whole: #fff
  // isn't the start of #ffffff)
  out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a: string, css: string, b: string) => {
    for (const f of ruled) {
      const raw = code.slice(f.at[0], f.at[1]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      css = css.replace(new RegExp(`${raw}(?![0-9a-f])`, "gi"), `var(--ae-${f.key})`)
    }
    return a + css + b
  })
  const unit = (f: Found) => (f.type === "number" && f.unit ? f.unit : "")
  const params = Object.fromEntries(kept.map((f) => [f.key, f.value]))
  const script = `<script src="/engine-bridge.js"></script>
<script>
/* @engine:params */
const params = ${JSON.stringify(params, null, 2)};
/* @engine:end */
const UNITS = ${JSON.stringify(Object.fromEntries(kept.map((f) => [f.key, unit(f)])))};
const applyParams = () => { for (const [k, v] of Object.entries(params)) document.documentElement.style.setProperty("--ae-" + k, v + (UNITS[k] || "")); };
applyParams();
window.engine?.onParams((v) => { Object.assign(params, v); applyParams(); });
</script>`
  return /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => `${m}\n${script}`) : `${script}\n${out}`
}

/* ---------------- both ---------------- */

export type Dropped = { name: string; code: string }

export function readImport(files: Dropped[], root: string): Read {
  const main = files.find((f) => /\.(tsx|jsx)$/i.test(f.name)) ?? files.find((f) => /\.html?$/i.test(f.name)) ?? files.find((f) => /\.(ts|js|mjs)$/i.test(f.name))
  if (!main) return { kind: "react", main: "", name: "", found: [], missing: [], mapped: [], absent: [], problem: "Drop a component (.tsx, .jsx, .js) or a page (.html)." }
  return /\.html?$/i.test(main.name)
    ? readHtml(main)
    : readReact(
        main,
        files.filter((f) => f !== main).map((f) => f.name),
        root,
      )
}

const CATS = ["Shaders & GPU", "Characters", "Chat & AI", "Cards & Reveals", "Navigation", "Celebration", "UI Patterns"]

export function addImport(body: { files: Dropped[]; name: string; category: string; keep: string[]; labels?: Record<string, string> }, root: string) {
  const r = readImport(body.files, root)
  if (r.problem) throw new Error(r.problem)
  const id = (body.name || r.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "imported"
  let slug = id
  for (let i = 2; existsSync(join(root, "src/animations", slug)); i++) slug = `${id}-${i}`
  const keep = new Set(body.keep)
  const main = body.files.find((f) => f.name === r.main)!
  const kept = r.found.filter((f) => keep.has(f.key))
  const label = (f: Found) => body.labels?.[f.key]?.trim() || f.label
  const spec = (f: Found) => {
    const base = `label: ${JSON.stringify(label(f))}, group: ${JSON.stringify(f.group)}${f.setup ? ", reload: true" : ""}`
    if (f.type === "number") return `{ type: "number", ${base}, min: ${f.min}, max: ${f.max}, step: ${f.step}${f.unit ? `, unit: ${JSON.stringify(f.unit)}` : ""} }`
    return `{ type: ${JSON.stringify(f.type)}, ${base} }`
  }
  const category = CATS.includes(body.category) ? body.category : "UI Patterns"
  const name = body.name || r.name
  const dir = join(root, "src/animations", slug)
  mkdirSync(dir, { recursive: true })
  const meta = (extra: string) => `import type { AnimMeta } from "../../registry";

// Imported from ${r.main}: its values were found in the code and made params (see ${r.kind === "html" ? `public/anim/${slug}/index.html` : "index.tsx"}).
export default {
  name: ${JSON.stringify(name)},
  category: ${JSON.stringify(category)},
  tech: ${JSON.stringify(r.kind === "html" ? ["HTML", "CSS"] : ["React"])},
  blurb: ${JSON.stringify(`Imported from ${r.main}, with ${kept.length} of its values to tune.`)},
  source: ${JSON.stringify(`Imported: ${r.main}`)},
  behavior: { trigger: "ambient", frequency: "occasional" },
  reducedMotion: "none",
  reducedMotionNote: "Imported as it was written: check what it does under reduced motion.",
${extra}  params: {
${kept.map((f) => `    ${JSON.stringify(f.key)}: ${JSON.stringify(f.value)},`).join("\n")}
  },
  schema: {
${kept.map((f) => `    ${JSON.stringify(f.key)}: ${spec(f)},`).join("\n")}
  },
} satisfies Omit<AnimMeta, "id">;
`
  if (r.kind === "html") {
    const pub = join(root, "public/anim", slug)
    mkdirSync(pub, { recursive: true })
    writeFileSync(join(pub, "index.html"), writeHtml(r, main.code, keep))
    for (const f of body.files) if (f !== main && /\.(css|js|mjs|json|svg)$/i.test(f.name)) writeFileSync(join(pub, f.name.split(/[\\/]/).pop()!), f.code)
    writeFileSync(join(dir, "meta.ts"), meta(`  html: true,\n  layout: "fill",\n`))
  } else {
    writeFileSync(join(dir, "index.tsx"), writeReact(r, main.code, keep))
    for (const f of body.files) if (f !== main) writeFileSync(join(dir, f.name.split(/[\\/]/).pop()!), f.code)
    writeFileSync(join(dir, "meta.ts"), meta(`  load: () => import("./index"),\n`))
  }
  return { id: slug }
}
