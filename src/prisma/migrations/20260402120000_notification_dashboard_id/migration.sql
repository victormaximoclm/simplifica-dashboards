CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "workspaceId" TEXT,
    "dashboardId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDismiss" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDismiss_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRead_notificationId_userId_key" ON "NotificationRead"("notificationId", "userId");

CREATE UNIQUE INDEX "NotificationDismiss_notificationId_userId_key" ON "NotificationDismiss"("notificationId", "userId");

CREATE INDEX "Notification_dashboardId_idx" ON "Notification"("dashboardId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDismiss" ADD CONSTRAINT "NotificationDismiss_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDismiss" ADD CONSTRAINT "NotificationDismiss_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
