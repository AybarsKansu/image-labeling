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
    isSyncEnabled,
    onToggleSync,
    syncStats = { pending: 0, syncing: 0, synced: 0, total: 0 },
    isProcessing = false,
    processingProgress = { processed: 0, total: 0 }
}) => {
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const [collapsedFolders, setCollapsedFolders] = useState(new Set());

    // --- Dropzone Logic ---
    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0) onIngestFiles(acceptedFiles);
    }, [onIngestFiles]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'text/plain': ['.txt'] },
        noClick: true,
        noKeyboard: true
    });

    const handleSelect = (e) => {
        const selected = Array.from(e.target.files || []);
        if (selected.length > 0) onIngestFiles(selected);
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

        // 1. Group by directory path
        files.forEach(file => {
            // Remove filename from path to get directory path
            const parts = file.path ? file.path.split('/') : [];
            const dirPath = parts.slice(0, -1).join('/') || 'Root';

            if (!folders[dirPath]) folders[dirPath] = [];
            folders[dirPath].push(file);
        });

        // 2. Sort folder keys (alphabetic)
        const sortedPaths = Object.keys(folders).sort();

        // 3. Flatten for Virtuoso
        sortedPaths.forEach(path => {
            const isCollapsed = collapsedFolders.has(path);

            // Add folder header
            flatList.push({
                type: 'folder',
                path: path,
                name: path === 'Root' ? '📂 project_root' : `📁 ${path}`,
                count: folders[path].length,
                isCollapsed
            });

            // Add files if not collapsed
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

    const syncPercent = syncStats.total > 0 ? Math.round((syncStats.synced / syncStats.total) * 100) : 0;

    return (
        <div className="file-explorer" {...getRootProps()}>
            <input {...getInputProps()} />

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

            <div className="upload-buttons">
                <input ref={fileInputRef} type="file" multiple onChange={handleSelect} style={{ display: 'none' }} />
                <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleSelect} style={{ display: 'none' }} />

                <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>📄 Files</button>
                <button className="upload-btn" onClick={() => folderInputRef.current?.click()}>📂 Folder</button>
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
            {isDragActive && <div className="drag-overlay"><span>📥 Drop to upload</span></div>}

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
                    className="save-all-btn"
                    onClick={() => onSaveAll && onSaveAll()}
                    disabled={files.length === 0 || syncStats.pending > 0}
                >
                    🚀 Save All for Training
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