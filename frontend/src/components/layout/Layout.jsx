import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { aiAPI } from '../../services/api';
import useAgentLocation from '../../hooks/useAgentLocation';

export default function Layout() {
  useAgentLocation(); // AGENT bo'lsa — GPS joylashuvni avtomatik yuboradi
  const { data: alertsData } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => aiAPI.getAlerts().then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const criticalAlerts = alertsData?.alerts?.filter(a =>
    ['HIGH', 'CRITICAL'].includes(a.severity)
  ) || [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64">
        {/* Top bar */}
        <header className="h-14 bg-white/70 backdrop-blur-xl border-b border-white/60 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.2)] flex items-center justify-between px-6 gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-gray-500">Tizim ishlayapti</span>
          </div>
          <div className="flex items-center gap-3">
            {criticalAlerts.length > 0 && (
              <a href="/ai" className="relative p-2 rounded-xl bg-white/70 border border-gray-100 shadow-sm hover:shadow transition">
                <Bell size={18} className="text-gray-600" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-red-500 to-rose-600 rounded-full text-white text-xs flex items-center justify-center font-bold shadow">
                  {criticalAlerts.length}
                </span>
              </a>
            )}
            <span className="text-xs text-gray-500 bg-white/70 border border-gray-100 rounded-full px-3 py-1 shadow-sm">
              {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content — sahifa bo'lagi yuklanayotganda sidebar joyida qoladi (v233) */}
        <main className="p-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Yuklanmoqda...</div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
