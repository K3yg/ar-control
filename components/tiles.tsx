"use client";

/** Icon tiles for fan speed and airflow direction. */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Four ascending bars filled up to the level; auto is an "A". */
function FanIcon({ level }: { level: number | "auto" }) {
  if (level === "auto")
    return (
      <svg viewBox="0 0 28 24" width="28" height="24" {...stroke}>
        <path d="M8.5 20L14 5l5.5 15M10.4 15h7.2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 28 24" width="28" height="24">
      {[0, 1, 2, 3].map((i) => {
        const h = 5 + i * 4.5;
        return <rect key={i} x={3 + i * 6} y={21 - h} width="4" height={h} rx="1.6" fill="currentColor" opacity={i < level ? 1 : 0.22} />;
      })}
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
      note={windFree ? "WindFree runs the fan on auto. Picking a speed turns WindFree off." : undefined}
      value={value}
      disabled={disabled}
      onPick={onPick}
      items={modes.map((m) => ({
        id: m,
        label: FAN[m]?.label ?? m,
        icon: <FanIcon level={FAN[m]?.level ?? 0} />,
        off: windFree && m !== "auto",
      }))}
    />
  );
}

export function SwingTiles({
  modes,
  value,
  disabled,
  onPick,
}: {
  modes: string[];
  value: string | null;
  disabled?: boolean;
  onPick: (m: string) => void;
}) {
  return (
    <Tiles
      title="Airflow"
      value={value}
      disabled={disabled}
      onPick={onPick}
      items={modes.map((m) => ({ id: m, label: SWING[m] ?? m, icon: <SwingIcon mode={m} /> }))}
    />
  );
}
