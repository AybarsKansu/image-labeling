/**
 * TrainModelModal Component
 * 
 * Modal dialog for configuring and starting model training.
 * Contains form fields for base model, epochs, batch size.
 */

import React, { useState } from 'react';
import clsx from 'clsx';
import { X, Zap, Cpu, Settings, AlertCircle } from 'lucide-react';

const TrainModelModal = ({
    isOpen,
    onClose,
    models = [],
    isTraining,
    onStartTraining,
    onCancelTraining
}) => {
    const [selectedBaseModel, setSelectedBaseModel] = useState('yolov8n-seg.pt');
    const [epochs, setEpochs] = useState(100);
    const [batchSize, setBatchSize] = useState(16);
    const [error, setError] = useState(null);

    // Filter trainable models (exclude SAM and special models)
    const trainableModels = models.filter(m =>
        !((m.family === 'SAM' || (m.id && m.id.toLowerCase().includes('sam'))) || m.id === 'yolo26n.pt')
    );

    const handleSubmit = async () => {
        setError(null);
        const result = await onStartTraining({
            base_model: selectedBaseModel,
            epochs,
            batch_size: batchSize
        });
        if (!result?.success) {
            setError(result?.error || 'Training failed to start');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-theme-secondary border border-theme rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-theme bg-gradient-to-r from-purple-900/30 to-indigo-900/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                            <Zap className="w-5 h-5 text-purple-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Train New Model</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Base Model Selection */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                            <Cpu size={14} className="text-purple-400" />
                            Base Model Architecture
                        </label>
                        <select
                            value={selectedBaseModel}
                            onChange={e => setSelectedBaseModel(e.target.value)}
                            disabled={isTraining}
                            className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        >
                            {trainableModels.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.name || m.id} ({m.type})
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1.5">
                            Select a pre-trained model to fine-tune on your dataset.
                        </p>
                    </div>

                    {/* Training Parameters */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                <Settings size={14} className="text-blue-400" />
                                Epochs
                            </label>
                            <input
                                type="number"
                                value={epochs}
                                onChange={e => setEpochs(parseInt(e.target.value) || 100)}
                                disabled={isTraining}
                                min={1}
                                max={1000}
                                className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            />
                            <p className="text-xs text-gray-500 mt-1">Training iterations</p>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                <Settings size={14} className="text-emerald-400" />
                                Batch Size
                            </label>
                            <input
                                type="number"
                                value={batchSize}
                                onChange={e => setBatchSize(parseInt(e.target.value) || 16)}
                                disabled={isTraining}
                                min={1}
                                max={128}
                                className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            />
                            <p className="text-xs text-gray-500 mt-1">Rec: 16 (based on VRAM)</p>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-theme bg-black/20">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={isTraining ? onCancelTraining : handleSubmit}
                        disabled={!selectedBaseModel}
                        className={clsx(
                            "px-6 py-2.5 rounded-lg font-semibold transition-all transform active:scale-95",
                            isTraining
                                ? "bg-red-600 hover:bg-red-500 text-white"
                                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/50"
                        )}
                    >
                        {isTraining ? '🛑 Stop Training' : '🚀 Start Training'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrainModelModal;
