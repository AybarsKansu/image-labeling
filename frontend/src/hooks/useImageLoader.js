import { useState, useEffect, useCallback } from 'react';

export const useImageLoader = (onReset) => {
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [imageObj, setImageObj] = useState(null);

    // Layout
    const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight - 100 });
    const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, scale: 1 });

    // --- Window Resize ---
    useEffect(() => {
        const handleResize = () => {
            setStageSize({ width: window.innerWidth, height: window.innerHeight - 100 });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Load Image Object ---
    useEffect(() => {
        if (imageUrl) {
            const img = new window.Image();
            img.src = imageUrl;
            img.onload = () => setImageObj(img);
        }
    }, [imageUrl]);

    // --- Image Fit Calculation ---
    useEffect(() => {
        if (imageObj) {
            const stageW = stageSize.width;
            const stageH = stageSize.height;
            const imgW = imageObj.naturalWidth;
            const imgH = imageObj.naturalHeight;

            const scale = Math.min(stageW / imgW, stageH / imgH);

            const xOffset = (stageW - imgW * scale) / 2;
            const yOffset = (stageH - imgH * scale) / 2;

            setImageLayout({
                x: xOffset,
                y: yOffset,
                scale: scale
            });
        }
    }, [imageObj, stageSize]);

    // --- Handle Upload ---
    const handleImageUpload = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (event) => setImageUrl(event.target.result);
            reader.readAsDataURL(file);

            // Trigger external reset (clear annotations etc)
            if (onReset) onReset();

            e.target.value = '';
        }
    }, [onReset]);

    return {
        imageFile,
        imageUrl,
        imageObj,
        stageSize,
        imageLayout,
        setImageLayout, // For Zoom/Pan updates
        handleImageUpload
    };
};
