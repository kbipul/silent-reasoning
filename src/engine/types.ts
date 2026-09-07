/** Where a control does its work. Determines whether silent reasoning touches it. */
export type ControlCategory =
  | 'reasoning' // reads the model's written reasoning
  | 'action' // inspects or gates what the model actually does
  | 'output' // inspects the final text
  | 'process' // offline: evals, red teams, human sign-off
  | 'internals'; // reads activations, not words

export interface Control {
  id: string;
  name: string;
  category: ControlCategory;
  /**
   * 0..1 — the share of this control's detection power that comes from reading
   * the model's VISIBLE reasoning. 1.0 means it is pure chain-of-thought
   * monitoring and has nothing left when the reasoning goes latent.
   */
  cotDependence: number;
  /**
   * 0..1 — the share that collapses when the model can tell it is under
   * evaluation and behaves differently. Offline evals score high here.
   */
  evalAwarenessDependence: number;
  /** Why the two numbers above are what they are. Shown in the UI. */
  note: string;
}

export interface FailureMode {
  id: string;
  name: string;
  note: string;
}

/** Base coverage 0..3 a control contributes against a mode with fully visible reasoning. */
export type CoverageMatrix = Record<string, Record<string, number>>;

export type Basis = 'published' | 'estimated' | 'hypothetical';

export interface ModelProfile {
  id: string;
  name: string;
  /** 0..1 proxy for how much of the model's reasoning a monitor can read. */
  visibleReasoning: number;
  /** 0..1 proxy for how strongly the model behaves differently under evaluation. */
  evalAwareness: number;
  visibleReasoningBasis: Basis;
  evalAwarenessBasis: Basis;
  source: string;
}

export type Bucket = 'covered' | 'thin' | 'exposed';

export interface LostControl {
  id: string;
  name: string;
  /** How much 0..3 effective coverage this control lost versus full visibility. */
  lost: number;
}

export interface ModeResult {
  mode: FailureMode;
  /** 0..1 coverage with fully visible reasoning and no evaluation awareness. */
  baseline: number;
  /** 0..1 coverage under the selected model profile. */
  current: number;
  /** baseline - current, >= 0. */
  drop: number;
  bucket: Bucket;
  /** Controls that lost the most power, worst first. Only those that lost anything. */
  wentDark: LostControl[];
}

export interface Recommendation {
  control: Control;
  /** Mean coverage gain 0..1 across all modes if this control were added. */
  gain: number;
  /** Modes it helps most, best first. */
  helps: string[];
}

export interface Assessment {
  modes: ModeResult[];
  /** Mean current coverage across modes, 0..1. */
  netStrength: number;
  /** Mean baseline coverage across modes, 0..1. */
  baselineStrength: number;
  /**
   * 0..1 — share of the baseline safety net that is load-bearing on visible
   * reasoning, i.e. how much disappears if reasoning goes fully latent.
   */
  loadBearingShare: number;
  exposedCount: number;
  thinCount: number;
  recommendations: Recommendation[];
}
