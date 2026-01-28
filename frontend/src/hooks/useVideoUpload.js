
import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/config';

export const useVideoUpload = () => {
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [videoInfo, setVideoInfo] = useState(null);

    const CHUNK_SIZE = 1024 * 1024; // 1MB

    const startUpload = useCallback(async (file, onComplete) => {
        setIsUploading(true);
        setUploadProgress(0);
        setError(null);
        setVideoInfo(null);

        try {
            // 1. Init
            const initRes = await axios.post(`${API_URL}/videos/init`, {
                filename: file.name,
                total_size: file.size
            });

            const { upload_id } = initRes.data;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            // 2. Upload Chunks
            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
                const start = chunkIdx * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('file', chunk);

                await axios.post(`${API_URL}/videos/upload/${upload_id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                // Update Progress
                const percent = Math.round(((chunkIdx + 1) / totalChunks) * 100);
                setUploadProgress(percent);
            }

            // 3. Finalize
            const finalizeRes = await axios.post(`${API_URL}/videos/finalize`, {
                upload_id: upload_id,
                filename: file.name
            });

            if (finalizeRes.data.success) {
                setVideoInfo(finalizeRes.data.video_info);
                if (onComplete) onComplete(finalizeRes.data.video_info);
            } else {
                setError("Finalization failed");
            }

        } catch (err) {
            console.error("Upload error", err);
            setError(err.response?.data?.detail || err.message);
        } finally {
            setIsUploading(false);
        }
    }, []);

    return {
        uploadProgress,
        isUploading,
        error,
        videoInfo,
        startUpload,
        reset: () => {
            setUploadProgress(0);
            setError(null);
            setVideoInfo(null);
        }
    };
};
