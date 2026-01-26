/**
 * RightSidebar Component
 * 
 * Tabbed sidebar containing:
 * - Properties: Edit selected annotation
 * - Model Config: AI model parameters
 * - Labels: List of detected labels (moved from left panel)
 */

import React, { useState } from 'react';
import PropertiesPanel from './PropertiesPanel';
import ModelParametersPanel from './ModelParametersPanel';
import FloatingPanel from './FloatingPanel';
import './RightSidebar.css';

const TABS = [
    { id: 'properties', label: 'Properties', icon: '⚙️' },
    { id: 'model', label: 'Model', icon: '🤖' },
    { id: 'labels', label: 'Labels', icon: '🏷️' }
];

const RightSidebar = ({
    // Properties tab props
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

    // Model tab props
    selectedModel,
    currentParams,
    updateParam,

    // Labels tab props
    annotations,
    filterText,
    setFilterText,
    onSelectLabel
}) => {
    const [activeTab, setActiveTab] = useState('properties');

    // Auto-switch to properties when annotation is selected
    React.useEffect(() => {
        if (selectedAnn) {
            setActiveTab('properties');
        }
    }, [selectedAnn]);

    return (
        <div className="right-sidebar">
            {/* Tab navigation */}
            <div className="sidebar-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        title={tab.label}
                    >
                        <span className="tab-icon">{tab.icon}</span>
                        <span className="tab-label">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="sidebar-content">
                {activeTab === 'properties' && (
                    selectedAnn ? (
                        <PropertiesPanel
                            docked={true}
                            selectedAnn={selectedAnn}
                            selectedLabel={selectedLabel}
                            onLabelChange={onLabelChange}
                            onDelete={onDelete}
                            onSimplify={onSimplify}
                            onDensify={onDensify}
                            onReset={onReset}
                            onBeautify={onBeautify}
                            canModify={canModify}
                            canReset={canReset}
                            isProcessing={isProcessing}
                            suggestions={suggestions}
                        />
                    ) : (
                        <div className="empty-tab">
                            <p>Select an annotation to edit properties</p>
                        </div>
                    )
                )}

                {activeTab === 'model' && (
                    selectedModel ? (
                        <ModelParametersPanel
                            selectedModel={selectedModel}
                            currentParams={currentParams}
                            updateParam={updateParam}
                        />
                    ) : (
                        <div className="empty-tab">
                            <p>Select a model to configure parameters</p>
                        </div>
                    )
                )}

                {activeTab === 'labels' && (
                    <FloatingPanel
                        docked={true}
                        annotations={annotations}
                        filterText={filterText}
                        setFilterText={setFilterText}
                        onSelectLabel={onSelectLabel}
                    />
                )}
            </div>
        </div>
    );
};

export default RightSidebar;
