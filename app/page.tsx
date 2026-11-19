"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AcUnit } from "@/components/ac-unit";
import { Sky, usePhase } from "@/components/sky";
import { Presets, type Preset } from "@/components/presets";
import { Schedules } from "@/components/schedules";
import { api, type Status } from "@/components/api";

type Screen = "loading" | "locked" | "reauth" | "ready" | "error";

const MODE_LABEL: Record<string, string> = { auto: "Auto", cool: "Cool", dry: "Dry", wind: "Fan", heat: "Heat" };
const FAN_LABEL: Record<string, string> = { auto: "Auto", low: "Low", medium: "Med", high: "High", turbo: "Turbo" };
const SWING_LABEL: Record<string, string> = { fixed: "Still", vertical: "Up–down", horizontal: "Sideways", all: "All" };

export default function Home() {
  const phase = usePhase();
  const [screen, setScreen] = useState<Screen>("loading");
  const [status, setStatus] = useState<Status | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [sheet, setSheet] = useState<"presets" | "schedules" | null>(null);

  const quietUntil = useRef(0); // the cloud takes a few seconds to reflect a command
  const tempTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempBase = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<Status | null>(null);
  statusRef.current = status;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const handleAuthError = useCallback((data: Record<string, unknown> | undefined) => {
    if (data?.error === "unauthorized") return setScreen("locked"), true;
    if (data?.needsReauth) {
      setReason((data.reason as string) ?? (data.message as string) ?? null);
      return setScreen("reauth"), true;
    }
    return false;
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!force && Date.now() < quietUntil.current) return;
      try {
        const data = await api<Status & { needsReauth?: boolean; reason?: string }>("/api/ac");
        if (handleAuthError(data)) return;
        if (!force && Date.now() < quietUntil.current) return;
        setStatus(data);
        setScreen("ready");
      } catch (e) {
        const data = (e as { data?: Record<string, unknown> }).data;
        if (handleAuthError(data)) return;
        flash((e as Error).message);
        setScreen((s) => (s === "loading" ? "error" : s));
      }
    },
    [flash, handleAuthError],
  );

  const loadPresets = useCallback(() => {
    api<{ presets: Preset[] }>("/api/presets").then((d) => setPresets(d.presets)).catch(() => {});
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (screen === "ready") loadPresets();
  }, [screen, loadPresets]);

  /** Sends a desired state with an optimistic UI; reverts to `prev` on failure. */
  const send = useCallback(
    async (body: Record<string, unknown>, prev: Status | null, url = "/api/ac") => {
      quietUntil.current = Date.now() + 6000;
      try {
        await api(url, { method: "POST", body: JSON.stringify(body) });
        setTimeout(() => load(true), 6000);
      } catch (e) {
        quietUntil.current = 0;
        setStatus(prev);
        if (!handleAuthError((e as { data?: Record<string, unknown> }).data)) flash((e as Error).message);
      }
    },
    [load, flash, handleAuthError],
  );

  const apply = (patch: Partial<Status>, body: Record<string, unknown>, url?: string) => {
    if (!status) return;
    const prev = status;
    setStatus({ ...status, ...patch });
    send(body, prev, url);
  };

  const stepTemp = (delta: number) => {
    const s = statusRef.current;
    if (!s) return;
    const current = s.targetTemp ?? 24;
    const next = Math.min(s.maxTemp, Math.max(s.minTemp, current + delta));
    if (next === current) return;
    if (tempBase.current === null) tempBase.current = current;
    quietUntil.current = Date.now() + 8000;
    setStatus({ ...s, targetTemp: next });
    if (tempTimer.current) clearTimeout(tempTimer.current);
    tempTimer.current = setTimeout(() => {
      const base = tempBase.current;
      tempBase.current = null;
      const latest = statusRef.current;
      if (latest) send({ temp: next }, { ...latest, targetTemp: base });
    }, 600);
  };

  const runPreset = (p: Preset) => {
    const st = p.state;
    apply(
      {
        ...(st.power ? { power: st.power } : {}),
        ...(st.temp ? { targetTemp: st.temp } : {}),
        ...(st.mode ? { mode: st.mode } : {}),
        ...(st.fan ? { fanMode: st.fan } : {}),
        ...(st.swing ? { swing: st.swing } : {}),
        ...(st.windFree !== undefined ? { windFree: st.windFree } : {}),
        ...(st.display !== undefined ? { display: st.display } : {}),
      },
      {},
      `/api/ac/preset/${p.id}`,
    );
    flash(`${p.name} applied`);
  };

  const on = status?.power === "on";
  const windFree = !!status?.windFree;

  return (
    <div className={`root phase-${phase}`}>
      <Sky phase={phase} />
      {screen === "locked" ? (
        <Unlock onDone={() => load(true)} />
      ) : (
        <main className="app">
          <header className="bar">
            <span className="brand">Air</span>
            <span className={`state ${status && !status.online ? "warn" : ""}`}>
              {screen === "loading" ? "Connecting…" : !status ? "" : !status.online ? "Offline" : on ? "Running" : "Off"}
            </span>
          </header>

          {screen === "reauth" ? (
            <PatForm reason={reason} onDone={() => (flash("Token saved"), load(true))} />
          ) : (
            <>
              <section className="hero">
                <AcUnit
                  on={on}
                  fan={status?.fanMode ?? null}
                  swing={status?.swing ?? null}
                  windFree={windFree}
                  display={status?.display ?? true}
                  temp={status?.targetTemp ?? null}
                />
              </section>

              <section className="temp">
                <button className="step" onClick={() => stepTemp(-1)} disabled={!status || !on} aria-label="Cooler">
                  −
                </button>
                <div className="temp-read">
                  <div className={`temp-num ${on ? "" : "dim"}`}>
                    {status?.targetTemp ?? "–"}
                    <span className="deg">°</span>
                  </div>
                  <div className="temp-room">{status?.currentTemp != null ? `${status.currentTemp}° in the room` : " "}</div>
                </div>
                <button className="step" onClick={() => stepTemp(1)} disabled={!status || !on} aria-label="Warmer">
                  +
                </button>
              </section>

              <div className="power-wrap">
                <button
                  className={`power ${on ? "on" : ""}`}
                  disabled={!status}
                  onClick={() => apply({ power: on ? "off" : "on" }, { power: on ? "off" : "on" })}
                >
                  {on ? "Turn off" : "Turn on"}
                </button>
              </div>

              <section className={`controls ${on ? "" : "inert"}`}>
                <Choice
                  label="Mode"
                  options={status?.modes ?? []}
                  value={status?.mode ?? null}
                  names={MODE_LABEL}
                  onPick={(m) => apply({ mode: m, ...(m !== "cool" ? { windFree: false } : {}) }, { mode: m })}
                />
                <Choice
                  label="Fan"
                  options={status?.fanModes ?? []}
                  value={status?.fanMode ?? null}
                  names={FAN_LABEL}
                  note={windFree ? "WindFree keeps the fan on auto. Picking a speed turns it off." : undefined}
                  onPick={(f) =>
                    apply({ fanMode: f, ...(f !== "auto" && windFree ? { windFree: false } : {}) }, { fan: f })
                  }
                />
                <Choice
                  label="Airflow"
                  options={status?.swingModes ?? []}
                  value={status?.swing ?? null}
                  names={SWING_LABEL}
                  onPick={(s) => apply({ swing: s }, { swing: s })}
                />
                <Switch
                  label="WindFree"
                  hint="Cools without direct wind"
                  value={status?.windFree ?? null}
                  onToggle={() => apply({ windFree: !windFree, ...(!windFree ? { mode: "cool", fanMode: "auto" } : {}) }, { windFree: !windFree })}
                />
                <Switch
                  label="Display"
                  value={status?.display ?? null}
                  onToggle={() => {
                    const next = !(status?.display ?? true);
                    apply({ display: next }, { display: next });
                  }}
                />
              </section>

              <section className="group">
                <div className="group-head">
                  <span>Presets</span>
                  <button className="link" onClick={() => setSheet("presets")}>
                    Edit
                  </button>
                </div>
                <div className="chips">
                  {presets.map((p) => (
                    <button key={p.id} className="chip" disabled={!status} onClick={() => runPreset(p)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </section>

              <Schedules presets={presets} flash={flash} open={sheet === "schedules"} onOpen={() => setSheet("schedules")} onClose={() => setSheet(null)} />

              <section className="group">
                <button className="details-toggle" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
                  Details
                </button>
                {details && status && (
                  <dl className="details">
                    <div>
                      <dt>Humidity</dt>
                      <dd>{status.humidity != null ? `${status.humidity}%` : "–"}</dd>
                    </div>
                    <div>
                      <dt>Drawing now</dt>
                      <dd>{status.watts != null ? `${status.watts} W` : "–"}</dd>
                    </div>
                    <div>
                      <dt>Used so far</dt>
                      <dd>{status.energyKwh != null ? `${status.energyKwh} kWh` : "–"}</dd>
                    </div>
                  </dl>
                )}
              </section>
            </>
          )}

          {sheet === "presets" && (
            <Presets
              presets={presets}
              status={status}
              onClose={() => setSheet(null)}
              onSaved={(list) => {
                setPresets(list);
                flash("Presets saved");
              }}
              flash={flash}
            />
          )}
        </main>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  names,
  note,
  onPick,
}: {
  label: string;
  options: string[];
  value: string | null;
  names: Record<string, string>;
  note?: string;
  onPick: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} role="radio" aria-checked={o === value} className={o === value ? "sel" : ""} onClick={() => o !== value && onPick(o)}>
            {names[o] ?? o}
          </button>
        ))}
      </div>
      {note && <p className="row-note">{note}</p>}
    </div>
  );
}

function Switch({ label, hint, value, onToggle }: { label: string; hint?: string; value: boolean | null; onToggle: () => void }) {
  return (
    <button className="row switch-row" role="switch" aria-checked={!!value} onClick={onToggle}>
      <span className="row-label">
        {label}
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <span className={`switch ${value ? "on" : ""} ${value === null ? "unknown" : ""}`} />
    </button>
  );
}

function PatForm({ reason, onDone }: { reason: string | null; onDone: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/pat", { method: "POST", body: JSON.stringify({ token: token.trim() }) });
      setToken("");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="center" onSubmit={submit}>
      <h1 className="center-title">{reason && reason !== "Not connected yet" ? "SmartThings token expired" : "Connect SmartThings"}</h1>
      <p>
        Paste a personal access token with the Devices permissions. Create one at{" "}
        <a href="https://account.smartthings.com/tokens" target="_blank" rel="noreferrer">
          account.smartthings.com/tokens
        </a>
        . The refresher robot does this for you every 12 hours.
      </p>
      <input className="field" placeholder="Token" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
      {err && <span className="err">{err}</span>}
      <button className="btn" disabled={busy || !token}>
        {busy ? "Saving…" : "Save token"}
      </button>
    </form>
  );
}

function Unlock({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    const ok = await api("/api/session", { method: "POST", body: JSON.stringify({ key: key.trim() }) })
      .then(() => true)
      .catch(() => false);
    setBusy(false);
    if (ok) onDone();
    else setErr(true);
  };

  return (
    <main className="app">
      <header className="bar">
        <span className="brand">Air</span>
      </header>
      <form className="center" onSubmit={submit}>
        <h1 className="center-title">Unlock</h1>
        <p>Enter the access key. This device will remember it.</p>
        <input className="field" type="password" autoComplete="current-password" placeholder="Access key" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        {err && <span className="err">That key didn't work.</span>}
        <button className="btn" disabled={busy || !key}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
