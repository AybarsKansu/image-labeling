import React, { useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import {
    MousePointer, Hand, Square, Pentagon, Pencil, Bot, Scissors, Eraser,
    Undo2, Redo2, Trash2, Download, Upload, ChevronDown, ChevronLeft,
    ChevronRight, Settings, Scan, GraduationCap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MODEL_CONFIG } from '../../constants/modelConfig';

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
    models,
    selectedModel,
    onSelectModel,
    onOpenModelManager,
    onOpenTrainModal,

    // Actions
    onDetectAll,
    onUndo,
    onRedo,
    onClearAll,
    canUndo,
    canRedo,

    // Load/Export handlers
    onLoadAnnotations,
    onExport,
    onExportCurrent,

    // State for panel toggles
    isLeftPanelOpen,
    isRightPanelOpen,
    onToggleLeftPanel,
    onToggleRightPanel,

    // Status
    isProcessing,
    saveMessage
}) => {
    const { t } = useTranslation();
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
        { id: 'select', icon: MousePointer, label: t('toolbar.select') },
        { id: 'pan', icon: Hand, label: t('toolbar.pan') },
        { id: 'box', icon: Square, label: t('toolbar.box') },
        { id: 'poly', icon: Pentagon, label: t('toolbar.polygon') },
        { id: 'pen', icon: Pencil, label: t('toolbar.pen') },
        { id: 'ai-box', icon: Bot, label: t('toolbar.aiBox') },
        { id: 'knife', icon: Scissors, label: t('toolbar.knife') },
        { id: 'eraser', icon: Eraser, label: t('toolbar.eraser') }
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
    const ActiveIcon = activeToolObj.icon;

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
        setTimeout(() => {
            if (annotationInputRef.current) {
                annotationInputRef.current.click();
            }
        }, 0);
    };

    const handleExportClick = (format) => {
        if (onExport) {
            onExport(format);
        }
        setIsExportExpanded(false);
    };

    const handleExportCurrentClick = (format) => {
        if (onExportCurrent) {
            onExportCurrent(format);
        }
        setIsExportExpanded(false);
    };

    // Reusable button styles
    const btnBase = "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-txt-main)] h-10 transition-all duration-200";
    const btnDefault = "hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-accent)]";
    const btnAccent = "bg-indigo-600 text-white border-transparent hover:bg-indigo-500 ring-1 ring-white/10";
    const btnDanger = "bg-red-600/20 text-red-400 border-red-900/30 hover:bg-red-600/40 hover:text-red-300";
    const btnDisabled = "opacity-50 cursor-not-allowed border-transparent";

    return (
        <div className="flex items-center gap-4 px-4 py-3 bg-secondary border-b border-border min-h-[72px]">

            {/* Import Section */}
            <input
                ref={annotationInputRef}
                type="file"
                accept={loadFormats.find(f => f.id === loadFormat)?.ext || '.toon,.json,.txt,.xml'}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const currentFormat = loadFormats.find(f => f.id === loadFormat);
                    const expectedExts = currentFormat?.ext.split(',').map(e => e.trim().toLowerCase()) || [];
                    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
                    const isValid = expectedExts.some(ext => ext === fileExt);

                    if (!isValid) {
                        alert(`Invalid file type!\nSelected format: ${currentFormat?.label}\nExpected extensions: ${currentFormat?.ext}\nYour file: ${file.name}`);
                        e.target.value = '';
                        return;
                    }

                    if (onLoadAnnotations) {
                        onLoadAnnotations(file, loadFormat);
                    }
                    e.target.value = '';
                }}
                style={{ display: 'none' }}
            />

            <div className="relative" ref={importDropdownRef}>
                <button
                    className={clsx(btnBase, btnDefault, isImportExpanded && "bg-gray-700", !imageFile && btnDisabled)}
                    onClick={() => setIsImportExpanded(!isImportExpanded)}
                    disabled={!imageFile}
                    title={t('toolbar.import')}
                >
                    <Upload size={16} />
                    <span className="hidden sm:inline">{t('toolbar.import')}</span>
                    <ChevronDown size={14} />
                </button>

                {isImportExpanded && (
                    <div className="absolute top-full left-0 mt-1 bg-tertiary border border-border rounded-lg shadow-xl z-50 min-w-[160px] py-1">
                        {loadFormats.map(f => (
                            <button
                                key={f.id}
                                className="w-full px-3 py-2 text-left text-sm text-txt-dim hover:bg-accent/30 hover:text-white transition-colors"
                                onClick={() => handleImportClick(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Tool Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all",
                        "bg-gray-800 text-gray-200 hover:bg-gray-700",
                        isToolsExpanded && "ring-2 ring-indigo-500"
                    )}
                    onClick={() => setIsToolsExpanded(!isToolsExpanded)}
                >
                    <ActiveIcon size={18} className="text-indigo-400" />
                    <span className="text-sm font-medium hidden sm:inline">{activeToolObj.label}</span>
                    <ChevronDown size={14} className={clsx("transition-transform", isToolsExpanded && "rotate-180")} />
                </button>

                {isToolsExpanded && (
                    <div className="absolute top-full left-0 mt-1 bg-tertiary border border-border rounded-lg shadow-xl z-50 min-w-[140px] py-1">
                        {tools.map(t => {
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.id}
                                    className={clsx(
                                        "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                                        tool === t.id
                                            ? "bg-accent/40 text-accent-light"
                                            : "text-txt-dim hover:bg-tertiary-light"
                                    )}
                                    onClick={() => handleToolSelect(t.id)}
                                >
                                    <Icon size={16} />
                                    <span>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Text Prompt Input */}
            <input
                type="text"
                className="px-3 py-1.5 bg-gray-800 border border-border rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent w-40 sm:w-52"
                placeholder={t('toolbar.classPrompt')}
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
            />

            {/* Eraser Size Slider */}
            {tool === 'eraser' && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>Size: {eraserSize}px</span>
                    <input
                        type="range"
                        min="5"
                        max="100"
                        value={eraserSize}
                        onChange={(e) => setEraserSize(parseInt(e.target.value))}
                        className="w-20 accent-indigo-500"
                    />
                </div>
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* AI Actions */}
            <button
                className={clsx(btnBase, btnAccent, (isProcessing || !imageFile) && btnDisabled)}
                onClick={onDetectAll}
                disabled={isProcessing || !imageFile}
                title={textPrompt?.trim() ? t('toolbar.segment') : t('toolbar.detect')}
            >
                {isProcessing ? (
                    <div className="spinner w-4 h-4" />
                ) : (
                    <Scan size={16} />
                )}
                <span className="hidden sm:inline">
                    {textPrompt?.trim() ? t('toolbar.segment') : t('toolbar.detect')}
                </span>
            </button>

            {/* Model Dropdown */}
            <select
                className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[140px]"
                value={selectedModel || ''}
                onChange={(e) => onSelectModel && onSelectModel(e.target.value)}
            >
                <option value="" disabled hidden>Select Model...</option>
                {models && models.map(model => (
                    <option key={model.id} value={model.id}>
                        {model.name}
                    </option>
                ))}
            </select>

            <button
                className={clsx(btnBase, "bg-transparent text-txt-dim hover:text-white p-1.5")}
                onClick={onOpenModelManager}
                title={t('modals.manageModels')}
            >
                <Settings size={18} />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Edit Actions */}
            <button
                className={clsx(btnBase, btnDefault, !canUndo && btnDisabled)}
                onClick={onUndo}
                disabled={!canUndo}
                title={t('toolbar.undo')}
            >
                <Undo2 size={16} />
            </button>
            <button
                className={clsx(btnBase, btnDefault, !canRedo && btnDisabled)}
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
            >
                <Redo2 size={16} />
            </button>
            <button
                className={clsx(btnBase, btnDanger)}
                onClick={onClearAll}
                title={t('toolbar.clearAll')}
            >
                <Trash2 size={16} />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            <div className="relative" ref={exportDropdownRef}>
                <button
                    className={clsx(btnBase, btnDefault, isExportExpanded && "bg-gray-700", !imageFile && btnDisabled)}
                    onClick={() => setIsExportExpanded(!isExportExpanded)}
                    disabled={!imageFile}
                    title={t('toolbar.export')}
                >
                    <Download size={16} />
                    <span className="hidden sm:inline">{t('toolbar.export')}</span>
                    <ChevronDown size={14} />
                </button>

                {isExportExpanded && (
                    <div className="absolute top-full right-0 mt-1 bg-tertiary border border-border rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                        <div className="px-3 py-1.5 text-xs text-txt-dim uppercase tracking-wider border-b border-border">
                            {t('toolbar.export')}
                        </div>
                        {exportFormats.map(f => (
                            <button
                                key={`current-${f.id}`}
                                className="w-full px-3 py-2 text-left text-sm text-txt-dim hover:bg-accent/30 hover:text-white transition-colors"
                                onClick={() => handleExportCurrentClick(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button
                className={clsx(btnBase, btnDefault)}
                onClick={onOpenTrainModal}
                title="Train Model"
            >
                <GraduationCap size={16} />
                <span className="hidden sm:inline">Train</span>
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Save Message */}
            {saveMessage && (
                <div className={clsx(
                    "fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 animate-pulse",
                    saveMessage.type === 'success' && "bg-green-600/90 text-white",
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
