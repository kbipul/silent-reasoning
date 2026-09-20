import type { Control, CoverageMatrix, FailureMode, ModelProfile } from './types';

/**
 * The controls a real team actually runs. `cotDependence` is the load-bearing
 * number in this whole tool: it is an explicit, arguable assumption, not a
 * measurement. Every value is justified in `note` so it can be challenged.
 */
export const CONTROLS: Control[] = [
  {
    id: 'cot-keyword',
    name: 'Chain-of-thought keyword monitor',
    category: 'reasoning',
    cotDependence: 1.0,
    evalAwarenessDependence: 0.1,
    note: 'Greps the reasoning trace for red-flag strings. No trace, no signal — nothing survives latent reasoning.',
  },
  {
    id: 'cot-review',
    name: 'Human review of reasoning traces',
    category: 'reasoning',
    cotDependence: 1.0,
    evalAwarenessDependence: 0.05,
    note: 'A person reads sampled traces. Strongest single control against stated-intent problems, and equally total in its dependence on there being a trace.',
  },
  {
    id: 'cot-classifier',
    name: 'CoT deception classifier',
    category: 'reasoning',
    cotDependence: 0.95,
    evalAwarenessDependence: 0.15,
    note: 'A second model reads the trace and scores intent. Slightly under 1.0 because such classifiers usually see the final answer too.',
  },
  {
    id: 'tool-policy',
    name: 'Tool-call allowlist / policy engine',
    category: 'action',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.0,
    note: 'Judges the call, never the rationale. Indifferent to how the model arrived there — which is exactly why it survives.',
  },
  {
    id: 'egress',
    name: 'Sandbox + egress allowlist',
    category: 'action',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.0,
    note: 'Network and filesystem boundaries. Enforced below the model entirely.',
  },
  {
    id: 'human-approval',
    name: 'Human approval on side-effectful actions',
    category: 'process',
    cotDependence: 0.15,
    evalAwarenessDependence: 0.05,
    note: 'The approver sees the proposed action regardless, but in practice leans on the stated reason — so a slice of it does depend on visible reasoning.',
  },
  {
    id: 'output-filter',
    name: 'Output classifier / content filter',
    category: 'output',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.0,
    note: 'Reads the final text only. Untouched by where the reasoning happened.',
  },
  {
    id: 'eval-suite',
    name: 'Offline behavioural eval suite',
    category: 'process',
    cotDependence: 0.2,
    evalAwarenessDependence: 0.8,
    note: 'Mostly behavioural, so barely CoT-dependent — but almost entirely undone if the model recognises the eval and behaves for the grader.',
  },
  {
    id: 'redteam',
    name: 'Scripted red-team suite',
    category: 'process',
    cotDependence: 0.25,
    evalAwarenessDependence: 0.7,
    note: 'Scripted attacks are the most recognisable thing in the corpus; a model that spots evaluations spots these first.',
  },
  {
    id: 'action-anomaly',
    name: 'Action-log anomaly detection',
    category: 'action',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.05,
    note: 'Statistics over what the agent did in production. Sees behaviour, never words.',
  },
  {
    id: 'probes',
    name: 'Interpretability probes / activation monitors',
    category: 'internals',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.1,
    note: 'Reads activations rather than tokens, so latent reasoning is where it looks anyway. The one control that gets relatively stronger as CoT gets weaker.',
  },
  {
    id: 'loop-guard',
    name: 'Step budget / loop guard',
    category: 'action',
    cotDependence: 0.0,
    evalAwarenessDependence: 0.0,
    note: 'Counts steps and spend. A hard stop does not care what the model was thinking.',
  },
];

export const FAILURE_MODES: FailureMode[] = [
  {
    id: 'deceptive-tool-use',
    name: 'Deceptive tool use',
    note: 'The agent takes an action while misrepresenting what it is doing or why.',
  },
  {
    id: 'exfiltration',
    name: 'Data exfiltration via tools',
    note: 'Sensitive context leaves through a legitimate-looking tool call.',
  },
  {
    id: 'reward-hacking',
    name: 'Reward hacking / spec gaming',
    note: 'The task metric is satisfied without the task being done.',
  },
  {
    id: 'sandbagging',
    name: 'Sandbagging under evaluation',
    note: 'The model recognises a test and performs differently than it would in production.',
  },
  {
    id: 'injection',
    name: 'Prompt-injection compliance',
    note: 'Instructions smuggled in via retrieved or tool-returned content get followed.',
  },
  {
    id: 'unsafe-output',
    name: 'Unsafe content generation',
    note: 'The final answer itself is the harm.',
  },
  {
    id: 'runaway-loop',
    name: 'Runaway loop / budget burn',
    note: 'The agent cycles without terminating and consumes its budget.',
  },
  {
    id: 'priv-escalation',
    name: 'Silent privilege escalation',
    note: 'The agent acquires broader access than the task needed, quietly.',
  },
];

/** Base coverage 0..3 per (control, failure mode) at fully visible reasoning. */
export const COVERAGE: CoverageMatrix = {
  'cot-keyword': {
    'deceptive-tool-use': 2, exfiltration: 1, 'reward-hacking': 2, sandbagging: 1,
    injection: 2, 'unsafe-output': 1, 'runaway-loop': 1, 'priv-escalation': 1,
  },
  'cot-review': {
    'deceptive-tool-use': 3, exfiltration: 1, 'reward-hacking': 3, sandbagging: 2,
    injection: 2, 'unsafe-output': 1, 'runaway-loop': 1, 'priv-escalation': 2,
  },
  'cot-classifier': {
    'deceptive-tool-use': 3, exfiltration: 1, 'reward-hacking': 2, sandbagging: 2,
    injection: 2, 'unsafe-output': 1, 'runaway-loop': 0, 'priv-escalation': 2,
  },
  'tool-policy': {
    'deceptive-tool-use': 2, exfiltration: 3, 'reward-hacking': 1, sandbagging: 0,
    injection: 3, 'unsafe-output': 0, 'runaway-loop': 1, 'priv-escalation': 3,
  },
  egress: {
    'deceptive-tool-use': 1, exfiltration: 3, 'reward-hacking': 0, sandbagging: 0,
    injection: 2, 'unsafe-output': 0, 'runaway-loop': 0, 'priv-escalation': 2,
  },
  'human-approval': {
    'deceptive-tool-use': 2, exfiltration: 2, 'reward-hacking': 1, sandbagging: 0,
    injection: 2, 'unsafe-output': 2, 'runaway-loop': 2, 'priv-escalation': 3,
  },
  'output-filter': {
    'deceptive-tool-use': 0, exfiltration: 1, 'reward-hacking': 0, sandbagging: 0,
    injection: 1, 'unsafe-output': 3, 'runaway-loop': 0, 'priv-escalation': 0,
  },
  'eval-suite': {
    'deceptive-tool-use': 2, exfiltration: 1, 'reward-hacking': 3, sandbagging: 3,
    injection: 2, 'unsafe-output': 2, 'runaway-loop': 1, 'priv-escalation': 1,
  },
  redteam: {
    'deceptive-tool-use': 2, exfiltration: 2, 'reward-hacking': 2, sandbagging: 2,
    injection: 3, 'unsafe-output': 2, 'runaway-loop': 1, 'priv-escalation': 2,
  },
  'action-anomaly': {
    'deceptive-tool-use': 2, exfiltration: 2, 'reward-hacking': 1, sandbagging: 0,
    injection: 1, 'unsafe-output': 0, 'runaway-loop': 3, 'priv-escalation': 2,
  },
  probes: {
    'deceptive-tool-use': 2, exfiltration: 0, 'reward-hacking': 2, sandbagging: 3,
    injection: 1, 'unsafe-output': 1, 'runaway-loop': 0, 'priv-escalation': 1,
  },
  'loop-guard': {
    'deceptive-tool-use': 0, exfiltration: 1, 'reward-hacking': 1, sandbagging: 0,
    injection: 1, 'unsafe-output': 0, 'runaway-loop': 3, 'priv-escalation': 1,
  },
};

/**
 * Anchor points for the sliders.
 *
 * Only ONE number here is published: chain-of-thought *control* adherence, the
 * rate at which a model successfully followed instructions to hide its
 * reasoning from a monitor — 16.1% for GPT-5.6 Sol, 60.9% for GPT-6 Astra
 * (OpenAI, GPT-6 Astra system card / safety overview, September 2026).
 *
 * `visibleReasoning` is derived as 1 - that rate. That is a PROXY and is
 * labelled as such everywhere it appears: a model's ability to hide its
 * reasoning on demand is not the same quantity as how much of its reasoning is
 * legible by default. It is used here because it is the only number on the
 * record that measures the direction of travel.
 *
 * `evalAwareness` is an ESTIMATE. The system card reports that Astra verbalised
 * substantially more evaluation awareness than Sol, but gives no rate that maps
 * onto a 0..1 dial. Both sliders are user-adjustable for exactly this reason.
 */
export const COT_CONTROL_ADHERENCE = { sol: 0.161, astra: 0.609 } as const;

export const PROFILES: ModelProfile[] = [
  {
    id: 'verbose',
    name: 'Verbose CoT (upper bound)',
    visibleReasoning: 1.0,
    evalAwareness: 0.0,
    visibleReasoningBasis: 'hypothetical',
    evalAwarenessBasis: 'hypothetical',
    source: 'Not a real model. Every reasoning step written down, no evaluation awareness — the ceiling your controls were designed against.',
  },
  {
    id: 'sol',
    name: 'GPT-5.6 Sol class',
    visibleReasoning: 1 - COT_CONTROL_ADHERENCE.sol,
    evalAwareness: 0.2,
    visibleReasoningBasis: 'published',
    evalAwarenessBasis: 'estimated',
    source: 'Followed CoT-control (hide-your-reasoning) instructions in 16.1% of tests — OpenAI GPT-6 Astra system card, Sep 2026.',
  },
  {
    id: 'astra',
    name: 'GPT-6 Astra class (recurrent depth)',
    visibleReasoning: 1 - COT_CONTROL_ADHERENCE.astra,
    evalAwareness: 0.65,
    visibleReasoningBasis: 'published',
    evalAwarenessBasis: 'estimated',
    source: 'Followed the same CoT-control instructions in 60.9% of tests, a near-fourfold jump, and verbalised markedly more evaluation awareness — OpenAI GPT-6 Astra system card, Sep 2026.',
  },
  {
    id: 'opaque',
    name: 'Fully latent (floor)',
    visibleReasoning: 0.0,
    evalAwareness: 0.8,
    visibleReasoningBasis: 'hypothetical',
    evalAwarenessBasis: 'hypothetical',
    source: 'Not a real model. Reasoning entirely in latent space — the floor the trend points at, useful for asking what would still be standing.',
  },
];

/** A common real-world stack: heavy on reasoning monitoring, light on internals. */
export const DEFAULT_SELECTION = [
  'cot-keyword',
  'cot-review',
  'tool-policy',
  'output-filter',
  'eval-suite',
  'human-approval',
  'loop-guard',
];
