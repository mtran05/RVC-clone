import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { bridge, Device, InferenceOpts } from "./bridge";
import { defaultOpts } from "./opts";

// Shared live-session state: running flag, status lamp text, the tail of the
// process log, the form settings, and the scanned audio device list.
// Lives above the router so a background inference process keeps updating while
// the user is on the Saved or SFX page, and so returning to Live restores the
// previous settings and device list instead of resetting them.
interface Session {
  running: boolean;
  status: string;
  logLines: string[];
  opts: InferenceOpts;
  devices: Device[];
  deviceCount: string;
  deviceError: string;
  setStatus: (text: string) => void;
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
  const [status, setStatus] = useState("Idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [opts, setOptsState] = useState<InferenceOpts>(defaultOpts);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceCount, setDeviceCount] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const devicesLoadedOnce = useRef(false);

  // Keep only the newest lines so the log cannot grow without bound.
  const pushLog = useCallback((line: string) => {
    setLogLines((lines) => [...lines.slice(-79), line]);
  }, []);

  const clearLog = useCallback(() => setLogLines([]), []);

  const setLive = useCallback((on: boolean) => {
    setRunning(on);
    setStatus(on ? "Live" : "Idle");
  }, []);

  const setOpt = useCallback(
    <K extends keyof InferenceOpts>(key: K, value: InferenceOpts[K]) =>
      setOptsState((o) => ({ ...o, [key]: value })),
    []
  );
  const setOpts = useCallback(
    (next: InferenceOpts | ((o: InferenceOpts) => InferenceOpts)) =>
      setOptsState((o) => (typeof next === "function" ? next(o) : next)),
    []
  );

  // Ask Python (via the main process) for the PortAudio device table.
  const refreshDevices = useCallback(async () => {
    const rvc = bridge();
    if (!rvc) return;
    setDeviceError("");
    setDeviceCount("Looking for devices…");
    if (!running) setStatus("Looking for devices…");
    const result = await rvc.devices();
    if (!result.ok) {
      setDeviceCount("");
      setDeviceError(result.error);
      pushLog(result.error);
      if (!running) setStatus("Idle");
      return;
    }
    setDevices(result.devices);
    const mics = result.devices.filter((d) => d.inputs > 0).length;
    const speakers = result.devices.filter((d) => d.outputs > 0).length;
    setDeviceCount(`${mics} microphones, ${speakers} speakers`);
    if (!mics && !speakers) setDeviceError("No microphones or speakers were reported.");
    if (!running) setStatus("Idle");
  }, [running, pushLog]);

  // On first program load, defaulting to the Live page, scan once. Later
  // navigation back to Live does not re-scan; only the Refresh button does.
  useEffect(() => {
    if (devicesLoadedOnce.current) return;
    devicesLoadedOnce.current = true;
    refreshDevices();
  }, [refreshDevices]);

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

  const value = useMemo(
    () => ({
      running,
      status,
      logLines,
      opts,
      devices,
      deviceCount,
      deviceError,
      setStatus,
      pushLog,
      clearLog,
      setLive,
      setOpt,
      setOpts,
      refreshDevices,
    }),
    [running, status, logLines, opts, devices, deviceCount, deviceError, pushLog, clearLog, setLive, setOpt, setOpts, refreshDevices]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside provider");
  return session;
}
