-- AlterTable: vínculo opcional com Dashboard (atualizações visíveis por permissão de cargo)
ALTER TABLE "Notification" ADD COLUMN "dashboardId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Notification_dashboardId_idx" ON "Notification"("dashboardId");
