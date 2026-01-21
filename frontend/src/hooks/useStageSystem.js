import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useStageSystem Hook
 * Manages canvas/stage state including zoom, pan, and image layout
 */
export const useStageSystem = () => {
    // --- State ---
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [imageObj, setImageObj] = useState(null);
    const [stageSize, setStageSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight - 100
    });
    const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, scale: 1 });

    // --- Refs ---
    const stageRef = useRef(null);
    const groupRef = useRef(null);

    // --- Window Resize Handler ---
    useEffect(() => {
        const handleResize = () => {
            setStageSize({
                width: window.innerWidth,
                height: window.innerHeight - 100
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Image Fit on Load ---
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

    // --- Load image when URL changes ---
    useEffect(() => {
        if (imageUrl) {
            const img = new window.Image();
            img.src = imageUrl;
            img.onload = () => setImageObj(img);
        }
    }, [imageUrl]);

    // --- Zoom Handler (Wheel) ---
    const handleWheel = useCallback((e) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const oldScale = imageLayout.scale;
        const pointer = stage.getPointerPosition();
        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Calculate new position to zoom towards pointer
        const mousePointTo = {
            x: (pointer.x - imageLayout.x) / oldScale,
            y: (pointer.y - imageLayout.y) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };

        setImageLayout({
            scale: newScale,
            x: newPos.x,
            y: newPos.y
        });
    }, [imageLayout]);

    // --- Image Upload Handler ---
    const handleImageUpload = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (event) => setImageUrl(event.target.result);
            reader.readAsDataURL(file);
            // Reset input to allow re-selecting same file
            e.target.value = '';
            return file;
        }
        return null;
    }, []);

    // --- Get Relative Pointer Position with Pan/Zoom ---
    const getRelativePointerPosition = useCallback(() => {
        if (!groupRef.current || !stageRef.current) return { x: 0, y: 0 };
        const transform = groupRef.current.getAbsoluteTransform().copy();
        transform.invert();
        const pos = stageRef.current.getPointerPosition();
        return transform.point(pos);
    }, []);

    // --- Close/Reset Image ---
    const closeImage = useCallback(() => {
        setImageFile(null);
        setImageUrl(null);
        setImageObj(null);
        setImageLayout({ x: 0, y: 0, scale: 1 });
    }, []);

    // --- Pan Image ---
    const panImage = useCallback((deltaX, deltaY) => {
        setImageLayout(prev => ({
            ...prev,
            x: prev.x + deltaX,
            y: prev.y + deltaY
        }));
    }, []);

    return {
        // State
        imageFile,
        imageUrl,
        imageObj,
        stageSize,
        imageLayout,

        // Refs
        stageRef,
        groupRef,

        // Actions
        setImageLayout,
        handleWheel,
        handleImageUpload,
        getRelativePointerPosition,
        closeImage,
        panImage,

        // Setters (for external control)
        setImageFile,
        setImageUrl,
        setImageObj
    };
};

export default useStageSystem;
