import React, { useState, useEffect } from 'react';
import './components.css';

const API_URL = 'http://localhost:8000/api';

export default function TrainPanel({ isOpen, onClose }) {
    const [models, setModels] = useState([]);
    const [config, setConfig] = useState({
        base_model: '',
        epochs: 100,
        batch_size: 16
    });
    const [status, setStatus] = useState({
        is_training: false,
        progress: 0,
        message: 'Idle'
    });
    const [error, setError] = useState('');

    // Poll status
    useEffect(() => {
        let interval;
        if (isOpen) {
            fetchModels();
            // Poll every 2s
            interval = setInterval(fetchStatus, 2000);
            fetchStatus(); // Initial fetch
        }
        return () => clearInterval(interval);
    }, [isOpen]);

    const fetchModels = async () => {
        try {
            const res = await fetch(`${API_URL}/models`);
            const data = await res.json();
            // Filter only YOLO models (exclude SAM)
            const yoloModels = (data.models || []).filter(m => !m.toLowerCase().includes('sam'));
            setModels(yoloModels);
            if (yoloModels.length > 0 && !config.base_model) {
                setConfig(prev => ({ ...prev, base_model: yoloModels[0] }));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/training-status`);
            const data = await res.json();
            setStatus(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleTrain = async () => {
        setError('');

        // Validation
        if (config.base_model.toLowerCase().includes('sam')) {
            setError("SAM 3 is a Foundation Model and cannot be fine-tuned here. Use YOLO for custom objects.");
            return;
        }

        try {
            const formData = new FormData();
            formData.append('base_model', config.base_model);
            formData.append('epochs', config.epochs);
            formData.append('batch_size', config.batch_size);

            const res = await fetch(`${API_URL}/train-model`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to start training');
            } else {
                fetchStatus();
            }
        } catch (e) {
            setError(e.message);
        }
    };

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
                    {status.is_training ? (
                        <div className="progress-container">
                            <div className="progress-header">
                                <span>Training in progress...</span>
                                <span>{Math.round(status.progress * 100)}%</span>
                            </div>
                            <div className="progress-track">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${status.progress * 100}%` }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                                {status.message}
                            </p>
                        </div>
                    ) : (
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #333' }}>
                            <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                                Last Status: <span style={{ color: '#fff' }}>{status.message}</span>
                            </p>
                        </div>
                    )}

                    {/* Form */}
                    <div className="form-group">
                        <label className="form-label">Base Model (YOLO Only)</label>
                        <select
                            value={config.base_model}
                            onChange={e => setConfig({ ...config, base_model: e.target.value })}
                            disabled={status.is_training}
                            className="form-select"
                        >
                            {models.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Epochs</label>
                            <input
                                type="number"
                                value={config.epochs}
                                onChange={e => setConfig({ ...config, epochs: parseInt(e.target.value) || 100 })}
                                disabled={status.is_training}
                                className="form-input"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Batch Size (12GB VRAM)</label>
                            <input
                                type="number"
                                value={config.batch_size}
                                onChange={e => setConfig({ ...config, batch_size: parseInt(e.target.value) || 16 })}
                                disabled={status.is_training}
                                className="form-input"
                            />
                            <p style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.25rem' }}>Rec: 16 (Max 64)</p>
                        </div>
                    </div>

                    {error && <div className="error-msg">{error}</div>}

                    <button
                        onClick={handleTrain}
                        disabled={status.is_training}
                        className="btn-train"
                    >
                        {status.is_training ? 'Training...' : 'Start Training'}
                    </button>
                </div>
            </div>
        </div>
    );
}
