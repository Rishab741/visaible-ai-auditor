import { Suspense } from 'react';
import RunningClient from './RunningClient';

export default function RunningPage() {
  return (
    <Suspense fallback={null}>
      <RunningClient />
    </Suspense>
  );
}
