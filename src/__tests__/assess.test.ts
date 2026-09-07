import { describe, expect, it } from 'vitest';
import {
  MAX_BASE,
  MAX_DETECTION,
  assess,
  baseCoverage,
  bucketFor,
  combine,
  coverageForMode,
  effectiveCoverage,
  getControl,
  loadBearingShare,
  recommend,
} from '../engine/assess';
import { CONTROLS, DEFAULT_SELECTION, FAILURE_MODES, PROFILES } from '../engine/catalog';

const profile = (id: string) => PROFILES.find((p) => p.id === id)!;
const control = (id: string) => getControl(id)!;

describe('effectiveCoverage', () => {
  it('returns the base value when reasoning is fully visible and nothing is aware', () => {
    const c = control('cot-review');
    expect(effectiveCoverage(c, 'deceptive-tool-use', 1, 0)).toBe(
      baseCoverage('cot-review', 'deceptive-tool-use'),
    );
  });

  it('zeroes a fully CoT-dependent control when reasoning goes fully latent', () => {
    expect(effectiveCoverage(control('cot-keyword'), 'deceptive-tool-use', 0, 0)).toBe(0);
    expect(effectiveCoverage(control('cot-review'), 'reward-hacking', 0, 0)).toBe(0);
  });

  it('leaves action-layer controls untouched by visibility', () => {
    const c = control('tool-policy');
    const full = effectiveCoverage(c, 'exfiltration', 1, 0);
    expect(effectiveCoverage(c, 'exfiltration', 0, 0)).toBe(full);
    expect(effectiveCoverage(c, 'exfiltration', 0.4, 0)).toBe(full);
  });

  it('halves a fully CoT-dependent control at half visibility', () => {
    const c = control('cot-keyword');
    const full = effectiveCoverage(c, 'injection', 1, 0);
    expect(effectiveCoverage(c, 'injection', 0.5, 0)).toBeCloseTo(full * 0.5, 10);
  });

  it('applies only the dependent share for a partially dependent control', () => {
    const c = control('human-approval'); // cotDependence 0.15
    const full = effectiveCoverage(c, 'priv-escalation', 1, 0);
    expect(effectiveCoverage(c, 'priv-escalation', 0, 0)).toBeCloseTo(full * 0.85, 10);
  });

  it('degrades offline evals through evaluation awareness, not visibility', () => {
    const c = control('eval-suite');
    const full = effectiveCoverage(c, 'sandbagging', 1, 0);
    const aware = effectiveCoverage(c, 'sandbagging', 1, 1);
    expect(aware).toBeCloseTo(full * (1 - 0.8), 10);
  });

  it('leaves evaluation-awareness-free controls untouched by that dial', () => {
    const c = control('tool-policy');
    expect(effectiveCoverage(c, 'injection', 1, 1)).toBe(effectiveCoverage(c, 'injection', 1, 0));
  });

  it('applies both haircuts together', () => {
    const c = control('redteam'); // cot 0.25, eval 0.7
    const base = baseCoverage('redteam', 'injection');
    const expected = base * (1 - 0.25 * (1 - 0.5)) * (1 - 0.7 * 0.5);
    expect(effectiveCoverage(c, 'injection', 0.5, 0.5)).toBeCloseTo(expected, 10);
  });

  it('stays at zero for pairs with no base coverage', () => {
    expect(effectiveCoverage(control('output-filter'), 'runaway-loop', 1, 0)).toBe(0);
    expect(effectiveCoverage(control('output-filter'), 'runaway-loop', 0, 1)).toBe(0);
  });

  it('clamps out-of-range dials instead of producing nonsense', () => {
    const c = control('cot-keyword');
    const full = effectiveCoverage(c, 'injection', 1, 0);
    expect(effectiveCoverage(c, 'injection', 5, 0)).toBe(full);
    expect(effectiveCoverage(c, 'injection', -2, 0)).toBe(0);
  });

  it('never exceeds the base value or drops below zero', () => {
    for (const c of CONTROLS) {
      for (const m of FAILURE_MODES) {
        for (const v of [0, 0.25, 0.5, 0.75, 1]) {
          for (const a of [0, 0.5, 1]) {
            const e = effectiveCoverage(c, m.id, v, a);
            expect(e).toBeGreaterThanOrEqual(0);
            expect(e).toBeLessThanOrEqual(baseCoverage(c.id, m.id));
          }
        }
      }
    }
  });

  it('is monotonically non-increasing as visibility falls', () => {
    for (const c of CONTROLS) {
      let prev = effectiveCoverage(c, 'deceptive-tool-use', 1, 0);
      for (const v of [0.8, 0.6, 0.4, 0.2, 0]) {
        const next = effectiveCoverage(c, 'deceptive-tool-use', v, 0);
        expect(next).toBeLessThanOrEqual(prev + 1e-12);
        prev = next;
      }
    }
  });
});

describe('combine', () => {
  it('returns zero coverage for no controls', () => {
    expect(combine([])).toBe(0);
  });

  it('caps a single maximal control well below certainty', () => {
    expect(combine([MAX_BASE])).toBeCloseTo(MAX_DETECTION, 10);
    expect(combine([MAX_BASE])).toBeLessThan(1);
  });

  it('scales a single control linearly with its base value', () => {
    expect(combine([1.5])).toBeCloseTo(MAX_DETECTION / 2, 10);
    expect(combine([1])).toBeCloseTo(MAX_DETECTION / 3, 10);
  });

  it('ignores controls that contribute nothing', () => {
    expect(combine([1.5, 0, 0])).toBeCloseTo(combine([1.5]), 10);
  });

  it('discounts each control after the strongest', () => {
    const single = combine([MAX_BASE]);
    const doubled = combine([MAX_BASE, MAX_BASE]);
    const naiveIndependent = 1 - (1 - MAX_DETECTION) ** 2;
    expect(doubled).toBeGreaterThan(single);
    expect(doubled).toBeLessThan(naiveIndependent);
  });

  it('gives diminishing returns as depth is added', () => {
    const two = combine([2, 2]);
    const three = combine([2, 2, 2]);
    const four = combine([2, 2, 2, 2]);
    expect(three - two).toBeGreaterThan(0);
    expect(four - three).toBeGreaterThan(0);
    expect(four - three).toBeLessThan(three - two);
  });

  it('favours one strong control over three mediocre ones', () => {
    expect(combine([3, 1, 1])).toBeGreaterThan(combine([2, 2, 2]));
  });

  it('never reaches certainty, even with the whole catalogue at full strength', () => {
    expect(combine(Array(12).fill(MAX_BASE))).toBeLessThan(1);
  });

  it('is order independent', () => {
    expect(combine([0.5, 2, 1])).toBeCloseTo(combine([2, 1, 0.5]), 10);
    expect(combine([1, 0.5, 2])).toBeCloseTo(combine([2, 1, 0.5]), 10);
  });

  it('stays inside 0..1 for arbitrary inputs', () => {
    for (const xs of [[3, 3, 3], [0, 0], [2.9], [0.001, 0.002], [5, -1]]) {
      const v = combine(xs);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('bucketFor', () => {
  it('calls a well covered mode covered', () => {
    expect(bucketFor(0.9)).toBe('covered');
    expect(bucketFor(0.75)).toBe('covered');
  });

  it('calls a middling mode thin', () => {
    expect(bucketFor(0.74)).toBe('thin');
    expect(bucketFor(0.4)).toBe('thin');
  });

  it('calls a weak mode exposed', () => {
    expect(bucketFor(0.39)).toBe('exposed');
    expect(bucketFor(0)).toBe('exposed');
  });
});

describe('coverageForMode', () => {
  it('is zero with an empty stack', () => {
    expect(coverageForMode([], 'injection', 1, 0)).toBe(0);
  });

  it('ignores control ids that do not exist', () => {
    const real = coverageForMode(['tool-policy'], 'injection', 1, 0);
    expect(coverageForMode(['tool-policy', 'not-a-control'], 'injection', 1, 0)).toBe(real);
  });

  it('never decreases when a control is added', () => {
    for (const m of FAILURE_MODES) {
      const before = coverageForMode(DEFAULT_SELECTION, m.id, 0.5, 0.5);
      const after = coverageForMode([...DEFAULT_SELECTION, 'probes'], m.id, 0.5, 0.5);
      expect(after).toBeGreaterThanOrEqual(before - 1e-12);
    }
  });
});

describe('loadBearingShare', () => {
  it('is zero for a stack that reads no reasoning at all', () => {
    expect(loadBearingShare(['tool-policy', 'egress', 'loop-guard'])).toBeCloseTo(0, 10);
  });

  it('is one for a stack made only of chain-of-thought monitors', () => {
    expect(loadBearingShare(['cot-keyword', 'cot-review'])).toBeCloseTo(1, 10);
  });

  it('is zero for an empty stack rather than dividing by zero', () => {
    expect(loadBearingShare([])).toBe(0);
    expect(Number.isNaN(loadBearingShare([]))).toBe(false);
  });

  it('puts a typical stack somewhere in between', () => {
    const share = loadBearingShare(DEFAULT_SELECTION);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });
});

describe('recommend', () => {
  it('never suggests a control already in the stack', () => {
    const recs = recommend(DEFAULT_SELECTION, 0.4, 0.6);
    for (const r of recs) {
      expect(DEFAULT_SELECTION).not.toContain(r.control.id);
    }
  });

  it('only suggests controls that actually help', () => {
    for (const r of recommend(DEFAULT_SELECTION, 0.4, 0.6)) {
      expect(r.gain).toBeGreaterThan(0);
      expect(r.helps.length).toBeGreaterThan(0);
    }
  });

  it('returns suggestions strongest first', () => {
    const gains = recommend(DEFAULT_SELECTION, 0.4, 0.6, 5).map((r) => r.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it('respects the limit', () => {
    expect(recommend(DEFAULT_SELECTION, 0.4, 0.6, 2).length).toBeLessThanOrEqual(2);
  });

  it('suggests nothing when every control is already selected', () => {
    expect(recommend(CONTROLS.map((c) => c.id), 0.4, 0.6)).toEqual([]);
  });

  it('reaches for controls that survive latent reasoning once reasoning goes dark', () => {
    const stack = ['cot-keyword', 'cot-review'];
    const recs = recommend(stack, 0.05, 0.7, 12);
    const suggested = recs.map((r) => r.control.id);
    expect(suggested).toContain('tool-policy');
    // a third CoT monitor is worth almost nothing here
    const classifier = recs.find((r) => r.control.id === 'cot-classifier');
    const policy = recs.find((r) => r.control.id === 'tool-policy')!;
    expect(policy.gain).toBeGreaterThan(classifier?.gain ?? 0);
  });
});

describe('assess', () => {
  it('reports one row per failure mode', () => {
    const a = assess(DEFAULT_SELECTION, profile('astra'));
    expect(a.modes).toHaveLength(FAILURE_MODES.length);
  });

  it('finds no drop at all under the verbose-CoT upper bound', () => {
    const a = assess(DEFAULT_SELECTION, profile('verbose'));
    for (const m of a.modes) {
      expect(m.drop).toBeCloseTo(0, 10);
      expect(m.wentDark).toEqual([]);
    }
    expect(a.netStrength).toBeCloseTo(a.baselineStrength, 10);
  });

  it('weakens the typical stack when moving from Sol to Astra', () => {
    const sol = assess(DEFAULT_SELECTION, profile('sol'));
    const astra = assess(DEFAULT_SELECTION, profile('astra'));
    expect(astra.netStrength).toBeLessThan(sol.netStrength);
    expect(astra.exposedCount + astra.thinCount).toBeGreaterThanOrEqual(
      sol.exposedCount + sol.thinCount,
    );
  });

  it('names the controls that went dark, worst first', () => {
    const a = assess(DEFAULT_SELECTION, profile('astra'));
    const deceptive = a.modes.find((m) => m.mode.id === 'deceptive-tool-use')!;
    expect(deceptive.wentDark.length).toBeGreaterThan(0);
    const lost = deceptive.wentDark.map((c) => c.lost);
    expect(lost).toEqual([...lost].sort((a2, b) => b - a2));
    expect(deceptive.wentDark.map((c) => c.id)).toContain('cot-review');
  });

  it('never reports an action-layer control as having gone dark', () => {
    const a = assess(DEFAULT_SELECTION, profile('opaque'));
    for (const m of a.modes) {
      for (const c of m.wentDark) {
        expect(['tool-policy', 'output-filter', 'loop-guard']).not.toContain(c.id);
      }
    }
  });

  it('keeps drop non-negative and coverage inside 0..1 for every profile', () => {
    for (const p of PROFILES) {
      const a = assess(DEFAULT_SELECTION, p);
      for (const m of a.modes) {
        expect(m.drop).toBeGreaterThanOrEqual(0);
        expect(m.current).toBeGreaterThanOrEqual(0);
        expect(m.current).toBeLessThanOrEqual(1);
        expect(m.baseline).toBeGreaterThanOrEqual(m.current - 1e-12);
      }
      expect(a.netStrength).toBeLessThanOrEqual(a.baselineStrength + 1e-12);
    }
  });

  it('exposes everything when the stack is empty', () => {
    const a = assess([], profile('sol'));
    expect(a.exposedCount).toBe(FAILURE_MODES.length);
    expect(a.netStrength).toBe(0);
    expect(a.loadBearingShare).toBe(0);
  });

  it('leaves sandbagging as the mode that offline evals cannot rescue', () => {
    const a = assess(DEFAULT_SELECTION, profile('astra'));
    const sandbagging = a.modes.find((m) => m.mode.id === 'sandbagging')!;
    expect(sandbagging.wentDark.map((c) => c.id)).toContain('eval-suite');
    expect(sandbagging.current).toBeLessThan(sandbagging.baseline);
  });

  it('recommends interpretability probes to a stack that has lost its reasoning monitors', () => {
    const a = assess(['cot-keyword', 'cot-review', 'output-filter'], profile('opaque'));
    expect(a.recommendations.length).toBeGreaterThan(0);
    expect(a.recommendations.every((r) => r.gain > 0)).toBe(true);
  });

  it('degrades monotonically across the four presets', () => {
    const order = ['verbose', 'sol', 'astra', 'opaque'];
    const strengths = order.map((id) => assess(DEFAULT_SELECTION, profile(id)).netStrength);
    expect(strengths).toEqual([...strengths].sort((a2, b) => b - a2));
  });
});
