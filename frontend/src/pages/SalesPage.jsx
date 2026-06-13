import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Download, Search, X, CheckCircle, Clock, AlertCircle, FileText, Printer, Pencil } from 'lucide-react';
import { salesAPI, productsAPI, reportsAPI, customersAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

const STATUS_MAP = {
  PAID: { label: "To'langan", cls: 'badge-green' },
  PENDING: { label: 'Kutilmoqda', cls: 'badge-yellow' },
  PARTIALLY_PAID: { label: 'Qisman', cls: 'badge-blue' },
};

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SalesPage() {
  const { isSalesHead, isAccountant, isOwner } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [showModal, setShowModal] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [chekSaleId, setChekSaleId] = useState(null);
  const [editForm, setEditForm] = useState(null); // tahrirlanayotgan savdo

  const { data: chekData, isLoading: chekLoading } = useQuery({
    queryKey: ['invoice', chekSaleId],
    queryFn: () => salesAPI.getById(chekSaleId).then(r => r.data),
    enabled: !!chekSaleId,
    retry: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sales', filter, month],
    queryFn: () => salesAPI.getAll({
      ...filter,
      start_date: `${month}-01`,
      end_date: new Date(new Date(`${month}-01`).getFullYear(), new Date(`${month}-01`).getMonth() + 1, 0).toISOString().slice(0, 10),
      limit: 200,
    }).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['sales-summary', month],
    queryFn: () => salesAPI.getSummary({ month }).then(r => r.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => salesAPI.create(data),
    onSuccess: () => {
      toast.success('Sotuv qo\'shildi');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setShowModal(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => salesAPI.updateStatus(id, { status }),
    onSuccess: () => {
      toast.success('Status yangilandi');
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => salesAPI.update(id, data),
    onSuccess: () => {
      toast.success('Savdo yangilandi');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditForm(null);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Saqlashda xato');
    },
  });

  const openEdit = (sale) => {
    setEditForm({
      id: sale.id,
      product_id: sale.product_id || '',
      customer_id: sale.customer_id || '',
      quantity: sale.quantity,
      unit_price: parseFloat(sale.unit_price),
      sale_date: sale.sale_date ? String(sale.sale_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: sale.status,
    });
  };

  const submitEdit = () => {
    if (!editForm.product_id) return toast.error('Mahsulotni tanlang');
    if (!editForm.quantity || editForm.quantity < 1) return toast.error('Miqdor noto\'g\'ri');
    updateMutation.mutate({
      id: editForm.id,
      data: {
        product_id: editForm.product_id,
        customer_id: editForm.customer_id || null,
        quantity: parseInt(editForm.quantity),
        unit_price: parseFloat(editForm.unit_price),
        sale_date: editForm.sale_date,
        status: editForm.status,
      },
    });
  };

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const qty = watch('quantity', 0);
  const price = watch('unit_price', 0);

  const onSubmit = (data) => {
    createMutation.mutate({
      ...data,
      quantity: parseInt(data.quantity),
      unit_price: parseFloat(data.unit_price),
    });
  };

  const downloadExcel = async () => {
    try {
      const res = await reportsAPI.downloadSalesExcel(month);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `sotuv-${month}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Yuklab bo\'lmadi'); }
  };

  const canCreate = isOwner() || isSalesHead() || isAccountant();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Sotuv</h1>
        <div className="flex gap-2">
          <button onClick={downloadExcel} className="btn-secondary btn-sm">
            <Download size={14} /> Excel
          </button>
          {canCreate && (
            <button onClick={() => { reset(); setShowModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Sotuv qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Jami sotuv', value: fmt(summary.summary?.total_revenue), color: 'text-blue-600' },
            { label: "To'langan", value: fmt(summary.summary?.paid_amount), color: 'text-green-600' },
            { label: 'Kutilmoqda', value: fmt(summary.summary?.pending_amount), color: 'text-yellow-600' },
            { label: 'Savdolar soni', value: summary.summary?.total_count || 0, color: 'text-gray-900' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card-sm">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="input w-40" />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Mijoz izlash..." value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value, customer: e.target.value }))}
              className="input pl-8 w-48" />
          </div>
          <select value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="select w-40">
            <option value="">Barcha status</option>
            <option value="PAID">To'langan</option>
            <option value="PENDING">Kutilmoqda</option>
            <option value="PARTIALLY_PAID">Qisman</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Sana</th><th>Mahsulot</th><th>Miqdor</th>
              <th>Narx</th><th>Jami</th><th>Mijoz</th><th>Status</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.sales?.length ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Sotuv topilmadi</td></tr>
            ) : data.sales.map(sale => (
              <tr key={sale.id}>
                <td className="whitespace-nowrap">{new Date(sale.sale_date).toLocaleDateString('uz-UZ')}</td>
                <td className="font-medium">{sale.product_name}</td>
                <td>{sale.quantity} {sale.unit}</td>
                <td>{fmt(sale.unit_price)} so'm</td>
                <td className="font-semibold text-blue-700">{fmt(sale.total_amount)} so'm</td>
                <td>{sale.customer_name || <span className="text-gray-400">—</span>}</td>
                <td><span className={STATUS_MAP[sale.status]?.cls || 'badge-gray'}>
                  {STATUS_MAP[sale.status]?.label}
                </span></td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChekSaleId(sale.id)}
                      className="btn-secondary btn-sm"
                      title="Chekni ko'rish"
                    >
                      <FileText size={12} /> Chek
                    </button>
                    {canCreate && (
                      <button
                        onClick={() => openEdit(sale)}
                        className="btn-secondary btn-sm"
                        title="Tahrirlash"
                      >
                        <Pencil size={12} /> Tahrir
                      </button>
                    )}
                    {sale.status !== 'PAID' && canCreate && (
                      <button
                        onClick={() => statusMutation.mutate({ id: sale.id, status: 'PAID' })}
                        className="btn-success btn-sm"
                      >
                        <CheckCircle size={12} /> To'landi
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi Sotuv">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Mahsulot *</label>
            <select {...register('product_id', { required: true })} className="select">
              <option value="">Tanlang...</option>
              {products?.products?.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Ombor: {p.stock_quantity})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Miqdor *</label>
              <input {...register('quantity', { required: true, min: 1 })} type="number" min="1" className="input" />
            </div>
            <div>
              <label className="label">Birlik narxi *</label>
              <input {...register('unit_price', { required: true, min: 0 })} type="number" min="0" className="input" />
            </div>
          </div>
          {qty > 0 && price > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 font-semibold">
              Jami: {fmt(qty * price)} so'm
            </div>
          )}
          <div>
            <label className="label">Mijoz (bazadan)</label>
            <select {...register('customer_id')} className="select">
              <option value="">— Tanlanmagan (yangi/tasodifiy) —</option>
              {customers?.customers?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Mijoz tanlansa, ism avtomatik to'ladi. Yangi mijozni "Mijozlar" bo'limidan qo'shing.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mijoz ismi (qo'lda)</label>
              <input {...register('customer_name')} className="input" placeholder="Ixtiyoriy" />
            </div>
            <div>
              <label className="label">Sana</label>
              <input {...register('sale_date')} type="date" className="input"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select {...register('status')} className="select">
              <option value="PENDING">Kutilmoqda</option>
              <option value="PAID">To'langan</option>
              <option value="PARTIALLY_PAID">Qisman to'langan</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tahrirlash modal */}
      <Modal open={!!editForm} onClose={() => setEditForm(null)} title="Savdoni tahrirlash">
        {editForm && (
          <div className="space-y-4">
            <div>
              <label className="label">Mahsulot *</label>
              <select
                value={editForm.product_id}
                onChange={e => setEditForm(f => ({ ...f, product_id: e.target.value }))}
                className="select"
              >
                <option value="">Tanlang...</option>
                {products?.products?.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Ombor: {p.stock_quantity})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Miqdor *</label>
                <input
                  type="number" min="1" value={editForm.quantity}
                  onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Birlik narxi *</label>
                <input
                  type="number" min="0" value={editForm.unit_price}
                  onChange={e => setEditForm(f => ({ ...f, unit_price: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            {editForm.quantity > 0 && editForm.unit_price > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 font-semibold">
                Jami: {fmt(parseFloat(editForm.quantity) * parseFloat(editForm.unit_price))} so'm
              </div>
            )}
            <div>
              <label className="label">Mijoz</label>
              <select
                value={editForm.customer_id}
                onChange={e => setEditForm(f => ({ ...f, customer_id: e.target.value }))}
                className="select"
              >
                <option value="">— Tanlanmagan —</option>
                {customers?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sana</label>
                <input
                  type="date" value={editForm.sale_date}
                  onChange={e => setEditForm(f => ({ ...f, sale_date: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="select"
                >
                  <option value="PENDING">Kutilmoqda</option>
                  <option value="PAID">To'langan</option>
                  <option value="PARTIALLY_PAID">Qisman to'langan</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditForm(null)} className="btn-secondary flex-1">Bekor</button>
              <button type="button" onClick={submitEdit} disabled={updateMutation.isPending} className="btn-primary flex-1">
                {updateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Chek modal */}
      {chekSaleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChekSaleId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <button onClick={() => setChekSaleId(null)}
              className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow">
              <X size={18} />
            </button>

            {chekLoading ? (
              <div className="py-16 text-center text-gray-400">Yuklanmoqda...</div>
            ) : !chekData?.sale ? (
              <div className="py-16 text-center text-gray-400">Chek topilmadi</div>
            ) : (() => {
              const { sale, items } = chekData;
              const rows = items?.length ? items : [sale];
              const total = rows.reduce((s, it) => s + parseFloat(it.total_amount || 0), 0);
              const invoiceUrl = `${window.location.origin}/invoice/${sale.order_ref || sale.id}`;
              return (
                <>
                  <div id="chek-print" className="px-5 py-5 font-mono text-[13px] leading-tight text-gray-900">
                    <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                      <div className="text-lg font-bold tracking-wide">TEKNOPLAST</div>
                      <div className="text-[11px] text-gray-500">Plastik mahsulotlar zavodi</div>
                    </div>
                    <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                      <div className="flex justify-between"><span>Chek:</span><span className="font-bold">{sale.order_ref || sale.id?.slice(0,8)}</span></div>
                      <div className="flex justify-between"><span>Sana:</span><span>{new Date(sale.sale_date).toLocaleDateString('uz-UZ')}</span></div>
                      <div className="flex justify-between"><span>Mijoz:</span><span>{sale.customer_full_name || sale.customer_name || 'Tasodifiy'}</span></div>
                      {sale.customer_full_phone && <div className="flex justify-between"><span>Tel:</span><span>{sale.customer_full_phone}</span></div>}
                    </div>
                    <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                      {rows.map((it, i) => (
                        <div key={i} className="mb-1">
                          <div className="font-medium truncate">{it.product_name}</div>
                          <div className="flex justify-between text-gray-600">
                            <span>{it.quantity} x {fmt(it.unit_price)}</span>
                            <span className="font-bold text-gray-900">{fmt(it.total_amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between font-bold text-[15px] border-b border-dashed border-gray-300 pb-2 mb-3">
                      <span>JAMI:</span><span>{fmt(total)} so'm</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <QRCodeSVG value={invoiceUrl} size={110} />
                      <div className="text-[10px] text-gray-500 mt-1">Xaridingiz uchun rahmat!</div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-4 pb-4">
                    <button onClick={() => window.print()} className="btn-secondary flex-1 text-sm">
                      <Printer size={13} /> Chop etish
                    </button>
                    <button onClick={() => navigate(`/invoice/${sale.order_ref || sale.id}`)} className="btn-primary flex-1 text-sm">
                      <FileText size={13} /> Schyot-faktura
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
