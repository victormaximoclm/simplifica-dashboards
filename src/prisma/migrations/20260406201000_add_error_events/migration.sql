-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'error',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "requestId" TEXT,
    "userId" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorEvent_createdAt_idx" ON "ErrorEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorEvent_source_idx" ON "ErrorEvent"("source");

-- CreateIndex
CREATE INDEX "ErrorEvent_requestId_idx" ON "ErrorEvent"("requestId");

-- CreateIndex
CREATE INDEX "ErrorEvent_userId_idx" ON "ErrorEvent"("userId");

-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
