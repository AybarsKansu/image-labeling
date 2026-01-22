import React, { useRef } from 'react';
import './MainToolbar.css';

/**
 * MainToolbar Component
 * Top toolbar with file input, tools, AI controls, and actions
 */
const MainToolbar = ({
    // Image
    imageFile,
    onImageUpload,
    onCloseImage,

    // Tool state
    tool,
    setTool,
    aiBoxMode,
    setAiBoxMode,
    eraserSize,
    setEraserSize,
    confidenceThreshold,
    setConfidenceThreshold,
    textPrompt,
    setTextPrompt,

    // AI Models
    selectedModel,
    onOpenModelManager,
    onOpenSettings,
    onOpenTrainModal,

    // Actions
    onDetectAll,
    onSave,
    onUndo,
    onRedo,
    onClearAll,
    canUndo,
    canRedo,

    // Status
    isProcessing,
    saveMessage
}) => {
    const fileInputRef = useRef(null);

    const tools = [
        { id: 'select', icon: '👆', label: 'Select' },
        { id: 'pan', icon: '✋', label: 'Pan' },
        { id: 'box', icon: '⬜', label: 'Box' },
        { id: 'poly', icon: '📐', label: 'Polygon' },
        { id: 'pen', icon: '✏️', label: 'Pen' },
        { id: 'ai-box', icon: '🤖', label: 'AI Box' },
        { id: 'knife', icon: '🔪', label: 'Knife' },
        { id: 'eraser', icon: '🧹', label: 'Eraser' }
    ];

    return (
        <div className="main-toolbar">
            {/* File Section */}
            <div className="toolbar-section">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onImageUpload}
                    style={{ display: 'none' }}
                />
                <button
                    className="toolbar-btn primary"
                    onClick={() => fileInputRef.current?.click()}
                >
                    📁 Open Image
                </button>
                {imageFile && (
                    <button
                        className="toolbar-btn danger"
                        onClick={onCloseImage}
                    >
                        ✖ Close
                    </button>
                )}
            </div>

            <div className="toolbar-divider" />

            {/* Tool Buttons */}
            <div className="toolbar-section tools">
                {tools.map(t => (
                    <div key={t.id} className="tooltip-container">
                        <button
                            className={`toolbar-btn tool ${tool === t.id ? 'active' : ''}`}
                            onClick={() => setTool(t.id)}
                        >
                            {t.icon}
                        </button>
                        <span className="tooltip-text">{t.label}</span>
                    </div>
                ))}
            </div>

            {/* AI Box Mode Toggle */}
            {tool === 'ai-box' && (
                <div className="toolbar-section">
                    <div className="toggle-group">
                        <button
                            className={`toggle-btn ${aiBoxMode === 'rect' ? 'active' : ''}`}
                            onClick={() => setAiBoxMode('rect')}
                        >
                            Box
                        </button>
                        <button
                            className={`toggle-btn ${aiBoxMode === 'lasso' ? 'active' : ''}`}
                            onClick={() => setAiBoxMode('lasso')}
                        >
                            Lasso
                        </button>
                    </div>
                </div>
            )}

            {/* Text Prompt Input - Always Visible for SAM/CLIP */}
            <div className="toolbar-section">
                <input
                    type="text"
                    className="text-prompt-input"
                    placeholder="Class prompt (e.g., 'car', 'dog')"
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                />
            </div>

            {/* Eraser Size Slider */}
            {tool === 'eraser' && (
                <div className="toolbar-section">
                    <label className="slider-label">
                        Size: {eraserSize}px
                        <input
                            type="range"
                            min="5"
                            max="100"
                            value={eraserSize}
                            onChange={(e) => setEraserSize(parseInt(e.target.value))}
                            className="slider"
                        />
                    </label>
                </div>
            )}

            <div className="toolbar-divider" />

            {/* AI Actions */}
            <div className="toolbar-section">
                <button
                    className="toolbar-btn accent"
                    onClick={onDetectAll}
                    disabled={isProcessing || !imageFile}
                >
                    {isProcessing
                        ? '⏳'
                        : textPrompt && textPrompt.trim() !== ''
                            ? '📝 Segment-text'
                            : '🔍 Detect All'
                    }

                </button>

                <div className="tooltip-container">
                    <button
                        className="toolbar-btn"
                        onClick={onOpenModelManager}
                    >
                        ⚡ {selectedModel?.split('.')[0] || 'Models'}
                    </button>
                    <span className="tooltip-text">Model Manager</span>
                </div>
            </div>

            {/* Confidence Slider */}
            <div className="toolbar-section">
                <div className="confidence-header">
                    <span className="section-label">Confidence</span>
                    <div className="value-badge">
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={confidenceThreshold}
                            onChange={(e) => {
                                let val = parseInt(e.target.value);
                                if (val > 100) val = 100;
                                if (val < 1) val = 1;
                                setConfidenceThreshold(isNaN(val) ? '' : val);
                            }}
                            className="minimal-input"
                        />
                        <span className="unit">%</span>
                    </div>
                </div>

                <input
                    type="range"
                    min="1"
                    max="100"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
                    className="minimal-slider"
                />
            </div>

            <div className="toolbar-divider" />

            {/* Edit Actions */}
            <div className="toolbar-section">
                <button
                    className="toolbar-btn"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo"
                >
                    ↩️
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo"
                >
                    ↪️
                </button>
                <button
                    className="toolbar-btn danger"
                    onClick={onClearAll}
                    title="Clear All"
                >
                    🗑️
                </button>
            </div>

            <div className="toolbar-divider" />

            {/* Save & Settings */}
            <div className="toolbar-section">
                <button
                    className="toolbar-btn success"
                    onClick={onSave}
                    disabled={!imageFile}
                >
                    💾 Save
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onOpenSettings}
                    title="Settings"
                >
                    ⚙️
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onOpenTrainModal}
                    title="Train Model"
                >
                    🔥
                </button>
            </div>

            {/* Save Message */}
            {saveMessage && (
                <div className="save-message">
                    {saveMessage}
                </div>
            )}
        </div>
    );
};

export default MainToolbar;
