import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search, Plus, Trash2, ShoppingCart, X, Package, CheckCircle, Eraser, FileDown, QrCode, FileText, Tag
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { productsAPI, customersAPI, salesAPI, fulfillmentAPI } from '../services/api';
import { RANG_COLORS } from '../constants/colors';
import { downloadQR } from '../utils/qr';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const balfmt = (n) => (parseFloat(n) > 0 ? '+' : '') + fmt(n); // haqdor uchun +, qarzdor uchun - (fmt o'zi qo'yadi)
const rangLabel = (r) => (r && r.trim()) ? r : 'Rangsiz';
let _rowKey = 0;
const newRowKey = () => ++_rowKey;
const rowAvail = (x) => {
  const cs = (x.color_stock || []).find(c => (c.rang || '') === (x.rang || ''));
  return cs ? cs.quantity : 0;
};

const MAX_TABS = 5;
const STORAGE_KEY = 'teknoplast_sale_sessions';
const STORAGE_IDX_KEY = 'teknoplast_sale_activeIdx';
// Mahalliy (Toshkent) sana — toISOString() UTC bergani uchun emas, mahalliy kun bo'yicha
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const freshSession = () => ({
  id: Date.now() + Math.random(),
  cart: [],
  customerId: '',
  payCash: '',
  payCard: '',
  payBank: '',
  payPayme: '',
  discount: '',
  discountMode: 'sum', // 'sum' = so'm, 'pct' = foiz
  saleDate: todayStr(),
});

const loadSessions = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        // MUHIM: saqlangan sessiyaning sanasi eskirgan bo'lishi mumkin —
        // ilova ochilganda sanani har doim bugunga tiklaymiz (savdo bugungi kun bilan yozilsin).
        parsed.forEach(ses => {
          (ses.cart || []).forEach(x => { x.key = newRowKey(); });
          ses.saleDate = todayStr();
        });
        return parsed;
      }
    }
  } catch {}
  return [freshSession()];
};

const loadActiveIdx = () => {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_IDX_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch { return 0; }
};

export default function QuickSalePage() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const lastCartRef = useRef([]);
  const checkoutRef = useRef({ idx: 0, customerId: '' });

  const [sessions, setSessions] = useState(loadSessions);
  const [activeIdx, setActiveIdx] = useState(loadActiveIdx);
  const [search, setSearch] = useState('');
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_IDX_KEY, String(activeIdx)); } catch {}
  }, [activeIdx]);

  const s = sessions[activeIdx] || sessions[0];

  const setField = (field, val) => {
    setSessions(ss => ss.map((ses, i) =>
      i === activeIdx ? { ...ses, [field]: typeof val === 'function' ? val(ses[field]) : val } : ses
    ));
  };

  const addTab = () => {
    if (sessions.length >= MAX_TABS) return;
    setSessions(ss => [...ss, freshSession()]);
    setActiveIdx(sessions.length);
  };

  const closeTab = (idx, e) => {
    if (e) e.stopPropagation();
    if (sessions.length <= 1) return;
    setSessions(ss => ss.filter((_, i) => i !== idx));
    setActiveIdx(prev => prev >= idx ? Math.max(0, prev - 1) : prev);
  };

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const products = (productsData?.products || []).filter(p => p.kind !== 'KOMPONENT');

  // Tanlangan mijozning umumiy balansi: total_debt > 0 => qarzdor, < 0 => haqdor, 0 => teng
  const selectedCustomer = useMemo(
    () => customersData?.customers?.find(c => String(c.id) === String(s.customerId)) || null,
    [customersData, s.customerId]
  );
  const custBalance = selectedCustomer ? Math.round(parseFloat(selectedCustomer.total_debt) || 0) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter(p => String(p.name || '').toLowerCase().includes(q)).slice(0, 30);
  }, [search, products]);

  const cartIds = useMemo(() => new Set(s.cart.map(c => c.id)), [s.cart]);

  useEffect(() => {
    if (!products.length) return;
    const pMap = new Map(products.map(p => [p.id, p]));
    setSessions(ss => ss.map(ses => ({
      ...ses,
      cart: ses.cart.map(x => {
        const fresh = pMap.get(x.id);
        if (!fresh) return x;
        return { ...x, stock: fresh.stock_quantity, color_stock: fresh.color_stock || x.color_stock, price: x.price || parseFloat(fresh.price) || 0 };
      }),
    })));
  }, [products]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const preset = location.state?.presetProducts;
    if (preset && preset.length) {
      setField('cart', c => {
        const ids = new Set(c.map(x => x.id));
        const toAdd = preset.filter(p => !ids.has(p.id)).map(p => ({
          key: newRowKey(),
          id: p.id, name: p.name, unit: p.unit || 'dona',
          price: parseFloat(p.price) || 0, qty: 1, stock: p.stock_quantity,
          color_stock: p.color_stock || [],
          rang: (p.color_stock || []).length === 1 ? p.color_stock[0].rang : '',
        }));
        return [...c, ...toAdd];
      });
      toast.success(`${preset.length} ta mahsulot savatga qo'shildi`);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const addToCart = (p) => {
    if (cartIds.has(p.id)) {
      setField('cart', c => {
        const idx = c.findIndex(x => x.id === p.id);
        return c.map((x, i) => i === idx ? { ...x, qty: (parseFloat(x.qty) || 0) + 1 } : x);
      });
    } else {
      const cs = p.color_stock || [];
      setField('cart', c => [...c, {
        key: newRowKey(),
        id: p.id, name: p.name, unit: p.unit || 'dona',
        price: parseFloat(p.price) || 0, qty: 1, stock: p.stock_quantity,
        color_stock: cs,
        rang: cs.length === 1 ? cs[0].rang : '',
      }]);
    }
  };

  const addColorRow = (row) => {
    setField('cart', c => {
      const idx = c.findIndex(x => x.key === row.key);
      const dup = { ...row, key: newRowKey(), rang: '', qty: 1 };
      const next = [...c];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  };

  const updateRow = (key, fld, value) => {
    setField('cart', c => c.map(x => x.key === key ? { ...x, [fld]: value } : x));
  };
  const removeRow = (key) => setField('cart', c => c.filter(x => x.key !== key));
  const clearCart = () => setField('cart', []);

  const grandTotal = s.cart.reduce((sum, x) => sum + (parseFloat(x.qty) || 0) * (parseFloat(x.price) || 0), 0);
  const itemCount = s.cart.length;

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
      toast.success(`${res.data.count} ta sotildi · ${fmt(res.data.grand_total)} so'm`);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-list'] });
      qc.invalidateQueries({ queryKey: ['fulfillment'] });
      const { idx, customerId: cId } = checkoutRef.current;
      const cust = customersData?.customers?.find(c => c.id === cId);
      setLastOrder({
        ...res.data,
        items: lastCartRef.current,
        customer_name: cust?.name || null,
        date: new Date(),
        pay_cash: checkoutRef.current.payCash || 0,
        pay_card: checkoutRef.current.payCard || 0,
        pay_bank: checkoutRef.current.payBank || 0,
        pay_payme: checkoutRef.current.payPayme || 0,
        discount: checkoutRef.current.discount || 0,
        credit: checkoutRef.current.credit || 0,
      });
      setSessions(ss => ss.map((ses, i) => i === idx ? { ...ses, cart: [], payCash: '', payCard: '', payBank: '', payPayme: '', discount: '' } : ses));
      setSearch('');
    },
  });

  const cashAmt = parseFloat(s.payCash) || 0;
  const cardAmt = parseFloat(s.payCard) || 0;
  const bankAmt = parseFloat(s.payBank) || 0;
  const paymeAmt = parseFloat(s.payPayme) || 0;
  const paidTotal = cashAmt + cardAmt + bankAmt + paymeAmt;
  // Chegirma (skidka) — so'm yoki foiz; jami summadan oshmaydi
  const discountInput = parseFloat(s.discount) || 0;
  const discountRaw = s.discountMode === 'pct' ? grandTotal * discountInput / 100 : discountInput;
  const discountAmt = Math.min(Math.max(0, Math.round(discountRaw)), grandTotal);
  const finalTotal = grandTotal - discountAmt; // chegirmadan keyingi yakuniy summa
  const debtAmt = Math.max(0, finalTotal - paidTotal);
  const creditAmt = Math.max(0, paidTotal - finalTotal); // oshiqcha to'lov — mijoz haqdor bo'ladi

  const checkout = () => {
    if (!s.cart.length) return toast.error('Savat bo\'sh');
    if (!s.customerId) return toast.error('Mijozni tanlang');
    for (const x of s.cart) {
      if (!x.qty || x.qty < 1) return toast.error(`"${x.name}" miqdori noto'g'ri`);
      if (!(x.color_stock || []).length) return toast.error(`"${x.name}" omborda yo'q`);
      const hasBucket = (x.color_stock || []).some(c => (c.rang || '') === (x.rang || ''));
      if (!hasBucket) return toast.error(`"${x.name}" uchun rang tanlang`);
      const avail = rowAvail(x);
      if (parseFloat(x.qty) > avail) return toast.error(`"${x.name}" — ${rangLabel(x.rang)}: faqat ${avail} dona bor`);
    }
    // Chegirmani har bir mahsulot narxiga proporsional taqsimlaymiz (yig'indi = finalTotal).
    // Oxirgi qator yaxlitlash qoldig'ini o'ziga oladi — jami aniq bo'lsin.
    let itemsOut;
    if (discountAmt > 0 && grandTotal > 0) {
      let allocated = 0;
      itemsOut = s.cart.map((x, i) => {
        const qty = parseInt(x.qty);
        const origTotal = qty * (parseFloat(x.price) || 0);
        const itemTotal = (i === s.cart.length - 1)
          ? (finalTotal - allocated)
          : Math.round(origTotal * finalTotal / grandTotal);
        if (i !== s.cart.length - 1) allocated += itemTotal;
        return { product_id: x.id, quantity: qty, unit_price: qty > 0 ? itemTotal / qty : 0, rang: x.rang };
      });
    } else {
      itemsOut = s.cart.map(x => ({ product_id: x.id, quantity: parseInt(x.qty), unit_price: parseFloat(x.price), rang: x.rang }));
    }

    checkoutRef.current = { idx: activeIdx, customerId: s.customerId, payCash: cashAmt, payCard: cardAmt, payBank: bankAmt, payPayme: paymeAmt, credit: creditAmt, discount: discountAmt };
    // Chekда ko'rsatish uchun — chegirma qo'llangan (net) narxlar
    lastCartRef.current = itemsOut.map((it, idx) => ({ name: s.cart[idx].name, qty: it.quantity, price: it.unit_price, unit: s.cart[idx].unit, rang: it.rang }));
    const noteParts = [];
    if (cashAmt > 0) noteParts.push(`Naqd: ${cashAmt}`);
    if (cardAmt > 0) noteParts.push(`Karta: ${cardAmt}`);
    if (bankAmt > 0) noteParts.push(`Bank: ${bankAmt}`);
    if (paymeAmt > 0) noteParts.push(`Payme: ${paymeAmt}`);
    if (debtAmt > 0) noteParts.push(`Qarz: ${debtAmt}`);
    if (creditAmt > 0) noteParts.push(`Haqdor: ${creditAmt}`);
    if (!noteParts.length) noteParts.push('Qarz');
    if (discountAmt > 0) noteParts.push(`Chegirma: ${discountAmt}`);
    saveMutation.mutate({
      customer_id: s.customerId,
      sale_date: s.saleDate,
      payment_amount: paidTotal,
      notes: `To'lov: ${noteParts.join(' · ')}`,
      items: itemsOut,
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
    <div className="space-y-2">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-gray-900">Savdo</h1>
        <div className="flex items-center gap-1">
          {sessions.map((ses, i) => {
            const cnt = ses.cart.length;
            const active = i === activeIdx;
            return (
              <button key={ses.id} onClick={() => setActiveIdx(i)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Savdo {i + 1}
                {cnt > 0 && <span className={`px-1.5 rounded-full text-[10px] leading-4 ${active ? 'bg-white/25' : 'bg-blue-100 text-blue-700'}`}>{cnt}</span>}
                {sessions.length > 1 && (
                  <span onClick={e => closeTab(i, e)}
                    className={`ml-0.5 text-[13px] rounded-full w-4 h-4 inline-flex items-center justify-center ${active ? 'hover:bg-white/20' : 'hover:bg-red-100 hover:text-red-600'}`}
                  >×</span>
                )}
              </button>
            );
          })}
          {sessions.length < MAX_TABS && (
            <button onClick={addTab} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Yangi savdo oynasi">
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Chek modal */}
      {lastOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 print:hidden" onClick={() => { setLastOrder(null); searchRef.current?.focus(); }} />
          <div className="relative w-full max-w-xs my-4">
            <div id="chek-print" className="bg-white rounded-xl shadow-2xl px-5 py-5 font-mono text-[13px] leading-tight text-gray-900">
              <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="text-lg font-bold tracking-wide">TEKNOPLAST</div>
                <div className="text-[11px] text-gray-500">Plastik mahsulotlar zavodi</div>
                <div className="text-[11px] text-gray-500">Tel: +998 90 123 45 67</div>
              </div>
              <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="flex justify-between"><span>Chek:</span><span className="font-bold">{lastOrder.order_ref}</span></div>
                <div className="flex justify-between"><span>Sana:</span><span>{new Date(lastOrder.date).toLocaleString('uz-UZ')}</span></div>
                <div className="flex justify-between"><span>Mijoz:</span><span>{lastOrder.customer_name || '—'}</span></div>
              </div>
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
              {lastOrder.discount > 0 && (
                <>
                  <div className="flex justify-between text-[12px] text-gray-600 pb-0.5">
                    <span>Oraliq:</span><span>{fmt(lastOrder.grand_total + lastOrder.discount)} so'm</span>
                  </div>
                  <div className="flex justify-between text-[12px] text-rose-600 pb-1">
                    <span>Chegirma:</span><span className="font-bold">−{fmt(lastOrder.discount)} so'm</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-[15px] pb-2 mb-2">
                <span>JAMI:</span><span>{fmt(lastOrder.grand_total)} so'm</span>
              </div>
              {(() => {
                const hasMixed = (lastOrder.pay_cash > 0) + (lastOrder.pay_card > 0) + (lastOrder.pay_bank > 0) + (lastOrder.pay_payme > 0) > 0;
                const chekDebt = Math.max(0, lastOrder.grand_total - lastOrder.paid_amount);
                const chekCredit = lastOrder.credit > 0 ? lastOrder.credit : Math.max(0, lastOrder.paid_amount - lastOrder.grand_total);
                if (!hasMixed && chekDebt <= 0 && chekCredit <= 0) return null;
                return (
                  <div className="text-[12px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                    {lastOrder.pay_cash > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Naqd:</span><span className="font-bold">{fmt(lastOrder.pay_cash)} so'm</span>
                      </div>
                    )}
                    {lastOrder.pay_card > 0 && (
                      <div className="flex justify-between text-blue-700">
                        <span>Karta:</span><span className="font-bold">{fmt(lastOrder.pay_card)} so'm</span>
                      </div>
                    )}
                    {lastOrder.pay_bank > 0 && (
                      <div className="flex justify-between text-purple-700">
                        <span>Bank:</span><span className="font-bold">{fmt(lastOrder.pay_bank)} so'm</span>
                      </div>
                    )}
                    {lastOrder.pay_payme > 0 && (
                      <div className="flex justify-between text-cyan-700">
                        <span>Pay Me:</span><span className="font-bold">{fmt(lastOrder.pay_payme)} so'm</span>
                      </div>
                    )}
                    {chekDebt > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Qarz:</span><span className="font-bold">{fmt(chekDebt)} so'm</span>
                      </div>
                    )}
                    {chekCredit > 0 && (
                      <div className="flex justify-between text-blue-700">
                        <span>Haqdor (oshiqcha):</span><span className="font-bold">+{fmt(chekCredit)} so'm</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              {lastOrder.balance_after != null && (lastOrder.balance_before !== 0 || lastOrder.balance_after !== 0) && (
                <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Savdodan oldingi balans:</span>
                    <span className={`font-semibold ${lastOrder.balance_before < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(lastOrder.balance_before)} so'm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Savdodan keyingi balans:</span>
                    <span className={`font-bold ${lastOrder.balance_after < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(lastOrder.balance_after)} so'm</span>
                  </div>
                </div>
              )}
              <div className="flex flex-col items-center pt-1">
                <QRCodeSVG id="chek-qr" value={lastOrder.order_ref} size={110} />
                <QRCodeCanvas id="chek-qr-canvas" value={lastOrder.order_ref} size={512} className="hidden" />
                <div className="text-[10px] text-gray-500 mt-1">Omborchi uchun QR kod</div>
                <div className="text-center text-[11px] mt-1 font-sans">Xaridingiz uchun rahmat!</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-3 print:hidden">
              <button onClick={() => navigate(`/invoice/${lastOrder.order_ref}`)} className="btn-primary w-full text-sm">
                <FileText size={14} /> Schyot-faktura
              </button>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="btn-secondary flex-1 text-sm"><QrCode size={14} /> Chop</button>
                <button onClick={() => { downloadQR('chek-qr-canvas', `qr-${lastOrder.order_ref}`); toast.success('QR kod yuklab olindi'); }} className="btn-secondary flex-1 text-sm"><FileDown size={14} /> QR</button>
                <button onClick={() => downloadNakladnoy(lastOrder.order_ref)} className="btn-secondary flex-1 text-sm"><FileDown size={14} /> Nakladnoy</button>
              </div>
              <button onClick={() => { setLastOrder(null); searchRef.current?.focus(); }} className="btn-secondary w-full text-sm">Yangi savdo</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
        {/* CHAP: Mahsulot qidirish */}
        <div className="lg:col-span-2">
          <div className="card p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Mahsulot qidirish... (Enter)"
                className="input pl-8 py-1.5 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-[calc(100vh-220px)] overflow-y-auto">
              {isLoading ? (
                <p className="text-center py-4 text-gray-400 text-xs">Yuklanmoqda...</p>
              ) : !filtered.length ? (
                <p className="text-center py-4 text-gray-400 text-xs">Topilmadi</p>
              ) : filtered.map(p => {
                const inCart = cartIds.has(p.id);
                const out = p.stock_quantity <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => !out && addToCart(p)}
                    disabled={out}
                    className={`w-full flex items-center justify-between gap-1 px-2 py-1.5 text-left hover:bg-blue-50 transition text-xs ${out ? 'opacity-40 cursor-not-allowed' : ''} ${inCart ? 'bg-blue-50/50' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.stock_quantity} {p.unit} · {fmt(p.price)}</p>
                    </div>
                    <span className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center ${inCart ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Plus size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* O'NG: Savat */}
        <div className="lg:col-span-3 space-y-2">
          {/* Mijoz / sana */}
          <div className="card p-3 space-y-2">
            {/* Tanlangan mijozning umumiy balansi — sananing tepasida */}
            {s.customerId && (
              custBalance > 0 ? (
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
                  <span className="text-[11px] font-medium text-red-600">⚠️ Mijoz qarzi (umumiy)</span>
                  <span className="text-sm font-bold text-red-600">{fmt(custBalance)} so'm</span>
                </div>
              ) : custBalance < 0 ? (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                  <span className="text-[11px] font-medium text-blue-700">⭐ Mijoz haqdor (umumiy)</span>
                  <span className="text-sm font-bold text-blue-700">+{fmt(-custBalance)} so'm</span>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5">
                  <span className="text-[11px] font-medium text-yellow-700">✅ Qarzi yo'q</span>
                  <span className="text-sm font-bold text-yellow-700">0 so'm</span>
                </div>
              )
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 font-medium">Mijoz *</label>
                <select
                  value={s.customerId}
                  onChange={e => setField('customerId', e.target.value)}
                  className={`select text-xs py-1.5 ${!s.customerId ? 'border-red-300' : ''}`}
                >
                  <option value="" disabled>— Tanlang —</option>
                  {customersData?.customers?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium">Sana</label>
                <input type="date" value={s.saleDate} onChange={e => setField('saleDate', e.target.value)} className="input text-xs py-1.5" />
              </div>
            </div>
          </div>

          {/* To'lov — 5 xil usul */}
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-500 font-medium uppercase">To'lov usullari</span>
              {grandTotal > 0 && (
                <span className={`text-[10px] font-semibold ${creditAmt > 0 ? 'text-blue-600' : debtAmt > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {creditAmt > 0
                    ? `Haqdor: +${fmt(creditAmt)} so'm`
                    : debtAmt > 0 ? `Qarz: ${fmt(debtAmt)} so'm` : "To'liq to'langan"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 font-medium flex items-center gap-1">💵 Naqd</label>
                <input
                  type="number" min="0" step="1000"
                  value={s.payCash}
                  onChange={e => setField('payCash', e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input text-xs py-1.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium flex items-center gap-1">💳 Karta</label>
                <input
                  type="number" min="0" step="1000"
                  value={s.payCard}
                  onChange={e => setField('payCard', e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input text-xs py-1.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium flex items-center gap-1">🏦 Bank</label>
                <input
                  type="number" min="0" step="1000"
                  value={s.payBank}
                  onChange={e => setField('payBank', e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input text-xs py-1.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-600 font-medium flex items-center gap-1">📱 Pay Me</label>
                <input
                  type="number" min="0" step="1000"
                  value={s.payPayme}
                  onChange={e => setField('payPayme', e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input text-xs py-1.5 border-cyan-200 focus:ring-cyan-400"
                />
              </div>
              <div className="col-span-2 lg:col-span-2">
                <label className={`text-[10px] font-medium flex items-center gap-1 ${creditAmt > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                  {creditAmt > 0 ? '💰 Haqdor' : '📝 Qarz'}
                </label>
                <input
                  type="text" readOnly
                  value={creditAmt > 0 ? `+${fmt(creditAmt)}` : (grandTotal > 0 ? fmt(debtAmt) : '0')}
                  className={`input text-xs py-1.5 cursor-not-allowed ${creditAmt > 0 ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-gray-50'}`}
                />
              </div>
            </div>
            {grandTotal > 0 && (
              <button
                type="button"
                onClick={() => { setField('payCash', String(finalTotal)); setField('payCard', ''); setField('payBank', ''); setField('payPayme', ''); }}
                className="text-[10px] text-blue-500 hover:text-blue-700 mt-1"
              >
                Hammasini naqd to'lash
              </button>
            )}
          </div>

          {/* Savat jadvali */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <ShoppingCart size={14} /> Savat
                {itemCount > 0 && <span className="badge-blue text-[10px] px-1.5">{itemCount}</span>}
              </div>
              {itemCount > 0 && (
                <button onClick={clearCart} className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-0.5">
                  <Eraser size={10} /> Tozalash
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th className="w-6">#</th>
                    <th>Mahsulot</th>
                    <th className="w-28">Rang</th>
                    <th className="w-24">Narx</th>
                    <th className="w-20">Son</th>
                    <th className="w-24">Jami</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {!s.cart.length ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-gray-400 text-xs">
                        <Package size={22} className="mx-auto mb-1 opacity-30" />
                        Chapdan mahsulot qo'shing
                      </td>
                    </tr>
                  ) : s.cart.map((x, i) => ({ x, num: i + 1 })).reverse().map(({ x, num }) => (
                    <tr key={x.key}>
                      <td className="text-gray-400">{num}</td>
                      <td>
                        <div className="font-medium text-gray-900 truncate max-w-[160px]">{x.name}</div>
                        <div className="text-[10px] text-gray-400">
                          {x.rang ? `${rangLabel(x.rang)}: ${rowAvail(x)} ${x.unit}` : `${x.stock} ${x.unit}`}
                        </div>
                      </td>
                      <td>
                        {(x.color_stock || []).length === 0 ? (
                          <span className="text-[10px] text-red-500">Yo'q</span>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <select
                              value={x.rang || ''}
                              onChange={e => updateRow(x.key, 'rang', e.target.value)}
                              className={`select py-0.5 px-1 text-xs w-28 ${((x.color_stock || []).length > 1 && !(x.color_stock || []).some(c => (c.rang || '') === (x.rang || ''))) ? 'border-red-300' : ''}`}
                            >
                              {(x.color_stock || []).length > 1 && <option value="">— Rang —</option>}
                              {(x.color_stock || []).map(c => (
                                <option key={c.rang || 'none'} value={c.rang}>{rangLabel(c.rang)} ({c.quantity})</option>
                              ))}
                            </select>
                            {x.rang && <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[x.rang] || '#999', border:'1px solid #ccc' }} />}
                            {(x.color_stock || []).length > 1 && (
                              <button type="button" onClick={() => addColorRow(x)}
                                className="text-blue-500 hover:text-blue-700 text-[10px] whitespace-nowrap">+</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          type="number" min="0" value={x.price}
                          onChange={e => updateRow(x.key, 'price', e.target.value)}
                          onFocus={e => e.target.select()}
                          className="input py-0.5 px-1 text-xs w-20"
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="1" max={rowAvail(x)} value={x.qty}
                          onChange={e => updateRow(x.key, 'qty', e.target.value)}
                          onFocus={e => e.target.select()}
                          className={`input py-0.5 px-1 text-xs w-16 ${x.rang && parseFloat(x.qty) > rowAvail(x) ? 'border-red-400 text-red-600' : ''}`}
                        />
                      </td>
                      <td className="font-semibold text-blue-700 whitespace-nowrap">
                        {fmt((parseFloat(x.qty) || 0) * (parseFloat(x.price) || 0))}
                      </td>
                      <td>
                        <button onClick={() => removeRow(x.key)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Jami, chegirma va yakunlash */}
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 space-y-2">
              {/* Chegirma (skidka) qatori */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] text-gray-600 font-medium flex items-center gap-1">
                  <Tag size={12} className="text-rose-500" /> Chegirma
                </label>
                <input
                  type="number" min="0"
                  value={s.discount}
                  onChange={e => setField('discount', e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input text-xs py-1 w-24"
                />
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  <button type="button" onClick={() => setField('discountMode', 'sum')}
                    className={`px-2 py-1 text-[11px] font-medium ${s.discountMode !== 'pct' ? 'bg-rose-500 text-white' : 'bg-white text-gray-500'}`}>so'm</button>
                  <button type="button" onClick={() => setField('discountMode', 'pct')}
                    className={`px-2 py-1 text-[11px] font-medium ${s.discountMode === 'pct' ? 'bg-rose-500 text-white' : 'bg-white text-gray-500'}`}>%</button>
                </div>
                {discountAmt > 0 && <span className="text-[11px] text-rose-600 font-medium">−{fmt(discountAmt)} so'm</span>}
              </div>
              {/* Yakuniy summa + Sotish */}
              <div className="flex items-center justify-between">
                <div>
                  {discountAmt > 0 && (
                    <p className="text-[10px] text-gray-400 line-through">{fmt(grandTotal)} so'm</p>
                  )}
                  <p className="text-[10px] text-gray-500">{discountAmt > 0 ? 'Yakuniy summa' : 'Umumiy summa'}</p>
                  <p className="text-lg font-bold text-gray-900">{fmt(finalTotal)} <span className="text-xs font-medium text-gray-400">so'm</span></p>
                </div>
                <button
                  onClick={checkout}
                  disabled={!s.cart.length || saveMutation.isPending}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                >
                  <CheckCircle size={15} />
                  {saveMutation.isPending ? 'Saqlanmoqda...' : 'Sotish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
