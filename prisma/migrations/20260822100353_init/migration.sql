-- CreateTable
CREATE TABLE "AuditScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUrl" TEXT NOT NULL,
    "hotelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScannedPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditScanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT,
    "markdownContent" TEXT NOT NULL,
    "rawJsonLd" TEXT,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScannedPage_auditScanId_fkey" FOREIGN KEY ("auditScanId") REFERENCES "AuditScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizationSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditScanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "impactReason" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "affectedUrls" TEXT NOT NULL,
    "currentSnippet" TEXT,
    "confidenceScore" REAL NOT NULL DEFAULT 0.9,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizationSuggestion_auditScanId_fkey" FOREIGN KEY ("auditScanId") REFERENCES "AuditScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
