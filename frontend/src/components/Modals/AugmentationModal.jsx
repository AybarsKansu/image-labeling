import React, { useState } from 'react';
import { X, Check, Layers, Repeat, Sun, Wind, Box } from 'lucide-react';
import clsx from 'clsx';

const AUGMENT_TYPES = [
    { id: 'hflip', name: 'Horizontal Flip', icon: Repeat, description: 'Flip the image horizontally' },
    { id: 'vflip', name: 'Vertical Flip', icon: Repeat, description: 'Flip the image vertically', rotate: 90 },
    { id: 'rotate', name: 'Rotations', icon: Layers, description: 'Generate 90, 180, 270 degree versions' },
    { id: 'brightness', name: 'Brightness', icon: Sun, description: 'Dark and light variants' },
    { id: 'noise', name: 'Gaussian Noise', icon: Wind, description: 'Add random noise to pixels' },
    { id: 'blur', name: 'Gaussian Blur', icon: Box, description: 'Apply subtle blurring' },
];

export function AugmentationModal({ isOpen, onClose, onConfirm }) {
    const [selected, setSelected] = useState({
        hflip: true,
        vflip: false,
        rotate: true,
        brightness: true,
        noise: false,
        blur: false
    });

    if (!isOpen) return null;

    const toggle = (id) => {
        setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleConfirm = () => {
        const enabled = Object.keys(selected).filter(key => selected[key]);
        onConfirm(enabled);
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-xl bg-theme-secondary border border-theme rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-theme bg-theme-tertiary">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-theme-accent/20 rounded-lg text-theme-accent">
                            <Layers size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Data Augmentation</h2>
                            <p className="text-xs text-gray-400">Select which variants to generate for your dataset</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {AUGMENT_TYPES.map((type) => {
                        const Icon = type.icon;
                        const isSelected = selected[type.id];

                        return (
                            <button
                                key={type.id}
                                onClick={() => toggle(type.id)}
                                className={clsx(
                                    "flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 text-left group",
                                    isSelected
                                        ? "bg-theme-accent/10 border-theme-accent ring-1 ring-theme-accent/50"
                                        : "bg-theme-tertiary border-theme hover:border-gray-600"
                                )}
                            >
                                <div className={clsx(
                                    "p-2 rounded-lg transition-colors",
                                    isSelected ? "bg-theme-accent text-white" : "bg-gray-800 text-gray-400 group-hover:text-gray-300"
                                )}>
                                    <Icon size={18} style={type.rotate ? { transform: `rotate(${type.rotate}deg)` } : {}} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={clsx("text-sm font-semibold", isSelected ? "text-white" : "text-gray-300")}>
                                            {type.name}
                                        </span>
                                        {isSelected && <Check size={14} className="text-theme-accent" />}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                        {type.description}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-theme bg-theme-tertiary flex items-center justify-between gap-4">
                    <button
                        onClick={() => onConfirm([])}
                        className="px-6 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                    >
                        Skip Augmentation
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-theme rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="px-8 py-2.5 text-sm font-bold text-white bg-theme-accent hover:bg-theme-accent-hover rounded-xl shadow-lg shadow-theme-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Save with Selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
