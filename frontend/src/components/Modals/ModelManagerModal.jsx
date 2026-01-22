import React, { useState, useEffect } from 'react';
import '../components.css';
import { API_URL } from '../../constants/config';

export default function ModelManagerModal({ isOpen, onClose, activeModel, onSelectModel }) {
    const [activeTab, setActiveTab] = useState('all'); // 'all' or 'downloaded'
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        if (isOpen) fetchModels();
    }, [isOpen]);

    const fetchModels = async () => {
        try {
            const res = await fetch(`${API_URL}/models`);
            const data = await res.json();
            // Backend returns { models: [ModelInfo, ...] }
            setModels(data.models || []);
        } catch (e) {
            console.error("Failed to fetch models", e);
            setStatusMsg("Failed to fetch model list.");
        }
    };

    const handleDownload = async (modelId) => {
        setLoading(true);
        setStatusMsg(`Downloading ${modelId}...`);
        try {
            const formData = new FormData();
            formData.append('model_id', modelId); // Backend expects model_id now
            const res = await fetch(`${API_URL}/download-model`, {
                method: 'POST',
                body: JSON.stringify({ model_id: modelId }), // Using JSON body as per Pydantic schema
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setStatusMsg(`Successfully loaded ${modelId}`);
                fetchModels();
            } else {
                setStatusMsg(`Error: ${data.detail || data.error || 'Download failed'}`);
            }
        } catch (e) {
            setStatusMsg(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (modelId) => {
        if (!confirm(`Delete ${modelId}?`)) return;
        try {
            const res = await fetch(`${API_URL}/delete-model?model_id=${modelId}`, {
                method: 'DELETE'
            });
            if (res.ok) fetchModels();
        } catch (e) {
            console.error(e);
        }
    };

    // Filter models based on tab
    const displayedModels = activeTab === 'downloaded'
        ? models.filter(m => m.is_downloaded)
        : models;

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container">
                {/* Header */}
                <div className="modal-header">

                    <button onClick={onClose} className="close-btn">✖</button>
                </div>

                {/* Tabs */}
                <div className="modal-tabs">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`tab-btn ${activeTab === 'all' ? 'active sota' : ''}`}
                    >
                        All Models
                    </button>
                    <button
                        onClick={() => setActiveTab('downloaded')}
                        className={`tab-btn ${activeTab === 'downloaded' ? 'active local' : ''}`}
                    >
                        Installed ({models.filter(m => m.is_downloaded).length})
                    </button>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {loading && (
                        <div className="status-msg">
                            <div className="spinner"></div>
                            {statusMsg}
                        </div>
                    )}

                    <div className="model-list">
                        {displayedModels.length === 0 && (
                            <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                                No models found.
                            </p>
                        )}

                        {displayedModels.map((m) => {
                            const isActive = activeModel === m.id;

                            return (
                                <div key={m.id} className={`model-item ${m.is_downloaded ? 'downloaded' : ''}`}>
                                    <div className="model-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h3>{m.name}</h3>
                                            {m.family === 'SAM' && <span className="badge-rec">SAM</span>}
                                            {m.type === 'segmentation' && <span className="badge-seg">SEG</span>}
                                        </div>
                                        <p>{m.description}</p>
                                        <code style={{ fontSize: '0.75rem', color: '#666' }}>{m.id}</code>
                                    </div>

                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        {m.is_downloaded ? (
                                            <>
                                                <button
                                                    onClick={() => onSelectModel(m.id)}
                                                    className="btn-select"
                                                    style={{
                                                        background: isActive ? '#10b981' : '#4b5563',
                                                        cursor: isActive ? 'default' : 'pointer',
                                                        fontWeight: 'bold',
                                                        opacity: isActive ? 1 : 0.9
                                                    }}
                                                >
                                                    {isActive ? 'ACTIVE' : 'Select'}
                                                </button>
                                                {!isActive && (
                                                    <button
                                                        onClick={() => handleDelete(m.id)}
                                                        className="btn-delete"
                                                        title="Delete local file"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleDownload(m.id)}
                                                disabled={loading}
                                                className="btn-primary"
                                            >
                                                Download
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>
        </div>
    );
}
