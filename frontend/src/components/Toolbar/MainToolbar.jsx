import React, { useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import {
    MousePointer, Hand, Square, Pentagon, Pencil, Bot, Scissors, Eraser,
    Undo2, Redo2, Trash2, Download, Upload, ChevronDown,
    Settings, Scan, GraduationCap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MODEL_CONFIG } from '../../constants/modelConfig';

/**
 * MainToolbar Component
 * Slim, sophisticated header with sub-divided layout
 * - Left: Ghost-style Import buttons
 * - Center: Grouped Annotation Toolkit
 * - Right: Glowing action buttons
 */
const MainToolbar = ({
    imageFile,
    tool,
    setTool,
    eraserSize,
    setEraserSize,
    textPrompt,
    setTextPrompt,
    models,
    selectedModel,
    onSelectModel,
    onOpenModelManager,
    onOpenTrainModal,
    onDetectAll,
    onUndo,
    onRedo,
    onClearAll,
    canUndo,
    canRedo,
    onLoadAnnotations,
    onExport,
    onExportCurrent,
    isProcessing,
    saveMessage,
    filterText,
    onClearFilter
}) => {
    const { t, i18n } = useTranslation();
    const annotationInputRef = useRef(null);
    const [isExportExpanded, setIsExportExpanded] = useState(false);
    const [isImportExpanded, setIsImportExpanded] = useState(false);
    const [loadFormat, setLoadFormat] = useState('toon');
    const exportDropdownRef = useRef(null);
    const importDropdownRef = useRef(null);

    // Annotation toolkit - core tools
    const coreTools = [
        { id: 'select', icon: MousePointer, label: 'Select' },
        { id: 'box', icon: Square, label: 'Box' },
        { id: 'poly', icon: Pentagon, label: 'Polygon' },
        { id: 'pen', icon: Pencil, label: 'Brush' },
    ];

    // Secondary tools
    const secondaryTools = [
        { id: 'pan', icon: Hand, label: 'Pan' },
        { id: 'ai-box', icon: Bot, label: 'AI Box' },
        { id: 'knife', icon: Scissors, label: 'Knife' },
        { id: 'eraser', icon: Eraser, label: 'Eraser' }
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

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setIsExportExpanded(false);
            }
            if (importDropdownRef.current && !importDropdownRef.current.contains(event.target)) {
                setIsImportExpanded(false);
            }
        };

        if (isExportExpanded || isImportExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExportExpanded, isImportExpanded]);

    const handleImportClick = (format) => {
        setLoadFormat(format);
        setIsImportExpanded(false);
        setTimeout(() => annotationInputRef.current?.click(), 0);
    };

    const handleExportCurrentClick = (format) => {
        onExportCurrent?.(format);
        setIsExportExpanded(false);
    };

    return (
        <div className="flex items-center gap-2 px-4 h-12 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)]">

            {/* === LEFT SECTION: Ghost Import Buttons === */}
            <div className="flex items-center gap-1">
                {/* Language Toggle */}
                <button
                    onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'tr' : 'en')}
                    className="btn-ghost w-8 h-8 px-0"
                    title={t('settings.language')}
                >
                    <span className="font-semibold text-xs uppercase">{i18n.language}</span>
                </button>

                {/* Hidden file input */}
                <input
                    ref={annotationInputRef}
                    type="file"
                    accept={loadFormats.find(f => f.id === loadFormat)?.ext || '.toon,.json,.txt,.xml'}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        onLoadAnnotations?.(file, loadFormat);
                        e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                />

                {/* Import Dropdown */}
                <div className="relative" ref={importDropdownRef}>
                    <button
                        className={clsx("btn-ghost", !imageFile && "opacity-40 pointer-events-none")}
                        onClick={() => setIsImportExpanded(!isImportExpanded)}
                        disabled={!imageFile}
                    >
                        <Upload size={14} />
                        <span>Import</span>
                    </button>

                    {isImportExpanded && (
                        <div className="absolute top-full left-0 mt-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-50 min-w-[140px] py-1">
                            {loadFormats.map(f => (
                                <button
                                    key={f.id}
                                    className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                                    onClick={() => handleImportClick(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Export Dropdown */}
                <div className="relative" ref={exportDropdownRef}>
                    <button
                        className={clsx("btn-ghost", !imageFile && "opacity-40 pointer-events-none")}
                        onClick={() => setIsExportExpanded(!isExportExpanded)}
                        disabled={!imageFile}
                    >
                        <Download size={14} />
                        <span>Export</span>
                    </button>

                    {isExportExpanded && (
                        <div className="absolute top-full left-0 mt-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-50 min-w-[140px] py-1">
                            {exportFormats.map(f => (
                                <button
                                    key={f.id}
                                    className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                                    onClick={() => handleExportCurrentClick(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[var(--border-subtle)]" />

            {/* === CENTER SECTION: Annotation Toolkit === */}
            <div className="flex items-center gap-2 flex-1 justify-center">
                {/* Core Tools Group */}
                <div className="toolbar-group">
                    {coreTools.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                className={clsx("toolbar-group-item", tool === t.id && "active")}
                                onClick={() => setTool(t.id)}
                                title={t.label}
                            >
                                <Icon size={16} />
                            </button>
                        );
                    })}
                </div>

                {/* Secondary Tools Group */}
                <div className="toolbar-group">
                    {secondaryTools.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                className={clsx("toolbar-group-item", tool === t.id && "active")}
                                onClick={() => setTool(t.id)}
                                title={t.label}
                            >
                                <Icon size={16} />
                            </button>
                        );
                    })}
                </div>

                {/* Eraser Size Slider */}
                {tool === 'eraser' && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{eraserSize}px</span>
                        <input
                            type="range"
                            min="5"
                            max="100"
                            value={eraserSize}
                            onChange={(e) => setEraserSize(parseInt(e.target.value))}
                            className="w-16 accent-[var(--accent-color)]"
                        />
                    </div>
                )}

                {/* Filter Warning */}
                {filterText && (
                    <div className="flex items-center gap-1 bg-yellow-500/20 px-2 py-1 rounded text-xs text-yellow-500 border border-yellow-500/30">
                        <span>Filter: "{filterText}"</span>
                        <button
                            onClick={onClearFilter}
                            className="hover:text-white"
                            title="Clear Filter"
                        >
                            &times;
                        </button>
                    </div>
                )}

                {/* Class Prompt Input */}
                <input
                    type="text"
                    className="input-dark w-36 h-8 text-xs"
                    placeholder="Class (e.g., car)"
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                />

                {/* Model Selector */}
                <select
                    className="input-dark h-8 text-xs max-w-[120px] cursor-pointer"
                    value={selectedModel || ''}
                    onChange={(e) => onSelectModel?.(e.target.value)}
                >
                    <option value="" disabled hidden>Model...</option>
                    {models?.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                </select>

                <button
                    className="btn-ghost w-8 h-8 px-0"
                    onClick={onOpenModelManager}
                    title="Manage Models"
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[var(--border-subtle)]" />

            {/* === RIGHT SECTION: Action Buttons === */}
            <div className="flex items-center gap-2">
                <div className="toolbar-group">
                    <button
                        className={clsx("toolbar-group-item", !canUndo && "opacity-30 pointer-events-none")}
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        className={clsx("toolbar-group-item", !canRedo && "opacity-30 pointer-events-none")}
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>
                <button
                    className="btn-ghost w-8 h-8 px-0 text-red-400 hover:text-red-300"
                    onClick={onClearAll}
                    title="Clear All"
                >
                    <Trash2 size={14} />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-[var(--border-subtle)]" />

                {/* Glowing Detect Button */}
                <button
                    className={clsx("btn-tactile btn-accent", (isProcessing || !imageFile) && "opacity-40 pointer-events-none")}
                    onClick={onDetectAll}
                    disabled={isProcessing || !imageFile}
                    title={textPrompt?.trim() ? 'Segment' : 'Detect'}
                >
                    {isProcessing ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Scan size={14} />
                    )}
                    <span className="text-xs font-medium">{textPrompt?.trim() ? 'Segment' : 'Detect'}</span>
                </button>

                {/* Prominent Train Button */}
                <button
                    className="btn-tactile btn-success"
                    onClick={onOpenTrainModal}
                    title="Train Model"
                >
                    <GraduationCap size={14} />
                    <span className="text-xs font-medium">Train</span>
                </button>
            </div>

            {/* Save Message Toast */}
            {saveMessage && (
                <div className={clsx(
                    "fixed top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-xs font-medium z-50",
                    saveMessage.type === 'success' && "bg-emerald-600/90 text-white",
                    saveMessage.type === 'error' && "bg-red-600/90 text-white",
                    saveMessage.type === 'info' && "bg-indigo-600/90 text-white"
                )}>
                    {saveMessage.text || saveMessage}
                </div>
            )}
        </div>
    );
};

export default MainToolbar;
