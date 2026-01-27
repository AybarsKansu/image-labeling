import React, { useState, useRef, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Tag, Pencil, Search } from 'lucide-react';
import { stringToColor } from '../../utils/helpers';

/**
 * FloatingPanel Component
 * Panel showing label statistics with Rename capabilities.
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
                "flex flex-col bg-[#161922] text-gray-200",
                docked ? "h-full" : "fixed rounded-lg border border-gray-700 shadow-xl"
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
                    "flex items-center gap-2 px-3 py-2.5 border-b border-gray-700",
                    !docked && "cursor-move"
                )}
                onMouseDown={handleDragStart}
            >
                <Tag className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Project Labels</span>
            </div>

            {/* Filter */}
            <div className="px-3 py-2 border-b border-gray-700">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search labels..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto scrollbar-dark p-2 space-y-1">
                {labelStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 py-4">
                        <Tag className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No labels detected</p>
                    </div>
                ) : (
                    labelStats.map(([label, count]) => (
                        <div
                            key={label}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors group"
                            onClick={() => onSelectLabel && onSelectLabel(label)}
                        >
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ background: stringToColor(label) }}
                            />

                            {editingLabel === label ? (
                                <input
                                    autoFocus
                                    className="flex-1 px-2 py-0.5 bg-gray-700 border border-indigo-500 rounded text-sm text-white focus:outline-none"
                                    value={newLabelValue}
                                    onChange={(e) => setNewLabelValue(e.target.value)}
                                    onBlur={submitRename}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="flex-1 text-sm text-gray-300 truncate">{label}</span>
                            )}

                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{count}</span>
                                <button
                                    className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-400 transition-all"
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
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700 text-center">
                Total: {annotations.length} instances
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
