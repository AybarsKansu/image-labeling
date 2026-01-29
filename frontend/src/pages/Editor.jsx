import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import axios from 'axios';
import * as turf from '@turf/turf';
import { ArrowLeft, Upload, Download, ChevronDown, MoreVertical, Save, Trash2, Archive, FileJson, AlertTriangle } from 'lucide-react';
import '../App.css';
import GlassConfirmModal from '../components/UI/GlassConfirmModal';

// Custom Hooks
import { useStageSystem } from '../hooks/useStageSystem';
import { useAnnotations } from '../hooks/useAnnotations';
import { useDrawTools } from '../hooks/useDrawTools';
import { useAIModels } from '../hooks/useAIModels';
import { usePolygonModifiers } from '../hooks/usePolygonModifiers';
import { useFileSystem } from '../hooks/useFileSystem';
import { useExport } from '../hooks/useExport';
import { useFormatConverter } from '../hooks/useFormatConverter';

// Components
import { CanvasStage } from '../components/Canvas';
import { MainToolbar } from '../components/Toolbar';
import FloatingSelectionMenu from '../components/Panels/FloatingSelectionMenu';
import FileExplorer from '../components/Panels/FileExplorer';
import RightSidebar from '../components/Panels/RightSidebar';
import DragDropZone from '../components/Common/DragDropZone';
import { ExportModal, AugmentationModal } from '../components/Modals';
import FloatingTrigger from '../components/Common/FloatingTrigger';
import VideoWorkspace from '../components/Workspaces/VideoWorkspace';

import { generateId } from '../utils/helpers';
import { AnnotationConverter } from '../utils/annotationConverter';
import { getProject, deleteProject, updateProject } from '../db/projectOperations';
import { exportProjectAsZip } from '../utils/projectExport';

function Editor() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const projectId = searchParams.get('projectId');
    // ============================================
    // CUSTOM HOOKS
    // ============================================

    const stage = useStageSystem();
    const annotationsHook = useAnnotations();
    const [textPrompt, setTextPrompt] = useState('');
    const aiModels = useAIModels(null, textPrompt);
    const drawTools = useDrawTools(stage, annotationsHook, textPrompt, aiModels.selectedModel, aiModels.currentParams);
    const polygonMods = usePolygonModifiers(annotationsHook, stage);
    const fileSystem = useFileSystem(projectId);
    const { exportProject } = useExport();
    const formatConverter = useFormatConverter();

    // Project name state
    const [projectName, setProjectName] = useState('');
    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const [tempProjectName, setTempProjectName] = useState('');
    const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
    const [isZipExporting, setIsZipExporting] = useState(false);
    const projectMenuRef = useRef(null);

    // Modal states for confirm dialogs
    const [deleteProjectModal, setDeleteProjectModal] = useState(false);
    const [saveModal, setSaveModal] = useState({ isOpen: false, step: 'confirm' });
    const [selectedAugments, setSelectedAugments] = useState([]);

    // Fetch project name on mount
    useEffect(() => {
        if (projectId) {
            getProject(projectId).then(project => {
                if (project) {
                    setProjectName(project.name);
                    setTempProjectName(project.name);
                }
            });
        }
    }, [projectId]);

    const handleRenameProject = async () => {
        if (!tempProjectName.trim() || tempProjectName === projectName) {
            setIsEditingProjectName(false);
            setTempProjectName(projectName);
            return;
        }

        try {
            const { updateProject } = await import('../db/projectOperations');
            await updateProject(projectId, { name: tempProjectName.trim() });
            setProjectName(tempProjectName.trim());
            setIsEditingProjectName(false);
        } catch (err) {
            console.error("Rename failed", err);
            setTempProjectName(projectName);
            setIsEditingProjectName(false);
        }
    };

    // ============================================
    // BRIDGE: File System to Canvas
    // ============================================
    const { activeFileData } = fileSystem;
    const { setImageUrl, setImageFile, closeImage } = stage;
    const { setAnnotations, clearSelection, reset: resetAnns } = annotationsHook;
    const [isEditorReady, setIsEditorReady] = useState(false);

    // ============================================
    // PERSISTENCE: Save last project ID
    // ============================================
    useEffect(() => {
        if (projectId) {
            localStorage.setItem('lastActiveProjectId', projectId);
        }
    }, [projectId]);

    // Close project menu on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
                setIsProjectMenuOpen(false);
            }
        };
        if (isProjectMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isProjectMenuOpen]);

    const handleExportZIP = async () => {
        if (isZipExporting) return;
        try {
            setIsZipExporting(true);
            setIsProjectMenuOpen(false);
            await exportProjectAsZip(projectId, projectName.replace(/\s+/g, '_'));
            setSaveMessage({ type: 'success', text: 'Project exported as ZIP!' });
        } catch (err) {
            setSaveMessage({ type: 'error', text: 'ZIP Export failed: ' + err.message });
        } finally {
            setIsZipExporting(false);
            setTimeout(() => setSaveMessage(null), 3000);
        }
    };

    const handleDeleteThisProject = async () => {
        try {
            await deleteProject(projectId);
            navigate('/');
        } catch (err) {
            alert("Silme işlemi başarısız: " + err.message);
        }
    };

    useEffect(() => {
        if (activeFileData) {
            if (activeFileData.imageUrl) setImageUrl(activeFileData.imageUrl);
            if (activeFileData.blob) setImageFile(activeFileData.blob);
            setAnnotations(activeFileData.annotations || []);
            setIsEditorReady(true); // MARK AS READY
            clearSelection();
        } else {
            closeImage();
            resetAnns();
            setIsEditorReady(false); // MARK AS NOT READY
        }
    }, [activeFileData, setImageUrl, setImageFile, closeImage, setAnnotations, clearSelection, resetAnns]);

    // ============================================
    // LOCAL STATE (UI-specific)
    // ============================================
    const [saveMessage, setSaveMessage] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);

    // ============================================
    // AUTO-SAVE: Persistence Bridge
    // ============================================
    const isInitialLoad = useRef(true);

    // Sync memory annotations back to IndexedDB
    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }

        if (fileSystem.activeFileId && isEditorReady) {
            const timer = setTimeout(() => {
                const options = {};
                if (stage.imageObj) {
                    options.width = stage.imageObj.naturalWidth;
                    options.height = stage.imageObj.naturalHeight;
                }
                fileSystem.updateActiveAnnotations(annotationsHook.annotations, options);
            }, 500); // Debounce saves
            return () => clearTimeout(timer);
        }
    }, [annotationsHook.annotations, fileSystem.activeFileId]);

    // Reset initial load flag when file changes
    useEffect(() => {
        isInitialLoad.current = true;
        setIsEditorReady(false);
    }, [fileSystem.activeFileId]);

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

    const handleSaveAll = useCallback(async (augParams = null) => {
        try {
            if (!fileSystem.files || fileSystem.files.length === 0) {
                setSaveMessage({ type: 'info', text: 'No files to save.' });
                setTimeout(() => setSaveMessage(null), 2000);
                return;
            }

            const result = await fileSystem.saveProjectToBackend(augParams);
            if (result && result.success) {
                setSaveMessage({ type: 'success', text: `Successfully saved ${result.count} images to dataset!` });
            } else {
                setSaveMessage({ type: 'error', text: 'Save failed: ' + (result?.error || 'Unknown error') });
            }
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error('Save all failed:', err);
            setSaveMessage({ type: 'error', text: 'Failed to save: ' + err.message });
        }
    }, [fileSystem]);

    const handleSaveWithConfirm = useCallback(() => {
        if (!fileSystem.files || fileSystem.files.length === 0) {
            setSaveMessage({ type: 'info', text: 'No files to save.' });
            setTimeout(() => setSaveMessage(null), 2000);
            return;
        }
        setSaveModal({ isOpen: true, step: 'confirm' });
    }, [fileSystem.files]);

    const handleExport = useCallback(async (format) => {
        try {
            setSaveMessage({ type: 'info', text: `Packaging ${format.toUpperCase()}...` });

            const result = await exportProject(format);

            if (result.success) {
                setSaveMessage({ type: 'success', text: `Exported ${result.count} images!` });
            } else {
                setSaveMessage({ type: 'error', text: 'Export finished but nothing found.' });
            }
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            setSaveMessage({ type: 'error', text: 'Export failed: ' + err.message });
        }
    }, [exportProject]);

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
        if (file) {
            annotationsHook.reset();
            fileSystem.ingestFiles([file]);
        }
    }, [stage, annotationsHook, fileSystem]);

    const handleLabelChange = useCallback((newLabel) => {
        annotationsHook.updateLabel(newLabel);
    }, [annotationsHook]);

    const handleBeautify = useCallback(async () => {
        await polygonMods.handleBeautify(aiModels.selectedModel, drawTools.setIsProcessing);
    }, [polygonMods, aiModels.selectedModel, drawTools]);

    const handleProjectExport = useCallback((format) => {
        try {
            setSaveMessage({ type: 'info', text: `Preparing ${format.toUpperCase()}...` });

            const imagesData = fileSystem.files.map(file => {
                let annotations = [];
                if (file.label_data) {
                    try {
                        const dataStr = typeof file.label_data === 'string' ? file.label_data : JSON.stringify(file.label_data);
                        const detected = AnnotationConverter.detectFormat(dataStr);

                        if (detected === 'toon') {
                            const toonContent = typeof file.label_data === 'string' ? JSON.parse(file.label_data) : file.label_data;
                            const result = AnnotationConverter.toonToInternal(toonContent);
                            annotations = result.annotations || [];
                        } else if (detected === 'yolo') {
                            const coco = AnnotationConverter.yoloToCoco(dataStr, file.width || 800, file.height || 600);
                            const result = AnnotationConverter.cocoToInternal(coco);
                            annotations = result.annotations || [];
                        } else if (detected === 'coco') {
                            const coco = JSON.parse(dataStr);
                            const result = AnnotationConverter.cocoToInternal(coco);
                            annotations = result.annotations || [];
                        }
                    } catch (e) {
                        console.warn(`Failed to parse annotations for ${file.name}`, e);
                    }
                }

                return {
                    file: {
                        name: file.name,
                        width: file.width || 800,
                        height: file.height || 600
                    },
                    annotations
                };
            }).filter(item => item.annotations.length > 0);

            if (imagesData.length === 0) {
                setSaveMessage({ type: 'error', text: 'No annotations found to export.' });
                return;
            }

            const result = formatConverter.downloadAnnotations(imagesData, format);
            if (result.success) {
                setSaveMessage({ type: 'success', text: `Exported ${result.filename}` });
                setShowExportModal(false);
            }
        } catch (err) {
            console.error('Export failed:', err);
            setSaveMessage({ type: 'error', text: 'Export failed: ' + err.message });
        }
        setTimeout(() => setSaveMessage(null), 3000);
    }, [fileSystem.files, formatConverter]);

    const handleExportCurrent = useCallback((format) => {
        try {
            if (!fileSystem.activeFileData) {
                setSaveMessage({ type: 'error', text: 'No image selected' });
                return;
            }

            const file = fileSystem.activeFileData;
            const annotations = annotationsHook.annotations || [];

            if (annotations.length === 0) {
                setSaveMessage({ type: 'error', text: 'No annotations to export' });
                return;
            }

            const imagesData = [{
                file: {
                    name: file.name || 'image.jpg',
                    width: file.width || 800,
                    height: file.height || 600
                },
                annotations
            }];

            const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
            const result = formatConverter.downloadAnnotations(imagesData, format, baseName);

            if (result.success) {
                setSaveMessage({ type: 'success', text: `Exported ${result.filename}` });
                setTimeout(() => setSaveMessage(null), 3000);
            }
        } catch (err) {
            console.error('Export current failed:', err);
            setSaveMessage({ type: 'error', text: 'Export failed: ' + err.message });
        }
    }, [fileSystem.activeFileData, annotationsHook.annotations, formatConverter]);

    const handleFileSwitch = useCallback((fileId, e) => {
        // Explicitly save the current file before switching
        if (fileSystem.activeFileId && isEditorReady && annotationsHook.annotations) {
            const options = {};
            if (stage.imageObj) {
                options.width = stage.imageObj.naturalWidth;
                options.height = stage.imageObj.naturalHeight;
            }
            // Pass the current file ID explicitly to avoid state race conditions in useFileSystem
            fileSystem.updateActiveAnnotations(annotationsHook.annotations, {
                ...options,
                targetFileId: fileSystem.activeFileId
            });
        }
        fileSystem.handleFileClick(fileId, e);
    }, [fileSystem, isEditorReady, annotationsHook.annotations, stage.imageObj]);

    const handleDoubleClick = useCallback(() => {
        if (drawTools.tool === 'poly' && drawTools.currentPolyPoints.length >= 3) {
            drawTools.closePolygon();
        }
    }, [drawTools]);

    const [isSpaceDown, setIsSpaceDown] = useState(false);

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

    const handleMouseDown = useCallback((e) => {
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

    const [leftPanelWidth, setLeftPanelWidth] = useState(250);
    const [rightPanelWidth, setRightPanelWidth] = useState(280);
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);

    const toggleLeftPanel = () => setIsLeftPanelOpen(!isLeftPanelOpen);
    const toggleRightPanel = () => setIsRightPanelOpen(!isRightPanelOpen);

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
        <div
            className="flex flex-col h-full w-full overflow-hidden bg-theme-primary font-sans text-theme-primary"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
        >
            <FloatingTrigger side="left" isOpen={isLeftPanelOpen} onClick={toggleLeftPanel} />
            <FloatingTrigger side="right" isOpen={isRightPanelOpen} onClick={toggleRightPanel} />

            {/* Project Header - Back Navigation */}
            <div className="flex items-center justify-between h-10 px-4 bg-theme-secondary border-b border-theme flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>

                    {isEditingProjectName ? (
                        <input
                            autoFocus
                            className="bg-theme-tertiary border border-theme-accent rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                            value={tempProjectName}
                            onChange={(e) => setTempProjectName(e.target.value)}
                            onBlur={handleRenameProject}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()}
                        />
                    ) : (
                        <span
                            className="font-medium text-sm text-white cursor-pointer hover:bg-white/5 px-2 py-0.5 rounded transition-colors"
                            onClick={() => setIsEditingProjectName(true)}
                            title="İsmi değiştirmek için tıkla"
                        >
                            {projectName || 'Proje'}
                        </span>
                    )}
                </div>


                {/* Project Actions Menu */}
                <div className="relative ml-auto" ref={projectMenuRef}>
                    <button
                        onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                        className={clsx(
                            "p-1.5 rounded-lg transition-colors",
                            isProjectMenuOpen ? "bg-theme-tertiary text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <MoreVertical size={16} />
                    </button>

                    {isProjectMenuOpen && (
                        <div className="absolute top-full right-0 mt-1 w-48 bg-theme-secondary border border-theme rounded-xl shadow-2xl z-[100] py-2 overflow-hidden backdrop-blur-md">
                            <button
                                onClick={() => { handleSaveWithConfirm(); setIsProjectMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-theme-accent/20 hover:text-white transition-colors"
                            >
                                <Save size={14} className="text-emerald-400" />
                                <span>Save Project</span>
                            </button>
                            <button
                                onClick={() => { setShowExportModal(true); setIsProjectMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-theme-accent/20 hover:text-white transition-colors"
                            >
                                <FileJson size={14} className="text-blue-400" />
                                <span>Export Labels</span>
                            </button>
                            <div className="h-px bg-theme-tertiary my-1" />
                            <button
                                onClick={handleExportZIP}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-theme-accent/20 hover:text-white transition-colors"
                            >
                                {isZipExporting ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Archive size={14} className="text-orange-400" />
                                )}
                                <span>Download as ZIP</span>
                            </button>
                            <button
                                onClick={() => { setDeleteProjectModal(true); setIsProjectMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <Trash2 size={14} />
                                <span>Delete Project</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <MainToolbar
                tool={drawTools.tool} setTool={drawTools.setTool}
                onUndo={annotationsHook.handleUndo} onRedo={annotationsHook.handleRedo}
                onClearAll={annotationsHook.handleClearAll} onExport={handleExport}
                canUndo={annotationsHook.canUndo} canRedo={annotationsHook.canRedo}
                isProcessing={drawTools.isProcessing} saveMessage={saveMessage}

                imageFile={stage.imageFile}
                textPrompt={textPrompt} setTextPrompt={setTextPrompt}
                models={aiModels.models}
                selectedModel={aiModels.selectedModel}
                onSelectModel={aiModels.actions.setModel}
                onOpenModelManager={() => navigate('/models')}
                onSaveAll={handleSaveWithConfirm}

                onDetectAll={drawTools.handleDetectAll}
                eraserSize={drawTools.eraserSize}
                setEraserSize={drawTools.setEraserSize}
                onExportCurrent={handleExportCurrent}
                filterText={drawTools.filterText}
                onClearFilter={() => drawTools.setFilterText('')}
                onLoadAnnotations={fileSystem.loadAnnotationsToActive}
            />

            <div className="flex flex-1 overflow-hidden relative h-[calc(100vh-96px)]">
                {isLeftPanelOpen && (
                    <>
                        <div className="flex flex-col flex-shrink-0 bg-theme-secondary border-r border-theme min-h-0 overflow-hidden" style={{ width: leftPanelWidth }}>
                            <FileExplorer
                                files={fileSystem.files}
                                activeFileId={fileSystem.activeFileId}
                                selectedFileIds={fileSystem.selectedFileIds}
                                onSelectFile={fileSystem.selectFile}
                                onFileClick={handleFileSwitch}
                                onIngestFiles={fileSystem.ingestFiles}
                                onClearAll={fileSystem.clearProject}
                                onRetryFile={fileSystem.retryFile}
                                onClearLabels={fileSystem.clearAllLabels}
                                onRemoveFile={fileSystem.removeFile}
                                onRemoveSelectedFiles={fileSystem.removeSelectedFiles}
                                onSaveAll={handleSaveWithConfirm}
                                isProcessing={fileSystem.isProcessing}
                                processingProgress={fileSystem.processingProgress}
                                onExportProject={() => setShowExportModal(true)}
                                onSyncWithBackend={fileSystem.syncWithBackend}
                            />
                        </div>
                        <div className="panel-resizer left" onMouseDown={() => setIsResizingLeft(true)} />
                    </>
                )}

                {/* Canvas Area with Header */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    {/* Canvas Header - File name and Import/Export */}
                    {activeFileData && activeFileData.type !== 'video' && (
                        <div className="flex items-center justify-between h-9 px-4 bg-theme-tertiary border-b border-theme flex-shrink-0">
                            <span className="text-xs text-gray-400 truncate">
                                {activeFileData.name || 'image.jpg'}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => document.getElementById('canvas-import-input')?.click()}
                                    className="btn-ghost text-xs px-2 py-1 h-6"
                                    title="Label dosyası içe aktar"
                                >
                                    <Upload size={12} />
                                    <span className="hidden sm:inline ml-1">Import Label</span>
                                </button>
                                <button
                                    onClick={() => handleExportCurrent('toon')}
                                    className="btn-ghost text-xs px-2 py-1 h-6"
                                    title="Label dosyası dışa aktar"
                                >
                                    <Download size={12} />
                                    <span className="hidden sm:inline ml-1">Export Label</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div
                        className="flex-1 min-h-0 relative bg-theme-secondary overflow-hidden"
                        style={{ backgroundImage: activeFileData?.type === 'video' ? 'none' : 'radial-gradient(var(--text-secondary) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                        ref={canvasContainerRef}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        {!activeFileData ? (
                            <DragDropZone onImageUpload={handleImageUpload} />
                        ) : activeFileData.type === 'video' ? (
                            <VideoWorkspace
                                videoFile={activeFileData}
                                onCapture={(file) => {
                                    // Add project ID context to capture
                                    const fileWithProject = new File([file], file.name, { type: file.type });
                                    // We rely on fileSystem to tag it with projectId
                                    fileSystem.ingestFiles([fileWithProject]);
                                }}
                            />
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
                        {menuPosition && activeFileData?.type !== 'video' && (
                            <FloatingSelectionMenu position={menuPosition} selectedCount={annotationsHook.selectedIds.length} onMerge={handleMerge} />
                        )}
                    </div>
                </div>

                {isRightPanelOpen && (
                    <>
                        <div className="panel-resizer right" onMouseDown={() => setIsResizingRight(true)} />
                        <div className="flex flex-col flex-shrink-0 bg-theme-secondary border-l border-theme min-h-0 overflow-hidden" style={{ width: rightPanelWidth }}>
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
                                files={fileSystem.files}
                            />
                        </div>
                    </>
                )}
            </div>

            <ExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleProjectExport}
                imageCount={fileSystem.files.length}
                annotationCount={fileSystem.files.reduce((sum, f) => {
                    if (!f.label_data) return sum;
                    if (f.label_data.d) return sum + f.label_data.d.length;
                    if (typeof f.label_data === 'string') {
                        return sum + f.label_data.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
                    }
                    return sum;
                }, 0)}
                mode="batch"
            />

            {/* Delete Project Modal */}
            <GlassConfirmModal
                isOpen={deleteProjectModal}
                title="Delete Project"
                message="Bu projeyi ve tüm dosyalarını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
                confirmText="Delete"
                variant="danger"
                onConfirm={() => {
                    setDeleteProjectModal(false);
                    handleDeleteThisProject();
                }}
                onCancel={() => setDeleteProjectModal(false)}
            />

            {/* Save Confirmation Modal */}
            <GlassConfirmModal
                isOpen={saveModal.isOpen && saveModal.step === 'confirm'}
                title="Save to Backend"
                message={`Save ${fileSystem.files?.length || 0} images to backend dataset?`}
                confirmText="Continue"
                variant="info"
                icon={Save}
                onConfirm={() => {
                    setSaveModal({ isOpen: true, step: 'augment' });
                }}
                onCancel={() => setSaveModal({ isOpen: false, step: 'confirm' })}
            />

            {/* Augmentation Selection Modal */}
            <AugmentationModal
                isOpen={saveModal.isOpen && saveModal.step === 'augment'}
                onClose={() => setSaveModal({ isOpen: false, step: 'confirm' })}
                onConfirm={(enabledTypes) => {
                    setSaveModal({ isOpen: false, step: 'confirm' });
                    handleSaveAll(enabledTypes);
                }}
            />
        </div>
    );
}

export default Editor;
