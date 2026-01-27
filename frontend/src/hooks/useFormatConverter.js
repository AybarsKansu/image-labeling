/**
 * useFormatConverter Hook
 * 
 * React hook for importing/exporting annotations in multiple formats.
 * Supports single-file aggregation for batch operations.
 * 
 * Supported formats:
 * - COCO (.json) - Native multi-image support
 * - YOLO Aggregated (.txt) - Manifest style with image paths
 * - Pascal VOC Aggregated (.xml) - Dataset root with multiple annotations
 * - TOON (.json) - Custom efficient format
 */

import { useCallback } from 'react';
import { AnnotationConverter } from '../utils/annotationConverter';
import { generateId } from '../utils/helpers';

/**
 * Hook for format conversion operations
 */
export function useFormatConverter() {

    /**
     * Detect the format of raw file content
     * @param {string} content - Raw file content
     * @returns {string} Format identifier
     */
    const detectFormat = useCallback((content) => {
        return AnnotationConverter.detectFormat(content);
    }, []);

    /**
     * Parse annotations from file content
     * @param {string|Object} content - File content (string for txt/xml, object for json)
     * @param {Array} projectImages - Array of {name, width, height} representing project images
     * @param {string} format - Optional format override. If not provided, auto-detect.
     * @returns {Object} { annotations: {imageName: [ann, ...]}, categories: [], orphans: [] }
     */
    const parseAnnotations = useCallback((content, projectImages = [], format = null) => {
        // Handle JSON objects (already parsed)
        let rawContent = content;
        let parsedJson = null;

        if (typeof content === 'object' && content !== null) {
            parsedJson = content;
            rawContent = JSON.stringify(content); // For format detection
        }

        // Auto-detect format if not specified
        const detectedFormat = format || AnnotationConverter.detectFormat(rawContent);

        console.log(`[FormatConverter] Parsing as: ${detectedFormat}`);

        try {
            switch (detectedFormat) {
                case 'coco':
                    const cocoData = parsedJson || JSON.parse(rawContent);
                    return AnnotationConverter.parseBatchCoco(cocoData, projectImages);

                case 'toon':
                    // Single-image TOON - convert to batch format
                    const toonData = parsedJson || JSON.parse(rawContent);
                    const toonResult = AnnotationConverter.toonToInternal(toonData);
                    const toonFileName = toonData.m?.[0] || 'image.jpg';
                    return {
                        annotations: { [toonFileName]: toonResult.annotations },
                        categories: toonResult.categories,
                        orphans: []
                    };

                case 'toon-batch':
                    const batchToonData = parsedJson || JSON.parse(rawContent);
                    return AnnotationConverter.parseBatchToon(batchToonData, projectImages);

                case 'voc':
                    // Single VOC XML - convert to batch format
                    const vocResult = AnnotationConverter.vocToCoco(rawContent);
                    const vocFileName = vocResult.images?.[0]?.file_name || 'image.jpg';
                    const vocInternal = AnnotationConverter.cocoToInternal(vocResult);
                    return {
                        annotations: { [vocFileName]: vocInternal.annotations },
                        categories: vocInternal.categories,
                        orphans: []
                    };

                case 'voc-aggregated':
                    return AnnotationConverter.parseAggregatedVoc(rawContent, projectImages);

                case 'yolo':
                    // Standard YOLO - need image context
                    // For single YOLO, we can't determine which image it belongs to
                    // Return as annotations for first project image
                    if (projectImages.length === 0) {
                        throw new Error('Cannot parse single YOLO file without image context');
                    }
                    const firstImage = projectImages[0];
                    const yoloCoco = AnnotationConverter.yoloToCoco(
                        rawContent,
                        firstImage.width || 1,
                        firstImage.height || 1
                    );
                    const yoloInternal = AnnotationConverter.cocoToInternal(yoloCoco);
                    return {
                        annotations: { [firstImage.name]: yoloInternal.annotations },
                        categories: yoloInternal.categories,
                        orphans: []
                    };

                case 'yolo-aggregated':
                    return AnnotationConverter.parseAggregatedYolo(rawContent, projectImages);

                default:
                    throw new Error(`Unknown or unsupported format: ${detectedFormat}`);
            }
        } catch (error) {
            console.error('[FormatConverter] Parse error:', error);
            throw error;
        }
    }, []);

    /**
     * Generate annotation file content for export
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @param {string} format - Target format: 'coco' | 'yolo' | 'voc' | 'toon'
     * @returns {Object} { content: string|object, extension: string, mimeType: string }
     */
    const generateAnnotations = useCallback((imagesData, format) => {
        // Ensure all annotations have IDs
        const normalizedData = imagesData.map(item => ({
            file: item.file,
            annotations: (item.annotations || []).map(ann => ({
                ...ann,
                id: ann.id || generateId()
            }))
        }));

        console.log(`[FormatConverter] Generating ${format} for ${normalizedData.length} image(s)`);

        switch (format.toLowerCase()) {
            case 'coco':
                return {
                    content: JSON.stringify(AnnotationConverter.generateBatchCoco(normalizedData), null, 2),
                    extension: '.json',
                    mimeType: 'application/json',
                    filename: `annotations_coco.json`
                };

            case 'yolo':
                return {
                    content: AnnotationConverter.generateAggregatedYolo(normalizedData),
                    extension: '.txt',
                    mimeType: 'text/plain',
                    filename: `annotations_yolo.txt`
                };

            case 'voc':
                return {
                    content: AnnotationConverter.generateAggregatedVoc(normalizedData),
                    extension: '.xml',
                    mimeType: 'application/xml',
                    filename: `annotations_voc.xml`
                };

            case 'toon':
                return {
                    content: JSON.stringify(AnnotationConverter.generateBatchToon(normalizedData), null, 2),
                    extension: '.json',
                    mimeType: 'application/json',
                    filename: `annotations_toon.json`
                };

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }, []);

    /**
     * Download generated annotations as a file
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @param {string} format - Target format
     * @param {string} customFilename - Optional custom filename (without extension)
     */
    const downloadAnnotations = useCallback((imagesData, format, customFilename = null) => {
        const result = generateAnnotations(imagesData, format);

        const filename = customFilename
            ? `${customFilename}${result.extension}`
            : result.filename;

        const blob = new Blob([result.content], { type: result.mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        console.log(`[FormatConverter] Downloaded: ${filename}`);
        return { success: true, filename };
    }, [generateAnnotations]);

    /**
     * Read file content from a File object
     * @param {File} file - File to read
     * @returns {Promise<string>} File content as string
     */
    const readFileContent = useCallback((file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }, []);

    /**
     * Import annotations from a File object
     * @param {File} file - The file to import
     * @param {Array} projectImages - Array of project images for matching
     * @returns {Promise<Object>} Import result with annotations and stats
     */
    const importFromFile = useCallback(async (file, projectImages) => {
        try {
            const content = await readFileContent(file);
            const result = parseAnnotations(content, projectImages);

            // Calculate stats
            const matchedImages = Object.keys(result.annotations).length;
            let totalAnnotations = 0;
            Object.values(result.annotations).forEach(anns => {
                totalAnnotations += anns.length;
            });

            return {
                success: true,
                annotations: result.annotations,
                categories: result.categories,
                orphans: result.orphans,
                stats: {
                    matchedImages,
                    totalAnnotations,
                    orphanCount: result.orphans.length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                annotations: {},
                categories: [],
                orphans: []
            };
        }
    }, [readFileContent, parseAnnotations]);

    return {
        detectFormat,
        parseAnnotations,
        generateAnnotations,
        downloadAnnotations,
        readFileContent,
        importFromFile
    };
}

export default useFormatConverter;
