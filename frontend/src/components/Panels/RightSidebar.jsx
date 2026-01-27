/**
 * RightSidebar Component
 * 
 * Tabbed sidebar containing:
 * - Properties: Edit selected annotation
 * - Model Config: AI model parameters
 * - Labels: List of detected labels
 * - Settings: Language and Theme selection
 */

import React, { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Settings, Bot, Tag, Cog, Globe, Palette } from 'lucide-react';
import PropertiesPanel from './PropertiesPanel';
import ModelParametersPanel from './ModelParametersPanel';
import FloatingPanel from './FloatingPanel';
import { useTheme } from '../../contexts/ThemeContext';

const TABS = [
    { id: 'properties', labelKey: 'sidebar.properties', icon: Settings },
    { id: 'model', labelKey: 'sidebar.model', icon: Bot },
    { id: 'labels', labelKey: 'sidebar.labels', icon: Tag },
    { id: 'settings', labelKey: 'sidebar.settings', icon: Cog }
];

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
    onRenameLabel
}) => {
    const { t, i18n } = useTranslation();
    const { theme, setTheme, themes } = useTheme();
    const [activeTab, setActiveTab] = useState('properties');

    // Auto-switch to properties when annotation is selected
    React.useEffect(() => {
        if (selectedAnn) {
            setActiveTab('properties');
        }
    }, [selectedAnn]);

    const handleLanguageChange = (langCode) => {
        i18n.changeLanguage(langCode);
    };

    return (
        <div className="flex flex-col h-full bg-secondary text-txt-main">
            {/* Tab navigation */}
            <div className="flex flex-none border-b border-border">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium transition-colors",
                                activeTab === tab.id
                                    ? "text-accent border-b-2 border-accent bg-accent/10"
                                    : "text-txt-dim hover:text-txt-main hover:bg-tertiary/50"
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
                        <div className="flex flex-col items-center justify-center h-full text-txt-dim p-4">
                            <Settings className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-center">{t('sidebar.selectAnnotation')}</p>
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
                        <div className="flex flex-col items-center justify-center h-full text-txt-dim p-4">
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

                {activeTab === 'settings' && (
                    <div className="p-4 space-y-6">
                        <h3 className="text-lg font-semibold text-txt-main flex items-center gap-2">
                            <Cog className="w-5 h-5 text-accent" />
                            {t('settings.title')}
                        </h3>

                        {/* Language Selection */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-txt-dim">
                                <Globe className="w-4 h-4" />
                                {t('settings.language')}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {LANGUAGES.map(lang => (
                                    <button
                                        key={lang.code}
                                        className={clsx(
                                            "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                            i18n.language === lang.code
                                                ? "bg-accent text-white"
                                                : "bg-tertiary text-txt-dim hover:bg-tertiary/70"
                                        )}
                                        onClick={() => handleLanguageChange(lang.code)}
                                    >
                                        {lang.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Theme Selection */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-txt-dim">
                                <Palette className="w-4 h-4" />
                                {t('settings.theme')}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {themes.map(themeOption => (
                                    <button
                                        key={themeOption}
                                        className={clsx(
                                            "px-2 py-2 rounded-lg text-xs font-medium transition-colors capitalize",
                                            theme === themeOption
                                                ? "bg-accent text-white"
                                                : "bg-tertiary text-txt-dim hover:bg-tertiary/70"
                                        )}
                                        onClick={() => setTheme(themeOption)}
                                    >
                                        {t(`settings.${themeOption}Theme`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RightSidebar;
