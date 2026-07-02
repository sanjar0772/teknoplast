import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, X, Store, Pencil, Eye, ArrowRight, ArrowLeft, Truck, Warehouse, History, Phone, MapPin, UserPlus, KeyRound, Copy, Trash2, UserCheck, UserX, LogIn } from 'lucide-react';
import { branchesAPI, productsAPI, authAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 my-4 max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const { isOwner } = useAuthStore();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);         // filial qo'shish/tahrirlash
  const [detailId, setDetailId] = useState(null); // filial tafsiloti
  const [transfer, setTransfer] = useState({ product_id: '', rang: '', quantity: '', direction: 'IN' });
  const [seller, setSeller] = useState(null);     // filialga sotuvchi (kirish) qo'shish: { full_name, phone, password }
  const [resetResult, setResetResult] = useState(null); // { full_name, phone, temp_password }

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesAPI.getAll().then(r => r.data),
  });

  const { data: stockData } = useQuery({
    queryKey: ['branch-stock', detailId],
    queryFn: () => branchesAPI.getStock(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const { data: transfersData } = useQuery({
    queryKey: ['branch-transfers', detailId],
    queryFn: () => branchesAPI.getTransfers(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['branch-summary', detailId],
    queryFn: () => branchesAPI.getSummary(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
    enabled: !!detailId,
  });

  // Filialga biriktirilgan sotuvchilar (kirish uchun loginlar)
  const { data: usersData } = useQuery({
    queryKey: ['branch-users', detailId],
    queryFn: () => branchesAPI.getUsers(detailId).then(r => r.data),
    enabled: !!detailId && isOwner(),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => d.id ? branchesAPI.update(d.id, d) : branchesAPI.create(d),
    onSuccess: () => {
      toast.success(form?.id ? 'Filial yangilandi' : 'Filial qo\'shildi');
      qc.invalidateQueries({ queryKey: ['branches'] });
      setForm(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Saqlashda xato'),
  });

  const transferMutation = useMutation({
    mutationFn: (d) => branchesAPI.transfer(detailId, d),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Ko\'chirildi');
      qc.invalidateQueries({ queryKey: ['branch-stock', detailId] });
      qc.invalidateQueries({ queryKey: ['branch-transfers', detailId] });
      qc.invalidateQueries({ queryKey: ['branches'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setTransfer(t => ({ ...t, quantity: '' }));
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Ko\'chirishda xato'),
  });

  // Filialga sotuvchi (savdo boshlig'i) logini yaratish — mavjud auth/register'dan foydalanadi
  const createSellerMutation = useMutation({
    mutationFn: (d) => authAPI.register({ ...d, role: 'SALES_HEAD', branch_id: detailId }),
    onSuccess: () => {
      toast.success('Sotuvchi qo\'shildi — endi shu login-parol bilan filialga kira oladi');
      qc.invalidateQueries({ queryKey: ['branch-users', detailId] });
      setSeller(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || 'Xato'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: (id) => authAPI.resetPassword(id).then(r => r.data),
    onSuccess: (data) => setResetResult(data),
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const toggleUserMutation = useMutation({
    mutationFn: (id) => authAPI.toggleUser(id),
    onSuccess: () => {
      toast.success('Holat o\'zgartirildi');
      qc.invalidateQueries({ queryKey: ['branch-users', detailId] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => authAPI.deleteUser(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'O\'chirildi');
      qc.invalidateQueries({ queryKey: ['branch-users', detailId] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'O\'chirishda xato'),
  });

  const submitForm = () => {
    if (!form.name?.trim()) return toast.error('Filial nomini kiriting');
    saveMutation.mutate(form);
  };

  const submitSeller = () => {
    if (!seller.full_name?.trim()) return toast.error('Sotuvchi ismini kiriting');
    if (!seller.phone?.trim()) return toast.error('Telefon (login) kiriting');
    if (!seller.password || seller.password.length < 6) return toast.error('Parol kamida 6 belgi');
    createSellerMutation.mutate({
      full_name: seller.full_name.trim(),
      phone: seller.phone.trim(),
      password: seller.password,
    });
  };

  const submitTransfer = () => {
    if (!transfer.product_id) return toast.error('Mahsulotni tanlang');
    const qty = parseFloat(transfer.quantity);
    if (!qty || qty <= 0) return toast.error('Miqdorni kiriting');
    transferMutation.mutate({
      product_id: transfer.product_id,
      rang: transfer.rang || null,
      quantity: qty,
      direction: transfer.direction,
    });
  };

  // Tanlangan mahsulotning zavoddagi rang buketlari (IN uchun) / filialdagi (OUT uchun)
  const selProduct = productsData?.products?.find(p => p.id === transfer.product_id);
  const zavodColors = selProduct?.color_stock || [];
  const branchColors = (stockData?.stock || []).filter(s => s.product_id === transfer.product_id);
  const colorOptions = transfer.direction === 'IN' ? zavodColors : branchColors.map(s => ({ rang: s.rang, quantity: s.quantity }));

  const branches = data?.branches || [];
  const detail = branches.find(b => b.id === detailId);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Store size={22} /> Filiallar</h1>
        {isOwner() && (
          <button onClick={() => setForm({ name: '', address: '', phone: '' })} className="btn-primary btn-sm">
            <Plus size={14} /> Filial qo'shish
          </button>
        )}
      </div>

      {/* Filiallar ro'yxati — kartalar */}
      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Yuklanmoqda...</p>
      ) : !branches.length ? (
        <div className="card text-center py-12 text-gray-400">
          <Store size={36} className="mx-auto mb-3 opacity-30" />
          Hali filial yo'q — "Filial qo'shish" tugmasi bilan birinchisini yarating
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(b => (
            <div key={b.id} className={`card-sm space-y-3 ${!b.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Store size={16} className="text-blue-600" /> {b.name}
                  </h3>
                  <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                    {b.address && <div className="flex items-center gap-1"><MapPin size={11} /> {b.address}</div>}
                    {b.phone && <div className="flex items-center gap-1"><Phone size={11} /> {b.phone}</div>}
                  </div>
                </div>
                <span className={b.is_active ? 'badge-green' : 'badge-gray'}>{b.is_active ? 'Faol' : 'Nofaol'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-blue-50 rounded-lg p-2">
                  <p className="text-[11px] text-gray-500">Ombor qiymati</p>
                  <p className="text-sm font-bold text-blue-700">{fmt(b.stock_value)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <p className="text-[11px] text-gray-500">Bu oy savdo</p>
                  <p className="text-sm font-bold text-green-700">{fmt(b.month_revenue)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDetailId(b.id); setTransfer({ product_id: '', rang: '', quantity: '', direction: 'IN' }); }}
                  className="btn-secondary btn-sm flex-1"><Eye size={12} /> Ko'rish</button>
                {isOwner() && (
                  <button onClick={() => setForm({ id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', is_active: !!b.is_active })}
                    className="btn-secondary btn-sm"><Pencil size={12} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filial qo'shish/tahrirlash */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Filialni tahrirlash' : 'Yangi filial'}>
        {form && (
          <div className="space-y-4">
            <div>
              <label className="label">Nomi *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="input" placeholder="Masalan: Chirchiq filiali" />
            </div>
            <div>
              <label className="label">Manzil</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="input" placeholder="Ixtiyoriy" />
            </div>
            <div>
              <label className="label">Telefon</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="input" placeholder="+998..." />
            </div>
            {form.id && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="branch-active" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="branch-active" className="text-sm text-gray-700">Faol filial</label>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setForm(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitForm} disabled={saveMutation.isPending} className="btn-primary flex-1">
                {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Filial tafsiloti — ombor, ko'chirish, tarix, hisobot */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={`Filial: ${detail?.name || ''}`} wide>
        {detail && (
          <div className="space-y-5">
            {/* Hisobot kartalari */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Jami savdo', value: fmt(summaryData?.summary?.total_revenue), color: 'text-blue-700' },
                { label: "To'langan", value: fmt(summaryData?.summary?.paid_amount), color: 'text-green-700' },
                { label: 'Qarz', value: fmt(summaryData?.summary?.debt_amount), color: 'text-red-600' },
                { label: 'Savdolar soni', value: summaryData?.summary?.total_count || 0, color: 'text-gray-900' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card-sm text-center">
                  <p className="text-[11px] text-gray-500">{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Filial sotuvchilari (kirish loginlari) — faqat OWNER */}
            {isOwner() && (
              <div className="border border-green-200 bg-green-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
                    <LogIn size={15} /> Filial sotuvchilari (kirish)
                  </div>
                  <button onClick={() => setSeller({ full_name: '', phone: '', password: '' })}
                    className="btn-primary btn-sm">
                    <UserPlus size={13} /> Sotuvchi qo'shish
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Bu yerda filialga sotuvchi (savdo boshlig'i) uchun <b>login-parol</b> yarating.
                  U shu login bilan tizimga kirganda to'g'ridan-to'g'ri <b>{detail.name}</b> ichida,
                  aynan asosiy tizimdagidek ishlaydi (savdo, mijozlar, qarzlar, ombor — hammasi shu filial bo'yicha).
                </p>
                <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                  <table className="table text-sm">
                    <thead><tr><th>Ism</th><th>Login (telefon)</th><th>Holat</th><th className="text-right">Amal</th></tr></thead>
                    <tbody>
                      {!(usersData?.users || []).length ? (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">
                          Hali sotuvchi yo'q — "Sotuvchi qo'shish" bilan filialga kirish uchun login yarating
                        </td></tr>
                      ) : usersData.users.map(u => (
                        <tr key={u.id}>
                          <td className="font-medium">{u.full_name}</td>
                          <td className="whitespace-nowrap">{u.phone}</td>
                          <td>{u.is_active ? <span className="badge-green">Faol</span> : <span className="badge-gray">Bloklangan</span>}</td>
                          <td>
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => { if (window.confirm(`${u.full_name} uchun yangi vaqtinchalik parol yaratilsinmi?`)) resetPwdMutation.mutate(u.id); }}
                                disabled={resetPwdMutation.isPending}
                                title="Parolni tiklash" className="btn-secondary btn-sm">
                                <KeyRound size={12} /> Parol
                              </button>
                              <button
                                onClick={() => toggleUserMutation.mutate(u.id)}
                                className={u.is_active ? 'btn-danger btn-sm' : 'btn-success btn-sm'}>
                                {u.is_active ? <><UserX size={12} /> Bloklash</> : <><UserCheck size={12} /> Faollash</>}
                              </button>
                              <button
                                onClick={() => { if (window.confirm(`${u.full_name} ni BUTUNLAY o'chirasizmi? Qaytarib bo'lmaydi!`)) deleteUserMutation.mutate(u.id); }}
                                disabled={deleteUserMutation.isPending}
                                title="Butunlay o'chirish"
                                className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-2 flex items-center">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tovar ko'chirish — faqat OWNER */}
            {isOwner() && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                  <Truck size={15} /> Tovar ko'chirish
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setTransfer(t => ({ ...t, direction: 'IN', rang: '' }))}
                    className={`btn-sm flex-1 rounded-lg border flex items-center justify-center gap-1 ${transfer.direction === 'IN' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                    <ArrowRight size={13} /> Zavod → Filial
                  </button>
                  <button onClick={() => setTransfer(t => ({ ...t, direction: 'OUT', rang: '' }))}
                    className={`btn-sm flex-1 rounded-lg border flex items-center justify-center gap-1 ${transfer.direction === 'OUT' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                    <ArrowLeft size={13} /> Filial → Zavod
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select value={transfer.product_id}
                    onChange={e => setTransfer(t => ({ ...t, product_id: e.target.value, rang: '' }))}
                    className="select text-sm">
                    <option value="">— Mahsulot —</option>
                    {(productsData?.products || []).filter(p => p.kind !== 'KOMPONENT').map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Zavod: {p.stock_quantity})</option>
                    ))}
                  </select>
                  <select value={transfer.rang}
                    onChange={e => setTransfer(t => ({ ...t, rang: e.target.value }))}
                    className="select text-sm" disabled={!transfer.product_id}>
                    <option value="">{colorOptions.length ? '— Rang —' : 'Rangsiz'}</option>
                    {colorOptions.map((c, i) => (
                      <option key={i} value={c.rang || ''}>{rangLabel(c.rang)} ({fmt(c.quantity)})</option>
                    ))}
                  </select>
                  <input type="number" min="1" value={transfer.quantity}
                    onChange={e => setTransfer(t => ({ ...t, quantity: e.target.value }))}
                    placeholder="Miqdor" className="input text-sm" />
                </div>
                <button onClick={submitTransfer} disabled={transferMutation.isPending}
                  className="btn-primary btn-sm w-full">
                  {transferMutation.isPending ? 'Ko\'chirilmoqda...' : (transfer.direction === 'IN' ? 'Filialga jo\'natish' : 'Zavodga qaytarish')}
                </button>
              </div>
            )}

            {/* Filial ombori */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-gray-700 text-sm flex items-center gap-1.5">
                  <Warehouse size={15} className="text-blue-600" /> Filial ombori
                </h5>
                <span className="text-xs text-gray-400">Qiymati: <b className="text-blue-700">{fmt(stockData?.total_value)} so'm</b></span>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="table text-sm">
                  <thead><tr><th>Mahsulot</th><th>Rang</th><th className="text-right">Qoldiq</th><th className="text-right">Narx</th></tr></thead>
                  <tbody>
                    {!(stockData?.stock || []).length ? (
                      <tr><td colSpan={4} className="text-center py-6 text-gray-400">Filial ombori bo'sh</td></tr>
                    ) : stockData.stock.map((s, i) => (
                      <tr key={i}>
                        <td className="font-medium">{s.product_name}</td>
                        <td>{rangLabel(s.rang)}</td>
                        <td className="text-right font-bold text-blue-700">{fmt(s.quantity)} {s.unit || 'dona'}</td>
                        <td className="text-right text-gray-500">{fmt(s.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ko'chirish tarixi */}
            <div>
              <h5 className="font-semibold text-gray-700 text-sm flex items-center gap-1.5 mb-2">
                <History size={15} className="text-gray-500" /> Ko'chirish tarixi
              </h5>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="table text-sm">
                  <thead><tr><th>Sana</th><th>Yo'nalish</th><th>Mahsulot</th><th className="text-right">Miqdor</th><th>Kim</th></tr></thead>
                  <tbody>
                    {!(transfersData?.transfers || []).length ? (
                      <tr><td colSpan={5} className="text-center py-6 text-gray-400">Hali ko'chirish yo'q</td></tr>
                    ) : transfersData.transfers.map(t => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap text-xs">{new Date(String(t.created_at).replace(' ', 'T')).toLocaleDateString('uz-UZ')}</td>
                        <td>
                          {t.direction === 'IN'
                            ? <span className="badge-green">→ Filialga</span>
                            : <span className="badge-yellow">← Zavodga</span>}
                        </td>
                        <td>{t.product_name}{t.rang ? ` · ${t.rang}` : ''}</td>
                        <td className="text-right font-semibold">{fmt(t.quantity)} {t.unit || 'dona'}</td>
                        <td className="text-xs text-gray-500">{t.created_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Filialga sotuvchi (kirish) qo'shish */}
      <Modal open={!!seller} onClose={() => setSeller(null)} title={`Sotuvchi qo'shish — ${detail?.name || ''}`}>
        {seller && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Bu sotuvchi <b>savdo boshlig'i</b> sifatida shu login-parol bilan kirib, faqat
              <b> {detail?.name}</b> filiali bo'yicha ishlaydi.
            </p>
            <div>
              <label className="label">To'liq ism *</label>
              <input value={seller.full_name} onChange={e => setSeller(s => ({ ...s, full_name: e.target.value }))}
                className="input" placeholder="Ism Familiya" />
            </div>
            <div>
              <label className="label">Login (telefon) *</label>
              <input value={seller.phone} onChange={e => setSeller(s => ({ ...s, phone: e.target.value }))}
                className="input" placeholder="+998..." />
            </div>
            <div>
              <label className="label">Parol * (kamida 6 belgi)</label>
              <input value={seller.password} onChange={e => setSeller(s => ({ ...s, password: e.target.value }))}
                className="input" placeholder="Parol"
                onKeyDown={e => e.key === 'Enter' && submitSeller()} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setSeller(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitSeller} disabled={createSellerMutation.isPending} className="btn-primary flex-1">
                {createSellerMutation.isPending ? 'Saqlanmoqda...' : 'Qo\'shish'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Parol tiklash natijasi */}
      <Modal open={!!resetResult} onClose={() => setResetResult(null)} title="Yangi parol yaratildi">
        {resetResult && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>{resetResult.full_name}</strong> uchun yangi vaqtinchalik parol:
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <code className="flex-1 text-lg font-bold tracking-wider text-indigo-700">{resetResult.temp_password}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(resetResult.temp_password); toast.success('Nusxa olindi'); }}
                className="btn-secondary btn-sm" title="Nusxa olish">
                <Copy size={14} />
              </button>
            </div>
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
              ⚠️ Bu parolni sotuvchiga bering ({resetResult.phone}). U kirgach o'z parolini o'zgartirsin. Parol qayta ko'rsatilmaydi.
            </div>
            <button onClick={() => setResetResult(null)} className="btn-primary w-full">Tushunarli</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
