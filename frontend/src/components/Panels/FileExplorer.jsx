import React, { useCallback, useRef } from 'react';
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
    syncStats = { pending: 0, syncing: 0, synced: 0, total: 0 },
    isProcessing = false,
    processingProgress = { processed: 0, total: 0 }
}) => {
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

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

    const syncPercent = syncStats.total > 0 ? Math.round((syncStats.synced / syncStats.total) * 100) : 0;

    return (
        <div className="file-explorer" {...getRootProps()}>
            <input {...getInputProps()} />

            <div className="explorer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3>📁 Project Files</h3>
                    <div className="file-count">{files.length} files</div>
                </div>
                <button
                    onClick={() => { if (window.confirm('Clear everything?')) onClearAll(); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '5px' }}
                    title="Clear Project"
                >
                    🗑️
                </button>
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
                    <div className="processing-text">Processing... {processingProgress.processed}/{processingProgress.total}</div>
                    <div className="progress-bar">
                        <div className="progress-fill processing" style={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }} />
                    </div>
                </div>
            )}

            {syncStats.total > 0 && syncStats.pending > 0 && (
                <div className="sync-status">
                    <div className="sync-text">Syncing: {syncStats.synced}/{syncStats.total}</div>
                    <div className="progress-bar">
                        <div className="progress-fill syncing" style={{ width: `${syncPercent}%` }} />
                    </div>
                </div>
            )}

            {/* Drag Overlay */}
            {isDragActive && <div className="drag-overlay"><span>📥 Drop files here</span></div>}

            {/* Virtual List */}
            <div className="file-list-container" style={{ flex: 1, minHeight: 0 }}>
                {files.length === 0 ? (
                    <div className="empty-state"><p>No files yet</p></div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={files}
                        totalCount={files.length}
                        itemContent={(index, file) => {
                            const isActive = file.id === activeFileId;
                            const statusIcon = getStatusIcon(file.status);
                            const hasError = file.status === FileStatus.ERROR;

                            return (
                                <div
                                    className={`file-row ${isActive ? 'active' : ''}`}
                                    onClick={() => onSelectFile(file.id)}
                                    style={{
                                        height: '60px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0 10px',
                                        borderBottom: '1px solid #333'
                                    }}
                                >
                                    <div className="file-thumbnail" style={{ position: 'relative' }}>
                                        {file.thumbnail ? (
                                            <img src={file.thumbnail} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                                        ) : (
                                            <div className="placeholder-thumb" style={{ width: '40px', height: '40px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                                {file.status === FileStatus.MISSING_IMAGE ? '🖼️⚠️' : '🖼️'}
                                            </div>
                                        )}
                                        {file.status === FileStatus.MISSING_LABEL && (
                                            <div style={{ position: 'absolute', bottom: -5, right: -5, background: '#444', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Missing Label">📋⚠️</div>
                                        )}
                                    </div>
                                    <div className="file-info" style={{ marginLeft: '12px', flex: 1, overflow: 'hidden' }}>
                                        <div className="file-name" style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                                        <div className="file-meta" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span
                                                onClick={(e) => {
                                                    if (hasError) {
                                                        e.stopPropagation();
                                                        onRetryFile(file.id);
                                                    }
                                                }}
                                                style={{ cursor: hasError ? 'pointer' : 'default' }}
                                                title={hasError ? `Error: ${file.error}. Click to retry.` : ''}
                                            >
                                                {statusIcon}
                                            </span>
                                            {file.label_data && <span style={{ fontSize: '10px' }}>📋</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        }}
                    />
                )}
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