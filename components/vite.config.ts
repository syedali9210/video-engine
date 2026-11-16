import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { library } from "./server/library";
import { site } from "./server/site";

// Phosphor's index re-exports all 3,000 icons in six weights: 17 MB of JavaScript the dev server parsed on every load.
// Each `import { A, B } from "@phosphor-icons/react"` becomes one import per icon from its own file; a name with no
// file of its own (a type, like IconProps) stays a type-only import, which compiles away.
const ICONS = "node_modules/@phosphor-icons/react/dist/csr/";
const isIcon = new Map<string, boolean>();
const phosphorPerIcon = (): Plugin => ({
  name: "phosphor-per-icon",
  enforce: "pre",
  transform(code, id) {
    if (id.includes("node_modules") || !/\.[jt]sx?$/.test(id.split("?")[0]) || !code.includes("@phosphor-icons/react\"")) return;
    return code.replace(/import\s*\{([^}]+)\}\s*from\s*"@phosphor-icons\/react";?/g, (_, names: string) => {
      const out: string[] = [];
      const types: string[] = [];
      for (const raw of names.split(",").map((x) => x.trim()).filter(Boolean)) {
        const spec = raw.replace(/^type\s+/, "");
        const name = spec.split(/\s+as\s+/)[0];
        if (!isIcon.has(name)) isIcon.set(name, existsSync(`${ICONS}${name}.es.js`));
        if (raw.startsWith("type ") || !isIcon.get(name)) types.push(spec);
        else out.push(`import { ${spec} } from "@phosphor-icons/react/dist/csr/${name}";`);
      }
      if (types.length) out.push(`import type { ${types.join(", ")} } from "@phosphor-icons/react";`);
      return out.join("\n");
    });
  },
});

// Two pages: the app, and the stage document every device iframe loads.
export default defineConfig({
  plugins: [phosphorPerIcon(), react(), tailwindcss(), library(), site()],
  // the icons come one file each (above), never as the whole set
  optimizeDeps: { exclude: ["@phosphor-icons/react"] },
  server: { port: 5181, watch: { ignored: ["**/.engine-data/**"] } },
  build: {
    rollupOptions: {
      input: { main: "index.html", stage: "stage.html" },
    },
  },
});
