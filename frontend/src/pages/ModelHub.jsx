/**
 * ModelHub Page
 * 
 * Gallery + Modal architecture:
 * - Header with "Train New Model" button
 * - Tabbed content: Library (card grid) / Monitor (training display)
 * - Training form in modal
 */

import React, { useState } from 'react';
import clsx from 'clsx';
import { useAIModels } from '../hooks/useAIModels';
import {
    Zap, Box, Shapes, Bone, Download, Trash2, Check,
    BarChart3, Clock, Activity, AlertCircle
} from 'lucide-react';
import TrainModelModal from '../components/Modals/TrainModelModal';

const TABS = [
    { id: 'library', label: 'Library', icon: Box },
    { id: 'monitor', label: 'Monitor', icon: Activity }
];

// Model type icons
const TYPE_ICONS = {
    detection: Box,
    segmentation: Shapes,
    pose: Bone
};

const ModelHub = () => {
    const {
        models,
        loadingModelIds,
        actions,
        isTraining,
        trainingProgress,
        trainingMessage
    } = useAIModels(null, '');

    const [activeTab, setActiveTab] = useState('library');
    const [isTrainModalOpen, setIsTrainModalOpen] = useState(false);

    const isModelLoading = (id) => loadingModelIds.includes(id);

    const handleStartTraining = async (config) => {
        const result = await actions.startTraining(config);
        if (result?.success) {
            setIsTrainModalOpen(false);
            setActiveTab('monitor');
        }
        return result;
    };

    // Get model icon based on type
    const getTypeIcon = (type) => {
        const Icon = TYPE_ICONS[type] || Box;
        return Icon;
    };

    // Get type badge color
    const getTypeBadgeClass = (type) => {
        switch (type) {
            case 'detection':
                return 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30';
            case 'segmentation':
                return 'bg-blue-900/30 text-blue-400 border-blue-500/30';
            case 'pose':
                return 'bg-purple-900/30 text-purple-400 border-purple-500/30';
            default:
                return 'bg-gray-800 text-gray-400 border-gray-700';
        }
    };

    return (
        <div className="bg-theme-primary h-full w-full overflow-y-auto font-sans text-white">
            {/* Header */}
            <header className="flex items-center justify-between px-8 py-6 border-b border-theme">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">🧬</span>
                        AI Model Library
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Manage AI models and train custom models on your dataset.
                    </p>
                </div>
                <button
                    onClick={() => setIsTrainModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl font-semibold shadow-lg shadow-purple-900/50 transition-all transform active:scale-95"
                >
                    <Zap size={18} />
                    Train New Model
                </button>
            </header>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-8 pt-4 border-b border-theme">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                                activeTab === tab.id
                                    ? "text-white border-purple-500 bg-purple-500/10"
                                    : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Icon size={16} />
                            {tab.label}
                            {tab.id === 'monitor' && isTraining && (
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="p-8">
                {activeTab === 'library' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {models.map(model => {
                            const TypeIcon = getTypeIcon(model.type);
                            const isLoading = isModelLoading(model.id);

                            return (
                                <div
                                    key={model.id}
                                    className="bg-theme-secondary border border-theme rounded-xl p-5 hover:border-purple-500/50 transition-all group"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={clsx(
                                            "p-3 rounded-xl border",
                                            getTypeBadgeClass(model.type)
                                        )}>
                                            <TypeIcon size={24} />
                                        </div>
                                        {model.is_downloaded && (
                                            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/30">
                                                <Check size={12} />
                                                Ready
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <h3 className="text-white font-semibold mb-1">
                                        {model.name}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-mono mb-2">
                                        {model.id}
                                    </p>
                                    <p className="text-sm text-gray-400 line-clamp-2 min-h-[40px]">
                                        {model.description || 'No description available'}
                                    </p>

                                    {/* Type Badge */}
                                    <div className="mt-3 mb-4">
                                        <span className={clsx(
                                            "text-xs px-2 py-1 rounded border",
                                            getTypeBadgeClass(model.type)
                                        )}>
                                            {model.type}
                                        </span>
                                    </div>

                                    {/* Action */}
                                    <button
                                        onClick={() => model.is_downloaded
                                            ? actions.deleteModel(model.id)
                                            : actions.downloadModel(model.id)
                                        }
                                        disabled={isLoading}
                                        className={clsx(
                                            "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50",
                                            model.is_downloaded
                                                ? "text-red-400 border border-red-500/30 hover:bg-red-500/10"
                                                : "text-blue-400 border border-blue-500/30 hover:bg-blue-500/10"
                                        )}
                                    >
                                        {isLoading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                {model.is_downloaded ? 'Deleting...' : 'Downloading...'}
                                            </>
                                        ) : model.is_downloaded ? (
                                            <>
                                                <Trash2 size={16} />
                                                Delete
                                            </>
                                        ) : (
                                            <>
                                                <Download size={16} />
                                                Download
                                            </>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'monitor' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-theme-secondary border border-theme rounded-2xl overflow-hidden">
                            {/* Monitor Header */}
                            <div className="px-6 py-4 border-b border-theme bg-gradient-to-r from-blue-900/20 to-purple-900/20">
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-blue-400" />
                                    Training Monitor
                                    {isTraining && (
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full ml-2">
                                            Active
                                        </span>
                                    )}
                                </h2>
                            </div>

                            {/* Monitor Content */}
                            <div className="p-8">
                                {isTraining ? (
                                    <div className="space-y-8">
                                        {/* Progress */}
                                        <div>
                                            <div className="flex justify-between mb-2 text-sm">
                                                <span className="text-gray-400">Progress</span>
                                                <span className="text-blue-400 font-semibold">
                                                    {Math.round(trainingProgress * 100)}%
                                                </span>
                                            </div>
                                            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 striped-progress"
                                                    style={{ width: `${trainingProgress * 100}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                                                    <BarChart3 size={14} />
                                                    Epoch
                                                </div>
                                                <p className="text-2xl font-bold text-white">
                                                    {Math.round(trainingProgress * 100)}
                                                </p>
                                            </div>
                                            <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                                                    <Activity size={14} />
                                                    Loss
                                                </div>
                                                <p className="text-2xl font-bold text-emerald-400">
                                                    0.042
                                                </p>
                                            </div>
                                            <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                                                    <Clock size={14} />
                                                    ETA
                                                </div>
                                                <p className="text-2xl font-bold text-white">
                                                    ~12m
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status Message */}
                                        <div className="text-center text-gray-400 animate-pulse">
                                            {trainingMessage || 'Training in progress...'}
                                        </div>

                                        {/* Cancel Button */}
                                        <button
                                            onClick={actions.cancelTraining}
                                            className="w-full py-3 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-600/30 transition-colors"
                                        >
                                            🛑 Stop Training
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <div className="text-6xl mb-4 opacity-30">📊</div>
                                        <p className="text-gray-500 mb-2">No active training session</p>
                                        <p className="text-xs text-gray-600">
                                            Start a training session to see live metrics here.
                                        </p>
                                        {trainingMessage && (
                                            <div className="mt-6 p-3 bg-gray-800/50 rounded-lg inline-block">
                                                <p className="text-xs text-gray-400">
                                                    Last Status: {trainingMessage}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Train Modal */}
            <TrainModelModal
                isOpen={isTrainModalOpen}
                onClose={() => setIsTrainModalOpen(false)}
                models={models}
                isTraining={isTraining}
                onStartTraining={handleStartTraining}
                onCancelTraining={actions.cancelTraining}
            />

            <style>{`
                .striped-progress {
                    background-image: linear-gradient(
                        45deg,
                        rgba(255, 255, 255, 0.15) 25%,
                        transparent 25%,
                        transparent 50%,
                        rgba(255, 255, 255, 0.15) 50%,
                        rgba(255, 255, 255, 0.15) 75%,
                        transparent 75%,
                        transparent
                    );
                    background-size: 1rem 1rem;
                    animation: stripe-animation 1s linear infinite;
                }
                @keyframes stripe-animation {
                    0% { background-position: 0 0; }
                    100% { background-position: 1rem 0; }
                }
            `}</style>
        </div>
    );
};

export default ModelHub;
