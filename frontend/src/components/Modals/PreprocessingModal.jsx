import React, { useState } from 'react';
import '../components.css';

export default function PreprocessingModal({
    isOpen,
    onClose,
    onStartTraining,
    isTraining,
    trainingStatus,
    onCancel
}) {
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
                        {isTraining ? 'Training in Progress...' : 'Prepare & Train'}
                    </div>
                    {!isTraining && <button onClick={onClose} className="close-btn">✖</button>}
                </div>

                <div className="modal-content">
                    {isTraining ? (
                        <div className="training-progress-view" style={{ padding: '20px', textAlign: 'center' }}>
                            <div className="spinner-container" style={{ marginBottom: '20px' }}>
                                <div className="spinner" style={{
                                    width: '40px', height: '40px',
                                    border: '4px solid #333',
                                    borderTop: '4px solid #ea580c',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    margin: '0 auto'
                                }}></div>
                            </div>

                            <h3 style={{
                                color: (trainingStatus?.message || "").includes("Error") ? '#ef4444' :
                                    (trainingStatus?.message || "").includes("Cancelled") ? '#f59e0b' : 'white',
                                marginBottom: '5px'
                            }}>
                                {trainingStatus?.message || "Processing..."}
                            </h3>

                            <div style={{ color: '#888', fileSize: '12px', marginBottom: '20px' }}>
                                Epoch: {trainingStatus?.epoch || 0} / {trainingStatus?.total_epochs || 0}
                            </div>

                            {/* Progress Bar */}
                            <div style={{
                                width: '100%',
                                height: '24px',
                                background: '#333',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                position: 'relative',
                                marginBottom: '20px'
                            }}>
                                <div style={{
                                    width: `${(trainingStatus?.progress || 0) * 100}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #ea580c, #f59e0b)',
                                    transition: 'width 0.3s ease'
                                }}></div>
                                <div style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 2px black'
                                }}>
                                    {Math.round((trainingStatus?.progress || 0) * 100)}%
                                </div>
                            </div>

                            <button
                                onClick={onCancel}
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                🛑 Stop Training
                            </button>
                        </div>
                    ) : (
                        <>
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

                            <div className="settings-section">
                                <h4 className="section-title">Preprocessing Pipeline</h4>

                                <div className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={autoOrient}
                                        onChange={(e) => setAutoOrient(e.target.checked)}
                                    />
                                    <label>Auto-Orient (Strip EXIF)</label>
                                </div>

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
                                    className="btn-primary"
                                    style={{
                                        background: 'linear-gradient(45deg, #2563eb, #7c3aed)',
                                        padding: '10px 20px',
                                        fontSize: '14px'
                                    }}
                                >
                                    🚀 Start Training
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
