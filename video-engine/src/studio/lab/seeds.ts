// The template lab's starting scripts. None ship since round 26 (the templates are launch films, comp.ts); approved
// scripts from the lab join at run time (see the lab's server).
import type { TemplateScript } from "../script"

const found = import.meta.glob<TemplateScript>("./scripts/*.json", { eager: true, import: "default" })
export const SEEDS: TemplateScript[] = Object.values(found).sort((a, b) => a.id.localeCompare(b.id))
