import React from 'react';
import clsx from 'clsx';
import {
    Target, TrendingDown, TrendingUp, RotateCcw, Sparkles, Trash2, Box
} from 'lucide-react';

/**
 * PropertiesPanel Component
 * Large fonts, 44px inputs, Smart Context layout
 */
const PropertiesPanel = ({
    selectedAnn,
    selectedLabel,
    onLabelChange,
    onDelete,
    onSimplify,
    onDensify,
    onReset,
    onBeautify,
    canModify,
    canReset,
    isProcessing,
    suggestions,
    docked = false
}) => {
    // Local state for label input
    const [localLabel, setLocalLabel] = React.useState(selectedLabel || '');

    React.useEffect(() => {
        setLocalLabel(selectedLabel || '');
    }, [selectedLabel]);

    // Calculate bounding box from points
    const getBounds = () => {
        if (!selectedAnn?.points || selectedAnn.points.length < 4) {
            return { x: 0, y: 0, w: 0, h: 0 };
        }
        const pts = selectedAnn.points;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
            minX = Math.min(minX, pts[i]);
            maxX = Math.max(maxX, pts[i]);
            minY = Math.min(minY, pts[i + 1]);
            maxY = Math.max(maxY, pts[i + 1]);
        }
        return {
            x: Math.round(minX),
            y: Math.round(minY),
            w: Math.round(maxX - minX),
            h: Math.round(maxY - minY)
        };
    };

    const bounds = getBounds();
    const pointCount = selectedAnn?.points ? selectedAnn.points.length / 2 : 0;

    if (!selectedAnn) {
        return (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <Box className="w-12 h-12 text-[var(--text-muted)] opacity-40 mb-4" strokeWidth={1} />
                <p className="text-base text-[var(--text-muted)] text-center">
                    Select a shape to edit properties
                </p>
            </div>
        );
    }

    return (
        <div className="p-5 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-indigo)]/20 flex items-center justify-center">
                    <Target className="w-5 h-5 text-[var(--accent-indigo)]" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Properties</h2>
                    <p className="text-sm text-[var(--text-muted)]">{selectedAnn.type} • {pointCount} points</p>
                </div>
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Class Label</label>
                <input
                    type="text"
                    value={localLabel}
                    onChange={(e) => setLocalLabel(e.target.value)}
                    onBlur={() => onLabelChange(localLabel)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            onLabelChange(localLabel);
                            e.target.blur();
                        }
                    }}
                    className="input-dark w-full h-11 text-sm"
                    placeholder="Enter class name..."
                />
            </div>

            {/* Quick Suggestions */}
            {suggestions && suggestions.length > 0 && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Suggestions</label>
                    <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 5).map((s, i) => (
                            <button
                                key={i}
                                className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--accent-indigo)]/20 hover:text-[var(--accent-indigo)] transition-colors"
                                onClick={() => onLabelChange(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Bounding Box Coordinates */}
            <div className="space-y-3">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Bounding Box</label>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">X</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{bounds.x}</div>
                    </div>
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Y</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{bounds.y}</div>
                    </div>
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">W</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{bounds.w}</div>
                    </div>
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">H</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{bounds.h}</div>
                    </div>
                </div>
            </div>

            {/* Shape Modifiers */}
            <div className="space-y-3">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Modify Shape</label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        className={clsx("btn-tactile w-full h-10 gap-2", (!canModify || isProcessing) && "opacity-40")}
                        onClick={() => onSimplify()}
                        disabled={!canModify || isProcessing}
                    >
                        <TrendingDown className="w-4 h-4" />
                        Simplify
                    </button>
                    <button
                        className={clsx("btn-tactile w-full h-10 gap-2", (!canModify || isProcessing) && "opacity-40")}
                        onClick={() => onDensify()}
                        disabled={!canModify || isProcessing}
                    >
                        <TrendingUp className="w-4 h-4" />
                        Densify
                    </button>
                    <button
                        className={clsx("btn-tactile w-full h-10 gap-2", (!canReset || isProcessing) && "opacity-40")}
                        onClick={onReset}
                        disabled={!canReset || isProcessing}
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                    </button>
                    <button
                        className={clsx("btn-accent w-full h-10 gap-2", (!canModify || isProcessing) && "opacity-40")}
                        onClick={onBeautify}
                        disabled={!canModify || isProcessing}
                    >
                        {isProcessing ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        Beautify
                    </button>
                </div>
            </div>

            {/* Delete Button */}
            <button
                className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all font-medium"
                onClick={onDelete}
            >
                <Trash2 className="w-4 h-4" />
                Delete Shape
            </button>
        </div>
    );
};

export default PropertiesPanel;
