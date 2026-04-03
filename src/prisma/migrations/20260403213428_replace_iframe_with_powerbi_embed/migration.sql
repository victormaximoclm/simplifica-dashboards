/*
  Warnings:

  - You are about to drop the column `embedUrl` on the `Dashboard` table. All the data in the column will be lost.
  - You are about to drop the column `iframeCode` on the `Dashboard` table. All the data in the column will be lost.
  - Added the required column `pbWorkspaceId` to the `Dashboard` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_workspaceId_fkey";

-- AlterTable
ALTER TABLE "Dashboard" DROP COLUMN "embedUrl",
DROP COLUMN "iframeCode",
ADD COLUMN     "pbWorkspaceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
