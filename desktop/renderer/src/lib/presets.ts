import type { InferenceOpts } from "./bridge";
import { baseName } from "./format";
import { sanitizeOpts } from "./sanitize";

export interface Preset {
  id: string;
  name: string;
  /** Data URL or image path; empty string uses the monogram fallback. */
  image: string;
  opts: InferenceOpts;
  lastUsedAt: number;
}

const PRESETS_STORAGE_KEY = "overtone_presets_v1";
const ACTIVE_PRESET_STORAGE_KEY = "overtone_active_preset_v1";

// Strips the folder path and .pth suffix so a model file becomes a readable profile name.
export function derivePresetName(modelPath: string): string {
  const file = baseName(modelPath).trim();
  if (!file) return "Custom voice";
  return file.replace(/\.pth$/i, "") || "Custom voice";
}

// Up to two uppercase initials for the profile artwork fallback.
export function presetMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "OV";
  const words = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function createPreset(opts: InferenceOpts, overrides?: { id?: string; name?: string; image?: string; lastUsedAt?: number }): Preset {
  const cleaned = sanitizeOpts(opts);
  const name = overrides?.name?.trim() || derivePresetName(cleaned.model);
  return {
    id: overrides?.id ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    image: overrides?.image ?? "",
    opts: cleaned,
    lastUsedAt: overrides?.lastUsedAt ?? Date.now(),
  };
}

// Updates the active or matching-model profile with the latest live settings,
// or creates a new profile when this model has not been saved yet.
export function upsertPresetOnLive(
  presets: Preset[],
  activePresetId: string | null,
  opts: InferenceOpts,
  now = Date.now(),
): { presets: Preset[]; activePresetId: string } {
  const cleaned = sanitizeOpts(opts);
  const byActive = activePresetId ? presets.find((p) => p.id === activePresetId) : undefined;
  const target =
    byActive && (!cleaned.model || byActive.opts.model === cleaned.model)
      ? byActive
      : cleaned.model
        ? presets.find((p) => p.opts.model === cleaned.model)
        : byActive;

  if (target) {
    const updated: Preset = {
      ...target,
      opts: cleaned,
      lastUsedAt: now,
    };
    return {
      presets: presets.map((p) => (p.id === target.id ? updated : p)),
      activePresetId: target.id,
    };
  }

  const created = createPreset(cleaned, { lastUsedAt: now });
  return {
    presets: [created, ...presets],
    activePresetId: created.id,
  };
}

export function loadStoredPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Preset => Boolean(item && typeof item === "object" && "id" in item && "opts" in item))
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || derivePresetName(item.opts?.model ?? "")),
        image: typeof item.image === "string" ? item.image : "",
        opts: sanitizeOpts(item.opts),
        lastUsedAt: typeof item.lastUsedAt === "number" ? item.lastUsedAt : 0,
      }));
  } catch {
    return [];
  }
}

export function saveStoredPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota errors in restricted environments.
  }
}

export function loadActivePresetId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveActivePresetId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_PRESET_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
