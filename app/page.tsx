"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = {
  power: "on" | "off" | null;
  mode: string | null;
  targetTemp: number | null;
  currentTemp: number | null;
  windFree: boolean | null;
  display: boolean | null;
  online: boolean;
};

type Phase = "loading" | "locked" | "reauth" | "ready" | "error";

const MIN = 16;
const MAX = 30;
const SLEEP = { power: "on" as const, targetTemp: 25, windFree: true, display: false };

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<Status | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reauthReason, setReauthReason] = useState<string | null>(null);

  const quietUntil = useRef(0); // ignora polls logo após um comando (a nuvem demora a refletir)
  const tempTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempBase = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<Status | null>(null);
  statusRef.current = status;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() < quietUntil.current) return;
    try {
      const res = await fetch("/api/ac", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data.error === "unauthorized") return setPhase("locked");
      if (data.needsReauth) {
        setReauthReason(data.reason ?? null);
        return setPhase("reauth");
      }
      if (!res.ok) {
        setPhase((p) => (p === "ready" ? p : "error"));
        return flash(data.message ?? "Erro ao ler o status");
      }
      if (!force && Date.now() < quietUntil.current) return;
      setStatus(data);
      setPhase("ready");
    } catch {
      flash("Sem conexão");
      setPhase((p) => (p === "loading" ? "error" : p));
    }
  }, [flash]);

  // Status ao abrir e a cada 30s com a página visível.
  useEffect(() => {
    load(true);
    const auth = new URLSearchParams(location.search).get("auth");
    if (auth) {
      flash(auth === "ok" ? "SmartThings conectado" : "Falha ao conectar o SmartThings");
      history.replaceState(null, "", "/");
    }
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, flash]);

  /** Envia o estado desejado com UI otimista; reverte para `prev` se falhar. */
  const send = useCallback(
    async (body: Record<string, unknown>, prev: Status | null, url = "/api/ac") => {
      quietUntil.current = Date.now() + 6000;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (data.error === "unauthorized") return setPhase("locked");
        if (data.needsReauth) {
          setReauthReason(data.message ?? null);
          return setPhase("reauth");
        }
        if (!res.ok) throw new Error(data.message ?? "Comando falhou");
        setTimeout(() => load(true), 6000);
      } catch (e) {
        quietUntil.current = 0;
        setStatus(prev);
        flash(e instanceof Error ? e.message : "Comando falhou");
      }
    },
    [load, flash],
  );

  const apply = (patch: Partial<Status>, body: Record<string, unknown>, url?: string) => {
    if (!status) return;
    const prev = status;
    setStatus({ ...status, ...patch });
    send(body, prev, url);
  };

  const togglePower = () => {
    const on = status?.power !== "on";
    apply({ power: on ? "on" : "off" }, { power: on ? "on" : "off" });
  };

  const stepTemp = (delta: number) => {
    if (!status) return;
    const current = status.targetTemp ?? 25;
    const next = Math.min(MAX, Math.max(MIN, current + delta));
    if (next === current) return;
    if (tempBase.current === null) tempBase.current = current;
    quietUntil.current = Date.now() + 8000;
    setStatus({ ...status, targetTemp: next });
    if (tempTimer.current) clearTimeout(tempTimer.current);
    tempTimer.current = setTimeout(() => {
      const base = tempBase.current;
      tempBase.current = null;
      const s = statusRef.current;
      if (s) send({ temp: next }, { ...s, targetTemp: base });
    }, 600);
  };

  if (phase === "locked") return <Unlock onDone={() => load(true)} />;

  const on = status?.power === "on";
  const offline = status && !status.online;

  return (
    <main className="app">
      <header className="top">
        <span className="title">Ar</span>
        <span className={`meta ${offline ? "err" : ""}`}>
          {phase === "loading" ? "…" : offline ? "offline" : status ? (on ? "ligado" : "desligado") : ""}
        </span>
      </header>

      {phase === "reauth" ? (
        <PatForm
          reason={reauthReason}
          onDone={() => {
            flash("Token salvo");
            load(true);
          }}
        />
      ) : (
        <>
          <section className="temp">
            <button className="step" onClick={() => stepTemp(-1)} disabled={!status || (status.targetTemp ?? 0) <= MIN} aria-label="Diminuir">
              −
            </button>
            <div className="temp-value">
              <div className={`temp-num ${on ? "" : "off"}`}>{status?.targetTemp ?? "--"}°</div>
              <div className="temp-sub">
                {status?.currentTemp != null ? `ambiente ${status.currentTemp}°` : " "}
              </div>
            </div>
            <button className="step" onClick={() => stepTemp(1)} disabled={!status || (status.targetTemp ?? 99) >= MAX} aria-label="Aumentar">
              +
            </button>
          </section>

          <div className="list">
            <Row label="Ligado" value={status?.power == null ? null : on} onClick={togglePower} disabled={!status} />
            <Row
              label="WindFree"
              value={status?.windFree ?? null}
              disabled={!status || !on}
              onClick={() => apply({ windFree: !status?.windFree }, { windFree: !status?.windFree })}
            />
            <Row
              label="Display"
              value={status?.display ?? null}
              disabled={!status || !on}
              onClick={() => {
                const next = !(status?.display ?? true);
                apply({ display: next }, { display: next });
              }}
            />
            <button
              className="row"
              disabled={!status}
              onClick={() => apply(SLEEP, {}, "/api/ac/preset/sleep")}
            >
              <span className="row-label">
                Dormir
                <span className="row-sub">25° · windfree · display off</span>
              </span>
              <span className="chev">→</span>
            </button>
          </div>
        </>
      )}

      <div className="spacer" />
      <footer className="foot">
        <span className="meta">{status?.mode && on ? status.mode : ""}</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Row({
  label,
  value,
  onClick,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="row" onClick={onClick} disabled={disabled} role="switch" aria-checked={!!value}>
      <span className="row-label">{label}</span>
      <span className={`toggle ${value ? "on" : ""} ${value === null ? "unknown" : ""}`} />
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
    const res = await fetch("/api/pat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) {
      setToken("");
      onDone();
    } else setErr(data?.message ?? "Falhou");
  };

  return (
    <form className="center" onSubmit={submit}>
      <p>
        {reason && reason !== "Nenhum login feito" ? reason : "Cole um token do SmartThings para conectar."}{" "}
        Gere em{" "}
        <a className="link" href="https://account.smartthings.com/tokens" target="_blank" rel="noreferrer">
          account.smartthings.com/tokens
        </a>{" "}
        com as permissões de Devices.
      </p>
      <input
        className="field"
        placeholder="token"
        autoComplete="off"
        spellCheck={false}
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      {err && <span className="meta err">{err}</span>}
      <button className="btn" disabled={busy || !token}>
        {busy ? "…" : "Salvar"}
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
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) onDone();
    else setErr(true);
  };

  return (
    <main className="app">
      <header className="top">
        <span className="title">Ar</span>
      </header>
      <form className="center" onSubmit={submit}>
        <p>Cole a chave de acesso. Só é pedida uma vez neste aparelho.</p>
        <input
          className="field"
          type="password"
          autoComplete="current-password"
          placeholder="AC_API_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        {err && <span className="meta err">chave inválida</span>}
        <button className="btn" disabled={busy || !key}>
          {busy ? "…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
