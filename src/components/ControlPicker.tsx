import { CONTROLS } from '../engine/catalog';
import type { ControlCategory } from '../engine/types';

const GROUPS: { key: ControlCategory; label: string }[] = [
  { key: 'reasoning', label: 'Reads the reasoning' },
  { key: 'action', label: 'Gates the action' },
  { key: 'output', label: 'Reads the output' },
  { key: 'process', label: 'Offline process' },
  { key: 'internals', label: 'Reads the internals' },
];

export function ControlPicker({
  selection,
  onToggle,
}: {
  selection: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="picker">
      {GROUPS.map((g) => {
        const items = CONTROLS.filter((c) => c.category === g.key);
        if (items.length === 0) return null;
        return (
          <fieldset key={g.key} className="picker-group">
            <legend>{g.label}</legend>
            {items.map((c) => (
              <label key={c.id} className="control" title={c.note}>
                <input
                  type="checkbox"
                  checked={selection.includes(c.id)}
                  onChange={() => onToggle(c.id)}
                />
                <span className="control-body">
                  <span className="control-name">{c.name}</span>
                  <span className="control-meta">
                    <span
                      className="dep"
                      title={`${Math.round(c.cotDependence * 100)}% of this control's power comes from readable reasoning`}
                    >
                      CoT {Math.round(c.cotDependence * 100)}%
                    </span>
                    {c.evalAwarenessDependence >= 0.5 && (
                      <span className="dep dep-eval" title="Collapses if the model knows it is being tested">
                        eval-aware {Math.round(c.evalAwarenessDependence * 100)}%
                      </span>
                    )}
                  </span>
                  <span className="control-note">{c.note}</span>
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
