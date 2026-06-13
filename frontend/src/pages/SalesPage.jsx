import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Download, Search, X, CheckCircle, Clock, AlertCircle, FileText } from 'lucide-react';
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
                      onClick={() => navigate(`/invoice/${sale.id}`)}
                      className="btn-secondary btn-sm"
                      title="Schyot-faktura ko'rish"
                    >
                      <FileText size={12} /> Chek
                    </button>
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
    </div>
  );
}
