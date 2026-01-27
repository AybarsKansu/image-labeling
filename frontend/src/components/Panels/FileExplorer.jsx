import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useDropzone } from 'react-dropzone';
import { FileStatus } from '../../db/index';
import './FileExplorer.css';

const FileExplorer = ({
    files = [],
    activeFileId,
    onSelectFile,
    onIngestFiles,
    onClearAll,
    onRetryFile,
    onRemoveFile,
    onSaveAll,
    onExportProject,    // NEW: Opens export modal
    onImportLabels,     // NEW: Handler for importing label files
    isSyncEnabled,
    onToggleSync,
    syncStats = { pending: 0, syncing: 0, synced: 0, total: 0 },
    isProcessing = false,
    processingProgress = { processed: 0, total: 0 }
}) => {
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const labelInputRef = useRef(null);
    const [collapsedFolders, setCollapsedFolders] = useState(new Set());

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

    // --- Label Dropzone Logic ---
    const onDropLabels = useCallback((acceptedFiles) => {
        const labelFiles = acceptedFiles.filter(f =>
            /\.(txt|xml|json)$/i.test(f.name)
        );
        if (labelFiles.length > 0 && onIngestFiles) {
            // Pass all files to the unified ingestion handler
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
        multiple: true // Enable multiple files
    });

    const handleImageSelect = (e) => {
        const selected = Array.from(e.target.files || []).filter(f =>
            f.type.startsWith('image/')
        );
        if (selected.length > 0) onIngestFiles(selected);
        e.target.value = '';
    };

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
        const flatList = [];
        const folders = {};

        files.forEach(file => {
            const parts = file.path ? file.path.split('/') : [];
            const dirPath = parts.slice(0, -1).join('/') || 'Root';

            if (!folders[dirPath]) folders[dirPath] = [];
            folders[dirPath].push(file);
        });

        const sortedPaths = Object.keys(folders).sort();

        sortedPaths.forEach(path => {
            const isCollapsed = collapsedFolders.has(path);

            flatList.push({
                type: 'folder',
                path: path,
                name: path === 'Root' ? '📂 project_root' : `📁 ${path}`,
                count: folders[path].length,
                isCollapsed
            });

            if (!isCollapsed) {
                folders[path].forEach(file => {
                    flatList.push({
                        type: 'file',
                        data: file
                    });
                });
            }
        });

        return flatList;
    }, [files, collapsedFolders]);

    // Calculate annotation count for export stats
    const annotationCount = useMemo(() => {
        return files.reduce((sum, file) => {
            const labelData = file.label_data;
            if (labelData?.d) return sum + labelData.d.length;
            return sum;
        }, 0);
    }, [files]);

    const syncPercent = syncStats.total > 0 ? Math.round((syncStats.synced / syncStats.total) * 100) : 0;

    return (
        <div className="file-explorer">
            {/* Header */}
            <div className="explorer-header">
                <div>
                    <h3>📁 Explorer</h3>
                    <div className="file-count">{files.length} images • {annotationCount} labels</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        className={`sync-toggle-btn ${isSyncEnabled ? 'active' : ''}`}
                        onClick={onToggleSync}
                        title={isSyncEnabled ? 'Cloud Sync Enabled' : 'Cloud Sync Disabled'}
                    >
                        {isSyncEnabled ? '☁️ ON' : '☁️ OFF'}
                    </button>
                    <button
                        onClick={() => { if (window.confirm('Clear everything?')) onClearAll(); }}
                        className="icon-btn"
                        title="Clear Project"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {/* Split Upload Zones */}
            <div className="upload-section">
                <div
                    className={`upload-zone images ${isImageDragActive ? 'drag-active' : ''}`}
                    {...getImageRootProps()}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input {...getImageInputProps()} />
                    <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                    <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
                    <span className="upload-icon">🖼️</span>
                    <span className="upload-text">Add Images</span>
                    <span className="upload-hint">Drop files or folders</span>
                </div>

                <div
                    className={`upload-zone labels ${isLabelDragActive ? 'drag-active' : ''}`}
                    {...getLabelRootProps()}
                    onClick={() => labelInputRef.current?.click()}
                >
                    <input {...getLabelInputProps()} />
                    <input ref={labelInputRef} type="file" multiple accept=".txt,.xml,.json" onChange={handleLabelSelect} style={{ display: 'none' }} />
                    <span className="upload-icon">📋</span>
                    <span className="upload-text">Import Labels</span>
                    <span className="upload-hint">.txt .xml .json</span>
                </div>
            </div>



            {/* Status Bars */}
            {isProcessing && (
                <div className="processing-indicator">
                    <div className="processing-text">Ingesting... {processingProgress.processed}/{processingProgress.total}</div>
                    <div className="progress-bar">
                        <div className="progress-fill processing" style={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }} />
                    </div>
                </div>
            )}

            {isSyncEnabled && syncStats.total > 0 && syncStats.pending > 0 && (
                <div className="sync-status">
                    <div className="sync-text">Syncing: {syncStats.synced}/{syncStats.total}</div>
                    <div className="progress-bar">
                        <div className="progress-fill syncing" style={{ width: `${syncPercent}%` }} />
                    </div>
                </div>
            )}

            {/* Drag Overlay */}
            {(isImageDragActive || isLabelDragActive) && (
                <div className="drag-overlay">
                    <span>{isLabelDragActive ? '📋 Drop labels file' : '📥 Drop images'}</span>
                </div>
            )}

            {/* Virtual Tree List */}
            <div className="file-list-container">
                {files.length === 0 ? (
                    <div className="empty-state"><p>Drop files or folders to start</p></div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={treeData}
                        itemContent={(index, item) => {
                            if (item.type === 'folder') {
                                return (
                                    <div
                                        className={`folder-row ${item.isCollapsed ? 'collapsed' : ''}`}
                                        onClick={() => toggleFolder(item.path)}
                                    >
                                        <span className="folder-icon">{item.isCollapsed ? '▶' : '▼'}</span>
                                        <span className="folder-name">{item.name}</span>
                                        <span className="item-count">({item.count})</span>
                                    </div>
                                );
                            }

                            const { data: file } = item;
                            const isActive = file.id === activeFileId;
                            const statusIcon = getStatusIcon(file.status);
                            const hasError = file.status === FileStatus.ERROR;
                            const isSynced = file.status === FileStatus.SYNCED;

                            return (
                                <div
                                    className={`file-row ${isActive ? 'active' : ''}`}
                                    onClick={() => onSelectFile(file.id)}
                                >
                                    <div className="file-thumbnail">
                                        {file.thumbnail ? (
                                            <img src={file.thumbnail} alt="" />
                                        ) : (
                                            <div className="placeholder-thumb">
                                                {file.status === FileStatus.MISSING_IMAGE ? '🖼️⚠️' : '🖼️'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="file-info">
                                        <div className="file-name-row">
                                            <div className="file-name">{file.name}</div>
                                            <button
                                                className="remove-file-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Remove ${file.name}?`)) onRemoveFile(file.id);
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <div className="file-meta">
                                            <span className="storage-status" title={isSynced ? 'Stored in Cloud' : 'Local Only'}>
                                                {isSynced ? '🌐' : '💻'}
                                            </span>
                                            <span
                                                onClick={(e) => {
                                                    if (hasError) {
                                                        e.stopPropagation();
                                                        onRetryFile(file.id);
                                                    }
                                                }}
                                                className={hasError ? 'retry-trigger' : ''}
                                            >
                                                {statusIcon}
                                            </span>
                                            {file.label_data && <span className="label-indicator">📋</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        }}
                    />
                )}
            </div>

            {/* Footer Actions */}
            <div className="explorer-footer">
                <button
                    className="export-btn"
                    onClick={onExportProject}
                    disabled={files.length === 0}
                    title="Export project annotations"
                >
                    📤 Export Project
                </button>
                <button
                    className="save-all-btn"
                    onClick={() => onSaveAll && onSaveAll()}
                    disabled={files.length === 0 || syncStats.pending > 0}
                >
                    🚀 Save All
                </button>
            </div>
        </div>
    );
};

function getStatusIcon(status) {
    const icons = {
        [FileStatus.PENDING]: '⏳',
        [FileStatus.SYNCING]: '🔄',
        [FileStatus.SYNCED]: '✅',
        [FileStatus.ERROR]: '⚠️',
        [FileStatus.MISSING_IMAGE]: '❓',
        [FileStatus.MISSING_LABEL]: '⏱️'
    };
    return icons[status] || '❓';
}

export default FileExplorer;