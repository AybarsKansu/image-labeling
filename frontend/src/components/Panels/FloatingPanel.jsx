import React, { useState, useRef, useEffect, useMemo } from 'react';
import { stringToColor } from '../../utils/helpers';
import './Panels.css';

/**
 * FloatingPanel Component
 * Draggable/resizable panel showing label statistics
 */
const FloatingPanel = ({
    annotations,
    filterText,
    setFilterText,
    onSelectLabel,
    onToggle, // Callback for parent when docked
    docked = false // Default to false for backward compatibility
}) => {
    // Panel position and size
    const [panelPos, setPanelPos] = useState({ x: 20, y: 80 });
    const [panelSize, setPanelSize] = useState({ width: 280, height: 200 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    // Calculate label statistics
    const labelStats = useMemo(() => {
        const stats = {};
        annotations.forEach(ann => {
            const label = ann.label || 'unknown';
            stats[label] = (stats[label] || 0) + 1;
        });
        return Object.entries(stats).sort((a, b) => b[1] - a[1]);
    }, [annotations]);

    // Handle drag and resize
    useEffect(() => {
        if (docked) return; // Disable all drag/resize logic when docked

        const handleMouseMove = (e) => {
            if (isDragging) {
                setPanelPos({
                    x: e.clientX - dragOffset.current.x,
                    y: e.clientY - dragOffset.current.y
                });
            }
            if (isResizing) {
                const newWidth = Math.max(200, resizeStart.current.width + (e.clientX - resizeStart.current.x));
                const newHeight = Math.max(100, resizeStart.current.height + (e.clientY - resizeStart.current.y));
                setPanelSize({ width: newWidth, height: newHeight });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

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
        dragOffset.current = {
            x: e.clientX - panelPos.x,
            y: e.clientY - panelPos.y
        };
        setIsDragging(true);
    };

    const handleResizeStart = (e) => {
        if (docked) return;
        e.stopPropagation();
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            width: panelSize.width,
            height: panelSize.height
        };
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
            {/* Header */}
            <div
                className="panel-header"
                onMouseDown={handleDragStart}
            >
                <span className="panel-title">📊 Detected Labels</span>
            </div>

            {/* Filter Input */}
            <div className="panel-filter">
                <input
                    type="text"
                    placeholder="Filter labels..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="filter-input"
                />
            </div>

            {/* Label List */}
            <div className="panel-content">
                {labelStats.length === 0 ? (
                    <p className="empty-message">No annotations yet</p>
                ) : (
                    labelStats.map(([label, count]) => (
                        <div
                            key={label}
                            className="label-item"
                            onClick={() => onSelectLabel && onSelectLabel(label)}
                        >
                            <div
                                className="label-color"
                                style={{ background: stringToColor(label) }}
                            />
                            <span className="label-name">{label}</span>
                            <span className="label-count">{count}</span>
                        </div>
                    ))
                )}
            </div>

            {/* Total Count */}
            <div className="panel-footer">
                Total: {annotations.length} shapes
            </div>

            {/* Resize Handle */}
            {!docked && (
                <div
                    className="resize-handle"
                    onMouseDown={handleResizeStart}
                />
            )}
        </div>
    );
};

export default FloatingPanel;
