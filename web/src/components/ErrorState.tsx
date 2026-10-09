import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Failed to load telemetry data.',
  onRetry,
}) => {
  return (
    <div className="error-state">
      <div className="error-state-badge">
        <AlertCircle size={24} />
      </div>
      <h3 className="error-state-title">Something went wrong</h3>
      <p className="error-state-description">{message}</p>
      {onRetry && (
        <button type="button" className="retry-btn" onClick={onRetry}>
          <RefreshCw size={14} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
