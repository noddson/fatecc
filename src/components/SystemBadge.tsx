import type { RuleSetDefinition } from '../domain/types';
import { isAccelerated, systemName } from '../domain/editions';

export function SystemBadge({ rules }: { rules: RuleSetDefinition }) {
  return (
    <span
      className={`system-badge ${isAccelerated(rules) ? 'system-accelerated' : 'system-core'}`}
      aria-label={`Rules system: ${systemName(rules)}`}
    >
      <span aria-hidden="true" className="system-mark" />
      {systemName(rules)}
    </span>
  );
}
