import React from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';
import { ImagePlus, Upload } from 'lucide-react';

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

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': []
        },
        multiple: false
    });

    return (
        <div
            {...getRootProps()}
            className={clsx(
                "flex-1 flex flex-col items-center justify-center m-5 rounded-xl cursor-pointer transition-all duration-300",
                "border-2 border-dashed",
                isDragActive
                    ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"
                    : "border-gray-600 hover:border-indigo-500/50 hover:bg-gray-800/30"
            )}
        >
            <input {...getInputProps()} />

            <div className={clsx(
                "transition-all duration-300",
                isDragActive ? "scale-110 text-indigo-400" : "text-gray-500"
            )}>
                {isDragActive ? (
                    <Upload className="w-16 h-16 mb-4" />
                ) : (
                    <ImagePlus className="w-16 h-16 mb-4 opacity-50" />
                )}
            </div>

            <h2 className={clsx(
                "text-xl font-semibold mb-2 transition-colors",
                isDragActive ? "text-indigo-300" : "text-gray-400"
            )}>
                {isDragActive ? 'Drop image here...' : 'Please select an image'}
            </h2>

            <p className="text-sm text-gray-500">
                Drag & Drop files here or click to browse
            </p>

            <div className="mt-6 flex items-center gap-2 text-xs text-gray-600">
                <span className="px-2 py-1 bg-gray-800 rounded">JPG</span>
                <span className="px-2 py-1 bg-gray-800 rounded">PNG</span>
                <span className="px-2 py-1 bg-gray-800 rounded">WEBP</span>
                <span className="px-2 py-1 bg-gray-800 rounded">GIF</span>
            </div>
        </div>
    );
};

export default DragDropZone;
