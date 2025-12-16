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
  const [dropdownHeight, setDropdownHeight] = useState(0);
  const dropdownRef = React.useRef(null);

  // measure dropdown size whenever children change or on explicit reposition events
  useEffect(() => {
    function measure() {
      if (dropdownRef.current) {
        setDropdownWidth(dropdownRef.current.offsetWidth || 0);
        setDropdownHeight(dropdownRef.current.offsetHeight || 0);
      }
    }
    measure();
    // reposition on resize/scroll to keep it visible
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [children]);

  const style = {};
  if (anchorRect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Decide whether to open below or above the anchor depending on space
    const spaceBelow = viewportHeight - anchorRect.bottom - offsetY;
    const spaceAbove = anchorRect.top - offsetY;
    let openAbove = false;
    let maxHeight = undefined;

    if (dropdownHeight && spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      openAbove = true;
      maxHeight = Math.max(80, Math.min(dropdownHeight, spaceAbove - 12));
    } else {
      maxHeight = Math.max(80, Math.min(dropdownHeight || 1000, spaceBelow - 12));
    }

    // vertical placement
    if (openAbove) {
      style.top = (anchorRect.top - (maxHeight || dropdownHeight) - offsetY) + 'px';
    } else {
      style.top = (anchorRect.bottom + offsetY) + 'px';
    }

    // horizontal placement with clamping
    if (align === 'right') {
      let left = anchorRect.right - 8;
      let transform = 'translateX(-100%)';
      const projectedLeft = left - dropdownWidth;
      if (projectedLeft < 8) {
        left = Math.max(8, anchorRect.left);
        transform = 'translateX(0)';
      }
      if (left > viewportWidth - 8) {
        left = viewportWidth - 8;
        transform = 'translateX(-100%)';
      }
      style.left = left + 'px';
      style.transform = transform;
    } else {
      let left = anchorRect.left;
      if (left + dropdownWidth > viewportWidth - 8) {
        left = viewportWidth - 8 - dropdownWidth;
      }
      style.left = Math.max(8, left) + 'px';
    }

    style.position = 'fixed';
    if (maxHeight) {
      style.maxHeight = (maxHeight) + 'px';
      style.overflowY = 'auto';
    }
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
