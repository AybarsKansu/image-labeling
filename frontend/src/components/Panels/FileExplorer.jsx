import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Folder, FolderOpen, ChevronRight, ChevronDown, Image, FileText,
    Upload, Trash2, Download, RefreshCw, X, Check, AlertCircle,
    Clock, Monitor, FileWarning, Save, Eraser
} from 'lucide-react';
import { FileStatus } from '../../db/index';
import GlassConfirmModal from '../UI/GlassConfirmModal';

const FileExplorer = ({
    files = [],
    activeFileId,
    selectedFileIds = new Set(),
    onSelectFile,
    onFileClick,
    onIngestFiles,
    onClearAll,
    onRetryFile,
    onRemoveFile,
    onRemoveSelectedFiles,
    onSaveAll,
    onExportProject,
    onClearLabels,
    onSyncWithBackend,
    isProcessing = false,
    processingProgress = { processed: 0, total: 0 }
}) => {
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const labelInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const [collapsedFolders, setCollapsedFolders] = useState(new Set());

    // Modal states for replacing native window.confirm
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, type: null, fileId: null, fileName: null });
    const [clearModal, setClearModal] = useState({ isOpen: false, type: null });

    // Keyboard handler for navigation and shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Delete Shortcut
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFileIds.size > 0) {
                e.preventDefault();
                const count = selectedFileIds.size;
                setDeleteModal({
                    isOpen: true,
                    type: 'bulk',
                    count: count
                });
                return;
            }

            // Arrow Navigation
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (files.length === 0) return;

                const currentIndex = files.findIndex(f => f.id === activeFileId);
                let nextIndex = -1;

                if (currentIndex === -1) {
                    // If nothing selected, select first
                    nextIndex = 0;
                } else if (e.key === 'ArrowUp') {
                    nextIndex = Math.max(0, currentIndex - 1);
                } else if (e.key === 'ArrowDown') {
                    nextIndex = Math.min(files.length - 1, currentIndex + 1);
                }

                if (nextIndex !== -1 && nextIndex !== currentIndex) {
                    const nextFile = files[nextIndex];
                    // Trigger both select and click handler logic
                    if (onFileClick) onFileClick(nextFile.id);
                    else onSelectFile(nextFile.id);

                    // Also update selection set for visual feedback
                    // onSelectFile(nextFile.id) usually handles this but depends on implementation
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedFileIds, onRemoveSelectedFiles, files, activeFileId, onFileClick, onSelectFile]);

    // --- Image Dropzone Logic ---
    const onDropImages = useCallback((acceptedFiles) => {
        const images = acceptedFiles.filter(f =>
            f.type.startsWith('image/') ||
            /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f.name)
        );
        if (images.length > 0) onIngestFiles(images);
    }, [onIngestFiles]);

    const {
        getRootProps: getImageRootProps,
        getInputProps: getImageInputProps,
        isDragActive: isImageDragActive
    } = useDropzone({
        onDrop: onDropImages,
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] },
        noClick: true,
        noKeyboard: true
    });

    // --- Video Dropzone Logic ---
    const onDropVideo = useCallback((acceptedFiles) => {
        const videos = acceptedFiles.filter(f =>
            f.type.startsWith('video/') ||
            /\.(mp4|webm|ogg|mov|mkv)$/i.test(f.name)
        );
        if (videos.length > 0) onIngestFiles(videos);
    }, [onIngestFiles]);

    const {
        getRootProps: getVideoRootProps,
        getInputProps: getVideoInputProps,
        isDragActive: isVideoDragActive
    } = useDropzone({
        onDrop: onDropVideo,
        accept: { 'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.mkv'] },
        noClick: true,
        noKeyboard: true
    });

    const handleImageSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) onIngestFiles(files);
        e.target.value = '';
    };

    const handleVideoSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) onIngestFiles(files);
        e.target.value = '';
    };

    // --- Label Dropzone Logic ---
    const onDropLabels = useCallback((acceptedFiles) => {
        const labelFiles = acceptedFiles.filter(f =>
            /\.(txt|xml|json)$/i.test(f.name)
        );
        if (labelFiles.length > 0 && onIngestFiles) {
            onIngestFiles(labelFiles);
        }
    }, [onIngestFiles]);

    const {
        getRootProps: getLabelRootProps,
        getInputProps: getLabelInputProps,
        isDragActive: isLabelDragActive
    } = useDropzone({
        onDrop: onDropLabels,
        accept: {
            'text/plain': ['.txt'],
            'application/xml': ['.xml'],
            'application/json': ['.json']
        },
        noClick: true,
        noKeyboard: true,
        multiple: true
    });


    const handleLabelSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0 && onIngestFiles) {
            onIngestFiles(files);
        }
        e.target.value = '';
    };

    const toggleFolder = (path) => {
        setCollapsedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    // --- Hierarchical Processing ---
    const treeData = useMemo(() => {
        if (files.length === 0) return [];

        const flatList = [];
        const folders = {};

        files.forEach(file => {
            const fullPath = file.path || file.name;
            const parts = fullPath.split('/');
            const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';

            if (!folders[dirPath]) folders[dirPath] = [];
            folders[dirPath].push(file);
        });

        const sortedPaths = Object.keys(folders).sort((a, b) => {
            if (a === 'Root') return -1;
            if (b === 'Root') return 1;
            return a.localeCompare(b);
        });

        sortedPaths.forEach(path => {
            const isCollapsed = collapsedFolders.has(path);
            const isRoot = path === 'Root';

            flatList.push({
                type: 'folder',
                path: path,
                name: isRoot ? '/' : path,
                count: folders[path].length,
                isCollapsed
            });

            if (!isCollapsed) {
                const sortedFiles = [...folders[path]].sort((a, b) => a.name.localeCompare(b.name));
                sortedFiles.forEach(file => {
                    flatList.push({ type: 'file', data: file });
                });
            }
        });

        return flatList;
    }, [files, collapsedFolders]);

    const annotationCount = useMemo(() => {
        return files.reduce((sum, file) => {
            const labelData = file.label_data;
            if (labelData?.d) return sum + labelData.d.length;
            if (typeof labelData === 'string') {
                return sum + labelData.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
            }
            return sum;
        }, 0);
    }, [files]);

    const getStatusIcon = (status) => {
        const iconClass = "w-4 h-4";
        switch (status) {
            case FileStatus.PENDING:
                return <Clock className={clsx(iconClass, "text-yellow-500")} />;
            case FileStatus.SYNCING:
                return <RefreshCw className={clsx(iconClass, "text-blue-400 animate-spin")} />;
            case FileStatus.SYNCED:
                return <Check className={clsx(iconClass, "text-green-500")} />;
            case FileStatus.ERROR:
                return <AlertCircle className={clsx(iconClass, "text-red-500")} />;
            case FileStatus.MISSING_IMAGE:
                return <FileWarning className={clsx(iconClass, "text-orange-500")} />;
            case FileStatus.MISSING_LABEL:
                return <Clock className={clsx(iconClass, "text-gray-500")} />;
            default:
                return <AlertCircle className={clsx(iconClass, "text-[var(--color-txt-dim)]")} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-theme-secondary text-theme-primary">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Folder className="w-4 h-4 text-[var(--accent-indigo)]" />
                        Explorer
                    </h3>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {files.length} Files • {annotationCount} labels
                    </div>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => setClearModal({ isOpen: true, type: 'labels' })}
                        className="p-1.5 rounded-lg text-yellow-500/70 hover:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                        title="Clear All Labels"
                    >
                        <Eraser className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setClearModal({ isOpen: true, type: 'all' })}
                        className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Clear Project"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Upload Zones */}
            <div className="grid grid-cols-2 gap-3 p-4">
                {/* 1. Add Images */}
                <div
                    className={clsx(
                        "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all",
                        isImageDragActive
                            ? "border-accent bg-accent/10"
                            : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)]"
                    )}
                    {...getImageRootProps()}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input {...getImageInputProps()} />
                    <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                    <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
                    <Image className="w-8 h-8 text-[var(--color-accent)]" />
                    <span className="text-sm font-medium text-[var(--color-txt-dim)]">Add Images</span>
                </div>

                {/* 2. Upload Video */}
                <div
                    className={clsx(
                        "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-[var(--color-border)] hover:border-purple-500 hover:bg-[var(--color-bg-tertiary)] cursor-pointer transition-all",
                        isVideoDragActive
                            ? "border-purple-500 bg-purple-500/10"
                            : ""
                    )}
                    {...getVideoRootProps()}
                    onClick={() => videoInputRef.current?.click()}
                >
                    <input {...getVideoInputProps()} />
                    <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} style={{ display: 'none' }} />
                    <Monitor className="w-8 h-8 text-purple-500" />
                    <span className="text-sm font-medium text-theme-secondary">Upload Video</span>
                </div>

                {/* 2. Import Labels (Full Width) */}
                <div
                    className={clsx(
                        "col-span-2 flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-all",
                        isLabelDragActive
                            ? "border-green-500 bg-green-500/10"
                            : "border-[var(--color-border)] hover:border-green-500/50 hover:bg-[var(--color-bg-tertiary)]"
                    )}
                    {...getLabelRootProps()}
                    onClick={() => labelInputRef.current?.click()}
                >
                    <input {...getLabelInputProps()} />
                    <input ref={labelInputRef} type="file" multiple accept=".txt,.xml,.json" onChange={handleLabelSelect} style={{ display: 'none' }} />
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-green-400" />
                        <span className="text-sm font-medium text-theme-secondary">Import Labels</span>
                    </div>
                </div>
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
                <div className="px-3 pb-2">
                    <div className="bg-theme-tertiary rounded-lg p-2">
                        <div className="flex justify-between text-xs text-theme-secondary mb-1">
                            <span>Ingesting...</span>
                            <span>{processingProgress.processed}/{processingProgress.total}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[var(--accent-color)] transition-all duration-300"
                                style={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Drag Overlay */}
            <AnimatePresence>
                {(isImageDragActive || isVideoDragActive || isLabelDragActive) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-indigo-900/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none"
                    >
                        <div className="text-xl text-white font-semibold flex items-center gap-2">
                            {isLabelDragActive ? (
                                <><FileText className="w-6 h-6" /> Drop labels file</>
                            ) : isVideoDragActive ? (
                                <><Monitor className="w-6 h-6" /> Drop video file</>
                            ) : (
                                <><Upload className="w-6 h-6" /> Drop images</>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Virtual Tree List */}
            <div className="flex-1 min-h-0 overflow-hidden custom-scrollbar">
                {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--color-txt-dim)] px-6 text-center">
                        <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm mb-4">Drop files or folders to start</p>

                        {onSyncWithBackend && (
                            <button
                                onClick={onSyncWithBackend}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-all text-xs font-medium border border-indigo-500/30"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Sync from Backend
                            </button>
                        )}
                    </div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={treeData}
                        itemContent={(index, item) => {
                            if (item.type === 'folder') {
                                return (
                                    <motion.div
                                        className={clsx(
                                            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                            "hover:bg-gray-800/50 text-gray-300"
                                        )}
                                        onClick={() => toggleFolder(item.path)}
                                    >
                                        {item.isCollapsed ? (
                                            <ChevronRight className="w-4 h-4 text-[var(--color-txt-dim)]" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-[var(--color-txt-dim)]" />
                                        )}
                                        {item.isCollapsed ? (
                                            <Folder className="w-4 h-4 text-yellow-500" />
                                        ) : (
                                            <FolderOpen className="w-4 h-4 text-yellow-500" />
                                        )}
                                        <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                                        <span className="text-xs text-gray-500">({item.count})</span>
                                    </motion.div>
                                );
                            }

                            const { data: file } = item;
                            const isActive = file.id === activeFileId;
                            const isSelected = selectedFileIds.has(file.id);
                            const hasError = file.status === FileStatus.ERROR;

                            return (
                                <div
                                    className={clsx(
                                        "group flex items-center gap-3 p-2 cursor-pointer transition-all duration-200 mx-2 my-0.5 rounded-lg border",
                                        isActive
                                            ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                                            : isSelected
                                                ? "bg-indigo-500/5 border-indigo-500/20"
                                                : "border-transparent hover:bg-white/5 hover:border-white/5"
                                    )}
                                    onClick={(e) => onFileClick ? onFileClick(file.id, e) : onSelectFile(file.id)}
                                >
                                    {/* Premium Thumbnail */}
                                    <div className="relative w-10 h-10 rounded-md overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                                        {file.type === 'video' ? (
                                            <div className="flex items-center justify-center h-full">
                                                <Monitor className="w-5 h-5 text-purple-500" />
                                            </div>
                                        ) : (file.thumbnail || file.backend_url) ? (
                                            <img
                                                src={file.thumbnail || file.backend_url}
                                                alt=""
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full">
                                                <Image className="w-5 h-5 text-slate-500" />
                                            </div>
                                        )}
                                    </div>

                                    {/* File Info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className={clsx(
                                            "text-sm truncate transition-colors",
                                            isActive ? "text-indigo-200 font-medium" : "text-slate-300 group-hover:text-white"
                                        )}>
                                            {file.name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                            {/* Status Dot */}
                                            <span
                                                onClick={(e) => {
                                                    if (hasError) {
                                                        e.stopPropagation();
                                                        onRetryFile(file.id);
                                                    }
                                                }}
                                                className={clsx(
                                                    "w-1.5 h-1.5 rounded-full",
                                                    file.status === FileStatus.SYNCED && "bg-emerald-500 shadow-emerald-500/50 shadow-sm",
                                                    file.status === FileStatus.PENDING && "bg-amber-500",
                                                    file.status === FileStatus.SYNCING && "bg-blue-400 animate-pulse",
                                                    file.status === FileStatus.ERROR && "bg-red-500 cursor-pointer",
                                                    !file.status && "bg-slate-600"
                                                )}
                                            />
                                            {file.label_data && (
                                                <span className="flex items-center gap-0.5 text-emerald-400">
                                                    <FileText className="w-2.5 h-2.5" />
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Delete Button */}
                                    <button
                                        className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteModal({
                                                isOpen: true,
                                                type: 'single',
                                                fileId: file.id,
                                                fileName: file.name
                                            });
                                        }}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        }}
                    />
                )}
            </div>

            {/* Delete Single/Bulk Modal */}
            <GlassConfirmModal
                isOpen={deleteModal.isOpen}
                title={deleteModal.type === 'bulk' ? `Delete ${deleteModal.count} Files` : "Delete File"}
                message={deleteModal.type === 'bulk'
                    ? `Are you sure you want to delete ${deleteModal.count} selected files? This action cannot be undone.`
                    : `Are you sure you want to delete "${deleteModal.fileName}"?`
                }
                confirmText="Delete"
                variant="danger"
                onConfirm={() => {
                    if (deleteModal.type === 'bulk') {
                        onRemoveSelectedFiles && onRemoveSelectedFiles();
                    } else {
                        onRemoveFile && onRemoveFile(deleteModal.fileId);
                    }
                    setDeleteModal({ isOpen: false, type: null, fileId: null, fileName: null });
                }}
                onCancel={() => setDeleteModal({ isOpen: false, type: null, fileId: null, fileName: null })}
            />

            {/* Clear Labels/All Modal */}
            <GlassConfirmModal
                isOpen={clearModal.isOpen}
                title={clearModal.type === 'labels' ? "Clear All Labels" : "Clear Project"}
                message={clearModal.type === 'labels'
                    ? "This will remove all labels from your images. The images themselves will be kept."
                    : "This will remove all images and labels from your project. This action cannot be undone."
                }
                confirmText={clearModal.type === 'labels' ? "Clear Labels" : "Clear All"}
                variant={clearModal.type === 'labels' ? "warning" : "danger"}
                icon={clearModal.type === 'labels' ? Eraser : Trash2}
                onConfirm={() => {
                    if (clearModal.type === 'labels') {
                        onClearLabels && onClearLabels();
                    } else {
                        onClearAll && onClearAll();
                    }
                    setClearModal({ isOpen: false, type: null });
                }}
                onCancel={() => setClearModal({ isOpen: false, type: null })}
            />
        </div>
    );
};

export default FileExplorer;
