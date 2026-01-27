/**
 * ExportModal Component
 * 
 * Modal dialog for selecting annotation export format.
 * Supports COCO, YOLO, Pascal VOC, and TOON formats.
 */

import React, { useState } from 'react';
import './ExportModal.css';

const EXPORT_FORMATS = [
    {
        id: 'coco',
        name: 'COCO JSON',
        description: 'Industry standard format with full segmentation support',
        icon: '🏛️',
        extension: '.json'
    },
    {
        id: 'yolo',
        name: 'YOLO Manifest',
        description: 'Aggregated text format with normalized coordinates',
        icon: '⚡',
        extension: '.txt'
    },
    {
        id: 'voc',
        name: 'Pascal VOC XML',
        description: 'Aggregated XML with bounding boxes (polygons → boxes)',
        icon: '📦',
        extension: '.xml'
    },
    {
        id: 'toon',
        name: 'TOON Format',
        description: 'Compact custom format for efficient storage',
        icon: '💾',
        extension: '.json'
    }
];

const ExportModal = ({
    isOpen,
    onClose,
    onExport,
    imageCount = 0,
    annotationCount = 0,
    mode = 'batch' // 'batch' or 'single'
}) => {
    const [selectedFormat, setSelectedFormat] = useState('coco');
    const [isExporting, setIsExporting] = useState(false);

    if (!isOpen) return null;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await onExport(selectedFormat);
            onClose();
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const title = mode === 'single' ? 'Export Current Image' : 'Export Project';
    const subtitle = mode === 'single'
        ? `1 image with annotations`
        : `${imageCount} images, ${annotationCount} annotations`;

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal" onClick={e => e.stopPropagation()}>
                <div className="export-modal-header">
                    <h2>{title}</h2>
                    <span className="export-subtitle">{subtitle}</span>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="export-modal-body">
                    <div className="format-grid">
                        {EXPORT_FORMATS.map(format => (
                            <div
                                key={format.id}
                                className={`format-card ${selectedFormat === format.id ? 'selected' : ''}`}
                                onClick={() => setSelectedFormat(format.id)}
                            >
                                <div className="format-icon">{format.icon}</div>
                                <div className="format-info">
                                    <span className="format-name">{format.name}</span>
                                    <span className="format-ext">{format.extension}</span>
                                </div>
                                <p className="format-description">{format.description}</p>
                                <div className="format-radio">
                                    <input
                                        type="radio"
                                        name="format"
                                        checked={selectedFormat === format.id}
                                        onChange={() => setSelectedFormat(format.id)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="export-modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleExport}
                        disabled={isExporting || (mode === 'batch' && imageCount === 0)}
                    >
                        {isExporting ? '⏳ Exporting...' : `📥 Export as ${selectedFormat.toUpperCase()}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
