import { InferenceOpts } from "./bridge";

// Starting values mirror inference/realtime.py's argument defaults.
export const defaultOpts: InferenceOpts = {
  model: "",
  index: "",
  indexRate: 0.75,
  key: 0,
  formant: 0,
  f0: "rmvpe",
  sampleRate: 0,
  blockTime: 0.25,
  crossfadeTime: 0.05,
  extraTime: 2.5,
  rmsMixRate: 0,
  inputDevice: "",
  outputDevice: "",
  hostApi: "",
  inputChannels: 1,
  outputChannels: 2,
  latency: "",
  inputGain: 1,
  outputGain: 1,
  noClip: false,
  wasapiExclusive: false,
  wasapiAutoConvert: false,
  f0Min: 50,
  f0Max: 1100,
  rmvpeThreshold: 0.03,
  fcpeThreshold: 0.006,
  indexNeighbors: 8,
};

// Pitch is capped at two octaves (−24..+24 semitones), matching the slider scale.
export function clampKey(value: number): number {
  if (!Number.isFinite(value)) value = 0;
  return Math.max(-24, Math.min(24, Math.round(value)));
}

// Snap a number to its step and clamp to min/max. Non-finite input falls back.
export function legalNumber(
  value: number,
  step: number,
  min: number | null,
  max: number | null,
  fallback: number
): number {
  if (!Number.isFinite(value)) value = fallback;
  if (Number.isFinite(step) && step > 0) value = Math.round(value / step) * step;
  if (min != null) value = Math.max(min, value);
  if (max != null) value = Math.min(max, value);
  const places = (String(step).split(".")[1] || "").length;
  return places ? Number(value.toFixed(places)) : Math.round(value);
}

// Latency accepts nothing, "low", "high", or seconds; anything else is blanked.
export function legalLatency(value: string): string {
  const v = value.trim().toLowerCase();
  if (!v || v === "low" || v === "high" || Number.isFinite(Number(v))) return v;
  return "";
}
