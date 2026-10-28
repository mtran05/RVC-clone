import { describe, expect, it } from "vitest";
import { defaultOpts } from "./specs";
import { createPreset, derivePresetName, presetMonogram, upsertPresetOnLive } from "./presets";

describe("presets", () => {
  it("derives a readable profile name from a model path", () => {
    expect(derivePresetName("C:\\models\\assets\\weights\\kikiV1.pth")).toBe("kikiV1");
    expect(derivePresetName("/weights/aria_v2.PTH")).toBe("aria_v2");
    expect(derivePresetName("")).toBe("Custom voice");
  });

  it("builds a two-letter monogram for fallback artwork", () => {
    expect(presetMonogram("Kiki V1")).toBe("KV");
    expect(presetMonogram("aria_v2")).toBe("AV");
    expect(presetMonogram("Solo")).toBe("SO");
    expect(presetMonogram("")).toBe("OV");
  });

  it("creates a sanitized preset from inference options", () => {
    const preset = createPreset({ ...defaultOpts, model: "assets/weights/hana.pth", blockTime: 0.18, key: 5 }, { id: "p1", lastUsedAt: 100 });
    expect(preset.id).toBe("p1");
    expect(preset.name).toBe("hana");
    expect(preset.opts.blockTime).toBe(0.18);
    expect(preset.opts.key).toBe(5);
    expect(preset.lastUsedAt).toBe(100);
  });

  it("updates an existing preset when going live with the same model", () => {
    const first = createPreset({ ...defaultOpts, model: "weights/hana.pth", blockTime: 0.25 }, { id: "p1", lastUsedAt: 100 });
    const nextOpts = { ...defaultOpts, model: "weights/hana.pth", blockTime: 0.12, key: -3 };
    const result = upsertPresetOnLive([first], "p1", nextOpts, 500);

    expect(result.presets).toHaveLength(1);
    expect(result.activePresetId).toBe("p1");
    expect(result.presets[0].opts.blockTime).toBe(0.12);
    expect(result.presets[0].opts.key).toBe(-3);
    expect(result.presets[0].lastUsedAt).toBe(500);
  });

  it("creates a new preset when going live with an unseen model", () => {
    const first = createPreset({ ...defaultOpts, model: "weights/hana.pth" }, { id: "p1", lastUsedAt: 100 });
    const nextOpts = { ...defaultOpts, model: "weights/kiki.pth", blockTime: 0.3 };
    const result = upsertPresetOnLive([first], "p1", nextOpts, 900);

    expect(result.presets).toHaveLength(2);
    expect(result.presets[0].name).toBe("kiki");
    expect(result.presets[0].opts.blockTime).toBe(0.3);
    expect(result.activePresetId).toBe(result.presets[0].id);
  });
});
