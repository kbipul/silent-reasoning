import type { ModeResult } from '../engine/types';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function ModeRow({ result }: { result: ModeResult }) {
  const { mode, baseline, current, drop, bucket, wentDark } = result;

  return (
    <li className={`mode ${bucket}`}>
      <div className="mode-head">
        <div>
          <h3>{mode.name}</h3>
          <p className="mode-note">{mode.note}</p>
        </div>
        <div className="mode-figure">
          <span className="mode-pct">{pct(current)}</span>
          <span className={`chip chip-${bucket}`}>{bucket}</span>
        </div>
      </div>

      <div className="bar" role="img" aria-label={`${pct(current)} covered, was ${pct(baseline)}`}>
        <div className="bar-ghost" style={{ width: pct(baseline) }} />
        <div className="bar-fill" style={{ width: pct(current) }} />
      </div>

      {drop > 0.01 ? (
        <p className="mode-drop">
          <strong>&minus;{pct(drop)}</strong> versus fully visible reasoning
        </p>
      ) : (
        <p className="mode-drop mode-drop-none">holds up — nothing here depended on readable reasoning</p>
      )}

      {wentDark.length > 0 && (
        <ul className="dark-list">
          {wentDark.map((c) => (
            <li key={c.id}>
              <span className="dark-dot" aria-hidden="true" />
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
