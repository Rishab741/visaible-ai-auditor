'use client';

import { useRouter } from 'next/navigation';
import AuditReport, { AuditScanResult } from '@/app/components/AuditReport';

export default function AuditResultClient({ initialScan }: { initialScan: AuditScanResult }) {
  const router = useRouter();

  // Routed through the same loading page as a fresh search, rather than a
  // bare spinner on this page — a forced re-crawl can take up to ~2 minutes,
  // and the staged loader gives real feedback for that wait.
  const handleRefresh = () => {
    router.push(`/audit/running?q=${encodeURIComponent(initialScan.targetUrl)}&forceRefresh=true`);
  };

  return <AuditReport data={initialScan} onRefresh={handleRefresh} refreshing={false} />;
}
