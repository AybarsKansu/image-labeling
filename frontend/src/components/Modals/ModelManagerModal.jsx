import React, { useState, useEffect } from 'react';
import '../components.css';
import { API_URL, officialModels } from '../../constants/config';


export default function ModelManagerModal({ isOpen, onClose, activeModel, onSelectModel }) {
    const [activeTab, setActiveTab] = useState('sota');
    const [localModels, setLocalModels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        if (isOpen) fetchModels();
    }, [isOpen]);

    const fetchModels = async () => {
        try {
            const res = await fetch(`${API_URL}/models`);
            const data = await res.json();
            setLocalModels(data.models || []);
        } catch (e) {
            console.error("Failed to fetch models", e);
        }
    };

    const handleDownload = async (modelName) => {
        setLoading(true);
        setStatusMsg(`Downloading ${modelName}...`);
        try {
            const formData = new FormData();
            formData.append('model_name', modelName);
            const res = await fetch(`${API_URL}/download-model`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setStatusMsg(`Successfully loaded ${modelName}`);
                fetchModels();
            } else {
                setStatusMsg(`Error: ${data.error}`);
            }
        } catch (e) {
            setStatusMsg(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (modelName) => {
        if (!confirm(`Delete ${modelName}?`)) return;
        try {
            const formData = new FormData();
            formData.append('model_name', modelName);
            const res = await fetch(`${API_URL}/delete-model`, {
                method: 'DELETE',
                body: formData
            });
            if (res.ok) fetchModels();
        } catch (e) {
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container">
                {/* Header */}
                <div className="modal-header">
                    <div className="modal-title">
                        <span>⚡</span> Model Manager
                    </div>
                    <button onClick={onClose} className="close-btn">✖</button>
                </div>

                {/* Tabs */}
                <div className="modal-tabs">
                    <button
                        onClick={() => setActiveTab('sota')}
                        className={`tab-btn ${activeTab === 'sota' ? 'active sota' : ''}`}
                    >
                        SOTA Models (2026)
                    </button>
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`tab-btn ${activeTab === 'local' ? 'active local' : ''}`}
                    >
                        My Models ({localModels.length})
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

                    {activeTab === 'sota' ? (
                        <div className="model-list">
                            {officialModels.map((m) => {
                                const isDownloaded = localModels.includes(m.id);
                                const isActive = activeModel === m.id;

                                return (
                                    <div key={m.id} className={`model-item ${m.desc.includes('Recommended') ? 'recommended' : ''}`}>
                                        <div className="model-info">
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <h3>{m.name}</h3>
                                                {m.desc.includes('Recommended') && <span className="badge-rec">RECOMMENDED</span>}
                                            </div>
                                            <p>{m.type} • {m.desc}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            {isDownloaded && (
                                                <button
                                                    onClick={() => onSelectModel(m.id)}
                                                    className="btn-select"
                                                    style={{
                                                        background: isActive ? '#10b981' : '#4b5563',
                                                        cursor: isActive ? 'default' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    {isActive ? 'ACTIVE' : 'Select'}
                                                </button>
                                            )}

                                            {isDownloaded ? (
                                                <button disabled className="btn-primary" style={{ background: '#374151', cursor: 'default', opacity: 0.5 }}>Installed</button>
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
                                )
                            })}
                        </div>
                    ) : (
                        <div className="model-list">
                            {localModels.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>No models found.</p>}
                            {localModels.map((m) => {
                                const isActive = activeModel === m;
                                return (
                                    <div key={m} className="model-item">
                                        <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{m}</span>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button
                                                onClick={() => onSelectModel(m)}
                                                className="btn-select"
                                                style={{
                                                    background: isActive ? '#10b981' : '#4b5563',
                                                    cursor: isActive ? 'default' : 'pointer',
                                                    padding: '5px 10px',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    color: 'white'
                                                }}
                                            >
                                                {isActive ? 'ACTIVE' : 'Select'}
                                            </button>
                                            <button onClick={() => handleDelete(m)} className="btn-delete">Delete</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
