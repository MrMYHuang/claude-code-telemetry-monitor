import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timeline } from './Timeline';
import type { EventItem } from '../api/client';

describe('Timeline component', () => {
  it('renders empty message when events list is empty', () => {
    const html = renderToStaticMarkup(<Timeline events={[]} />);
    expect(html).toContain('No events match the selected filter');
  });

  it('renders events with proper badges and duration', () => {
    const events: EventItem[] = [
      {
        id: 1,
        ts: '2026-10-09T12:00:00.000Z',
        eventName: 'api_request',
        sessionId: 'sess-1',
        promptId: null,
        model: 'claude-3-7-sonnet',
        toolName: null,
        durationMs: 1500,
        success: true,
        costUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 250,
        error: null,
        attributes: {},
      },
      {
        id: 2,
        ts: '2026-10-09T12:00:02.000Z',
        eventName: 'tool_result',
        sessionId: 'sess-1',
        promptId: null,
        model: null,
        toolName: 'Bash',
        durationMs: 350,
        success: true,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: null,
        attributes: {},
      },
    ];

    const html = renderToStaticMarkup(<Timeline events={events} />);
    expect(html).toContain('API Request');
    expect(html).toContain('claude-3-7-sonnet');
    expect(html).toContain('1.5s');
    expect(html).toContain('Bash');
    expect(html).toContain('350ms');
  });

  it('highlights failed events with error styles', () => {
    const events: EventItem[] = [
      {
        id: 3,
        ts: '2026-10-09T12:00:05.000Z',
        eventName: 'tool_result',
        sessionId: 'sess-1',
        promptId: null,
        model: null,
        toolName: 'FileEdit',
        durationMs: 200,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'Permission denied',
        attributes: {},
      },
      {
        id: 4,
        ts: '2026-10-09T12:00:06.000Z',
        eventName: 'api_error',
        sessionId: 'sess-1',
        promptId: null,
        model: 'claude-3-7-sonnet',
        toolName: null,
        durationMs: 50,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'Overloaded',
        attributes: {},
      },
    ];

    const html = renderToStaticMarkup(<Timeline events={events} />);
    expect(html).toContain('item-error');
    expect(html).toContain('Permission denied');
    expect(html).toContain('Overloaded');
    expect(html).toContain('API Error');
  });
});
