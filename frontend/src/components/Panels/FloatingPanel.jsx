import React, { useState, useRef, useEffect, useMemo } from 'react';
import { stringToColor } from '../../utils/helpers';
import './Panels.css';

/**
 * FloatingPanel Component
 * Draggable/resizable panel showing label statistics with Rename capabilities.
 */
const FloatingPanel = ({
    annotations,
    filterText,
    setFilterText,
    onSelectLabel,
    onRenameLabel, // New prop for global rename
    onToggle,
    docked = false
}) => {
    const [panelPos, setPanelPos] = useState({ x: 20, y: 80 });
    const [panelSize, setPanelSize] = useState({ width: 280, height: 200 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Editing State
    const [editingLabel, setEditingLabel] = useState(null); // The label being renamed
    const [newLabelValue, setNewLabelValue] = useState('');

    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    const labelStats = useMemo(() => {
        const stats = {};
        annotations.forEach(ann => {
            const label = ann.label || 'unknown';
            stats[label] = (stats[label] || 0) + 1;
        });
        return Object.entries(stats).sort((a, b) => b[1] - a[1]);
    }, [annotations]);

    const startEditing = (e, label) => {
        e.stopPropagation();
        setEditingLabel(label);
        setNewLabelValue(label);
    };

    const submitRename = () => {
        if (editingLabel && newLabelValue && editingLabel !== newLabelValue) {
            onRenameLabel(editingLabel, newLabelValue);
        }
        setEditingLabel(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') submitRename();
        if (e.key === 'Escape') setEditingLabel(null);
    };

    useEffect(() => {
        if (docked) return;
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPanelPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
            }
            if (isResizing) {
                const newWidth = Math.max(200, resizeStart.current.width + (e.clientX - resizeStart.current.x));
                const newHeight = Math.max(100, resizeStart.current.height + (e.clientY - resizeStart.current.y));
                setPanelSize({ width: newWidth, height: newHeight });
            }
        };
        const handleMouseUp = () => { setIsDragging(false); setIsResizing(false); };
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, docked]);

    const handleDragStart = (e) => {
        if (docked) return;
        dragOffset.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
        setIsDragging(true);
    };

    const handleResizeStart = (e) => {
        if (docked) return;
        e.stopPropagation();
        resizeStart.current = { x: e.clientX, y: e.clientY, width: panelSize.width, height: panelSize.height };
        setIsResizing(true);
    };

    return (
        <div
            className={`floating-panel ${docked ? 'docked' : ''}`}
            style={docked ? {} : {
                left: panelPos.x,
                top: panelPos.y,
                width: panelSize.width,
                height: isCollapsed ? 'auto' : panelSize.height
            }}
        >
            <div className="panel-header" onMouseDown={handleDragStart}>
                <span className="panel-title">🏷️ Project Labels</span>
            </div>

            <div className="panel-filter">
                <input
                    type="text"
                    placeholder="Search labels..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="filter-input"
                />
            </div>

            <div className="panel-content">
                {labelStats.length === 0 ? (
                    <p className="empty-message">No labels detected</p>
                ) : (
                    labelStats.map(([label, count]) => (
                        <div
                            key={label}
                            className="label-item"
                            onClick={() => onSelectLabel && onSelectLabel(label)}
                        >
                            <div className="label-color" style={{ background: stringToColor(label) }} />

                            {editingLabel === label ? (
                                <input
                                    autoFocus
                                    className="rename-input"
                                    value={newLabelValue}
                                    onChange={(e) => setNewLabelValue(e.target.value)}
                                    onBlur={submitRename}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="label-name">{label}</span>
                            )}

                            <div className="label-actions">
                                <span className="label-count">{count}</span>
                                <button
                                    className="edit-label-btn"
                                    onClick={(e) => startEditing(e, label)}
                                    title="Rename globally"
                                >
                                    ✏️
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="panel-footer">
                Total: {annotations.length} instances
            </div>

            {!docked && <div className="resize-handle" onMouseDown={handleResizeStart} />}
        </div>
    );
};

export default FloatingPanel;
