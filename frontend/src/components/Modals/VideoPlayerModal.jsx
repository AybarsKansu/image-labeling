
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BASE_URL } from '../../constants/config';
import { Play, Pause, ChevronRight, ChevronLeft, Camera, Image as ImageIcon, Check } from 'lucide-react';
import { useFileSystem } from '../../hooks/useFileSystem';
import clsx from 'clsx';

const VideoPlayerModal = ({ isOpen, onClose, videoInfo }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [sliderValue, setSliderValue] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);

    // Feedback States
    const [capturedFrames, setCapturedFrames] = useState([]);
    const [flash, setFlash] = useState(false);
    const [lastCaptureTime, setLastCaptureTime] = useState(null);

    const { ingestFiles } = useFileSystem();

    // Reset loop when modal opens
    useEffect(() => {
        if (isOpen) {
            setCapturedFrames([]);
            setIsPlaying(false);
            setCurrentTime(0);
            setSliderValue(0);
            setLastCaptureTime(null);
        }
    }, [isOpen]);

    const fps = videoInfo?.fps || 30;
    const frameDuration = 1 / fps;

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
                    { id: Date.now(), time: timestamp, url: URL.createObjectURL(blob) }
                ]);
            }
        }, 'image/jpeg', 0.95);
    }, [ingestFiles, videoInfo]);

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
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, togglePlay, stepFrame, captureFrame]);


    if (!isOpen || !videoInfo) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4">
            <div className="bg-theme-secondary rounded-2xl shadow-2xl border border-theme w-full max-w-6xl flex flex-col h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-theme/30 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Camera className="w-5 h-5 text-purple-400" />
                            Capture Mode: <span className="text-purple-200 font-normal">{videoInfo.filename}</span>
                        </h2>
                        <div className="text-xs text-gray-400 mt-1 flex gap-3">
                            <span>Shortcuts:</span>
                            <span className="bg-white/10 px-1.5 rounded text-gray-300">Space (Play)</span>
                            <span className="bg-white/10 px-1.5 rounded text-gray-300">←/→ (Frame)</span>
                            <span className="bg-white/10 px-1.5 rounded text-gray-300">C (Capture)</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
                </div>

                {/* Main Content Area (Player + Sidebar) */}
                <div className="flex-1 flex min-h-0 overflow-hidden">

                    {/* Video Player */}
                    <div className="flex-1 flex flex-col bg-black relative group">

                        {/* Shutter Flash Effect */}
                        <div className={clsx("absolute inset-0 bg-white pointer-events-none z-20 transition-opacity duration-150", flash ? "opacity-30" : "opacity-0")} />

                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            src={`${BASE_URL}${videoInfo.video_url}`}
                            crossOrigin="anonymous"
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                            onClick={togglePlay}
                        />

                        {/* Hidden Canvas */}
                        <canvas ref={canvasRef} className="hidden" />

                        {/* Hover Controls */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300 opacity-100 group-hover:opacity-100">

                            <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                                {/* Slider */}
                                <input
                                    type="range"
                                    min="0"
                                    max={videoInfo.duration}
                                    step="0.01"
                                    value={sliderValue}
                                    onChange={handleSeekChange}
                                    onMouseUp={handleSeekUp}
                                    className="w-full accent-purple-500 cursor-pointer h-1.5 bg-gray-600 rounded-lg appearance-none hover:h-2 transition-all"
                                />

                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-4">
                                        <button onClick={togglePlay} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all text-white backdrop-blur-sm">
                                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                                        </button>

                                        <div className="text-sm font-mono text-gray-300">
                                            <span className="text-white font-bold">{currentTime.toFixed(2)}</span>
                                            <span className="opacity-50 mx-1">/</span>
                                            <span className="opacity-70">{videoInfo.duration?.toFixed(2)}s</span>
                                        </div>
                                    </div>

                                    {/* Frame Stepping */}
                                    <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 backdrop-blur-sm border border-white/10">
                                        <button
                                            onClick={() => stepFrame(-1)}
                                            className="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                                            title="Previous Frame"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <div className="w-px h-4 bg-white/10"></div>
                                        <button
                                            onClick={() => stepFrame(1)}
                                            className="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                                            title="Next Frame"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {/* Capture Button */}
                                    <button
                                        onClick={captureFrame}
                                        className={clsx(
                                            "flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold shadow-lg transition-all transform active:scale-95",
                                            lastCaptureTime && Date.now() - lastCaptureTime < 1000
                                                ? "bg-green-500 text-white"
                                                : "bg-purple-600 hover:bg-purple-500 text-white"
                                        )}
                                    >
                                        {lastCaptureTime && Date.now() - lastCaptureTime < 1000 ? (
                                            <><Check className="w-5 h-5" /> Saved!</>
                                        ) : (
                                            <><ImageIcon className="w-5 h-5" /> Capture Frame (C)</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Sidebar: Captured Frames Strip */}
                    <div className="w-64 bg-theme-tertiary border-l border-theme/30 flex flex-col flex-shrink-0">
                        <div className="p-3 border-b border-theme/20 font-semibold text-gray-300 text-xs uppercase tracking-wider flex justify-between items-center">
                            <span>Captured ({capturedFrames.length})</span>
                            {capturedFrames.length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            {capturedFrames.length === 0 ? (
                                <div className="text-center text-gray-500 text-sm mt-10">
                                    <Camera className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    No frames captured yet.
                                </div>
                            ) : (
                                capturedFrames.slice().reverse().map((frame) => (
                                    <div key={frame.id} className="relative group rounded-lg overflow-hidden border border-theme/30 hover:border-purple-500/50 transition-colors">
                                        <img src={frame.url} alt="" className="w-full h-24 object-cover" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-[10px] text-white font-mono text-center backdrop-blur-sm">
                                            {frame.time}s
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer Info */}
                <div className="px-6 py-2 bg-theme-tertiary border-t border-theme/30 grid grid-cols-4 gap-4 text-xs text-gray-400 font-mono flex-shrink-0">
                    <div>RES: {videoInfo.width}x{videoInfo.height}</div>
                    <div>FPS: {fps.toFixed(2)}</div>
                    <div>FRAMES: {videoInfo.frame_count}</div>
                    <div className="text-right text-purple-400">Pro Mode Active</div>
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerModal;
