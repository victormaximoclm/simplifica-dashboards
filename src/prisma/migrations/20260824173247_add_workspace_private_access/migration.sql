/*
  Warnings:

  - You are about to drop the column `extraUserSlots` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the column `planId` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the `Plan` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_planId_fkey";

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "extraUserSlots",
DROP COLUMN "planId",
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Plan";

-- CreateTable
CREATE TABLE "_WorkspaceAllowedUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkspaceAllowedUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_WorkspaceAllowedUsers_B_index" ON "_WorkspaceAllowedUsers"("B");

-- AddForeignKey
ALTER TABLE "_WorkspaceAllowedUsers" ADD CONSTRAINT "_WorkspaceAllowedUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceAllowedUsers" ADD CONSTRAINT "_WorkspaceAllowedUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
