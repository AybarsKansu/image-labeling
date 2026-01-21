import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';

// Hooks
import { useAnnotations } from '../hooks/useAnnotations';
import { useDrawing } from '../hooks/useDrawing';
import { usePanelSystem } from '../hooks/usePanelSystem';
import { useImageLoader } from '../hooks/useImageLoader';
import { useTools } from '../hooks/useTools';
import { useTraining } from '../hooks/useTraining';

// Components
import { Toolbar } from './Toolbar';
import { MainStage } from './Canvas/MainStage';
import { DraggablePanel } from './Panels/DraggablePanel';
import { LabelStats } from './Panels/LabelStats';
import PreprocessingModal from './Modals/PreprocessingModal';
import SettingsModal from './Modals/SettingsModal';

// Constants
import { API_URL, TOOLS } from '../constants/appConstants';

export default function AnnotationApp({ onOpenModelManager, selectedModel }) {
    // --- Hooks ---
    const annotationsHelper = useAnnotations();
    const {
        annotations, setAnnotations,
        selectAnnotation,
        selectedIndex, selectedLabel,
        deleteSelected, updateLabel,
    } = annotationsHelper;

    const tools = useTools();
    const { tool, setTool, settings, updateSetting, aiBoxMode } = tools;

    // Image Loader
    // reset annotations when new image is selected
    const imageLoader = useImageLoader(() => {
        annotationsHelper.setAnnotations([]);
        annotationsHelper.setHistory([]);
        annotationsHelper.setFuture([]);
        annotationsHelper.selectAnnotation(null);
    });
    const { imageObj, imageFile, imageUrl, imageLayout, setImageLayout, stageSize, handleImageUpload } = imageLoader;

    // Training
    const trainingHelper = useTraining();
    const { trainingStatus, setTrainingStatus, showTrainModal, setShowTrainModal, handleCancelTraining } = trainingHelper;

    // Refs
    const stageRef = useRef(null);
    const groupRef = useRef(null);
    const fileInputRef = useRef(null);

    // Drawing Hook
    // We pass onComplete to handle what happens when a shape is finished
    const handleDrawingComplete = (shapeData) => {
        if (shapeData.tool === 'poly' || shapeData.tool === 'pen' || shapeData.tool === 'box') {
            const newAnn = {
                id: crypto.randomUUID(),
                type: 'poly',
                points: shapeData.points,
                label: 'unknown',
                originalRawPoints: shapeData.originalRawPoints || shapeData.points,
                color: tools.color
            };
            annotationsHelper.addAnnotation(newAnn);
        } else if (shapeData.tool === 'ai-box') {
            handleAiBox(shapeData.points, aiBoxMode);
        } else if (shapeData.tool === 'knife') {
            handleKnifeCut(shapeData.points);
        }
    };

    const drawingHelper = useDrawing(
        tool,
        stageRef,
        groupRef,
        handleDrawingComplete,
        imageLoader.imageLayout,
        imageLoader.setImageLayout,
        tools.aiBoxMode
    );

    // Local State for UI
    const [isProcessing, setIsProcessing] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [filterText, setFilterText] = useState('');

    // --- Complex Actions (API Calls) ---

    // AI Box / Lasso Logic
    const handleAiBox = async (points, mode) => {
        if (!imageFile) return;
        setIsProcessing(true);
        try {
            const formData = new FormData();
            formData.append('file', imageFile);

            // Convert points to expected format
            // API expects JSON string of flat array? or specific structure?
            // Original code: 
            // Box: /api/segment-box [x, y, w, h] AND labels/conf
            // Lasso: /api/segment-lasso [x,y,x,y...]

            if (mode === 'rect') {
                // Points from drawing hook for box are [x,y, x+w,y, x+w,y+h, x,y+h]
                // We need x, y, w, h
                const xs = points.filter((_, i) => i % 2 === 0);
                const ys = points.filter((_, i) => i % 2 === 1);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const width = Math.max(...xs) - minX;
                const height = Math.max(...ys) - minY;

                formData.append('box_json', JSON.stringify([minX, minY, width, height]));
                formData.append('text_prompt', settings.textPrompt || '');
                formData.append('confidence', settings.confidenceThreshold / 100);
            } else {
                // Lasso
                formData.append('points_json', JSON.stringify(points));
                formData.append('text_prompt', settings.textPrompt || '');
                formData.append('confidence', settings.confidenceThreshold / 100);
            }
            formData.append('model_name', selectedModel);

            const endpoint = mode === 'rect' ? '/segment-box' : '/segment-lasso';
            const res = await axios.post(`${API_URL}${endpoint}`, formData);

            // Add result
            if (res.data.points) {
                const newAnn = {
                    id: crypto.randomUUID(),
                    type: 'poly',
                    points: res.data.points,
                    label: res.data.label || 'object',
                    originalRawPoints: res.data.points
                };
                annotationsHelper.addAnnotation(newAnn);
            }

        } catch (err) {
            console.error(err);
            alert("AI Box failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKnifeCut = async (cutterPoints) => {
        // Logic for boolean op
        // We need cuttee (selected shape or all?)
        // Original app: Cut selected shape? Or all intersecting? 
        // "Knife tool to cut existing polygons". 
        // Original code: /api/edit-polygon-boolean
        // It sent 'cutter_points' and 'subject_points' (from selectedIndex).

        if (selectedIndex === null) {
            alert("Select a shape to cut first!");
            return;
        }

        const subject = annotations[selectedIndex];
        if (!subject) return;

        setIsProcessing(true);
        try {
            const payload = {
                operation: 'difference', // Knife = difference?
                subject_points: subject.points,
                cutter_points: cutterPoints
            };
            const res = await axios.post(`${API_URL}/edit-polygon-boolean`, payload);

            // Update logic: remove original, add new pieces
            // Annotations helper 'addAnnotation' pushes one. We might get multiple.
            // We need 'replace' or 'update'.
            // Or delete old, add new.

            if (res.data.polygons) {
                // Remove old
                // deleteSelected uses index. 
                // We can use helper's setAnnotations to do it manually
                const newPolys = res.data.polygons.map(p => ({
                    id: crypto.randomUUID(),
                    type: 'poly',
                    points: p,
                    label: subject.label,
                    originalRawPoints: p
                }));

                // Replace logic
                annotationsHelper.setAnnotations(prev => {
                    const copy = [...prev];
                    copy.splice(selectedIndex, 1, ...newPolys);
                    return copy;
                });
                // Add to history done by helper usually but here we bypassed it?
                // AnnotationsHelper specific wrappers should be improved for this 
                // but for now we direct set. 
                // Ideally we call addToHistory manually before set.
                annotationsHelper.addToHistory(annotations);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDetectAll = async () => {
        if (!imageFile) return;
        setIsProcessing(true);
        try {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('conf', settings.confidenceThreshold / 100);
            formData.append('model_name', selectedModel);
            formData.append('text_prompt', settings.textPrompt);
            formData.append('box_conf', settings.textBoxConf / 100);
            formData.append('text_iou', settings.textIou / 100);

            const res = await axios.post(`${API_URL}/detect-all`, formData);

            // Add all detected objects
            const newAnns = (res.data.detections || []).map(pred => ({
                id: crypto.randomUUID(),
                type: 'poly',
                points: pred.points,
                label: pred.label,
                originalRawPoints: pred.points
            }));

            annotationsHelper.addToHistory(annotations);
            annotationsHelper.setAnnotations(prev => [...prev, ...newAnns]);

        } catch (err) {
            console.error(err);
            alert("Detection failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveAnnotation = async () => {
        if (!imageFile) return;
        try {
            const payload = {
                image_filename: imageFile.name,
                annotations: annotations.map(a => ({
                    points: a.points,
                    label: a.label,
                    type: a.type
                })),
                width: imageObj.naturalWidth,
                height: imageObj.naturalHeight
            };
            await axios.post(`${API_URL}/save-annotation`, payload);
            setSaveMessage('✅ Saved!');
        } catch (err) {
            setSaveMessage('❌ Save Failed');
        }
        setTimeout(() => setSaveMessage(null), 3000);
    };

    // --- Vertex Drag ---
    const handleVertexDrag = (e, polyIndex, pointIndex) => {
        const newPos = e.target.position(); // Relative to group
        // We need to update annotation
        // Helper exposes setAnnotations, but optimistically we want detailed update
        // helper.updateAnnotationVertex? Not implemented.
        // Manual update:
        const startAnns = annotationsHelper.annotations; // Reference
        // We should clone
        const newAnns = [...startAnns];
        const ann = { ...newAnns[polyIndex] };
        const newPoints = [...ann.points];
        newPoints[pointIndex] = newPos.x;
        newPoints[pointIndex + 1] = newPos.y;
        ann.points = newPoints;
        newAnns[polyIndex] = ann;
        annotationsHelper.setAnnotations(newAnns);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
            {/* Styles for tooltips etc */}
            <style>{`
                .tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }
                .tooltip-text { visibility: hidden; opacity: 0; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.9); color: #fff; padding: 5px; border-radius: 4px; white-space: nowrap; font-size: 10px; z-index: 1000; margin-top: 5px; transition: opacity 0.2s; pointer-events: none; border: 1px solid #555; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>

            {!imageObj && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                    <h1 style={{ color: '#444', marginBottom: '20px' }}>No Image Loaded</h1>
                    <label style={{ padding: '12px 24px', background: '#0099ff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white' }}>
                        Open Image
                        <input type="file" onChange={handleImageUpload} style={{ display: 'none' }} accept="image/*" />
                    </label>
                </div>
            )}

            {imageObj && (
                <>
                    <Toolbar
                        tools={tools}
                        fileInputRef={fileInputRef}
                        handleImageUpload={handleImageUpload}
                        onOpenModelManager={onOpenModelManager}
                        handleDetectAll={handleDetectAll}
                        handleSaveAnnotation={handleSaveAnnotation}
                        onCloseImage={() => window.location.reload()} // Simple reset
                        isProcessing={isProcessing}
                        imageFile={imageFile}
                        annotationsLength={annotations.length}
                        trainingStatus={trainingStatus}
                        setShowTrainModal={setShowTrainModal}
                        handleCancelTraining={handleCancelTraining}
                        setShowSettings={setShowSettings}
                        selectedModel={selectedModel}
                        handleUndo={annotationsHelper.undo}
                        handleRedo={annotationsHelper.redo}
                        handleClearAll={annotationsHelper.clearAll}
                    />

                    {/* Info Bar for Undo/Redo/Stats (Since I missed them in Toolbar, allow me to add a sub-bar or just float them or add to toolbar later) */}
                    {/* Ideally Toolbar should have them. I will fix Toolbar in next turn or let user know. 
                        Actually I can add a small control bar or just rely on keyboard shortcuts for Undo/Redo?
                        Original had button. I should edit Toolbar.jsx to add them.
                        But for now, I'll proceed with rendering MainStage.
                    */}

                    {saveMessage && (
                        <div style={{ padding: '10px', background: saveMessage.startsWith('✅') ? '#4CAF50' : '#f44336', color: 'white', textAlign: 'center', fontSize: '14px' }}>
                            {saveMessage}
                        </div>
                    )}

                    <div style={{ flex: 1, background: '#1e1e1e', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
                        <MainStage
                            stageRef={stageRef}
                            groupRef={groupRef}
                            stageSize={stageSize}
                            imageObj={imageObj}
                            imageLayout={imageLayout}
                            setImageLayout={setImageLayout}
                            tools={tools}
                            annotationsHelper={annotationsHelper}
                            drawingHelper={drawingHelper}
                            handleVertexDrag={handleVertexDrag}
                            filterText={filterText}
                        />

                        {/* Detected Labels Panel */}
                        <DraggablePanel title="Detected Labels" initialPos={{ x: 20, y: 20 }} initialSize={{ width: 280, height: 200 }}>
                            <LabelStats
                                annotations={annotations}
                                setFilterText={setFilterText}
                                filterText={filterText}
                            />
                        </DraggablePanel>

                        {/* Train Modal */}
                        <PreprocessingModal
                            isOpen={showTrainModal}
                            onClose={() => setShowTrainModal(false)}
                            imageFile={imageFile}
                            annotations={annotations}
                            onStartTraining={(config) => {
                                // Start Training Logic
                                setIsProcessing(true);
                                axios.post(`${API_URL}/train-model`, config)
                                    .then(res => {
                                        setTrainingStatus({ is_training: true, message: 'Starting...' });
                                        // setShowTrainModal(false); // Keep open or close? User preference. 
                                        // Original app modified to not close immediately to show progress.
                                    })
                                    .catch(err => {
                                        console.error(err);
                                        alert("Training failed to start: " + err.message);
                                    })
                                    .finally(() => setIsProcessing(false));
                            }}
                            trainingStatus={trainingStatus} // Pass status
                            onCancel={handleCancelTraining}
                        />

                        <SettingsModal
                            isOpen={showSettings}
                            onClose={() => setShowSettings(false)}
                            settings={settings}
                            onUpdateSettings={updateSetting}
                        />
                    </div>
                </>
            )}
        </div>
    );
}