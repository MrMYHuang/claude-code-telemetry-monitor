import React from 'react';
import { Layers } from 'lucide-react';

interface SessionDetailProps {
  id: string;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ id }) => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-header">
        <div className="placeholder-icon">
          <Layers size={24} />
        </div>
        <div>
          <h2 className="placeholder-title">Session Detail</h2>
          <p className="placeholder-subtitle">
            Timeline of API requests and tool calls for session: <code className="code-inline">{id}</code>
          </p>
        </div>
      </div>
      <div className="placeholder-card">
        <p>Interactive event timeline with duration bars and errors will be active in Task 8.</p>
      </div>
    </div>
  );
};
