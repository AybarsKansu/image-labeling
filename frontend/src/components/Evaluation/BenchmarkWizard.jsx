
import React, { useState } from 'react';

const BenchmarkWizard = ({ models, onRun, onCancel }) => {
    const [selectedModels, setSelectedModels] = useState([]);
    const [datasetType, setDatasetType] = useState('coco8'); // coco8, internal, custom
    const [customPath, setCustomPath] = useState('');

    const toggleModel = (id) => {
        setSelectedModels(prev =>
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    const handleRun = () => {
        let configPath = 'coco8.yaml'; // Default demo

        if (datasetType === 'internal') {
            configPath = 'data.yaml'; // Backend assumes this is in DATASET_DIR
        } else if (datasetType === 'custom') {
            configPath = customPath;
        }

        onRun({
            models: selectedModels,
            test_set_config: configPath
        });
    };

    return (
        <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '500px', background: '#252526', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)', padding: '20px', color: '#fff'
        }}>
            <h2 style={{ marginTop: 0 }}>Create Benchmark Run</h2>

            {/* 1. Select Models */}
            <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '10px', borderBottom: '1px solid #444' }}>1. Select Models</h4>
                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #333', padding: '10px' }}>
                    {models.length === 0 && <p style={{ color: '#888', fontStyle: 'italic' }}>No models found.</p>}
                    {models.map(model => (
                        <div key={model.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                            <input
                                type="checkbox"
                                id={`chk-${model.id}`}
                                checked={selectedModels.includes(model.id)}
                                onChange={() => toggleModel(model.id)}
                                style={{ marginRight: '10px' }}
                            />
                            <label htmlFor={`chk-${model.id}`} style={{ cursor: 'pointer', flex: 1 }}>
                                {model.name} <span style={{ color: '#888', fontSize: '12px' }}>({model.id})</span>
                            </label>
                            {/* Simple Badge for Family/Type */}
                            <span style={{ fontSize: '10px', background: '#444', padding: '2px 6px', borderRadius: '4px' }}>
                                {model.type}
                            </span>
                        </div>
                    ))}
                </div>
                <p style={{ fontSize: '12px', color: '#aaa', marginTop: '5px' }}>
                    Comparing {selectedModels.length} models.
                </p>
            </div>

            {/* 2. Select Dataset */}
            <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '10px', borderBottom: '1px solid #444' }}>2. Select Test Dataset</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="dataset"
                            value="coco8"
                            checked={datasetType === 'coco8'}
                            onChange={() => setDatasetType('coco8')}
                            style={{ marginRight: '10px' }}
                        />
                        <div>
                            <strong>COCO8 (Demo/Standard)</strong>
                            <div style={{ fontSize: '12px', color: '#888' }}>Small standard dataset for quick sanity checks.</div>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="dataset"
                            value="internal"
                            checked={datasetType === 'internal'}
                            onChange={() => setDatasetType('internal')}
                            style={{ marginRight: '10px' }}
                        />
                        <div>
                            <strong>Current Project Validation Set</strong>
                            <div style={{ fontSize: '12px', color: '#888' }}>Uses 'val' split from your current backend dataset.</div>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="dataset"
                            value="custom"
                            checked={datasetType === 'custom'}
                            onChange={() => setDatasetType('custom')}
                            style={{ marginRight: '10px' }}
                        />
                        <div>
                            <strong>Custom "Gold Standard" Set</strong>
                            <div style={{ fontSize: '12px', color: '#888' }}>Path to a specific data.yaml file.</div>
                        </div>
                    </label>

                    {datasetType === 'custom' && (
                        <input
                            type="text"
                            placeholder="/path/to/gold_standard_data.yaml"
                            value={customPath}
                            onChange={(e) => setCustomPath(e.target.value)}
                            style={{ marginLeft: '26px', padding: '8px', background: '#333', border: '1px solid #555', color: '#fff', borderRadius: '4px' }}
                        />
                    )}
                </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                    onClick={onCancel}
                    style={{ padding: '10px 20px', background: 'transparent', color: '#ccc', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleRun}
                    disabled={selectedModels.length === 0}
                    style={{
                        padding: '10px 25px',
                        background: selectedModels.length > 0 ? '#007acc' : '#444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: selectedModels.length > 0 ? 'pointer' : 'not-allowed'
                    }}
                >
                    Start Benchmark
                </button>
            </div>
        </div>
    );
};

export default BenchmarkWizard;
