import React from 'react';
import Modal from './Modal';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title = 'Confirm', message, confirmLabel = 'Confirm', danger = false }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
    <p style={{ color: '#374151', marginBottom: '1.5rem' }}>{message}</p>
    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', color: '#374151' }}>
        Cancel
      </button>
      <button onClick={() => { onConfirm(); onClose(); }} style={{
        padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem',
        background: danger ? '#dc2626' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 500,
      }}>
        {confirmLabel}
      </button>
    </div>
  </Modal>
);

export default ConfirmDialog;
