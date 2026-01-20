import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Group, Text } from 'react-konva';
import useImage from 'use-image';
import axios from 'axios';
import SettingsModal from './SettingsModal';

// --- Config ---
const API_URL = 'http://localhost:8000/api';
const ERASER_RADIUS = 20;

// --- Utils ---
const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

// --- Helper: Distance Point to Segment ---
const distanceToSegment = (p, v, w) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt(Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2));
};

// --- Helper: Bounding Box Intersection ---
const doBoxesIntersect = (box1, box2) => {
    return (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y
    );
};

// --- Helper: Get Poly Bounds ---
const getPolyBounds = (points) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1];
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// --- Helper: Get Line Bounds ---
const getLineBounds = (points) => {
    // Exact same logic as poly bounds
    return getPolyBounds(points);
};

const AnnotationApp = ({ selectedModel, setSelectedModel }) => {
    // --- State: Image & Layout ---
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [imageObj, setImageObj] = useState(null);
    const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight - 100 });
    const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, scale: 1 });

    // --- State: Annotations ---
    const [annotations, setAnnotations] = useState([]);
    const [tempAnnotation, setTempAnnotation] = useState(null); // { x, y, width, height, type... }
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState('');
    const [history, setHistory] = useState([]); // Stores snapshots of annotations "[[ann1, ann2], [ann1]]"
    const [future, setFuture] = useState([]); // Redo stack

    // --- State: Tools ---
    const [tool, setTool] = useState('select'); // select, pan, box, poly, ai-box, pen
    const [aiBoxMode, setAiBoxMode] = useState('rect'); // 'rect' | 'lasso'
    const [color, setColor] = useState('#205a09ff'); // Tool color
    const [eraserSize, setEraserSize] = useState(20); // Eraser Radius

    const [enableAugmentation, setEnableAugmentation] = useState(false); // Augmentation Checkbox

    // --- State: AI Config ---
    // --- State: AI Config ---
    const [availableModels, setAvailableModels] = useState(['yolov8m-seg.pt']);
    // const [selectedModel, setSelectedModel] = useState('yolov8m-seg.pt'); // REMOVED: Managed by App.jsx
    const [confidenceThreshold, setConfidenceThreshold] = useState(50); // 0-100%

    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPolyPoints, setCurrentPolyPoints] = useState([]);
    const [currentPenPoints, setCurrentPenPoints] = useState([]); // [x, y, x, y...]

    // ... (rest of state)


    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [filterText, setFilterText] = useState('');
    const [textPrompt, setTextPrompt] = useState('');
    const [textBoxConf, setTextBoxConf] = useState(25);
    const [textIou, setTextIou] = useState(45);
    const [isProcessing, setIsProcessing] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    const startPosRef = useRef({ x: 0, y: 0 });
    const stageRef = useRef(null);
    const groupRef = useRef(null);
    const fileInputRef = useRef(null);
    // Track if we just finished a drawing action to prevent immediate deselect on click
    const justFinishedDrawingRef = useRef(false);
    const isRightPanningRef = useRef(false);

    // --- Image Fit on Load ---
    useEffect(() => {
        if (imageObj) {
            const stageW = stageSize.width;
            const stageH = stageSize.height;
            const imgW = imageObj.naturalWidth;
            const imgH = imageObj.naturalHeight;

            const scale = Math.min(stageW / imgW, stageH / imgH);

            const xOffset = (stageW - imgW * scale) / 2;
            const yOffset = (stageH - imgH * scale) / 2;

            setImageLayout({
                x: xOffset,
                y: yOffset,
                scale: scale
            });
        }
    }, [imageObj, stageSize]);

    // --- Window Resize ---
    useEffect(() => {
        const handleResize = () => {
            setStageSize({ width: window.innerWidth, height: window.innerHeight - 100 });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Tool Change Reset (Bug 1 Fix) ---
    useEffect(() => {
        setCurrentPolyPoints([]);
        setTempAnnotation(null);
        setCurrentPenPoints([]);
        setIsDrawing(false);
    }, [tool]);

    // --- Keyboard Listeners (Esc) (Bug 1 Fix) ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (tool === 'poly' && currentPolyPoints.length > 0) {
                    setCurrentPolyPoints([]);
                } else if (isDrawing) {
                    setIsDrawing(false);
                    setTempAnnotation(null);
                    setCurrentPenPoints([]);
                } else if (selectedIndex !== null) {
                    setSelectedIndex(null);
                    setSelectedLabel('');
                } else if (tool !== 'select') {
                    setTool('select');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tool, currentPolyPoints.length, selectedIndex, isDrawing]);

    // --- Zoom & Pan Logic (Bug Fix / Feature) ---
    const handleWheel = (e) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        const oldScale = imageLayout.scale;

        const pointer = stage.getPointerPosition();
        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Calculate new position to zoom towards pointer
        const mousePointTo = {
            x: (pointer.x - imageLayout.x) / oldScale,
            y: (pointer.y - imageLayout.y) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };

        setImageLayout({
            scale: newScale,
            x: newPos.x,
            y: newPos.y
        });
    };

    // --- Image Upload ---
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (event) => setImageUrl(event.target.result);
            reader.readAsDataURL(file);
            setAnnotations([]);
            setSelectedIndex(null);
            setCurrentPolyPoints([]);
            setTempAnnotation(null);
            setHistory([]); // Clear history
            // Fix Bug B: Reset input to allow re-selecting same file
            e.target.value = '';
        }
    };

    useEffect(() => {
        if (imageUrl) {
            const img = new window.Image();
            img.src = imageUrl;
            img.onload = () => setImageObj(img);
        }
    }, [imageUrl]);

    // --- Helper: Get Relative Pointer Position with Pan/Zoom ---
    const getRelativePointerPosition = () => {
        if (!groupRef.current) return { x: 0, y: 0 };
        const transform = groupRef.current.getAbsoluteTransform().copy();
        transform.invert();
        const pos = stageRef.current.getPointerPosition();
        return transform.point(pos);
    };

    // --- Point in Polygon Test ---
    const pointInPolygon = (point, polygon) => {
        const x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    // --- Get Clicked Shape ---
    const getClickedShape = (clickPos) => {
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.type === 'poly' && ann.points) {
                const polyPoints = [];
                for (let j = 0; j < ann.points.length; j += 2) {
                    polyPoints.push({ x: ann.points[j], y: ann.points[j + 1] });
                }
                if (pointInPolygon(clickPos, polyPoints)) {
                    return i;
                }
            }
        }
        return null;
    };

    // --- Stage Click Handler ---
    const handleStageClick = (e) => {
        // If we just finished drawing, do NOTHING (don't deselect the new shape)
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
                        id: crypto.randomUUID(),
                        type: 'poly',
                        points: currentPolyPoints.flatMap(p => [p.x, p.y]),
                        label: 'unknown',
                        originalRawPoints: currentPolyPoints.flatMap(p => [p.x, p.y])
                    };
                    addToHistory(annotations);
                    setAnnotations(prev => [...prev, newAnn]);
                    setCurrentPolyPoints([]);
                    setSelectedIndex(annotations.length); // Use current length (it will be index after add)
                    justFinishedDrawingRef.current = true;
                    return;
                }
            }
            setCurrentPolyPoints([...currentPolyPoints, { x: pos.x, y: pos.y }]);
        } else if (tool === 'eraser') {
            // Eraser logic handled in onClick of shapes mostly, but if stage clicked verify nothing happens or deselect
            setSelectedIndex(null);
        } else {
            // Normal selection logic
            const clickedIndex = getClickedShape(pos);
            if (clickedIndex !== null) {
                // Modified: Eraser acts as brush, so specific clicking behavior removed here.
                // Just Select.
                setSelectedIndex(clickedIndex);
                setSelectedLabel(annotations[clickedIndex].label || '');
            } else {
                setSelectedIndex(null);
                setSelectedLabel('');
            }
        }
    };

    // --- Vertex Drag Handler ---
    const handleVertexDrag = (e, polyIndex, pointIndex) => {
        const newPos = e.target.position(); // Relative to group
        const newAnns = [...annotations];
        const ann = { ...newAnns[polyIndex] };
        const newPoints = [...ann.points]; // Clone array

        newPoints[pointIndex] = newPos.x;
        newPoints[pointIndex + 1] = newPos.y;

        ann.points = newPoints;
        newAnns[polyIndex] = ann;
        setAnnotations(newAnns);
    };

    // --- Mouse Down ---
    const handleMouseDown = (e) => {
        // Right Click Pan
        if (e.evt.button === 2) {
            isRightPanningRef.current = true;
            startPosRef.current = stageRef.current.getPointerPosition();
            stageRef.current.container().style.cursor = 'grabbing';
            return;
        }

        const pos = getRelativePointerPosition();

        if (!imageObj) return;

        if (tool === 'eraser') {
            addToHistory(annotations);
            setIsDrawing(true);
            return;
        }

        if (tool === 'select' || tool === 'pan') {
            const clickedIndex = getClickedShape(pos);
            if (clickedIndex !== null && tool !== 'pan') {
                setSelectedIndex(clickedIndex);
            } else {
                setSelectedIndex(null);
            }

            if (tool === 'pan') {
                startPosRef.current = stageRef.current.getPointerPosition(); // Screen coords for panning delta
                setIsDrawing(true); // Reuse isDrawing for pan state
            }
            return;
        }

        if (tool === 'poly') return;

        // Box, AI-box, Pen, Knife
        setIsDrawing(true);
        if (tool === 'pen' || tool === 'knife') {
            setCurrentPenPoints([pos.x, pos.y]);
        } else {
            // Start Box / AI Box with temp annotation
            startPosRef.current = pos;
            setTempAnnotation({
                x: pos.x,
                y: pos.y,
                width: 0,
                height: 0,
                type: 'poly', // Temp as rect
            });
        }
    };

    // --- Helper: Add to History ---
    // --- Helper: Add to History ---
    const addToHistory = (currentAnns) => {
        // Deep copy to ensure no reference issues
        const snapshot = JSON.parse(JSON.stringify(currentAnns));
        setHistory(prev => [...prev, snapshot]);
        setFuture([]); // Clear future on new action
    };

    // --- Mouse Move ---
    const handleMouseMove = (e) => {
        // For Panning (Tool OR Right-Click)
        if ((isDrawing && tool === 'pan') || isRightPanningRef.current) {
            const stage = stageRef.current;
            const pointer = stage.getPointerPosition();
            const start = startPosRef.current;
            const dx = pointer.x - start.x;
            const dy = pointer.y - start.y;

            setImageLayout(prev => ({
                ...prev,
                x: prev.x + dx,
                y: prev.y + dy
            }));
            startPosRef.current = pointer;
            return;
        }

        const pos = getRelativePointerPosition();
        setMousePos(pos);

        // Eraser Logic
        if (isDrawing && tool === 'eraser') {
            const radius = eraserSize / imageLayout.scale;
            const rSq = radius * radius;

            // Optimization: Only update if anything changed
            let anyChange = false;

            const newAnns = annotations.map(ann => {
                if (ann.type !== 'poly' || !ann.points) return ann;

                // Check bounds first to avoid checking all points if too far? 
                // (Optional optimization, but let's stick to simple first)

                const newPoints = [];
                let shapeChanged = false;

                for (let i = 0; i < ann.points.length; i += 2) {
                    const px = ann.points[i];
                    const py = ann.points[i + 1];
                    const pNextX = ann.points[(i + 2) % ann.points.length];
                    const pNextY = ann.points[(i + 3) % ann.points.length];

                    // Check Distance to Vertex
                    /*
                    const dSq = Math.pow(px - pos.x, 2) + Math.pow(py - pos.y, 2);
                    if (dSq > rSq) {
                        newPoints.push(px, py);
                    } else {
                        shapeChanged = true;
                    }
                    */

                    // Check Distance to Edge (Segment P_curr -> P_next)
                    // If close to edge, delete BOTH vertices of that edge? 
                    // Or keep checking vertices? 
                    // User Request: "Check distance to Line Segments... If distance < eraserSize: Mark BOTH P1 and P2 for deletion."

                    // But we iterate vertices. Let's do a pass to mark vertices first.
                }

                // New Logic:
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
                        // Mark both for deletion
                        toRemove.add(i);
                        toRemove.add(nextI);
                        shapeChanged = true;
                    }
                }

                if (shapeChanged) {
                    for (let i = 0; i < count; i++) {
                        if (!toRemove.has(i)) {
                            newPoints.push(ann.points[i * 2], ann.points[i * 2 + 1]);
                        }
                    }

                    anyChange = true;
                    return { ...ann, points: newPoints };
                }

                if (shapeChanged) {
                    anyChange = true;
                    return { ...ann, points: newPoints };
                }
                return ann;
            }).filter(ann => {
                // If polygon has fewer than 3 points (6 coords), remove it
                if (ann.type === 'poly' && ann.points && ann.points.length < 6) {
                    anyChange = true; // Mark as changed because we are removing a shape
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

        if (tool === 'pen' || (tool === 'ai-box' && aiBoxMode === 'lasso') || tool === 'knife') {
            // Optimization: Only add if distance > 5px (or 2px for smoother)
            const lastX = currentPenPoints[currentPenPoints.length - 2];
            const lastY = currentPenPoints[currentPenPoints.length - 1];
            const dist = Math.sqrt(Math.pow(pos.x - lastX, 2) + Math.pow(pos.y - lastY, 2));

            if (dist > 5) { // 5px threshold for smoother drawing (Smart Extend Request)
                setCurrentPenPoints([...currentPenPoints, pos.x, pos.y]);
            }
            return;
        }

        if ((tool === 'box' || (tool === 'ai-box' && aiBoxMode === 'rect')) && tempAnnotation) {
            const sx = startPosRef.current.x;
            const sy = startPosRef.current.y;

            setTempAnnotation({
                x: Math.min(sx, pos.x),
                y: Math.min(sy, pos.y),
                width: Math.abs(pos.x - sx),
                height: Math.abs(pos.y - sy),
                type: 'poly' // Render as rect, but keep structure
            });
        }
    };

    // --- Mouse Up ---
    const handleMouseUp = async () => {
        if (isRightPanningRef.current) {
            isRightPanningRef.current = false;
            stageRef.current.container().style.cursor = tool === 'pan' ? 'grab' : (tool === 'eraser' ? 'crosshair' : 'default');
            return;
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        if (tool === 'pan') return;
        if (tool === 'eraser') return;

        if (tool === 'pen') {
            if (currentPenPoints.length > 4) {
                const newAnn = {
                    id: crypto.randomUUID(),
                    type: 'poly',
                    points: currentPenPoints,
                    label: filterText || 'unknown',
                    color: color,
                    originalRawPoints: [...currentPenPoints]
                };
                addToHistory(annotations);
                setAnnotations(prev => [...prev, newAnn]);
                setSelectedIndex(annotations.length);
            }
            setCurrentPenPoints([]);
            return;
        }

        // AI Lasso Finish
        if (tool === 'ai-box' && aiBoxMode === 'lasso') {
            if (currentPenPoints.length > 6) { // Need valid polygon
                const formData = new FormData();
                formData.append('file', imageFile);
                formData.append('points_json', JSON.stringify(currentPenPoints));
                formData.append('model_name', selectedModel);
                formData.append('confidence', (confidenceThreshold / 100).toFixed(2));

                try {
                    const res = await axios.post(`${API_URL}/segment-lasso`, formData);
                    if (res.data.detections && res.data.detections.length > 0) {
                        const newAnns = res.data.detections.map(d => ({
                            id: d.id || crypto.randomUUID(),
                            type: 'poly',
                            points: d.points,
                            label: d.label || 'object',
                            suggestions: res.data.suggestions || [],
                            originalRawPoints: d.points
                        }));
                        addToHistory(annotations);
                        setAnnotations(prev => {
                            const nextAnns = [...prev, ...newAnns];
                            setSelectedIndex(nextAnns.length - 1);
                            return nextAnns;
                        });
                        justFinishedDrawingRef.current = true;
                    } else {
                        console.warn("AI Lasso found no objects");
                    }
                } catch (err) {
                    console.error("AI Lasso Failed", err);
                }
            }
            setCurrentPenPoints([]);
            return;
        }

        if (tool === 'knife') {
            if (currentPenPoints.length > 4) { // En az 2 nokta (4 koordinat)

                // 1. Hedef Bulma (Line Intersection)
                // Çizilen çizginin bounding box'ı hangi poligonlara değiyor?
                const lineBounds = getLineBounds(currentPenPoints); // Bunu önceki cevaptaki helper ile yapın

                // En üstteki katmandan (son eklenenden) başlayarak ara
                let targetIndex = null;
                for (let i = annotations.length - 1; i >= 0; i--) {
                    const ann = annotations[i];
                    if (ann.type !== 'poly') continue;

                    // Basit kutu çarpışma testi
                    const polyBounds = getPolyBounds(ann.points);
                    if (doBoxesIntersect(lineBounds, polyBounds)) {
                        targetIndex = i;
                        break; // İlk bulduğunu kes
                    }
                }

                if (targetIndex !== null) {
                    const targetAnn = annotations[targetIndex];

                    setIsProcessing(true); // Spinner göster
                    // Tarihçeye ekle
                    addToHistory(annotations);

                    const formData = new FormData();
                    formData.append('target_points', JSON.stringify(targetAnn.points));
                    formData.append('cutter_points', JSON.stringify(currentPenPoints));
                    formData.append('operation', 'subtract');

                    axios.post(`${API_URL}/edit-polygon-boolean`, formData)
                        .then(res => {
                            if (res.data.polygons && res.data.polygons.length > 0) {
                                const newAnns = [...annotations];
                                // Hedef poligonu sil
                                newAnns.splice(targetIndex, 1);

                                // Yeni parçaları ekle
                                res.data.polygons.forEach(pts => {
                                    newAnns.push({
                                        id: crypto.randomUUID(),
                                        type: 'poly',
                                        points: pts,
                                        label: targetAnn.label, // Etiketi koru (örn: plane)
                                        originalRawPoints: pts
                                    });
                                });
                                setAnnotations(newAnns);
                                setSelectedIndex(null);
                            }
                        })
                        .catch(err => console.error("Knife error", err))
                        .finally(() => {
                            setIsProcessing(false); // Spinner gizle
                            setCurrentPenPoints([]); // Çizgiyi temizle
                        });

                    return; // Async işlem bitene kadar bekle
                }
            }
            setCurrentPenPoints([]); // Hedef yoksa çizgiyi sil
        }

        if (tool === 'box') {
            if (tempAnnotation && tempAnnotation.width > 5 && tempAnnotation.height > 5) {
                const rect = {
                    id: crypto.randomUUID(),
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
                addToHistory(annotations);
                setAnnotations(prev => [...prev, rect]);
                setSelectedIndex(annotations.length); // Select new
                justFinishedDrawingRef.current = true;
            }
            setTempAnnotation(null);

        } else if (tool === 'ai-box') {
            if (!tempAnnotation || tempAnnotation.width < 5 || tempAnnotation.height < 5) {
                setTempAnnotation(null);
                return;
            }

            if (!imageFile) {
                alert('No image file!');
                setTempAnnotation(null);
                return;
            }

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

                if (res.data.detections && res.data.detections.length > 0) {
                    const newAnns = res.data.detections.map(d => ({
                        id: d.id || crypto.randomUUID(),
                        type: d.type || 'poly',
                        points: d.points,
                        label: d.label || 'object',
                        suggestions: res.data.suggestions || [], // Store suggestions
                        originalRawPoints: d.points
                    }));

                    addToHistory(annotations);
                    setAnnotations(prev => {
                        const nextAnns = [...prev, ...newAnns];
                        // Select the last added annotation
                        setSelectedIndex(nextAnns.length - 1);
                        return nextAnns;
                    });

                    justFinishedDrawingRef.current = true;
                } else {
                    console.warn("AI Box found no objects");
                    if (res.data.error) {
                        alert(`AI Validation Failed: ${res.data.error}`);
                    } else {
                        setSaveMessage('⚠️ No objects found in box.');
                        setTimeout(() => setSaveMessage(null), 3000);
                    }
                }
            } catch (err) {
                console.error('AI Box failed', err);
                if (err.response && err.response.data && err.response.data.error) {
                    alert(`AI Validation Failed: ${err.response.data.error}`);
                } else {
                    alert('AI Detection Failed');
                }
            } finally {
                setTempAnnotation(null);
            }
        }
    };

    // --- Actions ---
    const handleDetectAll = async () => {
        if (!imageFile) {
            alert('Please upload an image first!');
            return;
        }

        setIsProcessing(true);
        const formData = new FormData();
        formData.append('file', imageFile);

        // Smart Logic: Text Prompt vs Generic
        let endpoint = '/detect-all';
        if (textPrompt && textPrompt.trim().length > 0) {
            endpoint = '/segment-by-text';
            formData.append('text_prompt', textPrompt);
            formData.append('sam_model_name', selectedModel.includes('sam') ? selectedModel : 'sam2.1_l.pt');
            formData.append('box_confidence', (textBoxConf / 100).toFixed(2));
            formData.append('iou_threshold', (textIou / 100).toFixed(2));
        } else {
            // Standard Detect (YOLO)
            formData.append('model_name', selectedModel);
            formData.append('confidence', (confidenceThreshold / 100).toFixed(2));
        }

        try {
            const res = await axios.post(`${API_URL}${endpoint}`, formData);
            if (res.data.detections) {
                const newAnns = res.data.detections.map(d => ({
                    id: d.id || crypto.randomUUID(),
                    type: d.type || 'poly',
                    points: d.points,
                    label: d.label || 'object',
                    originalRawPoints: d.points
                }));
                addToHistory(annotations);
                setAnnotations(prev => [...prev, ...newAnns]);

                const count = newAnns.length;
                console.log(`${count} objects detected via ${endpoint}`);
                setSaveMessage(count > 0 ? `✅ Found ${count} objects` : '⚠️ No objects found');
            } else if (res.data.error) {
                alert(`Error: ${res.data.error}`);
            }
        } catch (err) {
            console.error('Detection failed', err);
            alert('Detection failed');
        } finally {
            setIsProcessing(false);
            setTimeout(() => setSaveMessage(null), 3000);
        }
    };

    const handleSaveAnnotation = async () => {
        if (!imageFile) {
            setSaveMessage('❌ Please upload an image first!');
            setTimeout(() => setSaveMessage(null), 3000);
            return;
        }

        if (annotations.length === 0) {
            setSaveMessage('❌ Please create at least one annotation!');
            setTimeout(() => setSaveMessage(null), 3000);
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('annotations', JSON.stringify(annotations));
            formData.append('image_name', imageFile.name);
            formData.append('augmentation', String(enableAugmentation)); // Boolean as string

            const res = await axios.post(`${API_URL}/save`, formData);
            if (res.data.success) {
                setSaveMessage(`✅ ${res.data.message}`);
                setAnnotations([]);
                setSelectedIndex(null);
                setTempAnnotation(null);
                console.log('Annotations saved:', res.data);
            }
        } catch (err) {
            console.error('Save failed', err);
            setSaveMessage('❌ Save failed!');
        }
        setTimeout(() => setSaveMessage(null), 5000);
    };

    const handleUndo = () => {
        if (history.length > 0) {
            const previousState = history[history.length - 1];
            setFuture(prev => [...prev, annotations]); // Save current to future
            setAnnotations(previousState);
            setHistory(prev => prev.slice(0, -1));
            setSelectedIndex(null);
        }
    };

    const handleRedo = () => {
        if (future.length > 0) {
            const nextState = future[future.length - 1];
            // Do NOT call addToHistory here loop logic issues
            // Manually update history
            setHistory(prev => [...prev, annotations]);

            setAnnotations(nextState);
            setFuture(prev => prev.slice(0, -1));
            setSelectedIndex(null);
        }
    };

    const handleClearAll = () => {
        if (confirm('Delete all annotations?')) {
            addToHistory(annotations);
            setAnnotations([]);
            setSelectedIndex(null);
            setCurrentPolyPoints([]);
            setTempAnnotation(null);
        }
    };

    // --- UI Helpers ---
    const updateLabel = (newLabel) => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            const updated = [...annotations];
            updated[selectedIndex].label = newLabel;
            setAnnotations(updated);
            setSelectedLabel(newLabel);
        }
    };

    const deleteSelected = () => {
        if (selectedIndex !== null) {
            addToHistory(annotations);
            setAnnotations(annotations.filter((_, i) => i !== selectedIndex));
            setSelectedIndex(null);
            setSelectedLabel('');
        }
    };

    const selectedAnn = selectedIndex !== null ? annotations[selectedIndex] : null;


    // --- Fetch Models ---
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await axios.get(`${API_URL}/models`);
                if (res.data.models) {
                    setAvailableModels(res.data.models);
                    // Set default if current selection not in list (optional)
                }
            } catch (err) {
                console.error("Failed to fetch models", err);
            }
        };
        fetchModels();
    }, []);

    // --- Helper: Simplify Points (Ramer-Douglas-Peucker) ---
    const getSqDist = (p1, p2) => {
        return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    };

    const getSqSegDist = (p, p1, p2) => {
        let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
        if (dx !== 0 || dy !== 0) {
            const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2.x; y = p2.y;
            } else if (t > 0) {
                x += dx * t; y += dy * t;
            }
        }
        dx = p.x - x; dy = p.y - y;
        return dx * dx + dy * dy;
    };

    const simplifyPoints = (points, tolerance) => {
        if (points.length <= 2) return points;
        const sqTolerance = tolerance * tolerance;

        // Convert flat array to objects if needed, but here we expect flat [x,y,x,y]?
        // Our points state is flat array [x,y, x,y]. Convert to objects first.
        const ptsObj = [];
        for (let i = 0; i < points.length; i += 2) ptsObj.push({ x: points[i], y: points[i + 1] });

        const simplifyDP = (points) => {
            const len = points.length;
            let maxSqDist = 0;
            let index = 0;

            for (let i = 1; i < len - 1; i++) {
                const sqDist = getSqSegDist(points[i], points[0], points[len - 1]);
                if (sqDist > maxSqDist) {
                    index = i;
                    maxSqDist = sqDist;
                }
            }

            if (maxSqDist > sqTolerance) {
                const left = simplifyDP(points.slice(0, index + 1));
                const right = simplifyDP(points.slice(index));
                return [...left.slice(0, left.length - 1), ...right];
            } else {
                return [points[0], points[len - 1]];
            }
        };

        const simplified = simplifyDP(ptsObj);
        return simplified.flatMap(p => [p.x, p.y]);
    };

    const handleSimplify = () => {
        if (selectedIndex !== null) {
            const ann = annotations[selectedIndex];
            if (ann.type === 'poly' && ann.points.length > 6) {
                // If originalRawPoints missing (legacy), set it to current points (this is the first touch)
                const raw = ann.originalRawPoints || ann.points;

                const newPoints = simplifyPoints(ann.points, 2.0); // Tolerance 2.0

                const newAnns = [...annotations];
                newAnns[selectedIndex] = {
                    ...ann,
                    points: newPoints,
                    originalRawPoints: raw // Ensure preserved or set
                };

                addToHistory(annotations);
                setAnnotations(newAnns);
                console.log(`Simplified from ${ann.points.length} to ${newPoints.length}`);
            }
        }
    };

    const handleDensify = () => {
        if (selectedIndex !== null) {
            const ann = annotations[selectedIndex];
            if (ann.type === 'poly' && ann.points.length >= 4) {
                const pts = ann.points;
                const newPts = [];
                // Pairs: (0,1), (2,3) ...
                // Points structured as [x1, y1, x2, y2, ...]
                const numPoints = pts.length / 2;

                for (let i = 0; i < numPoints; i++) {
                    const currentX = pts[i * 2];
                    const currentY = pts[i * 2 + 1];

                    // Add current point
                    newPts.push(currentX, currentY);

                    // Get next point (wrap around for polygon)
                    const nextIndex = (i + 1) % numPoints;
                    const nextX = pts[nextIndex * 2];
                    const nextY = pts[nextIndex * 2 + 1];

                    // Calculate Midpoint
                    const midX = (currentX + nextX) / 2;
                    const midY = (currentY + nextY) / 2;

                    // Insert Midpoint
                    newPts.push(midX, midY);
                }

                // If originalRawPoints missing, set it now
                const raw = ann.originalRawPoints || ann.points;

                const newAnns = [...annotations];
                newAnns[selectedIndex] = {
                    ...ann,
                    points: newPts,
                    originalRawPoints: raw
                };
                addToHistory(annotations);
                setAnnotations(newAnns);
            }
        }
    };

    const handleReset = () => {
        if (selectedIndex !== null) {
            const ann = annotations[selectedIndex];
            if (ann.originalRawPoints) {
                addToHistory(annotations);
                const newAnns = [...annotations];
                newAnns[selectedIndex] = {
                    ...ann,
                    points: ann.originalRawPoints
                };
                setAnnotations(newAnns);
            }
        }
    };

    const handleBeautify = async () => {
        if (selectedIndex !== null) {
            const ann = annotations[selectedIndex];
            // Allow Beautify for Poly or Box (converted to poly)
            if (ann.type === 'poly' && ann.points && ann.points.length >= 6) {

                setIsProcessing(true);
                try {
                    const formData = new FormData();
                    formData.append('file', imageFile);
                    // Flatten points just in case or ensure logic matches
                    // ann.points is [x,y,x,y]
                    formData.append('points_json', JSON.stringify(ann.points));
                    formData.append('model_name', selectedModel); // Might need a SAM model, backend handles fallback

                    const res = await axios.post(`${API_URL}/refine-polygon`, formData);

                    if (res.data.points) {
                        const newPoints = res.data.points;
                        // Update shape
                        addToHistory(annotations);
                        const newAnns = [...annotations];

                        // If originalRawPoints missing, set it now before overwriting
                        const raw = ann.originalRawPoints || ann.points;

                        newAnns[selectedIndex] = {
                            ...ann,
                            points: newPoints,
                            originalRawPoints: raw // Preserve original
                        };
                        setAnnotations(newAnns);
                        console.log("Beautify success");
                    } else {
                        alert("Beautify could not refine the shape.");
                    }
                } catch (err) {
                    console.error("Beautify failed", err);
                    alert("Beautify failed: " + (err.response?.data?.error || err.message));
                } finally {
                    setIsProcessing(false);
                }
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
            <style>{`
                .tooltip-container:hover .tooltip-text {
                    visibility: visible;
                    opacity: 1;
                }
                .tooltip-text {
                    visibility: hidden;
                    opacity: 0;
                    position: absolute;
                    top: 100%; /* Position below */
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: rgba(0, 0, 0, 0.9);
                    color: #fff;
                    padding: 5px 8px;
                    border-radius: 4px;
                    white-space: nowrap;
                    font-size: 10px;
                    z-index: 1000;
                    margin-top: 5px;
                    transition: opacity 0.2s;
                    pointer-events: none;
                    border: 1px solid #555;
                }
            `}</style>


            {/* Initial Empty State */}
            {!imageObj && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh'
                }}>
                    <h1 style={{ color: '#444', marginBottom: '20px' }}>No Image Loaded</h1>
                    <label style={{
                        padding: '12px 24px',
                        background: '#0099ff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '16px',
                        color: 'white'
                    }}>
                        Open Image
                        <input type="file" onChange={handleImageUpload} style={{ display: 'none' }} accept="image/*" />
                    </label>
                </div>
            )}

            {imageObj && (
                <>
                    {/* TOOLBAR */}
                    <div style={{
                        padding: '10px 15px',
                        background: '#333',
                        color: 'white',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        borderBottom: '1px solid #555'
                    }}>
                        <button
                            onClick={() => {
                                setImageObj(null);
                                setAnnotations([]);
                                setSelectedIndex(null);
                                setTempAnnotation(null);
                                setImageLayout({ x: 0, y: 0, scale: 1 });
                            }}
                            style={{
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            ❌ Close
                        </button>
                        <button
                            onClick={() => fileInputRef.current.click()}
                            style={{
                                background: '#0066cc',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            📂 Open Image
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                            accept="image/*"
                        />

                        <div style={{ width: '1px', height: '24px', background: '#666' }}></div>

                        {/* Color Picker with Label */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                style={{ width: '24px', height: '24px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '9px', color: '#888' }}>Color</span>
                        </div>

                        <div style={{ width: '1px', height: '24px', background: '#444' }}></div>

                        {/* AI Box with Toggle */}
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                            <button
                                onClick={() => setTool('ai-box')}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: tool === 'ai-box' ? '1px solid #0099ff' : '1px solid transparent',
                                    background: tool === 'ai-box' ? 'rgba(0, 153, 255, 0.2)' : 'transparent',
                                    color: tool === 'ai-box' ? '#0099ff' : '#aaa',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                🪄 AI Box
                            </button>
                            {tool === 'ai-box' && (
                                <select
                                    value={aiBoxMode}
                                    onChange={(e) => setAiBoxMode(e.target.value)}
                                    style={{ background: '#222', color: 'white', border: '1px solid #555', fontSize: '10px', height: '100%' }}
                                >
                                    <option value="rect">Rect</option>
                                    <option value="lasso">Lasso</option>
                                </select>
                            )}
                            <div className="tooltip-container" style={{ position: 'relative', cursor: 'help' }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#444', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>?</div>
                                <div style={{ fontSize: '14px' }} className="tooltip-text">
                                    Click then drag for rect.<br />
                                    Select 'Lasso' for freehand.<br />
                                    Uses {selectedModel} for segment.
                                </div>
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '24px', background: '#444' }}></div>

                        {/* Text Prompting */}



                        <div style={{ width: '1px', height: '24px', background: '#444' }}></div>

                        {/* Other Tools are here (Poly, Pen, Box)... */}

                        {/* ... */}

                        {/* UPDATE DETECT BUTTON (Logic for button text) */}
                        {/* I need to actually replace the Detect Button code block further down.
                            This ReplaceContent block is targeting the Text Prompt area AND attempting to do later buttons.
                            Better to split into deleting Segment Button here, and updating Detect Button in next step.
                        */}
                        {/* Deleting Segment Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <input
                                type="text"
                                placeholder="Text Prompt (e.g. bird)"
                                value={textPrompt}
                                onChange={(e) => setTextPrompt(e.target.value)}
                                style={{
                                    background: '#222',
                                    border: '1px solid #555',
                                    color: textPrompt ? '#fff' : '#aaa',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    width: '180px',
                                    borderLeft: textPrompt ? '3px solid #db2777' : '1px solid #555'
                                }}
                            />
                        </div>


                        <div style={{ width: '1px', height: '24px', background: '#444' }}></div>

                        {/* Other Tools */}
                        <button
                            onClick={() => setTool('poly')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: tool === 'poly' ? '1px solid #0099ff' : '1px solid transparent',
                                background: tool === 'poly' ? 'rgba(0, 153, 255, 0.2)' : 'transparent',
                                color: tool === 'poly' ? '#0099ff' : '#aaa',
                                cursor: 'pointer'
                            }}
                        >
                            Polygon
                        </button>

                        <button
                            onClick={() => setTool('pen')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: tool === 'pen' ? '1px solid #0099ff' : '1px solid transparent',
                                background: tool === 'pen' ? 'rgba(0, 153, 255, 0.2)' : 'transparent',
                                color: tool === 'pen' ? '#0099ff' : '#aaa',
                                cursor: 'pointer'
                            }}
                        >
                            ✏️ Pen
                        </button>

                        <button
                            onClick={() => setTool('knife')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: tool === 'knife' ? '1px solid #ff4444' : '1px solid transparent',
                                background: tool === 'knife' ? 'rgba(255, 68, 68, 0.2)' : 'transparent',
                                color: tool === 'knife' ? '#ff4444' : '#aaa',
                                cursor: 'pointer'
                            }}
                            title="Draw a shape to cut existing polygons"
                        >
                            🔪 Knife
                        </button>

                        <button
                            onClick={() => setTool('box')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: tool === 'box' ? '1px solid #0099ff' : '1px solid transparent',
                                background: tool === 'box' ? 'rgba(0, 153, 255, 0.2)' : 'transparent',
                                color: tool === 'box' ? '#0099ff' : '#aaa',
                                cursor: 'pointer'
                            }}
                        >
                            ⬜ Box
                        </button>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                            {/* Eraser Tool */}
                            <button
                                onClick={() => setTool('eraser')}
                                style={{
                                    background: tool === 'select' ? '#4CAF50' : '#555',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 10px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                                title="Eraser: Click on shapes to delete them"
                            >
                                🧹 Erase
                            </button>
                            {tool === 'eraser' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <input
                                        type="range"
                                        min="5"
                                        max="100"
                                        value={eraserSize}
                                        onChange={(e) => setEraserSize(Number(e.target.value))}
                                        style={{ width: '60px', cursor: 'pointer' }}
                                        title={`Eraser Size: ${eraserSize}`}
                                    />
                                </div>
                            )}
                            <button
                                onClick={() => setTool('select')}
                                style={{
                                    background: tool === 'select' ? '#4CAF50' : '#555',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 10px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                👆 Select
                            </button>
                            <button
                                onClick={() => setTool('pan')}
                                style={{
                                    background: tool === 'pan' ? '#4CAF50' : '#555',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 10px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                🖐 Pan
                            </button>

                        </div>

                        {/* Settings Button (Replaces cluttered controls) */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>


                            {/* Label Filter */}
                            <input
                                type="text"
                                placeholder="Filter Labels"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                style={{
                                    background: '#333',
                                    color: 'white',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    padding: '6px',
                                    fontSize: '12px',
                                    width: '100px'
                                }}
                            />

                            {/* Confidence Threshold */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#aaa' }}>
                                <span>Conf:</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={confidenceThreshold}
                                    onChange={(e) => setConfidenceThreshold(e.target.value)}
                                    style={{ width: '60px', cursor: 'pointer' }}
                                    title={`Confidence: ${confidenceThreshold}%`}
                                />
                                <span>{confidenceThreshold}%</span>
                            </div>

                            <div style={{ width: '1px', height: '24px', background: '#666' }}></div>

                            <button
                                onClick={() => setShowSettings(true)}
                                style={{
                                    background: '#4b5563',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontWeight: 'bold'
                                }}
                            >
                                ⚙️ Settings
                            </button>

                            <div style={{ width: '1px', height: '24px', background: '#666' }}></div>

                            <button
                                onClick={handleDetectAll}
                                disabled={isProcessing || !imageFile}
                                style={{
                                    background: isProcessing ? '#999' : (textPrompt ? 'linear-gradient(45deg, #7c3aed, #db2777)' : '#9c27b0'),
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {isProcessing ? '⏳ Detecting...' : (textPrompt ? '🪄 Segment Text' : '👁️ Detect All')}
                            </button>
                            <button
                                onClick={handleSaveAnnotation}
                                disabled={annotations.length === 0}
                                style={{
                                    background: annotations.length > 0 ? '#2196F3' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: annotations.length > 0 ? 'pointer' : 'not-allowed',
                                    fontWeight: 'bold'
                                }}
                            >
                                💾 Save
                            </button>
                            <button
                                onClick={handleUndo}
                                disabled={history.length === 0}
                                style={{
                                    background: history.length > 0 ? '#ff9800' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: annotations.length > 0 ? 'pointer' : 'not-allowed'
                                }}
                            >
                                ↶ Undo
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={future.length === 0}
                                style={{
                                    background: future.length > 0 ? '#ff9800' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: future.length > 0 ? 'pointer' : 'not-allowed'
                                }}
                            >
                                ↷ Redo
                            </button>
                            <button
                                onClick={handleClearAll}
                                disabled={annotations.length === 0}
                                style={{
                                    background: annotations.length > 0 ? '#f44336' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    cursor: annotations.length > 0 ? 'pointer' : 'not-allowed'
                                }}
                            >
                                🗑️ Clear All
                            </button>
                        </div>
                    </div>

                    {/* Save Message */}
                    {saveMessage && (
                        <div style={{
                            padding: '10px',
                            background: saveMessage.startsWith('✅') ? '#4CAF50' : '#f44336',
                            color: 'white',
                            textAlign: 'center',
                            fontSize: '14px'
                        }}>
                            {saveMessage}
                        </div>
                    )}

                    {/* CANVAS AREA */}
                    <div style={{ flex: 1, background: '#1e1e1e', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
                        {!imageObj && (
                            <div style={{
                                textAlign: 'center',
                                color: '#888',
                                pointerEvents: 'none'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>🖼️</div>
                                <h2 style={{ fontSize: '24px', marginBottom: '10px', color: '#ccc' }}>No Image Loaded</h2>
                                <p style={{ fontSize: '14px' }}>Click "Open Image" button to upload an image</p>
                            </div>
                        )}

                        <Stage
                            ref={stageRef}
                            width={stageSize.width}
                            height={stageSize.height}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onClick={handleStageClick}
                            onWheel={handleWheel}
                            onContextMenu={(e) => e.evt.preventDefault()}
                            style={{
                                background: '#000',
                                cursor: tool === 'pan' ? 'grab' : (tool === 'eraser' ? 'crosshair' : (tool === 'knife' ? 'crosshair' : 'default'))
                            }}
                        >
                            <Layer>
                                <Group
                                    ref={groupRef}
                                    x={imageLayout.x}
                                    y={imageLayout.y}
                                    scaleX={imageLayout.scale}
                                    scaleY={imageLayout.scale}
                                >
                                    {imageObj && (
                                        <KonvaImage
                                            image={imageObj}
                                            width={imageObj.naturalWidth}
                                            height={imageObj.naturalHeight}
                                        />
                                    )}

                                    {/* Render Annotations */}
                                    {annotations.map((ann, idx) => {
                                        const color = ann.color || stringToColor(ann.label || 'unknown');
                                        const isSelected = idx === selectedIndex;

                                        if (!ann.points || ann.points.length < 6 || ann.points.some(p => isNaN(p))) return null;

                                        // Label Filter
                                        if (filterText.length > 0 && !ann.label.toLowerCase().includes(filterText.toLowerCase())) {
                                            return null;
                                        }



                                        return (
                                            <React.Fragment key={idx}>
                                                <Line
                                                    points={ann.points}
                                                    closed={true}
                                                    stroke={isSelected ? '#fff' : color}
                                                    strokeWidth={isSelected ? 3 : 2}
                                                    fill={isSelected ? color + '40' : color + '20'}
                                                    onClick={(e) => {
                                                        if (tool === 'eraser') {
                                                            e.cancelBubble = true; // Prevent Stage click
                                                            // Do nothing on click, rely on brush (mousemove)
                                                            // Optionally call erase logic here for single click?
                                                            // For now, let's keep it consistent with "Brush" behavior.
                                                        } else if (tool === 'select') {
                                                            setSelectedIndex(idx);
                                                            setSelectedLabel(ann.label || '');
                                                        }
                                                    }}
                                                />
                                                {isSelected && ann.points && (
                                                    <>
                                                        {Array.from({ length: ann.points.length / 2 }).map((_, i) => (
                                                            <Circle
                                                                key={i}
                                                                x={ann.points[i * 2]}
                                                                y={ann.points[i * 2 + 1]}
                                                                radius={4}
                                                                fill="#fff"
                                                                stroke={color}
                                                                strokeWidth={2}
                                                            />
                                                        ))}
                                                    </>
                                                )}
                                                {ann.label && (
                                                    <Text
                                                        x={ann.points[0] + 5}
                                                        y={ann.points[1] + 5}
                                                        text={ann.label}
                                                        fontSize={12}
                                                        fill="white"
                                                        backgroundColor="rgba(0, 0, 0, 0.7)"
                                                        padding={3}
                                                    />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* Polygon Preview */}
                                    {tool === 'poly' && currentPolyPoints.length > 0 && (
                                        <>
                                            <Line
                                                points={currentPolyPoints.flatMap(p => [p.x, p.y])}
                                                stroke="#ffff00"
                                                strokeWidth={2}
                                                closed={false}
                                                lineCap="round"
                                                lineJoin="round"
                                            />
                                            {/* Rubber Band Line */}
                                            {currentPolyPoints.length > 0 && (
                                                <Line
                                                    points={[
                                                        currentPolyPoints[currentPolyPoints.length - 1].x,
                                                        currentPolyPoints[currentPolyPoints.length - 1].y,
                                                        mousePos.x,
                                                        mousePos.y
                                                    ]}
                                                    stroke="#ffff00"
                                                    strokeWidth={1}
                                                    dash={[5, 5]}
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* Box / AI Box Preview (during drawing) */}
                                    {isDrawing && tempAnnotation && (tool === 'box' || tool === 'ai-box') && (
                                        <Rect
                                            x={tempAnnotation.x}
                                            y={tempAnnotation.y}
                                            width={tempAnnotation.width}
                                            height={tempAnnotation.height}
                                            stroke={tool === 'ai-box' ? '#00e5ff' : '#4ade80'}
                                            strokeWidth={2}
                                            dash={[4, 4]}
                                        />
                                    )}

                                    {/* Eraser Cursor Preview */}
                                    {tool === 'eraser' && (
                                        <Circle
                                            x={mousePos.x}
                                            y={mousePos.y}
                                            radius={eraserSize / imageLayout.scale}
                                            stroke="#f44336"
                                            strokeWidth={1 / imageLayout.scale}
                                            listening={false}
                                        />
                                    )}
                                    {/* Pen / Lasso / Knife Preview (Live) */}
                                    {((tool === 'pen') || (tool === 'ai-box' && aiBoxMode === 'lasso') || tool === 'knife') && currentPenPoints.length > 0 && (
                                        <Line
                                            points={currentPenPoints}
                                            stroke={tool === 'knife' ? '#ff4444' : (tool === 'ai-box' ? '#00e5ff' : color)}
                                            strokeWidth={2}
                                            tension={0.5}
                                            lineCap="round"
                                            dash={(tool === 'ai-box' || tool === 'knife') ? [5, 5] : undefined}
                                            closed={tool === 'knife' ? false : (tool === 'ai-box' ? true : false)}
                                            fill={tool === 'knife' ? undefined : (tool === 'ai-box' ? 'rgba(0, 229, 255, 0.1)' : undefined)}
                                        />
                                    )}

                                    {/* Anchor Points for Selected Polygon */}
                                    {selectedIndex !== null && annotations[selectedIndex] && annotations[selectedIndex].points && (
                                        <>
                                            {(() => {
                                                const ann = annotations[selectedIndex];
                                                const anchors = [];
                                                for (let i = 0; i < ann.points.length; i += 2) {
                                                    const x = ann.points[i];
                                                    const y = ann.points[i + 1];
                                                    anchors.push(
                                                        <Circle
                                                            key={`anchor-${i}`}
                                                            x={x}
                                                            y={y}
                                                            radius={5}
                                                            fill="white"
                                                            stroke="#0099ff"
                                                            strokeWidth={2}
                                                            draggable
                                                            onDragMove={(e) => handleVertexDrag(e, selectedIndex, i)}
                                                            onMouseEnter={(e) => {
                                                                const stage = e.target.getStage();
                                                                stage.container().style.cursor = 'move';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                const stage = e.target.getStage();
                                                                stage.container().style.cursor = 'default';
                                                            }}
                                                        />
                                                    );
                                                }
                                                return anchors;
                                            })()}
                                        </>
                                    )}
                                </Group>
                            </Layer>
                        </Stage>

                        {/* Properties Panel */}
                        {selectedAnn && (
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                width: '280px',
                                background: '#333',
                                border: '1px solid #555',
                                borderRadius: '8px',
                                padding: '15px',
                                color: 'white',
                                zIndex: 100,
                                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                maxHeight: '80vh',
                                overflowY: 'auto'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '12px'
                                }}>
                                    <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        Properties
                                    </h3>
                                    <button
                                        onClick={() => setSelectedIndex(null)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#888',
                                            fontSize: '20px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* AI Controls in Properties (Only relevant if this panel persists, but user asked for Top Right for Model Selector. 
                                    I will add the floating selector *outside* this if it's always visible, or inside if it's dynamic.
                                    The user said "Move Model Selector... to Top Right... It should not be in the main toolbar".
                                    I will add it as a separate absolute div below.
                                */}
                                <div style={{ marginBottom: '12px' }}>

                                    {/* We removed the input from here as now the Top Filter Input acts as... wait, user might still want to Rename.
                                Let's add a Rename input here specifically for the selected item. */}
                                    {/* Suggestions Chips */}
                                    {selectedAnn.suggestions && selectedAnn.suggestions.length > 0 && (
                                        <div style={{ marginBottom: '12px' }}>
                                            <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                                                AI Suggestions:
                                            </label>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {selectedAnn.suggestions.map((sug, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            // Update Label
                                                            updateLabel(sug.label);
                                                            // Clear suggestions after picking one? Or keep them?
                                                            // Let's keep them in case they changed mind, unless user wants clear.
                                                            // User said "Clears the suggestions".
                                                            const updated = [...annotations];
                                                            updated[selectedIndex].suggestions = []; // Clear
                                                            setAnnotations(updated);
                                                        }}
                                                        style={{
                                                            background: '#2c3e50',
                                                            border: '1px solid #34495e',
                                                            color: '#3498db',
                                                            borderRadius: '12px',
                                                            padding: '4px 10px',
                                                            fontSize: '11px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title={`Confidence: ${(sug.score * 100).toFixed(0)}%`}
                                                    >
                                                        <span>{sug.label}</span>
                                                        <span style={{ fontSize: '9px', opacity: 0.7 }}>
                                                            {Math.round(sug.score * 100)}%
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <input
                                        type="text"
                                        placeholder="Rename..."
                                        value={selectedAnn.label || ''}
                                        onChange={(e) => updateLabel(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid #555',
                                            background: '#222',
                                            color: 'white',
                                            fontSize: '12px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                                        Metadata
                                    </label>
                                    <div style={{
                                        background: '#222',
                                        borderRadius: '4px',
                                        padding: '8px',
                                        fontSize: '11px',
                                        color: '#aaa',
                                        fontFamily: 'monospace'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Type:</span>
                                            <span style={{ color: '#0099ff' }}>{selectedAnn.type}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Points:</span>
                                            <span>{selectedAnn.points?.length / 2 || 0}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Simplify / Densify / Beautify / Reset */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '10px' }}>
                                    <button
                                        onClick={handleSimplify}
                                        disabled={!selectedAnn.points || selectedAnn.points.length <= 6}
                                        style={{
                                            padding: '6px',
                                            background: '#2196F3',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                        title="Reduce points (RDP)"
                                    >
                                        Simplify
                                    </button>
                                    <button
                                        onClick={handleDensify}
                                        style={{
                                            padding: '6px',
                                            background: '#9C27B0',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                        title="Add intermediate points"
                                    >
                                        Densify
                                    </button>
                                    <button
                                        onClick={handleBeautify}
                                        disabled={isProcessing}
                                        style={{
                                            padding: '6px',
                                            background: 'linear-gradient(45deg, #FFD700, #FF8C00)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            gridColumn: 'span 2' // Full width
                                        }}
                                        title="Use AI to refine polygon shape (SAM)"
                                    >
                                        {isProcessing ? '✨ Refining...' : '✨ Beautify'}
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        disabled={!selectedAnn.originalRawPoints}
                                        style={{
                                            padding: '6px',
                                            background: '#607D8B',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            gridColumn: 'span 2'
                                        }}
                                        title="Reset to Original"
                                    >
                                        ↺ Reset
                                    </button>
                                </div>


                                <button
                                    onClick={deleteSelected}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        background: '#c00',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    🗑️ Delete
                                </button>
                            </div>
                        )}


                    </div>


                    <SettingsModal
                        isOpen={showSettings}
                        onClose={() => setShowSettings(false)}
                        availableModels={availableModels}
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        confidenceThreshold={confidenceThreshold}
                        setConfidenceThreshold={setConfidenceThreshold}
                        enableAugmentation={enableAugmentation}
                        setEnableAugmentation={setEnableAugmentation}
                        filterText={filterText}
                        setFilterText={setFilterText}
                        textBoxConf={textBoxConf}
                        setTextBoxConf={setTextBoxConf}
                        textIou={textIou}
                        setTextIou={setTextIou}
                    />
                </>
            )}
        </div>
    );
};

export default AnnotationApp;