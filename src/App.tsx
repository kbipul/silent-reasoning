import { useMemo, useState } from 'react';
import { assess } from './engine/assess';
import { COT_CONTROL_ADHERENCE, DEFAULT_SELECTION, PROFILES } from './engine/catalog';
import type { ModelProfile } from './engine/types';
import { ControlPicker } from './components/ControlPicker';
import { ModeRow } from './components/ModeRow';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function App() {
  const [selection, setSelection] = useState<string[]>(DEFAULT_SELECTION);
  const [visible, setVisible] = useState(PROFILES[1].visibleReasoning);
  const [aware, setAware] = useState(PROFILES[1].evalAwareness);
  const [presetId, setPresetId] = useState(PROFILES[1].id);

  const profile: ModelProfile = useMemo(
    () => ({
      ...(PROFILES.find((p) => p.id === presetId) ?? PROFILES[1]),
      visibleReasoning: visible,
      evalAwareness: aware,
    }),
    [presetId, visible, aware],
  );

  const preset = PROFILES.find((p) => p.id === presetId)!;
  const onPreset = (p: ModelProfile) => {
    setPresetId(p.id);
    setVisible(p.visibleReasoning);
    setAware(p.evalAwareness);
  };

  const edited = visible !== preset.visibleReasoning || aware !== preset.evalAwareness;
  const result = useMemo(() => assess(selection, profile), [selection, profile]);
  const worst = useMemo(
    () => result.modes.reduce((a, b) => (b.drop > a.drop ? b : a), result.modes[0]),
    [result],
  );

  const toggle = (id: string) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="app">
      <header className="hero">
        <p className="kicker">Day 027 · kb-daily-builds</p>
        <h1>Silent Reasoning</h1>
        <p className="lede">
          GPT-6 Astra shipped on 3 September 2026 reasoning in latent space instead of writing its
          chain of thought down. Every think-piece since has asked whether that is safe. This asks
          the narrower, more useful question: <strong>which of the controls you already run stop
          working?</strong>
        </p>
      </header>

      <section className="panel dials">
        <h2>The model you are running</h2>
        <div className="presets">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === presetId ? 'preset active' : 'preset'}
              onClick={() => onPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <p className="source">
          {preset.source}
          {edited && <em> — dials edited from this preset.</em>}
        </p>

        <div className="slider">
          <label htmlFor="vis">
            Reasoning a monitor can actually read
            <span className="value">{pct(visible)}</span>
          </label>
          <input
            id="vis"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={visible}
            onChange={(e) => setVisible(Number(e.target.value))}
          />
          <p className="hint">
            Proxy, not a measurement: derived as 1 &minus; the published rate at which each model
            successfully followed instructions to hide its reasoning from a monitor —{' '}
            {pct(COT_CONTROL_ADHERENCE.sol)} for GPT-5.6 Sol, {pct(COT_CONTROL_ADHERENCE.astra)} for
            GPT-6 Astra. Being <em>able</em> to hide reasoning on demand is not the same quantity as
            how legible reasoning is by default. Drag it to whatever you believe.
          </p>
        </div>

        <div className="slider">
          <label htmlFor="aware">
            Evaluation awareness
            <span className="value">{pct(aware)}</span>
          </label>
          <input
            id="aware"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={aware}
            onChange={(e) => setAware(Number(e.target.value))}
          />
          <p className="hint">
            Estimated, not published. The system card reports that Astra verbalised markedly more
            evaluation awareness than Sol, but gives no figure that maps onto a dial. This one moves
            your offline evals and red-team suites, and nothing else.
          </p>
        </div>
      </section>

      <section className="panel summary">
        <div className="stat">
          <span className="stat-num">{pct(result.netStrength)}</span>
          <span className="stat-label">mean coverage now</span>
          <span className="stat-sub">was {pct(result.baselineStrength)} with reasoning fully visible</span>
        </div>
        <div className="stat">
          <span className="stat-num stat-bad">&minus;{Math.round(worst.drop * 100)}</span>
          <span className="stat-label">points off your worst-hit mode</span>
          <span className="stat-sub">{worst.mode.name}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{result.exposedCount}</span>
          <span className="stat-label">failure modes exposed</span>
          <span className="stat-sub">{result.thinCount} more running thin</span>
        </div>
        <div className="stat">
          <span className="stat-num">{pct(result.loadBearingShare)}</span>
          <span className="stat-label">load-bearing on visible reasoning</span>
          <span className="stat-sub">
            mean coverage lost across all modes at zero visibility — an average, so it
            understates the concentrated damage above
          </span>
        </div>
      </section>

      <div className="columns">
        <section className="panel board">
          <h2>Where that leaves you</h2>
          <ul className="modes">
            {result.modes.map((m) => (
              <ModeRow key={m.mode.id} result={m} />
            ))}
          </ul>
        </section>

        <aside className="side">
          <section className="panel">
            <h2>Your stack</h2>
            <p className="side-note">
              Defaults are a common shape: strong reasoning monitoring, an action policy, evals, and
              nothing reading internals. Untick what you do not run.
            </p>
            <ControlPicker selection={selection} onToggle={toggle} />
          </section>

          <section className="panel recs">
            <h2>What would help most</h2>
            {result.recommendations.length === 0 ? (
              <p className="side-note">Nothing left to add — you are running the whole catalog.</p>
            ) : (
              <ol>
                {result.recommendations.map((r) => (
                  <li key={r.control.id}>
                    <strong>{r.control.name}</strong>
                    <span className="rec-gain">+{pct(r.gain)} mean coverage</span>
                    <span className="rec-helps">{r.helps.join(' · ')}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="side-note">
              Ranked by measured gain against the dials as they are set right now — move the sliders
              and the ranking moves with them.
            </p>
          </section>
        </aside>
      </div>

      <section className="panel caveat">
        <h2>What this is and is not</h2>
        <p>
          This is a model, not a measurement. The coverage grid behind it — how much each control
          contributes against each failure mode, and how much of that contribution rests on readable
          reasoning — is a set of arguable engineering judgements, written out in full in{' '}
          <code>src/engine/catalog.ts</code> with a stated reason for every number. One figure is
          published (CoT-control adherence: {pct(COT_CONTROL_ADHERENCE.sol)} vs{' '}
          {pct(COT_CONTROL_ADHERENCE.astra)}); everything else is estimate or hypothesis and is
          labelled as such.
        </p>
        <p>
          Use it to find the shape of the problem, not to produce a number for a risk register. The
          shape is the point: a safety stack can look healthy and still be resting almost entirely on
          the model's willingness to narrate itself.
        </p>
      </section>

      <footer>
        Built by <a href="https://www.kumarbipul.com">Kumar Bipul</a> · IT Director &rarr; AI/ML ·{' '}
        <a href="https://github.com/kbipul/silent-reasoning">source</a>
      </footer>
    </div>
  );
}
