import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = './uploads';
const FILES_DIR = './files';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
const FILE_EXPIRY_DAYS = 2;

@Injectable()
export class FileService {
    private readonly logger = new Logger(FileService.name);

    constructor(private prisma: PrismaService) {
        // Ensure directories exist
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        if (!fs.existsSync(FILES_DIR)) {
            fs.mkdirSync(FILES_DIR, { recursive: true });
        }
    }

    /**
     * Initialize a file upload
     */
    async initUpload(
        userId: string,
        filename: string,
        size: number,
        mimeType: string,
    ) {
        if (size > MAX_FILE_SIZE) {
            throw new BadRequestException('File size exceeds 3GB limit');
        }

        const totalChunks = Math.ceil(size / CHUNK_SIZE);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + FILE_EXPIRY_DAYS);

        const transfer = await this.prisma.fileTransfer.create({
            data: {
                filename: `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
                originalName: filename,
                mimeType,
                size: BigInt(size),
                totalChunks,
                chunkSize: CHUNK_SIZE,
                uploaderId: userId,
                expiresAt,
                status: 'UPLOADING',
            },
        });

        // Create upload directory for chunks
        const chunkDir = path.join(UPLOAD_DIR, transfer.id);
        fs.mkdirSync(chunkDir, { recursive: true });

        this.logger.log(`Upload initialized: ${transfer.id} (${filename}, ${totalChunks} chunks)`);

        return {
            transferId: transfer.id,
            chunkSize: CHUNK_SIZE,
            totalChunks,
            expiresAt: transfer.expiresAt,
        };
    }

    /**
     * Upload a chunk
     */
    async uploadChunk(
        transferId: string,
        chunkIndex: number,
        chunkData: Buffer,
        userId: string,
    ) {
        const transfer = await this.prisma.fileTransfer.findUnique({
            where: { id: transferId },
        });

        if (!transfer) {
            throw new NotFoundException('Transfer not found');
        }

        if (transfer.uploaderId !== userId) {
            throw new BadRequestException('Unauthorized');
        }

        if (transfer.status === 'COMPLETE') {
            throw new BadRequestException('Transfer already complete');
        }

        if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
            throw new BadRequestException('Invalid chunk index');
        }

        // Save chunk to disk
        const chunkPath = path.join(UPLOAD_DIR, transferId, `chunk-${chunkIndex}`);
        fs.writeFileSync(chunkPath, chunkData);

        // Update progress
        await this.prisma.fileTransfer.update({
            where: { id: transferId },
            data: { uploadedChunks: { increment: 1 } },
        });

        this.logger.debug(`Chunk ${chunkIndex + 1}/${transfer.totalChunks} uploaded for ${transferId}`);

        return {
            chunkIndex,
            uploadedChunks: transfer.uploadedChunks + 1,
            totalChunks: transfer.totalChunks,
        };
    }

    /**
     * Get upload progress (for resume)
     */
    async getProgress(transferId: string, userId: string) {
        const transfer = await this.prisma.fileTransfer.findUnique({
            where: { id: transferId },
        });

        if (!transfer) {
            throw new NotFoundException('Transfer not found');
        }

        if (transfer.uploaderId !== userId) {
            throw new BadRequestException('Unauthorized');
        }

        // Check which chunks are actually uploaded
        const chunkDir = path.join(UPLOAD_DIR, transferId);
        const uploadedChunks: number[] = [];

        if (fs.existsSync(chunkDir)) {
            const files = fs.readdirSync(chunkDir);
            for (const file of files) {
                const match = file.match(/^chunk-(\d+)$/);
                if (match) {
                    uploadedChunks.push(parseInt(match[1], 10));
                }
            }
        }

        return {
            transferId: transfer.id,
            filename: transfer.originalName,
            totalChunks: transfer.totalChunks,
            uploadedChunks: uploadedChunks.sort((a, b) => a - b),
            status: transfer.status,
            expiresAt: transfer.expiresAt,
        };
    }

    /**
     * Complete upload - assemble chunks into final file
     */
    async completeUpload(transferId: string, userId: string, messageId?: string) {
        const transfer = await this.prisma.fileTransfer.findUnique({
            where: { id: transferId },
        });

        if (!transfer) {
            throw new NotFoundException('Transfer not found');
        }

        if (transfer.uploaderId !== userId) {
            throw new BadRequestException('Unauthorized');
        }

        // Verify all chunks are uploaded
        const chunkDir = path.join(UPLOAD_DIR, transferId);
        for (let i = 0; i < transfer.totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `chunk-${i}`);
            if (!fs.existsSync(chunkPath)) {
                throw new BadRequestException(`Missing chunk ${i}`);
            }
        }

        // Assemble file
        const finalPath = path.join(FILES_DIR, transfer.filename);
        const writeStream = fs.createWriteStream(finalPath);

        for (let i = 0; i < transfer.totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `chunk-${i}`);
            const chunkData = fs.readFileSync(chunkPath);
            writeStream.write(chunkData);
        }

        writeStream.end();

        // Wait for write to complete
        await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Update transfer status
        await this.prisma.fileTransfer.update({
            where: { id: transferId },
            data: { status: 'COMPLETE' },
        });

        // Clean up chunks
        fs.rmSync(chunkDir, { recursive: true, force: true });

        // Create file attachment if messageId provided
        let attachment: {
            id: string;
            filename: string;
            originalName: string;
            mimeType: string;
            size: bigint;
            expiresAt: Date;
            messageId: string;
            createdAt: Date;
        } | null = null;
        if (messageId) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + FILE_EXPIRY_DAYS);

            attachment = await this.prisma.fileAttachment.create({
                data: {
                    filename: transfer.filename,
                    originalName: transfer.originalName,
                    mimeType: transfer.mimeType,
                    size: transfer.size,
                    expiresAt,
                    messageId,
                },
            });
        }

        this.logger.log(`Upload complete: ${transferId} -> ${transfer.filename}`);

        return {
            fileId: transfer.id,
            filename: transfer.filename,
            originalName: transfer.originalName,
            size: transfer.size.toString(),
            mimeType: transfer.mimeType,
            expiresAt: transfer.expiresAt,
            attachment,
        };
    }

    /**
     * Get file for download (supports Range header for resume)
     */
    async getFile(fileId: string) {
        const transfer = await this.prisma.fileTransfer.findUnique({
            where: { id: fileId },
        });

        if (!transfer || transfer.status !== 'COMPLETE') {
            throw new NotFoundException('File not found');
        }

        const filePath = path.join(FILES_DIR, transfer.filename);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('File not found on disk');
        }

        return {
            filePath,
            filename: transfer.originalName,
            mimeType: transfer.mimeType,
            size: Number(transfer.size),
            expiresAt: transfer.expiresAt,
        };
    }

    /**
     * Get file attachment info
     */
    async getAttachment(attachmentId: string) {
        const attachment = await this.prisma.fileAttachment.findUnique({
            where: { id: attachmentId },
        });

        if (!attachment) {
            throw new NotFoundException('Attachment not found');
        }

        const filePath = path.join(FILES_DIR, attachment.filename);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('File not found on disk');
        }

        return {
            filePath,
            filename: attachment.originalName,
            mimeType: attachment.mimeType,
            size: Number(attachment.size),
            expiresAt: attachment.expiresAt,
        };
    }

    /**
     * Cleanup expired files - runs every hour
     */
    @Cron(CronExpression.EVERY_HOUR)
    async cleanupExpiredFiles() {
        const now = new Date();
        this.logger.log('Running expired file cleanup...');

        // Delete expired file transfers
        const expiredTransfers = await this.prisma.fileTransfer.findMany({
            where: { expiresAt: { lt: now } },
        });

        for (const transfer of expiredTransfers) {
            const filePath = path.join(FILES_DIR, transfer.filename);
            const chunkDir = path.join(UPLOAD_DIR, transfer.id);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            if (fs.existsSync(chunkDir)) {
                fs.rmSync(chunkDir, { recursive: true, force: true });
            }

            await this.prisma.fileTransfer.delete({ where: { id: transfer.id } });
            this.logger.log(`Deleted expired transfer: ${transfer.id}`);
        }

        // Delete expired attachments
        const expiredAttachments = await this.prisma.fileAttachment.findMany({
            where: { expiresAt: { lt: now } },
        });

        for (const attachment of expiredAttachments) {
            const filePath = path.join(FILES_DIR, attachment.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            await this.prisma.fileAttachment.delete({ where: { id: attachment.id } });
            this.logger.log(`Deleted expired attachment: ${attachment.id}`);
        }

        this.logger.log(`Cleanup complete. Deleted ${expiredTransfers.length} transfers, ${expiredAttachments.length} attachments`);
    }
}
