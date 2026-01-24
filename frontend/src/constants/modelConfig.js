export const MODEL_CONFIG = {
    // Template for YOLO Models
    'yolo': {
        type: 'YOLO',
        // Default label is generic, specific model name will be used in UI usually
        label: 'YOLO Model',
        parameters: [
            { key: 'conf', label: 'Confidence', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.25, help: 'Minimum confidence score.' },
            { key: 'iou', label: 'IOU Threshold', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.45, help: 'Intersection over Union threshold.' },
            { key: 'max_det', label: 'Max Detections', type: 'slider', min: 1, max: 1000, step: 1, default: 300, help: 'Maximum number of objects to detect.' },
            { key: 'retina_masks', label: 'Retina Masks', type: 'switch', default: true, help: 'Generate high-resolution masks.' },
            { key: 'enable_tiling', label: 'Enable Tiling', type: 'switch', default: false, help: 'Use SAHI slicing. Disable for faster, full-image inference.' },
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
            { key: 'use_hq', label: 'Use HQ Model', type: 'switch', default: false, help: 'Use High-Quality model (slower).' },
            { key: 'enable_yolo_verification', label: 'Verify with Yolo', type: 'switch', default: false, help: 'Use YOLO to verify text prompt grounding.' }
        ]
    },
    // Template for Grounding DINO
    'grounding-dino': {
        type: 'Grounding DINO',
        label: 'Grounding DINO',
        parameters: [
            { key: 'box_threshold', label: 'Box Threshold', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.35, help: 'Lower to detect more objects, raise to reduce noise.' },
            { key: 'text_threshold', label: 'Text Threshold', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.25, help: 'Similarity threshold for text matching.' },
            { key: 'inference_mode', label: 'Inference Mode', type: 'select', default: 'standard', options: ['standard', 'tiled', 'smart_focus'], help: 'Strategy: Standard (Full), Tiled (Small Objs), Smart Focus (Large/Sparse).' },
            { key: 'tile_size', label: 'Tile Size', type: 'number', min: 320, max: 2000, step: 32, default: 640, help: 'Size of tiles for Tiled Inference.' },
            { key: 'tile_overlap', label: 'Tile Overlap', type: 'slider', min: 0.0, max: 0.5, step: 0.05, default: 0.25, help: 'Overlap ratio between tiles.' },
            { key: 'sam_sensitivity', label: 'SAM Sensitivity', type: 'slider', min: 0.0, max: 1.0, step: 0.01, default: 0.5, help: 'Confidence threshold for Smart Focus candidate generation.' },
            { key: 'sam_model_name', label: 'SAM Model', type: 'select', default: 'sam2.1_l.pt', options: ['sam2.1_l.pt', 'sam2.1_b.pt', 'sam2.1_t.pt'], help: 'Model for Smart Focus candidates & refinement.' },
            { key: 'use_sam', label: 'Refine with SAM', type: 'switch', default: true, help: 'Refine detections with Segment Anything Model.' }
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

    // Check for Grounding DINO
    if (lower.includes('grounding') || lower.includes('dino')) {
        return {
            ...MODEL_CONFIG['grounding-dino'],
            label: filename
        };
    }

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

    // Default Fallback / Custom YOLO Models
    // If it's a .pt file and wasn't caught above, assume it's a YOLO model (e.g. custom training)
    if (lower.endsWith('.pt')) {
        return {
            ...MODEL_CONFIG['yolo'],
            label: filename
        };
    }

    // Truly Unknown
    return {
        type: 'Unknown',
        label: filename,
        parameters: []
    };
};
