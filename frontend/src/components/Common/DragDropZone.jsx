import React from 'react';
import { useDropzone } from 'react-dropzone';

const DragDropZone = ({ onImageUpload }) => {
    const onDrop = (acceptedFiles) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            // Emulate the event structure expected by existing handler
            const syntheticEvent = {
                target: {
                    files: [acceptedFiles[0]]
                }
            };
            onImageUpload(syntheticEvent);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': []
        },
        multiple: false
    });

    return (
        <div
            {...getRootProps()}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1e1e1e',
                color: '#888',
                border: isDragActive ? '2px dashed #4CAF50' : '2px dashed #444',
                margin: '20px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
        >
            <input {...getInputProps()} />
            <div style={{ fontSize: '64px', marginBottom: '20px', opacity: isDragActive ? 1 : 0.5 }}>
                {isDragActive ? '📂' : '🖼️'}
            </div>
            <h2 style={{ fontSize: '24px', marginBottom: '10px', color: '#ccc' }}>
                {isDragActive ? 'Drop image here...' : 'Please select an image'}
            </h2>
            <p style={{ fontSize: '14px' }}>
                Drag & Drop files here or click to browse
            </p>
        </div>
    );
};

export default DragDropZone;
