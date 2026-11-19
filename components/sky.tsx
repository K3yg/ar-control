"use client";

import { useEffect, useState } from "react";

export type Phase = "dawn" | "day" | "sunset" | "night";

export function phaseFor(hour: number): Phase {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "sunset";
  return "night";
}

/** Current sky phase; `?sky=night` forces one (handy for screenshots). */
export function usePhase(): Phase {
  const [phase, setPhase] = useState<Phase>("day");
  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("sky") as Phase | null;
    const tick = () => setPhase(forced ?? phaseFor(new Date().getHours()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return phase;
}

const PHASES: Phase[] = ["dawn", "day", "sunset", "night"];

/** Stacked gradients that cross-fade when the phase changes. */
export function Sky({ phase }: { phase: Phase }) {
  return (
    <div className="sky" aria-hidden>
      {PHASES.map((p) => (
        <div key={p} className={`sky-layer sky-${p}`} style={{ opacity: p === phase ? 1 : 0 }} />
      ))}
      <div className="sky-stars" style={{ opacity: phase === "night" ? 1 : 0 }} />
    </div>
  );
}
