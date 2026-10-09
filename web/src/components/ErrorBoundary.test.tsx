import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary component', () => {
  it('renders children when no error occurs', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <div id="content">Child content rendered successfully</div>
      </ErrorBoundary>,
    );
    expect(html).toContain('Child content rendered successfully');
  });

  it('renders fallback when state has error', () => {
    // When ErrorBoundary catches an error via getDerivedStateFromError
    const boundary = new ErrorBoundary({ children: <div>child</div>, fallback: <div>Custom Fallback</div> });
    const state = ErrorBoundary.getDerivedStateFromError(new Error('Test crash'));
    boundary.state = state;

    const rendered = boundary.render();
    const html = renderToStaticMarkup(rendered as React.ReactElement);
    expect(html).toContain('Custom Fallback');
  });

  it('renders default ErrorState when error occurs and no fallback prop provided', () => {
    const boundary = new ErrorBoundary({ children: <div>child</div> });
    const state = ErrorBoundary.getDerivedStateFromError(new Error('Boom explosion'));
    boundary.state = state;

    const rendered = boundary.render();
    const html = renderToStaticMarkup(rendered as React.ReactElement);
    expect(html).toContain('Boom explosion');
    expect(html).toContain('Something went wrong');
  });

  it('resets error state when reset is called', () => {
    const onReset = vi.fn();
    const boundary = new ErrorBoundary({ children: <div>child</div>, onReset });
    boundary.state = { hasError: true, error: new Error('Crash') };
    const setStateSpy = vi.spyOn(boundary, 'setState');

    boundary.reset();
    expect(setStateSpy).toHaveBeenCalledWith({ hasError: false, error: null });
    expect(onReset).toHaveBeenCalled();
  });
});
