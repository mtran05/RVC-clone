import { describe, expect, it } from "vitest";
import { clampKey, legalLatency, legalNumber } from "./opts";
import { boundsOf, defaultOpts, OPTION_SPEC, rangeOf, specOf, TUNING } from "./specs";

describe("legalNumber", () => {
  it("snaps to the step", () => {
    expect(legalNumber(1.2345, { step: 0.01 })).toBe(1.23);
    expect(legalNumber(0.1 + 0.2, { step: 0.01 })).toBe(0.3);
    expect(legalNumber(7, { step: 1 })).toBe(7);
    expect(legalNumber(7.4, { step: 1 })).toBe(7);
  });

  it("rounds to the step's precision instead of leaving float noise", () => {
    expect(legalNumber(1.4, { step: 0.1 })).toBe(1.4);
    expect(legalNumber(0.7, { step: 0.1 })).toBe(0.7);
    expect(legalNumber(1.3000000000000003, { step: 0.1 })).toBe(1.3);
  });

  it("clamps to min and max", () => {
    expect(legalNumber(-5, { step: 1, min: 0 })).toBe(0);
    expect(legalNumber(999, { step: 1, max: 24 })).toBe(24);
    expect(legalNumber(5, { step: 1, min: 0, max: 3 })).toBe(3);
  });

  it("falls back when the value is not finite", () => {
    expect(legalNumber(Number.NaN, { step: 1, fallback: 42 })).toBe(42);
    expect(legalNumber(Number.POSITIVE_INFINITY, { step: 1, fallback: 42 })).toBe(42);
    expect(legalNumber(Number.NaN)).toBe(0);
  });

  it("never returns negative zero", () => {
    expect(Object.is(legalNumber(-0.4, { step: 1 }), -0)).toBe(false);
    expect(legalNumber(-0.4, { step: 1 })).toBe(0);
  });

  it("does not snap to a step that is missing or not positive", () => {
    // Without a usable step the value is only rounded to a whole number.
    expect(legalNumber(1.2345)).toBe(1);
    expect(legalNumber(1.2345, { step: 0 })).toBe(1);
    expect(legalNumber(1.2345, { step: -1 })).toBe(1);
    expect(legalNumber(1.2345, { step: Number.NaN })).toBe(1);
  });
});

describe("clampKey", () => {
  it("keeps pitch inside two octaves", () => {
    expect(clampKey(0)).toBe(0);
    expect(clampKey(12)).toBe(12);
    expect(clampKey(-24)).toBe(-24);
    expect(clampKey(24)).toBe(24);
    expect(clampKey(99)).toBe(24);
    expect(clampKey(-99)).toBe(-24);
  });

  it("rounds to whole semitones", () => {
    expect(clampKey(3.4)).toBe(3);
    expect(clampKey(3.6)).toBe(4);
  });

  it("reads its bounds from the shared spec", () => {
    expect(boundsOf("key")).toEqual({ step: 1, min: -24, max: 24 });
  });
});

describe("legalLatency", () => {
  it("accepts the empty string, low, high, and seconds", () => {
    expect(legalLatency("")).toBe("");
    expect(legalLatency("   ")).toBe("");
    expect(legalLatency("low")).toBe("low");
    expect(legalLatency("HIGH")).toBe("high");
    expect(legalLatency("0.02")).toBe("0.02");
  });

  it("blanks anything else", () => {
    expect(legalLatency("fast")).toBe("");
    expect(legalLatency("12 ms")).toBe("");
  });
});

describe("the shared option spec", () => {
  it("describes every key InferenceOpts declares", () => {
    const optsKeys = Object.keys(defaultOpts).sort();
    const specKeys = Object.keys(OPTION_SPEC).sort();
    expect(specKeys).toEqual(optsKeys);
  });

  it("gives every option a flag, a label, and help text", () => {
    for (const [key, spec] of Object.entries(OPTION_SPEC)) {
      expect(spec.flag, `${key} has no flag`).toMatch(/^--[a-z0-9-]+$/);
      expect(spec.label, `${key} has no label`).toBeTruthy();
      expect(spec.tip, `${key} has no tip`).toBeTruthy();
      expect(spec.section, `${key} has no section`).toBeTruthy();
      expect(spec.default, `${key} has no default`).toBeDefined();
    }
  });

  it("gives every numeric option a positive step", () => {
    for (const [key, spec] of Object.entries(OPTION_SPEC)) {
      if (spec.kind !== "number") continue;
      expect(spec.step, `${key} has no step`).toBeGreaterThan(0);
    }
  });

  it("keeps each field's min under its max", () => {
    for (const [key, spec] of Object.entries(OPTION_SPEC)) {
      if (spec.min == null || spec.max == null) continue;
      expect(spec.min, `${key} min >= max`).toBeLessThanOrEqual(spec.max);
    }
  });

  it("keeps defaults inside their own bounds", () => {
    const opts = defaultOpts as unknown as Record<string, number>;
    for (const [key, spec] of Object.entries(OPTION_SPEC)) {
      if (spec.kind !== "number") continue;
      expect(opts[key], `${key} default below min`).toBeGreaterThanOrEqual(spec.min ?? -Infinity);
      expect(opts[key], `${key} default above max`).toBeLessThanOrEqual(spec.max ?? Infinity);
    }
  });

  it("uses the spec defaults", () => {
    const opts = defaultOpts as unknown as Record<string, unknown>;
    for (const [key, option] of Object.entries(OPTION_SPEC)) expect(opts[key], key).toEqual(option.default);
  });

  it("has no duplicate CLI flags", () => {
    const flags = Object.values(OPTION_SPEC).map((spec) => spec.flag);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it("throws for a key it does not describe", () => {
    expect(() => specOf("nope")).toThrow('No option spec for "nope"');
  });

  it("returns a range for sliders and refuses where there is none", () => {
    expect(rangeOf("rmsMixRate")).toEqual({ min: 0, max: 1 });
    expect(rangeOf("key")).toEqual({ min: -24, max: 24 });
    expect(() => rangeOf("model")).toThrow('Option "model" has no min/max range');
  });
});

describe("the More settings layout", () => {
  it("places every tunable exactly once", () => {
    const placed = TUNING.flatMap((section) => section.fields);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("only names options the spec describes", () => {
    for (const section of TUNING) {
      for (const field of section.fields) expect(() => specOf(field), `${field} in ${section.title}`).not.toThrow();
    }
  });

  it("gives every section a title", () => {
    for (const section of TUNING) expect(section.title).toBeTruthy();
  });
});
