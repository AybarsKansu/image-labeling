import React, { useState } from 'react';
import '../components.css';

/**
 * TrainPanel Component
 * Now features Advanced & Preprocessing settings.
 */
export default function TrainPanel({
    isOpen,
    onClose,
    models,
    selectedBaseModel,
    onBaseModelChange,
    epochs,
    onEpochsChange,
    batchSize,
    onBatchSizeChange,
    isTraining,
    trainingProgress,
    trainingMessage,
    onStartTraining,
    onCancelTraining,
    error
}) {
    // --- Advanced Local State ---
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Hyperparams
    const [patience, setPatience] = useState(50);
    const [optimizer, setOptimizer] = useState('auto');
    const [lr0, setLr0] = useState(0.01);
    const [imgsz, setImgsz] = useState(640);
    const [customModelName, setCustomModelName] = useState('');

    // Preprocessing
    const [resizeMode, setResizeMode] = useState('none');
    const [enableTiling, setEnableTiling] = useState(false);
    const [tileSize, setTileSize] = useState(640);
    const [tileOverlap, setTileOverlap] = useState(0.2);

    if (!isOpen) return null;

    const handleStart = () => {
        onStartTraining({
            base_model: selectedBaseModel,
            epochs,
            batch_size: batchSize,
            patience,
            optimizer,
            lr0,
            imgsz,
            custom_model_name: customModelName,
            preprocess_params: {
                resize_mode: resizeMode,
                enable_tiling: enableTiling,
                tile_size: parseInt(tileSize),
                tile_overlap: parseFloat(tileOverlap)
            }
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-container is-panel" style={{ width: '500px' }}>
                <div className="modal-header">
                    <div className="modal-title" style={{ color: '#fbbf24' }}>
                        <span>🔥</span> Power Training
                    </div>
                    <button onClick={onClose} className="close-btn" disabled={isTraining}>✖</button>
                </div>

                <div className="modal-content">
                    {/* Status Display */}
                    {isTraining ? (
                        <div className="progress-container">
                            <div className="progress-header">
                                <span>Training in progress...</span>
                                <span>{Math.round(trainingProgress * 100)}%</span>
                            </div>
                            <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${trainingProgress * 100}%` }} />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                                {trainingMessage}
                            </p>
                        </div>
                    ) : (
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                            <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.85rem' }}>Status: <span style={{ color: '#fff' }}>{trainingMessage}</span></p>
                        </div>
                    )}

                    {/* Basic Config */}
                    <div className="form-group">
                        <label className="form-label">Base Model</label>
                        <select
                            value={selectedBaseModel}
                            onChange={e => onBaseModelChange(e.target.value)}
                            disabled={isTraining}
                            className="form-select"
                        >
                            {models.filter(m => !m.id.includes('sam')).map(m => (
                                <option key={m.id} value={m.id}>{m.name || m.id}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Target Model Name (Optional)</label>
                        <input
                            type="text"
                            value={customModelName}
                            onChange={e => setCustomModelName(e.target.value)}
                            placeholder="e.g. drone_detector_v1"
                            className="form-input"
                            disabled={isTraining}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group">
                            <label className="form-label">Epochs</label>
                            <input type="number" value={epochs} onChange={e => onEpochsChange(e.target.value)} disabled={isTraining} className="form-input" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Batch Size</label>
                            <input type="number" value={batchSize} onChange={e => onBatchSizeChange(e.target.value)} disabled={isTraining} className="form-input" />
                        </div>
                    </div>

                    {/* Advanced Accordion */}
                    <div style={{ marginTop: '15px', borderTop: '1px solid #333', paddingTop: '10px' }}>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                            {showAdvanced ? '🔽' : '▶'} Advanced Settings
                        </button>

                        {showAdvanced && (
                            <div className="advanced-settings" style={{ marginTop: '10px', padding: '10px', background: '#1e293b', borderRadius: '6px' }}>
                                {/* Hyperparams */}
                                <h5 style={{ margin: '0 0 10px 0', color: '#ccc', fontSize: '0.8rem' }}>Hyperparameters</h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                                    <div>
                                        <label className="form-label">Img Size</label>
                                        <select value={imgsz} onChange={e => setImgsz(parseInt(e.target.value))} className="form-select">
                                            <option value={640}>640</option>
                                            <option value={1024}>1024</option>
                                            <option value={1280}>1280</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">Optimizer</label>
                                        <select value={optimizer} onChange={e => setOptimizer(e.target.value)} className="form-select">
                                            <option value="auto">Auto</option>
                                            <option value="SGD">SGD</option>
                                            <option value="Adam">Adam</option>
                                            <option value="AdamW">AdamW</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">Patience</label>
                                        <input type="number" value={patience} onChange={e => setPatience(e.target.value)} className="form-input" />
                                    </div>
                                    <div>
                                        <label className="form-label">Learning Rate (lr0)</label>
                                        <input type="number" step="0.001" value={lr0} onChange={e => setLr0(e.target.value)} className="form-input" />
                                    </div>
                                </div>

                                {/* Preprocessing */}
                                <h5 style={{ margin: '0 0 10px 0', color: '#ccc', fontSize: '0.8rem' }}>Data Preprocessing</h5>

                                <div className="form-group">
                                    <label className="form-label">Resize Dataset</label>
                                    <select value={resizeMode} onChange={e => setResizeMode(e.target.value)} className="form-select">
                                        <option value="none">No Resize</option>
                                        <option value="640">640x640</option>
                                        <option value="1024">1024x1024</option>
                                    </select>
                                </div>

                                <div className="checkbox-row" style={{ marginTop: '10px' }}>
                                    <input type="checkbox" checked={enableTiling} onChange={e => setEnableTiling(e.target.checked)} />
                                    <label style={{ color: '#fff', fontSize: '0.9rem' }}>Enable Tiling (Slicing)</label>
                                </div>

                                {enableTiling && (
                                    <div style={{ paddingLeft: '20px', marginTop: '5px' }}>
                                        <div className="form-group">
                                            <label className="form-label">Tile Size</label>
                                            <input type="number" value={tileSize} onChange={e => setTileSize(e.target.value)} className="form-input" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Overlap ({Math.round(tileOverlap * 100)}%)</label>
                                            <input type="range" min="0" max="0.5" step="0.05" value={tileOverlap} onChange={e => setTileOverlap(e.target.value)} style={{ width: '100%' }} />
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: '#fbbf24' }}>
                                            Note: Tiling remaps coordinates. Ensure objects are smaller than tiles.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {error && <div className="error-msg" style={{ marginTop: '15px' }}>{error}</div>}

                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                        {isTraining && (
                            <button onClick={onCancelTraining} className="btn-train cancel" style={{ flex: 1, background: '#ef4444' }}>🛑 Cancel</button>
                        )}
                        <button onClick={handleStart} disabled={isTraining} className="btn-train" style={{ flex: 2 }}>
                            {isTraining ? 'Training...' : '🚀 Start Training'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
