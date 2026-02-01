-- CreateTable
CREATE TABLE "blocked_users" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_users_blockerId_idx" ON "blocked_users"("blockerId");

-- CreateIndex
CREATE INDEX "blocked_users_blockedId_idx" ON "blocked_users"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_blockerId_blockedId_key" ON "blocked_users"("blockerId", "blockedId");

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
