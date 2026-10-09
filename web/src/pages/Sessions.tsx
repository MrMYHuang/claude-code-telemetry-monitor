import React from 'react';
import type { RangeOption } from '../lib/format';
import { Layers } from 'lucide-react';

interface SessionsProps {
  range: RangeOption;
}

export const Sessions: React.FC<SessionsProps> = () => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-header">
        <div className="placeholder-icon">
          <Layers size={24} />
        </div>
        <div>
          <h2 className="placeholder-title">Sessions</h2>
          <p className="placeholder-subtitle">
            Explore active and past sessions, token usage, cost breakdowns, and event timelines.
          </p>
        </div>
      </div>
      <div className="placeholder-card">
        <p>Full session viewer and event traces will be active in Task 8.</p>
      </div>
    </div>
  );
};
