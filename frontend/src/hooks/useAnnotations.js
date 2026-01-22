import { useState, useCallback, useMemo } from 'react';
import { deepClone } from '../utils/helpers';

/**
 * useAnnotations Hook
 * Manages annotations state, selection, and history (undo/redo)
 * Updated for Multi-Selection
 */
export const useAnnotations = () => {
    // --- State ---
    const [annotations, setAnnotations] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]); // Array of IDs
    const [selectedLabel, setSelectedLabel] = useState('');
    const [history, setHistory] = useState([]); // Undo stack
    const [future, setFuture] = useState([]); // Redo stack

    // --- Computed ---
    // If one is selected, return it. If multiple, return the last one (or handle differently)
    // For backward compatibility with some components, we can return the last selected one as "selectedAnn"
    // but consumers should preferably use selectedIds
    const selectedAnn = useMemo(() => {
        if (selectedIds.length === 1) {
            return annotations.find(a => a.id === selectedIds[0]) || null;
        }
        return null; // Or return undefined if multiple/none
    }, [annotations, selectedIds]);

    // Helper to get all selected objects
    const selectedAnns = useMemo(() => {
        return annotations.filter(a => selectedIds.includes(a.id));
    }, [annotations, selectedIds]);

    // --- Add to History (for undo support) ---
    const addToHistory = useCallback((currentAnns) => {
        const snapshot = deepClone(currentAnns);
        setHistory(prev => [...prev, snapshot]);
        setFuture([]); // Clear redo stack on new action
    }, []);

    // --- Undo ---
    const handleUndo = useCallback(() => {
        if (history.length > 0) {
            const previousState = history[history.length - 1];
            setFuture(prev => [...prev, deepClone(annotations)]); // Save current to future
            setAnnotations(previousState);
            setHistory(prev => prev.slice(0, -1));
            setSelectedIds([]);
            setSelectedLabel('');
        }
    }, [history, annotations]);

    // --- Redo ---
    const handleRedo = useCallback(() => {
        if (future.length > 0) {
            const nextState = future[future.length - 1];
            setHistory(prev => [...prev, deepClone(annotations)]);
            setAnnotations(nextState);
            setFuture(prev => prev.slice(0, -1));
            setSelectedIds([]);
            setSelectedLabel('');
        }
    }, [future, annotations]);

    // --- Clear All ---
    const handleClearAll = useCallback(() => {
        if (confirm('Delete all annotations?')) {
            addToHistory(annotations);
            setAnnotations([]);
            setSelectedIds([]);
            setSelectedLabel('');
        }
    }, [annotations, addToHistory]);

    // --- Update Label ---
    const updateLabel = useCallback((newLabel) => {
        if (selectedIds.length > 0) {
            addToHistory(annotations);
            setAnnotations(prev => prev.map(ann =>
                selectedIds.includes(ann.id) ? { ...ann, label: newLabel } : ann
            ));
            setSelectedLabel(newLabel);
        }
    }, [selectedIds, annotations, addToHistory]);

    // --- Delete Selected ---
    const deleteSelected = useCallback(() => {
        if (selectedIds.length > 0) {
            addToHistory(annotations);
            setAnnotations(prev => prev.filter(ann => !selectedIds.includes(ann.id)));
            setSelectedIds([]);
            setSelectedLabel('');
        }
    }, [selectedIds, annotations, addToHistory]);

    // --- Add Annotation ---
    const addAnnotation = useCallback((newAnn) => {
        addToHistory(annotations);
        setAnnotations(prev => [...prev, newAnn]);
        return newAnn.id; // Return ID instead of index
    }, [annotations, addToHistory]);

    // --- Add Multiple Annotations ---
    const addAnnotations = useCallback((newAnns) => {
        addToHistory(annotations);
        setAnnotations(prev => [...prev, ...newAnns]);
        return newAnns.map(a => a.id);
    }, [annotations, addToHistory]);

    // --- Update Annotation ---
    const updateAnnotation = useCallback((indexOrId, updates) => {
        // Handle both index (legacy) and ID
        setAnnotations(prev => {
            const newAnns = [...prev];
            let idx = -1;
            if (typeof indexOrId === 'number') {
                idx = indexOrId;
            } else {
                idx = newAnns.findIndex(a => a.id === indexOrId);
            }

            if (idx !== -1) {
                newAnns[idx] = { ...newAnns[idx], ...updates };
                return newAnns;
            }
            return prev;
        });
    }, []);

    // --- Update Annotation with History ---
    const updateAnnotationWithHistory = useCallback((indexOrId, updates) => {
        addToHistory(annotations);
        updateAnnotation(indexOrId, updates);
    }, [annotations, addToHistory, updateAnnotation]);

    // --- Replace Annotation at Index ---
    const replaceAnnotation = useCallback((index, newAnn) => {
        addToHistory(annotations);
        setAnnotations(prev => {
            const newAnns = [...prev];
            if (index >= 0 && index < newAnns.length) {
                newAnns[index] = newAnn;
            }
            return newAnns;
        });
    }, [annotations, addToHistory]);

    // --- Remove Annotation at Index ---
    const removeAnnotation = useCallback((index) => {
        addToHistory(annotations);
        setAnnotations(prev => {
            const annToRemove = prev[index];
            if (!annToRemove) return prev;

            const newAnns = prev.filter((_, i) => i !== index);

            // If removed one was selected, deselect it
            if (selectedIds.includes(annToRemove.id)) {
                setSelectedIds(ids => ids.filter(id => id !== annToRemove.id));
            }
            return newAnns;
        });
    }, [annotations, addToHistory, selectedIds]);

    // --- Splice and Insert (for knife tool) ---
    const spliceAndInsert = useCallback((removeIndex, newAnns) => {
        addToHistory(annotations);
        const result = [...annotations];
        result.splice(removeIndex, 1, ...newAnns);
        setAnnotations(result);
        setSelectedIds([]);
    }, [annotations, addToHistory]);

    // --- Select Annotation ---
    // Updated signature: (id, multiSelect)
    const selectAnnotation = useCallback((id, multiSelect = false) => {
        if (!id) {
            if (!multiSelect) setSelectedIds([]);
            return;
        }

        if (multiSelect) {
            setSelectedIds(prev => {
                const newIds = prev.includes(id)
                    ? prev.filter(i => i !== id)
                    : [...prev, id];
                return newIds;
            });
        } else {
            setSelectedIds([id]);
            // Also update label if single selection
            const ann = annotations.find(a => a.id === id);
            if (ann) setSelectedLabel(ann.label || '');
        }
    }, [annotations]);

    // --- Clear Selection ---
    const clearSelection = useCallback(() => {
        setSelectedIds([]);
        setSelectedLabel('');
    }, []);

    // --- Reset (clear all without history) ---
    const reset = useCallback(() => {
        setAnnotations([]);
        setSelectedIds([]);
        setSelectedLabel('');
        setHistory([]);
        setFuture([]);
    }, []);

    return {
        // State
        annotations,
        selectedIds,       // REPLACED selectedIndex
        selectedIndex: null, // Deprecated/Removed
        selectedLabel,
        selectedAnn,       // Computed (single or null)
        selectedAnns,      // New: All selected objects
        history,
        future,

        // History info
        canUndo: history.length > 0,
        canRedo: future.length > 0,

        // Actions
        addToHistory,
        handleUndo,
        handleRedo,
        handleClearAll,
        updateLabel,
        deleteSelected,
        addAnnotation,
        addAnnotations,
        updateAnnotation,
        updateAnnotationWithHistory,
        replaceAnnotation,
        removeAnnotation,
        spliceAndInsert,
        selectAnnotation,
        clearSelection,
        reset,

        // Direct setters
        setAnnotations,
        setSelectedIds,
        setSelectedLabel
    };
};

export default useAnnotations;
