import { describe, expect, it } from "vitest";
import type { InferenceOpts } from "./bridge";
import { defaultOpts } from "./specs";
import { sanitizeOpts } from "./sanitize";

const withOpts = (patch: Partial<InferenceOpts>): InferenceOpts => ({ ...defaultOpts, ...patch });

describe("sanitizeOpts", () => {
  it("leaves a default form untouched", () => {
    expect(sanitizeOpts(defaultOpts)).toEqual(defaultOpts);
  });

  it("keeps every number finite", () => {
    const cleaned = sanitizeOpts(withOpts({ blockTime: Number.NaN, inputGain: Number.POSITIVE_INFINITY, indexNeighbors: Number.NaN }));
    expect(cleaned.blockTime).toBe(defaultOpts.blockTime);
    expect(cleaned.inputGain).toBe(defaultOpts.inputGain);
    expect(cleaned.indexNeighbors).toBe(defaultOpts.indexNeighbors);
  });

  it("snaps every number to its step", () => {
    const cleaned = sanitizeOpts(withOpts({ blockTime: 0.257, rmvpeThreshold: 0.0342, f0Min: 71.6, inputChannels: 2.7 }));
    expect(cleaned.blockTime).toBe(0.26);
    expect(cleaned.rmvpeThreshold).toBe(0.034);
    expect(cleaned.f0Min).toBe(72);
    expect(cleaned.inputChannels).toBe(3);
  });

  it("clamps numbers to their bounds", () => {
    const cleaned = sanitizeOpts(withOpts({ key: 900, inputChannels: -4, inputGain: -1, rmsMixRate: 5 }));
    expect(cleaned.key).toBe(24);
    expect(cleaned.inputChannels).toBe(1);
    expect(cleaned.inputGain).toBe(0);
    expect(cleaned.rmsMixRate).toBe(1);
  });

  it("leaves the pitch ceiling unbounded so it can follow the floor up", () => {
    expect(sanitizeOpts(withOpts({ f0Max: 99999 })).f0Max).toBe(99999);
    expect(sanitizeOpts(withOpts({ f0Min: 5 })).f0Min).toBe(5);
  });

  it("normalizes the free-text fields", () => {
    expect(sanitizeOpts(withOpts({ latency: "FAST" })).latency).toBe("");
    expect(sanitizeOpts(withOpts({ latency: " LOW " })).latency).toBe("low");
    expect(sanitizeOpts(withOpts({ hostApi: "  WASAPI  " })).hostApi).toBe("WASAPI");
  });

  it("pushes the ceiling up when the floor rises past it", () => {
    const cleaned = sanitizeOpts(withOpts({ f0Min: 900, f0Max: 100 }), "f0Min");
    expect(cleaned.f0Min).toBe(900);
    expect(cleaned.f0Max).toBe(901);
  });

  it("leaves a wide pitch range alone", () => {
    expect(sanitizeOpts(withOpts({ f0Min: 900, f0Max: 1100 }), "f0Min").f0Max).toBe(1100);
  });

  it("pulls the floor down when the ceiling drops to it", () => {
    const cleaned = sanitizeOpts(withOpts({ f0Min: 50, f0Max: 10 }), "f0Max");
    expect(cleaned.f0Max).toBe(10);
    expect(cleaned.f0Min).toBe(9);
  });

  it("never drops the floor below its own minimum", () => {
    const cleaned = sanitizeOpts(withOpts({ f0Min: 50, f0Max: 1 }), "f0Max");
    expect(cleaned.f0Max).toBe(1);
    expect(cleaned.f0Min).toBe(1);
  });

  it("raises the ceiling when the two meet and nothing was edited", () => {
    const cleaned = sanitizeOpts(withOpts({ f0Min: 80, f0Max: 80 }));
    expect(cleaned.f0Min).toBe(80);
    expect(cleaned.f0Max).toBe(81);
  });

  it("is idempotent", () => {
    const once = sanitizeOpts(withOpts({ f0Min: 900, latency: "low", blockTime: 0.257 }), "f0Min");
    expect(sanitizeOpts(once)).toEqual(once);
  });

  it("does not mutate the form it was given", () => {
    const original = withOpts({ f0Min: 900, f0Max: 1100 });
    const snapshot = { ...original };
    sanitizeOpts(original, "f0Min");
    expect(original).toEqual(snapshot);
  });

  it("does not mutate the shared defaults", () => {
    // defaultOpts is the app's starting point, built from the shared spec. If
    // sanitizeOpts wrote through to it, one session's settings would become
    // everyone's defaults for the next launch.
    const snapshot = JSON.stringify(defaultOpts);
    sanitizeOpts({ ...defaultOpts, f0Min: 900, latency: "fast" }, "f0Min");
    expect(JSON.stringify(defaultOpts)).toBe(snapshot);
  });
});
