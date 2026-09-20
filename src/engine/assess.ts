import { CONTROLS, COVERAGE, FAILURE_MODES } from './catalog';
import type {
  Assessment,
  Bucket,
  Control,
  LostControl,
  ModeResult,
  ModelProfile,
  Recommendation,
} from './types';

export const MAX_BASE = 3;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function getControl(id: string): Control | undefined {
  return CONTROLS.find((c) => c.id === id);
}

export function baseCoverage(controlId: string, modeId: string): number {
  return COVERAGE[controlId]?.[modeId] ?? 0;
}

/**
 * How much of a control's base coverage still works under a given model.
 *
 * Two independent haircuts, applied multiplicatively:
 *   - the share that depended on readable reasoning, scaled by how much
 *     reasoning is missing;
 *   - the share that depended on the model not noticing it is being tested,
 *     scaled by how much evaluation awareness the model has.
 *
 * A control with cotDependence 0 and evalAwarenessDependence 0 is untouched.
 */
export function effectiveCoverage(
  control: Control,
  modeId: string,
  visibleReasoning: number,
  evalAwareness: number,
): number {
  const base = baseCoverage(control.id, modeId);
  if (base === 0) return 0;
  const vis = clamp01(visibleReasoning);
  const aware = clamp01(evalAwareness);
  const cotHaircut = 1 - control.cotDependence * (1 - vis);
  const evalHaircut = 1 - control.evalAwarenessDependence * aware;
  return base * clamp01(cotHaircut) * clamp01(evalHaircut);
}

/**
 * The most any single control is credited with catching, however good it is.
 * No control in this catalogue is a 100% detector, and a model that lets one
 * become one produces exactly the flattering answer this tool exists to avoid.
 */
export const MAX_DETECTION = 0.72;

/**
 * How much credit each successive control gets after the strongest one.
 * Controls in a real stack are correlated — they tend to miss the same clever
 * thing — so stacking five mediocre controls must not add up to certainty.
 */
export const DEPTH_DECAY = 0.55;

/**
 * Combine several controls against one failure mode.
 *
 * Independent-miss composition, but with two corrections that stop it
 * saturating: each control is capped at MAX_DETECTION, and every control after
 * the strongest is discounted by DEPTH_DECAY^rank to model correlation. The
 * result is dominated by your BEST control for that mode, with real but
 * decaying credit for depth behind it.
 *
 * This matters for the question being asked: if your strongest control against
 * a mode is a chain-of-thought monitor, losing it should hurt a lot, and a
 * naive independent product hides that behind a wall of 99%s.
 */
export function combine(effectives: number[]): number {
  const strengths = effectives
    .map((e) => clamp01(e / MAX_BASE) * MAX_DETECTION)
    .filter((s) => s > 0)
    .sort((a, b) => b - a);

  let miss = 1;
  strengths.forEach((s, rank) => {
    miss *= 1 - s * Math.pow(DEPTH_DECAY, rank);
  });
  return clamp01(1 - miss);
}

export function bucketFor(coverage: number): Bucket {
  if (coverage >= 0.75) return 'covered';
  if (coverage >= 0.4) return 'thin';
  return 'exposed';
}

export function coverageForMode(
  selection: string[],
  modeId: string,
  visibleReasoning: number,
  evalAwareness: number,
): number {
  const effs = selection
    .map(getControl)
    .filter((c): c is Control => Boolean(c))
    .map((c) => effectiveCoverage(c, modeId, visibleReasoning, evalAwareness));
  return combine(effs);
}

function darkControls(
  selection: string[],
  modeId: string,
  visibleReasoning: number,
  evalAwareness: number,
): LostControl[] {
  return selection
    .map(getControl)
    .filter((c): c is Control => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      lost:
        effectiveCoverage(c, modeId, 1, 0) -
        effectiveCoverage(c, modeId, visibleReasoning, evalAwareness),
    }))
    .filter((c) => c.lost > 0.01)
    .sort((a, b) => b.lost - a.lost);
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function recommend(
  selection: string[],
  visibleReasoning: number,
  evalAwareness: number,
  limit = 3,
): Recommendation[] {
  const current = FAILURE_MODES.map((m) =>
    coverageForMode(selection, m.id, visibleReasoning, evalAwareness),
  );
  const currentMean = mean(current);

  return CONTROLS.filter((c) => !selection.includes(c.id))
    .map((control) => {
      const withIt = FAILURE_MODES.map((m) =>
        coverageForMode([...selection, control.id], m.id, visibleReasoning, evalAwareness),
      );
      const perMode = FAILURE_MODES.map((m, i) => ({
        name: m.name,
        delta: withIt[i] - current[i],
      }))
        .filter((d) => d.delta > 0.01)
        .sort((a, b) => b.delta - a.delta);

      return {
        control,
        gain: mean(withIt) - currentMean,
        helps: perMode.slice(0, 3).map((d) => d.name),
      };
    })
    .filter((r) => r.gain > 0.001)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}

/**
 * The share of the baseline safety net that is load-bearing on visible
 * reasoning: how much coverage disappears if reasoning goes fully latent,
 * holding evaluation awareness at zero so the two effects stay separable.
 */
export function loadBearingShare(selection: string[]): number {
  const base = mean(FAILURE_MODES.map((m) => coverageForMode(selection, m.id, 1, 0)));
  if (base === 0) return 0;
  const survives = mean(FAILURE_MODES.map((m) => coverageForMode(selection, m.id, 0, 0)));
  return clamp01((base - survives) / base);
}

export function assess(selection: string[], profile: ModelProfile): Assessment {
  const { visibleReasoning, evalAwareness } = profile;

  const modes: ModeResult[] = FAILURE_MODES.map((mode) => {
    const baseline = coverageForMode(selection, mode.id, 1, 0);
    const current = coverageForMode(selection, mode.id, visibleReasoning, evalAwareness);
    return {
      mode,
      baseline,
      current,
      drop: Math.max(0, baseline - current),
      bucket: bucketFor(current),
      wentDark: darkControls(selection, mode.id, visibleReasoning, evalAwareness),
    };
  });

  return {
    modes,
    netStrength: mean(modes.map((m) => m.current)),
    baselineStrength: mean(modes.map((m) => m.baseline)),
    loadBearingShare: loadBearingShare(selection),
    exposedCount: modes.filter((m) => m.bucket === 'exposed').length,
    thinCount: modes.filter((m) => m.bucket === 'thin').length,
    recommendations: recommend(selection, visibleReasoning, evalAwareness),
  };
}
