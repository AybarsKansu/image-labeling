import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/config';

/**
 * useAIModels Hook
 * Manages AI models, training status, and modal visibility
 */
export const useAIModels = (initialModel = 'yolov8m-seg.pt', textPrompt) => {
    // --- Model State ---
    const [availableModels, setAvailableModels] = useState([initialModel]);
    const [selectedModel, setSelectedModel] = useState(initialModel);

    // --- Training State ---
    const [trainingStatus, setTrainingStatus] = useState({
        is_training: false,
        progress: 0,
        message: 'Idle'
    });

    // --- Modal Visibility ---
    const [showModelManager, setShowModelManager] = useState(false);
    const [showTrainModal, setShowTrainModal] = useState(false);
    const [showPreprocessingModal, setShowPreprocessingModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // --- Processing State ---
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Fetch Available Models ---
    const fetchModels = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/models`);
            if (res.data.models) {
                setAvailableModels(res.data.models);
            }
        } catch (err) {
            console.error('Failed to fetch models', err);
        }
    }, []);

    // --- Fetch models on mount ---
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    // --- Poll Training Status when train modal is open ---
    useEffect(() => {
        let interval;
        if (showTrainModal || showPreprocessingModal) {
            const fetchStatus = async () => {
                try {
                    const res = await axios.get(`${API_URL}/training-status`);
                    setTrainingStatus(res.data);
                } catch (err) {
                    console.error('Failed to fetch training status', err);
                }
            };

            fetchStatus(); // Initial fetch
            interval = setInterval(fetchStatus, 2000);
        }
        return () => clearInterval(interval);
    }, [showTrainModal, showPreprocessingModal]);

    // --- Start Training ---
    const startTraining = useCallback(async (config) => {
        try {
            const formData = new FormData();
            formData.append('base_model', config.base_model || selectedModel);
            formData.append('epochs', config.epochs || 100);
            formData.append('batch_size', config.batch_size || 16);

            // Add preprocessing options if provided
            if (config.autoOrient !== undefined) {
                formData.append('auto_orient', String(config.autoOrient));
            }
            if (config.resizeMode) {
                formData.append('resize_mode', config.resizeMode);
            }
            if (config.enableTiling !== undefined) {
                formData.append('enable_tiling', String(config.enableTiling));
                formData.append('tile_size', config.tileSize || 640);
                formData.append('tile_overlap', config.tileOverlap || 0.2);
            }

            const res = await axios.post(`${API_URL}/train-model`, formData);

            if (res.data.error) {
                return { success: false, error: res.data.error };
            }
            return { success: true, data: res.data };
        } catch (err) {
            console.error('Training start failed', err);
            return {
                success: false,
                error: err.response?.data?.error || err.message
            };
        }
    }, [selectedModel]);

    // --- Download Model ---
    const downloadModel = useCallback(async (modelName) => {
        try {
            const formData = new FormData();
            formData.append('model_name', modelName);

            const res = await axios.post(`${API_URL}/download-model`, formData);

            if (res.data.success) {
                await fetchModels(); // Refresh model list
                return { success: true };
            }
            return { success: false, error: res.data.error };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }, [fetchModels]);

    // --- Delete Model ---
    const deleteModel = useCallback(async (modelName) => {
        try {
            const formData = new FormData();
            formData.append('model_name', modelName);

            await axios.delete(`${API_URL}/delete-model`, { data: formData });
            await fetchModels(); // Refresh model list
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }, [fetchModels]);

    // --- Select Model ---
    const selectModel = useCallback((modelName) => {
        setSelectedModel(modelName);
    }, []);

    // --- Modal Actions ---
    const openModelManager = useCallback(() => setShowModelManager(true), []);
    const closeModelManager = useCallback(() => setShowModelManager(false), []);
    const openTrainModal = useCallback(() => setShowTrainModal(true), []);
    const closeTrainModal = useCallback(() => setShowTrainModal(false), []);
    const openPreprocessingModal = useCallback(() => setShowPreprocessingModal(true), []);
    const closePreprocessingModal = useCallback(() => setShowPreprocessingModal(false), []);
    const openSettings = useCallback(() => setShowSettings(true), []);
    const closeSettings = useCallback(() => setShowSettings(false), []);

    return {
        // Model State
        models: availableModels,
        selectedModel,
        activeModel: selectedModel,

        // Training State
        trainingStatus,
        isTraining: trainingStatus.is_training,
        trainingProgress: trainingStatus.progress,
        trainingMessage: trainingStatus.message,

        // Processing
        isProcessing,
        setIsProcessing,

        // Modal Visibility
        modals: {
            showModelManager,
            showTrainModal,
            showPreprocessingModal,
            showSettings
        },

        // Actions
        actions: {
            fetchModels,
            selectModel,
            startTraining,
            downloadModel,
            deleteModel,

            // Modal controls
            openModelManager,
            closeModelManager,
            openTrainModal,
            closeTrainModal,
            openPreprocessingModal,
            closePreprocessingModal,
            openSettings,
            closeSettings
        },

        // Direct setters (for controlled components)
        setSelectedModel,
        setShowModelManager,
        setShowTrainModal,
        setShowPreprocessingModal,
        setShowSettings
    };
};

export default useAIModels;
