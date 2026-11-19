"use client";

/**
 * A Samsung WindFree wall unit, drawn in slight perspective and animated from the real state:
 * - normal cooling: the blade opens and air streams come out of the bottom outlet;
 *   the number and speed of streams follow the fan, their sweep follows the airflow setting.
 * - WindFree: the blade closes and the air seeps out of the front micro-holes as a slow mist.
 * The temperature display sits on the right, like on the real unit.
 */

const SPEED: Record<string, number> = { auto: 3.2, low: 4.8, medium: 3.2, high: 2.1, turbo: 1.3 };
const COUNT: Record<string, number> = { auto: 5, low: 3, medium: 5, high: 7, turbo: 9 };

const spread = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -60 + (120 * i) / (n - 1)));

// Deterministic pseudo-random positions for the mist motes.
const MOTES = Array.from({ length: 34 }, (_, i) => ({
  x: 18 + ((i * 53) % 236),
  y: 14 + ((i * 29) % 58),
  r: i % 4 === 0 ? 1.7 : 1.2,
  delay: -((i * 0.61) % 7),
  drift: ((i * 17) % 26) - 13,
}));

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
  const f = fan ?? "auto";
  const wf = on && windFree;
  const style = { "--flow": `${SPEED[f] ?? 3.2}s` } as React.CSSProperties;
  const cls = ["ac", on ? "is-on" : "is-off", wf ? "is-windfree" : "", `swing-${swing ?? "fixed"}`].join(" ");

  return (
    <div className={cls} style={style} aria-hidden>
      <div className="ac-body">
        <div className="ac-top" />
        <div className="ac-front">
          <div className="ac-holes" />
          <div className={`ac-display ${display && on ? "lit" : ""}`}>
            {wf && <span className="ac-display-wf" />}
            {temp ?? ""}
          </div>
        </div>
        <div className="ac-bottom">
          <div className="ac-louver" key={`${swing}-${wf}`} />
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
        <g className="air-streams" key={f}>
          {spread(COUNT[f] ?? 5).map((x, i) => (
            <path
              key={x}
              className="stream"
              style={{ animationDelay: `${-i * 0.43}s, 0s` }}
              d={`M${150 + x * 0.6} 4 C ${150 + x * 0.9} 50, ${150 + x * 1.4} 90, ${150 + x * 1.9} 160`}
            />
          ))}
        </g>
      </svg>

      {/* WindFree: mist from the front panel, drifting down past the unit */}
      <svg className="ac-mist" viewBox="0 0 272 250" preserveAspectRatio="xMidYMin meet">
        {MOTES.map((m, i) => (
          <circle
            key={i}
            className="mote"
            cx={m.x}
            cy={m.y}
            r={m.r}
            style={{ animationDelay: `${m.delay}s`, "--drift": `${m.drift}px` } as React.CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}
