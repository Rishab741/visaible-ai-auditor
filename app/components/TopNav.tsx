'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');

  return (
    <header className="border-b border-white/10 bg-[#05070d]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-cyan-400 tracking-tight">
          Arthur <span className="text-white">AI</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-1.5 transition-colors ${
              isDashboard ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
