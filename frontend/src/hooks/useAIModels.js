import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/config';
import { getModelConfig, MODEL_CONFIG } from '../constants/modelConfig';

/**
 * useAIModels Hook
 * Manages AI models, parameters, and selection logic.
 */
export const useAIModels = (initialModel = null, textPrompt) => {
    // --- Model State ---
    const [selectedModel, setSelectedModel] = useState(initialModel || null);

    // --- Dynamic Model Parameters ---
    const [currentParams, setCurrentParams] = useState({});
    // --- Model List State ---
    const [models, setModels] = useState([]);
    const [loadingModelIds, setLoadingModelIds] = useState([]); // Track multiple concurrent ops

    // Derived state: Only show downloaded models in dropdown
    const downloadedModels = models.filter(m => m.is_downloaded);

    // Fetch models from backend
    const fetchModels = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/models`);
            // Expecting { models: [...] } based on schema
            const data = res.data;
            if (data.models && Array.isArray(data.models)) {
                setModels(data.models);
            } else if (Array.isArray(data)) {
                setModels(data);
            }
        } catch (err) {
            console.error("Failed to fetch models:", err);
        }
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);
    // Training State
    const [taskId, setTaskId] = useState(null);
    const [trainingStatus, setTrainingStatus] = useState({
        isTraining: false,
        progress: 0.0,
        message: 'Idle',
        result: null,
        error: null
    });

    // Poll training task status
    useEffect(() => {
        let intervalId;

        const checkStatus = async () => {
            if (!taskId) return;

            try {
                const res = await axios.get(`${API_URL}/tasks/${taskId}`);
                const task = res.data;

                setTrainingStatus({
                    isTraining: task.status === 'processing' || task.status === 'pending',
                    progress: task.progress || 0.0, // Ensure no NaN
                    message: task.message || task.status,
                    result: task.result,
                    error: task.error
                });

                if (task.status === 'completed' || task.status === 'failed') {
                    setTaskId(null); // Stop polling
                }
            } catch (err) {
                console.error("Failed to poll task:", err);
                // Don't stop polling immediately on one error, maybe network blip
            }
        };

        if (taskId) {
            checkStatus(); // Initial check
            intervalId = setInterval(checkStatus, 2000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [taskId]);

    // Update params when model changes
    useEffect(() => {
        if (!selectedModel) {
            setCurrentParams({});
            return;
        }

        const config = getModelConfig(selectedModel);
        if (config && config.parameters) {
            // Reset to defaults defined in config
            const defaults = config.parameters.reduce((acc, param) => {
                acc[param.key] = param.default;
                return acc;
            }, {});
            setCurrentParams(defaults);
        } else {
            setCurrentParams({});
        }
    }, [selectedModel]);

    // Helper to update a single param (passed to UI)
    const updateParam = useCallback((key, value) => {
        setCurrentParams(prev => ({ ...prev, [key]: value }));
    }, []);

    // --- Modals State ---
    const [modals, setModals] = useState({
        showModelManager: false,
        showSettings: false,
        showTrainModal: false,
        showPreprocessingModal: false
    });
    // --- Actions ---
    const downloadModel = async (modelId) => {
        if (loadingModelIds.includes(modelId)) return;

        setLoadingModelIds(prev => [...prev, modelId]);
        try {
            await axios.post(`${API_URL}/download-model`, { model_id: modelId });
            // Refresh list to update numbers/status
            await fetchModels();
        } catch (err) {
            console.error(`Failed to download ${modelId}:`, err);
            alert(`Download failed: ${err.response?.data?.detail || err.message}`);
        } finally {
            setLoadingModelIds(prev => prev.filter(id => id !== modelId));
        }
    };

    const deleteModel = async (modelId) => {
        if (loadingModelIds.includes(modelId)) return;

        if (!window.confirm(`Are you sure you want to delete ${modelId}?`)) return;

        setLoadingModelIds(prev => [...prev, modelId]);
        try {
            // Check if deleted model is currently selected
            if (selectedModel === modelId) {
                setSelectedModel(null);
            }

            // The delete endpoint expects JSON body with model_id if using DELETE method carefully
            // But axios.delete needs 'data' key for body
            await axios.delete(`${API_URL}/delete-model`, {
                data: { model_id: modelId }
            });
            await fetchModels();
        } catch (err) {
            console.error(`Failed to delete ${modelId}:`, err);
            alert(`Delete failed: ${err.response?.data?.detail || err.message}`);
        } finally {
            setLoadingModelIds(prev => prev.filter(id => id !== modelId));
        }
    };

    const actions = {
        openModelManager: () => setModals(prev => ({ ...prev, showModelManager: true })),
        closeModelManager: () => setModals(prev => ({ ...prev, showModelManager: false })),

        openSettings: () => setModals(prev => ({ ...prev, showSettings: true })),
        closeSettings: () => setModals(prev => ({ ...prev, showSettings: false })),

        openTrainModal: () => setModals(prev => ({ ...prev, showTrainModal: true })),
        closeTrainModal: () => setModals(prev => ({ ...prev, showTrainModal: false })),

        openPreprocessingModal: () => setModals(prev => ({ ...prev, showPreprocessingModal: true })),
        closePreprocessingModal: () => setModals(prev => ({ ...prev, showPreprocessingModal: false })),

        setModel: setSelectedModel,
        downloadModel,
        deleteModel,
        startTraining: async (config) => {
            try {
                // Config should be { base_model, epochs, batch_size, project_ids... }
                const formData = new FormData();
                if (config.base_model) formData.append('base_model', config.base_model);
                if (config.epochs) formData.append('epochs', config.epochs);
                if (config.batch_size) formData.append('batch_size', config.batch_size);

                // Handle project_id (legacy) or project_ids (new)
                if (config.project_ids) {
                    formData.append('project_ids', config.project_ids);
                } else if (config.project_id) {
                    formData.append('project_id', config.project_id);
                }

                const res = await axios.post(`${API_URL}/train-model`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (res.data.task_id) {
                    setTaskId(res.data.task_id);
                    setTrainingStatus(prev => ({
                        ...prev,
                        isTraining: true,
                        message: 'Initializing...',
                        progress: 0.0
                    }));
                    return { success: true, task_id: res.data.task_id };
                }

                return { success: false, error: "No task_id returned" };

            } catch (err) {
                console.error("Training failed:", err);
                return {
                    success: false,
                    error: err.response?.data?.detail || err.message
                };
            }
        },
        cancelTraining: async () => {
            // Note: In a real system, we should send a cancel request for the specific task ID
            // For now, we just reset the frontend state
            setTaskId(null);
            setTrainingStatus({ isTraining: false, progress: 0, message: 'Cancelled' });
            return { success: true };
        }
    };

    return {
        selectedModel,
        setSelectedModel, // Make sure to expose setter
        currentParams,
        updateParam,
        actions,
        // Helper to check if model logic needs text
        modelConfig: getModelConfig(selectedModel),
        trainingStatus,
        modals, // Expose modals state
        models, // Full registry list (objects)
        downloadedModels, // Ready-to-use list
        loadingModelIds, // Track async ops
        isTraining: trainingStatus.isTraining,
        trainingProgress: trainingStatus.progress,
        trainingMessage: trainingStatus.message || 'Idle'
    };
};

export default useAIModels;
