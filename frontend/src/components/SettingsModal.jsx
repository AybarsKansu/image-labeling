import React, { useState, useEffect } from 'react';
import './components.css';

export default function SettingsModal({
    isOpen,
    onClose,
    availableModels,
    selectedModel,
    setSelectedModel,
    enableAugmentation,
    setEnableAugmentation,
    textBoxConf,
    setTextBoxConf,
    textIou,
    setTextIou
}) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-container is-panel">
                <div className="modal-header">
                    <div className="modal-title">
                        <span>⚙️</span> Settings
                    </div>
                    <button onClick={onClose} className="close-btn">✖</button>
                </div>

                <div className="modal-content">

                    {/* Data Augmentation */}
                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '1rem', padding: '10px', background: '#1f2937', borderRadius: '6px' }}>
                        <input
                            type="checkbox"
                            checked={enableAugmentation}
                            onChange={(e) => setEnableAugmentation(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                        />
                        <div>
                            <label className="form-label" style={{ marginBottom: 0, color: '#fff' }}>Data Augmentation</label>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>
                                Generate variations (flip, noise) on save.
                            </p>
                        </div>
                    </div>

                    {/* Text Segmentation Settings */}
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>
                            Text Segmentation Params
                        </h4>

                        {/* Text Box Confidence */}
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Text Box Conf</span>
                                <span style={{ color: '#a78bfa' }}>{textBoxConf}%</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={textBoxConf}
                                onChange={(e) => setTextBoxConf(e.target.value)}
                                style={{ width: '100%', cursor: 'pointer', accentColor: '#8b5cf6' }}
                            />
                        </div>

                        {/* IoU Threshold */}
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>IoU Threshold</span>
                                <span style={{ color: '#a78bfa' }}>{textIou}%</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={textIou}
                                onChange={(e) => setTextIou(e.target.value)}
                                style={{ width: '100%', cursor: 'pointer', accentColor: '#8b5cf6' }}
                            />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
