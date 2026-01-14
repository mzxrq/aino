import React from 'react';
import { Trans } from '@lingui/react/macro';

// Minimal ChartToolbar wrapper — render children or a simple container.
export default function ChartToolbar({ children, className }) {
  return (
    <div className={className || 'chart-toolbar'}>
      {children || null}
    </div>
  );
}