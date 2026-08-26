/*
  Warnings:

  - You are about to drop the `_WorkspaceAllowedUsers` table. Its data cannot be preserved:
    a whitelist entry becomes a "view" permission guest entry via the migration below.

*/
-- CreateTable
CREATE TABLE "WorkspaceGuest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceGuest_userId_idx" ON "WorkspaceGuest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceGuest_workspaceId_userId_key" ON "WorkspaceGuest"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "WorkspaceGuest" ADD CONSTRAINT "WorkspaceGuest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceGuest" ADD CONSTRAINT "WorkspaceGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing whitelist entries into guests with "view" permission, then keep the creator/highAdmin control by promoting them isn't possible generically here, so we default everyone to "view".
INSERT INTO "WorkspaceGuest" ("id", "workspaceId", "userId", "permission", "createdAt", "updatedAt")
SELECT 'wsg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), "B", "A", 'view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_WorkspaceAllowedUsers";

-- DropForeignKey
ALTER TABLE "_WorkspaceAllowedUsers" DROP CONSTRAINT "_WorkspaceAllowedUsers_A_fkey";

-- DropForeignKey
ALTER TABLE "_WorkspaceAllowedUsers" DROP CONSTRAINT "_WorkspaceAllowedUsers_B_fkey";

-- DropTable
DROP TABLE "_WorkspaceAllowedUsers";
