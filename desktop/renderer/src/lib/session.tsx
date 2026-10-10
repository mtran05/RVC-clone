import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bridge, type Device, type InferenceOpts } from "./bridge";
import { defaultOpts } from "./specs";
import { useDevices, type DeviceScan } from "../hooks/useDevices";
import { useLog } from "../hooks/useLog";

// Shared live-session state: whether the converter is running, the status lamp
// text, the tail of the process log, the form settings, and the scanned audio
// device list.
//
// This lives above the router so a background inference process keeps reporting
// while the user is on the Saved or SFX page, and so returning to Live restores
// the previous settings and device list instead of resetting them.
export interface Session {
  running: boolean;
  /** Machine-readable state, used to pick the lamp colour. */
  status: "Idle" | "Live" | "Stopped" | "Preview";
  /** What the lamp actually says. Scanning overrides the label while idle. */
  statusLabel: string;
  logLines: string[];
  opts: InferenceOpts;
  scan: DeviceScan;
  devices: Device[];
  pushLog: (line: string) => void;
  clearLog: () => void;
  setLive: (on: boolean) => void;
  setOpt: <K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) => void;
  setOpts: (next: InferenceOpts | ((o: InferenceOpts) => InferenceOpts)) => void;
  refreshDevices: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Session["status"]>("Idle");
  const [opts, setOptsState] = useState<InferenceOpts>(defaultOpts);
  const { lines, push: pushLog, clear: clearLog } = useLog();

  const setLive = useCallback((on: boolean) => {
    setRunning(on);
    setStatus(on ? "Live" : "Idle");
  }, []);

  const setOpts = useCallback((next: InferenceOpts | ((o: InferenceOpts) => InferenceOpts)) => {
    setOptsState((o) => (typeof next === "function" ? next(o) : next));
  }, []);

  const setOpt = useCallback(<K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) => setOptsState((o) => ({ ...o, [key]: value })), []);

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
      scan,
      devices,
      pushLog,
      clearLog,
      setLive,
      setOpt,
      setOpts,
      refreshDevices,
    }),
    [running, status, lines, opts, scan, devices, pushLog, clearLog, setLive, setOpt, setOpts, refreshDevices],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a SessionProvider");
  return session;
}
