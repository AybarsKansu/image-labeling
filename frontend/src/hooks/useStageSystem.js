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

    // --- Window/Container Resize Handler ---
    // We now export setStageSize so the parent can update it based on the container
    useEffect(() => {
        const handleResize = () => {
            // Fallback if no container logic is implemented upstream yet
            // usage of setStageSize from App.jsx's ResizeObserver will override this
            setStageSize({
                width: window.innerWidth,
                height: window.innerHeight - 56 // Minus Toolbar height approx
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Image Fit on Load ---
    const lastImageSrcRef = useRef(null);

    useEffect(() => {
        if (imageObj) {
            // Only reset layout if it's a new image source
            if (lastImageSrcRef.current !== imageObj.src) {
                lastImageSrcRef.current = imageObj.src;

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
        if (!pointer) return;

        const scaleBy = 1.15;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Constraint scale
        const constrainedScale = Math.min(Math.max(newScale, 0.05), 50);

        const mousePointTo = {
            x: (pointer.x - imageLayout.x) / oldScale,
            y: (pointer.y - imageLayout.y) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * constrainedScale,
            y: pointer.y - mousePointTo.y * constrainedScale,
        };

        setImageLayout({
            scale: constrainedScale,
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
        setStageSize,
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
