-- CreateTable
CREATE TABLE "DocumentHtmlContent" (
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentHtmlContent_pkey" PRIMARY KEY ("fileId")
);

-- AddForeignKey
ALTER TABLE "DocumentHtmlContent" ADD CONSTRAINT "DocumentHtmlContent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
