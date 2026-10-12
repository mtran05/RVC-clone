<<<<<<< HEAD
import { useState, useEffect, useRef, ChangeEvent } from "react";
import { bridge, Device } from "../lib/bridge";
import { useSession } from "../lib/session";
import Field from "../components/Field";
import TipButton from "../components/TipButton";
import RangeField from "../components/RangeField";

export interface SfxItem {
  id: string;
  name: string;
  path: string;
  keybind?: string;
  volume: number;
}

function baseName(file: string): string {
  return (
    String(file)
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") ?? file
  );
}

export default function SfxPage() {
  const session = useSession();
  const running = session?.running ?? false;
  const devices = session?.devices ?? [];
  const logLines = session?.logLines ?? [];
  const clearLog = session?.clearLog;

  const [sfxList, setSfxList] = useState<SfxItem[]>([]);
  const [activePlaying, setActivePlaying] = useState<Record<string, boolean>>(
    {},
  );
  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [search, setSearch] = useState<string>("");
  const [sfxOutput, setSfxOutput] = useState<string>("");
  const [listeningForKey, setListeningForKey] = useState<string | null>(null);

  const audioInstances = useRef<Record<string, HTMLAudioElement>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (listeningForKey) {
        e.preventDefault();
        const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.code;
        setSfxList((prev) =>
          prev.map((item) =>
            item.id === listeningForKey ? { ...item, keybind: keyName } : item,
          ),
        );
        setListeningForKey(null);
        return;
      }

      if (isInput) return;

      const match = sfxList.find(
        (item) =>
          item.keybind && item.keybind.toLowerCase() === e.key.toLowerCase(),
      );
      if (match && !e.repeat) {
        togglePlay(match.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sfxList, listeningForKey]);

  // Audio Playback / Pause
  const togglePlay = (id: string) => {
    const item = sfxList.find((s) => s.id === id);
    if (!item || !item.path) return;

    if (activePlaying[id]) {
      const activeAudio = audioInstances.current[id];
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      }
      setActivePlaying((prev) => ({ ...prev, [id]: false }));
    } else {
      try {
        const audio = new Audio(item.path);
        audio.volume = Math.max(0, Math.min(1, item.volume * masterVolume));

        // Route output device if supported by browser/Electron
        if (
          sfxOutput &&
          "setSinkId" in audio &&
          typeof (audio as any).setSinkId === "function"
        ) {
          (audio as any).setSinkId(sfxOutput).catch((err: unknown) => {
            console.warn("Failed to set audio output device:", err);
          });
        }

        audioInstances.current[id] = audio;

        audio.onended = () => {
          setActivePlaying((prev) => ({ ...prev, [id]: false }));
          delete audioInstances.current[id];
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setActivePlaying((prev) => ({ ...prev, [id]: false }));
          delete audioInstances.current[id];
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error("Audio trigger failed:", err);
            setActivePlaying((prev) => ({ ...prev, [id]: false }));
          });
        }
        setActivePlaying((prev) => ({ ...prev, [id]: true }));
      } catch (err) {
        console.error("Audio initialization error:", err);
      }
    }
  };

  const addSfxFile = async () => {
    try {
      const rvc = bridge();
      if (rvc && typeof rvc.browse === "function") {
        const filePath = await rvc.browse("audio");
        if (filePath) {
          const formattedPath =
            filePath.startsWith("http") ||
            filePath.startsWith("file://") ||
            filePath.startsWith("blob:")
              ? filePath
              : `file:///${filePath.replace(/\\/g, "/")}`;

          const newItem: SfxItem = {
            id: String(Date.now()),
            name: baseName(filePath),
            path: formattedPath,
            volume: 0.8,
          };
          setSfxList((prev) => [...prev, newItem]);
          return;
        }
      }
    } catch {}

    fileInputRef.current?.click();
  };

  // Browser file input handler
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: SfxItem[] = Array.from(files).map((file) => ({
      id: String(Date.now() + Math.random()),
      name: baseName(file.name),
      path: URL.createObjectURL(file),
      volume: 0.8,
    }));

    setSfxList((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSfx = (id: string) => {
    if (audioInstances.current[id]) {
      audioInstances.current[id].pause();
      delete audioInstances.current[id];
    }
    setSfxList((prev) => prev.filter((item) => item.id !== id));
    setActivePlaying((prev) => ({ ...prev, [id]: false }));
  };

  const stopAll = () => {
    Object.keys(audioInstances.current).forEach((id) => {
      const audio = audioInstances.current[id];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    audioInstances.current = {};
    setActivePlaying({});
  };

  const filteredList = sfxList.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*"
        multiple
        style={{ display: "none" }}
      />

      <section className="stage sfx-stage">
        <div className="sfx-header">
          <div className="sfx-title-row">
            <span className="panel-label">Soundboard</span>
            <TipButton
              label="About Soundboard"
              text="Trigger sound effects live. Click a pad or assign a keybind to trigger audio instantly."
            />
          </div>
          <div className="sfx-toolbar">
            <input
              type="search"
              className="control sfx-search"
              placeholder="Search sounds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="ghost" onClick={addSfxFile}>
              Add Sound
            </button>
            <button
              type="button"
              className="text danger-text"
              onClick={stopAll}
            >
              Stop All
            </button>
          </div>
        </div>

        <div className="sfx-grid">
          {filteredList.map((sfx) => {
            const isPlaying = !!activePlaying[sfx.id];
            return (
              <div
                key={sfx.id}
                className={`sfx-card ${isPlaying ? "playing" : ""}`}
              >
                <div className="sfx-card-top">
                  <span className="sfx-name" title={sfx.name}>
                    {sfx.name}
                  </span>
                  <button
                    type="button"
                    className="sfx-remove-btn"
                    title="Remove sound"
                    onClick={() => removeSfx(sfx.id)}
                  >
                    ✕
                  </button>
                </div>

                <button
                  type="button"
                  className={`sfx-pad-btn ${isPlaying ? "active" : ""}`}
                  onClick={() => togglePlay(sfx.id)}
                >
                  {isPlaying ? "⏹ Stop" : "▶ Play"}
                </button>

                <div className="sfx-card-controls">
                  <button
                    type="button"
                    className={`keybind-badge ${listeningForKey === sfx.id ? "listening" : ""}`}
                    onClick={() =>
                      setListeningForKey(
                        listeningForKey === sfx.id ? null : sfx.id,
                      )
                    }
                  >
                    {listeningForKey === sfx.id
                      ? "Press key..."
                      : sfx.keybind || "Bind key"}
                  </button>

                  <div className="sfx-vol-slider">
                    <RangeField
                      id={`vol-${sfx.id}`}
                      value={sfx.volume}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={false}
                      onChange={(v) => {
                        setSfxList((prev) =>
                          prev.map((item) =>
                            item.id === sfx.id ? { ...item, volume: v } : item,
                          ),
                        );
                        if (audioInstances.current[sfx.id]) {
                          audioInstances.current[sfx.id].volume = Math.max(
                            0,
                            Math.min(1, v * masterVolume),
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {filteredList.length === 0 && (
            <div className="sfx-empty">
              <p>No sound effects loaded.</p>
              <button type="button" className="ghost" onClick={addSfxFile}>
                Add sound file
              </button>
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
            extra={
              <output id="master-sfx-vol-out">
                {Math.round(masterVolume * 100)}%
              </output>
            }
          >
            <RangeField
              id="master-sfx-vol"
              value={masterVolume}
              min={0}
              max={1}
              step={0.01}
              disabled={false}
              onChange={(v) => {
                setMasterVolume(v);
                Object.keys(audioInstances.current).forEach((id) => {
                  const item = sfxList.find((s) => s.id === id);
                  if (audioInstances.current[id] && item) {
                    audioInstances.current[id].volume = Math.max(
                      0,
                      Math.min(1, item.volume * v),
                    );
                  }
                });
              }}
            />
          </Field>

          <Field
            id="sfx-output-device"
            label="Speakers"
            tipLabel="About Output"
            tip="Where soundboard audio is routed."
          >
            <select
              id="sfx-output-device"
              className="control"
              value={sfxOutput}
              disabled={running}
              onChange={(e) => setSfxOutput(e.target.value)}
            >
              <option value="">System default</option>
              {devices
                .filter((d: Device) => d.outputs > 0)
                .map((d: Device) => (
                  <option key={d.index} value={String(d.index)}>
                    {d.note ? `${d.name} (${d.note})` : d.name}
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
            <button
              type="button"
              className="text"
              id="clear-log"
              onClick={clearLog}
            >
              Clear
            </button>
          )}
        </div>
        {logLines.length === 0 && (
          <p className="log-empty">Logs are displayed here.</p>
        )}
        <pre id="log" aria-live="polite" ref={logRef}>
          {logLines.join("\n")}
        </pre>
      </section>
    </>
  );
=======
import PlaceholderPage from "../components/PlaceholderPage";

export default function SfxPage() {
  return <PlaceholderPage title="SFX" />;
>>>>>>> main
}
