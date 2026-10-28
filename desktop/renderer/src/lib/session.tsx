import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bridge, type Device, type InferenceOpts } from "./bridge";
import { createPreset, loadActivePresetId, loadStoredPresets, saveActivePresetId, saveStoredPresets, upsertPresetOnLive, type Preset } from "./presets";
import { sanitizeOpts } from "./sanitize";
import { defaultOpts } from "./specs";
import { useDevices, type DeviceScan } from "../hooks/useDevices";
import { useLog } from "../hooks/useLog";

// Shared live-session state: whether the converter is running, the status lamp
// text, the tail of the process log, the form settings, the saved model
// presets, and the scanned audio device list.
//
// This lives above the router so a background inference process keeps reporting
// while the user is on the Presets or SFX page, and so returning to Live restores
// the previous settings and device list instead of resetting them.
export interface Session {
  running: boolean;
  /** Machine-readable state, used to pick the lamp colour. */
  status: "Idle" | "Live" | "Stopped" | "Preview";
  /** What the lamp actually says. Scanning overrides the label while idle. */
  statusLabel: string;
  logLines: string[];
  opts: InferenceOpts;
  presets: Preset[];
  activePresetId: string | null;
  scan: DeviceScan;
  devices: Device[];
  pushLog: (line: string) => void;
  clearLog: () => void;
  setLive: (on: boolean) => void;
  setOpt: <K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) => void;
  setOpts: (next: InferenceOpts | ((o: InferenceOpts) => InferenceOpts)) => void;
  createPresetFromOpts: (sourceOpts?: InferenceOpts, overrides?: { name?: string; image?: string }) => Preset;
  updatePreset: (id: string, patch: Partial<Pick<Preset, "name" | "image" | "opts" | "lastUsedAt">>) => void;
  deletePreset: (id: string) => void;
  loadPreset: (id: string) => void;
  recordLivePreset: (liveOpts: InferenceOpts) => void;
  refreshDevices: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Session["status"]>("Idle");
  const [opts, setOptsState] = useState<InferenceOpts>(defaultOpts);
  const [presets, setPresets] = useState<Preset[]>(loadStoredPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(loadActivePresetId);
  const { lines, push: pushLog, clear: clearLog } = useLog();

  useEffect(() => {
    saveStoredPresets(presets);
  }, [presets]);

  useEffect(() => {
    saveActivePresetId(activePresetId);
  }, [activePresetId]);

  const setLive = useCallback((on: boolean) => {
    setRunning(on);
    setStatus(on ? "Live" : "Idle");
  }, []);

  const setOpts = useCallback((next: InferenceOpts | ((o: InferenceOpts) => InferenceOpts)) => {
    setOptsState((o) => (typeof next === "function" ? next(o) : next));
  }, []);

  const setOpt = useCallback(<K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) => setOptsState((o) => ({ ...o, [key]: value })), []);

  const createPresetFromOpts = useCallback(
    (sourceOpts?: InferenceOpts, overrides?: { name?: string; image?: string }) => {
      const created = createPreset(sourceOpts ?? opts, overrides);
      setPresets((current) => [created, ...current]);
      setActivePresetId(created.id);
      return created;
    },
    [opts],
  );

  const updatePreset = useCallback((id: string, patch: Partial<Pick<Preset, "name" | "image" | "opts" | "lastUsedAt">>) => {
    setPresets((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          ...patch,
          opts: patch.opts ? sanitizeOpts(patch.opts) : item.opts,
        };
      }),
    );
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((current) => current.filter((item) => item.id !== id));
    setActivePresetId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const loadPreset = useCallback(
    (id: string) => {
      const found = presets.find((item) => item.id === id);
      if (!found) return;
      const cleaned = sanitizeOpts(found.opts);
      setOptsState(cleaned);
      setActivePresetId(found.id);
      setPresets((current) => current.map((item) => (item.id === id ? { ...item, lastUsedAt: Date.now() } : item)));
      pushLog(`Loaded preset: ${found.name}`);
    },
    [presets, pushLog],
  );

  const recordLivePreset = useCallback(
    (liveOpts: InferenceOpts) => {
      const next = upsertPresetOnLive(presets, activePresetId, liveOpts);
      setPresets(next.presets);
      setActivePresetId(next.activePresetId);
    },
    [presets, activePresetId],
  );

  // Device problems belong in the log as well as next to the dropdowns.
  const { scan, refresh: refreshDevices, devices } = useDevices(pushLog);

  // Subscribe once so the live process keeps reporting while another page is open.
  useEffect(() => {
    const rvc = bridge();
    if (!rvc) {
      setStatus("Preview");
      return;
    }
    rvc.onLog(pushLog);
    rvc.onExit((info) => {
      setLive(false);
      if (!info.expected) {
        if (info.code) pushLog(`Stopped (${info.code})`);
        setStatus("Stopped");
      }
    });
  }, [pushLog, setLive]);

  const value = useMemo<Session>(
    () => ({
      running,
      status,
      statusLabel: !running && scan.kind === "loading" ? "Looking for devices…" : status,
      logLines: lines,
      opts,
      presets,
      activePresetId,
      scan,
      devices,
      pushLog,
      clearLog,
      setLive,
      setOpt,
      setOpts,
      createPresetFromOpts,
      updatePreset,
      deletePreset,
      loadPreset,
      recordLivePreset,
      refreshDevices,
    }),
    [
      running,
      status,
      lines,
      opts,
      presets,
      activePresetId,
      scan,
      devices,
      pushLog,
      clearLog,
      setLive,
      setOpt,
      setOpts,
      createPresetFromOpts,
      updatePreset,
      deletePreset,
      loadPreset,
      recordLivePreset,
      refreshDevices,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a SessionProvider");
  return session;
}
