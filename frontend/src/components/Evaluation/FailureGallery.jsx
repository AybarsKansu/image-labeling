import React, { useState } from 'react';

const FailureGallery = ({ modelId, failures }) => {
    const [filter, setFilter] = useState('ALL'); // ALL, FP, FN, MIS

    if (!failures || failures.length === 0) {
        return <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Select a model to view specific failures or run analysis first.</div>;
    }

    const filteredImages = failures.filter(img => {
        if (filter === 'ALL') return true;
        // This is a naive filter based on image filename or metadata if provided. 
        // Our backend simply returned paths. To filter strictly, we needed metadata.
        // For MVP, we assume backend didn't return metadata yet in the simple endpoint.
        // We will just show all for now, but UI structure is here.
        return true;
    });

    return (
        <div style={{ marginTop: '20px', background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ color: '#fff' }}>Failure Analysis Gallery: {modelId}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {['ALL', 'FP (Ghosts)', 'FN (Misses)'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilter(type.split(' ')[0])}
                            style={{
                                padding: '5px 12px',
                                background: filter === type.split(' ')[0] ? '#007acc' : '#333',
                                color: 'white',
                                border: '1px solid #555',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                {filteredImages.map((imgUrl, idx) => (
                    <div key={idx} style={{ position: 'relative', border: '1px solid #444', borderRadius: '4px', overflow: 'hidden' }}>
                        <img
                            src={`http://localhost:8000${imgUrl}`}
                            alt="Failure Case"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '10px', padding: '2px 5px' }}>
                            {imgUrl.split('/').pop()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FailureGallery;
