import React, { useState, useEffect, useCallback } from 'react';
import { Activity, LayoutDashboard, Layers, Wrench, AlertCircle } from 'lucide-react';
import type { RangeOption } from './lib/format';
import { RangePicker } from './components/RangePicker';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Overview } from './pages/Overview';
import { Sessions } from './pages/Sessions';
import { SessionDetail } from './pages/SessionDetail';
import { Tools } from './pages/Tools';
import { Errors } from './pages/Errors';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname || '/' : '/',
  );
  const [range, setRange] = useState<RangeOption>('24h');

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState(null, '', to);
      setCurrentPath(to);
    }
  }, []);

  const renderNavLinks = () => {
    const links = [
      { path: '/', label: 'Overview', icon: <LayoutDashboard size={16} /> },
      { path: '/sessions', label: 'Sessions', icon: <Layers size={16} /> },
      { path: '/tools', label: 'Tools', icon: <Wrench size={16} /> },
      { path: '/errors', label: 'Errors', icon: <AlertCircle size={16} /> },
    ];

    return (
      <nav className="nav-links">
        {links.map((link) => {
          const isActive =
            link.path === '/'
              ? currentPath === '/'
              : currentPath.startsWith(link.path);

          return (
            <a
              key={link.path}
              href={link.path}
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(link.path);
              }}
            >
              {link.icon}
              <span>{link.label}</span>
            </a>
          );
        })}
      </nav>
    );
  };

  const renderContent = () => {
    if (currentPath === '/' || currentPath === '') {
      return <Overview range={range} />;
    }

    if (currentPath.startsWith('/sessions/')) {
      const sessionId = currentPath.replace('/sessions/', '');
      return <SessionDetail id={decodeURIComponent(sessionId)} />;
    }

    if (currentPath === '/sessions') {
      return <Sessions range={range} />;
    }

    if (currentPath === '/tools') {
      return <Tools range={range} />;
    }

    if (currentPath === '/errors') {
      return <Errors range={range} />;
    }

    // Fallback default
    return <Overview range={range} />;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <a
            href="/"
            className="brand-logo"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <div className="brand-icon">
              <Activity size={18} />
            </div>
            <span className="brand-name">Claude Code Telemetry</span>
          </a>
          <span className="live-badge">
            <span className="live-dot" />
            Live (10s)
          </span>
          {renderNavLinks()}
        </div>

        <div className="header-right">
          <RangePicker value={range} onChange={setRange} />
        </div>
      </header>

      <main className="app-main">
        <ErrorBoundary key={currentPath}>
          {renderContent()}
        </ErrorBoundary>
      </main>
    </div>
  );
};
