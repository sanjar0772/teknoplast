import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserSquare2, MapPin, Store, Phone, Save, Navigation } from 'lucide-react';
import { agentAPI } from '../services/api';

// Agent shaxsiy ma'lumotlari sahifasi: F.I.Sh., passport, manzil, tug'ilgan sana.
// Pastda GPS holati — oxirgi yuborilgan joylashuv va qo'lda yuborish tugmasi.
export default function AgentProfilePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: '', passport: '', address: '', birth_date: '' });
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-profile'],
    queryFn: () => agentAPI.getProfile().then(r => r.data),
  });
  const profile = data?.profile;

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        passport: profile.passport || '',
        address: profile.address || '',
        birth_date: profile.birth_date ? String(profile.birth_date).slice(0, 10) : '',
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (d) => agentAPI.updateProfile(d),
    onSuccess: () => {
      toast.success("Shaxsiy ma'lumotlar saqlandi");
      qc.invalidateQueries({ queryKey: ['agent-profile'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Saqlashda xato'),
  });

  const submit = () => {
    if (!form.full_name.trim()) return toast.error('Ism-familiya kerak');
    saveMutation.mutate(form);
  };

  // Joylashuvni qo'lda yuborish (avtomatik ham yuboriladi — bu tekshirish uchun)
  const sendNow = () => {
    if (!navigator.geolocation) return toast.error('Telefonda GPS mavjud emas');
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await agentAPI.sendLocation({
            lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
          });
          toast.success('Joylashuv yuborildi');
          qc.invalidateQueries({ queryKey: ['agent-profile'] });
        } catch {
          toast.error('Joylashuv yuborishda xato');
        } finally { setSending(false); }
      },
      () => { setSending(false); toast.error("GPS ruxsati berilmagan — telefon sozlamalaridan ruxsat bering"); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  if (isLoading) return <p className="text-gray-400 py-10 text-center">Yuklanmoqda...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><UserSquare2 size={20} /> Mening profilim</h1>
      </div>

      {/* Login ma'lumotlari */}
      <div className="card p-4 flex items-center gap-4 flex-wrap text-sm text-gray-600">
        <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-600" /> {profile?.phone}</span>
        {profile?.branch_name && (
          <span className="flex items-center gap-1.5"><Store size={14} className="text-blue-600" /> {profile.branch_name}</span>
        )}
        <span className="badge-blue">Sotuv agenti</span>
      </div>

      {/* Shaxsiy ma'lumotlar */}
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Shaxsiy ma'lumotlar</h3>
        <div>
          <label className="label">Ism-familiya *</label>
          <input className="input" value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="Ism Familiya" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Passport seriya-raqami</label>
            <input className="input" value={form.passport}
              onChange={e => setForm(f => ({ ...f, passport: e.target.value }))}
              placeholder="AB 1234567" />
          </div>
          <div>
            <label className="label">Tug'ilgan sana</label>
            <input type="date" className="input" value={form.birth_date}
              onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">Yashash manzili</label>
          <input className="input" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Viloyat, tuman, ko'cha, uy" />
        </div>
        <button onClick={submit} disabled={saveMutation.isPending} className="btn-primary w-full sm:w-auto">
          <Save size={14} /> {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>

      {/* GPS holati */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <MapPin size={16} className="text-emerald-600" /> GPS joylashuv
        </h3>
        <p className="text-xs text-gray-500">
          Joylashuvingiz ish vaqtida avtomatik yuborib turiladi (har 5 daqiqada) — rahbar xaritada ko'radi.
          Telefon GPS ruxsatini bergan bo'lishingiz kerak.
        </p>
        {profile?.last_location_at ? (
          <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
            <span className="text-gray-600">
              Oxirgi yuborilgan: <b>{new Date(profile.last_location_at).toLocaleString('uz-UZ')}</b>
            </span>
            <a href={`https://maps.google.com/?q=${profile.last_lat},${profile.last_lng}`}
              target="_blank" rel="noreferrer"
              className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium">
              <MapPin size={13} /> Xaritada ko'rish
            </a>
          </div>
        ) : (
          <p className="text-sm text-amber-600">Hali joylashuv yuborilmagan</p>
        )}
        <button onClick={sendNow} disabled={sending} className="btn-secondary">
          <Navigation size={14} /> {sending ? 'Yuborilmoqda...' : 'Hozir yuborish'}
        </button>
      </div>
    </div>
  );
}
