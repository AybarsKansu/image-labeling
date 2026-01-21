import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
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
import { FloatingPanel, PropertiesPanel } from './components/Panels';
import { SettingsModal, ModelManagerModal, PreprocessingModal, TrainPanel } from './components/Modals';

// Config
import { API_URL } from './constants/config';

function App() {
  // ============================================
  // CUSTOM HOOKS
  // ============================================

  // Stage system (zoom, pan, image)
  const stage = useStageSystem();

  // Annotations (shapes, selection, history)
  const annotationsHook = useAnnotations();

  // AI Models (model selection, training)
  const aiModels = useAIModels('yolov8m-seg.pt');

  // Draw tools (pen, box, knife, eraser, etc.)
  const drawTools = useDrawTools(stage, annotationsHook);

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
  // EVENT HANDLERS
  // ============================================

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
        } else if (annotationsHook.selectedIndex !== null) {
          annotationsHook.clearSelection();
        } else if (drawTools.tool !== 'select') {
          drawTools.setTool('select');
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

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (annotationsHook.selectedIndex !== null) {
          annotationsHook.deleteSelected();
        }
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
        aiBoxMode={drawTools.aiBoxMode}
        setAiBoxMode={drawTools.setAiBoxMode}
        eraserSize={drawTools.eraserSize}
        setEraserSize={drawTools.setEraserSize}
        confidenceThreshold={drawTools.confidenceThreshold}
        setConfidenceThreshold={drawTools.setConfidenceThreshold}
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
        selectedIndex={annotationsHook.selectedIndex}
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
