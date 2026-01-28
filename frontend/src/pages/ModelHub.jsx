
import React, { useState } from 'react';
import { useAIModels } from '../hooks/useAIModels';

const ModelHub = () => {
    // We instantiate the hook here to get access to model actions/state
    const {
        models,
        loadingModelIds,
        actions,
        isTraining,
        trainingProgress,
        trainingMessage
    } = useAIModels(null, '');

    // Local state for form
    const [selectedBaseModel, setSelectedBaseModel] = useState('yolov8n-seg.pt');
    const [epochs, setEpochs] = useState(100);
    const [batchSize, setBatchSize] = useState(16);
    const [error, setError] = useState(null);

    const handleStartTraining = async () => {
        const result = await actions.startTraining({
            base_model: selectedBaseModel,
            epochs,
            batch_size: batchSize
        });
        if (!result.success) setError(result.error);
        else setError(null);
    };

    const isModelLoading = (id) => loadingModelIds.includes(id);

    return (
        <div className="bg-theme-primary h-full w-full overflow-y-auto p-8 text-white font-sans">
            <header className="mb-8 border-b border-theme pb-4">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <span className="text-4xl">🧬</span> Model Hub
                </h1>
                <p className="text-gray-400 mt-2">Manage AI models and train custom models on your dataset.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">

                {/* Panel 1: Training Configuration */}
                <div className="bg-theme-secondary border border-theme rounded-xl p-6 shadow-xl">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-yellow-400">
                        ⚡ Train New Model
                    </h2>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Base Model Architecture</label>
                            <select
                                value={selectedBaseModel}
                                onChange={e => setSelectedBaseModel(e.target.value)}
                                disabled={isTraining}
                                className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                            >
                                {models.filter(m => !((m.family === 'SAM' || (m.id && m.id.toLowerCase().includes('sam'))) || m.id === 'yolo26n.pt')).map(m => (
                                    <option key={m.id} value={m.id}>{m.name || m.id} ({m.type})</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Select a pre-trained model to fine-tune.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Epochs</label>
                                <input
                                    type="number"
                                    value={epochs}
                                    onChange={e => setEpochs(parseInt(e.target.value) || 100)}
                                    disabled={isTraining}
                                    className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Batch Size</label>
                                <input
                                    type="number"
                                    value={batchSize}
                                    onChange={e => setBatchSize(parseInt(e.target.value) || 16)}
                                    disabled={isTraining}
                                    className="w-full bg-black/30 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">Rec: 16 (Max 64 based on VRAM).</p>
                            </div>
                        </div>

                        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded text-sm border border-red-500/50">{error}</div>}

                        <button
                            onClick={isTraining ? actions.cancelTraining : handleStartTraining}
                            className={`w-full py-3 rounded-lg font-bold transition-all transform active:scale-95 ${isTraining
                                    ? 'bg-red-600 hover:bg-red-500 text-white'
                                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/50'
                                }`}
                        >
                            {isTraining ? '🛑 Stop Training' : '🚀 Start Training'}
                        </button>
                    </div>
                </div>

                {/* Panel 2: Live Status / progress */}
                <div className="bg-theme-secondary border border-theme rounded-xl p-6 shadow-xl flex flex-col">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-blue-400">
                        Training Monitor
                    </h2>

                    <div className="flex-1 bg-black/40 rounded-lg border border-gray-800 p-4 font-mono text-sm overflow-hidden flex flex-col justify-center items-center relative">
                        {isTraining ? (
                            <div className="w-full max-w-sm">
                                <div className="flex justify-between mb-2 text-blue-300">
                                    <span>Progress</span>
                                    <span>{Math.round(trainingProgress * 100)}%</span>
                                </div>
                                <div className="h-4 bg-gray-800 rounded-full overflow-hidden mb-4">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300 striped-progress"
                                        style={{ width: `${trainingProgress * 100}%` }}
                                    />
                                </div>
                                <div className="text-center text-gray-400 animate-pulse">
                                    {trainingMessage}
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-600 text-center">
                                <div className="text-4xl mb-4 opacity-30">📊</div>
                                <p>Training not active.</p>
                                <p className="text-xs mt-2">Start a session to see live metrics.</p>
                                {trainingMessage && (
                                    <div className="mt-4 p-2 bg-gray-800/50 rounded text-gray-400 text-xs">
                                        Last Status: {trainingMessage}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Panel: Model Library */}
            <div className="bg-theme-secondary border border-theme rounded-xl overflow-hidden shadow-xl">
                <div className="px-6 py-4 border-b border-theme bg-gray-900/50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-200">Installed Models Library</h2>
                    <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">{models.length} Models Available</span>
                </div>

                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-900/30 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-3">Model Name</th>
                            <th className="px-6 py-3">Type</th>
                            <th className="px-6 py-3">Description</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {models.map(model => (
                            <tr key={model.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-white">{model.name}</div>
                                    <div className="text-xs opacity-50 font-mono">{model.id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium border ${model.type === 'detection'
                                            ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/50'
                                            : model.type === 'segmentation'
                                                ? 'bg-blue-900/20 text-blue-400 border-blue-900/50'
                                                : 'bg-gray-800 text-gray-400 border-gray-700'
                                        }`}>
                                        {model.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 max-w-md truncate" title={model.description}>
                                    {model.description}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {model.is_downloaded ? (
                                        <button
                                            onClick={() => actions.deleteModel(model.id)}
                                            disabled={isModelLoading(model.id)}
                                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                                        >
                                            {isModelLoading(model.id) ? 'Deleting...' : 'Delete'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => actions.downloadModel(model.id)}
                                            disabled={isModelLoading(model.id)}
                                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                                        >
                                            {isModelLoading(model.id) ? 'Downloading...' : 'Download'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

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
                }
            `}</style>
        </div>
    );
};

export default ModelHub;
