import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useDropzone } from 'react-dropzone';
import { FileStatus } from '../../db/index';
import './FileExplorer.css';


const FileExplorer = ({
    files = [],
    activeFileId,
    onSelectFile,
    onIngestFiles, // Still used for images
    onImportLabels, // NEW: Handler for label files
    onClearAll,
    onRetryFile,
    onRemoveFile,
    onSaveAll,
    // Export handlers - Now unified
    onExportProject,
    isSyncEnabled,
    onToggleSync,
    syncStats = { pending: 0, syncing: 0, synced: 0, total: 0 },
    isProcessing = false,
    processingProgress = { processed: 0, total: 0 }
}) => {
    const [collapsedFolders, setCollapsedFolders] = useState(new Set());
    const [showExportMenu, setShowExportMenu] = useState(false);

    // --- Dropzone 1: Images Only ---
    const onDropImages = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0) onIngestFiles(acceptedFiles);
    }, [onIngestFiles]);

    const { getRootProps: getImageRoot, getInputProps: getImageInput, isDragActive: isImageDrag } = useDropzone({
        onDrop: onDropImages,
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
        noClick: false,
        noKeyboard: true
    });

    // --- Dropzone 2: Labels (Single File Aggregated) ---
    const onDropLabels = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0) onImportLabels(acceptedFiles[0]); // Only take first file
    }, [onImportLabels]);

    const { getRootProps: getLabelRoot, getInputProps: getLabelInput, isDragActive: isLabelDrag } = useDropzone({
        onDrop: onDropLabels,
        accept: {
            'application/json': ['.json'],
            'text/plain': ['.txt'],
            'text/xml': ['.xml']
        },
        noClick: false,
        noKeyboard: true
    });

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

        // 1. Group by directory path
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
                    flatList.push({ type: 'file', data: file });
                });
            }
        });

        return flatList;
    }, [files, collapsedFolders]);

    const syncPercent = syncStats.total > 0 ? Math.round((syncStats.synced / syncStats.total) * 100) : 0;

    return (
        <div className="file-explorer">
            <div className="explorer-header">
                <div>
                    <h3>📁 Explorer</h3>
                    <div className="file-count">{files.length} items</div>
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
            <div className="upload-group">
                <div {...getImageRoot()} className={`upload-zone ${isImageDrag ? 'active' : ''}`}>
                    <input {...getImageInput()} />
                    <div className="upload-zone-label"><span>🖼️</span> Add Images</div>
                    <div className="upload-zone-sub">Drag & drop images</div>
                </div>

                <div {...getLabelRoot()} className={`upload-zone ${isLabelDrag ? 'active' : ''}`}>
                    <input {...getLabelInput()} />
                    <div className="upload-zone-label"><span>📝</span> Import Labels</div>
                    <div className="upload-zone-sub">Single file (.txt, .xml, .json)</div>
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

            {/* Virtual Tree List */}
            <div className="file-list-container">
                {files.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                        <p>No files loaded.</p>
                        <p>Use the buttons above to start.</p>
                    </div>
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
                                                title="Delete"
                                            >
                                                🗑️
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
                                                {getStatusIcon(file.status)}
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

            {/* Sticky Footer */}
            <div className="explorer-footer">
                {showExportMenu && (
                    <div className="export-popover">
                        <button className="export-option" onClick={() => { onExportProject && onExportProject('yolo_agg'); setShowExportMenu(false); }}>
                            📋 YOLO (Aggregated .txt)
                        </button>
                        <button className="export-option" onClick={() => { onExportProject && onExportProject('voc_agg'); setShowExportMenu(false); }}>
                            🧩 VOC (Aggregated .xml)
                        </button>
                        <button className="export-option" onClick={() => { onExportProject && onExportProject('coco'); setShowExportMenu(false); }}>
                            🥥 COCO (Standard .json)
                        </button>
                        <button className="export-option" onClick={() => { onExportProject && onExportProject('toon'); setShowExportMenu(false); }}>
                            🎨 Toon (Custom .json)
                        </button>
                    </div>
                )}

                <div className="footer-actions-row">
                    <button
                        className="action-btn"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                    >
                        📤 Export Project
                    </button>
                    <button
                        className="action-btn primary"
                        onClick={() => onSaveAll && onSaveAll()}
                        disabled={files.length === 0}
                    >
                        💾 Save All
                    </button>
                </div>
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