import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, X, Store, Pencil, Eye, Warehouse, Phone, MapPin, UserPlus, KeyRound, Copy, Trash2, UserCheck, UserX, LogIn, PackagePlus } from 'lucide-react';
import { branchesAPI, authAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';
// Filial xodimi rollari
const BRANCH_ROLE = {
  SALES_HEAD: { label: 'Savdo boshlig\'i', cls: 'badge-green' },
  AGENT:      { label: 'Savdo agenti',    cls: 'badge-blue' },
};
const branchRoleInfo = (r) => BRANCH_ROLE[r] || { label: r, cls: 'badge-gray' };

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
  const { isOwner, enterBranch, activeBranch } = useAuthStore();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);         // filial qo'shish/tahrirlash
  const [detailId, setDetailId] = useState(null); // filial tafsiloti
  const [seller, setSeller] = useState(null);     // filialga sotuvchi (kirish) qo'shish: { full_name, phone, password }
  const [resetResult, setResetResult] = useState(null); // { full_name, phone, temp_password }

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesAPI.getAll().then(r => r.data),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['branch-summary', detailId],
    queryFn: () => branchesAPI.getSummary(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  // Filialning O'Z mahsulotlari (nusxalangan katalog + o'z ombori)
  const { data: branchProductsData } = useQuery({
    queryKey: ['branch-products', detailId],
    queryFn: () => branchesAPI.getProducts(detailId).then(r => r.data),
    enabled: !!detailId && isOwner(),
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

  // Zavod mahsulot katalogini filialga nusxalash (qoldiq 0 dan; zavodga tegmaydi)
  const copyMutation = useMutation({
    mutationFn: () => branchesAPI.copyProducts(detailId).then(r => r.data),
    onSuccess: (d) => {
      toast.success(d.copied > 0
        ? `${d.copied} ta mahsulot filialga nusxalandi`
        : 'Yangi mahsulot yo\'q — hammasi allaqachon nusxalangan');
      qc.invalidateQueries({ queryKey: ['branch-products', detailId] });
      qc.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Nusxalashda xato'),
  });

  // Filialga xodim (savdo boshlig'i yoki savdo agenti) logini yaratish — mavjud auth/register'dan
  const createSellerMutation = useMutation({
    mutationFn: (d) => authAPI.register({
      full_name: d.full_name, phone: d.phone, password: d.password,
      role: d.role === 'AGENT' ? 'AGENT' : 'SALES_HEAD', branch_id: detailId,
    }),
    onSuccess: () => {
      toast.success('Qo\'shildi — endi shu login-parol bilan filialga kira oladi');
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
    if (!seller.full_name?.trim()) return toast.error('Ismini kiriting');
    if (!seller.phone?.trim()) return toast.error('Telefon (login) kiriting');
    if (!seller.password || seller.password.length < 6) return toast.error('Parol kamida 6 belgi');
    createSellerMutation.mutate({
      full_name: seller.full_name.trim(),
      phone: seller.phone.trim(),
      password: seller.password,
      role: seller.role === 'AGENT' ? 'AGENT' : 'SALES_HEAD',
    });
  };

  const branches = data?.branches || [];
  const detail = branches.find(b => b.id === detailId);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Store size={22} /> Filiallar</h1>
        {/* "Filial qo'shish" tugmasi hozircha olib tashlangan (egasi talabi) */}
      </div>

      {/* Filiallar ro'yxati — kartalar */}
      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Yuklanmoqda...</p>
      ) : !branches.length ? (
        <div className="card text-center py-12 text-gray-400">
          <Store size={36} className="mx-auto mb-3 opacity-30" />
          Hali filial yo'q
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
                <button onClick={() => setDetailId(b.id)}
                  className="btn-secondary btn-sm flex-1"><Eye size={12} /> Ko'rish</button>
                {isOwner() && (
                  <button onClick={() => setForm({ id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', is_active: !!b.is_active })}
                    className="btn-secondary btn-sm"><Pencil size={12} /></button>
                )}
              </div>
              {isOwner() && b.is_active && (
                activeBranch?.id === b.id ? (
                  <div className="w-full text-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5">
                    <Store size={12} className="inline mr-1" /> Hozir shu filial ichidasiz
                  </div>
                ) : (
                  <button onClick={() => enterBranch(b)}
                    className="btn-primary btn-sm w-full">
                    <LogIn size={13} /> Admin sifatida kirish
                  </button>
                )
              )}
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

      {/* Filial tafsiloti — kirish loginlari, mahsulot nusxalash, filial ombori, hisobot */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={`Filial: ${detail?.name || ''}`} wide>
        {detail && (
          <div className="space-y-5">
            {/* Hisobot kartalari — faqat shu filial savdosi */}
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
                    <LogIn size={15} /> Filial xodimlari (kirish)
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSeller({ full_name: '', phone: '', password: '', role: 'SALES_HEAD' })}
                      className="btn-primary btn-sm">
                      <UserPlus size={13} /> Sotuvchi qo'shish
                    </button>
                    <button onClick={() => setSeller({ full_name: '', phone: '', password: '', role: 'AGENT' })}
                      className="btn-secondary btn-sm">
                      <UserPlus size={13} /> Agent qo'shish
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Filialga <b>login-parol</b> yarating: <b>Savdo boshlig'i</b> — filialni to'liq boshqaradi
                  (mahsulot, ombor, mijoz, qarz, hisobot); <b>Savdo agenti</b> — faqat o'z savdolarini qiladi
                  (mijoz topadi, sotadi). Ikkovi ham kirganda to'g'ridan-to'g'ri <b>{detail.name}</b> ichida ishlaydi.
                </p>
                <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                  <table className="table text-sm">
                    <thead><tr><th>Ism</th><th>Login (telefon)</th><th>Rol</th><th>Holat</th><th className="text-right">Amal</th></tr></thead>
                    <tbody>
                      {!(usersData?.users || []).length ? (
                        <tr><td colSpan={5} className="text-center py-6 text-gray-400">
                          Hali xodim yo'q — "Sotuvchi qo'shish" yoki "Agent qo'shish" bilan filialga kirish uchun login yarating
                        </td></tr>
                      ) : usersData.users.map(u => (
                        <tr key={u.id}>
                          <td className="font-medium">{u.full_name}</td>
                          <td className="whitespace-nowrap">{u.phone}</td>
                          <td><span className={branchRoleInfo(u.role).cls}>{branchRoleInfo(u.role).label}</span></td>
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

            {/* Mahsulot katalogini nusxalash — faqat OWNER */}
            {isOwner() && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                    <PackagePlus size={15} /> Filial mahsulot katalogi
                  </div>
                  <button
                    onClick={() => { if (window.confirm('Zavod mahsulotlari shu filialga nusxalansinmi?\nZavod omboriga TEGILMAYDI, filial qoldig\'i 0 dan boshlanadi.')) copyMutation.mutate(); }}
                    disabled={copyMutation.isPending} className="btn-primary btn-sm">
                    <PackagePlus size={13} /> {copyMutation.isPending ? 'Nusxalanmoqda...' : 'Zavod mahsulotlarini nusxalash'}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Filialning <b>o'z</b> mahsulot ro'yxati. "Nusxalash" zavod katalogini bu filialga ko'chiradi
                  (narxi bilan, qoldiq 0). Keyin filial sotuvchisi qoldiqni <b>o'zi kiritadi</b> (Mahsulotlar sahifasida).
                  <b> Zavod ombori hech qachon o'zgarmaydi.</b> Zavodga yangi mahsulot qo'shsangiz — shu tugmani yana bosib
                  filialga qo'shib olasiz (mavjudlari takrorlanmaydi).
                </p>
              </div>
            )}

            {/* Filial mahsulotlari va ombori */}
            {isOwner() && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-semibold text-gray-700 text-sm flex items-center gap-1.5">
                    <Warehouse size={15} className="text-blue-600" /> Filial mahsulotlari va ombori
                    <span className="text-xs font-normal text-gray-400">({branchProductsData?.count || 0} ta)</span>
                  </h5>
                  <span className="text-xs text-gray-400">Qiymati: <b className="text-blue-700">{fmt(branchProductsData?.total_value)} so'm</b></span>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="table text-sm">
                    <thead><tr><th>Mahsulot</th><th>Rang</th><th className="text-right">Qoldiq</th><th className="text-right">Narx</th></tr></thead>
                    <tbody>
                      {!(branchProductsData?.products || []).length ? (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">
                          Filialda hali mahsulot yo'q — yuqoridagi "Zavod mahsulotlarini nusxalash" tugmasini bosing
                        </td></tr>
                      ) : branchProductsData.products.map((s) => (
                        <tr key={s.id}>
                          <td className="font-medium">{s.name}</td>
                          <td>{rangLabel(s.rang)}</td>
                          <td className="text-right font-bold text-blue-700">{fmt(s.stock_quantity)} {s.unit || 'dona'}</td>
                          <td className="text-right text-gray-500">{fmt(s.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Filialga sotuvchi (kirish) qo'shish */}
      <Modal open={!!seller} onClose={() => setSeller(null)}
        title={`${seller?.role === 'AGENT' ? 'Agent' : 'Sotuvchi'} qo'shish — ${detail?.name || ''}`}>
        {seller && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              {seller.role === 'AGENT' ? (
                <>Bu xodim <b>savdo agenti</b> sifatida shu login-parol bilan kirib, faqat
                <b> {detail?.name}</b> filiali bo'yicha, faqat <b>o'z savdolarini</b> qiladi (mijoz topadi, sotadi).</>
              ) : (
                <>Bu xodim <b>savdo boshlig'i</b> sifatida shu login-parol bilan kirib,
                <b> {detail?.name}</b> filialini to'liq boshqaradi (mahsulot, ombor, mijoz, qarz, hisobot).</>
              )}
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
