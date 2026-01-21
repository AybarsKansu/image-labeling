import React, { useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Group, Text } from 'react-konva';
import { stringToColor } from '../../utils/helpers';

/**
 * CanvasStage Component
 * Main canvas component for rendering image and annotations
 */
const CanvasStage = ({
    // Stage refs and size
    stageRef,
    groupRef,
    stageSize,

    // Image
    imageObj,
    imageLayout,

    // Annotations
    annotations,
    selectedIndex,
    filterText,

    // Tool state
    tool,
    tempAnnotation,
    currentPolyPoints,
    currentPenPoints,
    mousePos,
    eraserSize,
    color,

    // Handlers
    onWheel,
    onClick,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onVertexDrag,
    onContextMenu
}) => {
    // Filter annotations based on filterText
    const filteredAnnotations = useMemo(() => {
        if (!filterText) return annotations;
        const lowerFilter = filterText.toLowerCase();
        return annotations.filter(ann =>
            ann.label?.toLowerCase().includes(lowerFilter)
        );
    }, [annotations, filterText]);

    // Get cursor based on tool
    const getCursor = () => {
        switch (tool) {
            case 'pan': return 'grab';
            case 'eraser': return 'crosshair';
            case 'ai-box':
            case 'box': return 'crosshair';
            case 'poly': return 'crosshair';
            case 'pen': return 'crosshair';
            case 'knife': return 'crosshair';
            default: return 'default';
        }
    };

    return (
        <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onWheel={onWheel}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onContextMenu={(e) => {
                e.evt.preventDefault();
                onContextMenu && onContextMenu(e);
            }}
            style={{
                background: '#1a1a2e',
                cursor: getCursor()
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
                    {/* Image */}
                    {imageObj && (
                        <KonvaImage
                            image={imageObj}
                            width={imageObj.naturalWidth}
                            height={imageObj.naturalHeight}
                        />
                    )}

                    {/* Annotations */}
                    {filteredAnnotations.map((ann, i) => {
                        const isSelected = selectedIndex === i;
                        const annColor = ann.color || stringToColor(ann.label || 'unknown');

                        // Validate points
                        if (!ann.points || ann.points.length < 4) return null;

                        // Check for invalid values (NaN, Infinity)
                        const hasInvalidPoints = ann.points.some(p =>
                            typeof p !== 'number' || !isFinite(p)
                        );
                        if (hasInvalidPoints) return null;

                        return (
                            <React.Fragment key={ann.id || i}>
                                {/* Polygon Line */}
                                <Line
                                    points={ann.points}
                                    stroke={annColor}
                                    strokeWidth={isSelected ? 3 : 2}
                                    fill={isSelected ? `${annColor}40` : `${annColor}20`}
                                    closed={true}
                                    lineCap="round"
                                    lineJoin="round"
                                />

                                {/* Label */}
                                {ann.label && ann.points.length >= 2 && (
                                    <Text
                                        x={ann.points[0]}
                                        y={ann.points[1] - 18}
                                        text={ann.label}
                                        fontSize={12}
                                        fill="#fff"
                                        padding={2}
                                    />
                                )}

                                {/* Vertex handles for selected polygon */}
                                {isSelected && ann.points.map((_, pi) => {
                                    if (pi % 2 !== 0) return null;
                                    return (
                                        <Circle
                                            key={`vertex-${i}-${pi}`}
                                            x={ann.points[pi]}
                                            y={ann.points[pi + 1]}
                                            radius={5}
                                            fill="#fff"
                                            stroke={annColor}
                                            strokeWidth={2}
                                            draggable={true}
                                            onDragMove={(e) => onVertexDrag(e, i, pi)}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}

                    {/* Temp Box (drawing) */}
                    {tempAnnotation && tempAnnotation.width > 0 && tempAnnotation.height > 0 && (
                        <Rect
                            x={tempAnnotation.x}
                            y={tempAnnotation.y}
                            width={tempAnnotation.width}
                            height={tempAnnotation.height}
                            stroke={tool === 'ai-box' ? '#00ff00' : color}
                            strokeWidth={2}
                            dash={[5, 5]}
                            fill={tool === 'ai-box' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'}
                        />
                    )}

                    {/* Polygon in progress */}
                    {currentPolyPoints.length > 0 && (
                        <>
                            <Line
                                points={currentPolyPoints.flatMap(p => [p.x, p.y])}
                                stroke="#ffff00"
                                strokeWidth={2}
                                dash={[5, 5]}
                            />
                            {currentPolyPoints.map((pt, i) => (
                                <Circle
                                    key={`poly-pt-${i}`}
                                    x={pt.x}
                                    y={pt.y}
                                    radius={i === 0 ? 8 : 4}
                                    fill={i === 0 ? '#ff0000' : '#ffff00'}
                                    stroke="#fff"
                                    strokeWidth={1}
                                />
                            ))}
                        </>
                    )}

                    {/* Pen / Knife / Lasso in progress */}
                    {currentPenPoints.length > 2 && (
                        <Line
                            points={currentPenPoints}
                            stroke={tool === 'knife' ? '#ff0000' : (tool === 'ai-box' ? '#00ff00' : color)}
                            strokeWidth={tool === 'knife' ? 3 : 2}
                            dash={tool === 'knife' ? [8, 4] : undefined}
                            lineCap="round"
                            lineJoin="round"
                        />
                    )}

                    {/* Eraser cursor */}
                    {tool === 'eraser' && mousePos && (
                        <Circle
                            x={mousePos.x}
                            y={mousePos.y}
                            radius={eraserSize / imageLayout.scale}
                            stroke="#ff0000"
                            strokeWidth={2}
                            dash={[4, 4]}
                            listening={false}
                        />
                    )}
                </Group>
            </Layer>
        </Stage>
    );
};

export default CanvasStage;
