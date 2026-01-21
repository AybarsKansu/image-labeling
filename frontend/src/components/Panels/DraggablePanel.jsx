import React from 'react';
import { usePanelSystem } from '../../hooks/usePanelSystem';

export const DraggablePanel = ({ title, children, initialPos, initialSize, className }) => {
    const {
        panelPos,
        panelSize,
        isDragging,
        // isResizing, 
        startDrag,
        startResize
    } = usePanelSystem(initialPos, initialSize);

    return (
        <div
            className={className}
            style={{
                position: 'absolute',
                top: `${panelPos.y}px`,
                left: `${panelPos.x}px`,
                width: `${panelSize.width}px`,
                height: `${panelSize.height}px`,
                display: 'flex',
                gap: '10px',
                zIndex: 100,
                // pointerEvents: 'none', // Wrapper is transparent to events? 
                // No, the original wrapper had pointer-events: none, but the inner content had auto.
                // We will make this component be the inner content logic mostly.
                // Actually the original code had an outer wrapper for position (pointer-events: none)
                // and inner div for background/content (pointer-events: auto).
                // Let's implement that structure.
                pointerEvents: 'none',
                flexDirection: 'column'
            }}>

            <div style={{
                background: '#333',
                border: '1px solid #555',
                borderRadius: '8px',
                padding: '15px',
                color: 'white',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <h3
                    onMouseDown={startDrag}
                    style={{
                        margin: '0 0 10px 0',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid #444',
                        paddingBottom: '5px',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        flexShrink: 0
                    }}
                >
                    {title}
                </h3>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {children}
                </div>

                {/* Resize Handle */}
                <div
                    onMouseDown={startResize}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: '15px',
                        height: '15px',
                        cursor: 'nwse-resize',
                        background: 'linear-gradient(135deg, transparent 50%, #666 50%)',
                        borderBottomRightRadius: '8px'
                    }}
                />
            </div>
        </div>
    );
};
