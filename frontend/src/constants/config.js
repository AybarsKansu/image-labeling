/**
 * Application Configuration Constants
 * Centralized configuration for API endpoints, tool settings, and model definitions
 */

// API Configuration
export const API_URL = 'http://localhost:8000/api';

// Tool Settings
export const ERASER_RADIUS = 20;

// Default Confidence Threshold (0-100)
export const DEFAULT_CONFIDENCE = 50;

// Default Model
export const DEFAULT_MODEL = 'yolov8m-seg.pt';

/**
 * Official AI Models Available for Download
 * Categorized by type: SAM for segmentation, YOLO for detection
 */
export const officialModels = [
    // --- SAM Series (Best for AI Box / Click Segment) ---
    {
        id: 'sam2.1_l.pt',
        name: 'SAM 2.1 Large',
        desc: '🥇 Best for AI Box. Maximum Precision.',
        type: 'sam'
    },
    {
        id: 'sam2.1_b.pt',
        name: 'SAM 2.1 Base',
        desc: 'Balanced Speed/Accuracy',
        type: 'sam'
    },
    {
        id: 'sam2.1_t.pt',
        name: 'SAM 2.1 Tiny',
        desc: 'Ultra Fast (Low VRAM)',
        type: 'sam'
    },

    // --- YOLO Series (Best for Detect All / Auto-Label) ---
    {
        id: 'yolo11x-seg.pt',
        name: 'YOLO11x Seg',
        desc: '🚀 2026 SOTA. Extreme Accuracy for "Detect All".',
        type: 'yolo'
    },
    {
        id: 'yolo11l-seg.pt',
        name: 'YOLO11l Seg',
        desc: 'Large model, great for fine details.',
        type: 'yolo'
    },
    {
        id: 'yolo11m-seg.pt',
        name: 'YOLO11m Seg',
        desc: 'Medium. Good balance if X is too slow.',
        type: 'yolo'
    },
    // Keep legacy v8 just in case
    {
        id: 'yolov8n-seg.pt',
        name: 'YOLOv8 Nano (Legacy)',
        desc: 'super fast, lower accuracy',
        type: 'yolo'
    }
];
