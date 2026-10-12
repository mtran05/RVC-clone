import type { InferenceOpts } from "./bridge";
import { legalLatency, legalNumber } from "./opts";
import { boundsOf, defaultOpts, numberKeys, type NumberOptKey } from "./specs";

// Make the form internally consistent before it is used or sent to Python:
// every number finite and inside its bounds, the free-text fields normalized,
// and the two pitch bounds never crossing.
//
// `edited` names the field the user just changed. It only matters for the pitch
// pair, where it decides which bound gives way: lowering the floor pushes the
// ceiling up, and raising the ceiling pulls the floor down.
export function sanitizeOpts(opts: InferenceOpts, edited?: NumberOptKey): InferenceOpts {
  const next = { ...opts };

  for (const key of numberKeys) {
    const spec = defaultOpts[key];
    next[key] = legalNumber(Number(opts[key]), { ...boundsOf(key), fallback: spec as number });
  }

  next.latency = legalLatency(opts.latency);
  next.hostApi = opts.hostApi.trim();

  if (next.f0Max <= next.f0Min) {
    if (edited === "f0Max") {
      const floor = boundsOf("f0Min").min ?? 1;
      next.f0Min = Math.max(floor, next.f0Max - 1);
    } else {
      next.f0Max = next.f0Min + 1;
    }
  }

  return next;
}
