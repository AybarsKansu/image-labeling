import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import * as turf from '@turf/turf';
import './App.css';

// Custom Hooks
import { useStageSystem } from './hooks/useStageSystem';
import { useAnnotations } from './hooks/useAnnotations';
import { useDrawTools } from './hooks/useDrawTools';
import { useAIModels } from './hooks/useAIModels';
import { usePolygonModifiers } from './hooks/usePolygonModifiers';
import { useFileSystem } from './hooks/useFileSystem';
import { useBackgroundSync } from './hooks/useBackgroundSync';

// Components
import { CanvasStage } from './components/Canvas';
import { MainToolbar } from './components/Toolbar';
import FloatingPanel from './components/Panels/FloatingPanel';
import PropertiesPanel from './components/Panels/PropertiesPanel';
import FloatingSelectionMenu from './components/Panels/FloatingSelectionMenu';
import ModelParametersPanel from './components/Panels/ModelParametersPanel';
import FileExplorer from './components/Panels/FileExplorer';
import RightSidebar from './components/Panels/RightSidebar';
import DragDropZone from './components/Common/DragDropZone';
import { ModelManagerModal, PreprocessingModal, TrainPanel, ClassImportModal } from './components/Modals';
import EvaluationDashboard from './components/Evaluation/EvaluationDashboard';

// Config
import { API_URL } from './constants/config';
import { generateId } from './utils/helpers';
import { AnnotationConverter } from './utils/annotationConverter';

function App() {
  // ============================================
  // CUSTOM HOOKS
  // ============================================

  const stage = useStageSystem();
  const annotationsHook = useAnnotations();
  const [textPrompt, setTextPrompt] = useState('');
  const aiModels = useAIModels(null, textPrompt);
  const drawTools = useDrawTools(stage, annotationsHook, textPrompt, aiModels.selectedModel, aiModels.currentParams);
  const polygonMods = usePolygonModifiers(annotationsHook, stage);
  const fileSystem = useFileSystem();
  const backgroundSync = useBackgroundSync(fileSystem.activeFileId);

  // ============================================
  // BRIDGE: File System to Canvas
  // ============================================
  const { activeFileData } = fileSystem;
  const { setImageUrl, setImageFile, closeImage } = stage;
  const { setAnnotations, clearSelection, reset: resetAnns } = annotationsHook;

  useEffect(() => {
    if (activeFileData) {
      if (activeFileData.imageUrl) setImageUrl(activeFileData.imageUrl);
      if (activeFileData.blob) setImageFile(activeFileData.blob);
      setAnnotations(activeFileData.annotations || []);
      clearSelection();
    } else {
      closeImage();
      resetAnns();
    }
  }, [activeFileData, setImageUrl, setImageFile, closeImage, setAnnotations, clearSelection, resetAnns]);

  // ============================================
  // LOCAL STATE (UI-specific)
  // ============================================
  const [saveMessage, setSaveMessage] = useState(null);
  const [enableAugmentation, setEnableAugmentation] = useState(false);
  const [trainEpochs, setTrainEpochs] = useState(100);
  const [trainBatchSize, setTrainBatchSize] = useState(16);
  const [trainBaseModel, setTrainBaseModel] = useState('yolov8m-seg.pt');
  const [trainError, setTrainError] = useState('');
  const [showClassImportModal, setShowClassImportModal] = useState(false);
  const [pendingImportText, setPendingImportText] = useState('');
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);

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
        minX = Math.min(minX, ann.points[i]);
        maxX = Math.max(maxX, ann.points[i]);
        minY = Math.min(minY, ann.points[i + 1]);
        maxY = Math.max(maxY, ann.points[i + 1]);
      }
    });

    if (!isFinite(minX)) return null;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const screenX = (centerX * stage.imageLayout.scale) + stage.imageLayout.x;
    const screenY = (centerY * stage.imageLayout.scale) + stage.imageLayout.y;
    return { x: screenX, y: screenY };
  }, [annotationsHook.selectedIds, annotationsHook.selectedAnns, stage.imageLayout, stage.imageObj]);

  // ============================================
  // ACTIONS & EVENT HANDLERS
  // ============================================

  const handleSaveAll = useCallback(async () => {
    try {
      setSaveMessage({ type: 'info', text: 'Preparing training data...' });
      const flushResult = await backgroundSync.flushPending();
      if (!flushResult.success) throw new Error(flushResult.error);

      const formData = new URLSearchParams();
      formData.append('format', 'yolo');
      await axios.post(`${API_URL}/files/export`, formData);

      setSaveMessage({ type: 'success', text: 'All data organized for training!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Save all failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to organize data: ' + err.message });
    }
  }, [backgroundSync]);

  const handleExport = useCallback(async (format) => {
    try {
      setSaveMessage({ type: 'info', text: `Exporting as ${format.toUpperCase()}...` });
      await backgroundSync.flushPending();

      const formData = new URLSearchParams();
      formData.append('format', format);
      const response = await axios.post(`${API_URL}/files/export`, formData);

      if (response.data.download_url) {
        window.open(response.data.download_url, '_blank');
      }
      setSaveMessage({ type: 'success', text: 'Export ready!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Export failed: ' + err.message });
    }
  }, [backgroundSync]);

  const handleMerge = useCallback(async (type) => {
    const selectedAnns = annotationsHook.selectedAnns;
    if (selectedAnns.length < 2) return;

    if (type === 'geometric') {
      try {
        const polygons = selectedAnns.map(ann => {
          const coords = [];
          for (let i = 0; i < ann.points.length; i += 2) coords.push([ann.points[i], ann.points[i + 1]]);
          if (coords.length > 0) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
          }
          return turf.polygon([coords]);
        });
        const merged = turf.union(turf.featureCollection(polygons));
        if (merged) {
          const newAnns = [];
          const geometry = merged.geometry;
          if (geometry.type === 'Polygon') {
            newAnns.push({ points: geometry.coordinates[0].flatMap(p => [p[0], p[1]]) });
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(poly => {
              newAnns.push({ points: poly[0].flatMap(p => [p[0], p[1]]) });
            });
          }
          const finalAnns = newAnns.map(a => ({
            id: generateId(), type: 'poly', points: a.points,
            label: selectedAnns[0].label, originalRawPoints: a.points
          }));
          annotationsHook.deleteSelected();
          annotationsHook.addAnnotations(finalAnns);
        }
      } catch (err) { alert("Merge failed: " + err.message); }
    }
  }, [annotationsHook]);

  const handleImageUpload = useCallback((e) => {
    const file = stage.handleImageUpload(e);
    if (file) annotationsHook.reset();
  }, [stage, annotationsHook]);

  const handleLabelChange = useCallback((newLabel) => {
    annotationsHook.updateLabel(newLabel);
  }, [annotationsHook]);

  const handleBeautify = useCallback(async () => {
    await polygonMods.handleBeautify(aiModels.selectedModel, drawTools.setIsProcessing);
  }, [polygonMods, aiModels.selectedModel, drawTools]);

  const handleStartTraining = useCallback(async (config) => {
    const result = await aiModels.actions.startTraining(config);
    if (!result.success) setTrainError(result.error || 'Failed to start training');
  }, [aiModels]);

  const handleClassImportSubmit = useCallback(({ mode, classes }) => {
    setShowClassImportModal(false);
    try {
      const imageWidth = stage.imageObj.width;
      const imageHeight = stage.imageObj.height;
      const classNames = mode === 'upload' ? classes : [];
      const cocoData = AnnotationConverter.yoloToCoco(pendingImportText, imageWidth, imageHeight, classNames);

      const { annotations: newAnns } = AnnotationConverter.cocoToInternal(cocoData);
      const annsWithIds = newAnns.map(ann => ({ ...ann, id: generateId() }));

      annotationsHook.addToHistory(annotationsHook.annotations);
      annotationsHook.setAnnotations(annsWithIds);

      setSaveMessage({ type: 'success', text: `Imported ${annsWithIds.length} annotations!` });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Import failed: ' + err.message });
    } finally {
      setPendingImportText('');
    }
  }, [pendingImportText, stage.imageObj, annotationsHook]);

  const handleDoubleClick = useCallback(() => {
    if (drawTools.tool === 'poly' && drawTools.currentPolyPoints.length >= 3) {
      drawTools.closePolygon();
    }
  }, [drawTools]);

  // Space-bar panning state
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isSpaceDown) {
        setIsSpaceDown(true);
        if (drawTools.tool !== 'pan') drawTools.setTool('pan');
      }

      if (e.key === 'Escape') {
        if (drawTools.currentPolyPoints.length > 0) drawTools.setCurrentPolyPoints([]);
        else if (drawTools.isDrawing) drawTools.resetToolState();
        else annotationsHook.clearSelection();
      }
      if (e.key === 'Enter' && drawTools.tool === 'poly' && drawTools.currentPolyPoints.length >= 3) {
        e.preventDefault(); drawTools.closePolygon();
      }
      if (e.key === 'Delete') {
        if (drawTools.tool === 'poly') drawTools.undoLastPolyPoint();
        else annotationsHook.deleteSelected();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
        drawTools.setTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [drawTools, annotationsHook, isSpaceDown]);

  // Enhanced Stage Handlers
  const handleMouseDown = useCallback((e) => {
    // Middle click (button 1) triggers pan regardless of tool
    if (e.evt.button === 1) {
      drawTools.setTool('pan');
      return;
    }
    drawTools.handleMouseDown(e);
  }, [drawTools]);

  const handleMouseUp = useCallback((e) => {
    if (e.evt.button === 1) {
      drawTools.setTool('select');
      return;
    }
    drawTools.handleMouseUp(e);
  }, [drawTools]);

  // Layout Resizing
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) setLeftPanelWidth(Math.min(Math.max(180, e.clientX), 450));
      if (isResizingRight) setRightPanelWidth(Math.min(Math.max(180, window.innerWidth - e.clientX), 450));
    };
    const handleMouseUp = () => { setIsResizingLeft(false); setIsResizingRight(false); };
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  const canvasContainerRef = useRef(null);
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) stage.setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [stage]);

  return (
    <div className="App">
      <MainToolbar
        tool={drawTools.tool} setTool={drawTools.setTool}
        onUndo={annotationsHook.handleUndo} onRedo={annotationsHook.handleRedo}
        onClearAll={annotationsHook.handleClearAll} onExport={handleExport}
        canUndo={annotationsHook.canUndo} canRedo={annotationsHook.canRedo}
        isProcessing={drawTools.isProcessing} saveMessage={saveMessage}

        // AI Model Props
        imageFile={stage.imageFile}
        textPrompt={textPrompt} setTextPrompt={setTextPrompt}
        models={aiModels.models}
        selectedModel={aiModels.selectedModel}
        onSelectModel={aiModels.actions.setModel}
        onOpenModelManager={aiModels.actions.openModelManager}
        onOpenTrainModal={aiModels.actions.openTrainModal}
        onOpenEvaluation={() => setShowEvaluationModal(true)}
        onDetectAll={drawTools.handleDetectAll}
        eraserSize={drawTools.eraserSize}
        setEraserSize={drawTools.setEraserSize}
      />

      <div className="app-content">
        <div className="left-panel-container" style={{ width: leftPanelWidth }}>
          <FileExplorer
            files={fileSystem.files} activeFileId={fileSystem.activeFileId}
            onSelectFile={fileSystem.selectFile} onIngestFiles={fileSystem.ingestFiles}
            onClearAll={fileSystem.clearProject} onRetryFile={fileSystem.retryFile}
            onRemoveFile={fileSystem.removeFile}
            onSaveAll={handleSaveAll} syncStats={fileSystem.syncStats}
            isSyncEnabled={backgroundSync.isSyncEnabled}
            onToggleSync={() => backgroundSync.setIsSyncEnabled(!backgroundSync.isSyncEnabled)}
            isProcessing={fileSystem.isProcessing} processingProgress={fileSystem.processingProgress}
          />
        </div>

        <div className="panel-resizer left" onMouseDown={() => setIsResizingLeft(true)} />

        <div className="canvas-area" ref={canvasContainerRef}>
          {!stage.imageObj ? (
            <DragDropZone onImageUpload={handleImageUpload} />
          ) : (
            <CanvasStage
              stageRef={stage.stageRef} groupRef={stage.groupRef} stageSize={stage.stageSize}
              imageObj={stage.imageObj} imageLayout={stage.imageLayout}
              annotations={annotationsHook.annotations} selectedIds={annotationsHook.selectedIds}
              filterText={drawTools.filterText} tool={drawTools.tool}
              tempAnnotation={drawTools.tempAnnotation} currentPolyPoints={drawTools.currentPolyPoints}
              currentPenPoints={drawTools.currentPenPoints} mousePos={drawTools.mousePos}
              eraserSize={drawTools.eraserSize} color={drawTools.color}
              onWheel={stage.handleWheel} onClick={drawTools.handleStageClick}
              onMouseDown={drawTools.handleMouseDown} onMouseMove={drawTools.handleMouseMove}
              onMouseUp={drawTools.handleMouseUp} onDblClick={handleDoubleClick}
              onVertexDrag={drawTools.handleVertexDrag}
            />
          )}
          {menuPosition && <FloatingSelectionMenu position={menuPosition} selectedCount={annotationsHook.selectedIds.length} onMerge={handleMerge} />}
        </div>

        <div className="panel-resizer right" onMouseDown={() => setIsResizingRight(true)} />

        <div className="right-panel-container" style={{ width: rightPanelWidth }}>
          <RightSidebar
            selectedAnn={annotationsHook.selectedAnn} selectedLabel={annotationsHook.selectedLabel}
            onLabelChange={handleLabelChange} onDelete={annotationsHook.deleteSelected}
            onSimplify={polygonMods.handleSimplify} onDensify={polygonMods.handleDensify}
            onReset={polygonMods.handleReset} onBeautify={handleBeautify}
            canModify={polygonMods.canModify} canReset={polygonMods.canReset}
            isProcessing={drawTools.isProcessing} suggestions={annotationsHook.selectedAnn?.suggestions}
            selectedModel={aiModels.selectedModel} currentParams={aiModels.currentParams}
            updateParam={aiModels.updateParam} annotations={annotationsHook.annotations}
            filterText={drawTools.filterText} setFilterText={drawTools.setFilterText}
            onSelectLabel={(l) => drawTools.setFilterText(l)}
            onRenameLabel={(o, n) => fileSystem.renameClassActiveOnly(o, n)}
          />
        </div>
      </div>

      <ModelManagerModal
        isOpen={aiModels.modals.showModelManager} onClose={aiModels.actions.closeModelManager}
        models={aiModels.models} loadingModelIds={aiModels.loadingModelIds}
        downloadModel={aiModels.actions.downloadModel} deleteModel={aiModels.actions.deleteModel}
      />
      <PreprocessingModal
        isOpen={aiModels.modals.showPreprocessingModal} onClose={aiModels.actions.closePreprocessingModal}
        onStartTraining={handleStartTraining} isTraining={aiModels.isTraining}
      />
      <TrainPanel
        isOpen={aiModels.modals.showTrainModal} onClose={aiModels.actions.closeTrainModal}
        models={aiModels.models} selectedBaseModel={trainBaseModel} onBaseModelChange={setTrainBaseModel}
        epochs={trainEpochs} onEpochsChange={setTrainEpochs} batchSize={trainBatchSize} onBatchSizeChange={setTrainBatchSize}
        isTraining={aiModels.isTraining} trainingProgress={aiModels.trainingProgress}
        onStartTraining={handleStartTraining} onCancelTraining={aiModels.actions.cancelTraining} error={trainError}
      />
      {showEvaluationModal && (
        <div className="evaluation-overlay">
          <div className="evaluation-header"><button onClick={() => setShowEvaluationModal(false)}>✖</button></div>
          <div className="evaluation-content"><EvaluationDashboard /></div>
        </div>
      )}
    </div>
  );
}

export default App;
