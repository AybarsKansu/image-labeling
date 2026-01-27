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
import { useFormatConverter } from './hooks/useFormatConverter';
import { useProjectIO } from './hooks/useProjectIO';

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
  const formatConverter = useFormatConverter();
  const projectIO = useProjectIO(annotationsHook, fileSystem);

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
  const [menuPosition, setMenuPosition] = useState(null);
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
  // ACTIONS & EVENT HANDLERS
  // ============================================

  // 1. Import Labels (Universal Aggregator)
  const handleImportLabels = useCallback(async (file) => {
    try {
      setSaveMessage({ type: 'info', text: 'Parsing labels...' });
      const text = await file.text();
      const result = await formatConverter.parseAnnotations(text, file.name);

      if (!result.success) {
        throw new Error(result.error);
      }

      const { data } = result;
      let updatedCount = 0;
      let skippedCount = 0;

      // Iterate through the parsed dictionary: { fileName: [anns], ... }
      for (const [fileName, annotations] of Object.entries(data)) {
        // Find matching file in our system
        // Note: fileSystem.files is a live query, we can iterate it.
        const targetFile = fileSystem.files.find(f => f.name === fileName || f.baseName === fileName);

        if (targetFile) {
          await fileSystem.updateFileAnnotations(targetFile.id, annotations);
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      setSaveMessage({ type: 'success', text: `Imported labels for ${updatedCount} files (${skippedCount} skipped).` });
      setTimeout(() => setSaveMessage(null), 4000);

    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Import failed: ' + err.message });
      console.error(err);
    }
  }, [fileSystem, formatConverter]);

  // Helper for YOLO string -> Annotations (Basic reverse of serialiser)
  const parseYoloString = (yoloStr, w, h) => {
    if (!yoloStr || !w || !h) return [];
    const lines = yoloStr.split('\n');
    return lines.map(line => {
      if (line.startsWith('#')) return null;
      const parts = line.split(' ');
      if (parts.length < 5) return null;
      const [cid, nx, ny, nw, nh] = parts.map(Number);
      // Denormalize
      return {
        classId: cid,
        x: (nx - nw / 2) * w,
        y: (ny - nh / 2) * h,
        w: nw * w,
        h: nh * h,
        type: 'box'
      };
    }).filter(Boolean);
  };

  // 2. Export Project (Universal Aggregator)
  const handleExportProject = useCallback(async (format) => {
    try {
      setSaveMessage({ type: 'info', text: `Generating ${format.toUpperCase()} export...` });

      const filesToExport = fileSystem.files.map(f => {
        return {
          ...f,
          annotations: f.id === fileSystem.activeFileId
            ? annotationsHook.annotations
            : parseYoloString(f.label_data, f.width, f.height)
        };
      });

      const { data, mime, ext } = formatConverter.generateAnnotations(filesToExport, format);

      // Download
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project_export_${new Date().getTime()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      setSaveMessage({ type: 'success', text: 'Export complete!' });
      setTimeout(() => setSaveMessage(null), 3000);

    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Export failed: ' + err.message });
      console.error(err);
    }
  }, [fileSystem, annotationsHook, formatConverter]);

  // 3. Export Current (Single File)
  const handleExportCurrent = useCallback(async (format) => {
    if (!fileSystem.activeFileData) return;
    const currentFile = {
      ...fileSystem.activeFileData,
      annotations: annotationsHook.annotations
    };

    try {
      const { data, mime, ext } = formatConverter.generateAnnotations([currentFile], format);
      // Download
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentFile.name.split('.')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  }, [fileSystem.activeFileData, annotationsHook, formatConverter]);

  // Handle Save All (Internal Snapshot to Backend)
  const handleSaveAll = useCallback(async () => {
    try {
      setSaveMessage({ type: 'info', text: 'Saving project snapshot...' });

      // 1. Generate Unified Data (COCO format as snapshot)
      // We need to map all files and ensure annotations are populated/parsed
      // (Reuse logic from export, maybe extract helper if massive, but map is fast enough)
      const filesToExport = fileSystem.files.map(f => ({
        ...f,
        annotations: f.id === fileSystem.activeFileId
          ? annotationsHook.annotations
          : parseYoloString(f.label_data, f.width, f.height)
      }));

      const { data } = formatConverter.generateAnnotations(filesToExport, 'coco');

      // 2. Send to Backend
      // Assuming a generic save endpoint or reusing export one?
      // The prompt says "Save Al... signals... to the backend so it can be reconstructed".
      // I'll use a specific endpoint for snapshots.
      const blob = new Blob([data], { type: 'application/json' });
      const formData = new FormData();
      formData.append('snapshot', blob, 'project_snapshot.json');

      // Use existing axios instance if available or generic fetch
      // Assuming API_URL is available in scope (it was used in previous code)
      await axios.post(`${API_URL}/project/snapshot`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSaveMessage({ type: 'success', text: 'Project saved to cloud!' });
      setTimeout(() => setSaveMessage(null), 3000);

    } catch (err) {
      console.error('Save failed:', err);
      setSaveMessage({ type: 'error', text: 'Cloud save failed. ' + err.message });
    }
  }, [fileSystem.files, fileSystem.activeFileId, annotationsHook.annotations, formatConverter]);

  const handleIngestFiles = fileSystem.ingestFiles; // Images only now passed directly logic

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
        // Task 3: Interactive Pan (Spacebar)
        // If space is held, switch to PAN tool momentarily IF we aren't already
        // Important: check if we are drawing or not?
        // Actually prompt says: "If spacePressed is true, change cursor to grab and allow dragging"
        // And "While Panning, disable drawing logic"

        // We set tool to 'pan' is a good way to handle this, provided 'pan' tool disables drawing.
        if (drawTools.tool !== 'pan') {
          drawTools.setTool('pan');
        }
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
        // Revert to 'select' or previous tool? 
        // For simplicity, revert to 'select' as per common standard, or maintain previous.
        // The prompt says "Spacebar + Drag: ... change cursor to grab ... While Panning, disable drawing"
        // It implies temporary state.
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
    // Task 3: Middle Mouse Button Pan
    if (e.evt.button === 1) {
      e.evt.preventDefault(); // Prevent default scroll
      // drawTools.handleMouseDown will be called, ensure it handles button 1
    }
    drawTools.handleMouseDown(e);
  }, [drawTools]);

  const handleMouseUp = useCallback((e) => {
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
        onClearAll={annotationsHook.handleClearAll} onExport={handleExportCurrent}
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
            onSelectFile={fileSystem.selectFile}
            onIngestFiles={fileSystem.ingestFiles}
            onImportLabels={handleImportLabels} // Universal Import
            onClearAll={fileSystem.clearProject} onRetryFile={fileSystem.retryFile}
            onRemoveFile={fileSystem.removeFile}
            onSaveAll={handleSaveAll}
            onExportProject={handleExportProject} // Universal Export
            syncStats={fileSystem.syncStats}
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
              onMouseDown={handleMouseDown} onMouseMove={drawTools.handleMouseMove}
              onMouseUp={handleMouseUp} onDblClick={handleDoubleClick}
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
