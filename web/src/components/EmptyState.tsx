import React, { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';

const TELEMETRY_CONFIG = `CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`;

export const EmptyState: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(TELEMETRY_CONFIG);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div className="empty-state">
      <div className="empty-state-badge">
        <Terminal size={20} />
      </div>
      <h3 className="empty-state-title">No Telemetry Received Yet</h3>
      <p className="empty-state-description">
        Claude Code sends OpenTelemetry metrics and logs directly to this monitor.
        Configure Claude Code by exporting these environment variables:
      </p>

      <div className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-label">Environment Variables</span>
          <button
            type="button"
            className="code-copy-btn"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check size={14} className="text-success" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="code-block">
          <code>{TELEMETRY_CONFIG}</code>
        </pre>
      </div>

      <p className="empty-state-footer">
        Once exported, launch Claude Code in your terminal. This dashboard automatically polls for new data every 10 seconds.
      </p>
    </div>
  );
};
