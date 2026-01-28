
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BASE_URL } from '../../constants/config';
import { Play, Pause, ChevronRight, ChevronLeft, Camera, Image as ImageIcon, Check, Trash2, Eye, X } from 'lucide-react';
import { useFileSystem } from '../../hooks/useFileSystem';
import clsx from 'clsx';

const VideoPlayerModal = ({ isOpen, onClose, videoInfo }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [sliderValue, setSliderValue] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverPosition, setHoverPosition] = useState(0);

    // Feedback States
    const [capturedFrames, setCapturedFrames] = useState([]);
    const [flash, setFlash] = useState(false);
    const [lastCaptureTime, setLastCaptureTime] = useState(null);
    const [previewFrame, setPreviewFrame] = useState(null);

    const { ingestFiles, files, removeFile } = useFileSystem();

    // Reset loop when modal opens
    useEffect(() => {
        if (isOpen) {
            setCapturedFrames([]);
            setIsPlaying(false);
            setCurrentTime(0);
            setSliderValue(0);
            setLastCaptureTime(null);
            setPreviewFrame(null);
        }
    }, [isOpen]);

    const fps = videoInfo?.fps || 30;
    const frameDuration = 1 / fps;

    // Format time as mm:ss.ms
    const formatTime = (time) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // --- Controls ---
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(p => !p);
    }, [isPlaying]);

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const t = videoRef.current.currentTime;
            setCurrentTime(t);
            // Only update slider if user is NOT dragging it
            if (!isSeeking) {
                setSliderValue(t);
            }
        }
    };

    const handleSeekChange = (e) => {
        const time = parseFloat(e.target.value);
        setSliderValue(time);
        setIsSeeking(true);
        // Optional: Seek immediately for responsiveness, but might lag
        if (videoRef.current) videoRef.current.currentTime = time;
    };

    const handleSeekUp = () => {
        setIsSeeking(false);
        if (videoRef.current) {
            videoRef.current.currentTime = sliderValue;
        }
    };

    const handleSliderHover = (e) => {
        const rect = e.target.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const time = position * (videoInfo?.duration || 0);
        setHoverTime(time);
        setHoverPosition(e.clientX - rect.left);
    };

    const handleSliderLeave = () => {
        setHoverTime(null);
    };

    const stepFrame = useCallback((direction) => {
        if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);

            // Use Math.round to snap to nearest frame grid to prevent drift
            const currentFrame = Math.round(videoRef.current.currentTime * fps);
            const nextFrame = currentFrame + direction;
            videoRef.current.currentTime = Math.max(0, nextFrame / fps);
        }
    }, [fps]);

    // --- Capture Frame Logic ---
    const captureFrame = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        // Visual Flash Effect
        setFlash(true);
        setTimeout(() => setFlash(false), 150);

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Sync dims
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to Blob
        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = video.currentTime.toFixed(2);
                const safeTimestamp = timestamp.replace('.', '_');
                const cleanName = videoInfo.filename.replace(/\.[^/.]+$/, "");
                const filename = `${cleanName}_${safeTimestamp}s.jpg`;

                const file = new File([blob], filename, { type: 'image/jpeg' });

                // Ingest into file system
                ingestFiles([file]);

                // Feedback Update
                setLastCaptureTime(Date.now());
                setCapturedFrames(prev => [
                    ...prev,
                    { id: Date.now(), time: timestamp, url: URL.createObjectURL(blob), filename }
                ]);
            }
        }, 'image/jpeg', 0.95);
    }, [ingestFiles, videoInfo]);

    // Delete frame
    const deleteFrame = useCallback(async (frameId) => {
        const frameToDelete = capturedFrames.find(f => f.id === frameId);
        if (!frameToDelete) return;

        setCapturedFrames(prev => prev.filter(f => f.id !== frameId));

        if (frameToDelete.filename) {
            // Find the actual FS file by matching filename
            // Note: files comes from useFileSystem hook
            const valFile = files?.find(f => f.name === frameToDelete.filename);
            if (valFile) {
                await removeFile(valFile.id);
            }
        }
    }, [capturedFrames, files, removeFile]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;

            // Prevent default scrolling for Space/Arrows
            if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }

            switch (e.code) {
                case 'Space':
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    stepFrame(-1);
                    break;
                case 'ArrowRight':
                    stepFrame(1);
                    break;
                case 'KeyC':
                case 'Enter':
                    captureFrame();
                    break;
                case 'Escape':
                    if (previewFrame) {
                        setPreviewFrame(null);
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, togglePlay, stepFrame, captureFrame, previewFrame]);


    if (!isOpen || !videoInfo) return null;

    const progressPercent = videoInfo?.duration ? (sliderValue / videoInfo.duration) * 100 : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
            <div className="flex flex-col h-full w-full bg-gray-950 text-white">

                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Camera className="w-4 h-4 text-purple-400" />
                        Capture Mode: <span className="font-normal opacity-75">{videoInfo.filename}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Content Area (Video + Sidebar) */}
                <div className="flex flex-1 overflow-hidden relative">

                    {/* Video Area (Center - Large) */}
                    <div className="flex-1 flex flex-col bg-black items-center justify-center relative group">

                        {/* Shutter Flash Effect */}
                        <div className={clsx("absolute inset-0 bg-white pointer-events-none z-20 transition-opacity duration-150", flash ? "opacity-30" : "opacity-0")} />

                        <video
                            ref={videoRef}
                            className="max-w-full max-h-[calc(100%-5rem)] object-contain"
                            src={`${BASE_URL}${videoInfo.video_url}`}
                            crossOrigin="anonymous"
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                            onClick={togglePlay}
                        />

                        {/* Hidden Canvas */}
                        <canvas ref={canvasRef} className="hidden" />

                        {/* Video Overlay Controls */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-100 group-hover:opacity-100 transition-opacity">

                            {/* Timeline Slider */}
                            <div className="relative mb-4">
                                {/* Hover Tooltip */}
                                {hoverTime !== null && (
                                    <div
                                        className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none z-10"
                                        style={{ left: hoverPosition }}
                                    >
                                        {formatTime(hoverTime)}
                                    </div>
                                )}

                                {/* Custom Slider Track */}
                                <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer group/slider">
                                    {/* Progress Fill */}
                                    <div
                                        className="absolute top-0 left-0 h-full bg-purple-500 rounded-full transition-all"
                                        style={{ width: `${progressPercent}%` }}
                                    />

                                    {/* Native Input (invisible but functional) */}
                                    <input
                                        type="range"
                                        min="0"
                                        max={videoInfo.duration}
                                        step="0.01"
                                        value={sliderValue}
                                        onChange={handleSeekChange}
                                        onMouseUp={handleSeekUp}
                                        onMouseMove={handleSliderHover}
                                        onMouseLeave={handleSliderLeave}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />

                                    {/* Slider Thumb */}
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/slider:opacity-100 transition-opacity pointer-events-none"
                                        style={{ left: `calc(${progressPercent}% - 8px)` }}
                                    />
                                </div>
                            </div>

                            {/* Control Bar */}
                            <div className="flex justify-between items-center">

                                {/* Left: Time Display */}
                                <span className="text-xs font-mono text-gray-300 min-w-[120px]">
                                    {formatTime(currentTime)} / {formatTime(videoInfo?.duration || 0)}
                                </span>

                                {/* Center: Playback Controls */}
                                <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
                                    <button
                                        onClick={() => stepFrame(-1)}
                                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white"
                                        title="Previous Frame (←)"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={togglePlay}
                                        className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white backdrop-blur-sm"
                                    >
                                        {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                                    </button>

                                    <button
                                        onClick={() => stepFrame(1)}
                                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white"
                                        title="Next Frame (→)"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Right: Capture Button */}
                                <button
                                    onClick={captureFrame}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all transform active:scale-95",
                                        lastCaptureTime && Date.now() - lastCaptureTime < 1000
                                            ? "bg-green-500 text-white"
                                            : "bg-purple-600 hover:bg-purple-500 text-white"
                                    )}
                                >
                                    {lastCaptureTime && Date.now() - lastCaptureTime < 1000 ? (
                                        <><Check className="w-4 h-4" /> Saved</>
                                    ) : (
                                        <>
                                            <Camera className="w-4 h-4" />
                                            Capture
                                            <span className="text-xs opacity-75 bg-black/20 px-1 rounded">C</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Captured Frames (Narrower Sidebar) */}
                    <div className="w-56 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
                        <div className="p-3 border-b border-gray-800 font-semibold text-xs uppercase tracking-wider text-gray-400 flex justify-between items-center">
                            <span>Captured ({capturedFrames.length})</span>
                            {capturedFrames.length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {capturedFrames.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm">
                                    <Camera className="w-10 h-10 mb-3 opacity-30" />
                                    <p className="opacity-50">No frames captured</p>
                                    <p className="text-xs opacity-30 mt-1">Press C to capture</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 content-start">
                                    {capturedFrames.slice().reverse().map((frame) => (
                                        <div
                                            key={frame.id}
                                            className="aspect-video bg-gray-800 rounded border border-gray-700 overflow-hidden relative group/thumb cursor-pointer"
                                        >
                                            <img
                                                src={frame.url}
                                                alt=""
                                                className="w-full h-full object-cover opacity-75 group-hover/thumb:opacity-100 transition-opacity"
                                            />

                                            {/* Time Badge */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[9px] text-white font-mono text-center">
                                                {frame.time}s
                                            </div>

                                            {/* Hover Actions */}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setPreviewFrame(frame)}
                                                    className="p-1.5 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                                    title="Preview"
                                                >
                                                    <Eye className="w-4 h-4 text-white" />
                                                </button>
                                                <button
                                                    onClick={() => deleteFrame(frame.id)}
                                                    className="p-1.5 bg-white/20 hover:bg-red-500/80 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4 text-white" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Info Bar */}
                <div className="py-1.5 px-3 bg-black text-[10px] font-mono text-gray-500 flex justify-center gap-4 border-t border-gray-900 flex-shrink-0">
                    <span>RES: {videoInfo.width}x{videoInfo.height}</span>
                    <span className="opacity-50">|</span>
                    <span>FPS: {fps.toFixed(2)}</span>
                    <span className="opacity-50">|</span>
                    <span>FRAMES: {videoInfo.frame_count}</span>
                </div>
            </div>

            {/* Preview Modal */}
            {previewFrame && (
                <div
                    className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-8"
                    onClick={() => setPreviewFrame(null)}
                >
                    <div className="relative max-w-4xl max-h-full">
                        <img
                            src={previewFrame.url}
                            alt=""
                            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-lg text-white text-sm font-mono">
                            {previewFrame.filename} ({previewFrame.time}s)
                        </div>
                        <button
                            onClick={() => setPreviewFrame(null)}
                            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoPlayerModal;
