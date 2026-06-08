import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search, Plus, Trash2, ShoppingCart, X, Package, CheckCircle, Eraser, FileDown, QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { productsAPI, customersAPI, salesAPI, fulfillmentAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function QuickSalePage() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);          // [{id,name,unit,price,qty,stock}]
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastOrder, setLastOrder] = useState(null); // {order_ref, count, grand_total, items}
  const lastCartRef = useRef([]);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const products = productsData?.products || [];

  // Qidiruv natijasi (client-side filtr, 1000+ mahsulot uchun tez)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [search, products]);

  const cartIds = useMemo(() => new Set(cart.map(c => c.id)), [cart]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Smart Grid'dan "Sotish" tugmasi orqali tanlangan mahsulotlar shu yerga
  // savatga avtomatik qo'shiladi (location.state.presetProducts orqali keladi).
  useEffect(() => {
    const preset = location.state?.presetProducts;
    if (preset && preset.length) {
      setCart(c => {
        const ids = new Set(c.map(x => x.id));
        const toAdd = preset
          .filter(p => !ids.has(p.id))
          .map(p => ({
            id: p.id, name: p.name, unit: p.unit || 'dona',
            price: parseFloat(p.price) || 0, qty: 1, stock: p.stock_quantity,
          }));
        return [...c, ...toAdd];
      });
      toast.success(`🛒 ${preset.length} ta mahsulot savatga qo'shildi`);
      // state'ni tozalaymiz — sahifani yangilasa qayta qo'shilmasin
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const addToCart = (p) => {
    if (cartIds.has(p.id)) {
      // Allaqachon savatda — miqdorini oshiramiz
      setCart(c => c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      setCart(c => [...c, {
        id: p.id, name: p.name, unit: p.unit || 'dona',
        price: parseFloat(p.price) || 0, qty: 1, stock: p.stock_quantity,
      }]);
    }
  };

  const updateRow = (id, field, value) => {
    setCart(c => c.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  const removeRow = (id) => setCart(c => c.filter(x => x.id !== id));
  const clearCart = () => setCart([]);

  const grandTotal = cart.reduce((sum, x) => sum + (parseFloat(x.qty) || 0) * (parseFloat(x.price) || 0), 0);
  const itemCount = cart.length;

  // Enter bosilganda birinchi natijani qo'shish
  const onSearchKey = (e) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      addToCart(filtered[0]);
      setSearch('');
    }
  };

  const saveMutation = useMutation({
    mutationFn: (data) => salesAPI.createBulk(data),
    onSuccess: (res) => {
      toast.success(`✅ ${res.data.count} ta mahsulot sotildi · ${fmt(res.data.grand_total)} so'm`);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['fulfillment'] });
      const cust = customersData?.customers?.find(c => c.id === customerId);
      setLastOrder({
        ...res.data,
        items: lastCartRef.current,
        customer_name: cust?.name || null,
        date: new Date(),
      });
      setCart([]);
      setSearch('');
    },
  });

  const checkout = () => {
    if (!cart.length) return toast.error('Savat bo\'sh');
    // Validatsiya
    for (const x of cart) {
      if (!x.qty || x.qty < 1) return toast.error(`"${x.name}" miqdori noto'g'ri`);
      if (x.qty > x.stock) return toast.error(`"${x.name}" omborida yetarli emas (${x.stock})`);
    }
    // Chek uchun savat nusxasi (nomlar bilan)
    lastCartRef.current = cart.map(x => ({ name: x.name, qty: parseInt(x.qty), price: parseFloat(x.price), unit: x.unit }));
    saveMutation.mutate({
      customer_id: customerId || null,
      sale_date: saleDate,
      status,
      items: cart.map(x => ({
        product_id: x.id,
        quantity: parseInt(x.qty),
        unit_price: parseFloat(x.price),
      })),
    });
  };

  const downloadNakladnoy = async (ref) => {
    try {
      const res = await fulfillmentAPI.nakladnoy(ref);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `nakladnoy-${ref}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Nakladnoy yuklab bo\'lmadi'); }
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Tezkor Savdo</h1>
        <span className="text-sm text-gray-400">{products.length} ta mahsulot bazada</span>
      </div>

      {/* Sotuvdan keyin: CHEK (kvitansiya) + QR */}
      {lastOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 print:hidden" onClick={() => { setLastOrder(null); searchRef.current?.focus(); }} />
          <div className="relative w-full max-w-xs my-4">
            {/* CHEK */}
            <div id="chek-print" className="bg-white rounded-xl shadow-2xl px-5 py-5 font-mono text-[13px] leading-tight text-gray-900">
              {/* Header */}
              <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="text-lg font-bold tracking-wide">TEKNOPLAST</div>
                <div className="text-[11px] text-gray-500">Plastik mahsulotlar zavodi</div>
                <div className="text-[11px] text-gray-500">Tel: +998 90 123 45 67</div>
              </div>

              {/* Meta */}
              <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="flex justify-between"><span>Chek:</span><span className="font-bold">{lastOrder.order_ref}</span></div>
                <div className="flex justify-between"><span>Sana:</span><span>{new Date(lastOrder.date).toLocaleString('uz-UZ')}</span></div>
                <div className="flex justify-between"><span>Mijoz:</span><span>{lastOrder.customer_name || 'Tasodifiy'}</span></div>
              </div>

              {/* Items */}
              <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                {(lastOrder.items || []).map((it, i) => (
                  <div key={i} className="mb-1">
                    <div className="truncate">{it.name}</div>
                    <div className="flex justify-between text-gray-600">
                      <span>{it.qty} x {fmt(it.price)}</span>
                      <span className="font-bold text-gray-900">{fmt(it.qty * it.price)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between font-bold text-[15px] border-b border-dashed border-gray-300 pb-2 mb-2">
                <span>JAMI:</span><span>{fmt(lastOrder.grand_total)} so'm</span>
              </div>

              {/* QR */}
              <div className="flex flex-col items-center pt-1">
                <QRCodeSVG value={lastOrder.order_ref} size={130} />
                <div className="text-[10px] text-gray-500 mt-1">Omborchi uchun QR kod</div>
                <div className="text-center text-[11px] mt-2 font-sans">Xaridingiz uchun rahmat! 🙏</div>
              </div>
            </div>

            {/* Tugmalar */}
            <div className="flex gap-2 mt-3 print:hidden">
              <button onClick={() => window.print()} className="btn-secondary flex-1 text-sm"><QrCode size={14} /> Chop etish</button>
              <button onClick={() => downloadNakladnoy(lastOrder.order_ref)} className="btn-secondary flex-1 text-sm"><FileDown size={14} /> Nakladnoy</button>
              <button onClick={() => { setLastOrder(null); searchRef.current?.focus(); }} className="btn-primary flex-1 text-sm">Yangi</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* CHAP: Mahsulot qidirish */}
        <div className="lg:col-span-2 space-y-3">
          <div className="card p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Mahsulot nomini yozing... (Enter — qo'shish)"
                className="input pl-9 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="mt-3 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[460px] overflow-y-auto">
              {isLoading ? (
                <p className="text-center py-8 text-gray-400 text-sm">Yuklanmoqda...</p>
              ) : !filtered.length ? (
                <p className="text-center py-8 text-gray-400 text-sm">Mahsulot topilmadi</p>
              ) : filtered.map(p => {
                const inCart = cartIds.has(p.id);
                const out = p.stock_quantity <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => !out && addToCart(p)}
                    disabled={out}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50 transition ${out ? 'opacity-40 cursor-not-allowed' : ''} ${inCart ? 'bg-blue-50/50' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        Ombor: {p.stock_quantity} {p.unit} · {fmt(p.price)} so'm
                      </p>
                    </div>
                    <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${inCart ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Plus size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
            {search && filtered.length === 30 && (
              <p className="text-xs text-gray-400 mt-2 text-center">Faqat birinchi 30 ta ko'rsatildi — aniqroq yozing</p>
            )}
          </div>
        </div>

        {/* O'NG: Savat (Excel-grid) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Mijoz / sana / status */}
          <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Mijoz</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="select text-sm">
                <option value="">— Tasodifiy mijoz —</option>
                {customersData?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sana</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="label">To'lov holati</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="select text-sm">
                <option value="PENDING">Kutilmoqda (qarz)</option>
                <option value="PAID">To'langan</option>
                <option value="PARTIALLY_PAID">Qisman</option>
              </select>
            </div>
          </div>

          {/* Savat jadvali */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <ShoppingCart size={16} /> Savat
                {itemCount > 0 && <span className="badge-blue">{itemCount} xil</span>}
              </div>
              {itemCount > 0 && (
                <button onClick={clearCart} className="btn-secondary btn-sm text-red-600">
                  <Eraser size={12} /> Tozalash
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Mahsulot</th>
                    <th className="w-28">Narx</th>
                    <th className="w-24">Miqdor</th>
                    <th className="w-28">Jami</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {!cart.length ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400">
                        <Package size={28} className="mx-auto mb-2 opacity-30" />
                        Chapdan mahsulot qo'shing
                      </td>
                    </tr>
                  ) : cart.map((x, i) => (
                    <tr key={x.id}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td>
                        <div className="font-medium text-gray-900">{x.name}</div>
                        <div className="text-xs text-gray-400">Ombor: {x.stock} {x.unit}</div>
                      </td>
                      <td>
                        <input
                          type="number" min="0" value={x.price}
                          onChange={e => updateRow(x.id, 'price', e.target.value)}
                          onFocus={e => e.target.select()}
                          className="input py-1 px-2 text-sm w-24"
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="1" max={x.stock} value={x.qty}
                          onChange={e => updateRow(x.id, 'qty', e.target.value)}
                          onFocus={e => e.target.select()}
                          className={`input py-1 px-2 text-sm w-20 ${x.qty > x.stock ? 'border-red-400 text-red-600' : ''}`}
                        />
                      </td>
                      <td className="font-semibold text-blue-700 whitespace-nowrap">
                        {fmt((parseFloat(x.qty) || 0) * (parseFloat(x.price) || 0))}
                      </td>
                      <td>
                        <button onClick={() => removeRow(x.id)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Jami va yakunlash */}
            <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100 bg-gray-50">
              <div>
                <p className="text-xs text-gray-500">Umumiy summa</p>
                <p className="text-2xl font-bold text-gray-900">{fmt(grandTotal)} <span className="text-base font-medium text-gray-400">so'm</span></p>
              </div>
              <button
                onClick={checkout}
                disabled={!cart.length || saveMutation.isPending}
                className="btn-primary px-6 py-3 text-base disabled:opacity-40"
              >
                <CheckCircle size={18} />
                {saveMutation.isPending ? 'Saqlanmoqda...' : 'Sotishni yakunlash'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
