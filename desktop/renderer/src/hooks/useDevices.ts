import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type Device } from "../lib/bridge";

// One scan result instead of three loosely-related strings, so the count and
// the error can never describe different moments in time.
export type DeviceScan =
  { kind: "idle" } | { kind: "loading" } | { kind: "ready"; devices: Device[]; mics: number; speakers: number } | { kind: "error"; message: string };

const IDLE: DeviceScan = { kind: "idle" };

export function useDevices(onProblem: (message: string) => void) {
  const [scan, setScan] = useState<DeviceScan>(IDLE);
  const scannedOnce = useRef(false);

  const refresh = useCallback(async () => {
    const rvc = bridge();
    if (!rvc) return;
    setScan({ kind: "loading" });
    const result = await rvc.devices();
    if (!result.ok) {
      setScan({ kind: "error", message: result.error });
      onProblem(result.error);
      return;
    }
    const devices = result.devices;
    const mics = devices.filter((d) => d.inputs > 0).length;
    const speakers = devices.filter((d) => d.outputs > 0).length;
    setScan(mics || speakers ? { kind: "ready", devices, mics, speakers } : { kind: "error", message: "No microphones or speakers were reported." });
  }, [onProblem]);

  // Scan once when the program first loads. Coming back to the Live page does
  // not re-scan; only the Refresh button does.
  useEffect(() => {
    if (scannedOnce.current) return;
    scannedOnce.current = true;
    refresh();
  }, [refresh]);

  return { scan, refresh, devices: scan.kind === "ready" ? scan.devices : [] };
}
