-- Alinha o banco ao schema: WorkspaceGuest.updatedAt é @updatedAt (preenchido pelo Prisma), sem DEFAULT no banco.
-- Só altera o catálogo; os valores existentes não mudam.

-- AlterTable
ALTER TABLE "WorkspaceGuest" ALTER COLUMN "updatedAt" DROP DEFAULT;
