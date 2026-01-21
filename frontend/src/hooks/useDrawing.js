import { useState, useRef, useCallback, useEffect } from 'react';

export const useDrawing = (tool, stageRef, groupRef, onComplete, imageLayout, setImageLayout, aiBoxMode = 'rect') => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [currentPolyPoints, setCurrentPolyPoints] = useState([]);
    const [currentPenPoints, setCurrentPenPoints] = useState([]);
    const [tempAnnotation, setTempAnnotation] = useState(null);
    const [mousePos, setMousePos] = useState(null);

    // Refs for drag operations
    const startPosRef = useRef(null);
    const panStartRef = useRef(null);
    const layoutStartRef = useRef(null);
    const justFinishedDrawingRef = useRef(false);

    // --- Helper: Get Relative Pointer ---
    const getRelativePointerPosition = useCallback(() => {
        if (!stageRef.current || !groupRef.current) return { x: 0, y: 0 };
        const transform = groupRef.current.getAbsoluteTransform().copy();
        transform.invert();
        const pos = stageRef.current.getPointerPosition();
        return transform.point(pos);
    }, [stageRef, groupRef]);

    // --- Mouse Down ---
    const handleMouseDown = useCallback((e) => {
        // Right-click pan
        if (e.evt.button === 2) {
            e.evt.preventDefault();
            if (imageLayout && setImageLayout) {
                setIsPanning(true);
                panStartRef.current = stageRef.current.getPointerPosition();
                layoutStartRef.current = { x: imageLayout.x, y: imageLayout.y };
            }
            return;
        }

        const pos = getRelativePointerPosition();

        if (tool === 'poly') return;

        // Pen / Knife
        if (tool === 'pen' || tool === 'knife') {
            setIsDrawing(true);
            setCurrentPenPoints([pos.x, pos.y]);
            return;
        }

        // AI-Box Lasso mode
        if (tool === 'ai-box' && aiBoxMode === 'lasso') {
            setIsDrawing(true);
            setCurrentPenPoints([pos.x, pos.y]);
            return;
        }

        // Box / AI-Box rect mode
        if (tool === 'box' || tool === 'ai-box') {
            setIsDrawing(true);
            startPosRef.current = pos;
            setTempAnnotation({
                x: pos.x,
                y: pos.y,
                width: 0,
                height: 0,
                type: 'poly',
            });
        }
    }, [tool, aiBoxMode, getRelativePointerPosition, stageRef, imageLayout, setImageLayout]);

    // --- Mouse Move ---
    const handleMouseMove = useCallback((e) => {
        const pos = getRelativePointerPosition();
        setMousePos(pos);

        // Handle right-click pan
        if (isPanning && panStartRef.current && layoutStartRef.current && setImageLayout) {
            const currentPos = stageRef.current.getPointerPosition();
            const dx = currentPos.x - panStartRef.current.x;
            const dy = currentPos.y - panStartRef.current.y;
            setImageLayout({
                ...imageLayout,
                x: layoutStartRef.current.x + dx,
                y: layoutStartRef.current.y + dy
            });
            return;
        }

        if (!isDrawing) return;

        // Pen / Knife / Lasso
        if (tool === 'pen' || tool === 'knife' || (tool === 'ai-box' && aiBoxMode === 'lasso')) {
            setCurrentPenPoints(prev => [...prev, pos.x, pos.y]);
        } else if (tool === 'box' || (tool === 'ai-box' && aiBoxMode === 'rect')) {
            const start = startPosRef.current;
            if (start) {
                setTempAnnotation({
                    x: Math.min(start.x, pos.x),
                    y: Math.min(start.y, pos.y),
                    width: Math.abs(pos.x - start.x),
                    height: Math.abs(pos.y - start.y),
                    type: 'poly'
                });
            }
        }
    }, [isDrawing, isPanning, tool, aiBoxMode, getRelativePointerPosition, stageRef, imageLayout, setImageLayout]);

    // --- Mouse Up ---
    const handleMouseUp = useCallback(() => {
        // End panning
        if (isPanning) {
            setIsPanning(false);
            panStartRef.current = null;
            layoutStartRef.current = null;
            return;
        }

        if (!isDrawing) return;

        // Box / AI-Box rect mode
        if (tool === 'box' || (tool === 'ai-box' && aiBoxMode === 'rect')) {
            if (tempAnnotation && tempAnnotation.width > 5 && tempAnnotation.height > 5) {
                const { x, y, width, height } = tempAnnotation;
                const points = [x, y, x + width, y, x + width, y + height, x, y + height];

                onComplete({
                    type: 'poly',
                    points: points,
                    originalRawPoints: points,
                    tool: tool
                });
            }
            setIsDrawing(false);
            setTempAnnotation(null);
            justFinishedDrawingRef.current = true;
        }
        // Pen / Knife / AI-Box lasso
        else if (tool === 'pen' || tool === 'knife' || (tool === 'ai-box' && aiBoxMode === 'lasso')) {
            if (currentPenPoints.length > 6) {
                onComplete({
                    type: 'poly',
                    points: [...currentPenPoints],
                    tool: tool
                });
            }
            setIsDrawing(false);
            setCurrentPenPoints([]);
            justFinishedDrawingRef.current = true;
        }
    }, [isDrawing, isPanning, tool, aiBoxMode, tempAnnotation, currentPenPoints, onComplete]);

    // --- Stage Click (for Poly) ---
    const handleStageClick = useCallback((e) => {
        if (justFinishedDrawingRef.current) {
            justFinishedDrawingRef.current = false;
            return;
        }
        if (tool !== 'poly') return;

        const pos = getRelativePointerPosition();

        // Check closure
        if (currentPolyPoints.length > 2) {
            const firstPoint = currentPolyPoints[0];
            const dist = Math.sqrt(Math.pow(pos.x - firstPoint.x, 2) + Math.pow(pos.y - firstPoint.y, 2));
            if (dist < 10) {
                onComplete({
                    type: 'poly',
                    points: currentPolyPoints.flatMap(p => [p.x, p.y]),
                    tool: 'poly'
                });
                setCurrentPolyPoints([]);
                justFinishedDrawingRef.current = true;
                return;
            }
        }
        setCurrentPolyPoints(prev => [...prev, { x: pos.x, y: pos.y }]);

    }, [tool, currentPolyPoints, getRelativePointerPosition, onComplete]);

    // --- Reset on Tool Change ---
    useEffect(() => {
        setIsDrawing(false);
        setCurrentPolyPoints([]);
        setCurrentPenPoints([]);
        setTempAnnotation(null);
    }, [tool]);

    return {
        isDrawing,
        isPanning,
        currentPolyPoints,
        currentPenPoints,
        tempAnnotation,
        mousePos,
        handlers: {
            onMouseDown: handleMouseDown,
            onMouseMove: handleMouseMove,
            onMouseUp: handleMouseUp,
            onClick: handleStageClick
        }
    };
};
