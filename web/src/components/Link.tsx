import React from 'react';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function navigateTo(to: string): void {
  if (typeof window !== 'undefined') {
    if (window.location.pathname !== to) {
      window.history.pushState(null, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }
}

export const Link: React.FC<LinkProps> = ({
  to,
  children,
  onClick,
  className,
  ...props
}) => {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (
          !e.defaultPrevented &&
          e.button === 0 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey
        ) {
          e.preventDefault();
          navigateTo(to);
        }
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </a>
  );
};
