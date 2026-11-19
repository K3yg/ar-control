"use client";

/** Icon tiles for fan speed and airflow direction. */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const BLADE = "M12 10.6c-.4-2.9.6-5.6 2.9-6.4 1.6-.5 2.9.6 2.6 2.1-.4 2-2.6 3.6-5.5 4.3z";

/** A little fan. On the selected tile it spins, faster at each speed; auto gets an "A" badge. */
function FanIcon({ level, spinning }: { level: number | "auto"; spinning: boolean }) {
  const period = level === "auto" ? 1.6 : [0, 2.4, 1.4, 0.8, 0.42][level];
  return (
    <svg viewBox="0 0 24 24" width="26" height="26">
      <g className={spinning ? "fan-spin" : ""} style={{ "--spin": `${period}s` } as React.CSSProperties}>
        {[0, 120, 240].map((r) => (
          <path key={r} d={BLADE} fill="currentColor" transform={`translate(12 12) scale(1.22) translate(-12 -12) rotate(${r} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="1.9" fill="currentColor" />
      </g>
      {level === "auto" && (
        <g>
          <circle cx="19.5" cy="19.5" r="4.2" className="fan-badge" />
          <text x="19.5" y="21.6" textAnchor="middle" fontSize="6" fontWeight="700" fill="currentColor">
            A
          </text>
        </g>
      )}
    </svg>
  );
}

function SwingIcon({ mode }: { mode: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...stroke}>
      {mode === "fixed" && (
        <>
          <path d="M12 4v15" />
          <path d="M8 15l4 4 4-4" />
        </>
      )}
      {mode === "vertical" && (
        <>
          <path d="M12 3v18" />
          <path d="M8 7l4-4 4 4" />
          <path d="M8 17l4 4 4-4" />
        </>
      )}
      {mode === "horizontal" && (
        <>
          <path d="M3 12h18" />
          <path d="M7 8l-4 4 4 4" />
          <path d="M17 8l4 4-4 4" />
        </>
      )}
      {mode === "all" && (
        <>
          <path d="M12 3v18M3 12h18" />
          <path d="M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5" />
        </>
      )}
    </svg>
  );
}

const FAN: Record<string, { label: string; level: number | "auto" }> = {
  auto: { label: "Auto", level: "auto" },
  low: { label: "Low", level: 1 },
  medium: { label: "Med", level: 2 },
  high: { label: "High", level: 3 },
  turbo: { label: "Turbo", level: 4 },
};
const SWING: Record<string, string> = { fixed: "Still", vertical: "Up–down", horizontal: "Sideways", all: "All" };

function Tiles({
  title,
  note,
  items,
  value,
  disabled,
  onPick,
}: {
  title: string;
  note?: string;
  items: { id: string; label: string; icon: React.ReactNode; off?: boolean }[];
  value: string | null;
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className={`tiles-group ${disabled ? "inert" : ""}`}>
      <div className="group-head">
        <span>{title}</span>
      </div>
      <div className="tiles" role="radiogroup" aria-label={title} style={{ "--n": items.length } as React.CSSProperties}>
        {items.map((it) => (
          <button
            key={it.id}
            role="radio"
            aria-checked={it.id === value}
            className={`tile ${it.id === value ? "sel" : ""} ${it.off ? "off" : ""}`}
            onClick={() => it.id !== value && onPick(it.id)}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      {note && <p className="tiles-note">{note}</p>}
    </section>
  );
}

export function FanTiles({
  modes,
  value,
  windFree,
  disabled,
  onPick,
}: {
  modes: string[];
  value: string | null;
  windFree: boolean;
  disabled?: boolean;
  onPick: (m: string) => void;
}) {
  return (
    <Tiles
      title="Fan"
      note={windFree ? "WindFree is on. Changing the fan or the airflow turns it off." : undefined}
      value={value}
      disabled={disabled}
      onPick={onPick}
      items={modes.map((m) => ({
        id: m,
        label: FAN[m]?.label ?? m,
        icon: <FanIcon level={FAN[m]?.level ?? 0} spinning={!disabled && m === (windFree ? "auto" : value)} />,
        off: windFree && m !== "auto",
      }))}
    />
  );
}

export function SwingTiles({
  modes,
  value,
  windFree,
  disabled,
  onPick,
}: {
  modes: string[];
  value: string | null;
  windFree: boolean;
  disabled?: boolean;
  onPick: (m: string) => void;
}) {
  return (
    <Tiles
      title="Airflow"
      value={value}
      disabled={disabled}
      onPick={onPick}
      items={modes.map((m) => ({ id: m, label: SWING[m] ?? m, icon: <SwingIcon mode={m} />, off: windFree }))}
    />
  );
}
