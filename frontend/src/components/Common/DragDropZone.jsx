import React from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { FolderOpen, Camera, Clock, Upload, Scan } from 'lucide-react';

// Animated 3D Scanning Lens SVG Component
const ScanningLens = () => (
    <motion.div
        className="relative w-40 h-40 mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
    >
        {/* Outer glow ring */}
        <motion.div
            className="absolute inset-0 rounded-full"
            style={{
                background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                boxShadow: '0 0 60px -10px rgba(99,102,241,0.4)',
            }}
            animate={{
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
            }}
        />

        {/* Main lens SVG */}
        <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Outer ring */}
            <motion.circle
                cx="50"
                cy="50"
                r="42"
                stroke="url(#lensGradient)"
                strokeWidth="2"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
            />

            {/* Inner scanning circle */}
            <motion.circle
                cx="50"
                cy="50"
                r="30"
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                fill="none"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "50px 50px" }}
            />

            {/* Center crosshair */}
            <motion.g
                stroke="#10b981"
                strokeWidth="1.5"
                strokeLinecap="round"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                <line x1="50" y1="38" x2="50" y2="45" />
                <line x1="50" y1="55" x2="50" y2="62" />
                <line x1="38" y1="50" x2="45" y2="50" />
                <line x1="55" y1="50" x2="62" y2="50" />
            </motion.g>

            {/* Corner brackets */}
            <g stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round">
                <path d="M25 35 L25 25 L35 25" />
                <path d="M65 25 L75 25 L75 35" />
                <path d="M75 65 L75 75 L65 75" />
                <path d="M35 75 L25 75 L25 65" />
            </g>

            {/* Center dot */}
            <motion.circle
                cx="50"
                cy="50"
                r="3"
                fill="#10b981"
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            />

            <defs>
                <linearGradient id="lensGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
            </defs>
        </svg>

        {/* Scanning line effect */}
        <motion.div
            className="absolute left-1/2 top-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-[#10b981] to-transparent"
            style={{ translateX: '-50%', translateY: '-50%' }}
            animate={{
                rotate: [0, 360],
                opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
                rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                opacity: { duration: 2, repeat: Infinity },
            }}
        />
    </motion.div>
);

// Quick Action Card Component
const QuickActionCard = ({ icon: Icon, title, subtitle, onClick, color = "indigo" }) => (
    <motion.button
        className={clsx(
            "flex flex-col items-center gap-3 p-6 rounded-xl border transition-all duration-200",
            "bg-[var(--bg-tertiary)] border-[var(--border-color)]",
            "hover:border-[var(--accent-color)] hover:bg-[var(--bg-elevated)]",
            "group cursor-pointer"
        )}
        onClick={onClick}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
    >
        <div className={clsx(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
            color === "indigo" && "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] group-hover:bg-[var(--accent-indigo)]/20",
            color === "emerald" && "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)] group-hover:bg-[var(--accent-emerald)]/20"
        )}>
            <Icon className="w-6 h-6" />
        </div>
        <div className="text-center">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">{title}</h3>
            <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        </div>
    </motion.button>
);

const DragDropZone = ({ onImageUpload }) => {
    const onDrop = (acceptedFiles) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            const syntheticEvent = {
                target: {
                    files: [acceptedFiles[0]]
                }
            };
            onImageUpload(syntheticEvent);
        }
    };

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            'image/*': []
        },
        multiple: false,
        noClick: true
    });

    return (
        <div
            {...getRootProps()}
            className={clsx(
                "flex-1 flex flex-col items-center justify-center min-h-full transition-all duration-300 relative overflow-hidden",
                isDragActive
                    ? "bg-[var(--accent-indigo)]/5"
                    : "bg-[var(--bg-primary)]"
            )}
        >
            <input {...getInputProps()} />

            {/* Drag overlay */}
            {isDragActive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-[var(--accent-indigo)]/10 backdrop-blur-sm z-20 flex items-center justify-center"
                >
                    <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-[var(--accent-indigo)] bg-[var(--bg-secondary)]/80"
                    >
                        <Upload className="w-16 h-16 text-[var(--accent-indigo)]" />
                        <p className="text-xl font-semibold text-[var(--accent-indigo)]">Drop images here</p>
                    </motion.div>
                </motion.div>
            )}

            {/* Main Content - Welcome Dashboard */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center max-w-2xl mx-auto px-8"
            >
                {/* Scanning Lens Illustration */}
                <ScanningLens />

                {/* Main Typography */}
                <motion.h1
                    className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] text-center mb-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    Drag and drop images to start labeling
                </motion.h1>

                <motion.p
                    className="text-[var(--text-secondary)] text-center mb-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    Or use the quick actions below to get started
                </motion.p>

                {/* Quick Action Cards */}
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    <QuickActionCard
                        icon={FolderOpen}
                        title="Import Dataset"
                        subtitle="Load images from folder"
                        onClick={open}
                        color="indigo"
                    />
                    <QuickActionCard
                        icon={Camera}
                        title="Connect Camera"
                        subtitle="Live capture mode"
                        onClick={() => alert('Camera feature coming soon!')}
                        color="emerald"
                    />
                    <QuickActionCard
                        icon={Clock}
                        title="Recent Projects"
                        subtitle="Continue your work"
                        onClick={() => alert('Recent projects coming soon!')}
                        color="indigo"
                    />
                </motion.div>
            </motion.div>

            {/* Subtle background pattern */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage: 'radial-gradient(var(--text-secondary) 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}
            />
        </div>
    );
};

export default DragDropZone;
