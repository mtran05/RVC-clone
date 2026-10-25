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
//variable to store key binds to remember them
const STORAGE_KEY = "overtone_bundled_sfx_keybinds";

function formatDisplayName(pathStr: string): string {
  const fileName =
    pathStr
      .split("/")
      .pop()
      ?.replace(/\.[^/.]+$/, "") ?? pathStr;
  return fileName.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

//checks for sounds in the assets/sounds folder and loads them into the project
const loadedAudioModules = import.meta.glob<string>("../assets/sounds/*.{mp3,wav,ogg,m4a,flac,aac}", { eager: true, import: "default" });

//store the loaded sounds into a constant array of SfxItem objects
const PROJECT_SOUNDS: SfxItem[] = Object.entries(loadedAudioModules).map(([filePath, resolvedUrl]) => ({
  id: filePath,
  name: formatDisplayName(filePath),
  path: resolvedUrl,
  volume: 0.8,
}));

// Main SFX Page Component
export default function SfxPage() {
  const session = useSession();
  const logLines = session?.logLines ?? [];
  const clearLog = session?.clearLog;

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

  // state variables for active playing sounds, master volume, search term, selected output device, and key listening state
  const [activePlaying, setActivePlaying] = useState<Record<string, boolean>>({});
  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [search, setSearch] = useState<string>("");
  const [sfxOutput, setSfxOutput] = useState<string>("");
  const [listeningForKey, setListeningForKey] = useState<string | null>(null);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  const allRunningAudios = useRef<Set<HTMLAudioElement>>(new Set());
  const soundAudiosMap = useRef<Map<string, Set<HTMLAudioElement>>>(new Map());
  const logRef = useRef<HTMLPreElement>(null);

  // Function to refresh the list of audio output devices
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

  // Effect to refresh audio devices on mount and listen for device changes
  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
    };
  }, []);

  // Effect to save keybinds to localStorage whenever the sfxList changes
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

  //stops a specific sound by its ID
  const stopSound = (id: string) => {
    const soundSet = soundAudiosMap.current.get(id);
    if (soundSet) {
      soundSet.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
        allRunningAudios.current.delete(audio);
      });
      soundAudiosMap.current.delete(id);
    }
    setActivePlaying((prev) => ({ ...prev, [id]: false }));
  };

  //stops all playing sounds
  const stopAll = () => {
    allRunningAudios.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    allRunningAudios.current.clear();
    soundAudiosMap.current.clear();
    setActivePlaying({});
  };

  // Function to toggle play/stop for a specific sound by its ID
  const togglePlay = async (id: string) => {
    const item = sfxList.find((s) => s.id === id);
    if (!item || !item.path) return;

    //if the sound is already playing, stop it other wise, play it
    const activeInstances = soundAudiosMap.current.get(id);
    if (activeInstances && activeInstances.size > 0) {
      stopSound(id);
      return;
    }

    //play the sound and handle volume, output device, and cleanup
    try {
      const calcVolume = Math.max(0, Math.min(1, item.volume * masterVolume));
      const instances: HTMLAudioElement[] = [];

      // Create and play the local audio instance
      const localAudio = new Audio(item.path);
      localAudio.volume = calcVolume;
      instances.push(localAudio);

      //
      if (sfxOutput) {
        const streamAudio = new Audio(item.path);
        streamAudio.volume = calcVolume;

        // Attempt to set the sink ID for the secondary output device if supported
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

      //store audio instances in a map
      if (!soundAudiosMap.current.has(id)) {
        soundAudiosMap.current.set(id, new Set());
      }
      //store the audio instances in a set for this sound ID
      const soundSet = soundAudiosMap.current.get(id)!;

      instances.forEach((a) => {
        allRunningAudios.current.add(a);
        soundSet.add(a);
      });

      //stops and removes audio instances when they finish playing or encounter an error
      const cleanup = () => {
        instances.forEach((a) => {
          a.pause();
          allRunningAudios.current.delete(a);
          soundSet.delete(a);
        });
        if (soundSet.size === 0) {
          soundAudiosMap.current.delete(id);
          setActivePlaying((prev) => ({ ...prev, [id]: false }));
        }
      };

      // Attach event listeners for cleanup
      localAudio.onended = cleanup;
      localAudio.onerror = (e) => {
        console.error(`Audio error for file "${item.name}":`, e);
        cleanup();
      };

      // Attempt to play the local audio and handle any promise rejections
      const playPromise = localAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Local audio playback failed:", err);
          cleanup();
        });
      }

      setActivePlaying((prev) => ({ ...prev, [id]: true }));
    } catch (err) {
      console.error("Audio initialization error:", err);
    }
  };

  //if key is pressed, trigger the sound affect.
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
  }, [sfxList, listeningForKey, masterVolume, sfxOutput]);

  //updates the volume of a specific sound effect
  const updateItemVolume = (id: string, newVolume: number) => {
    setSfxList((prev) => prev.map((item) => (item.id === id ? { ...item, volume: newVolume } : item)));
    const soundSet = soundAudiosMap.current.get(id);
    if (soundSet) {
      const calcVol = Math.max(0, Math.min(1, newVolume * masterVolume));
      soundSet.forEach((a) => {
        a.volume = calcVol;
      });
    }
  };

  //updates the master volume and applies it to all currently playing sounds
  const updateMasterVolume = (newMaster: number) => {
    setMasterVolume(newMaster);
    soundAudiosMap.current.forEach((soundSet, id) => {
      const item = sfxList.find((s) => s.id === id);
      if (item) {
        const calcVol = Math.max(0, Math.min(1, item.volume * newMaster));
        soundSet.forEach((a) => {
          a.volume = calcVol;
        });
      }
    });
  };

  const filteredList = sfxList.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  //returns the sfx page ui with all added controls and features for the soundboard
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
