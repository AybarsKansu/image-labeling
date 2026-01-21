import React from 'react';
import './Panels.css';

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
    suggestions
}) => {
    if (!selectedAnn) {
        return (
            <div className="properties-panel collapsed">
                <div className="properties-hint">
                    Select a shape to edit properties
                </div>
            </div>
        );
    }

    const pointCount = selectedAnn.points ? selectedAnn.points.length / 2 : 0;

    return (
        <div className="properties-panel">
            <div className="properties-header">
                <span className="properties-title">🎯 Properties</span>
            </div>

            <div className="properties-content">
                {/* Label Input */}
                <div className="property-group">
                    <label className="property-label">Label</label>
                    <input
                        type="text"
                        value={selectedLabel}
                        onChange={(e) => onLabelChange(e.target.value)}
                        className="property-input"
                        placeholder="Enter label..."
                    />
                </div>

                {/* Suggestions */}
                {suggestions && suggestions.length > 0 && (
                    <div className="property-group">
                        <label className="property-label">Suggestions</label>
                        <div className="suggestions-list">
                            {suggestions.slice(0, 5).map((s, i) => (
                                <button
                                    key={i}
                                    className="suggestion-btn"
                                    onClick={() => onLabelChange(s)}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Shape Info */}
                <div className="property-group">
                    <label className="property-label">Shape Info</label>
                    <div className="property-info">
                        <span>Type: {selectedAnn.type}</span>
                        <span>Points: {pointCount}</span>
                    </div>
                </div>

                {/* Polygon Modifiers */}
                <div className="property-group">
                    <label className="property-label">Modify Shape</label>
                    <div className="modifier-buttons">
                        <button
                            className="modifier-btn"
                            onClick={() => onSimplify()}
                            disabled={!canModify || isProcessing}
                            title="Reduce points (RDP algorithm)"
                        >
                            📉 Simplify
                        </button>
                        <button
                            className="modifier-btn"
                            onClick={() => onDensify()}
                            disabled={!canModify || isProcessing}
                            title="Add midpoints"
                        >
                            📈 Densify
                        </button>
                        <button
                            className="modifier-btn"
                            onClick={onReset}
                            disabled={!canReset || isProcessing}
                            title="Restore original points"
                        >
                            ↩️ Reset
                        </button>
                        <button
                            className="modifier-btn ai"
                            onClick={onBeautify}
                            disabled={!canModify || isProcessing}
                            title="AI refinement"
                        >
                            {isProcessing ? '⏳' : '✨'} Beautify
                        </button>
                    </div>
                </div>

                {/* Delete Button */}
                <div className="property-group">
                    <button
                        className="delete-btn"
                        onClick={onDelete}
                    >
                        🗑️ Delete Shape
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PropertiesPanel;
