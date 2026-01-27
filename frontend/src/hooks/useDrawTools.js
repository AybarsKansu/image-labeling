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
export const useDrawTools = (stageHook, annotationsHook, textPrompt, selectedModel, currentParams) => {
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
    const [color, setColor] = useState('#205a09ff');
    const [eraserSize, setEraserSize] = useState(ERASER_RADIUS);

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

    // --- Undo Last Polygon Point (CVAT-style) ---
    const undoLastPolyPoint = useCallback(() => {
        if (currentPolyPoints.length > 0) {
            setCurrentPolyPoints(prev => prev.slice(0, -1));
        }
    }, [currentPolyPoints.length]);

    // --- Close Polygon (CVAT-style) ---
    const closePolygon = useCallback(() => {
        if (currentPolyPoints.length >= 3) {
            const newAnn = {
                id: generateId(),
                type: 'poly',
                points: currentPolyPoints.flatMap(p => [p.x, p.y]),
                label: 'unknown',
                originalRawPoints: currentPolyPoints.flatMap(p => [p.x, p.y])
            };
            const newId = addAnnotation(newAnn);
            setCurrentPolyPoints([]);
            selectAnnotation(newId);
            justFinishedDrawingRef.current = true;
            setTool('select');
        }
    }, [currentPolyPoints, addAnnotation, selectAnnotation]);


    // --- Change Tool (with reset) ---
    const changeTool = useCallback((newTool) => {
        resetToolState();
        setTool(newTool);
    }, [resetToolState]);

    // --- Mouse Down Handler ---
    const handleMouseDown = useCallback((e) => {
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
            startPosRef.current = stageRef.current.getPointerPosition();
            setIsDrawing(true);
            stageRef.current.container().style.cursor = 'grabbing';
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
        // Panning (Tool OR Right-Click OR Select-Drag)
        if ((isDrawing && (tool === 'pan' || tool === 'select')) || isRightPanningRef.current) {
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

        // Pen, AI Lasso (Removed), Knife
        if (tool === 'pen' || tool === 'knife') {
            const lastX = currentPenPoints[currentPenPoints.length - 2];
            const lastY = currentPenPoints[currentPenPoints.length - 1];
            const dist = Math.sqrt(Math.pow(pos.x - lastX, 2) + Math.pow(pos.y - lastY, 2));

            if (dist > 5) {
                setCurrentPenPoints(prev => [...prev, pos.x, pos.y]);
            }
            return;
        }

        if ((tool === 'box' || tool === 'ai-box') && tempAnnotation) {
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
    }, [isDrawing, tool, stageRef, panImage, getRelativePointerPosition, eraserSize, imageLayout.scale, annotations, setAnnotations, currentPenPoints, tempAnnotation]);

    // --- Mouse Up Handler ---
    const handleMouseUp = useCallback(async () => {
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

        if (tool === 'select') {
            stageRef.current.container().style.cursor = 'default';
            return;
        }

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
                const newId = addAnnotation(newAnn);
                selectAnnotation(newId);
                justFinishedDrawingRef.current = true;
            }
            setCurrentPenPoints([]);
            return;
        }

        // AI Lasso (Removed)


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
                const newId = addAnnotation(rect);
                selectAnnotation(newId);
                justFinishedDrawingRef.current = true;
            }
            setTempAnnotation(null);
            return;
        }

        // AI Box Tool
        if (tool === 'ai-box') {
            if (!tempAnnotation || tempAnnotation.width < 5 || tempAnnotation.height < 5) {
                setTempAnnotation(null);
                return;
            }

            if (!imageFile) {
                alert('No image file!');
                setTempAnnotation(null);
                return;
            }

            if (!selectedModel) {
                alert('Please select an AI model to use the AI Box tool.');
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

                // Use dynamic params or defaults
                const conf = currentParams?.conf ?? 0.25;
                formData.append('confidence', conf);

                if (currentParams?.box_padding !== undefined) {
                    formData.append('box_padding', currentParams.box_padding);
                }

                if (currentParams?.use_sam_hq !== undefined) {
                    formData.append('use_hq', currentParams.use_sam_hq);
                }

                if (textPrompt) {
                    formData.append('text_prompt', textPrompt);
                }

                if (currentParams?.enable_yolo_verification !== undefined) {
                    formData.append('enable_yolo_verification', currentParams.enable_yolo_verification);
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
                    const newIds = addAnnotations(newAnns);
                    // Select all new annotations (optional, logic might vary, select last or all)
                    // For now, select the last one or clear selection
                    if (newIds.length > 0) selectAnnotation(newIds[newIds.length - 1]);
                    justFinishedDrawingRef.current = true;
                } else {
                    alert('No objects found in box.');
                }
            } catch (err) {
                console.error('AI Box Failed', err);
            } finally {
                setIsProcessing(false);
                setTempAnnotation(null);
            }
        }
    }, [isDrawing, tool, stageRef, currentPenPoints, tempAnnotation, filterText, color, imageFile, textPrompt, annotations, addAnnotation, addAnnotations, selectAnnotation, spliceAndInsert, selectedModel, currentParams]);

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
                    const newId = addAnnotation(newAnn);
                    setCurrentPolyPoints([]);
                    selectAnnotation(newId);
                    justFinishedDrawingRef.current = true;
                    return;
                }
            }
            setCurrentPolyPoints(prev => [...prev, { x: pos.x, y: pos.y }]);
        } else if (tool === 'eraser') {
            clearSelection();
        } else {
            const clickedIndex = getClickedShape(pos);
            const isMultiSelect = e.evt.ctrlKey || e.evt.metaKey;

            if (clickedIndex !== null) {
                const annId = annotations[clickedIndex].id;
                selectAnnotation(annId, isMultiSelect);
            } else {
                if (!isMultiSelect) {
                    clearSelection();
                }
            }
        }
    }, [tool, currentPolyPoints, getRelativePointerPosition, addAnnotation, selectAnnotation, clearSelection, getClickedShape, annotations]);

    // --- Vertex Drag Handler ---
    const handleVertexDrag = useCallback((e, annId, pointIndex) => {
        const newPos = e.target.position();
        setAnnotations(prev => {
            const newAnns = [...prev];
            const idx = newAnns.findIndex(a => a.id === annId);
            if (idx === -1) return prev;

            const ann = { ...newAnns[idx] };
            const newPoints = [...ann.points];
            newPoints[pointIndex] = newPos.x;
            newPoints[pointIndex + 1] = newPos.y;

            ann.points = newPoints;
            newAnns[idx] = ann;
            return newAnns;
        });
    }, [setAnnotations]);

    // --- Detect All Handler ---
    // Conditionally routes to /detect-all (YOLO) or /segment-by-text (SAM/CLIP)
    const handleDetectAll = useCallback(async () => {
        if (!imageFile) {
            alert('Please upload an image first');
            return;
        }

        if (!selectedModel) {
            alert('Please select an AI model first.');
            return;
        }

        // 1. State Analysis
        const promptText = textPrompt ? textPrompt.trim() : "";
        const hasTextPrompt = promptText.length > 0;

        // We infer the model capability from its name (simple but effective)
        // Checks for 'world' (legacy) or 'objv1' (YoloE / Open-Vocab)
        const isWorldModel = selectedModel && (selectedModel.toLowerCase().includes('world') || selectedModel.toLowerCase().includes('objv1'));
        const isSamModel = selectedModel && selectedModel.toLowerCase().includes('sam');
        const supportsText = isWorldModel || isSamModel;

        // 2. Transparency Check
        // If there is text but the selected model is a standard YOLO (does not support text)
        if (hasTextPrompt && !supportsText) {
            const confirmContinue = window.confirm(
                `⚠️ Model Mismatch:\n\n` +
                `You entered a text prompt ("${promptText}"), but the selected model (${selectedModel}) does not support text-based detection.\n\n` +
                `Do you want to ignore the text and continue with standard detection (Detect All)?`
            );

            // If the user clicks "Cancel", stop the process so they can change the model
            if (!confirmContinue) return;
        }

        // If SAM model is selected and there is no text, warn the user (SAM alone cannot do detect-all)
        if (isSamModel && !hasTextPrompt) {
            alert("SAM requires a text prompt for generic detection. Please enter a class name (e.g. 'car', 'person').");
            return;
        }

        if (isWorldModel && !hasTextPrompt) {
            alert("Yolo World requires a text prompt for generic detection. Please enter a class name (e.g. 'car', 'person').");
            return;
        }

        setIsProcessing(true);
        addToHistory(annotations);

        try {
            const formData = new FormData();
            formData.append('file', imageFile);

            // Endpoint and Parameter Decision
            let endpoint = '/detect-all';

            // If there is text AND (the model supports it OR the user accepted to continue but backend will still use text)
            // Logic here: If it is a world model, go to the text endpoint; otherwise go to detect-all.

            if (hasTextPrompt && supportsText) {
                // --- SCENARIO A: Text-Supported Model (World/SAM) ---
                endpoint = '/segment-by-text';
                formData.append('text_prompt', promptText);
                formData.append('sam_model_name', isSamModel ? selectedModel : 'sam2.1_l.pt');

                // Dynamic Params
                formData.append('box_confidence', currentParams?.conf ?? 0.25);
                formData.append('iou_threshold', currentParams?.iou ?? 0.45);
            } else {
                // --- SCENARIO B: Standard Model (YOLOv8-seg, etc.) ---
                endpoint = '/detect-all';
                formData.append('model_name', selectedModel);
                // Dynamic Params
                formData.append('confidence', currentParams?.conf ?? 0.25);
                formData.append('iou', currentParams?.iou ?? 0.45);

                if (currentParams?.retina_masks) {
                    formData.append('retina_masks', true);
                }

                if (currentParams?.max_det !== undefined) {
                    formData.append('max_det', currentParams.max_det);
                }

                if (currentParams?.enable_tiling !== undefined) {
                    formData.append('enable_tiling', currentParams.enable_tiling);
                }
            }

            console.log(`Sending request to ${endpoint} with model ${selectedModel}`);

            const res = await axios.post(`${API_URL}${endpoint}`, formData);

            if (res.data.detections?.length > 0) {
                const newAnns = res.data.detections.map(d => ({
                    id: d.id || crypto.randomUUID(), // Native UUID may be safer than generateId()
                    type: 'poly',
                    points: d.points,
                    label: d.label || (hasTextPrompt && supportsText ? promptText : 'object'),
                    confidence: d.confidence,
                    originalRawPoints: d.points
                }));

                setAnnotations(prev => [...prev, ...newAnns]);
                // Clear filter text so results are visible
                setFilterText('');
                // Optional user feedback
                // setSaveMessage(`✅ Found ${newAnns.length} objects`);
            } else if (res.data.detections?.length === 0) {
                alert("No objects found.");
            }

        } catch (err) {
            console.error('Detection failed', err);
            const errorMsg = err.response?.data?.detail || err.response?.data?.error || err.message;
            alert(`Detection failed: ${errorMsg}`);
        } finally {
            setIsProcessing(false);
        }
    }, [imageFile, textPrompt, annotations, addToHistory, setAnnotations, selectedModel, currentParams]);


    return {
        // Tool State
        tool,
        color,
        eraserSize,

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
        setColor,
        setEraserSize,

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
        undoLastPolyPoint,
        closePolygon,

        // Helpers
        getClickedShape
    };
};

export default useDrawTools;
