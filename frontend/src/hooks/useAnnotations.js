import { useState, useCallback } from 'react';
import { deepClone } from '../utils/helpers';

/**
 * useAnnotations Hook
 * Manages annotations state, selection, and history (undo/redo)
 */
export const useAnnotations = () => {
    // --- State ---
    const [annotations, setAnnotations] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState('');
    const [history, setHistory] = useState([]); // Undo stack
    const [future, setFuture] = useState([]); // Redo stack

    // --- Computed ---
    const selectedAnn = selectedIndex !== null ? annotations[selectedIndex] : null;

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
            setSelectedIndex(null);
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
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    }, [future, annotations]);

    // --- Clear All ---
    const handleClearAll = useCallback(() => {
        if (confirm('Delete all annotations?')) {
            addToHistory(annotations);
            setAnnotations([]);
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    }, [annotations, addToHistory]);

    // --- Update Label ---
    const updateLabel = useCallback((newLabel) => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            const updated = [...annotations];
            updated[selectedIndex] = { ...updated[selectedIndex], label: newLabel };
            setAnnotations(updated);
            setSelectedLabel(newLabel);
        }
    }, [selectedIndex, annotations, addToHistory]);

    // --- Delete Selected ---
    const deleteSelected = useCallback(() => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            setAnnotations(annotations.filter((_, i) => i !== selectedIndex));
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    }, [selectedIndex, annotations, addToHistory]);

    // --- Add Annotation ---
    const addAnnotation = useCallback((newAnn) => {
        addToHistory(annotations);
        setAnnotations(prev => [...prev, newAnn]);
        return annotations.length; // Return index of new annotation
    }, [annotations, addToHistory]);

    // --- Add Multiple Annotations ---
    const addAnnotations = useCallback((newAnns) => {
        addToHistory(annotations);
        setAnnotations(prev => [...prev, ...newAnns]);
        return annotations.length + newAnns.length - 1; // Return index of last new annotation
    }, [annotations, addToHistory]);

    // --- Update Annotation ---
    const updateAnnotation = useCallback((index, updates) => {
        if (index >= 0 && index < annotations.length) {
            const newAnns = [...annotations];
            newAnns[index] = { ...newAnns[index], ...updates };
            setAnnotations(newAnns);
        }
    }, [annotations]);

    // --- Update Annotation with History ---
    const updateAnnotationWithHistory = useCallback((index, updates) => {
        if (index >= 0 && index < annotations.length) {
            addToHistory(annotations);
            const newAnns = [...annotations];
            newAnns[index] = { ...newAnns[index], ...updates };
            setAnnotations(newAnns);
        }
    }, [annotations, addToHistory]);

    // --- Replace Annotation at Index ---
    const replaceAnnotation = useCallback((index, newAnn) => {
        if (index >= 0 && index < annotations.length) {
            addToHistory(annotations);
            const newAnns = [...annotations];
            newAnns[index] = newAnn;
            setAnnotations(newAnns);
        }
    }, [annotations, addToHistory]);

    // --- Remove Annotation at Index ---
    const removeAnnotation = useCallback((index) => {
        if (index >= 0 && index < annotations.length) {
            addToHistory(annotations);
            setAnnotations(annotations.filter((_, i) => i !== index));
            if (selectedIndex === index) {
                setSelectedIndex(null);
                setSelectedLabel('');
            }
        }
    }, [annotations, selectedIndex, addToHistory]);

    // --- Splice and Insert (for knife tool) ---
    const spliceAndInsert = useCallback((removeIndex, newAnns) => {
        addToHistory(annotations);
        const result = [...annotations];
        result.splice(removeIndex, 1, ...newAnns);
        setAnnotations(result);
        setSelectedIndex(null);
    }, [annotations, addToHistory]);

    // --- Select Annotation ---
    const selectAnnotation = useCallback((index) => {
        if (index !== null && index >= 0 && index < annotations.length) {
            setSelectedIndex(index);
            setSelectedLabel(annotations[index].label || '');
        } else {
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    }, [annotations]);

    // --- Clear Selection ---
    const clearSelection = useCallback(() => {
        setSelectedIndex(null);
        setSelectedLabel('');
    }, []);

    // --- Reset (clear all without history) ---
    const reset = useCallback(() => {
        setAnnotations([]);
        setSelectedIndex(null);
        setSelectedLabel('');
        setHistory([]);
        setFuture([]);
    }, []);

    return {
        // State
        annotations,
        selectedIndex,
        selectedLabel,
        selectedAnn,
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

        // Direct setters (for bulk operations)
        setAnnotations,
        setSelectedIndex,
        setSelectedLabel
    };
};

export default useAnnotations;
