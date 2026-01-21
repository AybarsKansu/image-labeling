import React, { useState } from 'react';
import '../components.css';

export default function PreprocessingModal({
    isOpen,
    onClose,
    onStartTraining,
    isTraining
}) {
    // --- State ---
    const [autoOrient, setAutoOrient] = useState(true);
    const [resizeMode, setResizeMode] = useState('none'); // 'none', '640', '1024'
    const [enableTiling, setEnableTiling] = useState(false);
    const [tileSize, setTileSize] = useState(640);
    const [tileOverlap, setTileOverlap] = useState(0.2); // 20%
    const [epochs, setEpochs] = useState(50);
    const [batchSize, setBatchSize] = useState(16);

    if (!isOpen) return null;

    const handleStart = () => {
        onStartTraining({
            autoOrient,
            resizeMode,
            enableTiling,
            tileSize: parseInt(tileSize),
            tileOverlap: parseFloat(tileOverlap),
            epochs: parseInt(epochs),
            batchSize: parseInt(batchSize)
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-container is-panel" style={{ width: '450px' }}>
                <div className="modal-header">
                    <div className="modal-title">
                        <span>🧪</span> Prepare & Train
                    </div>
                    <button onClick={onClose} className="close-btn" disabled={isTraining}>✖</button>
                </div>

                <div className="modal-content">

                    {/* Training Params */}
                    <div className="settings-section">
                        <h4 className="section-title">Training Config</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Epochs</label>
                                <input
                                    type="number"
                                    value={epochs}
                                    onChange={e => setEpochs(e.target.value)}
                                    min="1"
                                    className="input-dark"
                                />
                            </div>
                            <div className="form-group">
                                <label>Batch Size</label>
                                <input
                                    type="number"
                                    value={batchSize}
                                    onChange={e => setBatchSize(e.target.value)}
                                    min="1"
                                    className="input-dark"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="divider" />

                    {/* Preprocessing Params */}
                    <div className="settings-section">
                        <h4 className="section-title">Preprocessing Pipeline</h4>

                        {/* Auto Orient */}
                        <div className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={autoOrient}
                                onChange={(e) => setAutoOrient(e.target.checked)}
                            />
                            <label>Auto-Orient (Strip EXIF)</label>
                        </div>

                        {/* Resize */}
                        <div className="form-group">
                            <label>Resize Strategy</label>
                            <select
                                value={resizeMode}
                                onChange={(e) => setResizeMode(e.target.value)}
                                className="select-dark"
                            >
                                <option value="none">No Resize (Keep Original)</option>
                                <option value="640">Resize to 640x640</option>
                                <option value="1024">Resize to 1024x1024</option>
                            </select>
                            <p className="hint">Applied to final images (or tiles).</p>
                        </div>

                        {/* Tiling */}
                        <div className="tiling-section" style={{
                            background: enableTiling ? '#2a3b55' : '#222',
                            padding: '10px',
                            borderRadius: '6px',
                            transition: 'background 0.3s'
                        }}>
                            <div className="checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={enableTiling}
                                    onChange={(e) => setEnableTiling(e.target.checked)}
                                />
                                <label style={{ fontWeight: 'bold', color: enableTiling ? '#60a5fa' : '#ccc' }}>
                                    Enable Slicing / Tiling
                                </label>
                            </div>

                            {enableTiling && (
                                <div className="tiling-options" style={{ marginTop: '10px', paddingLeft: '24px' }}>
                                    <div className="form-group">
                                        <label>Tile Size (px)</label>
                                        <input
                                            type="number"
                                            value={tileSize}
                                            onChange={e => setTileSize(e.target.value)}
                                            step="32"
                                            className="input-dark"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Overlap: {(tileOverlap * 100).toFixed(0)}%</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="0.5"
                                            step="0.05"
                                            value={tileOverlap}
                                            onChange={e => setTileOverlap(e.target.value)}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <p className="hint">
                                        Splits large images into smaller tiles directly on backend.
                                        <br />
                                        Annotations are clipped automatically.
                                    </p>
                                </div>
                            )}
                        </div>

                    </div>

                    <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleStart}
                            disabled={isTraining}
                            className="btn-primary"
                            style={{
                                background: isTraining ? '#ccc' : 'linear-gradient(45deg, #2563eb, #7c3aed)',
                                padding: '10px 20px',
                                fontSize: '14px'
                            }}
                        >
                            {isTraining ? 'Training Started...' : '🚀 Start Training'}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
