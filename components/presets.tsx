"use client";

import { useState } from "react";
import { api, type Status } from "./api";
import { Sheet } from "./sheet";

export type PresetState = {
  power?: "on" | "off";
  temp?: number;
  mode?: string;
  fan?: string;
  swing?: string;
  windFree?: boolean;
  optionalMode?: string;
  display?: boolean;
};
export type Preset = { id: string; name: string; state: PresetState };

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "preset";

export function describe(state: PresetState): string {
  if (state.power === "off") return "Turns off";
  const parts: string[] = [];
  if (state.temp) parts.push(`${state.temp}°`);
  if (state.mode && state.mode !== "cool") parts.push(state.mode === "wind" ? "fan only" : state.mode);
  if (state.windFree) parts.push("WindFree");
  else if (state.fan && state.fan !== "auto") parts.push(`${state.fan} fan`);
  if (state.swing && state.swing !== "fixed") parts.push(state.swing === "all" ? "full swing" : `${state.swing} swing`);
  if (state.display === false) parts.push("display off");
  return parts.join(", ") || "Turns on";
}

function fromStatus(s: Status): PresetState {
  return {
    power: "on",
    ...(s.targetTemp ? { temp: s.targetTemp } : {}),
    ...(s.mode ? { mode: s.mode } : {}),
    ...(s.windFree ? { windFree: true } : { windFree: false, ...(s.fanMode ? { fan: s.fanMode } : {}) }),
    ...(s.swing ? { swing: s.swing } : {}),
    ...(s.display !== null ? { display: s.display } : {}),
  };
}

export function Presets({
  presets,
  status,
  onClose,
  onSaved,
  flash,
}: {
  presets: Preset[];
  status: Status | null;
  onClose: () => void;
  onSaved: (list: Preset[]) => void;
  flash: (m: string) => void;
}) {
  const [list, setList] = useState(presets);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (next: Preset[]) => {
    setBusy(true);
    try {
      const d = await api<{ presets: Preset[] }>("/api/presets", { method: "PUT", body: JSON.stringify({ presets: next }) });
      setList(d.presets);
      onSaved(d.presets);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addCurrent = () => {
    if (!status || !name.trim()) return;
    let id = slug(name);
    while (list.some((p) => p.id === id)) id = `${id}-2`.slice(0, 32);
    save([...list, { id, name: name.trim(), state: fromStatus(status) }]);
    setName("");
  };

  return (
    <Sheet title="Presets" onClose={onClose}>
      <ul className="sheet-list">
        {list.map((p) => (
          <li key={p.id}>
            <input
              className="inline-input"
              value={p.name}
              aria-label="Preset name"
              onChange={(e) => setList(list.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
              onBlur={() => save(list)}
            />
            <span className="sheet-sub">{describe(p.state)}</span>
            <button className="link danger" disabled={busy} onClick={() => save(list.filter((x) => x.id !== p.id))}>
              Delete
            </button>
          </li>
        ))}
        {!list.length && <li className="sheet-empty">No presets yet. Save the current settings below.</li>}
      </ul>
      <div className="sheet-form">
        <p className="sheet-sub">Save what the AC is doing now as a preset.</p>
        <div className="inline">
          <input className="field" placeholder="Name, e.g. Reading" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={busy || !name.trim() || !status} onClick={addCurrent}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}
