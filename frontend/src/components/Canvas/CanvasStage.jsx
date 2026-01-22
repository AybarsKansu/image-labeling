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
    selectedIds,
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
    onDblClick,
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
            onDblClick={onDblClick}
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
                        const isSelected = selectedIds && selectedIds.includes(ann.id);

                        // Validate points
                        if (!ann.points || ann.points.length < 4) return null;

                        // Check for invalid values (NaN, Infinity)
                        const hasInvalidPoints = ann.points.some(p =>
                            typeof p !== 'number' || !isFinite(p)
                        );
                        if (hasInvalidPoints) return null;

                        // Determine if this was drawn with pen (should be open, no fill)
                        const isPenDrawn = ann.isPenDrawn === true;

                        // Get stroke color (from annotation or generate from label)
                        // HIGH CONTRAST for selected: Neon Red #FF0040
                        const baseColor = ann.color || stringToColor(ann.label || 'unknown');
                        const strokeColor = isSelected ? '#FF0040' : baseColor;

                        // Fill is stroke color with low opacity (10% normal, 30% selected)
                        // Pen drawn shapes have no fill
                        const fillColor = isPenDrawn ? null : (isSelected ? `${baseColor}4D` : `${baseColor}1A`);

                        return (
                            <React.Fragment key={ann.id || i}>
                                {/* Polygon Line */}
                                <Line
                                    points={ann.points}
                                    stroke={strokeColor}
                                    strokeWidth={isSelected ? 3 : 2}
                                    fill={fillColor}
                                    fillEnabled={!isPenDrawn}
                                    closed={!isPenDrawn}
                                    lineCap="round"
                                    lineJoin="round"
                                    hitStrokeWidth={20}
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
                                            stroke={strokeColor} // Use high contrast color
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
                            {/* Dynamic Fill Preview (CVAT Style) */}
                            {/* Shows the potential polygon area including the current mouse position */}
                            {tool === 'poly' && mousePos && (
                                <Line
                                    points={[...currentPolyPoints.flatMap(p => [p.x, p.y]), mousePos.x, mousePos.y]}
                                    strokeEnabled={false}
                                    fill={color}
                                    opacity={0.2} // Low opacity for preview
                                    closed={true}
                                />
                            )}

                            {/* Static lines between placed points */}
                            <Line
                                points={currentPolyPoints.flatMap(p => [p.x, p.y])}
                                stroke={color} // Use tool color
                                strokeWidth={2}
                                lineCap="round"
                                lineJoin="round"
                            />

                            {/* Rubber-band guide line (last point -> mouse) */}
                            {tool === 'poly' && mousePos && (
                                <Line
                                    points={[
                                        currentPolyPoints[currentPolyPoints.length - 1].x,
                                        currentPolyPoints[currentPolyPoints.length - 1].y,
                                        mousePos.x,
                                        mousePos.y
                                    ]}
                                    stroke={color}
                                    strokeWidth={2}
                                    dash={[6, 3]}
                                    opacity={0.7}
                                    lineCap="round"
                                />
                            )}

                            {/* Closing preview line (when near start point) */}
                            {tool === 'poly' && mousePos && currentPolyPoints.length >= 3 && (
                                (() => {
                                    const firstPt = currentPolyPoints[0];
                                    const dist = Math.sqrt(
                                        Math.pow(mousePos.x - firstPt.x, 2) +
                                        Math.pow(mousePos.y - firstPt.y, 2)
                                    );
                                    if (dist < 15) {
                                        return (
                                            <Line
                                                points={[
                                                    currentPolyPoints[currentPolyPoints.length - 1].x,
                                                    currentPolyPoints[currentPolyPoints.length - 1].y,
                                                    firstPt.x,
                                                    firstPt.y
                                                ]}
                                                stroke="#00ff00"
                                                strokeWidth={2}
                                                dash={[4, 2]}
                                                opacity={0.9}
                                            />
                                        );
                                    }
                                    return null;
                                })()
                            )}

                            {/* Anchor dots at each vertex - All visible (CVAT Style) */}
                            {currentPolyPoints.map((pt, i) => (
                                <Circle
                                    key={`poly-pt-${i}`}
                                    x={pt.x}
                                    y={pt.y}
                                    radius={4} // Visible white dots
                                    fill="#ffffff"
                                    stroke="#888888"
                                    strokeWidth={1}
                                    shadowColor="#000"
                                    shadowBlur={2}
                                    shadowOpacity={0.3}
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
