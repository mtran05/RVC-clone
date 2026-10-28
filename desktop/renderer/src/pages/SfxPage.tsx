import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import { cx } from "../lib/cx";
import { baseName } from "../lib/format";
import { useSession } from "../lib/session";
import Button from "../components/Button";
import Field from "../components/Field";
import LabelRow from "../components/LabelRow";
import RangeField from "../components/RangeField";
import SelectField from "../components/SelectField";
import controls from "../styles/controls.module.css";
import layout from "./LivePage.module.css";
import styles from "./SfxPage.module.css";

export interface SfxItem {
  id: string;
  name: string;
  path: string;
  keybind?: string;
  volume: number;
  custom?: boolean;
}

interface StoredSfxState {
  keybinds?: Record<string, string>;
  volumes?: Record<string, number>;
  custom?: SfxItem[];
  masterVolume?: number;
}

const STORAGE_KEY = "overtone_sfx_state_v1";
const LEGACY_KEYBINDS_KEY = "overtone_bundled_sfx_keybinds";

function formatDisplayName(pathStr: string): string {
  const file = baseName(pathStr).replace(/\.[^/.]+$/, "");
  return file.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Sound";
}

function toPlayableUrl(pathStr: string): string {
  if (/^(https?:|data:|blob:|file:|\.|\/assets\/)/i.test(pathStr)) return pathStr;
  const normalized = pathStr.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${encodeURI(normalized)}` : `file:///${encodeURI(normalized)}`;
}

const loadedAudioModules = import.meta.glob<string>("../assets/sounds/*.{mp3,wav,ogg,m4a,flac,aac}", {
  eager: true,
  import: "default",
});

const BUNDLED_SOUNDS: SfxItem[] = Object.entries(loadedAudioModules).map(([filePath, resolvedUrl]) => ({
  id: filePath,
  name: formatDisplayName(filePath),
  path: resolvedUrl,
  volume: 0.8,
}));

function loadSavedSfxState(): StoredSfxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredSfxState;
    const legacy = localStorage.getItem(LEGACY_KEYBINDS_KEY);
    if (legacy) return { keybinds: JSON.parse(legacy) as Record<string, string> };
  } catch {
    // Ignore malformed localStorage entries.
  }
  return {};
}

function mergeSounds(base: SfxItem[], saved: StoredSfxState): SfxItem[] {
  const keybinds = saved.keybinds ?? {};
  const volumes = saved.volumes ?? {};
  const custom = (saved.custom ?? []).map((item) => ({
    ...item,
    custom: true,
    keybind: keybinds[item.id] ?? item.keybind,
    volume: volumes[item.id] ?? item.volume ?? 0.8,
  }));
  const seen = new Set(custom.map((item) => item.id));
  const merged: SfxItem[] = [...custom];
  for (const sound of base) {
    if (seen.has(sound.id)) continue;
    seen.add(sound.id);
    merged.push({
      ...sound,
      keybind: keybinds[sound.id] ?? sound.keybind,
      volume: volumes[sound.id] ?? sound.volume,
    });
  }
  return merged;
}

// The soundboard page: trigger pads on the left stage, master volume and output
// routing in the right rack, and the shared process log along the bottom.
export default function SfxPage() {
  const { logLines, clearLog, pushLog } = useSession();
  const savedInit = useRef<StoredSfxState>(loadSavedSfxState());

  const [sfxList, setSfxList] = useState<SfxItem[]>(() => mergeSounds(BUNDLED_SOUNDS, savedInit.current));
  const [activePlaying, setActivePlaying] = useState<Record<string, boolean>>({});
  const [masterVolume, setMasterVolume] = useState<number>(() => savedInit.current.masterVolume ?? 0.8);
  const [search, setSearch] = useState<string>("");
  const [sfxOutput, setSfxOutput] = useState<string>("");
  const [listeningForKey, setListeningForKey] = useState<string | null>(null);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  const allRunningAudios = useRef<Set<HTMLAudioElement>>(new Set());
  const soundAudiosMap = useRef<Map<string, Set<HTMLAudioElement>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // Merge any audio files found in the project's assets/sounds folder.
  useEffect(() => {
    const rvc = bridge();
    if (!rvc) return;
    void rvc.assets().then((assets) => {
      const diskSounds = (assets.sounds ?? []).map((filePath) => ({
        id: filePath,
        name: formatDisplayName(filePath),
        path: toPlayableUrl(filePath),
        volume: 0.8,
      }));
      if (diskSounds.length === 0) return;
      setSfxList((current) => {
        const existing = new Set(current.map((item) => item.id));
        const additions = diskSounds.filter((item) => !existing.has(item.id));
        return additions.length > 0 ? [...current, ...additions] : current;
      });
    });
  }, []);

  const refreshAudioOutputs = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        setAudioOutputs(all.filter((d) => d.kind === "audiooutput"));
      }
    } catch {
      // Ignore unsupported mediaDevices in headless/test environments.
    }
  }, []);

  useEffect(() => {
    void refreshAudioOutputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioOutputs);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioOutputs);
    };
  }, [refreshAudioOutputs]);

  // Persist keybinds, pad volumes, custom clips, and master volume.
  useEffect(() => {
    try {
      const keybinds: Record<string, string> = {};
      const volumes: Record<string, number> = {};
      const custom: SfxItem[] = [];
      for (const item of sfxList) {
        if (item.keybind) keybinds[item.id] = item.keybind;
        volumes[item.id] = item.volume;
        if (item.custom) custom.push(item);
      }
      const payload: StoredSfxState = { keybinds, volumes, custom, masterVolume };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors.
    }
  }, [sfxList, masterVolume]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const stopSound = useCallback((id: string) => {
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
  }, []);

  const stopAll = useCallback(() => {
    allRunningAudios.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    allRunningAudios.current.clear();
    soundAudiosMap.current.clear();
    setActivePlaying({});
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const togglePlay = useCallback(
    async (id: string) => {
      const item = sfxList.find((s) => s.id === id);
      if (!item || !item.path) return;

      const activeInstances = soundAudiosMap.current.get(id);
      if (activeInstances && activeInstances.size > 0) {
        stopSound(id);
        return;
      }

      try {
        const calcVolume = Math.max(0, Math.min(1, item.volume * masterVolume));
        const instances: HTMLAudioElement[] = [];

        const localAudio = new Audio(item.path);
        localAudio.volume = calcVolume;
        instances.push(localAudio);

        if (sfxOutput) {
          const streamAudio = new Audio(item.path);
          streamAudio.volume = calcVolume;
          if (typeof streamAudio.setSinkId === "function") {
            try {
              await streamAudio.setSinkId(sfxOutput);
            } catch {
              // Ignore sink assignment failure if device disconnected.
            }
          }
          void streamAudio.play().catch(() => {});
          instances.push(streamAudio);
        }

        if (!soundAudiosMap.current.has(id)) {
          soundAudiosMap.current.set(id, new Set());
        }
        const soundSet = soundAudiosMap.current.get(id)!;
        instances.forEach((a) => {
          allRunningAudios.current.add(a);
          soundSet.add(a);
        });

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

        localAudio.onended = cleanup;
        localAudio.onerror = () => {
          pushLog(`Could not play sound: ${item.name}`);
          cleanup();
        };

        const playPromise = localAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            cleanup();
          });
        }

        setActivePlaying((prev) => ({ ...prev, [id]: true }));
      } catch {
        pushLog(`Could not start sound: ${item.name}`);
      }
    },
    [sfxList, masterVolume, sfxOutput, stopSound, pushLog],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));

      if (listeningForKey) {
        e.preventDefault();
        if (e.key === "Escape") {
          setListeningForKey(null);
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          setSfxList((prev) => prev.map((item) => (item.id === listeningForKey ? { ...item, keybind: undefined } : item)));
          setListeningForKey(null);
          return;
        }
        const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.code;
        setSfxList((prev) => prev.map((item) => (item.id === listeningForKey ? { ...item, keybind: keyName } : item)));
        setListeningForKey(null);
        return;
      }

      if (isInput) return;

      const pressed = e.key.length === 1 ? e.key.toLowerCase() : e.code.toLowerCase();
      const match = sfxList.find((item) => item.keybind && item.keybind.toLowerCase() === pressed);
      if (match && !e.repeat) {
        void togglePlay(match.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sfxList, listeningForKey, togglePlay]);

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

  const addSound = async () => {
    const rvc = bridge();
    if (rvc) {
      const file = await rvc.browse("audio");
      if (!file) return;
      const item: SfxItem = {
        id: file,
        name: formatDisplayName(file),
        path: toPlayableUrl(file),
        volume: 0.8,
        custom: true,
      };
      setSfxList((prev) => (prev.some((existing) => existing.id === item.id) ? prev : [...prev, item]));
      return;
    }
    fileInputRef.current?.click();
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const id = `custom:${file.name}`;
    const item: SfxItem = {
      id,
      name: formatDisplayName(file.name),
      path: url,
      volume: 0.8,
      custom: true,
    };
    setSfxList((prev) => (prev.some((existing) => existing.id === item.id) ? prev : [...prev, item]));
  };

  const removeSound = (id: string) => {
    stopSound(id);
    setSfxList((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredList = sfxList.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const anyPlaying = Object.values(activePlaying).some(Boolean);

  return (
    <div className={layout.live}>
      <section className={cx(layout.stage, styles.stage)} aria-label="SFX">
        <div className={styles.header}>
          <LabelRow
            as="span"
            label="Soundboard"
            tip="Trigger audio clips with a click or a bound key. Route them to a secondary output to send effects into voice chat."
          />
          <div className={styles.toolbar}>
            <input
              type="search"
              className={cx(controls.control, styles.search)}
              placeholder="Filter sounds"
              aria-label="Filter sounds"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={() => void addSound()}>Add sound</Button>
            <input ref={fileInputRef} type="file" accept="audio/*" className={styles.hiddenInput} onChange={onFileInput} />
          </div>
        </div>

        <div className={styles.grid}>
          {filteredList.map((sfx) => {
            const isPlaying = Boolean(activePlaying[sfx.id]);
            const isListening = listeningForKey === sfx.id;
            return (
              <div key={sfx.id} className={styles.pad} data-playing={isPlaying ? "true" : undefined}>
                <div className={styles.padTop}>
                  <span className={styles.padName} title={sfx.name}>
                    {sfx.name}
                  </span>
                  <div className={styles.padActions}>
                    <button
                      type="button"
                      className={styles.keybind}
                      data-listening={isListening ? "true" : undefined}
                      aria-label={`Keybind for ${sfx.name}`}
                      onClick={() => setListeningForKey(isListening ? null : sfx.id)}
                    >
                      {isListening ? "Key…" : sfx.keybind || "Bind"}
                    </button>
                    {sfx.custom && (
                      <button type="button" className={styles.remove} aria-label={`Remove ${sfx.name}`} onClick={() => removeSound(sfx.id)}>
                        ×
                      </button>
                    )}
                  </div>
                </div>

                <button type="button" className={styles.trigger} data-playing={isPlaying ? "true" : undefined} onClick={() => void togglePlay(sfx.id)}>
                  <span>{isPlaying ? "Playing" : "Trigger"}</span>
                  <span className={styles.lamp} aria-hidden="true" />
                </button>

                <div className={styles.gainRow}>
                  <RangeField value={sfx.volume} min={0} max={1} step={0.01} ariaLabel={`${sfx.name} volume`} onChange={(v) => updateItemVolume(sfx.id, v)} />
                  <output className={styles.gainOut}>{Math.round(sfx.volume * 100)}%</output>
                </div>
              </div>
            );
          })}

          {filteredList.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No sounds loaded</p>
              <p className={styles.emptyNote}>Drop audio clips into assets/sounds or add files from disk to build your soundboard.</p>
              <Button onClick={() => void addSound()}>Add sound</Button>
            </div>
          )}
        </div>
      </section>

      <aside className={layout.rack}>
        <div className={layout.rackBody}>
          <h3 className={layout.group}>Master</h3>
          <Field label="Master volume" tip="Scales the playback loudness of every soundboard pad." extra={<output>{Math.round(masterVolume * 100)}%</output>}>
            <RangeField value={masterVolume} min={0} max={1} step={0.01} onChange={updateMasterVolume} />
          </Field>

          <h3 className={layout.group}>Output</h3>
          <SelectField
            label="Secondary output"
            tip="Plays a second stream into a virtual cable so voice chat hears your soundboard while you monitor on headphones."
            value={sfxOutput}
            onChange={setSfxOutput}
            options={[
              { value: "", label: "None (default output)" },
              ...audioOutputs.map((d) => ({
                value: d.deviceId,
                label: d.label || `Output (${d.deviceId.slice(0, 8)})`,
              })),
            ]}
          />
          <Button variant="text" onClick={() => void refreshAudioOutputs()}>
            Refresh outputs
          </Button>
        </div>

        <Button variant="more" onClick={() => void addSound()}>
          Add sound
        </Button>
        <Button variant="start" running={anyPlaying} onClick={stopAll}>
          Stop all
        </Button>
      </aside>

      <section className={layout.tape} aria-label="Logs">
        <div className={layout.tapeBar}>
          <h2>Logs</h2>
          <Button variant="text" className={layout.tapeAction} onClick={clearLog}>
            Clear
          </Button>
        </div>
        {logLines.length === 0 && <p className={layout.logEmpty}>Logs are displayed here.</p>}
        <pre id="log" className={layout.log} aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>
    </div>
  );
}
