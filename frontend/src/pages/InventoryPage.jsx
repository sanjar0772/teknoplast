import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, AlertTriangle, Warehouse, Package, Boxes, PackagePlus, Pencil, Trash2, Factory } from 'lucide-react';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';

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
  const { user, isOwner, isTaminotchi, isKirimchi } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Ta'minotchi (Owner emas) — faqat Xom ashyo bo'limini ko'radi, Tayyor mahsulot ombori unga ko'rinmaydi
  const taminotchiOnly = user?.role === 'TAMINOTCHI';
  const [tab, setTab] = useState(taminotchiOnly ? 'raw' : 'products'); // 'products' | 'raw'
  const [showRmModal, setShowRmModal] = useState(false);
  const [editRmModal, setEditRmModal] = useState(null); // tahrirlash uchun
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
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit } = useForm();

  const updateRmMutation = useMutation({
    mutationFn: ({ id, ...d }) => productsAPI.updateRawMaterial(id, d),
    onSuccess: () => {
      toast.success('Xom ashyo yangilandi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setEditRmModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const deleteRmMutation = useMutation({
    mutationFn: (id) => productsAPI.deleteRawMaterial(id),
    onSuccess: () => {
      toast.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const openEdit = (rm) => {
    setEditRmModal(rm);
    resetEdit({
      name: rm.name,
      unit: rm.unit,
      price_per_unit: rm.price_per_unit,
      supplier_name: rm.supplier_name || '',
      min_stock_level: rm.min_stock_level,
      stock_balance: rm.stock_balance,
    });
  };

  // Ombor turi bo'yicha ajratish: KOMPONENT = ishlab chiqarish ombori, qolgani = tayyor ombor
  const allProducts = products?.products || [];
  const finishedProducts = allProducts.filter(p => p.kind !== 'KOMPONENT');
  const componentProducts = allProducts.filter(p => p.kind === 'KOMPONENT');
  const isProdTab = tab === 'production';
  const shownProducts = isProdTab ? componentProducts : finishedProducts;

  const lowProducts = finishedProducts.filter(p => p.stock_quantity < 10);
  const lowRm = (rawMats?.raw_materials || []).filter(rm => rm.stock_balance <= rm.min_stock_level);

  // Xom ashyo qo'shish/tahrirlash — faqat Ta'minotchi (va nazorat uchun Ega) qila oladi
  const canWriteRaw = isOwner() || isTaminotchi();
  // Tayyor mahsulot kirimini boshqarish — Kirimchi (va Ega) ning vazifasi, "Kirim" sahifasi orqali
  const canManageProducts = isOwner() || isKirimchi();

  // Mahsulotni omborlar o'rtasida ko'chirish (tayyor <-> ishlab chiqarish)
  const moveMutation = useMutation({
    mutationFn: ({ id, kind }) => productsAPI.updateBulk([{ id, kind }]),
    onSuccess: () => {
      toast.success('Ombor o\'zgartirildi');
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const TABS = [
    { key: 'products',   label: 'Tayyor mahsulotlar',     icon: Package },
    { key: 'production', label: 'Ishlab chiqarish ombori', icon: Factory },
    { key: 'raw',        label: 'Xom ashyo',              icon: Boxes },
  ].filter(t => !(taminotchiOnly && (t.key === 'products' || t.key === 'production')));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Ombor</h1>
        {tab === 'products' && canManageProducts && (
          <button onClick={() => navigate('/intake')} className="btn-primary btn-sm">
            <PackagePlus size={14} /> Mahsulot kirimi (Kirim sahifasi)
          </button>
        )}
        {tab === 'raw' && canWriteRaw && (
          <button onClick={() => { resetRm(); setShowRmModal(true); }} className="btn-primary btn-sm">
            <Plus size={14} /> Xom ashyo qo'shish
          </button>
        )}
      </div>

      {/* Tabs */}
      {TABS.length > 1 && (
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>
      )}

      {(tab === 'products' || tab === 'production') && !taminotchiOnly && (
        <>
          {/* Products alert — faqat tayyor ombor uchun */}
          {!isProdTab && lowProducts.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-orange-500" />
                <h3 className="font-semibold text-orange-800">Kam ombor ogohlantirishlari — Mahsulotlar</h3>
              </div>
              <ul className="text-sm text-orange-700 space-y-1">
                {lowProducts.map(p => (
                  <li key={p.id}>• {p.name}: {p.stock_quantity} {p.unit} qoldi</li>
                ))}
              </ul>
            </div>
          )}

          {/* Ombor jadvali */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {isProdTab ? 'Ishlab Chiqarish Ombori (detallar/komponentlar)' : 'Tayyor Mahsulotlar Ombori'}
            </h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mahsulot</th><th>Turi</th><th>Omborda</th><th>Narxi</th><th>Qiymati</th><th>Holat</th>
                    {canManageProducts && <th>Ombor</th>}
                  </tr>
                </thead>
                <tbody>
                  {!shownProducts.length ? (
                    <tr><td colSpan={canManageProducts ? 7 : 6} className="text-center py-8 text-gray-400">
                      <Warehouse size={32} className="mx-auto mb-2 opacity-30" /><br />
                      {isProdTab ? "Ishlab chiqarish omborida mahsulot yo'q" : "Mahsulot yo'q"}
                    </td></tr>
                  ) : shownProducts.map(p => (
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
                      {canManageProducts && (
                        <td>
                          <button
                            onClick={() => moveMutation.mutate({ id: p.id, kind: isProdTab ? 'TAYYOR' : 'KOMPONENT' })}
                            className="btn-secondary btn-sm whitespace-nowrap"
                            title={isProdTab ? 'Tayyor mahsulotlar omboriga ko\'chirish' : 'Ishlab chiqarish omboriga ko\'chirish'}
                          >
                            {isProdTab ? '→ Tayyorga' : '→ Ishlab chiqarishga'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManageProducts && !isProdTab && (
              <p className="text-xs text-gray-400 mt-3">
                Mahsulot ombori "Kirim" sahifasi orqali to'ldiriladi — bu yerda faqat ko'rish mumkin.
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'raw' && (
        <>
          {/* Raw materials alert */}
          {lowRm.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-orange-500" />
                <h3 className="font-semibold text-orange-800">Kam ombor ogohlantirishlari — Xom ashyo</h3>
              </div>
              <ul className="text-sm text-orange-700 space-y-1">
                {lowRm.map(rm => (
                  <li key={rm.id}>• {rm.name}: {rm.stock_balance} {rm.unit} qoldi</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw materials */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Xom Ashyolar</h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Nomi</th><th>Birlik</th><th>Omborda</th><th>Narxi</th><th>Ta'minotchi</th><th>Holat</th>{canWriteRaw && <th>Amal</th>}</tr>

                </thead>
                <tbody>
                  {!(rawMats?.raw_materials || []).length ? (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-400">Xom ashyo yo'q</td></tr>
                  ) : (rawMats?.raw_materials || []).map(rm => (
                    <tr key={rm.id}>
                      <td className="font-medium">{rm.name}</td>
                      <td>{rm.unit}</td>
                      <td className={`font-bold ${rm.stock_balance <= rm.min_stock_level ? 'text-red-600' : 'text-green-700'}`}>
                        {rm.stock_balance} {rm.unit}
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
                      {canWriteRaw && (
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(rm)}
                              className="btn-secondary btn-sm" title="Tahrirlash">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => { setRmStockModal(rm); setRmStockForm({ quantity: 0, operation: 'add' }); }}
                              className="btn-secondary btn-sm">Ombor</button>
                            <button
                              onClick={() => { if (confirm(`"${rm.name}" o'chirilsinmi?`)) deleteRmMutation.mutate(rm.id); }}
                              disabled={deleteRmMutation.isPending}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="O'chirish">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!canWriteRaw && (
              <p className="text-xs text-gray-400 mt-3">
                Xom ashyo qo'shish va ombor balansini o'zgartirish faqat Ta'minotchi vazifasi.
              </p>
            )}
          </div>
        </>
      )}

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
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" {...registerRm('create_expense')} className="w-4 h-4" defaultChecked />
            Xom ashyo qiymatini xarajat sifatida ham yozib qo'yish (Narxi va Miqdor bo'yicha)
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowRmModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createRmMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* Xom ashyo tahrirlash modali */}
      <Modal open={!!editRmModal} onClose={() => setEditRmModal(null)} title={`Tahrirlash — ${editRmModal?.name || ''}`}>
        <form onSubmit={handleSubmitEdit(d => updateRmMutation.mutate({ id: editRmModal.id, ...d }))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...registerEdit('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ombordagi miqdor</label>
              <input {...registerEdit('stock_balance')} type="number" min="0" step="0.01" className="input" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <select {...registerEdit('unit')} className="select">
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="litr">litr</option>
                <option value="dona">dona</option>
                <option value="metr">metr</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm/birlik)</label>
              <input {...registerEdit('price_per_unit')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Min. ombor darajasi</label>
              <input {...registerEdit('min_stock_level')} type="number" min="0" step="0.01" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Ta'minotchi nomi</label>
            <input {...registerEdit('supplier_name')} className="input" placeholder="Kompaniya yoki shaxs ismi" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditRmModal(null)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={updateRmMutation.isPending} className="btn-primary flex-1">
              {updateRmMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
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
