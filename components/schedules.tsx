"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Preset, PresetState } from "./presets";
import { Sheet } from "./sheet";

type Action = { preset: string } | { state: PresetState };
type Schedule = { id: string; name?: string; time: string; days: number[]; once: boolean; action: Action };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function when(s: Schedule) {
  if (s.once) return "Once";
  if (!s.days.length || s.days.length === 7) return "Every day";
  const d = [...s.days].sort().join(",");
  if (d === "1,2,3,4,5") return "Weekdays";
  if (d === "0,6") return "Weekends";
  return s.days.map((i) => DAYS[i]).join(", ");
}

function what(a: Action, presets: Preset[]) {
  if ("preset" in a) return presets.find((p) => p.id === a.preset)?.name ?? a.preset;
  return a.state.power === "off" ? "Turn off" : "Turn on";
}

export function Schedules({
  presets,
  flash,
  open,
  onOpen,
  onClose,
}: {
  presets: Preset[];
  flash: (m: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [time, setTime] = useState("04:00");
  const [action, setAction] = useState("off");
  const [days, setDays] = useState<number[]>([]);
  const [once, setOnce] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ schedules: Schedule[] }>("/api/schedules")
      .then((d) => setItems(d.schedules))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    setBusy(true);
    const act: Action = action === "off" ? { state: { power: "off" } } : action === "on" ? { state: { power: "on" } } : { preset: action };
    try {
      await api("/api/schedules", { method: "POST", body: JSON.stringify({ time, days, once, action: act }) });
      flash(`Scheduled for ${time}`);
      load();
      onClose();
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setItems((l) => l?.filter((s) => s.id !== id) ?? null);
    await api(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((e) => {
      flash((e as Error).message);
      load();
    });
  };

  return (
    <section className="group">
      <div className="group-head">
        <span>Schedules</span>
        <button className="link" onClick={onOpen}>
          Add
        </button>
      </div>
      {items && !items.length && <p className="empty">Nothing scheduled. Add one to turn the AC on or off at a set time.</p>}
      <ul className="sched-list">
        {items?.map((s) => (
          <li key={s.id}>
            <span className="sched-time">{s.time}</span>
            <span className="sched-what">
              {what(s.action, presets)}
              <span className="sched-when">{when(s)}</span>
            </span>
            <button className="link danger" onClick={() => remove(s.id)} aria-label={`Delete ${s.time} schedule`}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Sheet title="New schedule" onClose={onClose}>
          <div className="sheet-form">
            <label className="field-row">
              <span>Time</span>
              <input className="field time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="field-row">
              <span>Do</span>
              <select className="field" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="off">Turn off</option>
                <option value="on">Turn on</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <span>Runs</span>
              <div className="seg small">
                <button className={once ? "sel" : ""} onClick={() => setOnce(true)}>
                  Once
                </button>
                <button className={!once ? "sel" : ""} onClick={() => setOnce(false)}>
                  Repeats
                </button>
              </div>
            </div>
            {!once && (
              <div className="days" role="group" aria-label="Days">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    aria-pressed={days.includes(i)}
                    className={days.includes(i) ? "sel" : ""}
                    onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}
                  >
                    {d[0]}
                  </button>
                ))}
                <span className="sheet-sub">{days.length ? "" : "No days picked means every day."}</span>
              </div>
            )}
            <button className="btn wide" disabled={busy} onClick={add}>
              {busy ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
