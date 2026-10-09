import React from 'react';
import type { RangeOption } from '../lib/format';
import { AlertTriangle } from 'lucide-react';

interface ErrorsProps {
  range: RangeOption;
}

export const Errors: React.FC<ErrorsProps> = () => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-header">
        <div className="placeholder-icon">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h2 className="placeholder-title">Errors</h2>
          <p className="placeholder-subtitle">
            Live feed of API errors, failed tool invocations, and session diagnostic links.
          </p>
        </div>
      </div>
      <div className="placeholder-card">
        <p>Paginated error feed and stack traces will be active in Task 8.</p>
      </div>
    </div>
  );
};
