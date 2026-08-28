-- AlterTable
ALTER TABLE "AuditScan" ADD COLUMN     "crawlUrls" JSONB,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "processingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScannedPage" ADD COLUMN     "structuralSignals" JSONB;
