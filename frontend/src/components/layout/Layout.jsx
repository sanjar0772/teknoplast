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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 ml-64">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-3 sticky top-0 z-20">
          {criticalAlerts.length > 0 && (
            <a href="/ai" className="relative p-2 rounded-lg hover:bg-gray-100 transition">
              <Bell size={18} className="text-gray-600" />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                {criticalAlerts.length}
              </span>
            </a>
          )}
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
