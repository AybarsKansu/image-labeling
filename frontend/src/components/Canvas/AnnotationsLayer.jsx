import React from 'react';
import { Line, Circle, Rect, Text } from 'react-konva';
import { stringToColor } from '../../utils/colorUtils';
import { TOOLS } from '../../constants/appConstants';

export const AnnotationsLayer = ({
    annotations,
    selectedIndex,
    setSelectedIndex,
    setSelectedLabel,
    tool,
    color,
    eraserSize,
    imageLayout,
    drawingState,
    handleVertexDrag,
    filterText
}) => {
    const {
        currentPolyPoints,
        currentPenPoints,
        tempAnnotation,
        isDrawing,
        mousePos
    } = drawingState;

    // Helper to check if point is valid number
    const isValidPoint = (p) => typeof p === 'number' && !isNaN(p);

    return (
        <>
            {/* Render Existing Annotations */}
            {annotations.map((ann, idx) => {
                const annColor = ann.color || stringToColor(ann.label || 'unknown');
                const isSelected = idx === selectedIndex;

                if (!ann.points || ann.points.length < 6 || ann.points.some(p => !isValidPoint(p))) return null;

                // Label Filter
                if (filterText && filterText.length > 0 && ann.label && !ann.label.toLowerCase().includes(filterText.toLowerCase())) {
                    return null;
                }

                return (
                    <React.Fragment key={ann.id || idx}>
                        <Line
                            points={ann.points}
                            closed={true}
                            stroke={isSelected ? '#fff' : annColor}
                            strokeWidth={isSelected ? 3 : 2}
                            fill={isSelected ? annColor + '40' : annColor + '20'}
                            onClick={(e) => {
                                if (tool === TOOLS.ERASER) {
                                    e.cancelBubble = true;
                                    // Eraser click logic could go here if needed, 
                                    // but usually we rely on drag/brush or explicit delete.
                                } else if (tool === TOOLS.SELECT) {
                                    e.cancelBubble = true;
                                    setSelectedIndex(idx);
                                    setSelectedLabel(ann.label || '');
                                }
                            }}
                            onTap={(e) => { // Mobile touch support
                                if (tool === TOOLS.SELECT) {
                                    e.cancelBubble = true;
                                    setSelectedIndex(idx);
                                    setSelectedLabel(ann.label || '');
                                }
                            }}
                        />
                        {/* Anchor Points for Selected Polygon */}
                        {isSelected && (
                            <>
                                {Array.from({ length: ann.points.length / 2 }).map((_, i) => (
                                    <Circle
                                        key={`anchor-${i}`}
                                        x={ann.points[i * 2]}
                                        y={ann.points[i * 2 + 1]}
                                        radius={5} // Slightly larger for better grabbing
                                        fill="white"
                                        stroke="#0099ff"
                                        strokeWidth={2}
                                        draggable
                                        onDragMove={(e) => handleVertexDrag(e, idx, i * 2)}
                                        onMouseEnter={(e) => {
                                            const stage = e.target.getStage();
                                            stage.container().style.cursor = 'move';
                                        }}
                                        onMouseLeave={(e) => {
                                            const stage = e.target.getStage();
                                            stage.container().style.cursor = 'default';
                                        }}
                                    />
                                ))}
                            </>
                        )}
                        {/* Label Text */}
                        {ann.label && (
                            <Text
                                x={(ann.points[0] || 0) + 5}
                                y={(ann.points[1] || 0) + 5}
                                text={ann.label}
                                fontSize={12}
                                fill="white"
                                listening={false} // Text shouldn't block clicks
                                shadowColor="black"
                                shadowBlur={2}
                                shadowOpacity={0.8}
                            />
                        )}
                    </React.Fragment>
                );
            })}

            {/* Polygon Preview (Click-Click) */}
            {tool === 'poly' && currentPolyPoints.length > 0 && (
                <>
                    <Line
                        points={currentPolyPoints.flatMap(p => [p.x, p.y])}
                        stroke="#ffff00"
                        strokeWidth={2}
                        closed={false}
                        lineCap="round"
                        lineJoin="round"
                    />
                    {/* Rubber Band Line */}
                    {mousePos && (
                        <Line
                            points={[
                                currentPolyPoints[currentPolyPoints.length - 1].x,
                                currentPolyPoints[currentPolyPoints.length - 1].y,
                                mousePos.x,
                                mousePos.y
                            ]}
                            stroke="#ffff00"
                            strokeWidth={1}
                            dash={[5, 5]}
                        />
                    )}
                </>
            )}

            {/* Box / AI Box Preview (Drag-Draw) */}
            {isDrawing && tempAnnotation && (tool === TOOLS.BOX || tool === 'ai-box') && (
                <Rect
                    x={tempAnnotation.x}
                    y={tempAnnotation.y}
                    width={tempAnnotation.width}
                    height={tempAnnotation.height}
                    stroke={tool === 'ai-box' ? '#00e5ff' : '#4ade80'}
                    strokeWidth={2}
                    dash={[4, 4]}
                />
            )}

            {/* Eraser Cursor Preview */}
            {tool === TOOLS.ERASER && mousePos && (
                <Circle
                    x={mousePos.x}
                    y={mousePos.y}
                    radius={eraserSize / (imageLayout.scale || 1)} // Adjust for zoom
                    stroke="#f44336"
                    strokeWidth={1 / (imageLayout.scale || 1)}
                    listening={false}
                />
            )}

            {/* Pen / Lasso / Knife Preview (Live Drag) */}
            {((tool === TOOLS.PEN) || (tool === 'ai-box' /* && assume lasso if freehand */) || tool === TOOLS.KNIFE) && currentPenPoints.length > 0 && (
                <Line
                    points={currentPenPoints}
                    stroke={tool === TOOLS.KNIFE ? '#ff4444' : (tool === 'ai-box' ? '#00e5ff' : color)}
                    strokeWidth={2}
                    tension={0.5}
                    lineCap="round"
                    dash={(tool === 'ai-box' || tool === TOOLS.KNIFE) ? [5, 5] : undefined}
                    closed={tool === 'ai-box' ? true : false} // AI Lasso usually closes
                    fill={tool === TOOLS.KNIFE ? undefined : (tool === 'ai-box' ? 'rgba(0, 229, 255, 0.1)' : undefined)}
                />
            )}
        </>
    );
};
