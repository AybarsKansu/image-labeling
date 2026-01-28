import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2 } from 'lucide-react';

/**
 * Premium Glass Confirm Modal
 * Replaces native window.confirm with a styled glassmorphism modal
 */
const GlassConfirmModal = ({
    isOpen,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger", // 'danger' | 'warning' | 'info'
    icon: CustomIcon,
    onConfirm,
    onCancel
}) => {
    const variants = {
        danger: {
            iconBg: 'bg-red-500/10',
            iconColor: 'text-red-400',
            buttonBg: 'bg-red-500/10 hover:bg-red-500/20',
            buttonBorder: 'border-red-500/20 hover:border-red-500/40',
            buttonText: 'text-red-400',
            glowColor: 'rgba(239, 68, 68, 0.2)'
        },
        warning: {
            iconBg: 'bg-amber-500/10',
            iconColor: 'text-amber-400',
            buttonBg: 'bg-amber-500/10 hover:bg-amber-500/20',
            buttonBorder: 'border-amber-500/20 hover:border-amber-500/40',
            buttonText: 'text-amber-400',
            glowColor: 'rgba(245, 158, 11, 0.2)'
        },
        info: {
            iconBg: 'bg-indigo-500/10',
            iconColor: 'text-indigo-400',
            buttonBg: 'bg-indigo-500/10 hover:bg-indigo-500/20',
            buttonBorder: 'border-indigo-500/20 hover:border-indigo-500/40',
            buttonText: 'text-indigo-400',
            glowColor: 'rgba(99, 102, 241, 0.2)'
        }
    };

    const style = variants[variant] || variants.danger;
    const IconComponent = CustomIcon || (variant === 'danger' ? Trash2 : AlertTriangle);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    {/* Modal Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="w-full max-w-md p-6 mx-4 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-xl ${style.iconBg} flex items-center justify-center mb-4`}>
                            <IconComponent className={`w-6 h-6 ${style.iconColor}`} />
                        </div>

                        {/* Content */}
                        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                        <p className="text-slate-400 mb-6 text-sm leading-relaxed">{message}</p>

                        {/* Actions */}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                            >
                                {cancelText}
                            </button>

                            <button
                                onClick={onConfirm}
                                className={`px-4 py-2 text-sm ${style.buttonBg} ${style.buttonText} border ${style.buttonBorder} rounded-lg transition-all font-medium`}
                                style={{
                                    '--glow-color': style.glowColor
                                }}
                                onMouseEnter={(e) => e.target.style.boxShadow = `0 0 15px var(--glow-color)`}
                                onMouseLeave={(e) => e.target.style.boxShadow = 'none'}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default GlassConfirmModal;
