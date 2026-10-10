import { useMemo } from "react";
import type { Device } from "../lib/bridge";
import { useFieldId } from "./FieldContext";
import controls from "../styles/controls.module.css";

interface Props {
  devices: Device[];
  channel: "inputs" | "outputs";
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

// Windows tends to expose the same physical device under several host APIs.
// The ones that matter come first so the list is not a wall of duplicates.
const HOST_RANK = ["Windows WASAPI", "MME", "Windows DirectSound", "Windows WDM-KS"];

const hostOrder = (host: string) => {
  const rank = HOST_RANK.indexOf(host);
  return rank < 0 ? 99 : rank;
};

// Microphone/speaker dropdown, grouped by PortAudio host API. "System default"
// is the empty value, which tells the inference process to follow Windows.
export default function DeviceSelect({ devices, channel, value, disabled, onChange }: Props) {
  const id = useFieldId();
  const groups = useMemo(() => {
    const byHost = new Map<string, Device[]>();
    for (const device of devices) {
      if (device[channel] < 1) continue;
      const host = device.host || "Other";
      const bucket = byHost.get(host);
      if (bucket) bucket.push(device);
      else byHost.set(host, [device]);
    }
    return [...byHost.entries()].sort(([a], [b]) => hostOrder(a) - hostOrder(b) || a.localeCompare(b));
  }, [devices, channel]);

  return (
    <select id={id} className={controls.select} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">System default</option>
      {groups.map(([host, list]) => (
        <optgroup key={host} label={host}>
          {list.map((device) => (
            <option key={device.index} value={String(device.index)}>
              {device.note ? `${device.name} (${device.note})` : device.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
