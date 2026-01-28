
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronRight, ChevronLeft, Camera, Image as ImageIcon, Check, Trash2, Eye, X, Upload } from 'lucide-react';
import { useFileSystem } from '../hooks/useFileSystem';
import { useVideoUpload } from '../hooks/useVideoUpload';
import { BASE_URL } from '../constants/config';
import clsx from 'clsx';
import DragDropZone from '../components/Common/DragDropZone';

const VideoStudio = () => {
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
    const { videoInfo, startUpload, isUploading, uploadProgress, reset: resetUpload } = useVideoUpload();

    // Reset loop when video loads
    useEffect(() => {
        if (videoInfo) {
            setCapturedFrames([]);
            setIsPlaying(false);
            setCurrentTime(0);
            setSliderValue(0);
            setLastCaptureTime(null);
            setPreviewFrame(null);
        }
    }, [videoInfo]);

    const fps = videoInfo?.fps || 30;

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
            const valFile = files?.find(f => f.name === frameToDelete.filename);
            if (valFile) {
                await removeFile(valFile.id);
            }
        }
    }, [capturedFrames, files, removeFile]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!videoInfo) return;

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
    }, [videoInfo, togglePlay, stepFrame, captureFrame, previewFrame]);

    const handleVideoUpload = useCallback((e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            if (file.type.startsWith('video/')) {
                startUpload(file);
            } else {
                alert("Please upload a video file.");
            }
        }
    }, [startUpload]);

    // --- UPLOAD VIEW ---
    if (!videoInfo) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-theme-primary p-12">
                <div className="max-w-xl w-full bg-theme-secondary border border-theme rounded-2xl p-12 text-center shadow-2xl">
                    <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Upload className="w-10 h-10 text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Upload Video</h2>
                    <p className="text-gray-400 mb-8">Select a video file to start capturing frames.</p>

                    {isUploading ? (
                        <div className="w-full">
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-400">{uploadProgress}% Uploaded</p>
                        </div>
                    ) : (
                        <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg cursor-pointer transition-colors">
                            <Upload className="w-5 h-5" />
                            Select Video
                            <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={handleVideoUpload}
                            />
                        </label>
                    )}
                </div>
            </div>
        );
    }

    const progressPercent = videoInfo?.duration ? (sliderValue / videoInfo.duration) * 100 : 0;

    return (
        <div className="flex flex-col h-full w-full bg-gray-950 text-white">

            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Camera className="w-4 h-4 text-purple-400" />
                    Capture Mode: <span className="font-normal opacity-75">{videoInfo.filename}</span>
                </h2>
                <button
                    onClick={resetUpload}
                    className="text-gray-400 hover:text-white transition-colors px-3 py-1 hover:bg-white/10 rounded text-xs font-medium"
                >
                    Change Video
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Video Area */}
                <div className="flex-1 flex flex-col bg-black items-center justify-center relative group">

                    <div className={clsx("absolute inset-0 bg-white pointer-events-none z-20 transition-opacity duration-150", flash ? "opacity-30" : "opacity-0")} />

                    <video
                        ref={videoRef}
                        className="max-w-full max-h-[calc(100%-8rem)] object-contain"
                        src={`${BASE_URL}${videoInfo.video_url}`}
                        crossOrigin="anonymous"
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                        onClick={togglePlay}
                    />

                    <canvas ref={canvasRef} className="hidden" />

                    {/* Timeline & Controls */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 opacity-100 group-hover:opacity-100 transition-opacity">

                        {/* Slider */}
                        <div className="relative mb-6 mx-4">
                            {hoverTime !== null && (
                                <div
                                    className="absolute -top-10 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none z-10 border border-gray-700"
                                    style={{ left: hoverPosition }}
                                >
                                    {formatTime(hoverTime)}
                                </div>
                            )}

                            <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer group/slider">
                                <div
                                    className="absolute top-0 left-0 h-full bg-purple-500 rounded-full transition-all"
                                    style={{ width: `${progressPercent}%` }}
                                />
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
                            </div>
                        </div>

                        {/* Control Bar */}
                        <div className="flex justify-between items-center px-4">
                            <span className="text-xs font-mono text-gray-300 min-w-[120px]">
                                {formatTime(currentTime)} / {formatTime(videoInfo?.duration || 0)}
                            </span>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => stepFrame(-1)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white"
                                >
                                    <ChevronLeft className="w-6 h-6" />
                                </button>

                                <button
                                    onClick={togglePlay}
                                    className="p-4 bg-white hover:bg-gray-200 rounded-full transition-colors text-black shadow-lg shadow-white/10"
                                >
                                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                                </button>

                                <button
                                    onClick={() => stepFrame(1)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white"
                                >
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                            </div>

                            <button
                                onClick={captureFrame}
                                className={clsx(
                                    "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all transform active:scale-95 shadow-lg",
                                    lastCaptureTime && Date.now() - lastCaptureTime < 1000
                                        ? "bg-green-500 text-white"
                                        : "bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-500/20"
                                )}
                            >
                                {lastCaptureTime && Date.now() - lastCaptureTime < 1000 ? (
                                    <><Check className="w-4 h-4" /> Saved</>
                                ) : (
                                    <>
                                        <Camera className="w-4 h-4" />
                                        Capture Frame
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Captured Frames Sidebar */}
                <div className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-gray-800 font-semibold text-xs uppercase tracking-wider text-gray-400 flex justify-between items-center">
                        <span>Captured ({capturedFrames.length})</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                        {capturedFrames.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm">
                                <Camera className="w-12 h-12 mb-4 opacity-20" />
                                <p className="opacity-40">No frames captured</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 content-start">
                                {capturedFrames.slice().reverse().map((frame) => (
                                    <div
                                        key={frame.id}
                                        className="aspect-video bg-gray-800 rounded-lg border border-gray-700 overflow-hidden relative group/thumb cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <img
                                            src={frame.url}
                                            alt=""
                                            className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity"
                                        />

                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[9px] text-white font-mono text-center">
                                            {frame.time}s
                                        </div>

                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => setPreviewFrame(frame)}
                                                className="p-1.5 bg-white/20 hover:bg-white/30 rounded transition-colors"
                                            >
                                                <Eye className="w-4 h-4 text-white" />
                                            </button>
                                            <button
                                                onClick={() => deleteFrame(frame.id)}
                                                className="p-1.5 bg-white/20 hover:bg-red-500/80 rounded transition-colors"
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

            {/* Preview Modal */}
            {previewFrame && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8"
                    onClick={() => setPreviewFrame(null)}
                >
                    <div className="relative max-w-5xl max-h-full">
                        <img
                            src={previewFrame.url}
                            alt=""
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-lg text-white text-sm font-mono backdrop-blur-md border border-white/10">
                            {previewFrame.filename} ({previewFrame.time}s)
                        </div>
                        <button
                            onClick={() => setPreviewFrame(null)}
                            className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoStudio;
