-- CreateTable
CREATE TABLE "users"
(
    "id"         TEXT         NOT NULL,
    "email"      TEXT         NOT NULL,
    "password"   TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "isVerified" BOOLEAN      NOT NULL DEFAULT false,
    "isOnline"   BOOLEAN      NOT NULL DEFAULT false,
    "lastSeen"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages"
(
    "id"         TEXT         NOT NULL,
    "content"    TEXT         NOT NULL,
    "senderId"   TEXT         NOT NULL,
    "receiverId" TEXT         NOT NULL,
    "isRead"     BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages" ("senderId");

-- CreateIndex
CREATE INDEX "messages_receiverId_idx" ON "messages" ("receiverId");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages" ("createdAt");

-- AddForeignKey
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
