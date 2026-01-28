import React, { useState, useRef, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Tag, Pencil, Search } from 'lucide-react';
import { stringToColor } from '../../utils/helpers';

/**
 * FloatingPanel Component
 * Panel showing label statistics with Rename capabilities.
 * Figma-inspired minimalist design with Slate-950 palette.
 */
const FloatingPanel = ({
    annotations,
    filterText,
    setFilterText,
    onSelectLabel,
    onRenameLabel,
    onToggle,
    docked = false
}) => {
    const [panelPos, setPanelPos] = useState({ x: 20, y: 80 });
    const [panelSize, setPanelSize] = useState({ width: 280, height: 200 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Editing State
    const [editingLabel, setEditingLabel] = useState(null);
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
            className={clsx(
                "flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)]",
                docked ? "h-full" : "fixed rounded-lg border border-[var(--border-subtle)] shadow-xl"
            )}
            style={docked ? {} : {
                left: panelPos.x,
                top: panelPos.y,
                width: panelSize.width,
                height: isCollapsed ? 'auto' : panelSize.height
            }}
        >
            {/* Header */}
            <div
                className={clsx(
                    "flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]",
                    !docked && "cursor-move"
                )}
                onMouseDown={handleDragStart}
            >
                <Tag className="w-3.5 h-3.5 text-[var(--accent-indigo)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">Project Labels</span>
            </div>

            {/* Sleek Search Bar */}
            <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search labels..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="input-dark input-with-icon w-full h-8 text-xs"
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-0.5">
                {labelStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] py-6">
                        <Tag className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
                        <p className="text-xs">No labels detected</p>
                    </div>
                ) : (
                    labelStats.map(([label, count]) => (
                        <div
                            key={label}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors group"
                            onClick={() => onSelectLabel && onSelectLabel(label)}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: stringToColor(label) }}
                            />

                            {editingLabel === label ? (
                                <input
                                    autoFocus
                                    className="flex-1 px-2 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--accent-indigo)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                                    value={newLabelValue}
                                    onChange={(e) => setNewLabelValue(e.target.value)}
                                    onBlur={submitRename}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="flex-1 text-xs text-[var(--text-secondary)] truncate">{label}</span>
                            )}

                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">{count}</span>
                                <button
                                    className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--accent-indigo)] transition-all"
                                    onClick={(e) => startEditing(e, label)}
                                    title="Rename globally"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] text-center">
                {annotations.length} instances • {labelStats.length} classes
            </div>

            {!docked && (
                <div
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
                    onMouseDown={handleResizeStart}
                />
            )}
        </div>
    );
};

export default FloatingPanel;

