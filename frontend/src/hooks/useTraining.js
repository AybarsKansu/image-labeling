import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/appConstants';

export const useTraining = () => {
    const [trainingStatus, setTrainingStatus] = useState({ is_training: false, message: 'Idle' });
    const [showTrainModal, setShowTrainModal] = useState(false);

    // --- Training Status Polling ---
    useEffect(() => {
        let interval;
        // Poll if modal is open OR if training is active (to show mini-progress)
        if (showTrainModal || trainingStatus.is_training) {
            interval = setInterval(() => {
                axios.get(`${API_URL}/training-status`).then(res => {
                    setTrainingStatus(res.data);
                }).catch(() => { });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [showTrainModal, trainingStatus.is_training]);

    const handleCancelTraining = useCallback(() => {
        if (window.confirm("Are you sure you want to stop the training?")) {
            axios.post(`${API_URL}/cancel-training`)
                .then(res => {
                    // Force a status update immediately to reflect change quicker
                    setTrainingStatus(prev => ({ ...prev, message: "Cancelling..." }));
                })
                .catch(err => alert("Failed to cancel: " + err.message));
        }
    }, []);

    const startTraining = useCallback(async (config) => {
        // This might be called from the modal, but logic can be here
        // Actually the modal usually calls API directly or via prop. 
        // If we want to centralize, we can expose this.
        // For now, let's just expose state and cancel.
    }, []);

    return {
        trainingStatus,
        setTrainingStatus, // Expose for manual updates if needed
        showTrainModal,
        setShowTrainModal,
        handleCancelTraining
    };
};
