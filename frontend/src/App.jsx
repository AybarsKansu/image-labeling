import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as turf from '@turf/turf';
import './App.css';

// Custom Hooks
import { useStageSystem } from './hooks/useStageSystem';
import { useAnnotations } from './hooks/useAnnotations';
import { useDrawTools } from './hooks/useDrawTools';
import { useAIModels } from './hooks/useAIModels';
import { usePolygonModifiers } from './hooks/usePolygonModifiers';

// Components
import { CanvasStage } from './components/Canvas';
import { MainToolbar } from './components/Toolbar';
import { FloatingPanel, PropertiesPanel, FloatingSelectionMenu } from './components/Panels';
import { SettingsModal, ModelManagerModal, PreprocessingModal, TrainPanel } from './components/Modals';

// Config
import { API_URL } from './constants/config';
import { generateId } from './utils/helpers';

function App() {
  // ============================================
  // CUSTOM HOOKS
  // ============================================

  // Stage system (zoom, pan, image)
  const stage = useStageSystem();

  // Annotations (shapes, selection, history)
  const annotationsHook = useAnnotations();

  // Text Prompt State (Managed at App level)
  const [textPrompt, setTextPrompt] = useState('');

  // AI Models (model selection, training)
  const aiModels = useAIModels('yolov11x-seg.pt', textPrompt);

  // Draw tools (pen, box, knife, eraser, etc.)
  const drawTools = useDrawTools(stage, annotationsHook, textPrompt);

  // Polygon modifiers (simplify, densify, beautify)
  const polygonMods = usePolygonModifiers(annotationsHook, stage);

  // ============================================
  // LOCAL STATE (UI-specific)
  // ============================================

  const [saveMessage, setSaveMessage] = useState(null);
  const [enableAugmentation, setEnableAugmentation] = useState(false);
  const [textBoxConf, setTextBoxConf] = useState(25);
  const [textIou, setTextIou] = useState(45);

  // Training form state
  const [trainEpochs, setTrainEpochs] = useState(100);
  const [trainBatchSize, setTrainBatchSize] = useState(16);
  const [trainBaseModel, setTrainBaseModel] = useState('yolov8m-seg.pt');
  const [trainError, setTrainError] = useState('');


  // ============================================
  // HELPER: Selection Menu Position
  // ============================================
  const menuPosition = useMemo(() => {
    if (annotationsHook.selectedIds.length < 2 || !stage.imageObj) return null;

    const selectedAnns = annotationsHook.selectedAnns;
    if (selectedAnns.length < 2) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedAnns.forEach(ann => {
      if (!ann.points) return;
      for (let i = 0; i < ann.points.length; i += 2) {
        const x = ann.points[i];
        const y = ann.points[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    });

    if (!isFinite(minX)) return null;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2; // Position at the top edge of bounding box? Or center? User said center.

    // Convert to screen coordinates
    // screen = (image * scale) + offset
    const screenX = (centerX * stage.imageLayout.scale) + stage.imageLayout.x;
    const screenY = (centerY * stage.imageLayout.scale) + stage.imageLayout.y;

    return { x: screenX, y: screenY };
  }, [annotationsHook.selectedIds, annotationsHook.selectedAnns, stage.imageLayout, stage.imageObj]);


  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Handle Merge
  const handleMerge = useCallback(async (type) => {
    const selectedAnns = annotationsHook.selectedAnns;
    if (selectedAnns.length < 2) return;

    if (type === 'geometric') {
      try {
        const polygons = selectedAnns.map(ann => {
          // Convert flat points to GeoJSON
          const coords = [];
          for (let i = 0; i < ann.points.length; i += 2) {
            coords.push([ann.points[i], ann.points[i + 1]]);
          }
          // Close ring
          if (coords.length > 0) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              coords.push(first);
            }
          }
          return turf.polygon([coords]);
        });

        // Merge iteratively
        let merged = polygons[0];
        for (let i = 1; i < polygons.length; i++) {
          merged = turf.union(merged, polygons[i]);
        }

        if (merged) {
          const newAnns = [];
          const geometry = merged.geometry;

          if (geometry.type === 'Polygon') {
            newAnns.push({
              points: geometry.coordinates[0].flatMap(p => [p[0], p[1]])
            });
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(poly => {
              newAnns.push({
                points: poly[0].flatMap(p => [p[0], p[1]])
              });
            });
          }

          // Create full annotation objects
          const finalAnns = newAnns.map(a => ({
            id: generateId(),
            type: 'poly',
            points: a.points,
            label: selectedAnns[0].label,
            originalRawPoints: a.points
          }));

          // Replace in state
          annotationsHook.deleteSelected();
          annotationsHook.addAnnotations(finalAnns);
        }
      } catch (err) {
        console.error("Merge failed", err);
        alert("Geometric merge failed: " + err.message);
      }
    } else if (type === 'smart') {
      // Smart AI Merge
      drawTools.setIsProcessing(true);
      try {
        // Calculate Super BBox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedAnns.forEach(ann => {
          if (!ann.points) return;
          for (let i = 0; i < ann.points.length; i += 2) {
            minX = Math.min(minX, ann.points[i]);
            maxX = Math.max(maxX, ann.points[i]);
            minY = Math.min(minY, ann.points[i + 1]);
            maxY = Math.max(maxY, ann.points[i + 1]);
          }
        });

        const width = maxX - minX;
        const height = maxY - minY;

        const formData = new FormData();
        formData.append('file', stage.imageFile);
        formData.append('box_json', JSON.stringify([minX, minY, width, height]));
        formData.append('model_name', 'sam2.1_l.pt'); // Explicit requirement
        formData.append('confidence', '0.25'); // Default

        // Use label from first selection as hint if needed? Protocol doesn't specify text prompt for merge.

        const res = await axios.post(`${API_URL}/segment-box`, formData);

        if (res.data.detections && res.data.detections.length > 0) {
          const newAnns = res.data.detections.map(d => ({
            id: d.id || generateId(),
            type: 'poly',
            points: d.points,
            label: selectedAnns[0].label, // Keep original label
            originalRawPoints: d.points
          }));

          annotationsHook.deleteSelected();
          const newIds = annotationsHook.addAnnotations(newAnns);
          // Select the new one(s)
          if (newIds.length > 0) annotationsHook.selectAnnotation(newIds[0]);
        }
      } catch (err) {
        console.error("Smart merge failed", err);
        alert("Smart merge failed.");
      } finally {
        drawTools.setIsProcessing(false);
      }
    }
  }, [annotationsHook, stage.imageFile, drawTools]);


  // Handle image upload
  const handleImageUpload = useCallback((e) => {
    const file = stage.handleImageUpload(e);
    if (file) {
      // Reset annotations when new image is loaded
      annotationsHook.reset();
    }
  }, [stage, annotationsHook]);

  // Handle close image
  const handleCloseImage = useCallback(() => {
    stage.closeImage();
    annotationsHook.reset();
  }, [stage, annotationsHook]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!stage.imageFile || annotationsHook.annotations.length === 0) {
      setSaveMessage('❌ No image or annotations to save!');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', stage.imageFile);
      formData.append('annotations', JSON.stringify(annotationsHook.annotations));
      formData.append('image_name', stage.imageFile.name);
      formData.append('augmentation', String(enableAugmentation));

      const res = await axios.post(`${API_URL}/save`, formData);
      if (res.data.success) {
        setSaveMessage(`✅ ${res.data.message}`);
        annotationsHook.reset();
      }
    } catch (err) {
      console.error('Save failed', err);
      setSaveMessage('❌ Save failed!');
    }
    setTimeout(() => setSaveMessage(null), 5000);
  }, [stage.imageFile, annotationsHook, enableAugmentation]);

  // Handle detect all
  const handleDetectAll = useCallback(() => {
    drawTools.handleDetectAll(aiModels.selectedModel);
  }, [drawTools, aiModels.selectedModel]);

  // Handle mouse events (pass selected model)
  const handleMouseDown = useCallback((e) => {
    drawTools.handleMouseDown(e, aiModels.selectedModel);
  }, [drawTools, aiModels.selectedModel]);

  const handleMouseUp = useCallback(async () => {
    await drawTools.handleMouseUp(aiModels.selectedModel);
  }, [drawTools, aiModels.selectedModel]);

  // Handle double-click (close polygon - CVAT-style)
  // Disabled auto-close on double click to prevent accidental closing when clicking fast
  const handleDoubleClick = useCallback(() => {
    // if (drawTools.tool === 'poly' && drawTools.currentPolyPoints.length >= 3) {
    //   drawTools.closePolygon();
    // }
  }, []);


  // Handle label change
  const handleLabelChange = useCallback((newLabel) => {
    annotationsHook.updateLabel(newLabel);
  }, [annotationsHook]);

  // Handle beautify
  const handleBeautify = useCallback(async () => {
    const result = await polygonMods.handleBeautify(
      aiModels.selectedModel,
      drawTools.setIsProcessing
    );
    if (!result.success && result.error) {
      alert('Beautify failed: ' + result.error);
    }
  }, [polygonMods, aiModels.selectedModel, drawTools.setIsProcessing]);

  // Handle training start
  const handleStartTraining = useCallback(async (config) => {
    // Validate SAM models
    if (config.base_model?.toLowerCase().includes('sam')) {
      setTrainError("SAM is a Foundation Model and cannot be fine-tuned here. Use YOLO for custom objects.");
      return;
    }

    setTrainError('');
    const result = await aiModels.actions.startTraining(config);
    if (!result.success) {
      setTrainError(result.error || 'Failed to start training');
    }
  }, [aiModels.actions]);

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape key handling
      if (e.key === 'Escape') {
        if (drawTools.currentPolyPoints.length > 0) {
          drawTools.setCurrentPolyPoints([]);
        } else if (drawTools.isDrawing) {
          drawTools.resetToolState();
        } else if (annotationsHook.selectedIds.length > 0) {
          annotationsHook.clearSelection();
        } else if (drawTools.tool !== 'select') {
          drawTools.setTool('select');
        }
      }

      // Enter key - close polygon (CVAT-style)
      if (e.key === 'Enter' && drawTools.tool === 'poly' && drawTools.currentPolyPoints.length >= 3) {
        e.preventDefault();
        drawTools.closePolygon();
      }

      // Backspace/Delete - undo last point when drawing polygon, else delete annotation
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // If actively drawing a polygon, undo last point
        if (drawTools.tool === 'poly' && drawTools.currentPolyPoints.length > 0) {
          e.preventDefault();
          drawTools.undoLastPolyPoint();
          return;
        }
        // Otherwise, delete selected annotation
        if (annotationsHook.selectedIds.length > 0) {
          annotationsHook.deleteSelected();
        }
      }

      // Undo (Ctrl+Z)
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        annotationsHook.handleUndo();
      }

      // Redo (Ctrl+Shift+Z or Ctrl+Y)
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        annotationsHook.handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawTools, annotationsHook]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="App">
      {/* Main Toolbar */}
      <MainToolbar
        imageFile={stage.imageFile}
        onImageUpload={handleImageUpload}
        onCloseImage={handleCloseImage}
        tool={drawTools.tool}
        setTool={drawTools.setTool}
        eraserSize={drawTools.eraserSize}
        setEraserSize={drawTools.setEraserSize}
        confidenceThreshold={drawTools.confidenceThreshold}
        setConfidenceThreshold={drawTools.setConfidenceThreshold}

        textPrompt={textPrompt}
        setTextPrompt={setTextPrompt}
        selectedModel={aiModels.selectedModel}
        onOpenModelManager={aiModels.actions.openModelManager}
        onOpenSettings={aiModels.actions.openSettings}
        onOpenTrainModal={aiModels.actions.openTrainModal}
        onDetectAll={handleDetectAll}
        onSave={handleSave}
        onUndo={annotationsHook.handleUndo}
        onRedo={annotationsHook.handleRedo}
        onClearAll={annotationsHook.handleClearAll}
        canUndo={annotationsHook.canUndo}
        canRedo={annotationsHook.canRedo}
        isProcessing={drawTools.isProcessing}
        saveMessage={saveMessage}
      />

      {/* Canvas Stage */}
      <CanvasStage
        stageRef={stage.stageRef}
        groupRef={stage.groupRef}
        stageSize={stage.stageSize}
        imageObj={stage.imageObj}
        imageLayout={stage.imageLayout}
        annotations={annotationsHook.annotations}
        selectedIds={annotationsHook.selectedIds}
        filterText={drawTools.filterText}
        tool={drawTools.tool}
        tempAnnotation={drawTools.tempAnnotation}
        currentPolyPoints={drawTools.currentPolyPoints}
        currentPenPoints={drawTools.currentPenPoints}
        mousePos={drawTools.mousePos}
        eraserSize={drawTools.eraserSize}
        color={drawTools.color}
        onWheel={stage.handleWheel}
        onClick={drawTools.handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={drawTools.handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDoubleClick}
        onVertexDrag={drawTools.handleVertexDrag}
      />

      {/* Floating Panel (Label Statistics) */}
      {stage.imageObj && (
        <FloatingPanel
          annotations={annotationsHook.annotations}
          filterText={drawTools.filterText}
          setFilterText={drawTools.setFilterText}
          onSelectLabel={(label) => drawTools.setFilterText(label)}
        />
      )}

      {/* Floating Selection Menu */}
      {menuPosition && (
        <FloatingSelectionMenu
          position={menuPosition}
          selectedCount={annotationsHook.selectedIds.length}
          onMerge={handleMerge}
        />
      )}

      {/* Properties Panel */}
      <PropertiesPanel
        selectedAnn={annotationsHook.selectedAnn}
        selectedLabel={annotationsHook.selectedLabel}
        onLabelChange={handleLabelChange}
        onDelete={annotationsHook.deleteSelected}
        onSimplify={polygonMods.handleSimplify}
        onDensify={polygonMods.handleDensify}
        onReset={polygonMods.handleReset}
        onBeautify={handleBeautify}
        canModify={polygonMods.canModify}
        canReset={polygonMods.canReset}
        isProcessing={drawTools.isProcessing}
        suggestions={annotationsHook.selectedAnn?.suggestions}
      />

      {/* Modals */}
      <SettingsModal
        isOpen={aiModels.modals.showSettings}
        onClose={aiModels.actions.closeSettings}
        availableModels={aiModels.models}
        selectedModel={aiModels.selectedModel}
        setSelectedModel={aiModels.setSelectedModel}
        enableAugmentation={enableAugmentation}
        setEnableAugmentation={setEnableAugmentation}
        textBoxConf={textBoxConf}
        setTextBoxConf={setTextBoxConf}
        textIou={textIou}
        setTextIou={setTextIou}
      />

      <ModelManagerModal
        isOpen={aiModels.modals.showModelManager}
        onClose={aiModels.actions.closeModelManager}
        activeModel={aiModels.selectedModel}
        onSelectModel={aiModels.setSelectedModel}
      />

      <PreprocessingModal
        isOpen={aiModels.modals.showPreprocessingModal}
        onClose={aiModels.actions.closePreprocessingModal}
        onStartTraining={handleStartTraining}
        isTraining={aiModels.isTraining}
      />

      <TrainPanel
        isOpen={aiModels.modals.showTrainModal}
        onClose={aiModels.actions.closeTrainModal}
        models={aiModels.models}
        selectedBaseModel={trainBaseModel}
        onBaseModelChange={setTrainBaseModel}
        epochs={trainEpochs}
        onEpochsChange={setTrainEpochs}
        batchSize={trainBatchSize}
        onBatchSizeChange={setTrainBatchSize}
        isTraining={aiModels.isTraining}
        trainingProgress={aiModels.trainingProgress}
        trainingMessage={aiModels.trainingMessage}
        onStartTraining={handleStartTraining}
        error={trainError}
      />
    </div>
  );
}

export default App;
