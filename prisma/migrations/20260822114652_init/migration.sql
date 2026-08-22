-- CreateTable
CREATE TABLE "AuditScan" (
    "id" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "hotelName" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannedPage" (
    "id" TEXT NOT NULL,
    "auditScanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT,
    "markdownContent" TEXT NOT NULL,
    "rawJsonLd" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationSuggestion" (
    "id" TEXT NOT NULL,
    "auditScanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "impactReason" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "affectedUrls" TEXT NOT NULL,
    "currentSnippet" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationSuggestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScannedPage" ADD CONSTRAINT "ScannedPage_auditScanId_fkey" FOREIGN KEY ("auditScanId") REFERENCES "AuditScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationSuggestion" ADD CONSTRAINT "OptimizationSuggestion_auditScanId_fkey" FOREIGN KEY ("auditScanId") REFERENCES "AuditScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
