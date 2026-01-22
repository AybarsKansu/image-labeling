import React, { useRef, useState, useEffect } from 'react';
import { MODEL_CONFIG } from '../../constants/modelConfig';
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
    eraserSize,
    setEraserSize,

    textPrompt,
    setTextPrompt,

    // AI Models
    models, // List of downloaded model objects
    selectedModel,
    onSelectModel,
    onOpenModelManager, // Action to open modal
    onOpenTrainModal,

    // ... (rest of props)

    // Augmentation
    enableAugmentation,
    setEnableAugmentation,

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
    const [isToolsExpanded, setIsToolsExpanded] = useState(false);
    const dropdownRef = useRef(null);

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

    const activeToolObj = tools.find(t => t.id === tool) || tools[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsToolsExpanded(false);
            }
        };

        if (isToolsExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isToolsExpanded]);

    const handleToolSelect = (toolId) => {
        setTool(toolId);
        setIsToolsExpanded(false);
    };

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

            {/* Accordion Tool Selector */}
            <div className="toolbar-section tools" ref={dropdownRef}>
                <div className="tool-dropdown-wrapper">
                    <button
                        className={`active-tool-display ${isToolsExpanded ? 'expanded' : ''}`}
                        onClick={() => setIsToolsExpanded(!isToolsExpanded)}
                    >
                        <span className="tool-icon">{activeToolObj.icon}</span>
                        <span className="dropdown-arrow">▾</span>
                    </button>

                    <div className={`tool-dropdown-menu ${isToolsExpanded ? 'visible' : ''}`}>
                        {tools.map(t => (
                            <button
                                key={t.id}
                                className={`dropdown-item ${tool === t.id ? 'selected' : ''}`}
                                onClick={() => handleToolSelect(t.id)}
                            >
                                <span className="item-icon">{t.icon}</span>
                                <span className="item-label">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>



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

                <div className="tooltip-container" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {/* Model Dropdown */}
                    <select
                        className="model-select-dropdown"
                        value={selectedModel || ''}
                        onChange={(e) => {
                            if (onSelectModel) onSelectModel(e.target.value);
                        }}
                        style={{
                            background: '#374151',
                            color: 'white',
                            border: '1px solid #4b5563',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            height: '30px',
                            outline: 'none',
                            cursor: 'pointer',
                            maxWidth: '160px'
                        }}
                    >
                        <option value="" disabled>✨ Select AI Model...</option>
                        {/* Models are now objects { id, name, ... } */}
                        {models && models.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.name}
                            </option>
                        ))}
                    </select>

                    {/* Manage Models Button */}
                    <button
                        onClick={onOpenModelManager}
                        title="Manage Models"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            padding: '0 4px',
                            opacity: 0.7
                        }}
                        onMouseOver={(e) => e.target.style.opacity = 1}
                        onMouseOut={(e) => e.target.style.opacity = 0.7}
                    >
                        ⚙️
                    </button>
                </div>
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

                {/* Augmentation Toggle */}
                <button
                    className={`toolbar-btn ${enableAugmentation ? 'active-toggle' : ''}`}
                    onClick={() => setEnableAugmentation(!enableAugmentation)}
                    title="Toggle Augmentation"
                    style={{
                        opacity: enableAugmentation ? 1 : 0.6,
                        border: enableAugmentation ? '1px solid #10b981' : '1px solid transparent'
                    }}
                >
                    Data Augmentation
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
