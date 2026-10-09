import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench,
  Gauge,
  Clock,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { fetchTools } from '../api/client';
import { formatDuration, formatTokens, type RangeOption } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Link } from '../components/Link';

interface ToolsProps {
  range: RangeOption;
}

export const Tools: React.FC<ToolsProps> = ({ range }) => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tools', range],
    queryFn: () => fetchTools({ range }),
  });

  if (isLoading) {
    return (
      <div className="overview-loading">
        <div className="loading-spinner" />
        <span>Loading tool analytics...</span>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  }

  if (!data || (data.tools.length === 0 && data.slowest.length === 0)) {
    return <EmptyState />;
  }

  const { tools, slowest } = data;

  return (
    <div className="tools-page">
      <div className="page-header">
        <div className="page-title-group">
          <div className="page-icon-badge">
            <Wrench size={22} />
          </div>
          <div>
            <h1 className="page-title">Tools</h1>
            <p className="page-subtitle">
              Inspect tool call frequency, reliability metrics, and latency distribution (p50 / p95).
            </p>
          </div>
        </div>
      </div>

      {/* Per-Tool Statistics Table */}
      <div className="table-card">
        <div className="card-header-row">
          <div className="card-header-title-group">
            <h2 className="card-section-title">Tool Statistics</h2>
            <span className="card-section-badge">{tools.length} active tools</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tool Name</th>
                <th className="th-right">Invocations</th>
                <th>Success Rate</th>
                <th className="th-right">p50 Duration</th>
                <th className="th-right">p95 Duration</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => {
                const successPercent = tool.successRate * 100;
                const isHighSuccess = successPercent >= 95;
                const isMediumSuccess = successPercent >= 80 && successPercent < 95;

                return (
                  <tr key={tool.toolName}>
                    <td className="td-tool-name">
                      <div className="tool-name-container">
                        <span className="tool-icon-bullet">
                          <Wrench size={13} />
                        </span>
                        <span className="tool-name-text font-mono">
                          {tool.toolName}
                        </span>
                      </div>
                    </td>
                    <td className="td-right font-mono">
                      {formatTokens(tool.calls)}
                    </td>
                    <td className="td-success-rate">
                      <div className="success-rate-container">
                        <div className="success-bar-bg">
                          <div
                            className={`success-bar-fill ${
                              isHighSuccess
                                ? 'fill-emerald'
                                : isMediumSuccess
                                ? 'fill-amber'
                                : 'fill-rose'
                            }`}
                            style={{ width: `${Math.max(2, successPercent)}%` }}
                          />
                        </div>
                        <div className="success-label-group">
                          {isHighSuccess ? (
                            <CheckCircle2 size={13} className="text-emerald" />
                          ) : (
                            <AlertTriangle
                              size={13}
                              className={isMediumSuccess ? 'text-amber' : 'text-rose'}
                            />
                          )}
                          <span className="success-rate-text font-mono">
                            {successPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="td-right font-mono">
                      <span className="latency-badge p50-badge">
                        {formatDuration(tool.p50Ms)}
                      </span>
                    </td>
                    <td className="td-right font-mono">
                      <span className="latency-badge p95-badge">
                        {formatDuration(tool.p95Ms)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slowest Executions List */}
      <div className="table-card mt-6">
        <div className="card-header-row">
          <div className="card-header-title-group">
            <h2 className="card-section-title">Slowest Tool Calls</h2>
            <span className="card-section-badge">Top {slowest.length} outliers</span>
          </div>
          <div className="card-header-hint">
            <Gauge size={14} className="text-muted" />
            <span>Highest latency calls in selected time range</span>
          </div>
        </div>

        {slowest.length === 0 ? (
          <div className="table-empty-row">No tool execution traces recorded.</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Duration</th>
                  <th>Executed At</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {slowest.map((call, idx) => {
                  const date = new Date(call.ts);

                  return (
                    <tr key={`${call.toolName}-${call.ts}-${idx}`}>
                      <td className="td-tool-name">
                        <span className="tool-pill font-mono">{call.toolName}</span>
                      </td>
                      <td className="td-slow-duration font-mono">
                        <span className="slow-duration-badge">
                          <Clock size={12} />
                          {formatDuration(call.durationMs)}
                        </span>
                      </td>
                      <td className="td-timestamp">
                        <span className="timestamp-text">
                          {date.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span className="date-subtext">
                          {date.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="td-session-ref">
                        {call.sessionId ? (
                          <Link
                            to={`/sessions/${call.sessionId}`}
                            className="session-ref-link font-mono"
                          >
                            <span>{call.sessionId.slice(0, 16)}…</span>
                            <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
