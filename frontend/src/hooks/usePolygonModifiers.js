import { useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/config';
import { simplifyPoints, densifyPoints } from '../utils/geometry';

/**
 * usePolygonModifiers Hook
 * Provides polygon editing operations: simplify, densify, reset, beautify
 * Updated for Multi-Selection ID-based state
 */
export const usePolygonModifiers = (annotationsHook, stageHook) => {
    const {
        annotations,
        selectedIds,
        addToHistory,
        setAnnotations
    } = annotationsHook;

    const { imageFile } = stageHook || {};

    // --- Helper: Update specific annotations by ID ---
    const updateSelectedAnnotations = useCallback((updater) => {
        if (!selectedIds || selectedIds.length === 0) return false;

        addToHistory(annotations);
        const newAnns = annotations.map(ann => {
            if (selectedIds.includes(ann.id)) {
                return updater(ann);
            }
            return ann;
        });
        setAnnotations(newAnns);
        return true;
    }, [annotations, selectedIds, addToHistory, setAnnotations]);

    // --- Simplify (Ramer-Douglas-Peucker) ---
    const handleSimplify = useCallback((tolerance = 2.0) => {
        if (!selectedIds || selectedIds.length === 0) return false;

        return updateSelectedAnnotations((ann) => {
            if (ann.type !== 'poly' || !ann.points || ann.points.length <= 6) return ann;

            // Preserve original
            const raw = ann.originalRawPoints || ann.points;
            const newPoints = simplifyPoints(ann.points, tolerance);

            if (newPoints.length >= 6) {
                return {
                    ...ann,
                    points: newPoints,
                    originalRawPoints: raw
                };
            }
            return ann;
        });
    }, [selectedIds, updateSelectedAnnotations]);

    // --- Densify (Add midpoints) ---
    const handleDensify = useCallback(() => {
        if (!selectedIds || selectedIds.length === 0) return false;

        return updateSelectedAnnotations((ann) => {
            if (ann.type !== 'poly' || !ann.points || ann.points.length < 4) return ann;

            const raw = ann.originalRawPoints || ann.points;
            const newPoints = densifyPoints(ann.points);

            return {
                ...ann,
                points: newPoints,
                originalRawPoints: raw
            };
        });
    }, [selectedIds, updateSelectedAnnotations]);

    // --- Reset (Restore original points) ---
    const handleReset = useCallback(() => {
        if (!selectedIds || selectedIds.length === 0) return false;

        return updateSelectedAnnotations((ann) => {
            if (!ann.originalRawPoints) return ann;
            return {
                ...ann,
                points: [...ann.originalRawPoints]
            };
        });
    }, [selectedIds, updateSelectedAnnotations]);

    // --- Beautify (AI refinement) ---
    // Note: This involves async API calls. Doing parallel requests might be heavy.
    // For now, let's limit to the first selected item or sequential.
    // Let's do sequential for safety.
    const handleBeautify = useCallback(async (selectedModel, setIsProcessing) => {
        if (!selectedIds || selectedIds.length === 0 || !imageFile) {
            return { success: false, error: 'No selection or image' };
        }

        if (setIsProcessing) setIsProcessing(true);

        // We'll process only valid polygons
        const targets = annotations.filter(a => selectedIds.includes(a.id) && a.type === 'poly' && a.points.length >= 6);

        if (targets.length === 0) {
            if (setIsProcessing) setIsProcessing(false);
            return { success: false, error: 'No valid polygons selected' };
        }

        addToHistory(annotations);
        // We will build a new annotations array
        // But since we have async await in loop, we need to be careful with state updates.
        // Better strategy: fetch all updates then update state once.

        try {
            const updates = {}; // map id -> newPoints

            // Limit to first 5 to prevent overload if user selects 100 items
            const processList = targets.slice(0, 5);

            for (const ann of processList) {
                const formData = new FormData();
                formData.append('file', imageFile);
                formData.append('points_json', JSON.stringify(ann.points));
                formData.append('model_name', selectedModel);

                try {
                    const res = await axios.post(`${API_URL}/refine-polygon`, formData);
                    if (res.data.points) {
                        updates[ann.id] = res.data.points;
                    }
                } catch (e) {
                    console.error(`Beautify failed for ${ann.id}`, e);
                }
            }

            if (Object.keys(updates).length > 0) {
                setAnnotations(prev => prev.map(ann => {
                    if (updates[ann.id]) {
                        const raw = ann.originalRawPoints || ann.points;
                        return {
                            ...ann,
                            points: updates[ann.id],
                            originalRawPoints: raw
                        };
                    }
                    return ann;
                }));
                return { success: true };
            } else {
                return { success: false, error: 'Could not refine any shapes' };
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
    }, [annotations, selectedIds, imageFile, addToHistory, setAnnotations]);

    return {
        handleSimplify,
        handleDensify,
        handleReset,
        handleBeautify,

        // Info (Checked against at least one selected item supports it)
        canModify: selectedIds && selectedIds.length > 0,
        canReset: selectedIds && selectedIds.length > 0 // simplified check
    };
};

export default usePolygonModifiers;
