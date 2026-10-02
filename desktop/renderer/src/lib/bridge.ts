// Typed view of the API preload.js exposes as window.rvc.
// The shape mirrors the ipcMain handlers in desktop/main.js;
// when a handler's payload changes, update InferenceOpts/Device here too.
export interface Assets {
  models: string[];
  indices: string[];
}

export interface Device {
  index: number;
  inputs: number;
  outputs: number;
  rate: number;
  host: string;
  name: string;
  note: string;
}

export interface ExitInfo {
  code: number | null;
  expected: boolean;
}

export interface RvcBridge {
  assets: () => Promise<Assets>;
  browse: (kind: "model" | "index") => Promise<string | null>;
  devices: () => Promise<{ ok: true; devices: Device[] } | { ok: false; error: string }>;
  start: (opts: InferenceOpts) => Promise<{ ok: true } | { ok: false; error: string }>;
  stop: () => Promise<{ ok: true }>;
  onLog: (callback: (line: string) => void) => void;
  onExit: (callback: (info: ExitInfo) => void) => void;
}

export interface InferenceOpts {
  model: string;
  index: string;
  indexRate: number;
  key: number;
  formant: number;
  f0: "rmvpe" | "fcpe" | "pm";
  sampleRate: number;
  blockTime: number;
  crossfadeTime: number;
  extraTime: number;
  rmsMixRate: number;
  inputDevice: string;
  outputDevice: string;
  hostApi: string;
  inputChannels: number;
  outputChannels: number;
  latency: string;
  inputGain: number;
  outputGain: number;
  noClip: boolean;
  wasapiExclusive: boolean;
  wasapiAutoConvert: boolean;
  f0Min: number;
  f0Max: number;
  rmvpeThreshold: number;
  fcpeThreshold: number;
  indexNeighbors: number;
}

declare global {
  interface Window {
    rvc?: RvcBridge;
  }
}

// Returns the bridge when running inside Electron, undefined in a plain browser
// (the app then shows "Preview" instead of live data).
export function bridge(): RvcBridge | undefined {
  return window.rvc;
}
