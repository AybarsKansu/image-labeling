import { useState, useRef, useEffect, useCallback } from 'react';

export const usePanelSystem = (initialPos = { x: 20, y: 20 }, initialSize = { width: 280, height: 200 }) => {
    const [panelPos, setPanelPos] = useState(initialPos);
    const [panelSize, setPanelSize] = useState(initialSize);
    const [isPanelDragging, setIsPanelDragging] = useState(false);
    const [isPanelResizing, setIsPanelResizing] = useState(false);

    const panelDragOffset = useRef({ x: 0, y: 0 });
    const panelResizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

    useEffect(() => {
        const handlePanelMouseMove = (e) => {
            if (isPanelDragging) {
                setPanelPos({
                    x: e.clientX - panelDragOffset.current.x,
                    y: e.clientY - panelDragOffset.current.y
                });
            }
            if (isPanelResizing) {
                const newWidth = Math.max(100, panelResizeStart.current.width + (e.clientX - panelResizeStart.current.x));
                const newHeight = Math.max(100, panelResizeStart.current.height + (e.clientY - panelResizeStart.current.y));
                setPanelSize({ width: newWidth, height: newHeight });
            }
        };
        const handlePanelMouseUp = () => {
            setIsPanelDragging(false);
            setIsPanelResizing(false);
        };

        if (isPanelDragging || isPanelResizing) {
            window.addEventListener('mousemove', handlePanelMouseMove);
            window.addEventListener('mouseup', handlePanelMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handlePanelMouseMove);
            window.removeEventListener('mouseup', handlePanelMouseUp);
        };
    }, [isPanelDragging, isPanelResizing]);

    const startDrag = useCallback((e) => {
        // e.preventDefault(); // Optional, depending on context
        setIsPanelDragging(true);
        panelDragOffset.current = {
            x: e.clientX - panelPos.x,
            y: e.clientY - panelPos.y
        };
    }, [panelPos]);

    const startResize = useCallback((e) => {
        e.stopPropagation();
        // e.preventDefault();
        setIsPanelResizing(true);
        panelResizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            width: panelSize.width,
            height: panelSize.height
        };
    }, [panelSize]);

    return {
        panelPos,
        panelSize,
        isDragging: isPanelDragging,
        isResizing: isPanelResizing,
        startDrag,
        startResize
    };
};
