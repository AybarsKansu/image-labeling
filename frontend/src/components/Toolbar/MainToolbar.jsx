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

    // NEW: Load/Export handlers
    onLoadAnnotations,
    onExport,
    onOpenEvaluation, // Action to open evaluation dashboard

    // Status
    isProcessing,
    saveMessage
}) => {
    const fileInputRef = useRef(null);
    const annotationInputRef = useRef(null);
    const [isToolsExpanded, setIsToolsExpanded] = useState(false);
    const [isExportExpanded, setIsExportExpanded] = useState(false);
    const [isImportExpanded, setIsImportExpanded] = useState(false);
    const [loadFormat, setLoadFormat] = useState('toon');
    const dropdownRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const importDropdownRef = useRef(null);

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

    const exportFormats = [
        { id: 'toon', label: 'TOON (.toon)', ext: '.toon' },
        { id: 'yolo', label: 'YOLO (.txt)', ext: '.txt' },
        { id: 'coco', label: 'COCO (.json)', ext: '.json' },
        { id: 'voc', label: 'Pascal VOC (.xml)', ext: '.xml' }
    ];

    const loadFormats = [
        { id: 'toon', label: 'TOON (.toon)', ext: '.toon, .json' },
        { id: 'yolo', label: 'YOLO (.txt)', ext: '.txt' },
        { id: 'coco', label: 'COCO (.json)', ext: '.json' },
        { id: 'voc', label: 'Pascal VOC (.xml)', ext: '.xml' }
    ];

    const activeToolObj = tools.find(t => t.id === tool) || tools[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsToolsExpanded(false);
            }
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setIsExportExpanded(false);
            }
            if (importDropdownRef.current && !importDropdownRef.current.contains(event.target)) {
                setIsImportExpanded(false);
            }
        };

        if (isToolsExpanded || isExportExpanded || isImportExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isToolsExpanded, isExportExpanded, isImportExpanded]);

    const handleToolSelect = (toolId) => {
        setTool(toolId);
        setIsToolsExpanded(false);
    };

    const handleImportClick = (format) => {
        setLoadFormat(format);
        setIsImportExpanded(false);
        // Defer click to allow state update to propagate if needed (though mostly synch in event loop ordering)
        setTimeout(() => {
            if (annotationInputRef.current) {
                annotationInputRef.current.click();
            }
        }, 0);
    };

    const handleAnnotationFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file && onLoadAnnotations) {
            onLoadAnnotations(file, loadFormat);
        }
        // Reset input
        e.target.value = '';
    };

    const handleExportClick = (format) => {
        if (onExport) {
            onExport(format);
        }
        setIsExportExpanded(false);
    };

    return (
        <div className="main-toolbar">
            {/* File Section */}
            <div className="toolbar-section">
                {/* Load Annotations Dropdown */}
                <input
                    ref={annotationInputRef}
                    type="file"
                    accept={loadFormats.find(f => f.id === loadFormat)?.ext || '.toon,.json,.txt,.xml'}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        // Validate Extension
                        const currentFormat = loadFormats.find(f => f.id === loadFormat);
                        const expectedExts = currentFormat?.ext.split(',').map(e => e.trim().toLowerCase()) || [];
                        const fileExt = '.' + file.name.split('.').pop().toLowerCase();

                        // Allow .json for TOON as well since we added it to the list, but let's be strict based on the config
                        const isValid = expectedExts.some(ext => ext === fileExt);

                        if (!isValid) {
                            alert(`Invalid file type! \nSelected format: ${currentFormat?.label}\nExpected extensions: ${currentFormat?.ext}\nYour file: ${file.name}`);
                            e.target.value = ''; // Reset input
                            return;
                        }

                        if (onLoadAnnotations) {
                            onLoadAnnotations(file, loadFormat);
                        }
                        // Reset input
                        e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                />

                <div className="import-dropdown-wrapper" ref={importDropdownRef}>
                    <button
                        className={`toolbar-btn secondary ${isImportExpanded ? 'active' : ''}`}
                        onClick={() => setIsImportExpanded(!isImportExpanded)}
                        disabled={!imageFile}
                        title="Import annotations from file"
                    >
                        📥 Import ▾
                    </button>

                    <div className={`import-dropdown-menu ${isImportExpanded ? 'visible' : ''}`}>
                        {loadFormats.map(f => (
                            <button
                                key={f.id}
                                className="dropdown-item"
                                onClick={() => handleImportClick(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
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
                        <option value="" disabled hidden>✨ Select AI Model...</option>
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

            {/* Save & Export Section */}
            <div className="toolbar-section">
                {/* Save Project (TOON) */}
                <button
                    className="toolbar-btn success"
                    onClick={onSave}
                    disabled={!imageFile}
                    title="Save project as TOON format (local download)"
                >
                    💾 Save Project
                </button>

                {/* Export Dropdown */}
                <div className="export-dropdown-wrapper" ref={exportDropdownRef}>
                    <button
                        className={`toolbar-btn ${isExportExpanded ? 'active' : ''}`}
                        onClick={() => setIsExportExpanded(!isExportExpanded)}
                        disabled={!imageFile}
                        title="Export annotations to various formats"
                    >
                        📤 Export ▾
                    </button>

                    <div className={`export-dropdown-menu ${isExportExpanded ? 'visible' : ''}`}>
                        {exportFormats.map(f => (
                            <button
                                key={f.id}
                                className="dropdown-item"
                                onClick={() => handleExportClick(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

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
                    Train Model
                </button>

                <button
                    className="toolbar-btn"
                    onClick={onOpenEvaluation}
                    title="Evaluation Dashboard"
                    style={{ background: '#7c3aed' }}
                >
                    📊 Benchmark
                </button>
            </div>

            {/* Save Message */}
            {saveMessage && (
                <div className={`save-message ${saveMessage.type || 'info'}`}>
                    {saveMessage.text || saveMessage}
                </div>
            )}
        </div>
    );
};

export default MainToolbar;
