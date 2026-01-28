/**
 * RightSidebar Component
 * 
 * Tabbed sidebar containing:
 * - Properties: Edit selected annotation
 * - Model Config: AI model parameters
 * - Labels: List of detected labels
 */

import React, { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Settings, Bot, Tag, BarChart3, Image, FileText } from 'lucide-react';
import PropertiesPanel from './PropertiesPanel';
import ModelParametersPanel from './ModelParametersPanel';
import FloatingPanel from './FloatingPanel';

const TABS = [
    { id: 'properties', labelKey: 'sidebar.properties', icon: Settings },
    { id: 'stats', labelKey: 'Statistics', icon: BarChart3 },
    { id: 'model', labelKey: 'sidebar.model', icon: Bot },
    { id: 'labels', labelKey: 'sidebar.labels', icon: Tag }
];

// Color palette for class distribution bars
const CLASS_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'
];

// Statistics Panel Component
const StatisticsPanel = ({ annotations = [], files = [] }) => {
    // Calculate label statistics
    const labelStats = React.useMemo(() => {
        const counts = {};
        annotations.forEach(ann => {
            const label = ann.label || 'unlabeled';
            counts[label] = (counts[label] || 0) + 1;
        });

        const total = annotations.length;
        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count], idx) => ({
                label,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0,
                color: CLASS_COLORS[idx % CLASS_COLORS.length]
            }));

        return sorted;
    }, [annotations]);

    const totalAnnotations = annotations.length;
    const uniqueClasses = labelStats.length;

    return (
        <div className="p-4 space-y-6">
            {/* Project Stats */}
            <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                    Project Overview
                </h4>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 border border-[var(--border-color)]">
                        <div className="flex items-center gap-2 mb-1">
                            <Image className="w-4 h-4 text-[var(--accent-indigo)]" />
                            <span className="text-xs text-[var(--text-muted)]">Images</span>
                        </div>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{files?.length || 0}</p>
                    </div>
                    <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 border border-[var(--border-color)]">
                        <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-[var(--accent-emerald)]" />
                            <span className="text-xs text-[var(--text-muted)]">Labels</span>
                        </div>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{totalAnnotations}</p>
                    </div>
                </div>
            </div>

            {/* Class Distribution */}
            <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                    Class Distribution
                </h4>
                {labelStats.length === 0 ? (
                    <div className="text-sm text-[var(--text-muted)] text-center py-4">
                        No annotations yet
                    </div>
                ) : (
                    <div className="space-y-3">
                        {labelStats.slice(0, 8).map(({ label, count, percentage, color }) => (
                            <div key={label} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-[var(--text-primary)] font-medium truncate max-w-[120px]">
                                        {label}
                                    </span>
                                    <span className="text-[var(--text-muted)]">
                                        {count} ({percentage.toFixed(0)}%)
                                    </span>
                                </div>
                                <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${percentage}%`,
                                            backgroundColor: color
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                        {labelStats.length > 8 && (
                            <p className="text-xs text-[var(--text-muted)] text-center">
                                +{labelStats.length - 8} more classes
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Unique Classes Count */}
            <div className="pt-3 border-t border-[var(--border-color)]">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-[var(--text-muted)]">Unique Classes</span>
                    <span className="text-[var(--text-primary)] font-semibold">{uniqueClasses}</span>
                </div>
            </div>
        </div>
    );
};

const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'tr', label: 'Türkçe' }
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
    onSelectLabel,
    onRenameLabel,

    // Statistics props
    files = []
}) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('properties');

    // Auto-switch to properties when annotation is selected
    React.useEffect(() => {
        if (selectedAnn) {
            setActiveTab('properties');
        }
    }, [selectedAnn]);

    return (
        <div className="flex flex-col h-full bg-theme-secondary text-theme-primary">
            {/* Tab navigation */}
            <div className="flex flex-none border-b border-theme">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium transition-colors",
                                activeTab === tab.id
                                    ? "text-theme-accent border-b-2 border-[var(--accent-color)] bg-[var(--accent-color)]/10"
                                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                            )}
                            onClick={() => setActiveTab(tab.id)}
                            title={t(tab.labelKey)}
                        >
                            <Icon className="w-4 h-4" />
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
                        <div className="flex flex-col items-center justify-center h-full text-theme-secondary p-4">
                            <Settings className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-center">{t('sidebar.selectAnnotation')}</p>
                        </div>
                    )
                )}

                {activeTab === 'stats' && (
                    <StatisticsPanel annotations={annotations} files={files} />
                )}

                {activeTab === 'model' && (
                    selectedModel ? (
                        <ModelParametersPanel
                            selectedModel={selectedModel}
                            currentParams={currentParams}
                            updateParam={updateParam}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-theme-secondary p-4">
                            <Bot className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-center">{t('sidebar.selectModel')}</p>
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
                        onRenameLabel={onRenameLabel}
                    />
                )}

            </div>
        </div>
    );
};

export default RightSidebar;
