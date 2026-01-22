import React from 'react';
import '../components.css';

/**
 * TrainPanel Component (Refactored to pure presentation)
 * Receives all data and handlers via props
 */
export default function TrainPanel({
    isOpen,
    onClose,
    // Model data
    models,
    selectedBaseModel,
    onBaseModelChange,
    // Training config
    epochs,
    onEpochsChange,
    batchSize,
    onBatchSizeChange,
    // Training status
    isTraining,
    trainingProgress,
    trainingMessage,
    // Actions
    onStartTraining,
    // Error
    error
}) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container is-panel">
                {/* Header */}
                <div className="modal-header">
                    <div className="modal-title" style={{ color: '#fbbf24' }}>
                        <span>🔥</span> Power Training
                    </div>
                    <button onClick={onClose} className="close-btn">✖</button>
                </div>

                <div className="modal-content" style={{ maxHeight: 'none' }}>
                    {/* Status Display */}
                    {isTraining ? (
                        <div className="progress-container">
                            <div className="progress-header">
                                <span>Training in progress...</span>
                                <span>{Math.round(trainingProgress * 100)}%</span>
                            </div>
                            <div className="progress-track">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${trainingProgress * 100}%` }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                                {trainingMessage}
                            </p>
                        </div>
                    ) : (
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #333' }}>
                            <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                                Last Status: <span style={{ color: '#fff' }}>{trainingMessage}</span>
                            </p>
                        </div>
                    )}

                    {/* Form */}
                    <div className="form-group">
                        <label className="form-label">Base Model (YOLO Only)</label>
                        <select
                            value={selectedBaseModel}
                            onChange={e => onBaseModelChange(e.target.value)}
                            disabled={isTraining}
                            className="form-select"
                        >
                            {models.filter(m => {
                                const isSam = m.family === 'SAM' || (m.id && m.id.toLowerCase().includes('sam'));
                                const isMsg = m.id === 'yolo26n.pt'; // Fun easter egg check
                                return !isSam && !isMsg;
                            }).map(m => (
                                <option key={m.id} value={m.id}>{m.name || m.id}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Epochs</label>
                            <input
                                type="number"
                                value={epochs}
                                onChange={e => onEpochsChange(parseInt(e.target.value) || 100)}
                                disabled={isTraining}
                                className="form-input"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Batch Size (12GB VRAM)</label>
                            <input
                                type="number"
                                value={batchSize}
                                onChange={e => onBatchSizeChange(parseInt(e.target.value) || 16)}
                                disabled={isTraining}
                                className="form-input"
                            />
                            <p style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.25rem' }}>Rec: 16 (Max 64)</p>
                        </div>
                    </div>

                    {error && <div className="error-msg">{error}</div>}

                    <button
                        onClick={() => onStartTraining({
                            base_model: selectedBaseModel,
                            epochs,
                            batch_size: batchSize
                        })}
                        disabled={isTraining}
                        className="btn-train"
                    >
                        {isTraining ? 'Training...' : 'Start Training'}
                    </button>
                </div>
            </div>
        </div>
    );
}
