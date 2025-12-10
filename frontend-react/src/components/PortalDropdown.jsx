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
  const [dropdownWidth, setDropdownWidth] = useState(0);
  const dropdownRef = React.useRef(null);

  useEffect(() => {
    if (dropdownRef.current) {
      setDropdownWidth(dropdownRef.current.offsetWidth);
    }
  }, [children]);

  const style = {};
  if (anchorRect) {
    const top = anchorRect.bottom + offsetY;
    const viewportWidth = window.innerWidth;
    
    if (align === 'right') {
      // Calculate right alignment, but clamp to viewport
      let left = anchorRect.right - 8;
      let transform = 'translateX(-100%)';
      
      // If dropdown would go off-screen to the left, align to the left of anchor instead
      const projectedLeft = left - dropdownWidth;
      if (projectedLeft < 8) {
        // Align to left of button, or anchor left if that fits better
        left = Math.max(8, anchorRect.left);
        transform = 'translateX(0)';
      }
      
      // Also check if it goes off-screen to the right
      if (left > viewportWidth - 8) {
        left = viewportWidth - 8;
        transform = 'translateX(-100%)';
      }
      
      style.left = left + 'px';
      style.transform = transform;
    } else {
      // Left alignment with similar viewport clamping
      let left = anchorRect.left;
      if (left + dropdownWidth > viewportWidth - 8) {
        left = viewportWidth - 8 - dropdownWidth;
      }
      style.left = Math.max(8, left) + 'px';
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
    <div ref={dropdownRef} className={className || 'portal-dropdown'} style={style}>
      {children}
    </div>,
    container
  );
}
