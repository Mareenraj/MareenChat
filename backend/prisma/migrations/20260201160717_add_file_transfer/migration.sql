-- CreateEnum
CREATE TYPE "FileTransferStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "file_transfers" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "chunkSize" INTEGER NOT NULL DEFAULT 5242880,
    "totalChunks" INTEGER NOT NULL,
    "uploadedChunks" INTEGER NOT NULL DEFAULT 0,
    "status" "FileTransferStatus" NOT NULL DEFAULT 'PENDING',
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_transfers_uploaderId_idx" ON "file_transfers"("uploaderId");

-- CreateIndex
CREATE INDEX "file_transfers_status_idx" ON "file_transfers"("status");

-- CreateIndex
CREATE INDEX "file_transfers_expiresAt_idx" ON "file_transfers"("expiresAt");

-- CreateIndex
CREATE INDEX "file_attachments_messageId_idx" ON "file_attachments"("messageId");

-- CreateIndex
CREATE INDEX "file_attachments_expiresAt_idx" ON "file_attachments"("expiresAt");

-- AddForeignKey
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
