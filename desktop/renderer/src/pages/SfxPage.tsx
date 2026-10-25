import { useState, useEffect, useRef } from "react";
import { bridge } from "../lib/bridge";
import { useSession } from "../lib/session";
import Field from "../components/Field";
import TipButton from "../components/TipButton";
import RangeField from "../components/RangeField";
import "./SfxPage.css";

export interface SfxItem {
  id: string;
  name: string;
  path: string;
  keybind?: string;
  volume: number;
}

const STORAGE_KEY = "overtone_bundled_sfx_keybinds";

// Clean up file names for display (e.g., "airhorn_sound.mp3" -> "Airhorn Sound")
function formatDisplayName(pathStr: string): string {
  const fileName =
    pathStr
      .split("/")
      .pop()
      ?.replace(/\.[^/.]+$/, "") ?? pathStr;
  return fileName.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// Automatically import all audio files from src/assets/sounds/ at build/runtime
const loadedAudioModules = import.meta.glob<string>("../assets/sounds/*.{mp3,wav,ogg,m4a,flac,aac}", { eager: true, import: "default" });

// Map imported files into SfxItem objects
const PROJECT_SOUNDS: SfxItem[] = Object.entries(loadedAudioModules).map(([filePath, resolvedUrl]) => ({
  id: filePath,
  name: formatDisplayName(filePath),
  path: resolvedUrl,
  volume: 0.8,
}));

export default function SfxPage() {
  const session = useSession();
  const logLines = session?.logLines ?? [];
  const clearLog = session?.clearLog;

  // Sound list initialized with bundled project sounds and restored keybinds
  const [sfxList, setSfxList] = useState<SfxItem[]>(() => {
    try {
      const savedKeybinds = localStorage.getItem(STORAGE_KEY);
      const keybindMap: Record<string, string> = savedKeybinds ? JSON.parse(savedKeybinds) : {};

      return PROJECT_SOUNDS.map((sound) => ({
        ...sound,
        keybind: keybindMap[sound.id] || undefined,
      }));
    } catch {
      return PROJECT_SOUNDS;
    }
  });

  const [activePlaying, setActivePlaying] = useState<Record<string, boolean>>({});
  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [search, setSearch] = useState<string>("");
  const [sfxOutput, setSfxOutput] = useState<string>("");
  const [listeningForKey, setListeningForKey] = useState<string | null>(null);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  const audioInstances = useRef<Record<string, HTMLAudioElement[]>>({});
  const logRef = useRef<HTMLPreElement>(null);

  // Fetch available Web Audio output devices
  const refreshDevices = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      if (navigator.mediaDevices?.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        setAudioOutputs(all.filter((d) => d.kind === "audiooutput"));
      }
    } catch (err) {
      console.error("Failed to load audio output devices:", err);
    }
  };

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
    };
  }, []);

  // Save keybind configuration changes to localStorage
  useEffect(() => {
    try {
      const keybindMap: Record<string, string> = {};
      sfxList.forEach((item) => {
        if (item.keybind) keybindMap[item.id] = item.keybind;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keybindMap));
    } catch (err) {
      console.error("Failed to save keybinds:", err);
    }
  }, [sfxList]);

  // Keybind listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (listeningForKey) {
        e.preventDefault();
        const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.code;
        setSfxList((prev) => prev.map((item) => (item.id === listeningForKey ? { ...item, keybind: keyName } : item)));
        setListeningForKey(null);
        return;
      }

      if (isInput) return;

      const match = sfxList.find((item) => item.keybind && item.keybind.toLowerCase() === e.key.toLowerCase());
      if (match && !e.repeat) {
        togglePlay(match.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sfxList, listeningForKey]);

  const togglePlay = async (id: string) => {
    const item = sfxList.find((s) => s.id === id);
    if (!item || !item.path) return;

    if (activePlaying[id]) {
      const activeAudios = audioInstances.current[id];
      if (activeAudios) {
        activeAudios.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
      }
      delete audioInstances.current[id];
      setActivePlaying((prev) => ({ ...prev, [id]: false }));
    } else {
      try {
        const calcVolume = Math.max(0, Math.min(1, item.volume * masterVolume));
        const instances: HTMLAudioElement[] = [];

        // 1. Play locally (Headphones)
        const localAudio = new Audio(item.path);
        localAudio.volume = calcVolume;
        instances.push(localAudio);

        // 2. Secondary Output (Virtual Cable / Stream Target)
        if (sfxOutput) {
          const streamAudio = new Audio(item.path);
          streamAudio.volume = calcVolume;

          if ("setSinkId" in streamAudio && typeof (streamAudio as any).setSinkId === "function") {
            try {
              await (streamAudio as any).setSinkId(sfxOutput);
            } catch (err) {
              console.warn("Failed to attach audio sink ID:", err);
            }
          }
          streamAudio.play().catch((e) => console.error("Secondary audio stream failed:", e));
          instances.push(streamAudio);
        }

        const cleanup = () => {
          instances.forEach((a) => a.pause());
          delete audioInstances.current[id];
          setActivePlaying((prev) => ({ ...prev, [id]: false }));
        };

        localAudio.onended = cleanup;
        localAudio.onerror = (e) => {
          console.error(`Audio error for file "${item.name}":`, e);
          cleanup();
        };

        const playPromise = localAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error("Local audio playback failed:", err);
            cleanup();
          });
        }

        audioInstances.current[id] = instances;
        setActivePlaying((prev) => ({ ...prev, [id]: true }));
      } catch (err) {
        console.error("Audio initialization error:", err);
      }
    }
  };

  const stopAll = () => {
    Object.keys(audioInstances.current).forEach((id) => {
      const list = audioInstances.current[id];
      if (list) {
        list.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
      }
    });
    audioInstances.current = {};
    setActivePlaying({});
  };

  const updateItemVolume = (id: string, newVolume: number) => {
    setSfxList((prev) => prev.map((item) => (item.id === id ? { ...item, volume: newVolume } : item)));
    if (audioInstances.current[id]) {
      const calcVol = Math.max(0, Math.min(1, newVolume * masterVolume));
      audioInstances.current[id].forEach((a) => {
        a.volume = calcVol;
      });
    }
  };

  const updateMasterVolume = (newMaster: number) => {
    setMasterVolume(newMaster);
    Object.keys(audioInstances.current).forEach((id) => {
      const item = sfxList.find((s) => s.id === id);
      if (audioInstances.current[id] && item) {
        const calcVol = Math.max(0, Math.min(1, item.volume * newMaster));
        audioInstances.current[id].forEach((a) => {
          a.volume = calcVol;
        });
      }
    });
  };

  const filteredList = sfxList.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <section className="stage sfx-stage">
        <div className="sfx-header">
          <div className="sfx-title-row">
            <span className="panel-label">Project Soundboard</span>
            <TipButton
              label="About Soundboard"
              text="Trigger sound effects live from your project library. Click a pad or assign a keybind to trigger audio instantly."
            />
          </div>
          <div className="sfx-toolbar">
            <input
              type="search"
              className="control sfx-search"
              placeholder="Search project sounds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="text danger-text" onClick={stopAll}>
              Stop All
            </button>
          </div>
        </div>

        <div className="sfx-grid">
          {filteredList.map((sfx) => {
            const isPlaying = !!activePlaying[sfx.id];
            return (
              <div key={sfx.id} className={`sfx-card ${isPlaying ? "playing" : ""}`}>
                <div className="sfx-card-top">
                  <span className="sfx-name" title={sfx.name}>
                    {sfx.name}
                  </span>
                </div>

                <button type="button" className={`sfx-pad-btn ${isPlaying ? "active" : ""}`} onClick={() => togglePlay(sfx.id)}>
                  {isPlaying ? "⏹ Stop" : "▶ Play"}
                </button>

                <div className="sfx-card-controls">
                  <button
                    type="button"
                    className={`keybind-badge ${listeningForKey === sfx.id ? "listening" : ""}`}
                    onClick={() => setListeningForKey(listeningForKey === sfx.id ? null : sfx.id)}
                  >
                    {listeningForKey === sfx.id ? "Press key..." : sfx.keybind || "Bind key"}
                  </button>

                  <div className="sfx-vol-slider">
                    <RangeField
                      id={`vol-${sfx.id}`}
                      value={sfx.volume}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={false}
                      onChange={(v) => updateItemVolume(sfx.id, v)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {filteredList.length === 0 && (
            <div className="sfx-empty">
              <p>
                No audio files found in <code>src/assets/sounds/</code>.
              </p>
            </div>
          )}
        </div>
      </section>

      <aside className="rack">
        <div className="rack-body">
          <p className="group">Soundboard Controls</p>

          <Field
            id="master-sfx-vol"
            label="Master Volume"
            tipLabel="About Master Volume"
            tip="Controls overall volume for all soundboard triggers."
            extra={<output id="master-sfx-vol-out">{Math.round(masterVolume * 100)}%</output>}
          >
            <RangeField id="master-sfx-vol" value={masterVolume} min={0} max={1} step={0.01} disabled={false} onChange={updateMasterVolume} />
          </Field>

          <Field
            id="sfx-output-device"
            label="Secondary Output"
            tipLabel="About Cable Output"
            tip="Select BlackHole (macOS) or Virtual Cable (Windows) to route sounds to Discord/Streams."
          >
            <select id="sfx-output-device" className="control" value={sfxOutput} onChange={(e) => setSfxOutput(e.target.value)}>
              <option value="">Disabled (Headphones only)</option>
              {audioOutputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Output Device (${d.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </aside>

      <section className="tape" aria-label="Logs">
        <div className="tape-bar">
          <h2>Logs</h2>
          {clearLog && (
            <button type="button" className="text" id="clear-log" onClick={clearLog}>
              Clear
            </button>
          )}
        </div>
        {logLines.length === 0 && <p className="log-empty">Logs are displayed here.</p>}
        <pre id="log" aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>
    </>
  );
}
