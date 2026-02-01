import { getAccessToken } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadProgress {
    transferId: string;
    filename: string;
    totalChunks: number;
    uploadedChunks: number[];
    percentage: number;
    status: 'pending' | 'uploading' | 'paused' | 'complete' | 'failed';
    expiresAt?: string;
}

export interface FileInfo {
    fileId: string;
    filename: string;
    originalName: string;
    size: string;
    mimeType: string;
    expiresAt: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

class FileUploadService {
    private activeUploads: Map<string, { paused: boolean; abortController: AbortController }> = new Map();

    /**
     * Upload a file with chunking and resume support
     */
    async uploadFile(
        file: File,
        onProgress?: ProgressCallback,
    ): Promise<FileInfo> {
        const token = getAccessToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        // Initialize upload
        const initResponse = await fetch(`${API_BASE_URL}/files/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                filename: file.name,
                size: file.size,
                mimeType: file.type || 'application/octet-stream',
            }),
        });

        if (!initResponse.ok) {
            const error = await initResponse.json();
            throw new Error(error.message || 'Failed to initialize upload');
        }

        const { transferId, totalChunks, expiresAt } = await initResponse.json();

        // Set up abort controller for pause/cancel
        const abortController = new AbortController();
        this.activeUploads.set(transferId, { paused: false, abortController });

        let progress: UploadProgress = {
            transferId,
            filename: file.name,
            totalChunks,
            uploadedChunks: [],
            percentage: 0,
            status: 'uploading',
            expiresAt,
        };

        try {
            // Upload chunks
            for (let i = 0; i < totalChunks; i++) {
                // Check if paused
                const uploadState = this.activeUploads.get(transferId);
                if (uploadState?.paused) {
                    progress = { ...progress, status: 'paused' };
                    onProgress?.({ ...progress });
                    // Wait for resume
                    await this.waitForResume(transferId);
                }

                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('chunkIndex', i.toString());

                let retries = 3;
                while (retries > 0) {
                    try {
                        const response = await fetch(`${API_BASE_URL}/files/chunk/${transferId}`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                            body: formData,
                            signal: abortController.signal,
                        });

                        if (!response.ok) {
                            throw new Error('Chunk upload failed');
                        }

                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Create new object to trigger React re-render
                progress = {
                    ...progress,
                    uploadedChunks: [...progress.uploadedChunks, i],
                    percentage: Math.round(((i + 1) / totalChunks) * 100),
                    status: 'uploading',
                };
                onProgress?.({ ...progress });
            }

            // Complete upload
            const completeResponse = await fetch(`${API_BASE_URL}/files/complete/${transferId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });

            if (!completeResponse.ok) {
                throw new Error('Failed to complete upload');
            }

            const result = await completeResponse.json();
            progress = { ...progress, status: 'complete', percentage: 100 };
            onProgress?.({ ...progress });

            this.activeUploads.delete(transferId);
            return result;
        } catch (error) {
            progress = { ...progress, status: 'failed' };
            onProgress?.({ ...progress });
            throw error;
        }
    }

    /**
     * Resume an interrupted upload
     */
    async resumeUpload(
        transferId: string,
        file: File,
        onProgress?: ProgressCallback,
    ): Promise<FileInfo> {
        const token = getAccessToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        // Get current progress
        const progressResponse = await fetch(`${API_BASE_URL}/files/progress/${transferId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!progressResponse.ok) {
            throw new Error('Failed to get upload progress');
        }

        const { totalChunks, uploadedChunks, expiresAt } = await progressResponse.json();
        const uploadedSet = new Set<number>(uploadedChunks);

        const abortController = new AbortController();
        this.activeUploads.set(transferId, { paused: false, abortController });

        let progress: UploadProgress = {
            transferId,
            filename: file.name,
            totalChunks,
            uploadedChunks: [...uploadedChunks],
            percentage: Math.round((uploadedChunks.length / totalChunks) * 100),
            status: 'uploading',
            expiresAt,
        };

        onProgress?.({ ...progress });

        try {
            // Upload missing chunks
            for (let i = 0; i < totalChunks; i++) {
                if (uploadedSet.has(i)) continue;

                const uploadState = this.activeUploads.get(transferId);
                if (uploadState?.paused) {
                    progress = { ...progress, status: 'paused' };
                    onProgress?.({ ...progress });
                    await this.waitForResume(transferId);
                }

                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('chunkIndex', i.toString());

                let retries = 3;
                while (retries > 0) {
                    try {
                        const response = await fetch(`${API_BASE_URL}/files/chunk/${transferId}`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                            body: formData,
                            signal: abortController.signal,
                        });

                        if (!response.ok) throw new Error('Chunk upload failed');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Create new object to trigger React re-render
                progress = {
                    ...progress,
                    uploadedChunks: [...progress.uploadedChunks, i],
                    percentage: Math.round((progress.uploadedChunks.length + 1) / totalChunks * 100),
                    status: 'uploading',
                };
                onProgress?.({ ...progress });
            }

            // Complete upload
            const completeResponse = await fetch(`${API_BASE_URL}/files/complete/${transferId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });

            if (!completeResponse.ok) {
                throw new Error('Failed to complete upload');
            }

            const result = await completeResponse.json();
            progress = { ...progress, status: 'complete', percentage: 100 };
            onProgress?.({ ...progress });

            this.activeUploads.delete(transferId);
            return result;
        } catch (error) {
            progress = { ...progress, status: 'failed' };
            onProgress?.({ ...progress });
            throw error;
        }
    }

    /**
     * Pause an upload
     */
    pauseUpload(transferId: string): void {
        const upload = this.activeUploads.get(transferId);
        if (upload) {
            upload.paused = true;
        }
    }

    /**
     * Resume a paused upload
     */
    resumePausedUpload(transferId: string): void {
        const upload = this.activeUploads.get(transferId);
        if (upload) {
            upload.paused = false;
        }
    }

    /**
     * Cancel an upload
     */
    cancelUpload(transferId: string): void {
        const upload = this.activeUploads.get(transferId);
        if (upload) {
            upload.abortController.abort();
            this.activeUploads.delete(transferId);
        }
    }

    private async waitForResume(transferId: string): Promise<void> {
        return new Promise(resolve => {
            const check = () => {
                const upload = this.activeUploads.get(transferId);
                if (!upload?.paused) {
                    resolve();
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    /**
     * Get download URL for a file
     */
    getDownloadUrl(fileId: string): string {
        return `${API_BASE_URL}/files/${fileId}`;
    }

    /**
     * Get download URL for an attachment
     */
    getAttachmentUrl(attachmentId: string): string {
        return `${API_BASE_URL}/files/attachment/${attachmentId}`;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes: number | string): string {
        const size = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    /**
     * Format time remaining until expiry
     */
    formatExpiryTime(expiresAt: string): string {
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diffMs = expiry.getTime() - now.getTime();

        if (diffMs <= 0) return 'Expired';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        if (days > 0) {
            return `${days}d ${remainingHours}h`;
        }
        return `${hours}h`;
    }

    /**
     * Get file icon based on mime type
     */
    getFileIcon(mimeType: string): string {
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return '📦';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
        return '📎';
    }
}

export const fileUploadService = new FileUploadService();
