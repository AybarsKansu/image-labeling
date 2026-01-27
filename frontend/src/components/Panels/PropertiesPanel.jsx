import React from 'react';
import clsx from 'clsx';
import {
    Target, TrendingDown, TrendingUp, RotateCcw, Sparkles, Trash2
} from 'lucide-react';

/**
 * PropertiesPanel Component
 * Fixed panel for selected shape properties and editing actions
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
    if (!selectedAnn) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm p-4">
                Select a shape to edit properties
            </div>
        );
    }

    const pointCount = selectedAnn.points ? selectedAnn.points.length / 2 : 0;

    // Local state for label input
    const [localLabel, setLocalLabel] = React.useState(selectedLabel || '');

    React.useEffect(() => {
        setLocalLabel(selectedLabel || '');
    }, [selectedLabel]);

    const btnBase = "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all";
    const btnDisabled = "opacity-50 cursor-not-allowed";

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 text-white font-semibold">
                <Target className="w-4 h-4 text-indigo-400" />
                Properties
            </div>

            {/* Label Input */}
            <div className="space-y-1.5">
                <label className="text-xs text-gray-400 uppercase tracking-wider">Label</label>
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
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter label..."
                />
            </div>

            {/* Suggestions */}
            {suggestions && suggestions.length > 0 && (
                <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 uppercase tracking-wider">Suggestions</label>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.slice(0, 5).map((s, i) => (
                            <button
                                key={i}
                                className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-md hover:bg-indigo-600/40 hover:text-white transition-colors"
                                onClick={() => onLabelChange(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Shape Info */}
            <div className="space-y-1.5">
                <label className="text-xs text-gray-400 uppercase tracking-wider">Shape Info</label>
                <div className="flex gap-4 text-sm text-gray-300">
                    <span className="px-2 py-1 bg-gray-800 rounded-md">Type: {selectedAnn.type}</span>
                    <span className="px-2 py-1 bg-gray-800 rounded-md">Points: {pointCount}</span>
                </div>
            </div>

            {/* Polygon Modifiers */}
            <div className="space-y-1.5">
                <label className="text-xs text-gray-400 uppercase tracking-wider">Modify Shape</label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        className={clsx(btnBase, "bg-gray-700 text-gray-200 hover:bg-gray-600", (!canModify || isProcessing) && btnDisabled)}
                        onClick={() => onSimplify()}
                        disabled={!canModify || isProcessing}
                        title="Reduce points (RDP algorithm)"
                    >
                        <TrendingDown className="w-4 h-4" />
                        Simplify
                    </button>
                    <button
                        className={clsx(btnBase, "bg-gray-700 text-gray-200 hover:bg-gray-600", (!canModify || isProcessing) && btnDisabled)}
                        onClick={() => onDensify()}
                        disabled={!canModify || isProcessing}
                        title="Add midpoints"
                    >
                        <TrendingUp className="w-4 h-4" />
                        Densify
                    </button>
                    <button
                        className={clsx(btnBase, "bg-gray-700 text-gray-200 hover:bg-gray-600", (!canReset || isProcessing) && btnDisabled)}
                        onClick={onReset}
                        disabled={!canReset || isProcessing}
                        title="Restore original points"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                    </button>
                    <button
                        className={clsx(btnBase, "bg-violet-600/30 text-violet-300 hover:bg-violet-600/50", (!canModify || isProcessing) && btnDisabled)}
                        onClick={onBeautify}
                        disabled={!canModify || isProcessing}
                        title="AI refinement"
                    >
                        {isProcessing ? (
                            <div className="spinner w-4 h-4" />
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        Beautify
                    </button>
                </div>
            </div>

            {/* Delete Button */}
            <button
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/40 hover:text-red-300 transition-colors"
                onClick={onDelete}
            >
                <Trash2 className="w-4 h-4" />
                Delete Shape
            </button>
        </div>
    );
};

export default PropertiesPanel;
