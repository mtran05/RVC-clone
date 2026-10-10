import raw from "../../../shared/opts-spec.json";
import type { InferenceOpts } from "./bridge";

// The shared spec is the single description of every option: its CLI flag, its
// default, its UI label and help text, and the step/min/max its control should
// snap to. desktop/args.js and inference/realtime.py read the same file, so
// adding an option means editing only that one place.

export interface OptionSpec {
  flag: string;
  kind: "number" | "string" | "bool" | "path" | "enum";
  integer?: boolean;
  default: string | number | boolean;
  choices?: string[];
  step?: number;
  min?: number;
  max?: number;
  section: string;
  label: string;
  tip: string;
  placeholder?: string;
}

export const OPTION_SPEC = raw.options as unknown as Record<string, OptionSpec>;

export type OptKey = keyof InferenceOpts;

type NumberKeys<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never }[keyof T];
export type NumberOptKey = NumberKeys<InferenceOpts>;

export function specOf(key: string): OptionSpec {
  const spec = OPTION_SPEC[key];
  if (!spec) throw new Error(`No option spec for "${key}"`);
  return spec;
}

// The subset of an option that a numeric control needs.
export function boundsOf(key: string): { step?: number; min?: number; max?: number } {
  const { step, min, max } = specOf(key);
  return { step, min, max };
}

// The pair a slider needs. Throws rather than guessing, because a missing bound
// would silently produce a control with the wrong scale.
export function rangeOf(key: string): { min: number; max: number } {
  const { min, max } = specOf(key);
  if (min == null || max == null) throw new Error(`Option "${key}" has no min/max range`);
  return { min, max };
}

// Starting values come straight from the spec, so the renderer can never
// disagree with what inference/realtime.py falls back to.
export const defaultOpts: InferenceOpts = Object.fromEntries(Object.entries(OPTION_SPEC).map(([key, spec]) => [key, spec.default])) as unknown as InferenceOpts;

export const numberKeys: NumberOptKey[] = Object.keys(OPTION_SPEC).filter((key) => OPTION_SPEC[key].kind === "number") as NumberOptKey[];

// A section of the "More settings" modal. Each field renders the control its
// `kind` calls for, so adding a knob to the spec is enough to place it.
export interface TuneSection {
  title: string;
  fields: OptKey[];
}

export const TUNING: TuneSection[] = [
  { title: "Timing", fields: ["blockTime", "crossfadeTime", "extraTime"] },
  { title: "Pitch", fields: ["f0Min", "f0Max", "rmvpeThreshold", "fcpeThreshold"] },
  { title: "Index", fields: ["indexNeighbors"] },
  { title: "Gain", fields: ["inputGain", "outputGain", "noClip"] },
  {
    title: "Device",
    fields: ["sampleRate", "inputChannels", "outputChannels", "latency", "hostApi", "wasapiExclusive", "wasapiAutoConvert"],
  },
];
