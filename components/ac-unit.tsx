"use client";

/**
 * The AC, drawn in slight perspective, and also the fan/airflow control:
 * tap the air for the next fan speed, tap the unit for the next airflow direction.
 * The louver follows the swing mode, the number and speed of streams follow the fan,
 * and WindFree turns the air into a slow mist.
 */

const SPEED: Record<string, number> = { auto: 3.2, low: 4.8, medium: 3.2, high: 2.1, turbo: 1.3 };
const COUNT: Record<string, number> = { auto: 5, low: 3, medium: 5, high: 7, turbo: 9 };

function streams(n: number) {
  // Spread n streams evenly from -60 to 60.
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -60 + (120 * i) / (n - 1)));
}

export function AcUnit({
  on,
  fan,
  swing,
  windFree,
  display,
  temp,
  onAir,
  onBody,
}: {
  on: boolean;
  fan: string | null;
  swing: string | null;
  windFree: boolean;
  display: boolean;
  temp: number | null;
  onAir?: () => void;
  onBody?: () => void;
}) {
  const f = fan ?? "auto";
  const style = { "--flow": `${SPEED[f] ?? 3.2}s` } as React.CSSProperties;
  const cls = ["ac", on ? "is-on" : "is-off", windFree && on ? "is-windfree" : "", `swing-${swing ?? "fixed"}`, `fan-${f}`].join(" ");

  return (
    <div className={cls} style={style}>
      <div className="ac-body" onClick={onBody} aria-hidden>
        <div className="ac-top" />
        <div className="ac-front">
          <div className="ac-holes" />
          <div className={`ac-display ${display && on ? "lit" : ""}`}>{temp ?? ""}</div>
        </div>
        <div className="ac-bottom">
          {/* key: re-mount on change so the louver "settles" visibly */}
          <div className="ac-louver" key={swing ?? "fixed"} />
        </div>
      </div>

      <svg className="ac-air" viewBox="0 0 300 170" preserveAspectRatio="xMidYMin meet" onClick={onAir} aria-hidden>
        <defs>
          <radialGradient id="cool" cx="50%" cy="0%" r="75%">
            <stop offset="0%" stopColor="var(--stream)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--stream)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* invisible hit area so the whole air cone is tappable */}
        <rect x="0" y="0" width="300" height="170" fill="transparent" />
        <path className="air-glow" d="M70 0 L230 0 L300 170 L0 170 Z" fill="url(#cool)" />
        {/* key: a new set of streams on every fan change, with a short gust */}
        <g className="air-streams" key={f}>
          {streams(COUNT[f] ?? 5).map((x, i) => (
            <path
              key={x}
              className="stream"
              style={{ animationDelay: `${-i * 0.43}s, 0s` }}
              d={`M${150 + x * 0.6} 4 C ${150 + x * 0.9} 50, ${150 + x * 1.4} 90, ${150 + x * 1.9} 160`}
            />
          ))}
        </g>
        <g className="air-mist">
          {Array.from({ length: 26 }, (_, i) => (
            <circle
              key={i}
              className="mote"
              cx={60 + ((i * 37) % 180)}
              cy={6}
              r={i % 3 === 0 ? 1.6 : 1.1}
              style={{ animationDelay: `${-(i * 0.47) % 6}s`, "--drift": `${((i * 13) % 30) - 15}px` } as React.CSSProperties}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
