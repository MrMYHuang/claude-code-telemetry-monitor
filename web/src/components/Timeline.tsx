import React, { useState } from 'react';
import {
  Wrench,
  Zap,
  AlertCircle,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import type { EventItem } from '../api/client';
import { formatCost, formatDuration, formatTokens } from '../lib/format';

interface TimelineProps {
  events: EventItem[];
}

export const Timeline: React.FC<TimelineProps> = ({ events }) => {
  const [filter, setFilter] = useState<'all' | 'api' | 'tools' | 'errors'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<number | string>>(new Set());

  const toggleExpand = (key: number | string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isErrorEvent = (event: EventItem): boolean => {
    return (
      event.eventName === 'api_error' ||
      event.success === false ||
      Boolean(event.error)
    );
  };

  const filteredEvents = events.filter((e) => {
    if (filter === 'errors') return isErrorEvent(e);
    if (filter === 'api') return e.eventName === 'api_request' || e.eventName === 'api_error';
    if (filter === 'tools') return e.eventName === 'tool_result' || e.eventName === 'tool_decision';
    return true;
  });

  const maxDuration = events.reduce((max, e) => {
    const d = typeof e.durationMs === 'number' && e.durationMs > 0 ? e.durationMs : 0;
    return d > max ? d : max;
  }, 100);

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    } catch {
      return ts;
    }
  };

  const getEventBadge = (event: EventItem) => {
    switch (event.eventName) {
      case 'api_request':
        return (
          <span className="event-badge badge-api">
            <Zap size={12} />
            <span>API Request</span>
          </span>
        );
      case 'tool_result':
        return (
          <span className={`event-badge ${event.success === false ? 'badge-error' : 'badge-tool'}`}>
            <Wrench size={12} />
            <span>{event.toolName || 'Tool'}</span>
          </span>
        );
      case 'api_error':
        return (
          <span className="event-badge badge-error">
            <AlertCircle size={12} />
            <span>API Error</span>
          </span>
        );
      case 'user_prompt':
        return (
          <span className="event-badge badge-prompt">
            <MessageSquare size={12} />
            <span>Prompt</span>
          </span>
        );
      case 'tool_decision':
        return (
          <span className="event-badge badge-decision">
            <Wrench size={12} />
            <span>Decision</span>
          </span>
        );
      default:
        return (
          <span className="event-badge badge-default">
            <HelpCircle size={12} />
            <span>{event.eventName}</span>
          </span>
        );
    }
  };

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <div className="timeline-filter-group">
          <Filter size={14} className="timeline-filter-icon" />
          <span className="timeline-filter-label">Filter:</span>
          <button
            type="button"
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({events.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'api' ? 'active' : ''}`}
            onClick={() => setFilter('api')}
          >
            API Calls ({events.filter((e) => e.eventName.startsWith('api_')).length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'tools' ? 'active' : ''}`}
            onClick={() => setFilter('tools')}
          >
            Tools ({events.filter((e) => e.eventName.startsWith('tool_')).length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'errors' ? 'active' : ''}`}
            onClick={() => setFilter('errors')}
          >
            Errors ({events.filter(isErrorEvent).length})
          </button>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="timeline-empty">
          No events match the selected filter.
        </div>
      ) : (
        <div className="timeline-list">
          {filteredEvents.map((event, idx) => {
            const key = event.id ?? `${event.ts}-${idx}`;
            const isError = isErrorEvent(event);
            const isExpanded = expandedIds.has(key);
            const duration = event.durationMs;
            const durationPercent =
              typeof duration === 'number' && duration > 0
                ? Math.min(100, Math.max(4, (duration / maxDuration) * 100))
                : 0;

            const hasDetails =
              Boolean(event.error) ||
              Boolean(event.attributes && Object.keys(event.attributes).length > 0) ||
              event.inputTokens != null ||
              event.outputTokens != null;

            return (
              <div
                key={key}
                className={`timeline-item ${isError ? 'item-error' : ''} ${
                  isExpanded ? 'item-expanded' : ''
                }`}
              >
                <div
                  className="timeline-item-summary"
                  onClick={() => hasDetails && toggleExpand(key)}
                  role={hasDetails ? 'button' : undefined}
                  tabIndex={hasDetails ? 0 : undefined}
                >
                  <div className="timeline-col-expand">
                    {hasDetails ? (
                      isExpanded ? (
                        <ChevronDown size={14} className="expand-icon" />
                      ) : (
                        <ChevronRight size={14} className="expand-icon" />
                      )
                    ) : (
                      <span className="expand-spacer" />
                    )}
                  </div>

                  <div className="timeline-col-time">
                    <span className="time-text">{formatTimestamp(event.ts)}</span>
                  </div>

                  <div className="timeline-col-kind">{getEventBadge(event)}</div>

                  <div className="timeline-col-details">
                    {event.model && (
                      <span className="model-chip">{event.model}</span>
                    )}
                    {event.toolName && event.eventName !== 'tool_result' && (
                      <span className="tool-chip">{event.toolName}</span>
                    )}
                    {event.error && (
                      <span className="error-chip" title={event.error}>
                        {event.error.length > 80
                          ? `${event.error.slice(0, 80)}…`
                          : event.error}
                      </span>
                    )}
                    {event.costUsd != null && event.costUsd > 0 && (
                      <span className="cost-chip">{formatCost(event.costUsd)}</span>
                    )}
                    {(event.inputTokens != null || event.outputTokens != null) && (
                      <span className="tokens-chip">
                        {formatTokens(
                          (event.inputTokens || 0) + (event.outputTokens || 0),
                        )}{' '}
                        tok
                      </span>
                    )}
                  </div>

                  <div className="timeline-col-duration">
                    {typeof duration === 'number' && duration > 0 ? (
                      <div className="duration-container">
                        <div className="duration-bar-bg">
                          <div
                            className={`duration-bar-fill ${
                              isError ? 'fill-error' : 'fill-primary'
                            }`}
                            style={{ width: `${durationPercent}%` }}
                          />
                        </div>
                        <span className="duration-text">
                          {formatDuration(duration)}
                        </span>
                      </div>
                    ) : (
                      <span className="duration-text text-muted">—</span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="timeline-item-body">
                    {event.error && (
                      <div className="timeline-error-box">
                        <div className="error-title">Error message:</div>
                        <pre className="error-content">{event.error}</pre>
                      </div>
                    )}

                    <div className="timeline-metadata-grid">
                      {event.model && (
                        <div className="metadata-item">
                          <span className="metadata-label">Model:</span>
                          <span className="metadata-value font-mono">{event.model}</span>
                        </div>
                      )}
                      {event.toolName && (
                        <div className="metadata-item">
                          <span className="metadata-label">Tool Name:</span>
                          <span className="metadata-value font-mono">{event.toolName}</span>
                        </div>
                      )}
                      {event.inputTokens != null && (
                        <div className="metadata-item">
                          <span className="metadata-label">Input Tokens:</span>
                          <span className="metadata-value font-mono">
                            {formatTokens(event.inputTokens)}
                          </span>
                        </div>
                      )}
                      {event.outputTokens != null && (
                        <div className="metadata-item">
                          <span className="metadata-label">Output Tokens:</span>
                          <span className="metadata-value font-mono">
                            {formatTokens(event.outputTokens)}
                          </span>
                        </div>
                      )}
                      {event.costUsd != null && (
                        <div className="metadata-item">
                          <span className="metadata-label">Cost:</span>
                          <span className="metadata-value font-mono">
                            {formatCost(event.costUsd)}
                          </span>
                        </div>
                      )}
                      {event.promptId && (
                        <div className="metadata-item">
                          <span className="metadata-label">Prompt ID:</span>
                          <span className="metadata-value font-mono">{event.promptId}</span>
                        </div>
                      )}
                    </div>

                    {event.attributes && Object.keys(event.attributes).length > 0 && (
                      <div className="timeline-attributes-box">
                        <div className="attributes-title">Attributes:</div>
                        <pre className="attributes-content">
                          {JSON.stringify(event.attributes, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
