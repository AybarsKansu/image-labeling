import React from 'react';

const FloatingSelectionMenu = ({ position, onMerge, selectedCount }) => {
    if (!position || selectedCount < 2) return null;

    return (
        <div
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
                marginTop: -10,
                backgroundColor: '#1a1a2e',
                border: '1px solid #FF0040',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                zIndex: 1000,
                color: 'white',
                minWidth: '150px'
            }}
        >
            <div style={{ fontSize: '12px', fontWeight: 'bold', textAlign: 'center', color: '#ccc' }}>
                {selectedCount} Selected
            </div>

            <button
                onClick={() => onMerge('smart')}
                style={{
                    backgroundColor: '#FF0040',
                    color: 'white',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                }}
            >
                🤖 Smart AI Merge
            </button>

            <button
                onClick={() => onMerge('geometric')}
                style={{
                    backgroundColor: '#333',
                    color: 'white',
                    border: '1px solid #555',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                }}
            >
                📐 Geometric Merge (Fast)
            </button>
        </div>
    );
};

export default FloatingSelectionMenu;
