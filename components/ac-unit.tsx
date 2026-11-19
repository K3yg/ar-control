"use client";

/**
 * The AC, drawn in slight perspective. The louver follows the swing mode,
 * the air streams speed up with the fan, and WindFree turns the air into a slow mist.
 */

const SPEED: Record<string, number> = { auto: 3.2, low: 4.6, medium: 3.2, high: 2.1, turbo: 1.3 };

export function AcUnit({
  on,
  fan,
  swing,
  windFree,
  display,
  temp,
}: {
  on: boolean;
  fan: string | null;
  swing: string | null;
  windFree: boolean;
  display: boolean;
  temp: number | null;
}) {
  const duration = SPEED[fan ?? "auto"] ?? 3.2;
  const style = { "--flow": `${duration}s` } as React.CSSProperties;
  const cls = ["ac", on ? "is-on" : "is-off", windFree && on ? "is-windfree" : "", `swing-${swing ?? "fixed"}`].join(" ");

  return (
    <div className={cls} style={style} aria-hidden>
      <div className="ac-body">
        <div className="ac-top" />
        <div className="ac-front">
          <div className="ac-holes" />
          <div className={`ac-display ${display && on ? "lit" : ""}`}>{temp ?? ""}</div>
        </div>
        <div className="ac-bottom">
          <div className="ac-louver" />
        </div>
      </div>

      <svg className="ac-air" viewBox="0 0 300 170" preserveAspectRatio="xMidYMin meet">
        <defs>
          <radialGradient id="cool" cx="50%" cy="0%" r="75%">
            <stop offset="0%" stopColor="var(--stream)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--stream)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path className="air-glow" d="M70 0 L230 0 L300 170 L0 170 Z" fill="url(#cool)" />
        <g className="air-streams">
          {[-60, -30, 0, 30, 60].map((x, i) => (
            <path
              key={x}
              className="stream"
              style={{ animationDelay: `${-i * 0.55}s` }}
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
