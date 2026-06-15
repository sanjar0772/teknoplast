import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  Plus, Search, X, Phone, Building2, MapPin, Eye,
  Trash2, Users, Crown, Store, ShoppingBag, AlertTriangle, Pencil
} from 'lucide-react';
import { customersAPI, salesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

const TYPE_MAP = {
  RETAIL:    { label: 'Chakana',  cls: 'badge-gray',  icon: ShoppingBag },
  WHOLESALE: { label: 'Ulgurji',  cls: 'badge-blue',  icon: Store },
  VIP:       { label: 'VIP',      cls: 'badge-yellow', icon: Crown },
};

const STATUS_MAP = {
  PAID: { label: "To'langan", cls: 'badge-green' },
  PENDING: { label: 'Kutilmoqda', cls: 'badge-yellow' },
  PARTIALLY_PAID: { label: 'Qisman', cls: 'badge-blue' },
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

export default function CustomersPage() {
  const { isOwner } = useAuthStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ search: '', type: '' });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', filter],
    queryFn: () => customersAPI.getAll(filter).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['customers-summary'],
    queryFn: () => customersAPI.getSummary().then(r => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['customer', detailId],
    queryFn: () => customersAPI.getById(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
    enabled: !!detailId,
  });

  // Mijoz xaridini qo'shish/tahrirlash formasi (null = yopiq, {id} bo'lsa = tahrir)
  const [saleForm, setSaleForm] = useState(null);

  const invalidateSaleData = () => {
    qc.invalidateQueries({ queryKey: ['customer', detailId] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customers-summary'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const saveSaleMutation = useMutation({
    mutationFn: (d) => d.id ? salesAPI.update(d.id, d) : salesAPI.create(d),
    onSuccess: () => {
      toast.success('Xarid saqlandi');
      invalidateSaleData();
      setSaleForm(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Saqlashda xato'),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: (id) => salesAPI.delete(id),
    onSuccess: () => { toast.success('Xarid o\'chirildi'); invalidateSaleData(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'O\'chirishda xato'),
  });

  const openAddSale = () => setSaleForm({
    product_id: '', quantity: 1, unit_price: '', rang: '',
    sale_date: new Date().toISOString().slice(0, 10), status: 'PAID',
  });
  const openEditSale = (s) => setSaleForm({
    id: s.id, product_id: s.product_id || '', quantity: s.quantity,
    unit_price: parseFloat(s.unit_price), rang: s.rang || '',
    sale_date: s.sale_date ? String(s.sale_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: s.status,
  });
  // Tanlangan mahsulotning rang bo'yicha ombori
  const saleProductColors = (productsData?.products?.find(p => p.id === saleForm?.product_id)?.color_stock) || [];
  const submitSale = () => {
    if (!saleForm.product_id) return toast.error('Mahsulotni tanlang');
    if (saleProductColors.length && !saleForm.rang) return toast.error('Rangni tanlang');
    if (!saleForm.quantity || saleForm.quantity < 1) return toast.error('Miqdor noto\'g\'ri');
    const total = (parseFloat(saleForm.quantity) || 0) * (parseFloat(saleForm.unit_price) || 0);
    saveSaleMutation.mutate({
      id: saleForm.id,
      customer_id: detailId,
      product_id: saleForm.product_id,
      quantity: parseInt(saleForm.quantity),
      unit_price: parseFloat(saleForm.unit_price),
      rang: saleForm.rang || null,
      sale_date: saleForm.sale_date,
      status: saleForm.status,
      payment_amount: saleForm.status === 'PAID' ? total : 0,
    });
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? customersAPI.update(editing.id, d) : customersAPI.create(d),
    onSuccess: () => {
      toast.success(editing ? 'Mijoz yangilandi' : 'Mijoz qo\'shildi');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-summary'] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => customersAPI.delete(id),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-summary'] });
    },
  });

  const openCreate = () => { setEditing(null); reset({ customer_type: 'RETAIL' }); setShowForm(true); };
  const openEdit = (c) => { setEditing(c); reset(c); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const onSubmit = (d) => saveMutation.mutate({ ...d, credit_limit: parseFloat(d.credit_limit || 0) });

  const cards = summary?.summary ? [
    { label: 'Jami mijoz', value: summary.summary.total_customers, color: 'text-gray-900', Icon: Users },
    { label: 'VIP', value: summary.summary.vip_count, color: 'text-yellow-600', Icon: Crown },
    { label: 'Ulgurji', value: summary.summary.wholesale_count, color: 'text-blue-600', Icon: Store },
    { label: 'Umumiy qarz', value: fmt(summary.summary.total_debt) + " so'm", color: 'text-red-600', Icon: AlertTriangle },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mijozlar</h1>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus size={14} /> Mijoz qo'shish
        </button>
      </div>

      {/* Summary cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map(({ label, value, color, Icon }) => (
            <div key={label} className="card-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Ism, telefon yoki firma..." value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
              className="input pl-8 w-64" />
          </div>
          <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
            className="select w-40">
            <option value="">Barcha turlar</option>
            <option value="RETAIL">Chakana</option>
            <option value="WHOLESALE">Ulgurji</option>
            <option value="VIP">VIP</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Mijoz</th><th>Telefon</th><th>Tur</th>
              <th>Xaridlar</th><th>Jami summa</th><th>Qarz</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.customers?.length ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Mijoz topilmadi</td></tr>
            ) : data.customers.map(c => {
              const T = TYPE_MAP[c.customer_type] || TYPE_MAP.RETAIL;
              return (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.company_name && <div className="text-xs text-gray-400">{c.company_name}</div>}
                  </td>
                  <td className="whitespace-nowrap">{c.phone || <span className="text-gray-400">—</span>}</td>
                  <td><span className={T.cls}>{T.label}</span></td>
                  <td>{c.purchase_count} marta</td>
                  <td className="font-semibold text-blue-700">{fmt(c.total_purchases)} so'm</td>
                  <td className={parseFloat(c.total_debt) > 0 ? 'font-semibold text-red-600' : 'text-gray-400'}>
                    {parseFloat(c.total_debt) > 0 ? fmt(c.total_debt) + " so'm" : '—'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setDetailId(c.id)} className="btn-secondary btn-sm" title="Ko'rish">
                        <Eye size={12} />
                      </button>
                      <button onClick={() => openEdit(c)} className="btn-secondary btn-sm">Tahrir</button>
                      {isOwner() && (
                        <button onClick={() => { if (confirm(`${c.name} o'chirilsinmi?`)) deleteMutation.mutate(c.id); }}
                          className="btn-danger btn-sm" title="O'chirish">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={closeForm} title={editing ? 'Mijozni tahrirlash' : 'Yangi mijoz'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Ism *</label>
            <input {...register('name', { required: true })} className="input" placeholder="Mijoz ismi" />
            {errors.name && <p className="text-xs text-red-500 mt-1">Ism kerak</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Telefon</label>
              <input {...register('phone')} className="input" placeholder="+998..." />
            </div>
            <div>
              <label className="label">Tur</label>
              <select {...register('customer_type')} className="select">
                <option value="RETAIL">Chakana</option>
                <option value="WHOLESALE">Ulgurji</option>
                <option value="VIP">VIP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Firma nomi</label>
            <input {...register('company_name')} className="input" placeholder="Ixtiyoriy" />
          </div>
          <div>
            <label className="label">Manzil</label>
            <input {...register('address')} className="input" placeholder="Ixtiyoriy" />
          </div>
          <div>
            <label className="label">Kredit limiti (so'm)</label>
            <input {...register('credit_limit')} type="number" min="0" className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Izoh</label>
            <textarea {...register('notes')} className="input" rows={2} placeholder="Ixtiyoriy" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeForm} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">
              {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailId} onClose={() => { setDetailId(null); setSaleForm(null); }} title="Mijoz tafsiloti" wide>
        {!detail ? (
          <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p>
        ) : (
          <div className="space-y-5">
            {/* Profile */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-bold text-xl">{detail.customer.name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 text-lg">{detail.customer.name}</h4>
                  <span className={TYPE_MAP[detail.customer.customer_type]?.cls}>
                    {TYPE_MAP[detail.customer.customer_type]?.label}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                  {detail.customer.phone && <div className="flex items-center gap-2"><Phone size={13} /> {detail.customer.phone}</div>}
                  {detail.customer.company_name && <div className="flex items-center gap-2"><Building2 size={13} /> {detail.customer.company_name}</div>}
                  {detail.customer.address && <div className="flex items-center gap-2"><MapPin size={13} /> {detail.customer.address}</div>}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500">Xaridlar</p>
                <p className="text-lg font-bold text-gray-900">{detail.stats.purchase_count}</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500">Jami summa</p>
                <p className="text-lg font-bold text-blue-700">{fmt(detail.stats.total_purchases)}</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500">Qarz</p>
                <p className={`text-lg font-bold ${parseFloat(detail.stats.total_debt) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(detail.stats.total_debt)}
                </p>
              </div>
            </div>

            {/* Purchase history */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-gray-700 text-sm">Xaridlar tarixi</h5>
                <button onClick={openAddSale} className="btn-primary btn-sm">
                  <Plus size={13} /> Yangi xarid
                </button>
              </div>

              {/* Qo'shish/Tahrirlash formasi */}
              {saleForm && (
                <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-3 mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-800">
                      {saleForm.id ? 'Xaridni tahrirlash' : 'Yangi xarid qo\'shish'}
                    </span>
                    <button onClick={() => setSaleForm(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                  <div>
                    <label className="label text-xs">Mahsulot *</label>
                    <select
                      value={saleForm.product_id}
                      onChange={e => {
                        const p = productsData?.products?.find(x => x.id === e.target.value);
                        setSaleForm(f => ({ ...f, product_id: e.target.value, unit_price: f.unit_price || (p ? parseFloat(p.price) : '') }));
                      }}
                      className="select text-sm"
                    >
                      <option value="">Tanlang...</option>
                      {productsData?.products?.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Ombor: {p.stock_quantity})</option>
                      ))}
                    </select>
                  </div>
                  {saleProductColors.length > 0 && (
                    <div>
                      <label className="label text-xs">Rang *</label>
                      <select
                        value={saleForm.rang || ''}
                        onChange={e => setSaleForm(f => ({ ...f, rang: e.target.value }))}
                        className="select text-sm"
                      >
                        <option value="">— Rang tanlang —</option>
                        {saleProductColors.map(c => (
                          <option key={c.rang || 'none'} value={c.rang}>{(c.rang && c.rang.trim()) ? c.rang : 'Rangsiz'} ({c.quantity})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Miqdor *</label>
                      <input type="number" min="1" value={saleForm.quantity}
                        onChange={e => setSaleForm(f => ({ ...f, quantity: e.target.value }))}
                        className="input text-sm" />
                    </div>
                    <div>
                      <label className="label text-xs">Birlik narxi *</label>
                      <input type="number" min="0" value={saleForm.unit_price}
                        onChange={e => setSaleForm(f => ({ ...f, unit_price: e.target.value }))}
                        className="input text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Sana</label>
                      <input type="date" value={saleForm.sale_date}
                        onChange={e => setSaleForm(f => ({ ...f, sale_date: e.target.value }))}
                        className="input text-sm" />
                    </div>
                    <div>
                      <label className="label text-xs">Status</label>
                      <select value={saleForm.status}
                        onChange={e => setSaleForm(f => ({ ...f, status: e.target.value }))}
                        className="select text-sm">
                        <option value="PAID">To'langan</option>
                        <option value="PENDING">Kutilmoqda</option>
                        <option value="PARTIALLY_PAID">Qisman</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-blue-700 font-semibold">
                    Jami: {fmt((parseFloat(saleForm.quantity) || 0) * (parseFloat(saleForm.unit_price) || 0))} so'm
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSaleForm(null)} className="btn-secondary btn-sm flex-1">Bekor</button>
                    <button onClick={submitSale} disabled={saveSaleMutation.isPending} className="btn-primary btn-sm flex-1">
                      {saveSaleMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="table text-sm">
                  <thead>
                    <tr><th>Sana</th><th>Mahsulot</th><th>Miqdor</th><th>Summa</th><th>Status</th><th>Amal</th></tr>
                  </thead>
                  <tbody>
                    {!detail.sales.length ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">Hali xarid yo'q</td></tr>
                    ) : detail.sales.map(s => (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap">{new Date(s.sale_date).toLocaleDateString('uz-UZ')}</td>
                        <td>{s.product_name}</td>
                        <td>{s.quantity} {s.unit}</td>
                        <td className="font-medium">{fmt(s.total_amount)}</td>
                        <td><span className={STATUS_MAP[s.status]?.cls || 'badge-gray'}>{STATUS_MAP[s.status]?.label}</span></td>
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => openEditSale(s)} className="btn-secondary btn-sm" title="Tahrirlash">
                              <Pencil size={12} />
                            </button>
                            {isOwner() && (
                              <button
                                onClick={() => { if (confirm(`${s.product_name} — ${s.quantity} ${s.unit} xaridi o'chirilsinmi?`)) deleteSaleMutation.mutate(s.id); }}
                                disabled={deleteSaleMutation.isPending}
                                className="btn-danger btn-sm" title="O'chirish">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
