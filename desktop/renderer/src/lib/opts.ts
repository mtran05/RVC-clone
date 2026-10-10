import { boundsOf } from "./specs";

// Numeric helpers. Every bound comes from the shared option spec, so the UI can
// never drift from what desktop/args.js accepts.

interface Bounds {
  /** Snap to a multiple of this. Omitted or non-positive means "leave alone". */
  step?: number;
  min?: number;
  max?: number;
  /** Used when the incoming value is not finite. */
  fallback?: number;
}

// Snap a number to its step and clamp to min/max. Non-finite input falls back.
export function legalNumber(value: number, { step, min, max, fallback = 0 }: Bounds = {}): number {
  if (!Number.isFinite(value)) value = fallback;
  if (step != null && Number.isFinite(step) && step > 0) value = Math.round(value / step) * step;
  if (min != null) value = Math.max(min, value);
  if (max != null) value = Math.min(max, value);
  const places = step != null && Number.isFinite(step) ? (String(step).split(".")[1] || "").length : 0;
  const snapped = places ? Number(value.toFixed(places)) : Math.round(value);
  // toFixed and Math.round both hand back -0, which reads oddly in a number input.
  return Object.is(snapped, -0) ? 0 : snapped;
}

// Pitch is capped at two octaves, matching the dial scale.
export function clampKey(value: number): number {
  return legalNumber(value, { ...boundsOf("key"), fallback: 0 });
}

// Latency accepts nothing, "low", "high", or seconds; anything else is blanked.
export function legalLatency(value: string): string {
  const v = value.trim().toLowerCase();
  if (!v || v === "low" || v === "high" || Number.isFinite(Number(v))) return v;
  return "";
}
