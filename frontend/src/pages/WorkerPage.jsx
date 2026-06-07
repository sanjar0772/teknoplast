import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Bot, RefreshCw, AlertTriangle, Target, TrendingUp, Lightbulb,
  ShoppingCart, Wallet, Package, Cog, Banknote,
} from 'lucide-react';
import { ahmadAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Section({ icon: Icon, title, items, color, empty }) {
  return (
    <div className="card">
      <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${color}`}>
        <Icon size={16} /> {title}
      </h2>
      {items && items.length ? (
        <ul className="space-y-2">
          {items.map((t, i) => (
            <li key={i} className="text-sm text-gray-700 flex gap-2">
              <span className="text-gray-300 mt-0.5">•</span>
              <span className="flex-1">{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">{empty}</p>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, bg }) {
  return (
    <div className="card-sm flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

export default function WorkerPage() {
  const [result, setResult] = useState(null);

  const briefMutation = useMutation({
    mutationFn: () => ahmadAPI.workerBriefing('uz').then(r => r.data),
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.response?.data?.error || 'AI ishchi javob bermadi'),
  });

  const b = result?.briefing;
  const d = result?.data;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Bot size={22} className="text-indigo-600" /> AI Ishchi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Claude o'zi ma'lumotni tahlil qiladi: ogohlantirish, bugungi vazifa, prognoz va tavsiya beradi (xavfsiz — hech narsani o'zgartirmaydi).
          </p>
        </div>
        <button onClick={() => briefMutation.mutate()} disabled={briefMutation.isPending} className="btn-primary btn-sm">
          <RefreshCw size={14} className={briefMutation.isPending ? 'animate-spin' : ''} />
          {briefMutation.isPending ? 'Tahlil qilmoqda...' : (result ? 'Yangilash' : 'Ishni boshlash')}
        </button>
      </div>

      {!result && !briefMutation.isPending && (
        <div className="card text-center py-16">
          <Bot size={48} className="mx-auto mb-4 text-indigo-300" />
          <p className="text-gray-600 font-medium">AI Ishchi tayyor</p>
          <p className="text-sm text-gray-400 mt-1">"Ishni boshlash" tugmasini bossangiz — zavod holatini tahlil qilib beradi.</p>
        </div>
      )}

      {briefMutation.isPending && (
        <div className="card text-center py-16">
          <RefreshCw size={36} className="mx-auto mb-3 text-indigo-500 animate-spin" />
          <p className="text-gray-500 text-sm">AI Ishchi ma'lumotlarni o'rganmoqda...</p>
        </div>
      )}

      {result && (
        <>
          {/* Ma'lumot xulosa */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MiniStat icon={ShoppingCart} bg="bg-blue-500" label="Bugun sotuv" value={`${fmt(d?.bugun?.sotuv)} so'm`} />
            <MiniStat icon={Banknote} bg={d?.oy?.foyda >= 0 ? 'bg-green-500' : 'bg-red-500'} label="Oylik foyda" value={`${fmt(d?.oy?.foyda)} so'm`} />
            <MiniStat icon={Target} bg="bg-indigo-500" label="Reja bajarilishi" value={d?.reja?.bajarilish_foiz != null ? `${d.reja.bajarilish_foiz}%` : '—'} />
            <MiniStat icon={Wallet} bg="bg-amber-500" label="Qarz" value={`${fmt(d?.qarz?.jami)} so'm`} />
            <MiniStat icon={Package} bg="bg-orange-500" label="Kam qolgan" value={`${d?.ombor_kam_qolgan?.soni || 0} ta`} />
            <MiniStat icon={Cog} bg="bg-rose-500" label="Buzilgan mashina" value={`${d?.mashina_buzilgan_soni || 0} ta`} />
          </div>

          {/* AI bo'limlari */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section icon={AlertTriangle} title="🚨 Ogohlantirishlar" color="text-red-600" items={b?.alerts} empty="Shoshilinch muammo yo'q." />
            <Section icon={Target} title="🎯 Bugungi vazifalar" color="text-blue-600" items={b?.priorities} empty="Vazifa belgilanmadi." />
            <Section icon={TrendingUp} title="📊 Tahlil va prognoz" color="text-purple-600" items={b?.insights} empty="Tahlil yo'q." />
            <Section icon={Lightbulb} title="💡 Tavsiyalar" color="text-green-600" items={b?.recommendations} empty="Tavsiya yo'q." />
          </div>

          {result.generated_at && (
            <p className="text-xs text-gray-400 text-center">
              Tahlil vaqti: {new Date(result.generated_at).toLocaleString('uz-UZ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
