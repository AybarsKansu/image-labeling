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
import { FloatingPanel, PropertiesPanel, FloatingSelectionMenu, ModelParametersPanel } from './components/Panels';
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

  // Stage system (zoom, pan, image)
  const stage = useStageSystem();

  // Annotations (shapes, selection, history)
  const annotationsHook = useAnnotations();

  // Text Prompt State (Managed at App level)
  const [textPrompt, setTextPrompt] = useState('');

  // AI Models (model selection, training)
  const aiModels = useAIModels(null, textPrompt);

  // Draw tools (pen, box, knife, eraser, etc.)
  const drawTools = useDrawTools(stage, annotationsHook, textPrompt, aiModels.selectedModel, aiModels.currentParams);

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
  const [trainBaseModel, setTrainBaseModel] = useState('yolo26x-seg.pt');
  const [trainError, setTrainError] = useState('');

  // Import Modal State
  const [showClassImportModal, setShowClassImportModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [pendingImportText, setPendingImportText] = useState('');

  // Evaluation Dashboard State
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
    const centerY = (minY + maxY) / 2;

    // Convert to screen coordinates
    const screenX = (centerX * stage.imageLayout.scale) + stage.imageLayout.x;
    const screenY = (centerY * stage.imageLayout.scale) + stage.imageLayout.y;

    return { x: screenX, y: screenY };
  }, [annotationsHook.selectedIds, annotationsHook.selectedAnns, stage.imageLayout, stage.imageObj]);




  // Handle load annotations from file
  const handleLoadAnnotations = useCallback(async (file, format) => {
    if (!file || !stage.imageObj) {
      setSaveMessage('❌ Please open an image first!');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      const text = await file.text();
      const imageWidth = stage.imageObj.width;
      const imageHeight = stage.imageObj.height;

      let cocoData;

      if (format === 'yolo') {
        // Check for metadata
        const hasMetadata = text.includes('# classes:');
        if (!hasMetadata) {
          setPendingImportText(text);
          setShowClassImportModal(true);
          return;
        }
        // Try to extract class names from a classes.txt if available
        // For now, use generic names or metadata if present (handled inside converter)
        cocoData = AnnotationConverter.yoloToCoco(text, imageWidth, imageHeight, []);
      } else {
        switch (format) {
          case 'toon': {
            const toonData = JSON.parse(text);
            cocoData = AnnotationConverter.toonToCoco(toonData);
            break;
          }
          case 'coco': {
            cocoData = JSON.parse(text);
            break;
          }
          case 'voc': {
            cocoData = AnnotationConverter.vocToCoco(text, imageWidth, imageHeight);
            break;
          }
          default:
            throw new Error(`Unknown format: ${format}`);
        }
      }

      // Shared logic for finishing import
      finishImport(cocoData, format);

    } catch (err) {
      console.error('Load failed', err);
      setSaveMessage(`❌ Failed to load: ${err.message}`);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  }, [stage.imageObj]);

  const finishImport = useCallback((cocoData, format) => {
    // Convert COCO to internal state
    const { annotations: newAnns } = AnnotationConverter.cocoToInternal(cocoData);

    // Add unique IDs
    const annsWithIds = newAnns.map(ann => ({
      ...ann,
      id: generateId()
    }));

    // Add to history and set annotations
    annotationsHook.addToHistory(annotationsHook.annotations);
    annotationsHook.setAnnotations(annsWithIds);

    setSaveMessage(`✅ Loaded ${annsWithIds.length} annotations from ${format.toUpperCase()}!`);
    setTimeout(() => setSaveMessage(null), 5000);
  }, [annotationsHook]);

  const handleClassImportSubmit = useCallback(({ mode, classes }) => {
    setShowClassImportModal(false);
    try {
      const imageWidth = stage.imageObj.width;
      const imageHeight = stage.imageObj.height;

      let classNames = [];
      if (mode === 'upload') {
        classNames = classes;
      } else {
        // Generic mode - pass empty, converter uses default 'class_N' logic if extraction fails
        classNames = [];
      }

      const cocoData = AnnotationConverter.yoloToCoco(pendingImportText, imageWidth, imageHeight, classNames);
      finishImport(cocoData, 'yolo');
    } catch (err) {
      console.error('Import failed', err);
      setSaveMessage(`❌ Import failed: ${err.message}`);
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setPendingImportText('');
    }
  }, [pendingImportText, stage.imageObj, finishImport]);





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

        // Merge all at once (Turf 7.x style)
        const merged = turf.union(turf.featureCollection(polygons));

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

  // Handle save to server (with augmentation)
  const handleSave = useCallback(async () => {
    if (!stage.imageFile || annotationsHook.annotations.length === 0) {
      setSaveMessage('❌ No image or annotations to save!');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      const imageInfo = {
        name: stage.imageFile.name,
        width: stage.imageObj?.width || 0,
        height: stage.imageObj?.height || 0
      };

      // Convert internal state to TOON format
      const toonData = AnnotationConverter.internalToToon(
        annotationsHook.annotations,
        imageInfo
      );

      const formData = new FormData();
      formData.append('file', stage.imageFile);
      formData.append('annotations', JSON.stringify(toonData));
      formData.append('augment', String(enableAugmentation));

      const res = await axios.post(`${API_URL}/save`, formData);

      if (res.data.success) {
        setSaveMessage(`✅ ${res.data.message}`);
        // Optionally reset, but user might want to keep editing
        // annotationsHook.reset(); 
      }
    } catch (err) {
      console.error('Save failed', err);
      setSaveMessage('❌ Save failed!');
    }
    setTimeout(() => setSaveMessage(null), 5000);
  }, [stage.imageFile, stage.imageObj, annotationsHook.annotations, enableAugmentation]);



  // Handle export to various formats
  const handleExport = useCallback((format) => {
    if (!stage.imageFile || annotationsHook.annotations.length === 0) {
      setSaveMessage('❌ No annotations to export!');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    try {
      const imageInfo = {
        name: stage.imageFile.name,
        width: stage.imageObj?.width || 0,
        height: stage.imageObj?.height || 0
      };

      // Convert internal to COCO first
      const cocoData = AnnotationConverter.internalToCoco(
        annotationsHook.annotations,
        imageInfo
      );

      let content;
      let filename;
      let mimeType;

      switch (format) {
        case 'toon': {
          const toonData = AnnotationConverter.cocoToToon(cocoData);
          content = JSON.stringify(toonData, null, 2);
          filename = `${imageInfo.name.replace(/\.[^/.]+$/, '')}.toon`;
          mimeType = 'application/json';
          break;
        }
        case 'yolo': {
          const { txt, classes } = AnnotationConverter.cocoToYolo(cocoData);
          content = txt;
          filename = `${imageInfo.name.replace(/\.[^/.]+$/, '')}.txt`;
          mimeType = 'text/plain';
          // Also log classes for user reference
          console.log('YOLO Classes:', classes);
          break;
        }
        case 'coco': {
          content = JSON.stringify(cocoData, null, 2);
          filename = `${imageInfo.name.replace(/\.[^/.]+$/, '')}_coco.json`;
          mimeType = 'application/json';
          break;
        }
        case 'voc': {
          content = AnnotationConverter.cocoToVoc(cocoData);
          filename = `${imageInfo.name.replace(/\.[^/.]+$/, '')}.xml`;
          mimeType = 'application/xml';
          break;
        }
        default:
          throw new Error(`Unknown format: ${format}`);
      }

      // Create and trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSaveMessage(`✅ Exported as ${format.toUpperCase()}!`);
    } catch (err) {
      console.error('Export failed', err);
      setSaveMessage(`❌ Export failed: ${err.message}`);
    }
    setTimeout(() => setSaveMessage(null), 5000);
  }, [stage.imageFile, stage.imageObj, annotationsHook.annotations]);

  // Handle detect all
  const handleDetectAll = useCallback(() => {
    drawTools.handleDetectAll();
  }, [drawTools]);

  // Handle mouse events (pass selected model)
  const handleMouseDown = useCallback((e) => {
    drawTools.handleMouseDown(e);
  }, [drawTools]);

  const handleMouseUp = useCallback(async () => {
    await drawTools.handleMouseUp();
  }, [drawTools]);

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
      if (e.key === 'Delete') {
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

  // Canvas container ref for dynamic resizing
  const canvasContainerRef = React.useRef(null);

  // Resize Observer for Canvas Area
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        stage.setStageSize({ width, height });
      }
    });

    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [stage.setStageSize]);


  // ============================================
  // RENDER
  // ============================================

  // Panel Resizing State
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(250);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        const newWidth = Math.min(Math.max(150, e.clientX), 450);
        setLeftPanelWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.min(Math.max(150, window.innerWidth - e.clientX), 450);
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

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

        models={aiModels.downloadedModels}
        selectedModel={aiModels.selectedModel}
        onSelectModel={aiModels.setSelectedModel}
        onOpenModelManager={aiModels.actions.openModelManager}
        onOpenTrainModal={aiModels.actions.openTrainModal}
        onOpenEvaluation={() => setShowEvaluationModal(true)}

        enableAugmentation={enableAugmentation}
        setEnableAugmentation={setEnableAugmentation}

        onDetectAll={handleDetectAll}
        onSave={handleSave}
        onLoadAnnotations={handleLoadAnnotations}
        onExport={handleExport}
        onUndo={annotationsHook.handleUndo}
        onRedo={annotationsHook.handleRedo}
        onClearAll={annotationsHook.handleClearAll}
        canUndo={annotationsHook.canUndo}
        canRedo={annotationsHook.canRedo}
        isProcessing={drawTools.isProcessing}
        saveMessage={saveMessage}
      />

      <div className="app-content">
        {/* Left Panel: Detected Labels */}
        <div className="left-panel-container" style={{ width: leftPanelWidth }}>
          {stage.imageObj && (
            <FloatingPanel
              docked={true}
              annotations={annotationsHook.annotations}
              filterText={drawTools.filterText}
              setFilterText={drawTools.setFilterText}
              onSelectLabel={(label) => drawTools.setFilterText(label)}
            />
          )}
        </div>

        {/* Left Resizer */}
        <div
          className={`panel-resizer left ${isResizingLeft ? 'active' : ''}`}
          onMouseDown={() => setIsResizingLeft(true)}
        />

        {/* Center: Canvas Area */}
        <div className="canvas-area" ref={canvasContainerRef}>
          {!stage.imageObj ? (
            <DragDropZone onImageUpload={handleImageUpload} />
          ) : (
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
          )}

          {/* Floating Selection Menu (positioned absolutely within canvas area) */}
          {menuPosition && (
            <FloatingSelectionMenu
              position={menuPosition}
              selectedCount={annotationsHook.selectedIds.length}
              onMerge={handleMerge}
            />
          )}
        </div>

        {/* Right Resizer */}
        <div
          className={`panel-resizer right ${isResizingRight ? 'active' : ''}`}
          onMouseDown={() => setIsResizingRight(true)}
        />

        {/* Right Panel: Properties */}
        <div className="right-panel-container" style={{ width: rightPanelWidth }}>
          {annotationsHook.selectedAnn ? (
            <PropertiesPanel
              docked={true}
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
          ) : aiModels.selectedModel ? (
            <ModelParametersPanel
              selectedModel={aiModels.selectedModel}
              currentParams={aiModels.currentParams}
              updateParam={aiModels.updateParam}
            />
          ) : (
            <div style={{ padding: '20px', color: '#666', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', marginTop: '50px' }}>
              <p>Select a polygon to edit properties</p>
              <p>or</p>
              <p>Select a model to configure parameters</p>
            </div>
          )}
        </div>
      </div>



      <ClassImportModal
        isOpen={showClassImportModal}
        onClose={() => {
          setShowClassImportModal(false);
          setPendingImportText('');
        }}
        onSubmit={handleClassImportSubmit}
      />

      <ModelManagerModal
        isOpen={aiModels.modals.showModelManager}
        onClose={aiModels.actions.closeModelManager}
        models={aiModels.models}
        loadingModelIds={aiModels.loadingModelIds}
        downloadModel={aiModels.actions.downloadModel}
        deleteModel={aiModels.actions.deleteModel}
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
        onCancelTraining={aiModels.actions.cancelTraining}
        error={trainError}
      />

      {/* Evaluation Dashboard Modal - Simple Full Screen Overlay */}
      {showEvaluationModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: '10px 20px', background: '#121212', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowEvaluationModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>✖</button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <EvaluationDashboard availableModels={aiModels.models} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
