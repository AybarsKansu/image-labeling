export const MODEL_CONFIG = {
    // Template for YOLO Models
    'yolo': {
        type: 'YOLO',
        // Default label is generic, specific model name will be used in UI usually
        label: 'YOLO Model',
        parameters: [
            { key: 'conf', label: 'Confidence', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.25, help: 'Minimum confidence score.' },
            { key: 'iou', label: 'IOU Threshold', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.45, help: 'Intersection over Union threshold.' },
            { key: 'retina_masks', label: 'Retina Masks', type: 'switch', default: true, help: 'Generate high-resolution masks.' },
            { key: 'tile_size', label: 'Tile Size', type: 'number', min: 320, max: 1500, step: 32, default: 640, help: 'Tile size for SAHI inference.' },
            { key: 'tile_overlap', label: 'Tile Overlap', type: 'slider', min: 0.0, max: 0.5, step: 0.05, default: 0.25, help: 'Overlap between tiles.' }
        ]
    },
    // Template for SAM Models
    'sam': {
        type: 'SAM',
        label: 'Segment Anything',
        parameters: [
            { key: 'box_padding', label: 'Box Padding', type: 'slider', min: 0, max: 100, step: 1, default: 0, help: 'Expands the input box by pixels.' },
            { key: 'use_hq', label: 'Use HQ Model', type: 'switch', default: false, help: 'Use High-Quality model (slower).' }
        ]
    }
};

/**
 * Helper to get config for a specific filename.
 * Dynamically determines config based on filename patterns.
 */
export const getModelConfig = (filename) => {
    if (!filename) return null;

    const lower = filename.toLowerCase();

    // Check for YOLO models
    if (lower.includes('yolo')) {
        return {
            ...MODEL_CONFIG['yolo'],
            label: filename // Use the actual filename as label or keep generic? Usually filename is better for transparency
        };
    }

    // Check for SAM models
    if (lower.includes('sam')) {
        return {
            ...MODEL_CONFIG['sam'],
            label: filename
        };
    }

    // Default Fallback
    return {
        type: 'Unknown',
        label: filename,
        parameters: []
    };
};
