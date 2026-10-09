import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  AlertCircle,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Bot,
} from 'lucide-react';
import { fetchErrors, type ErrorItem } from '../api/client';
import type { RangeOption } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Link } from '../components/Link';

interface ErrorsProps {
  range: RangeOption;
}

const PAGE_SIZE = 25;

export const Errors: React.FC<ErrorsProps> = ({ range }) => {
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['errors', range, page],
    queryFn: () =>
      fetchErrors({
        range,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  if (isLoading) {
    return (
      <div className="overview-loading">
        <div className="loading-spinner" />
        <span>Loading error log...</span>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  }

  if (!data || data.total === 0) {
    return <EmptyState />;
  }

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  const renderKindBadge = (kind: ErrorItem['kind']) => {
    if (kind === 'api_error') {
      return (
        <span className="error-kind-badge badge-api-error">
          <AlertCircle size={12} />
          <span>API Error</span>
        </span>
      );
    }
    return (
      <span className="error-kind-badge badge-tool-error">
        <Wrench size={12} />
        <span>Tool Failure</span>
      </span>
    );
  };

  return (
    <div className="errors-page">
      <div className="page-header">
        <div className="page-title-group">
          <div className="page-icon-badge page-icon-error">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="page-title">Errors</h1>
            <p className="page-subtitle">
              Live feed of API failures and failed tool executions with direct session links.
            </p>
          </div>
        </div>

        <div className="table-meta-counter text-rose">
          Total: <span className="counter-number font-bold">{data.total}</span> errors
        </div>
      </div>

      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-error-kind">Kind</th>
                <th className="th-error-message">Message / Details</th>
                <th className="th-error-model">Model</th>
                <th className="th-error-time">Timestamp</th>
                <th className="th-error-session">Session</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => {
                const date = new Date(item.ts);

                return (
                  <tr key={`${item.ts}-${idx}`} className="error-feed-row">
                    <td className="td-error-kind">
                      {renderKindBadge(item.kind)}
                    </td>
                    <td className="td-error-message">
                      <div className="error-message-box">
                        <span className="error-message-text font-mono">
                          {item.message}
                        </span>
                      </div>
                    </td>
                    <td className="td-error-model">
                      {item.model ? (
                        <span className="model-chip">
                          <Bot size={11} className="mr-1" />
                          {item.model}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="td-error-time">
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
                    <td className="td-error-session">
                      {item.sessionId ? (
                        <Link
                          to={`/sessions/${item.sessionId}`}
                          className="session-ref-link font-mono"
                        >
                          <span>{item.sessionId.slice(0, 16)}…</span>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="table-pagination">
            <div className="pagination-info">
              Showing{' '}
              <span className="pagination-accent">
                {page * PAGE_SIZE + 1} -{' '}
                {Math.min((page + 1) * PAGE_SIZE, data.total)}
              </span>{' '}
              of <span className="pagination-accent">{data.total}</span>
            </div>
            <div className="pagination-buttons">
              <button
                type="button"
                className="pagination-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft size={16} />
                <span>Prev</span>
              </button>
              <span className="page-indicator">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="pagination-btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
