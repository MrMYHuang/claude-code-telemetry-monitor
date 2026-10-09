import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronRight as ChevronIcon,
} from 'lucide-react';
import { fetchSessions } from '../api/client';
import { formatCost, formatDuration, formatTokens, type RangeOption } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Link, navigateTo } from '../components/Link';

interface SessionsProps {
  range: RangeOption;
}

type SortField = 'recency' | 'cost' | 'tokens' | 'tools' | 'errors' | 'duration';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 25;

export const Sessions: React.FC<SessionsProps> = ({ range }) => {
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('recency');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sessions', range, page],
    queryFn: () =>
      fetchSessions({
        range,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    const items = [...data.items];

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'recency':
          cmp = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
          break;
        case 'cost':
          cmp = a.totalCost - b.totalCost;
          break;
        case 'tokens':
          cmp = a.totalTokens - b.totalTokens;
          break;
        case 'tools':
          cmp = a.toolCalls - b.toolCalls;
          break;
        case 'errors':
          cmp = a.errors - b.errors;
          break;
        case 'duration': {
          const durA =
            new Date(a.lastSeen).getTime() - new Date(a.startedAt).getTime();
          const durB =
            new Date(b.lastSeen).getTime() - new Date(b.startedAt).getTime();
          cmp = durA - durB;
          break;
        }
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [data?.items, sortField, sortOrder]);

  if (isLoading) {
    return (
      <div className="overview-loading">
        <div className="loading-spinner" />
        <span>Loading sessions...</span>
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

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="sort-icon-inactive" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="sort-icon-active" />
    ) : (
      <ArrowDown size={12} className="sort-icon-active" />
    );
  };

  return (
    <div className="sessions-page">
      <div className="page-header">
        <div className="page-title-group">
          <div className="page-icon-badge">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="page-title">Sessions</h1>
            <p className="page-subtitle">
              Browse distinct Claude Code conversations, inspect token consumption, and view chronological traces.
            </p>
          </div>
        </div>

        <div className="table-meta-counter">
          Total: <span className="counter-number">{data.total}</span> sessions
        </div>
      </div>

      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-session-id">Session ID</th>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('recency')}
                  title="Sort by recency"
                >
                  <div className="th-content">
                    <span>Recency</span>
                    {renderSortIndicator('recency')}
                  </div>
                </th>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('duration')}
                  title="Sort by duration"
                >
                  <div className="th-content">
                    <span>Duration</span>
                    {renderSortIndicator('duration')}
                  </div>
                </th>
                <th
                  className="th-sortable th-right"
                  onClick={() => handleSort('cost')}
                  title="Sort by cost"
                >
                  <div className="th-content th-content-right">
                    <span>Cost</span>
                    {renderSortIndicator('cost')}
                  </div>
                </th>
                <th
                  className="th-sortable th-right"
                  onClick={() => handleSort('tokens')}
                  title="Sort by tokens"
                >
                  <div className="th-content th-content-right">
                    <span>Tokens</span>
                    {renderSortIndicator('tokens')}
                  </div>
                </th>
                <th
                  className="th-sortable th-right"
                  onClick={() => handleSort('tools')}
                  title="Sort by tool calls"
                >
                  <div className="th-content th-content-right">
                    <span>Tool Calls</span>
                    {renderSortIndicator('tools')}
                  </div>
                </th>
                <th
                  className="th-sortable th-right"
                  onClick={() => handleSort('errors')}
                  title="Sort by errors"
                >
                  <div className="th-content th-content-right">
                    <span>Errors</span>
                    {renderSortIndicator('errors')}
                  </div>
                </th>
                <th className="th-action" />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((session) => {
                const startedDate = new Date(session.startedAt);
                const lastSeenDate = new Date(session.lastSeen);
                const durationMs = Math.max(
                  0,
                  lastSeenDate.getTime() - startedDate.getTime(),
                );

                return (
                  <tr
                    key={session.sessionId}
                    className="clickable-row"
                    onClick={() => navigateTo(`/sessions/${session.sessionId}`)}
                  >
                    <td className="td-session-id">
                      <Link
                        to={`/sessions/${session.sessionId}`}
                        className="session-id-link font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {session.sessionId}
                      </Link>
                    </td>
                    <td className="td-recency">
                      <div className="recency-group">
                        <span className="last-seen-text">
                          {lastSeenDate.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="date-subtext">
                          {lastSeenDate.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="td-duration">
                      <span className="duration-pill">
                        <Clock size={11} className="duration-pill-icon" />
                        {formatDuration(durationMs)}
                      </span>
                    </td>
                    <td className="td-cost td-right font-mono">
                      {formatCost(session.totalCost)}
                    </td>
                    <td className="td-tokens td-right font-mono">
                      {formatTokens(session.totalTokens)}
                    </td>
                    <td className="td-tools td-right font-mono">
                      {formatTokens(session.toolCalls)}
                    </td>
                    <td className="td-errors td-right">
                      {session.errors > 0 ? (
                        <span className="error-badge-pill">
                          {session.errors}
                        </span>
                      ) : (
                        <span className="zero-errors-text">0</span>
                      )}
                    </td>
                    <td className="td-action">
                      <ChevronIcon size={16} className="row-arrow-icon" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
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
