import React from 'react';

const ModelManagerModal = ({
    isOpen,
    onClose,
    models,
    loadingModelIds = [],
    downloadModel,
    deleteModel
}) => {
    if (!isOpen) return null;

    // Helper to check if a specific model is loading (downloading/deleting)
    const isModelLoading = (id) => loadingModelIds.includes(id);

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div className="modal-content" style={{
                backgroundColor: '#1f2937',
                borderRadius: '8px',
                width: '800px',
                maxWidth: '95vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                color: 'white',
                border: '1px solid #374151',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid #374151',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
                        🤖 Model Manager
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            fontSize: '1.5rem'
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Content - Scrollable Table */}
                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
                                <th style={{ padding: '12px' }}>Name / ID</th>
                                <th style={{ padding: '12px' }}>Type</th>
                                <th style={{ padding: '12px' }}>Description</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {models.map(model => (
                                <tr key={model.id} style={{ borderBottom: '1px solid #374151' }}>

                                    {/* Name Column */}
                                    <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                                        <div style={{ fontWeight: 'bold' }}>{model.name}</div>
                                        <div style={{ fontSize: '0.8em', color: '#6b7280' }}>{model.id}</div>
                                    </td>

                                    {/* Type Badge */}
                                    <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '9999px',
                                            fontSize: '0.75rem',
                                            fontWeight: '500',
                                            backgroundColor: model.type === 'detection' ? 'rgba(16, 185, 129, 0.2)' : model.type === 'segmentation' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                                            color: model.type === 'detection' ? '#34d399' : model.type === 'segmentation' ? '#60a5fa' : '#d1d5db'
                                        }}>
                                            {model.type}
                                        </span>
                                    </td>

                                    {/* Description */}
                                    <td style={{ padding: '12px', color: '#d1d5db', verticalAlign: 'middle' }}>
                                        {model.description}
                                    </td>

                                    {/* Actions */}
                                    <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'middle' }}>
                                        {model.is_downloaded ? (
                                            <button
                                                onClick={() => deleteModel(model.id)}
                                                disabled={isModelLoading(model.id)}
                                                style={{
                                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                    color: isModelLoading(model.id) ? '#6b7280' : '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    cursor: isModelLoading(model.id) ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                {isModelLoading(model.id) ? (
                                                    <span className="spinner-small" />
                                                ) : '🗑️'}
                                                {isModelLoading(model.id) ? 'Deleting...' : 'Delete'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => downloadModel(model.id)}
                                                disabled={isModelLoading(model.id)}
                                                style={{
                                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                    color: isModelLoading(model.id) ? '#6b7280' : '#3b82f6',
                                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    cursor: isModelLoading(model.id) ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                {isModelLoading(model.id) ? (
                                                    <span className="spinner-small" />
                                                ) : '⬇️'}
                                                {isModelLoading(model.id) ? 'Downloading...' : 'Download'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #374151',
                    textAlign: 'right',
                    color: '#6b7280',
                    fontSize: '0.85rem'
                }}>
                    Models are downloaded from official repositories. Large models may take time to download.
                </div>
            </div>

            {/* Simple Spinner Style for this component */}
            <style jsx>{`
                .spinner-small {
                    width: 12px;
                    height: 12px;
                    border: 2px solid currentColor;
                    border-bottom-color: transparent;
                    border-radius: 50%;
                    display: inline-block;
                    animation: rotation 1s linear infinite;
                }
                @keyframes rotation {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default ModelManagerModal;
