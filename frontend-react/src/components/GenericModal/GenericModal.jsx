import React from 'react';

export default function GenericModal({ isOpen, title, onClose, onSave, saveLabel = 'Save', children, showClose = true }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {showClose && <button className="modal-close" onClick={onClose}>×</button>}
        </div>
        <div style={{ padding: 16, overflow: 'auto' }}>
          {children}
        </div>
        <div className="modal-footer">
          {onSave && <button className="btn btn-primary" onClick={onSave} type="button">{saveLabel}</button>}
        </div>
      </div>
    </div>
  );
}
