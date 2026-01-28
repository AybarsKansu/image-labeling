/**
 * File Processor Web Worker
 * 
 * Handles off-main-thread operations:
 * 1. Thumbnail generation using OffscreenCanvas
 * 2. File pairing (image + label matching)
 * 3. Class name extraction from classes.txt or embedded metadata
 */

// Message handler
self.onmessage = async function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'PROCESS_FILES':
            try {
                const result = await processFiles(payload.files);
                self.postMessage({ type: 'PROCESS_COMPLETE', payload: result });
            } catch (error) {
                self.postMessage({ type: 'PROCESS_ERROR', payload: { error: error.message } });
            }
            break;

        case 'GENERATE_THUMBNAIL':
            try {
                const thumbnail = await generateThumbnail(payload.blob, payload.maxSize || 100);
                self.postMessage({ type: 'THUMBNAIL_COMPLETE', payload: { id: payload.id, thumbnail } });
            } catch (error) {
                self.postMessage({ type: 'THUMBNAIL_ERROR', payload: { id: payload.id, error: error.message } });
            }
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};

/**
 * Process a batch of files:
 * - Separate images from labels
 * - Generate thumbnails for images
 * - Pair images with labels by filename
 * - Extract class names
 */
async function processFiles(files) {
    const images = [];
    const labels = [];
    let classesContent = null;

    // Categorize files
    for (const item of files) {
        const file = item.file || item;
        // Attach custom path locally if provided in wrapper
        if (item._customPath) file._customPath = item._customPath;

        const ext = file.name.split('.').pop().toLowerCase();
        const baseName = file.name.replace(/\.[^/.]+$/, '');

        if (file.name === 'classes.txt') {
            // Global classes file
            classesContent = await readFileAsText(file);
        } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) {
            images.push({ file, baseName, ext });
        } else if (['txt', 'xml', 'json'].includes(ext)) {
            labels.push({ file, baseName, ext });
        }
    }

    // Process images with Adaptive Batching
    const processedImages = [];

    // Initial batch size heuristic: 5 * logical cores (or 10 if unknown)
    const initialBatch = (navigator.hardwareConcurrency || 2) * 5;
    let batchSize = Math.max(10, Math.min(initialBatch, 50)); // Clamp between 10 and 50
    const TARGET_TIME_MS = 300; // Aim for ~300ms per batch

    let processedCount = 0;
    while (processedCount < images.length) {
        const startTime = performance.now();

        const chunk = images.slice(processedCount, processedCount + batchSize);

        // Process this chunk in parallel
        const results = await Promise.all(chunk.map(async (img) => {
            let thumbnail = null;
            let width = 0;
            let height = 0;
            try {
                const imageBitmap = await createImageBitmap(img.file);
                width = imageBitmap.width;
                height = imageBitmap.height;
                thumbnail = await generateThumbnailFromBitmap(imageBitmap, 100);
                imageBitmap.close();
            } catch (err) {
                console.warn(`Failed to process image ${img.file.name}:`, err);
            }

            return {
                name: img.file.name,
                baseName: img.baseName,
                path: getPath(img.file),
                type: 'image',
                blob: img.file,
                thumbnail: thumbnail,
                width,
                height
            };
        }));

        processedImages.push(...results);
        processedCount += chunk.length;

        // Feedback Update
        self.postMessage({
            type: 'PROCESS_PROGRESS',
            payload: { processed: processedCount, total: images.length + labels.length }
        });

        // Adaptive Logic: Adjust batch size for next iteration
        const duration = performance.now() - startTime;

        if (duration < TARGET_TIME_MS * 0.75) {
            // Very fast? Increase size (max 50 to avoid memory spikes)
            batchSize = Math.min(50, Math.ceil(batchSize + 10));
        } else if (duration > TARGET_TIME_MS * 1.5) {
            // Too slow? Decrease size (min 5)
            batchSize = Math.max(5, Math.floor(batchSize - 5));
        }

        // Optional debugging
        // console.log(`Batch processed: ${chunk.length} items in ${duration.toFixed(0)}ms. New Batch Size: ${batchSize}`);
    }

    // Process labels
    const processedLabels = [];
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const labelText = await readFileAsText(label.file);
        const embedded = extractEmbeddedClasses(labelText);

        processedLabels.push({
            name: label.file.name,
            baseName: label.baseName,
            path: getPath(label.file),
            type: 'label',
            data: labelText,
            embeddedClasses: embedded
        });

        self.postMessage({
            type: 'PROCESS_PROGRESS',
            payload: { processed: images.length + i + 1, total: images.length + labels.length }
        });
    }

    return {
        images: processedImages,
        labels: processedLabels,
        classNames: classesContent ? parseClassesFile(classesContent) : [],
        isGlobalClasses: !!classesContent
    };
}

function getPath(file) {
    let p = file._customPath || file.path || file.webkitRelativePath || '';
    if (typeof p === 'string' && p.startsWith('/')) p = p.substring(1);
    return p;
}

async function generateThumbnailFromBitmap(imageBitmap, maxSize = 100) {
    const { width, height } = imageBitmap;
    let newWidth, newHeight;

    if (width > height) {
        newWidth = maxSize;
        newHeight = Math.round((height / width) * maxSize);
    } else {
        newHeight = maxSize;
        newWidth = Math.round((width / height) * maxSize);
    }

    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

    const thumbnailBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const arrayBuffer = await thumbnailBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    return `data:image/jpeg;base64,${base64}`;
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function parseClassesFile(content) {
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

function extractEmbeddedClasses(labelText) {
    const lines = labelText.split('\n');
    for (const line of lines) {
        const match = line.match(/^#\s*classes?:\s*(.+)$/i);
        if (match) {
            return match[1].split(',').map(c => c.trim()).filter(c => c);
        }
    }
    return [];
}
