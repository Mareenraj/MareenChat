/*
  Warnings:

  - You are about to drop the column `isRead` on the `messages` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "isRead",
ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'SENT';
