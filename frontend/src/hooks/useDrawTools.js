import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL, ERASER_RADIUS } from '../constants/config';
import {
    distanceToSegment,
    doBoxesIntersect,
    getPolyBounds,
    getLineBounds,
    pointInPolygon,
    flatToPoints
} from '../utils/geometry';
import { generateId } from '../utils/helpers';

/**
 * useDrawTools Hook
 * Complex drawing/knife/eraser engine with all tool logic
 */
export const useDrawTools = (stageHook, annotationsHook, textPrompt) => {
    const {
        stageRef,
        groupRef,
        getRelativePointerPosition,
        imageLayout,
        panImage,
        imageFile
    } = stageHook;

    const {
        annotations,
        addToHistory,
        setAnnotations,
        addAnnotation,
        addAnnotations,
        spliceAndInsert,
        selectAnnotation,
        clearSelection
    } = annotationsHook;

    // --- Tool State ---
    const [tool, setTool] = useState('select'); // select, pan, box, poly, ai-box, pen, knife, eraser
    const [aiBoxMode, setAiBoxMode] = useState('rect'); // 'rect' | 'lasso'
    const [color, setColor] = useState('#205a09ff');
    const [eraserSize, setEraserSize] = useState(ERASER_RADIUS);
    const [confidenceThreshold, setConfidenceThreshold] = useState(50);
    const [filterText, setFilterText] = useState('');

    // --- Drawing State ---
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPolyPoints, setCurrentPolyPoints] = useState([]);
    const [currentPenPoints, setCurrentPenPoints] = useState([]);
    const [tempAnnotation, setTempAnnotation] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Refs ---
    const startPosRef = useRef({ x: 0, y: 0 });
    const isRightPanningRef = useRef(false);
    const justFinishedDrawingRef = useRef(false);

    // --- Helper: Get Clicked Shape ---
    const getClickedShape = useCallback((clickPos) => {
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.type === 'poly' && ann.points) {
                const polyPoints = flatToPoints(ann.points);
                if (pointInPolygon(clickPos, polyPoints)) {
                    return i;
                }
            }
        }
        return null;
    }, [annotations]);

    // --- Reset Tool State ---
    const resetToolState = useCallback(() => {
        setCurrentPolyPoints([]);
        setCurrentPenPoints([]);
        setTempAnnotation(null);
        setIsDrawing(false);
    }, []);

    // --- Change Tool (with reset) ---
    const changeTool = useCallback((newTool) => {
        resetToolState();
        setTool(newTool);
    }, [resetToolState]);

    // --- Mouse Down Handler ---
    const handleMouseDown = useCallback((e, selectedModel) => {
        // Right Click Pan
        if (e.evt.button === 2) {
            isRightPanningRef.current = true;
            startPosRef.current = stageRef.current.getPointerPosition();
            stageRef.current.container().style.cursor = 'grabbing';
            return;
        }

        const pos = getRelativePointerPosition();

        if (tool === 'eraser') {
            addToHistory(annotations);
            setIsDrawing(true);
            return;
        }

        if (tool === 'select' || tool === 'pan') {
            const clickedIndex = getClickedShape(pos);
            if (clickedIndex !== null && tool !== 'pan') {
                selectAnnotation(clickedIndex);
            } else {
                clearSelection();
            }

            if (tool === 'pan') {
                startPosRef.current = stageRef.current.getPointerPosition();
                setIsDrawing(true);
            }
            return;
        }

        if (tool === 'poly') return;

        // Box, AI-box, Pen, Knife
        setIsDrawing(true);
        if (tool === 'pen' || tool === 'knife') {
            setCurrentPenPoints([pos.x, pos.y]);
        } else {
            startPosRef.current = pos;
            setTempAnnotation({
                x: pos.x,
                y: pos.y,
                width: 0,
                height: 0,
                type: 'poly'
            });
        }
    }, [tool, stageRef, getRelativePointerPosition, annotations, addToHistory, getClickedShape, selectAnnotation, clearSelection]);

    // --- Mouse Move Handler ---
    const handleMouseMove = useCallback((e) => {
        // Panning (Tool OR Right-Click)
        if ((isDrawing && tool === 'pan') || isRightPanningRef.current) {
            const stage = stageRef.current;
            const pointer = stage.getPointerPosition();
            const start = startPosRef.current;
            const dx = pointer.x - start.x;
            const dy = pointer.y - start.y;

            panImage(dx, dy);
            startPosRef.current = pointer;
            return;
        }

        const pos = getRelativePointerPosition();
        setMousePos(pos);

        // Eraser Logic
        if (isDrawing && tool === 'eraser') {
            const radius = eraserSize / imageLayout.scale;
            let anyChange = false;

            const newAnns = annotations.map(ann => {
                if (ann.type !== 'poly' || !ann.points) return ann;

                const toRemove = new Set();
                const count = ann.points.length / 2;

                for (let i = 0; i < count; i++) {
                    const idx1 = i * 2;
                    const idx2 = (i * 2 + 1);
                    const p1 = { x: ann.points[idx1], y: ann.points[idx2] };

                    const nextI = (i + 1) % count;
                    const nextIdx1 = nextI * 2;
                    const nextIdx2 = (nextI * 2 + 1);
                    const p2 = { x: ann.points[nextIdx1], y: ann.points[nextIdx2] };

                    const dist = distanceToSegment(pos, p1, p2);

                    if (dist < radius) {
                        toRemove.add(i);
                        toRemove.add(nextI);
                    }
                }

                if (toRemove.size > 0) {
                    const newPoints = [];
                    for (let i = 0; i < count; i++) {
                        if (!toRemove.has(i)) {
                            newPoints.push(ann.points[i * 2], ann.points[i * 2 + 1]);
                        }
                    }
                    anyChange = true;
                    return { ...ann, points: newPoints };
                }
                return ann;
            }).filter(ann => {
                if (ann.type === 'poly' && ann.points && ann.points.length < 6) {
                    anyChange = true;
                    return false;
                }
                return true;
            });

            if (anyChange) {
                setAnnotations(newAnns);
            }
            return;
        }

        if (!isDrawing) return;

        // Pen, AI Lasso, Knife
        if (tool === 'pen' || (tool === 'ai-box' && aiBoxMode === 'lasso') || tool === 'knife') {
            const lastX = currentPenPoints[currentPenPoints.length - 2];
            const lastY = currentPenPoints[currentPenPoints.length - 1];
            const dist = Math.sqrt(Math.pow(pos.x - lastX, 2) + Math.pow(pos.y - lastY, 2));

            if (dist > 5) {
                setCurrentPenPoints(prev => [...prev, pos.x, pos.y]);
            }
            return;
        }

        // Box, AI Box (rect mode)
        if ((tool === 'box' || (tool === 'ai-box' && aiBoxMode === 'rect')) && tempAnnotation) {
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            setTempAnnotation({
                x: Math.min(sx, pos.x),
                y: Math.min(sy, pos.y),
                width: Math.abs(pos.x - sx),
                height: Math.abs(pos.y - sy),
                type: 'poly'
            });
        }
    }, [isDrawing, tool, aiBoxMode, stageRef, panImage, getRelativePointerPosition, eraserSize, imageLayout.scale, annotations, setAnnotations, currentPenPoints, tempAnnotation]);

    // --- Mouse Up Handler ---
    const handleMouseUp = useCallback(async (selectedModel) => {
        // End Right-Click Pan
        if (isRightPanningRef.current) {
            isRightPanningRef.current = false;
            const cursor = tool === 'pan' ? 'grab' : (tool === 'eraser' ? 'crosshair' : 'default');
            stageRef.current.container().style.cursor = cursor;
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        if (tool === 'pan' || tool === 'eraser') return;

        // Pen Tool
        if (tool === 'pen') {
            if (currentPenPoints.length > 4) {
                const newAnn = {
                    id: generateId(),
                    type: 'poly',
                    points: currentPenPoints,
                    label: filterText || 'unknown',
                    color: color,
                    originalRawPoints: [...currentPenPoints],
                    isPenDrawn: true  // Mark as pen-drawn (no fill, open path)
                };
                const newIndex = addAnnotation(newAnn);
                selectAnnotation(newIndex);
                justFinishedDrawingRef.current = true;
            }
            setCurrentPenPoints([]);
            return;
        }

        // AI Lasso
        if (tool === 'ai-box' && aiBoxMode === 'lasso') {
            if (currentPenPoints.length > 6 && imageFile) {
                setIsProcessing(true);
                try {
                    const formData = new FormData();
                    formData.append('file', imageFile);
                    formData.append('points_json', JSON.stringify(currentPenPoints));
                    formData.append('model_name', selectedModel);
                    formData.append('confidence', (confidenceThreshold / 100).toFixed(2));

                    const res = await axios.post(`${API_URL}/segment-lasso`, formData);

                    if (res.data.detections?.length > 0) {
                        const newAnns = res.data.detections.map(d => ({
                            id: d.id || generateId(),
                            type: 'poly',
                            points: d.points,
                            label: d.label || 'object',
                            suggestions: res.data.suggestions || [],
                            originalRawPoints: d.points
                        }));
                        const lastIndex = addAnnotations(newAnns);
                        selectAnnotation(lastIndex);
                        justFinishedDrawingRef.current = true;
                    }
                } catch (err) {
                    console.error('AI Lasso Failed', err);
                } finally {
                    setIsProcessing(false);
                }
            }
            setCurrentPenPoints([]);
            return;
        }

        // Knife Tool
        if (tool === 'knife') {
            if (currentPenPoints.length > 4) {
                const lineBounds = getLineBounds(currentPenPoints);

                // Find target polygon
                let targetIndex = null;
                for (let i = annotations.length - 1; i >= 0; i--) {
                    const ann = annotations[i];
                    if (ann.type !== 'poly') continue;

                    const polyBounds = getPolyBounds(ann.points);
                    if (doBoxesIntersect(lineBounds, polyBounds)) {
                        targetIndex = i;
                        break;
                    }
                }

                if (targetIndex !== null) {
                    const targetAnn = annotations[targetIndex];
                    setIsProcessing(true);

                    try {
                        const formData = new FormData();
                        formData.append('target_points', JSON.stringify(targetAnn.points));
                        formData.append('cutter_points', JSON.stringify(currentPenPoints));
                        formData.append('operation', 'subtract');

                        const res = await axios.post(`${API_URL}/edit-polygon-boolean`, formData);

                        if (res.data.polygons?.length > 0) {
                            const newAnns = res.data.polygons.map(pts => ({
                                id: generateId(),
                                type: 'poly',
                                points: pts,
                                label: targetAnn.label,
                                originalRawPoints: pts
                            }));
                            spliceAndInsert(targetIndex, newAnns);
                        }
                    } catch (err) {
                        console.error('Knife error', err);
                    } finally {
                        setIsProcessing(false);
                    }
                }
            }
            setCurrentPenPoints([]);
            return;
        }

        // Box Tool
        if (tool === 'box') {
            if (tempAnnotation && tempAnnotation.width > 5 && tempAnnotation.height > 5) {
                const rect = {
                    id: generateId(),
                    type: 'poly',
                    points: [
                        tempAnnotation.x, tempAnnotation.y,
                        tempAnnotation.x + tempAnnotation.width, tempAnnotation.y,
                        tempAnnotation.x + tempAnnotation.width, tempAnnotation.y + tempAnnotation.height,
                        tempAnnotation.x, tempAnnotation.y + tempAnnotation.height
                    ],
                    label: 'unknown',
                    originalRawPoints: [
                        tempAnnotation.x, tempAnnotation.y,
                        tempAnnotation.x + tempAnnotation.width, tempAnnotation.y,
                        tempAnnotation.x + tempAnnotation.width, tempAnnotation.y + tempAnnotation.height,
                        tempAnnotation.x, tempAnnotation.y + tempAnnotation.height
                    ]
                };
                const newIndex = addAnnotation(rect);
                selectAnnotation(newIndex);
                justFinishedDrawingRef.current = true;
            }
            setTempAnnotation(null);
            return;
        }

        // AI Box Tool
        if (tool === 'ai-box' && aiBoxMode === 'rect') {
            if (!tempAnnotation || tempAnnotation.width < 5 || tempAnnotation.height < 5) {
                setTempAnnotation(null);
                return;
            }

            if (!imageFile) {
                alert('No image file!');
                setTempAnnotation(null);
                return;
            }

            setIsProcessing(true);
            try {
                const formData = new FormData();
                formData.append('file', imageFile);
                formData.append('box_json', JSON.stringify([
                    tempAnnotation.x,
                    tempAnnotation.y,
                    tempAnnotation.width,
                    tempAnnotation.height
                ]));
                formData.append('model_name', selectedModel);
                formData.append('confidence', (confidenceThreshold / 100).toFixed(2));
                if (textPrompt) {
                    formData.append('text_prompt', textPrompt);
                }

                const res = await axios.post(`${API_URL}/segment-box`, formData);

                if (res.data.detections?.length > 0) {
                    const newAnns = res.data.detections.map(d => ({
                        id: d.id || generateId(),
                        type: d.type || 'poly',
                        points: d.points,
                        label: d.label || 'object',
                        suggestions: d.suggestions || [],
                        originalRawPoints: d.points
                    }));
                    const lastIndex = addAnnotations(newAnns);
                    selectAnnotation(lastIndex);
                    justFinishedDrawingRef.current = true;
                }
            } catch (err) {
                console.error('AI Box Failed', err);
            } finally {
                setIsProcessing(false);
                setTempAnnotation(null);
            }
        }
    }, [isDrawing, tool, aiBoxMode, stageRef, currentPenPoints, tempAnnotation, filterText, color, imageFile, confidenceThreshold, textPrompt, annotations, addAnnotation, addAnnotations, selectAnnotation, spliceAndInsert]);

    // --- Stage Click Handler (for Polygon tool) ---
    const handleStageClick = useCallback((e) => {
        // Block right-click from placing points (reserved for panning)
        if (e.evt && e.evt.button === 2) {
            return;
        }

        if (justFinishedDrawingRef.current) {
            justFinishedDrawingRef.current = false;
            return;
        }

        const pos = getRelativePointerPosition();

        if (tool === 'poly') {
            if (currentPolyPoints.length > 2) {
                const firstPoint = currentPolyPoints[0];
                const distance = Math.sqrt(
                    Math.pow(pos.x - firstPoint.x, 2) +
                    Math.pow(pos.y - firstPoint.y, 2)
                );
                if (distance < 10) {
                    const newAnn = {
                        id: generateId(),
                        type: 'poly',
                        points: currentPolyPoints.flatMap(p => [p.x, p.y]),
                        label: 'unknown',
                        originalRawPoints: currentPolyPoints.flatMap(p => [p.x, p.y])
                    };
                    const newIndex = addAnnotation(newAnn);
                    setCurrentPolyPoints([]);
                    selectAnnotation(newIndex);
                    justFinishedDrawingRef.current = true;
                    return;
                }
            }
            setCurrentPolyPoints(prev => [...prev, { x: pos.x, y: pos.y }]);
        } else if (tool === 'eraser') {
            clearSelection();
        } else {
            const clickedIndex = getClickedShape(pos);
            if (clickedIndex !== null) {
                selectAnnotation(clickedIndex);
            } else {
                clearSelection();
            }
        }
    }, [tool, currentPolyPoints, getRelativePointerPosition, addAnnotation, selectAnnotation, clearSelection, getClickedShape]);

    // --- Vertex Drag Handler ---
    const handleVertexDrag = useCallback((e, polyIndex, pointIndex) => {
        const newPos = e.target.position();
        const newAnns = [...annotations];
        const ann = { ...newAnns[polyIndex] };
        const newPoints = [...ann.points];

        newPoints[pointIndex] = newPos.x;
        newPoints[pointIndex + 1] = newPos.y;

        ann.points = newPoints;
        newAnns[polyIndex] = ann;
        setAnnotations(newAnns);
    }, [annotations, setAnnotations]);

    // --- Detect All Handler ---
    // Conditionally routes to /detect-all (YOLO) or /segment-by-text (SAM/CLIP)
    const handleDetectAll = useCallback(async (selectedModel) => {
        if (!imageFile) {
            alert('Please upload an image first');
            return;
        }

        const hasTextPrompt = textPrompt && textPrompt.trim().length > 0;
        const isSamModel = selectedModel && selectedModel.toLowerCase().includes('sam');

        // VALIADTION: SAM requires a text prompt for "Detect All"
        if (isSamModel && !hasTextPrompt) {
            alert("SAM requires a text prompt for generic detection. Please enter a class name (e.g. 'car', 'person').");
            return;
        }

        setIsProcessing(true);
        addToHistory(annotations);

        try {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('model_name', selectedModel);
            formData.append('confidence', (confidenceThreshold / 100).toFixed(2));

            // Determine endpoint based on textPrompt
            const endpoint = hasTextPrompt ? '/segment-by-text' : '/detect-all';

            if (hasTextPrompt) {
                formData.append('text_prompt', textPrompt.trim());
            }

            const res = await axios.post(`${API_URL}${endpoint}`, formData);

            if (res.data.detections?.length > 0) {
                const newAnns = res.data.detections.map(d => ({
                    id: d.id || generateId(),
                    type: 'poly',
                    points: d.points,
                    label: d.label || (hasTextPrompt ? textPrompt.trim() : 'object'),
                    originalRawPoints: d.points
                }));
                setAnnotations(prev => [...prev, ...newAnns]);
            }
        } catch (err) {
            console.error('Detect all failed', err);
            alert('Detection failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsProcessing(false);
        }
    }, [imageFile, confidenceThreshold, textPrompt, annotations, addToHistory, setAnnotations]);

    return {
        // Tool State
        tool,
        aiBoxMode,
        color,
        eraserSize,
        confidenceThreshold,
        filterText,

        // Drawing State
        isDrawing,
        currentPolyPoints,
        currentPenPoints,
        tempAnnotation,
        mousePos,
        isProcessing,

        // Refs
        justFinishedDrawingRef,

        // Setters
        setTool: changeTool,
        setAiBoxMode,
        setColor,
        setEraserSize,
        setConfidenceThreshold,
        setFilterText,
        setCurrentPolyPoints,
        setCurrentPenPoints,
        setTempAnnotation,
        setIsProcessing,

        // Handlers
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleStageClick,
        handleVertexDrag,
        handleDetectAll,
        resetToolState,

        // Helpers
        getClickedShape
    };
};

export default useDrawTools;
