import React from 'react';

export const LabelStats = ({ annotations, setFilterText, filterText }) => {

    // Aggregate counts
    const counts = annotations.reduce((acc, curr) => {
        const lbl = curr.label || 'unknown';
        acc[lbl] = (acc[lbl] || 0) + 1;
        return acc;
    }, {});


    return (
        <>
            {Object.entries(counts).map(([lbl, count]) => (
                <div
                    key={lbl}
                    onClick={() => setFilterText(lbl)}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        padding: '4px 0',
                        borderBottom: '1px solid #444',
                        cursor: 'pointer',
                        background: filterText === lbl ? '#444' : 'transparent',
                        paddingLeft: '4px'
                    }}
                >
                    <span>{lbl}</span>
                    <span style={{
                        background: '#555',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '10px'
                    }}>{count}</span>
                </div>
            ))}

            {/* Clear Filter Button */}
            {filterText && (
                <div
                    onClick={() => setFilterText('')}
                    style={{
                        marginTop: '10px',
                        textAlign: 'center',
                        fontSize: '11px',
                        color: '#999',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                    }}
                >
                    Clear Filter
                </div>
            )}
        </>
    );
};
