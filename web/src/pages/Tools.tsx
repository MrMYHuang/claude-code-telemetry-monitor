import React from 'react';
import type { RangeOption } from '../lib/format';
import { Wrench } from 'lucide-react';

interface ToolsProps {
  range: RangeOption;
}

export const Tools: React.FC<ToolsProps> = () => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-header">
        <div className="placeholder-icon">
          <Wrench size={24} />
        </div>
        <div>
          <h2 className="placeholder-title">Tools</h2>
          <p className="placeholder-subtitle">
            Inspect tool call frequency, success rates, and p50/p95 latency metrics.
          </p>
        </div>
      </div>
      <div className="placeholder-card">
        <p>Tool performance metrics and slowest executions will be active in Task 8.</p>
      </div>
    </div>
  );
};
