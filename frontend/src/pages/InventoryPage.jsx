import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, AlertTriangle, Warehouse } from 'lucide-react';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { isOwner, isProductionHead } = useAuthStore();
  const qc = useQueryClient();
  const [showRmModal, setShowRmModal] = useState(false);
  const [rmStockModal, setRmStockModal] = useState(null);
  const [rmStockForm, setRmStockForm] = useState({ quantity: 0, operation: 'add' });

  const { data: products } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  const { data: rawMats } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
  });

  const createRmMutation = useMutation({
    mutationFn: (d) => productsAPI.createRawMaterial(d),
    onSuccess: () => {
      toast.success('Xom ashyo qo\'shildi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setShowRmModal(false);
      resetRm();
    },
  });

  const rmStockMutation = useMutation({
    mutationFn: ({ id, ...d }) => productsAPI.updateRawMaterialStock(id, d),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setRmStockModal(null);
    },
  });

  const { register: registerRm, handleSubmit: handleSubmitRm, reset: resetRm } = useForm();

  const lowProducts = (products?.products || []).filter(p => p.stock_quantity < 10);
  const lowRm = (rawMats?.raw_materials || []).filter(rm => rm.stock_balance <= rm.min_stock_level);
  const canWrite = isOwner() || isProductionHead();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Ombor</h1>
        {canWrite && (
          <button onClick={() => { resetRm(); setShowRmModal(true); }} className="btn-primary btn-sm">
            <Plus size={14} /> Xom ashyo qo'shish
          </button>
        )}
      </div>

      {/* Alerts */}
      {(lowProducts.length > 0 || lowRm.length > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-orange-500" />
            <h3 className="font-semibold text-orange-800">Kam ombor ogohlantirishlari</h3>
          </div>
          <ul className="text-sm text-orange-700 space-y-1">
            {lowProducts.map(p => (
              <li key={p.id}>• {p.name}: {p.stock_quantity} {p.unit} qoldi</li>
            ))}
            {lowRm.map(rm => (
              <li key={rm.id}>• {rm.name} (xom ashyo): {rm.stock_balance} {rm.unit} qoldi</li>
            ))}
          </ul>
        </div>
      )}

      {/* Products inventory */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Tayyor Mahsulotlar Ombori</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Mahsulot</th><th>Turi</th><th>Omborda</th><th>Narxi</th><th>Qiymati</th><th>Holat</th></tr>
            </thead>
            <tbody>
              {!(products?.products || []).length ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">
                  <Warehouse size={32} className="mx-auto mb-2 opacity-30" /><br />Mahsulot yo'q
                </td></tr>
              ) : (products?.products || []).map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.type}</td>
                  <td className={`font-bold ${p.stock_quantity < 10 ? 'text-red-600' : 'text-green-700'}`}>
                    {p.stock_quantity} {p.unit}
                  </td>
                  <td>{fmt(p.price)} so'm</td>
                  <td className="font-semibold">{fmt(p.stock_quantity * p.price)} so'm</td>
                  <td>
                    {p.stock_quantity === 0
                      ? <span className="badge-red">Tugagan</span>
                      : p.stock_quantity < 10
                        ? <span className="badge-yellow">Kam</span>
                        : <span className="badge-green">Yetarli</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw materials */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Xom Ashyolar</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Nomi</th><th>Birlik</th><th>Omborda</th><th>Narxi</th><th>Ta'minotchi</th><th>Holat</th>{canWrite && <th>Amal</th>}</tr>
            </thead>
            <tbody>
              {!(rawMats?.raw_materials || []).length ? (
                <tr><td colSpan={7} className="text-center py-6 text-gray-400">Xom ashyo yo'q</td></tr>
              ) : (rawMats?.raw_materials || []).map(rm => (
                <tr key={rm.id}>
                  <td className="font-medium">{rm.name}</td>
                  <td>{rm.unit}</td>
                  <td className={`font-bold ${rm.stock_balance <= rm.min_stock_level ? 'text-red-600' : 'text-green-700'}`}>
                    {rm.stock_balance}
                  </td>
                  <td>{fmt(rm.price_per_unit)} so'm/{rm.unit}</td>
                  <td>{rm.supplier_name || '—'}</td>
                  <td>
                    {rm.stock_balance <= 0
                      ? <span className="badge-red">Tugagan</span>
                      : rm.stock_balance <= rm.min_stock_level
                        ? <span className="badge-yellow">Kam</span>
                        : <span className="badge-green">Yetarli</span>
                    }
                  </td>
                  {canWrite && (
                    <td>
                      <button onClick={() => { setRmStockModal(rm); setRmStockForm({ quantity: 0, operation: 'add' }); }}
                        className="btn-secondary btn-sm">Ombor</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add raw material */}
      <Modal open={showRmModal} onClose={() => setShowRmModal(false)} title="Yangi Xom Ashyo">
        <form onSubmit={handleSubmitRm(d => createRmMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...registerRm('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Miqdor *</label>
              <input {...registerRm('quantity', { required: true })} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <select {...registerRm('unit')} className="select">
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="litr">litr</option>
                <option value="dona">dona</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm/birlik)</label>
              <input {...registerRm('price_per_unit')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Min. ombor</label>
              <input {...registerRm('min_stock_level')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Ta'minotchi</label>
            <input {...registerRm('supplier_name')} className="input" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowRmModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createRmMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* RM Stock Modal */}
      {rmStockModal && (
        <Modal open={!!rmStockModal} onClose={() => setRmStockModal(null)} title={`Ombor — ${rmStockModal.name}`}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              Joriy: <strong>{rmStockModal.stock_balance} {rmStockModal.unit}</strong>
            </div>
            <div>
              <label className="label">Operatsiya</label>
              <select value={rmStockForm.operation} onChange={e => setRmStockForm(f => ({ ...f, operation: e.target.value }))} className="select">
                <option value="add">Kirim (+)</option>
                <option value="subtract">Chiqim (-)</option>
                <option value="set">Belgilash (=)</option>
              </select>
            </div>
            <div>
              <label className="label">Miqdor ({rmStockModal.unit})</label>
              <input type="number" min="0" value={rmStockForm.quantity}
                onChange={e => setRmStockForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                className="input" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRmStockModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={() => rmStockMutation.mutate({ id: rmStockModal.id, ...rmStockForm })}
                disabled={rmStockMutation.isPending} className="btn-primary flex-1">Saqlash</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
