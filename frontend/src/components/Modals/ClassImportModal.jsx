import React, { useState, useRef } from 'react';
// Reusing modal styles

const ClassImportModal = ({ isOpen, onClose, onSubmit }) => {
    const fileInputRef = useRef(null);
    const [mode, setMode] = useState('generic'); // 'upload', 'generic', 'existing'
    const [uploadedClasses, setUploadedClasses] = useState([]);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            // Split by newlines, trim, remove empty
            const classes = text.split('\n').map(c => c.trim()).filter(c => c);
            setUploadedClasses(classes);
            setMode('upload');
        };
        reader.readAsText(file);
    };

    const handleSubmit = () => {
        onSubmit({
            mode,
            classes: mode === 'upload' ? uploadedClasses : []
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2>⚠️ Missing Class Names</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <p>The imported YOLO file does not contain class names (metadata). How should we map the class IDs?</p>

                    <div className="import-options" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>

                        {/* Option 1: Upload classes.txt */}
                        <div className={`option-card ${mode === 'upload' ? 'selected' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: '15px',
                                border: `1px solid ${mode === 'upload' ? '#3b82f6' : '#4b5563'}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: mode === 'upload' ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                            }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>📄 Upload classes.txt</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Select a text file with one class per line.</div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            {uploadedClasses.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '12px', color: '#10b981' }}>
                                    ✅ Loaded {uploadedClasses.length} classes
                                </div>
                            )}
                        </div>

                        {/* Option 2: Use Generic */}
                        <div className={`option-card ${mode === 'generic' ? 'selected' : ''}`}
                            onClick={() => setMode('generic')}
                            style={{
                                padding: '15px',
                                border: `1px solid ${mode === 'generic' ? '#3b82f6' : '#4b5563'}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: mode === 'generic' ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                            }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>🔢 Use Generic Names</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Map IDs to "class_0", "class_1", etc.</div>
                        </div>

                        {/* Option 3: Use Existing (Not implemented fully yet as we need access to current project classes, skipping for MVP unless state is passed) */}
                        {/* 
                        <div className={`option-card ${mode === 'existing' ? 'selected' : ''}`}
                             onClick={() => setMode('existing')}
                             ...
                        >
                             <div style={{ fontWeight: 'bold' }}>📂 Use Project Classes</div>
                        </div> 
                        */}

                    </div>
                </div>

                <div className="modal-footer">
                    <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
                    <button className="modal-btn primary" onClick={handleSubmit} disabled={mode === 'upload' && uploadedClasses.length === 0}>
                        Continue Import
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClassImportModal;
