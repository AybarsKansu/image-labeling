import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronRight, ChevronLeft, Camera, Check } from 'lucide-react';
import clsx from 'clsx';
import { BASE_URL } from '../../constants/config';

const VideoWorkspace = ({ videoFile, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [sliderValue, setSliderValue] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverPosition, setHoverPosition] = useState(0);
    const [duration, setDuration] = useState(0);

    // Feedback States
    const [flash, setFlash] = useState(false);
    const [lastCaptureTime, setLastCaptureTime] = useState(null);

    // Prepare Video Source
    const [videoSrc, setVideoSrc] = useState(null);
    const blobUrlRef = useRef(null);

    useEffect(() => {
        if (!videoFile) return;

        // If checking only ID, we ensure we don't recreate the URL if object ref changes
        // but content is the same. 
        // NOTE: We assume video content is immutable for a given File ID.

        let url = null;
        let createdUrl = false;

        if (videoFile.blob) {
            url = URL.createObjectURL(videoFile.blob);
            createdUrl = true;
        } else if (videoFile.backend_url) {
            url = `${BASE_URL}${videoFile.backend_url}`;
        } else if (videoFile.url) {
            url = videoFile.url;
        }

        setVideoSrc(url);

        // Revoke previous URL if it existed
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
        }

        // Update ref
        blobUrlRef.current = createdUrl ? url : null;

        return () => {
            // We don't revoke here immediately to avoid 'flicker' or premature revocation
            // The next run will revoke the previous one.
            // But on unmount, we should revoke.
        };
    }, [videoFile?.id]); // Only change if ID changes

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
        };
    }, []);

    // Reset state when video changes
    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setSliderValue(0);
        setDuration(0);
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [videoFile?.id]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    // 30 FPS default for stepping functionality
    const fps = 30;

    // Format time
    const formatTime = (time) => {
        if (!isFinite(time)) return "00:00.00";
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
        const time = position * (duration || 0);
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
            const currentFrame = Math.round(videoRef.current.currentTime * fps);
            const nextFrame = currentFrame + direction;
            videoRef.current.currentTime = Math.max(0, nextFrame / fps);
        }
    }, [fps]);

    // --- Capture Frame Logic ---
    const captureFrame = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setFlash(true);
        setTimeout(() => setFlash(false), 150);

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = video.currentTime.toFixed(2);
                const safeTimestamp = timestamp.replace('.', '_');
                const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
                const filename = `${baseName}_${safeTimestamp}s.jpg`;

                // Create a File object
                const file = new File([blob], filename, { type: 'image/jpeg' });

                // Invoke parent callback
                if (onCapture) {
                    onCapture(file);
                }

                setLastCaptureTime(Date.now());
            }
        }, 'image/jpeg', 0.95);
    }, [videoFile, onCapture]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Only active if we have a video
            if (!videoFile) return;

            // Avoid conflict if user typing in input (though unlikely in this view)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }

            switch (e.code) {
                case 'Space': togglePlay(); break;
                case 'ArrowLeft': stepFrame(-1); break;
                case 'ArrowRight': stepFrame(1); break;
                case 'KeyC':
                case 'Enter': captureFrame(); break;
                default: break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [videoFile, togglePlay, stepFrame, captureFrame]);

    if (!videoSrc) {
        return <div className="flex items-center justify-center h-full text-gray-500">No video source</div>;
    }

    const progressPercent = duration ? (sliderValue / duration) * 100 : 0;

    return (
        <div className="flex flex-col h-full w-full bg-black relative group select-none">
            {/* Flash Effect */}
            <div className={clsx("absolute inset-0 bg-white pointer-events-none z-20 transition-opacity duration-150", flash ? "opacity-30" : "opacity-0")} />

            {/* Video Player */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                <video
                    ref={videoRef}
                    className="max-w-full max-h-full object-contain"
                    src={videoSrc}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    onClick={togglePlay}
                    onError={(e) => console.error("Video Playback Error", e, e.target.error, videoSrc)}
                    crossOrigin="anonymous"
                />
                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Controls Overlay (Always visible on hover or paused, bottom aligned) */}
            <div className="bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent p-4 transition-opacity md:opacity-0 md:group-hover:opacity-100 opacity-100">
                {/* Timeline Slider */}
                <div className="relative mb-4 mx-2">
                    {hoverTime !== null && (
                        <div
                            className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none z-10 border border-gray-700"
                            style={{ left: hoverPosition }}
                        >
                            {formatTime(hoverTime)}
                        </div>
                    )}

                    <div className="relative h-1.5 bg-gray-700 rounded-full cursor-pointer hover:h-2.5 transition-all group/slider">
                        <div
                            className="absolute top-0 left-0 h-full bg-purple-500 rounded-full"
                            style={{ width: `${progressPercent}%` }}
                        />
                        <input
                            type="range"
                            min="0"
                            max={duration || 1}
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

                {/* Buttons Row */}
                <div className="flex justify-between items-center px-2">
                    <div className="flex items-center w-1/4">
                        <span className="text-xs font-mono text-gray-300">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 justify-center w-2/4">
                        <button onClick={() => stepFrame(-1)} className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white" title="Previous Frame (Left Arrow)">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={togglePlay} className="p-3 bg-white hover:bg-gray-200 rounded-full text-black shadow-lg shadow-white/10 scale-90 hover:scale-100 transition-all">
                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                        </button>
                        <button onClick={() => stepFrame(1)} className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white" title="Next Frame (Right Arrow)">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center justify-end w-1/4">
                        <button
                            onClick={captureFrame}
                            className={clsx(
                                "flex items-center  gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95",
                                lastCaptureTime && Date.now() - lastCaptureTime < 1000
                                    ? "bg-green-500 text-white"
                                    : "bg-purple-600 hover:bg-purple-500 text-white"
                            )}
                            title="Capture Frame (C or Enter)"
                        >
                            {lastCaptureTime && Date.now() - lastCaptureTime < 1000 ? (
                                <><Check className="w-4 h-4" /> Captured</>
                            ) : (
                                <><Camera className="w-4 h-4" /> Capture</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoWorkspace;
