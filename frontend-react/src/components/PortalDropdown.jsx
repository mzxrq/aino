import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

// Simple portal dropdown that positions itself relative to an anchor DOMRect
export default function PortalDropdown({ anchorRect, align = 'right', offsetY = 8, children, onClose, className }) {
  const [container] = useState(() => document.createElement('div'));

  useEffect(() => {
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.zIndex = '10000';
    document.body.appendChild(container);
    return () => {
      try { document.body.removeChild(container); } catch (e) { void e; }
    };
  }, [container]);

  useEffect(() => {
    function onDocClick(e) {
      if (!container.contains(e.target)) {
        onClose && onClose();
      }
    }
    function onEsc(e) {
      if (e.key === 'Escape') onClose && onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [container, onClose]);

  // compute position from anchorRect
  const style = {};
  if (anchorRect) {
    const top = anchorRect.bottom + offsetY;
    if (align === 'right') {
      style.left = Math.max(8, anchorRect.right - 8) + 'px';
      style.transform = 'translateX(-100%)';
    } else {
      style.left = anchorRect.left + 'px';
    }
    style.top = top + 'px';
    style.position = 'fixed';
  } else {
    style.left = '50%';
    style.top = '50%';
    style.transform = 'translate(-50%, -50%)';
    style.position = 'fixed';
  }

  return ReactDOM.createPortal(
    <div className={className || 'portal-dropdown'} style={style}>
      {children}
    </div>,
    container
  );
}
