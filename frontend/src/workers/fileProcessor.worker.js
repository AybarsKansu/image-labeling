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
    for (const file of files) {
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

    // Extract class names
    let classNames = [];
    if (classesContent) {
        classNames = parseClassesFile(classesContent);
    }

    // Process images: generate thumbnails
    const processedImages = [];
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        // Extract dimensions and generate thumbnail
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

        processedImages.push({
            name: img.file.name,
            baseName: img.baseName,
            path: img.file.webkitRelativePath || '',
            type: 'image',
            blob: img.file,
            thumbnail: thumbnail,
            width,
            height
        });

        // Report progress
        self.postMessage({
            type: 'PROCESS_PROGRESS',
            payload: { processed: i + 1, total: images.length + labels.length }
        });
    }

    // Process labels
    const processedLabels = [];
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const labelText = await readFileAsText(label.file);

        if (classNames.length === 0) {
            const embeddedClasses = extractEmbeddedClasses(labelText);
            if (embeddedClasses.length > 0) classNames = embeddedClasses;
        }

        processedLabels.push({
            name: label.file.name,
            baseName: label.baseName,
            path: label.file.webkitRelativePath || '',
            type: 'label',
            data: labelText
        });

        // Report progress
        self.postMessage({
            type: 'PROCESS_PROGRESS',
            payload: { processed: images.length + i + 1, total: images.length + labels.length }
        });
    }

    return {
        images: processedImages,
        labels: processedLabels,
        classNames: classNames
    };
}

/**
 * Generate a thumbnail from an ImageBitmap.
 */
async function generateThumbnailFromBitmap(imageBitmap, maxSize = 100) {
    // Calculate dimensions
    const { width, height } = imageBitmap;
    let newWidth, newHeight;

    if (width > height) {
        newWidth = maxSize;
        newHeight = Math.round((height / width) * maxSize);
    } else {
        newHeight = maxSize;
        newWidth = Math.round((width / height) * maxSize);
    }

    // Use OffscreenCanvas for off-main-thread rendering
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

    // Convert to blob
    const thumbnailBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });

    // Convert to base64 for easy storage and display
    const arrayBuffer = await thumbnailBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    return `data:image/jpeg;base64,${base64}`;
}

/**
 * Read file as text.
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

/**
 * Parse classes.txt content.
 * Each line is a class name.
 */
function parseClassesFile(content) {
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Extract embedded class names from label file.
 * Looks for: # classes: dog, cat, car
 */
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
