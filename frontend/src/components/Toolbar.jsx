import React from 'react';
import { TOOLS } from '../constants/appConstants';

export const Toolbar = ({
    tools,
    fileInputRef,
    handleImageUpload,
    onOpenModelManager,
    handleDetectAll,
    handleSaveAnnotation,
    onCloseImage,
    isProcessing,
    imageFile,
    annotationsLength,
    trainingStatus,
    setShowTrainModal,
    handleCancelTraining,
    setShowSettings,
    selectedModel,
    handleUndo,
    handleRedo,
    handleClearAll
}) => {
    const {
        tool, setTool,
        color, setColor,
        eraserSize, setEraserSize,
        aiBoxMode, setAiBoxMode,
        settings, updateSetting
    } = tools;

    return (
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
                onClick={onOpenModelManager}
                style={{
                    background: '#374151',
                    color: 'white',
                    border: '1px solid #4b5563',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                <span>⚡</span> Models
            </button>

            <button
                onClick={onCloseImage}
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
                Close Image
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

            {/* History Controls */}
            <button onClick={handleUndo} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Undo (Ctrl+Z)">
                Undo
            </button>
            <button onClick={handleRedo} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Redo (Ctrl+Y)">
                Redo
            </button>
            <button onClick={handleClearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Clear All">
                Clear All
            </button>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                    type="text"
                    placeholder="Text Prompt (e.g. bird)"
                    value={settings.textPrompt}
                    onChange={(e) => updateSetting('textPrompt', e.target.value)}
                    style={{
                        background: '#222',
                        border: '1px solid #555',
                        color: settings.textPrompt ? '#fff' : '#aaa',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        width: '180px',
                        borderLeft: settings.textPrompt ? '3px solid #db2777' : '1px solid #555'
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
                        background: tool === 'eraser' ? '#4CAF50' : '#555',
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

            {/* Settings Button */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>

                {/* Confidence Threshold */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#aaa' }}>
                    <span>Conf:</span>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={settings.confidenceThreshold}
                        onChange={(e) => updateSetting('confidenceThreshold', e.target.value)}
                        style={{ width: '60px', cursor: 'pointer' }}
                        title={`Confidence: ${settings.confidenceThreshold}%`}
                    />
                    <span>{settings.confidenceThreshold}%</span>
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
                        background: isProcessing ? '#999' : (settings.textPrompt ? 'linear-gradient(45deg, #7c3aed, #db2777)' : '#9c27b0'),
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    {isProcessing ? '⏳ Detecting...' : (settings.textPrompt ? '🪄 Segment Text' : '👁️ Detect All')}
                </button>
                <button
                    onClick={handleSaveAnnotation}
                    disabled={annotationsLength === 0}
                    style={{
                        background: annotationsLength > 0 ? '#2196F3' : '#ccc',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        cursor: annotationsLength > 0 ? 'pointer' : 'not-allowed',
                        fontWeight: 'bold'
                    }}
                >
                    💾 Save
                </button>


                {trainingStatus.is_training || (trainingStatus.message && (trainingStatus.message.includes("Error") || trainingStatus.message.includes("Cancelli"))) ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#333', padding: '4px 8px', borderRadius: '4px',
                        border: `1px solid ${(trainingStatus.message || "").includes("Error") ? '#ef4444' : '#444'}`,
                        marginRight: '10px'
                    }}>

                        <div
                            onClick={() => setShowTrainModal(true)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                            title="Click to open detailed view"
                        >
                            {(trainingStatus.message || "").includes("Error") ? (
                                <span style={{ color: '#ef4444', fontSize: '14px' }}>⚠️</span>
                            ) : (
                                <div className="mini-spinner" style={{
                                    width: '12px', height: '12px',
                                    border: '2px solid #555', borderTop: '2px solid #ea580c',
                                    borderRadius: '50%', animation: 'spin 1s linear infinite'
                                }}></div>
                            )}
                            <span style={{ fontSize: '11px', color: (trainingStatus.message || "").includes("Error") ? '#ef4444' : '#ccc' }}>
                                {(trainingStatus.message || "").includes("Error") ? "Error" : `${Math.round((trainingStatus.progress || 0) * 100)}%`}
                            </span>
                        </div>

                        <button
                            onClick={handleCancelTraining}
                            style={{
                                background: '#ef4444', color: 'white', border: 'none',
                                padding: '2px 6px', borderRadius: '2px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold',
                                display: (trainingStatus.message || "").includes("Error") ? 'none' : 'block'
                            }}
                            title="Stop Training"
                        >
                            ■
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowTrainModal(true)}
                        style={{
                            background: 'linear-gradient(45deg, #ea580c, #d97706)',
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            marginRight: '10px'
                        }}
                        title="Train Model"
                    >
                        🚂 Train
                    </button>
                )}
            </div>
        </div>
    );
};
