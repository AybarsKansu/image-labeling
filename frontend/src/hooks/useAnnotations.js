import { useState, useCallback } from 'react';

export const useAnnotations = () => {
    const [annotations, setAnnotations] = useState([]);
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState('');

    // --- History Management ---
    const addToHistory = useCallback((currentAnns) => {
        // Deep copy to ensure no reference issues
        const snapshot = JSON.parse(JSON.stringify(currentAnns));
        setHistory(prev => [...prev, snapshot]);
        setFuture([]); // Clear future on new action
    }, []);

    const handleUndo = useCallback(() => {
        if (history.length > 0) {
            const previousState = history[history.length - 1];
            setFuture(prev => [...prev, annotations]); // Save current to future
            setAnnotations(previousState);
            setHistory(prev => prev.slice(0, -1));
            setSelectedIndex(null);
        }
    }, [history, annotations]);

    const handleRedo = useCallback(() => {
        if (future.length > 0) {
            const nextState = future[future.length - 1];
            // Do not call addToHistory here loop logic issues
            // Manually update history
            setHistory(prev => [...prev, annotations]);

            setAnnotations(nextState);
            setFuture(prev => prev.slice(0, -1));
            setSelectedIndex(null);
        }
    }, [future, annotations]);

    // --- Actions ---
    const handleClearAll = useCallback(() => {
        if (confirm('Delete all annotations?')) {
            addToHistory(annotations);
            setAnnotations([]);
            setSelectedIndex(null);
        }
    }, [annotations, addToHistory]);

    const deleteSelected = useCallback(() => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            setAnnotations(prev => prev.filter((_, i) => i !== selectedIndex));
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    }, [selectedIndex, annotations, addToHistory]);

    const updateLabel = useCallback((newLabel) => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            setAnnotations(prev => {
                const updated = [...prev];
                updated[selectedIndex] = { ...updated[selectedIndex], label: newLabel };
                return updated;
            });
            setSelectedLabel(newLabel);
        }
    }, [selectedIndex, annotations, addToHistory]);

    const selectAnnotation = useCallback((index) => {
        setSelectedIndex(index);
        if (index !== null && annotations[index]) {
            setSelectedLabel(annotations[index].label || '');
        } else {
            setSelectedLabel('');
        }
    }, [annotations]);

    const addAnnotation = useCallback((newAnn) => {
        addToHistory(annotations);
        setAnnotations(prev => [...prev, newAnn]);
        // Auto-select the new one
        // Note: We can't immediately know the index state update is async, 
        // but typically it will be length
        // We defer selection logic to the caller if needed
    }, [annotations, addToHistory]);

    return {
        annotations,
        setAnnotations,
        history,
        setHistory,
        future,
        setFuture, // Exposed for special cases like Load Image
        selectedIndex,
        selectedLabel,
        selectAnnotation,
        addToHistory,
        undo: handleUndo,
        redo: handleRedo,
        clearAll: handleClearAll,
        deleteSelected,
        updateLabel,
        addAnnotation
    };
};
