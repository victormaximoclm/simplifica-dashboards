-- Site do módulo de Documentos: tabelas DocumentSite e DocumentSitePage e storageKey opcional.
-- O Site não tem blob no storage, então DocumentFile.storageKey passa a aceitar NULL (o índice único continua
-- válido: o Postgres permite vários NULL). Só altera o catálogo, sem reescrever nem varrer a tabela.

-- Falha rápido em vez de enfileirar tráfego atrás de uma transação longa na tabela
SET lock_timeout = '10s';

-- AlterTable
ALTER TABLE "DocumentFile" ALTER COLUMN "storageKey" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DocumentSite" (
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSite_pkey" PRIMARY KEY ("fileId")
);

-- CreateTable
CREATE TABLE "DocumentSitePage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSitePage_siteId_parentId_position_idx" ON "DocumentSitePage"("siteId", "parentId", "position");

-- AddForeignKey
ALTER TABLE "DocumentSite" ADD CONSTRAINT "DocumentSite_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSitePage" ADD CONSTRAINT "DocumentSitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "DocumentSite"("fileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSitePage" ADD CONSTRAINT "DocumentSitePage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentSitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSitePage" ADD CONSTRAINT "DocumentSitePage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
