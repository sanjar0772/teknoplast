import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Bot, RefreshCw, AlertTriangle, Target, TrendingUp, Lightbulb,
  ShoppingCart, Wallet, Package, Cog, Banknote, Play, Check, X, SkipForward, Info,
} from 'lucide-react';
import { ahmadAPI } from '../services/api';
import useAuthStore from '../store/authStore';

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

const STEP_ICON = {
  done: { icon: Check, cls: 'text-green-600' },
  failed: { icon: X, cls: 'text-red-600' },
  skipped: { icon: SkipForward, cls: 'text-amber-600' },
  info: { icon: Info, cls: 'text-gray-400' },
};

export default function WorkerPage() {
  const { isOwner } = useAuthStore();
  const [result, setResult] = useState(null);
  const [task, setTask] = useState('');
  const [autoResult, setAutoResult] = useState(null);

  const briefMutation = useMutation({
    mutationFn: () => ahmadAPI.workerBriefing('uz').then(r => r.data),
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.response?.data?.error || 'AI ishchi javob bermadi'),
  });

  const autoMutation = useMutation({
    mutationFn: (t) => ahmadAPI.auto(t, 'uz').then(r => r.data),
    onSuccess: (data) => setAutoResult(data),
    onError: (e) => toast.error(e.response?.data?.error || 'AI ishchi vazifani bajara olmadi'),
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

      {/* AVTONOM vazifa bajaruvchi — faqat EGA */}
      {isOwner() && (
        <div className="card p-5 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-2 mb-2">
            <Play size={16} className="text-indigo-600" />
            <p className="text-sm font-bold text-gray-900">Avtonom vazifa</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Vazifa yozing — AI uni qadamlarga bo'lib, o'zi bajaradi. Masalan: "gul tuvak narxini 9000 qil va ombor sonini 200 ta qil".
            ⚠️ Xodim/foydalanuvchi o'chirish kabi xavfli amallar avtonom bajarilmaydi.
          </p>
          <div className="flex gap-2">
            <input
              value={task}
              onChange={e => setTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && task.trim() && autoMutation.mutate(task)}
              placeholder="Vazifani yozing..."
              className="input flex-1" />
            <button
              onClick={() => task.trim() && autoMutation.mutate(task)}
              disabled={autoMutation.isPending || !task.trim()}
              className="btn-primary btn-sm whitespace-nowrap">
              {autoMutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Bajarmoqda...</> : <><Play size={14} /> Bajar</>}
            </button>
          </div>

          {autoResult && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700">{autoResult.summary}</p>
              <div className="space-y-1.5">
                {(autoResult.log || []).map((l, i) => {
                  const si = STEP_ICON[l.status] || STEP_ICON.info;
                  const Icon = si.icon;
                  return (
                    <div key={i} className="flex gap-2 text-sm bg-white rounded-lg border border-gray-100 p-2">
                      <Icon size={15} className={`${si.cls} flex-shrink-0 mt-0.5`} />
                      <div className="min-w-0">
                        <p className="text-gray-700">{l.step}</p>
                        {l.message && <p className="text-xs text-gray-400">{l.message}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
