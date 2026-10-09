import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  DollarSign,
  Layers,
  Wrench,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Calendar,
} from 'lucide-react';
import { fetchSessionDetail } from '../api/client';
import { formatCost, formatDuration, formatTokens } from '../lib/format';
import { StatCard } from '../components/StatCard';
import { ErrorState } from '../components/ErrorState';
import { Timeline } from '../components/Timeline';
import { Link } from '../components/Link';

interface SessionDetailProps {
  id: string;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ id }) => {
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session', id],
    queryFn: () => fetchSessionDetail(id),
  });

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  if (isLoading) {
    return (
      <div className="overview-loading">
        <div className="loading-spinner" />
        <span>Loading session traces...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-error-container">
        <div className="mb-4">
          <Link to="/sessions" className="back-link">
            <ArrowLeft size={14} />
            <span>Back to Sessions</span>
          </Link>
        </div>
        <ErrorState
          message={error?.message || `Failed to load session ${id}`}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-error-container">
        <Link to="/sessions" className="back-link">
          <ArrowLeft size={14} />
          <span>Back to Sessions</span>
        </Link>
        <div className="empty-state">
          <p>Session not found</p>
        </div>
      </div>
    );
  }

  const { session, events } = data;

  const startedDate = new Date(session.startedAt);
  const lastSeenDate = new Date(session.lastSeen);
  const durationMs = Math.max(0, lastSeenDate.getTime() - startedDate.getTime());

  return (
    <div className="session-detail-page">
      {/* Top Navigation & Title */}
      <div className="session-detail-header">
        <div className="header-breadcrumbs">
          <Link to="/sessions" className="back-link">
            <ArrowLeft size={14} />
            <span>Sessions</span>
          </Link>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Session Detail</span>
        </div>

        <div className="session-title-row">
          <div className="session-title-group">
            <div className="session-icon-badge">
              <Layers size={20} />
            </div>
            <div>
              <div className="session-id-display">
                <h1 className="session-id-title font-mono">{session.sessionId}</h1>
                <button
                  type="button"
                  className="copy-btn-icon"
                  onClick={handleCopyId}
                  title="Copy session ID"
                >
                  {copied ? (
                    <Check size={14} className="text-emerald" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <div className="session-time-meta">
                <span className="meta-item">
                  <Calendar size={13} />
                  Started {startedDate.toLocaleString()}
                </span>
                <span className="meta-bullet">•</span>
                <span className="meta-item">
                  <Clock size={13} />
                  Duration {formatDuration(durationMs)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Cost"
          value={formatCost(session.totalCost)}
          subtitle="Estimated spend"
          icon={<DollarSign size={18} className="text-emerald" />}
        />
        <StatCard
          title="Total Tokens"
          value={formatTokens(session.totalTokens)}
          subtitle="Prompt & response"
          icon={<Layers size={18} className="text-blue" />}
        />
        <StatCard
          title="Tool Calls"
          value={formatTokens(session.toolCalls)}
          subtitle="Invocations executed"
          icon={<Wrench size={18} className="text-teal" />}
        />
        <StatCard
          title="Errors"
          value={formatTokens(session.errors)}
          subtitle="Failures in session"
          icon={
            <AlertTriangle
              size={18}
              className={session.errors > 0 ? 'text-rose' : 'text-zinc'}
            />
          }
        />
      </div>

      {/* Chronological Timeline */}
      <div className="timeline-section">
        <div className="timeline-section-header">
          <div>
            <h2 className="section-title">Execution Timeline</h2>
            <p className="section-subtitle">
              Chronological trace of API requests, prompts, and tool calls.
            </p>
          </div>
          <span className="event-count-badge">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {events.length === 0 ? (
          <div className="timeline-empty-card">
            No events recorded for this session.
          </div>
        ) : (
          <Timeline events={events} />
        )}
      </div>
    </div>
  );
};
