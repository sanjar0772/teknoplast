import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackagePlus, X, Search, Plus, Trash2, Check, Ban, Eye, Clock } from 'lucide-react';
import { intakesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const STATUS = {
  PENDING:  { label: 'Kutilmoqda', cls: 'badge-yellow' },
  APPROVED: { label: 'Tasdiqlangan', cls: 'badge-green' },
  REJECTED: { label: 'Rad etilgan', cls: 'badge-gray' },
};

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function IntakePage() {
  const { isOwner, isSalesHead, isKirimchi, isProductionHead } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{id,name,razmer,rang,qty,stock}]
  const [notes, setNotes] = useState('');

  const canCreate = isOwner() || isKirimchi() || isProductionHead();
  const canApprove = isOwner() || isSalesHead();

  const { data, isLoading } = useQuery({
    queryKey: ['intakes'],
    queryFn: () => intakesAPI.getAll().then(r => r.data),
  });
  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
    enabled: showForm,
  });
  const { data: detail } = useQuery({
    queryKey: ['intake', detailId],
    queryFn: () => intakesAPI.getById(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const products = productsData?.products || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [search, products]);

  const createMutation = useMutation({
    mutationFn: (d) => intakesAPI.create(d),
    onSuccess: () => {
      toast.success('Kirim yuborildi — tasdiqlash kutilmoqda');
      qc.invalidateQueries({ queryKey: ['intakes'] });
      setShowForm(false); setCart([]); setNotes(''); setSearch('');
    },
  });
  const approveMutation = useMutation({
    mutationFn: (id) => intakesAPI.approve(id),
    onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['intakes'] }); qc.invalidateQueries({ queryKey: ['products'] }); setDetailId(null); },
  });
  const rejectMutation = useMutation({
    mutationFn: (id) => intakesAPI.reject(id),
    onSuccess: () => { toast.success('Kirim rad etildi'); qc.invalidateQueries({ queryKey: ['intakes'] }); setDetailId(null); },
  });

  const addToCart = (p) => {
    setCart(c => c.find(x => x.id === p.id)
      ? c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x)
      : [...c, { id: p.id, name: p.name, qty: 1, stock: p.stock_quantity }]);
  };
  const submit = () => {
    if (!cart.length) return toast.error('Mahsulot qo\'shing');
    createMutation.mutate({ items: cart.map(x => ({ product_id: x.id, quantity: parseInt(x.qty) })), notes });
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mahsulot Kirim</h1>
        {canCreate && (
          <button onClick={() => { setCart([]); setNotes(''); setShowForm(true); }} className="btn-primary btn-sm">
            <PackagePlus size={14} /> Yangi kirim
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Sana</th><th>Kirituvchi</th><th>Mahsulot xili</th><th>Jami miqdor</th><th>Status</th><th>Amal</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.intakes?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Kirim yo'q</td></tr>
            ) : data.intakes.map(i => {
              const st = STATUS[i.status] || STATUS.PENDING;
              return (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{new Date(i.created_at).toLocaleDateString('uz-UZ')}</td>
                  <td>{i.created_by_name || '—'}</td>
                  <td>{i.item_count} xil</td>
                  <td className="font-semibold">{fmt(i.total_qty)} dona</td>
                  <td><span className={st.cls}>{st.label}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setDetailId(i.id)} className="btn-secondary btn-sm"><Eye size={12} /></button>
                      {canApprove && i.status === 'PENDING' && (
                        <>
                          <button onClick={() => approveMutation.mutate(i.id)} className="btn-success btn-sm"><Check size={12} /> Tasdiq</button>
                          <button onClick={() => rejectMutation.mutate(i.id)} className="btn-danger btn-sm"><Ban size={12} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Yangi kirim" wide>
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mahsulot qidirish..." className="input pl-8" />
          </div>
          {search && (
            <div className="border border-gray-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
              {filtered.map(p => (
                <button key={p.id} onClick={() => addToCart(p)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 text-sm">
                  <span>{p.name} <span className="text-xs text-gray-400">(ombor: {p.stock_quantity})</span></span>
                  <Plus size={14} className="text-blue-600" />
                </button>
              ))}
            </div>
          )}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="table text-sm">
              <thead><tr><th>Mahsulot</th><th className="w-28">Kirim miqdori</th><th className="w-10"></th></tr></thead>
              <tbody>
                {!cart.length ? (
                  <tr><td colSpan={3} className="text-center py-6 text-gray-400">Mahsulot qo'shing</td></tr>
                ) : cart.map(x => (
                  <tr key={x.id}>
                    <td>{x.name}<div className="text-xs text-gray-400">ombor: {x.stock}</div></td>
                    <td><input type="number" min="1" value={x.qty} onChange={e => setCart(c => c.map(y => y.id === x.id ? { ...y, qty: e.target.value } : y))} onFocus={e => e.target.select()} className="input py-1 px-2 w-24" /></td>
                    <td><button onClick={() => setCart(c => c.filter(y => y.id !== x.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Izoh (ixtiyoriy)" className="input" />
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Bekor</button>
            <button onClick={submit} disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Yuborilmoqda...' : 'Kirimni yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Kirim tafsiloti" wide>
        {!detail ? <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p> : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={STATUS[detail.intake.status]?.cls}>{STATUS[detail.intake.status]?.label}</span>
              <span className="text-sm text-gray-500">Kirituvchi: {detail.intake.created_by_name}</span>
              {detail.intake.approved_by_name && <span className="text-sm text-gray-500">· Tasdiqladi: {detail.intake.approved_by_name}</span>}
            </div>
            {detail.intake.notes && <p className="text-sm text-gray-600">Izoh: {detail.intake.notes}</p>}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="table text-sm">
                <thead><tr><th>Mahsulot</th><th>Kirim miqdori</th><th>Hozirgi ombor</th></tr></thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id}>
                      <td>{it.product_name}</td>
                      <td className="font-semibold text-green-600">+{fmt(it.quantity)} {it.unit}</td>
                      <td>{fmt(it.stock_quantity)} {it.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canApprove && detail.intake.status === 'PENDING' && (
              <div className="flex gap-3">
                <button onClick={() => rejectMutation.mutate(detail.intake.id)} className="btn-danger flex-1"><Ban size={14} /> Rad etish</button>
                <button onClick={() => approveMutation.mutate(detail.intake.id)} className="btn-success flex-1"><Check size={14} /> Tasdiqlash (omborga qo'shish)</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
