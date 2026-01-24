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

    // Status
    isProcessing,
    saveMessage
}) => {
    const fileInputRef = useRef(null);
    const annotationInputRef = useRef(null);
    const [isToolsExpanded, setIsToolsExpanded] = useState(false);
    const [isExportExpanded, setIsExportExpanded] = useState(false);
    const [isImportExpanded, setIsImportExpanded] = useState(false);

    // Model Dropdown State
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const modelDropdownRef = useRef(null);

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
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
                setIsModelDropdownOpen(false);
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
                    {/* CUSTOM SEARCHABLE MODEL DROPDOWN */}
                    <div
                        className="model-dropdown-wrapper"
                        ref={modelDropdownRef}
                        style={{ position: 'relative' }}
                    >
                        <button
                            className="model-select-btn"
                            onClick={() => {
                                setIsModelDropdownOpen(!isModelDropdownOpen);
                                if (!isModelDropdownOpen) setModelSearchTerm('');
                            }}
                            style={{
                                background: '#374151',
                                color: 'white',
                                border: '1px solid #4b5563',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                cursor: 'pointer',
                                minWidth: '180px',
                                maxWidth: '220px'
                            }}
                            title={selectedModel || "Select Model"}
                        >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {models.find(m => m.id === selectedModel)?.name || '✨ Select AI Model...'}
                            </span>
                            <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
                        </button>

                        {isModelDropdownOpen && (
                            <div className="model-dropdown-menu" style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                width: '280px',
                                background: '#1f2937',
                                border: '1px solid #4b5563',
                                borderRadius: '4px',
                                marginTop: '4px',
                                padding: '8px',
                                zIndex: 1000,
                                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                {/* Search Input */}
                                <input
                                    type="text"
                                    placeholder="Search models..."
                                    value={modelSearchTerm}
                                    onChange={(e) => setModelSearchTerm(e.target.value)}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #4b5563',
                                        background: '#111827',
                                        color: 'white',
                                        fontSize: '12px'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />

                                {/* Model List */}
                                <div className="model-list" style={{
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px'
                                }}>
                                    {models
                                        .filter(m => m.name.toLowerCase().includes(modelSearchTerm.toLowerCase()))
                                        .map(model => (
                                            <div
                                                key={model.id}
                                                onClick={() => {
                                                    if (onSelectModel) onSelectModel(model.id);
                                                    setIsModelDropdownOpen(false);
                                                    setModelSearchTerm('');
                                                }}
                                                style={{
                                                    textAlign: 'left',
                                                    padding: '8px',
                                                    background: selectedModel === model.id ? '#3b82f6' : 'transparent',
                                                    color: 'white',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    borderBottom: '1px solid #374151'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (selectedModel !== model.id) e.currentTarget.style.background = '#374151';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (selectedModel !== model.id) e.currentTarget.style.background = 'transparent';
                                                }}
                                            >
                                                <span style={{ fontWeight: 'bold' }}>{model.name}</span>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>{model.family || 'Custom'}</span>
                                                    <span style={{ fontSize: '10px', opacity: 0.6, background: '#111827', padding: '1px 4px', borderRadius: '4px' }}>{model.type}</span>
                                                </div>
                                            </div>
                                        ))}

                                    {models.filter(m => m.name.toLowerCase().includes(modelSearchTerm.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '8px', textAlign: 'center', color: '#6b7280', fontSize: '12px' }}>
                                            No models found.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

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
