-- AlterTable
ALTER TABLE "DocumentHtmlContent" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "DocumentHtmlTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentHtmlTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentHtmlContent_templateId_idx" ON "DocumentHtmlContent"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentHtmlTemplate_workspaceId_name_key" ON "DocumentHtmlTemplate"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "DocumentHtmlContent" ADD CONSTRAINT "DocumentHtmlContent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentHtmlTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHtmlTemplate" ADD CONSTRAINT "DocumentHtmlTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHtmlTemplate" ADD CONSTRAINT "DocumentHtmlTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
