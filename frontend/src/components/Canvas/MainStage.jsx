import React from 'react';
import { Stage, Layer, Group } from 'react-konva';
import { UrlImage } from './UrlImage';
import { AnnotationsLayer } from './AnnotationsLayer';
import { TOOLS } from '../../constants/appConstants';

export const MainStage = ({
    stageRef,
    groupRef,
    stageSize,
    imageObj,
    imageLayout,
    setImageLayout,
    tools,
    annotationsHelper,
    drawingHelper,
    handleVertexDrag,
    filterText = ''
}) => {
    const {
        tool,
        eraserSize,
        color,
    } = tools;

    const {
        annotations,
        selectedIndex,
        selectAnnotation,
        setAnnotations
    } = annotationsHelper;

    const {
        handlers: drawingHandlers,
        isPanning,
        mousePos,
        ...drawingState
    } = drawingHelper;

    // --- Wheel Logic (Zoom) ---
    const handleWheel = (e) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        const oldScale = imageLayout.scale;

        const pointer = stage.getPointerPosition();
        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        const mousePointTo = {
            x: (pointer.x - imageLayout.x) / oldScale,
            y: (pointer.y - imageLayout.y) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };

        setImageLayout({
            scale: newScale,
            x: newPos.x,
            y: newPos.y
        });
    };

    return (
        <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={drawingHandlers.onMouseDown}
            onMouseMove={drawingHandlers.onMouseMove}
            onMouseUp={drawingHandlers.onMouseUp}
            onClick={drawingHandlers.onClick}
            onWheel={handleWheel}
            onContextMenu={(e) => e.evt.preventDefault()}
            style={{
                background: '#000',
                cursor: isPanning ? 'grabbing' : (tool === TOOLS.PAN ? 'grab' : (tool === TOOLS.ERASER ? 'crosshair' : (tool === TOOLS.KNIFE ? 'crosshair' : 'default')))
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
                    <UrlImage imageObj={imageObj} />

                    <AnnotationsLayer
                        annotations={annotations}
                        selectedIndex={selectedIndex}
                        setSelectedIndex={selectAnnotation}
                        setSelectedLabel={() => { }}
                        tool={tool}
                        color={color}
                        eraserSize={eraserSize}
                        imageLayout={imageLayout}
                        drawingState={{ ...drawingState, mousePos }}
                        handleVertexDrag={handleVertexDrag}
                        filterText={filterText}
                    />
                </Group>
            </Layer>
        </Stage>
    );
};
