import { describe, expect, it } from 'vitest';
import {
  CONTROLS,
  COT_CONTROL_ADHERENCE,
  COVERAGE,
  DEFAULT_SELECTION,
  FAILURE_MODES,
  PROFILES,
} from '../engine/catalog';

describe('catalog integrity', () => {
  it('has a meaningful number of controls and failure modes', () => {
    expect(CONTROLS.length).toBeGreaterThanOrEqual(10);
    expect(FAILURE_MODES.length).toBeGreaterThanOrEqual(6);
  });

  it('uses unique control ids', () => {
    const ids = CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique failure mode ids', () => {
    const ids = FAILURE_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every dependence value inside 0..1', () => {
    for (const c of CONTROLS) {
      expect(c.cotDependence).toBeGreaterThanOrEqual(0);
      expect(c.cotDependence).toBeLessThanOrEqual(1);
      expect(c.evalAwarenessDependence).toBeGreaterThanOrEqual(0);
      expect(c.evalAwarenessDependence).toBeLessThanOrEqual(1);
    }
  });

  it('justifies every control with a note', () => {
    for (const c of CONTROLS) {
      expect(c.note.length).toBeGreaterThan(30);
    }
  });

  it('describes every failure mode', () => {
    for (const m of FAILURE_MODES) {
      expect(m.note.length).toBeGreaterThan(20);
    }
  });

  it('scores every control against every failure mode', () => {
    for (const c of CONTROLS) {
      const row = COVERAGE[c.id];
      expect(row, `missing coverage row for ${c.id}`).toBeDefined();
      for (const m of FAILURE_MODES) {
        expect(row[m.id], `missing ${c.id} x ${m.id}`).toBeTypeOf('number');
      }
    }
  });

  it('keeps every coverage value an integer in 0..3', () => {
    for (const row of Object.values(COVERAGE)) {
      for (const v of Object.values(row)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has no coverage rows for controls that do not exist', () => {
    const ids = new Set(CONTROLS.map((c) => c.id));
    for (const key of Object.keys(COVERAGE)) {
      expect(ids.has(key), `orphan coverage row ${key}`).toBe(true);
    }
  });

  it('gives every control at least one non-zero coverage cell', () => {
    for (const c of CONTROLS) {
      const total = Object.values(COVERAGE[c.id]).reduce((a, b) => a + b, 0);
      expect(total, `${c.id} covers nothing`).toBeGreaterThan(0);
    }
  });

  it('leaves no failure mode entirely uncovered by the full catalog', () => {
    for (const m of FAILURE_MODES) {
      const total = CONTROLS.reduce((sum, c) => sum + COVERAGE[c.id][m.id], 0);
      expect(total, `${m.id} has no control at all`).toBeGreaterThan(0);
    }
  });

  it('only references real controls in the default selection', () => {
    const ids = new Set(CONTROLS.map((c) => c.id));
    for (const id of DEFAULT_SELECTION) {
      expect(ids.has(id), `${id} is not a real control`).toBe(true);
    }
  });

  it('leaves some controls out of the default selection so recommendations exist', () => {
    expect(DEFAULT_SELECTION.length).toBeLessThan(CONTROLS.length);
  });
});

describe('control classification', () => {
  it('marks pure chain-of-thought monitors as fully CoT-dependent', () => {
    const keyword = CONTROLS.find((c) => c.id === 'cot-keyword')!;
    expect(keyword.cotDependence).toBe(1);
  });

  it('marks action-layer controls as free of CoT dependence', () => {
    for (const id of ['tool-policy', 'egress', 'loop-guard', 'action-anomaly']) {
      const c = CONTROLS.find((x) => x.id === id)!;
      expect(c.cotDependence, `${id} should not read reasoning`).toBe(0);
    }
  });

  it('marks interpretability probes as reading internals, not words', () => {
    const probes = CONTROLS.find((c) => c.id === 'probes')!;
    expect(probes.category).toBe('internals');
    expect(probes.cotDependence).toBe(0);
  });

  it('makes offline evals the most evaluation-aware-sensitive controls', () => {
    const evalSuite = CONTROLS.find((c) => c.id === 'eval-suite')!;
    const others = CONTROLS.filter((c) => c.category !== 'process');
    for (const o of others) {
      expect(evalSuite.evalAwarenessDependence).toBeGreaterThan(o.evalAwarenessDependence);
    }
  });
});

describe('model profiles', () => {
  it('derives visible reasoning from the published CoT-control adherence rate', () => {
    const sol = PROFILES.find((p) => p.id === 'sol')!;
    const astra = PROFILES.find((p) => p.id === 'astra')!;
    expect(sol.visibleReasoning).toBeCloseTo(1 - COT_CONTROL_ADHERENCE.sol, 10);
    expect(astra.visibleReasoning).toBeCloseTo(1 - COT_CONTROL_ADHERENCE.astra, 10);
  });

  it('records the published adherence rates as reported', () => {
    expect(COT_CONTROL_ADHERENCE.sol).toBe(0.161);
    expect(COT_CONTROL_ADHERENCE.astra).toBe(0.609);
  });

  it('puts Astra below Sol on visible reasoning', () => {
    const sol = PROFILES.find((p) => p.id === 'sol')!;
    const astra = PROFILES.find((p) => p.id === 'astra')!;
    expect(astra.visibleReasoning).toBeLessThan(sol.visibleReasoning);
  });

  it('labels the derived figures as published and the dials as estimated', () => {
    for (const id of ['sol', 'astra']) {
      const p = PROFILES.find((x) => x.id === id)!;
      expect(p.visibleReasoningBasis).toBe('published');
      expect(p.evalAwarenessBasis).toBe('estimated');
    }
  });

  it('labels the two synthetic anchors as hypothetical rather than measured', () => {
    for (const id of ['verbose', 'opaque']) {
      const p = PROFILES.find((x) => x.id === id)!;
      expect(p.visibleReasoningBasis).toBe('hypothetical');
      expect(p.evalAwarenessBasis).toBe('hypothetical');
    }
  });

  it('keeps every profile dial inside 0..1 and sourced', () => {
    for (const p of PROFILES) {
      expect(p.visibleReasoning).toBeGreaterThanOrEqual(0);
      expect(p.visibleReasoning).toBeLessThanOrEqual(1);
      expect(p.evalAwareness).toBeGreaterThanOrEqual(0);
      expect(p.evalAwareness).toBeLessThanOrEqual(1);
      expect(p.source.length).toBeGreaterThan(30);
    }
  });

  it('orders the presets from most to least legible reasoning', () => {
    const vis = PROFILES.map((p) => p.visibleReasoning);
    expect(vis).toEqual([...vis].sort((a, b) => b - a));
  });
});
