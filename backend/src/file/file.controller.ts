import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Req,
    Res,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Headers,
    HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileService } from './file.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

interface AuthRequest {
    user: { id: string; email: string };
}

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
    constructor(private readonly fileService: FileService) { }

    /**
     * Initialize a file upload
     */
    @Post('init')
    async initUpload(
        @Req() req: AuthRequest,
        @Body() body: { filename: string; size: number; mimeType: string },
    ) {
        return this.fileService.initUpload(
            req.user.id,
            body.filename,
            body.size,
            body.mimeType,
        );
    }

    /**
     * Upload a chunk
     */
    @Post('chunk/:transferId')
    @UseInterceptors(FileInterceptor('chunk'))
    async uploadChunk(
        @Req() req: AuthRequest,
        @Param('transferId') transferId: string,
        @Body('chunkIndex') chunkIndex: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.fileService.uploadChunk(
            transferId,
            parseInt(chunkIndex, 10),
            file.buffer,
            req.user.id,
        );
    }

    /**
     * Get upload progress (for resume)
     */
    @Get('progress/:transferId')
    async getProgress(
        @Req() req: AuthRequest,
        @Param('transferId') transferId: string,
    ) {
        return this.fileService.getProgress(transferId, req.user.id);
    }

    /**
     * Complete upload
     */
    @Post('complete/:transferId')
    async completeUpload(
        @Req() req: AuthRequest,
        @Param('transferId') transferId: string,
        @Body('messageId') messageId?: string,
    ) {
        return this.fileService.completeUpload(transferId, req.user.id, messageId);
    }

    /**
     * Download file (supports Range header for resume)
     */
    @Get(':fileId')
    async downloadFile(
        @Param('fileId') fileId: string,
        @Headers('range') range: string,
        @Res() res: Response,
    ) {
        const fileInfo = await this.fileService.getFile(fileId);
        const { filePath, filename, mimeType, size, expiresAt } = fileInfo;

        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Expires-At', expiresAt.toISOString());

        // Handle Range request for resume
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
            const chunkSize = end - start + 1;

            res.status(HttpStatus.PARTIAL_CONTENT);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', chunkSize);

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', size);
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
        }
    }

    /**
     * Download attachment by ID
     */
    @Get('attachment/:attachmentId')
    async downloadAttachment(
        @Param('attachmentId') attachmentId: string,
        @Headers('range') range: string,
        @Res() res: Response,
    ) {
        const fileInfo = await this.fileService.getAttachment(attachmentId);
        const { filePath, filename, mimeType, size, expiresAt } = fileInfo;

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Expires-At', expiresAt.toISOString());

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
            const chunkSize = end - start + 1;

            res.status(HttpStatus.PARTIAL_CONTENT);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', chunkSize);

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', size);
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
        }
    }
}
