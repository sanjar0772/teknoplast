import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Package, DollarSign } from 'lucide-react';
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
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { isOwner, isProductionHead, isAccountant } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: 0, operation: 'add' });
  const [pricingModal, setPricingModal] = useState(null);
  const [pricingForm, setPricingForm] = useState({ stanokchi_rate: 0, detalchi_rate: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  const { data: rawMats } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editProduct ? productsAPI.update(editProduct.id, d) : productsAPI.create(d),
    onSuccess: () => {
      toast.success(editProduct ? 'Yangilandi' : 'Mahsulot qo\'shildi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setShowModal(false); setEditProduct(null);
    },
  });

  const stockMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.updateStock(id, data),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setStockModal(null);
    },
  });

  const pricingMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.setPricing(id, data),
    onSuccess: () => {
      toast.success('Narxlar saqlandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setPricingModal(null);
    },
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (p) => {
    setEditProduct(p);
    Object.entries(p).forEach(([k, v]) => setValue(k, v));
    setShowModal(true);
  };

  const openPricing = (p) => {
    setPricingModal(p);
    setPricingForm({
      stanokchi_rate: p.stanokchi_rate || 0,
      detalchi_rate: p.detalchi_rate || 0,
    });
  };

  const canWrite = isOwner() || isProductionHead();
  const canPrice = isOwner() || isAccountant() || isProductionHead();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mahsulotlar</h1>
        {canWrite && (
          <button onClick={() => { reset(); setEditProduct(null); setShowModal(true); }} className="btn-primary btn-sm">
            <Plus size={14} /> Mahsulot qo'shish
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-gray-400">Yuklanmoqda...</div>
        ) : !data?.products?.length ? (
          <div className="col-span-3 text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-2 opacity-30" />
            <p>Mahsulot yo'q</p>
          </div>
        ) : data.products.map(p => (
          <div key={p.id} className={`card ${!p.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="text-xs text-gray-500">{p.type} · {p.unit}</p>
              </div>
              <span className={p.is_active ? 'badge-green' : 'badge-gray'}>
                {p.is_active ? 'Faol' : 'Nofaol'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Narxi:</span>
                <span className="font-semibold">{fmt(p.price)} so'm</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Omborda:</span>
                <span className={`font-bold ${p.stock_quantity < 10 ? 'text-red-600' : 'text-green-700'}`}>
                  {p.stock_quantity} {p.unit}
                </span>
              </div>
              {(p.stanokchi_rate > 0 || p.detalchi_rate > 0) && (
                <div className="border-t pt-2 mt-2 space-y-1">
                  {p.stanokchi_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-600">Stanokchi tarif:</span>
                      <span className="font-semibold text-blue-700">{fmt(p.stanokchi_rate)} so'm/dona</span>
                    </div>
                  )}
                  {p.detalchi_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-600">Detalchi tarif:</span>
                      <span className="font-semibold text-orange-700">{fmt(p.detalchi_rate)} so'm/dona</span>
                    </div>
                  )}
                </div>
              )}
              {p.raw_material_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Xom ashyo:</span>
                  <span className="text-gray-700">{p.raw_material_name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              {canWrite && (
                <button onClick={() => openEdit(p)} className="btn-secondary btn-sm flex-1">Tahrirlash</button>
              )}
              {canWrite && (
                <button onClick={() => setStockModal(p)} className="btn-primary btn-sm flex-1">Ombor</button>
              )}
              {canPrice && (
                <button onClick={() => openPricing(p)}
                  className="btn-sm flex-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                  <DollarSign size={13} /> Narh
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Product Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditProduct(null); }}
        title={editProduct ? 'Mahsulotni tahrirlash' : 'Yangi Mahsulot'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...register('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Turi *</label>
              <input {...register('type', { required: true })} className="input" placeholder="masalan: Plastik idish" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <input {...register('unit')} defaultValue="dona" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm) *</label>
              <input {...register('price', { required: true })} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Boshlang'ich ombor</label>
              <input {...register('stock_quantity')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Xom ashyo</label>
            <select {...register('raw_material_id')} className="select">
              <option value="">Tanlang (ixtiyoriy)</option>
              {rawMats?.raw_materials?.map(rm => (
                <option key={rm.id} value={rm.id}>{rm.name} ({rm.stock_balance} {rm.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tavsif</label>
            <input {...register('description')} className="input" />
          </div>
          {editProduct && (
            <div className="flex items-center gap-2">
              <input {...register('is_active')} type="checkbox" id="pactive" className="w-4 h-4" />
              <label htmlFor="pactive" className="text-sm">Faol</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* Stock Modal */}
      {stockModal && (
        <Modal open={!!stockModal} onClose={() => setStockModal(null)} title={`Ombor — ${stockModal.name}`}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              Joriy ombor: <strong>{stockModal.stock_quantity} {stockModal.unit}</strong>
            </div>
            <div>
              <label className="label">Operatsiya</label>
              <select value={stockForm.operation} onChange={e => setStockForm(f => ({ ...f, operation: e.target.value }))} className="select">
                <option value="add">Qo'shish (+)</option>
                <option value="subtract">Ayirish (-)</option>
                <option value="set">Belgilash (=)</option>
              </select>
            </div>
            <div>
              <label className="label">Miqdor *</label>
              <input type="number" min="0" value={stockForm.quantity}
                onChange={e => setStockForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                className="input" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStockModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button
                onClick={() => stockMutation.mutate({ id: stockModal.id, ...stockForm })}
                disabled={stockMutation.isPending}
                className="btn-primary flex-1"
              >
                {stockMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pricing Modal — Bugalter/OWNER uchun */}
      {pricingModal && (
        <Modal open={!!pricingModal} onClose={() => setPricingModal(null)} title={`Ishlab chiqarish narhlari — ${pricingModal.name}`}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Bu narxlar stanokchi va detalchilar uchun 1 dona tayyorlash haqi.
              Bo'sh qoldirilsa xodimning shaxsiy tarifi ishlatiladi.
            </p>
            <div className="bg-blue-50 rounded-lg p-3 space-y-2 text-sm">
              {pricingModal.stanokchi_rate > 0 && (
                <div>Joriy stanokchi: <strong>{fmt(pricingModal.stanokchi_rate)} so'm/dona</strong></div>
              )}
              {pricingModal.detalchi_rate > 0 && (
                <div>Joriy detalchi: <strong>{fmt(pricingModal.detalchi_rate)} so'm/dona</strong></div>
              )}
              {!pricingModal.stanokchi_rate && !pricingModal.detalchi_rate && (
                <div className="text-gray-400">Narxlar belgilanmagan</div>
              )}
            </div>
            <div>
              <label className="label">Stanokchi tarifi (1 dona, so'm)</label>
              <input
                type="number" min="0"
                value={pricingForm.stanokchi_rate}
                onChange={e => setPricingForm(f => ({ ...f, stanokchi_rate: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Masalan: 150"
              />
            </div>
            <div>
              <label className="label">Detalchi tarifi (1 dona, so'm)</label>
              <input
                type="number" min="0"
                value={pricingForm.detalchi_rate}
                onChange={e => setPricingForm(f => ({ ...f, detalchi_rate: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Masalan: 200"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPricingModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button
                onClick={() => pricingMutation.mutate({ id: pricingModal.id, ...pricingForm })}
                disabled={pricingMutation.isPending}
                className="btn-primary flex-1"
              >
                {pricingMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
