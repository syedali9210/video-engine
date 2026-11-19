// Composed field: the ground a directed film sits on (src/studio/field.ts lays it out, _film/field.tsx draws it). Its
// clock starts at `at`, where its scene sits in the film, so a field that carries on across a cut keeps drifting.
import { useMemo } from "react";
import { composedField, type Composition } from "../../studio/field";
import { FieldView } from "../_film/field";
import { Stage, useClock } from "../_film/kit";
import { params as defaults, type Params } from "./params";

export default function ComposedField({ p = defaults }: { p?: Params }) {
  const t = useClock(600);
  const field = useMemo(() => composedField(p.accent, { dark: !!p.dark, variant: p.variant as Composition }), [p.accent, p.dark, p.variant]);
  return (
    <Stage background={field.base}>
      <FieldView field={field} t={t + (Number(p.at) || 0)} grain={Number(p.grain) || 0} />
    </Stage>
  );
}
