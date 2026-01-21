import { useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/config';
import { simplifyPoints, densifyPoints } from '../utils/geometry';

/**
 * usePolygonModifiers Hook
 * Provides polygon editing operations: simplify, densify, reset, beautify
 */
export const usePolygonModifiers = (annotationsHook, stageHook) => {
    const {
        annotations,
        selectedIndex,
        addToHistory,
        setAnnotations
    } = annotationsHook;

    const { imageFile } = stageHook || {};

    // --- Simplify (Ramer-Douglas-Peucker) ---
    const handleSimplify = useCallback((tolerance = 2.0) => {
        if (selectedIndex === null) return false;

        const ann = annotations[selectedIndex];
        if (ann.type !== 'poly' || !ann.points || ann.points.length <= 6) {
            return false;
        }

        // Preserve original if not already saved
        const raw = ann.originalRawPoints || ann.points;
        const newPoints = simplifyPoints(ann.points, tolerance);

        if (newPoints.length >= 6) { // Ensure valid polygon
            addToHistory(annotations);
            const newAnns = [...annotations];
            newAnns[selectedIndex] = {
                ...ann,
                points: newPoints,
                originalRawPoints: raw
            };
            setAnnotations(newAnns);
            console.log(`Simplified from ${ann.points.length / 2} to ${newPoints.length / 2} points`);
            return true;
        }
        return false;
    }, [annotations, selectedIndex, addToHistory, setAnnotations]);

    // --- Densify (Add midpoints) ---
    const handleDensify = useCallback(() => {
        if (selectedIndex === null) return false;

        const ann = annotations[selectedIndex];
        if (ann.type !== 'poly' || !ann.points || ann.points.length < 4) {
            return false;
        }

        const raw = ann.originalRawPoints || ann.points;
        const newPoints = densifyPoints(ann.points);

        addToHistory(annotations);
        const newAnns = [...annotations];
        newAnns[selectedIndex] = {
            ...ann,
            points: newPoints,
            originalRawPoints: raw
        };
        setAnnotations(newAnns);
        console.log(`Densified from ${ann.points.length / 2} to ${newPoints.length / 2} points`);
        return true;
    }, [annotations, selectedIndex, addToHistory, setAnnotations]);

    // --- Reset (Restore original points) ---
    const handleReset = useCallback(() => {
        if (selectedIndex === null) return false;

        const ann = annotations[selectedIndex];
        if (!ann.originalRawPoints) {
            console.log('No original points to reset to');
            return false;
        }

        addToHistory(annotations);
        const newAnns = [...annotations];
        newAnns[selectedIndex] = {
            ...ann,
            points: [...ann.originalRawPoints] // Clone to avoid reference issues
        };
        setAnnotations(newAnns);
        console.log('Reset to original points');
        return true;
    }, [annotations, selectedIndex, addToHistory, setAnnotations]);

    // --- Beautify (AI refinement) ---
    const handleBeautify = useCallback(async (selectedModel, setIsProcessing) => {
        if (selectedIndex === null || !imageFile) {
            return { success: false, error: 'No selection or image' };
        }

        const ann = annotations[selectedIndex];
        if (ann.type !== 'poly' || !ann.points || ann.points.length < 6) {
            return { success: false, error: 'Invalid polygon' };
        }

        if (setIsProcessing) setIsProcessing(true);

        try {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('points_json', JSON.stringify(ann.points));
            formData.append('model_name', selectedModel);

            const res = await axios.post(`${API_URL}/refine-polygon`, formData);

            if (res.data.points) {
                const newPoints = res.data.points;
                const raw = ann.originalRawPoints || ann.points;

                addToHistory(annotations);
                const newAnns = [...annotations];
                newAnns[selectedIndex] = {
                    ...ann,
                    points: newPoints,
                    originalRawPoints: raw
                };
                setAnnotations(newAnns);
                console.log('Beautify success');
                return { success: true };
            } else {
                return { success: false, error: 'Could not refine shape' };
            }
        } catch (err) {
            console.error('Beautify failed', err);
            return {
                success: false,
                error: err.response?.data?.error || err.message
            };
        } finally {
            if (setIsProcessing) setIsProcessing(false);
        }
    }, [annotations, selectedIndex, imageFile, addToHistory, setAnnotations]);

    return {
        handleSimplify,
        handleDensify,
        handleReset,
        handleBeautify,

        // Info
        canModify: selectedIndex !== null &&
            annotations[selectedIndex]?.type === 'poly' &&
            annotations[selectedIndex]?.points?.length >= 6,
        canReset: selectedIndex !== null &&
            !!annotations[selectedIndex]?.originalRawPoints
    };
};

export default usePolygonModifiers;
