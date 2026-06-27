import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Save, Trash2, Download, Printer } from 'lucide-react';
import { productionAPI, employeesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function ProductionPage() {
  const { isOwner, isProductionHead, isKirimchi } = useAuthStore();
  const qc = useQueryClient();
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const [month, setMonth] = useState(localMonth);
  const [date, setDate] = useState(localDate);
  const [showBulk, setShowBulk] = useState(false);
  const [historyEmpId, setHistoryEmpId] = useState('');

  // Davr bo'yicha statistika (Stanokchi/Detalchi)
  const [rangeStart, setRangeStart] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [rangeEnd, setRangeEnd] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [shiftFilter, setShiftFilter] = useState(''); // '' = hammasi, '1-SMENA', '2-SMENA' — faqat Stanokchiga ta'sir qiladi
  const [compactMode, setCompactMode] = useState(false);
  const empIdsInitialized = useRef(false);

  const { data: summary } = useQuery({
    queryKey: ['production-summary', month],
    queryFn: () => productionAPI.getSummary({ month }).then(r => r.data),
  });

  const { data: daily } = useQuery({
    queryKey: ['production-daily', date],
    queryFn: () => productionAPI.getAll({ date }).then(r => r.data),
  });

  const { data: empHistory } = useQuery({
    queryKey: ['production-history', historyEmpId],
    queryFn: () => productionAPI.getAll({ employee_id: historyEmpId }).then(r => r.data),
    enabled: !!historyEmpId,
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesAPI.getAll({ is_active: 'true' }).then(r => r.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  // Stanokchi/Detalchi xodimlar ro'yxati (davr statistikasi uchun)
  // Smena filtri faqat Stanokchiga ta'sir qiladi — Detalchilar har doim hammasi ko'rinadi
  const stanokchiList = (employees?.employees || []).filter(e => e.type === 'STANOKCHI' && (!shiftFilter || e.shift === shiftFilter));
  const detalchiList = (employees?.employees || []).filter(e => e.type === 'DETALCHI');
  const piecemealEmployees = [...stanokchiList, ...detalchiList];
  const allSelected = piecemealEmployees.length > 0 && selectedEmpIds.length === piecemealEmployees.length;

  // Birinchi yuklanganda hammasini belgilab qo'yamiz
  useEffect(() => {
    if (!empIdsInitialized.current && piecemealEmployees.length) {
      setSelectedEmpIds(piecemealEmployees.map(e => e.id));
      empIdsInitialized.current = true;
    }
  }, [piecemealEmployees.length]);

  // Smena filtri o'zgarganda — shu smenadagi (+ barcha detalchi) xodimlarni qayta belgilaymiz
  useEffect(() => {
    if (empIdsInitialized.current) {
      setSelectedEmpIds(piecemealEmployees.map(e => e.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftFilter]);

  const toggleAllEmp = () => {
    setSelectedEmpIds(allSelected ? [] : piecemealEmployees.map(e => e.id));
  };
  const toggleOneEmp = (id) => {
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const { data: rangeSummary } = useQuery({
    queryKey: ['production-range', rangeStart, rangeEnd, selectedEmpIds],
    queryFn: () => productionAPI.getRangeSummary({ start_date: rangeStart, end_date: rangeEnd, employee_ids: selectedEmpIds.join(',') }).then(r => r.data),
    enabled: !!rangeStart && !!rangeEnd && selectedEmpIds.length > 0,
  });

  const sumField = (rows, field) => rows.reduce((s, r) => s + parseFloat(r[field] || 0), 0);
  const rangeStanokchiRows = (rangeSummary?.summary || []).filter(r => r.type === 'STANOKCHI');
  const rangeDetalchiRows = (rangeSummary?.summary || []).filter(r => r.type === 'DETALCHI');

  const downloadRangeExcel = async () => {
    try {
      const res = await productionAPI.getRangeSummaryExcel({ start_date: rangeStart, end_date: rangeEnd, employee_ids: selectedEmpIds.join(',') });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `ishlab-chiqarish-${rangeStart}_${rangeEnd}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Yuklab bo\'lmadi'); }
  };

  const bulkMutation = useMutation({
    mutationFn: (data) => productionAPI.bulk(data),
    onSuccess: (res) => {
      toast.success(`${res.data.count} ta xodim kiritildi`);
      qc.invalidateQueries({ queryKey: ['production'] });
      setShowBulk(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Saqlashda xato'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productionAPI.remove(id),
    onSuccess: () => {
      toast.success('Yozuv o\'chirildi');
      qc.invalidateQueries({ queryKey: ['production-daily', date] });
      qc.invalidateQueries({ queryKey: ['production-summary', month] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => productionAPI.removeAll(),
    onSuccess: (res) => {
      toast.success(`${res.data.count} ta yozuv o'chirildi`);
      qc.invalidateQueries({ queryKey: ['production-daily'] });
      qc.invalidateQueries({ queryKey: ['production-summary'] });
      qc.invalidateQueries({ queryKey: ['production-history'] });
      qc.invalidateQueries({ queryKey: ['production-range'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const [entries, setEntries] = useState([]);

  const empMap = {};
  (employees?.employees || []).forEach(e => { empMap[e.id] = e; });

  const prodMap = {};
  (products?.products || []).forEach(p => { prodMap[p.id] = p; });

  const newItem = () => ({ prodSearch: '', product_id: '', production_type: 'FINISHED', tarif: '', quantity_produced: '', rang: '' });

  const addEntry = () => {
    setEntries(prev => [...prev, { employee_id: '', items: [newItem()] }]);
  };

  const autoTarif = (empId, prodId, ptype) => {
    const emp = empMap[empId];
    const p = prodMap[prodId];
    // Komponent — narxi xodimga bog'liq emas: tanlanishi bilanoq darrov chiqadi
    if (p && p.kind === 'KOMPONENT') return p.price || '';
    if (!emp) return '';
    if (emp.type === 'STANOKCHI' && p) {
      return ptype === 'SEMI_FINISHED' ? (p.stanokchi_semi_rate || '') : (p.stanokchi_rate || '');
    }
    if (emp.type === 'DETALCHI' && p) return p.detalchi_rate || '';
    return emp.daily_tariff || '';
  };

  const updateEntryEmp = (i, empId) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i) return e;
      const emp = empMap[empId];
      const items = e.items.map(item => {
        const next = { ...item };
        if (prodMap[next.product_id]?.kind === 'KOMPONENT') next.production_type = 'KOMPONENT';
        else if (emp?.type === 'DETALCHI') next.production_type = 'SEMI_FINISHED';
        else if (emp?.type === 'STANOKCHI' && !next.production_type) next.production_type = 'FINISHED';
        next.tarif = autoTarif(empId, next.product_id, next.production_type);
        return next;
      });
      return { ...e, employee_id: empId, items };
    }));
  };

  const updateItem = (i, j, field, value) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i) return e;
      const items = e.items.map((item, jdx) => {
        if (jdx !== j) return item;
        const next = { ...item, [field]: value };
        if (field === 'prodSearch') {
          const match = (products?.products || []).find(p => p.name === value);
          next.product_id = match ? match.id : '';
          next.rang = match ? (match.rang || '') : '';
          if (match) {
            // Komponent tanlansa — turi avtomatik 'KOMPONENT'
            if (match.kind === 'KOMPONENT') {
              next.production_type = 'KOMPONENT';
            } else if (item.production_type === 'KOMPONENT') {
              // Oldin komponent edi, endi tayyor mahsulot — turni tiklaymiz
              next.production_type = empMap[e.employee_id]?.type === 'DETALCHI' ? 'SEMI_FINISHED' : 'FINISHED';
            }
            next.tarif = autoTarif(e.employee_id, match.id, next.production_type);
          }
        }
        if (field === 'production_type') {
          next.tarif = autoTarif(e.employee_id, next.product_id, value);
        }
        return next;
      });
      return { ...e, items };
    }));
  };

  const addItem = (i) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i || e.items.length >= 4) return e;
      return { ...e, items: [...e.items, newItem()] };
    }));
  };

  const removeItem = (i, j) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i) return e;
      if (e.items.length === 1) return null;
      return { ...e, items: e.items.filter((_, jdx) => jdx !== j) };
    }).filter(Boolean));
  };

  const calcItemEarnings = (empId, item) => {
    const emp = empMap[empId];
    if (!emp || !item.quantity_produced) return 0;
    const qty = parseFloat(item.quantity_produced) || 0;
    if (item.tarif !== '' && parseFloat(item.tarif) >= 0) return qty * parseFloat(item.tarif);
    const p = prodMap[item.product_id];
    if (emp.type === 'STANOKCHI') {
      const rate = item.production_type === 'SEMI_FINISHED' ? (p?.stanokchi_semi_rate || 0) : (p?.stanokchi_rate || 0);
      return qty * rate;
    }
    if (emp.type === 'DETALCHI') return qty * (p?.detalchi_rate || 0);
    return qty * (emp.daily_tariff || 0);
  };

  const calcEarnings = (entry) => entry.items.reduce((s, item) => s + calcItemEarnings(entry.employee_id, item), 0);

  const saveBulk = () => {
    const valid = entries.flatMap(e =>
      e.items
        .filter(item => e.employee_id && parseFloat(item.quantity_produced) > 0)
        .map(item => {
          const emp = empMap[e.employee_id];
          let production_type = item.production_type || 'FINISHED';
          if (item.production_type === 'KOMPONENT' || prodMap[item.product_id]?.kind === 'KOMPONENT') production_type = 'KOMPONENT';
          else if (emp?.type === 'DETALCHI') production_type = 'SEMI_FINISHED';
          return {
            employee_id: e.employee_id,
            product_id: item.product_id,
            production_type,
            quantity_produced: parseFloat(item.quantity_produced),
            daily_tariff: item.tarif !== '' ? parseFloat(item.tarif) : undefined,
            rang: item.rang || null,
          };
        })
    );
    if (!valid.length) return toast.error('Kamida bitta xodim kiritilsin');
    bulkMutation.mutate({ production_date: date, entries: valid });
  };

  const canWrite = isOwner() || isProductionHead() || isKirimchi();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Ishlab Chiqarish</h1>
        <div className="flex gap-2">
          {isOwner() && (
            <button
              onClick={() => {
                if (confirm('Barcha kunlik ishlab chiqarish yozuvlari (hamma kun, hamma xodim) o\'chirilsinmi? Bu amalni qaytarib bo\'lmaydi!')) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending}
              className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 size={14} /> {deleteAllMutation.isPending ? 'O\'chirilmoqda...' : 'Hammasini o\'chirish'}
            </button>
          )}
          {canWrite && (
            <button onClick={() => { setEntries([{ employee_id: '', items: [newItem()] }]); setShowBulk(true); }}
              className="btn-primary btn-sm">
              <Plus size={14} /> Kunlik kiritish
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <div>
          <label className="label">Oy</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
        </div>
        <div>
          <label className="label">Kun</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
        </div>
      </div>

      {/* Month summary by employee */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{month} — Xodimlar natijalari</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Xodim</th><th>Turi</th><th>Ish kunlari</th><th>Jami ishlab chiqargan</th><th>Hisoblanган maosh</th></tr>
            </thead>
            <tbody>
              {!summary?.by_employee?.length ? (
                <tr><td colSpan={5} className="text-center py-6 text-gray-400">Ma'lumot yo'q</td></tr>
              ) : summary.by_employee.map(row => (
                <tr key={row.name}>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.work_days} kun</td>
                  <td>{fmt(row.total_produced)} dona</td>
                  <td className="font-semibold text-green-700">{fmt(row.total_earned)} so'm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Xodim tarixi — bitta xodimning barcha kiritilgan ishlari */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="label">Xodim tarixi</label>
            <select value={historyEmpId} onChange={e => setHistoryEmpId(e.target.value)} className="select w-64">
              <option value="">— Xodimni tanlang —</option>
              {(employees?.employees || []).map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}{e.type === 'DETALCHI' ? ' (Detalchi)' : e.type === 'STANOKCHI' ? ' (Stanokchi)' : ''}
                </option>
              ))}
            </select>
          </div>
          {historyEmpId && (
            <span className="text-sm text-gray-500">
              {empHistory?.production?.length || 0} ta yozuv ·
              Jami: <strong className="text-green-700">{fmt((empHistory?.production || []).reduce((s, r) => s + parseFloat(r.calculated_amount || 0), 0))} so'm</strong>
            </span>
          )}
        </div>

        {historyEmpId && (
          <div className="table-container">
            <table className="table text-sm">
              <thead>
                <tr><th>Sana</th><th>Mahsulot</th><th>Rang</th><th>Turi</th><th>Miqdor</th><th>Tarif</th><th>Haq</th><th>Holat</th></tr>
              </thead>
              <tbody>
                {!empHistory?.production?.length ? (
                  <tr><td colSpan={8} className="text-center py-6 text-gray-400">Yozuv yo'q</td></tr>
                ) : empHistory.production.map(row => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{new Date(row.production_date + 'T12:00:00').toLocaleDateString('uz-UZ')}</td>
                    <td>{row.product_name || '—'}</td>
                    <td>
                      {row.rang ? (
                        <span className="inline-flex items-center gap-1">
                          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: RANG_COLORS[row.rang] || '#999' }} />
                          {row.rang}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td>{row.production_type === 'KOMPONENT' ? '🔧 Komponent' : row.production_type === 'SEMI_FINISHED' ? 'Yarim' : row.production_type === 'FINISHED' ? 'Tayyor' : '—'}</td>
                    <td className="font-semibold">{fmt(row.quantity_produced)} dona</td>
                    <td className="text-gray-500">{fmt(row.daily_tariff)} so'm</td>
                    <td className="font-bold text-green-700">{fmt(row.calculated_amount)} so'm</td>
                    <td>
                      {row.approval_status === 'APPROVED'
                        ? <span className="badge-green">Tasdiqlangan</span>
                        : <span className="badge-yellow">Kutilmoqda</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Davr bo'yicha statistika — Stanokchi/Detalchi */}
      <div className="card" id="production-range-print">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-sm font-semibold text-gray-700">Davr bo'yicha statistika — Stanokchi/Detalchi</h2>
          <div className="flex gap-2">
            <button onClick={() => setCompactMode(m => !m)}
              className={`btn-sm rounded-lg px-3 flex items-center gap-1 border text-sm font-medium ${compactMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`}>
              {compactMode ? '≡ Batafsil' : '⊟ Jipslash'}
            </button>
            <button onClick={downloadRangeExcel} className="btn-secondary btn-sm">
              <Download size={14} /> Excel
            </button>
            <button onClick={() => window.print()} className="btn-secondary btn-sm">
              <Printer size={14} /> Chop etish
            </button>
          </div>
        </div>

        {/* Faqat chop etishda ko'rinadigan sarlavha */}
        <div className="hidden print:block mb-3">
          <h2 className="text-base font-bold">Ishlab chiqarish — Davr bo'yicha statistika</h2>
          <p className="text-sm text-gray-600">
            Davr: {new Date(rangeStart).toLocaleDateString('uz-UZ')} — {new Date(rangeEnd).toLocaleDateString('uz-UZ')}
            {shiftFilter && ` · Smena: ${shiftFilter === '1-SMENA' ? '1-Smena' : '2-Smena'}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 items-end no-print">
          <div>
            <label className="label">Boshlanish sanasi</label>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="input w-44" />
          </div>
          <div>
            <label className="label">Tugash sanasi</label>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="input w-44" />
          </div>
          <div>
            <label className="label">Smena (Stanokchi)</label>
            <div className="flex gap-1">
              {[
                { v: '', l: 'Hammasi' },
                { v: '1-SMENA', l: '1-Smena' },
                { v: '2-SMENA', l: '2-Smena' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => setShiftFilter(opt.v)}
                  className={`btn-sm rounded-lg px-3 ${shiftFilter === opt.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 no-print">
          <label className="flex items-center gap-2 mb-2 cursor-pointer w-fit">
            <input type="checkbox" checked={allSelected} onChange={toggleAllEmp} className="w-4 h-4" />
            <span className="text-sm font-medium text-gray-700">Hammasini belgilash</span>
          </label>
          {!piecemealEmployees.length ? (
            <span className="text-sm text-gray-400">Stanokchi/Detalchi xodim topilmadi</span>
          ) : (
            <div className="space-y-2">
              {stanokchiList.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Stanokchilar {shiftFilter && `(${shiftFilter === '1-SMENA' ? '1-Smena' : '2-Smena'})`}</p>
                  <div className="flex flex-wrap gap-2">
                    {stanokchiList.map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm cursor-pointer ${selectedEmpIds.includes(emp.id) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <input type="checkbox" checked={selectedEmpIds.includes(emp.id)} onChange={() => toggleOneEmp(emp.id)} className="w-3.5 h-3.5" />
                        {emp.name} <span className="text-xs opacity-60">({emp.shift === '2-SMENA' ? '2-Smena' : '1-Smena'})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {detalchiList.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Detalchilar (hammasi)</p>
                  <div className="flex flex-wrap gap-2">
                    {detalchiList.map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm cursor-pointer ${selectedEmpIds.includes(emp.id) ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <input type="checkbox" checked={selectedEmpIds.includes(emp.id)} onChange={() => toggleOneEmp(emp.id)} className="w-3.5 h-3.5" />
                        {emp.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {compactMode && rangeSummary?.summary?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Davr</th>
                  <th>Tanlangan xodimlar</th>
                  <th>Stanokchi ish kunlari</th>
                  <th>Stanokchi ishlab chiqargan</th>
                  <th>Stanokchi haq</th>
                  <th>Detalchi ish kunlari</th>
                  <th>Detalchi ishlab chiqargan</th>
                  <th>Detalchi haq</th>
                  <th className="bg-gray-50">Umumiy haq</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold bg-purple-50">
                  <td className="whitespace-nowrap text-gray-700">
                    {new Date(rangeStart + 'T12:00:00').toLocaleDateString('uz-UZ')} — {new Date(rangeEnd + 'T12:00:00').toLocaleDateString('uz-UZ')}
                  </td>
                  <td className="text-gray-600">{selectedEmpIds.length} ta</td>
                  <td className="text-blue-700">{sumField(rangeStanokchiRows, 'work_days')} kun</td>
                  <td className="text-blue-700">{fmt(sumField(rangeStanokchiRows, 'total_produced'))} dona</td>
                  <td className="text-blue-700">{fmt(sumField(rangeStanokchiRows, 'total_earned'))} so'm</td>
                  <td className="text-orange-700">{sumField(rangeDetalchiRows, 'work_days')} kun</td>
                  <td className="text-orange-700">{fmt(sumField(rangeDetalchiRows, 'total_produced'))} dona</td>
                  <td className="text-orange-700">{fmt(sumField(rangeDetalchiRows, 'total_earned'))} so'm</td>
                  <td className="text-green-700 text-base bg-gray-50">{fmt(sumField(rangeSummary.summary, 'total_earned'))} so'm</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Xodim</th><th>Turi</th><th>Ish kunlari</th><th>Jami ishlab chiqargan</th><th>Hisoblangan haq</th></tr>
              </thead>
              <tbody>
                {!selectedEmpIds.length ? (
                  <tr><td colSpan={5} className="text-center py-6 text-gray-400">Xodim tanlang</td></tr>
                ) : !rangeSummary?.summary?.length ? (
                  <tr><td colSpan={5} className="text-center py-6 text-gray-400">Ma'lumot yo'q</td></tr>
                ) : (
                  <>
                    {rangeStanokchiRows.map(row => (
                      <tr key={row.employee_id}>
                        <td className="font-medium">{row.name}</td>
                        <td>Stanokchi <span className="text-xs text-gray-400">({row.shift === '2-SMENA' ? '2-Smena' : '1-Smena'})</span></td>
                        <td>{row.work_days} kun</td>
                        <td>{fmt(row.total_produced)} dona</td>
                        <td className="font-semibold text-green-700">{fmt(row.total_earned)} so'm</td>
                      </tr>
                    ))}
                    {rangeStanokchiRows.length > 0 && (
                      <tr className="bg-blue-50/60 font-semibold">
                        <td colSpan={2}>Jami — Stanokchi{shiftFilter && ` (${shiftFilter === '1-SMENA' ? '1-Smena' : '2-Smena'})`}</td>
                        <td>{sumField(rangeStanokchiRows, 'work_days')} kun</td>
                        <td>{fmt(sumField(rangeStanokchiRows, 'total_produced'))} dona</td>
                        <td className="text-green-700">{fmt(sumField(rangeStanokchiRows, 'total_earned'))} so'm</td>
                      </tr>
                    )}
                    {rangeDetalchiRows.map(row => (
                      <tr key={row.employee_id}>
                        <td className="font-medium">{row.name}</td>
                        <td>Detalchi</td>
                        <td>{row.work_days} kun</td>
                        <td>{fmt(row.total_produced)} dona</td>
                        <td className="font-semibold text-green-700">{fmt(row.total_earned)} so'm</td>
                      </tr>
                    ))}
                    {rangeDetalchiRows.length > 0 && (
                      <tr className="bg-orange-50/60 font-semibold">
                        <td colSpan={2}>Jami — Detalchi (hammasi)</td>
                        <td>{sumField(rangeDetalchiRows, 'work_days')} kun</td>
                        <td>{fmt(sumField(rangeDetalchiRows, 'total_produced'))} dona</td>
                        <td className="text-green-700">{fmt(sumField(rangeDetalchiRows, 'total_earned'))} so'm</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
              {rangeSummary?.summary?.length > 0 && (
                <tfoot>
                  <tr className="font-semibold bg-gray-100">
                    <td colSpan={2}>Umumiy Jami</td>
                    <td>{sumField(rangeSummary.summary, 'work_days')} kun</td>
                    <td>{fmt(sumField(rangeSummary.summary, 'total_produced'))} dona</td>
                    <td className="text-green-700">{fmt(sumField(rangeSummary.summary, 'total_earned'))} so'm</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Daily detail */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {new Date(date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })} — Kunlik natijalar
        </h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Xodim</th><th>Mahsulot</th><th>Rang</th><th>Tur</th><th>Miqdor</th><th>Tarif</th><th>Hisoblangan</th>{canWrite && <th></th>}</tr>
            </thead>
            <tbody>
              {!daily?.production?.length ? (
                <tr><td colSpan={canWrite ? 8 : 7} className="text-center py-6 text-gray-400">Bu kun uchun ma'lumot yo'q</td></tr>
              ) : daily.production.map(row => (
                <tr key={row.id}>
                  <td className="font-medium">{row.employee_name}</td>
                  <td>{row.product_name || '—'}</td>
                  <td>
                    {row.rang ? (
                      <span className="flex items-center gap-1 text-sm">
                        <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: RANG_COLORS[row.rang] || '#999' }} />
                        {row.rang}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td>{row.production_type === 'KOMPONENT' ? '🔧 Komponent' : row.production_type === 'SEMI_FINISHED' ? 'Yarim tayyor' : row.production_type === 'FINISHED' ? 'Tayyor' : '—'}</td>
                  <td>{fmt(row.quantity_produced)} dona</td>
                  <td>{fmt(row.daily_tariff)} so'm/dona</td>
                  <td className="font-semibold text-green-700">{fmt(row.calculated_amount)} so'm</td>
                  {canWrite && (
                    <td>
                      <button
                        onClick={() => { if (confirm(`${row.employee_name} — ${fmt(row.quantity_produced)} dona o'chirilsinmi?`)) deleteMutation.mutate(row.id); }}
                        disabled={deleteMutation.isPending}
                        className="text-gray-300 hover:text-red-500 p-1"
                      ><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk entry panel */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBulk(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Kunlik Ishlab Chiqarish Kiritish</h3>
              <button onClick={() => setShowBulk(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">Sana: <strong>{new Date(date).toLocaleDateString('uz-UZ')}</strong></p>

            <div className="space-y-2">
              {/* Sarlavha */}
              <div className="flex gap-2 text-xs text-gray-400 font-medium px-1 ml-2">
                <span className="w-48 shrink-0">Xodim</span>
                <div className="grid grid-cols-12 gap-2 flex-1">
                  <span className="col-span-3">Mahsulot</span>
                  <span className="col-span-2">Rang</span>
                  <span className="col-span-2">Tur</span>
                  <span className="col-span-2 text-blue-500">Tarif</span>
                  <span className="col-span-2">Dona</span>
                  <span className="col-span-1"></span>
                </div>
              </div>

              {entries.map((entry, i) => {
                const emp = empMap[entry.employee_id];
                const isDetalchi = emp?.type === 'DETALCHI';
                const isStanokchi = emp?.type === 'STANOKCHI';
                return (
                  <div key={i} className={`p-2 rounded-lg border ${isDetalchi ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                    {/* Xodim qatori */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-48 shrink-0">
                        <select value={entry.employee_id} onChange={e => updateEntryEmp(i, e.target.value)} className="select text-sm w-full">
                          <option value="">Xodim tanlang</option>
                          {employees?.employees?.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} {emp.type === 'DETALCHI' ? '(D)' : emp.type === 'STANOKCHI' ? '(S)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1" />
                      {entry.items.length < 4 && (
                        <button onClick={() => addItem(i)} title="Mahsulot qo'shish"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1 bg-white">
                          <Plus size={12} /> Mahsulot
                        </button>
                      )}
                      <button onClick={() => setEntries(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 p-1"><X size={16} /></button>
                    </div>

                    {/* Mahsulotlar */}
                    <div className="space-y-1 ml-2">
                      {entry.items.map((item, j) => (
                        <div key={j} className="grid grid-cols-12 gap-2 items-center">
                          {/* Mahsulot */}
                          <div className="col-span-3">
                            <input
                              type="text"
                              list={`prod-list-${i}-${j}`}
                              value={item.prodSearch}
                              onChange={e => updateItem(i, j, 'prodSearch', e.target.value)}
                              placeholder="Mahsulot..."
                              className="input text-sm w-full"
                            />
                            <datalist id={`prod-list-${i}-${j}`}>
                              {(products?.products || []).map(p => (
                                <option key={p.id} value={p.name} />
                              ))}
                            </datalist>
                          </div>
                          {/* Rang — ishchi qaysi rangda chiqarganini tanlaydi */}
                          <div className="col-span-2">
                            <div className="flex items-center gap-1">
                              <select
                                value={item.rang}
                                onChange={e => updateItem(i, j, 'rang', e.target.value)}
                                className="select text-sm w-full"
                              >
                                <option value="">Rangsiz</option>
                                {RANGLAR.map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              {item.rang && <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[item.rang] || '#999', border:'1px solid #ccc' }} />}
                            </div>
                          </div>
                          {/* Tur — Tayyor / Yarim / Komponent (qo'lda tanlash mumkin) */}
                          <div className="col-span-2">
                            {isStanokchi ? (
                              <select value={item.production_type || 'FINISHED'} onChange={e => updateItem(i, j, 'production_type', e.target.value)} className="select text-sm w-full">
                                <option value="FINISHED">Tayyor</option>
                                <option value="SEMI_FINISHED">Yarim</option>
                                <option value="KOMPONENT">🔧 Komponent</option>
                              </select>
                            ) : isDetalchi ? (
                              <select value={item.production_type || 'SEMI_FINISHED'} onChange={e => updateItem(i, j, 'production_type', e.target.value)} className="select text-sm w-full">
                                <option value="SEMI_FINISHED">Yarim</option>
                                <option value="KOMPONENT">🔧 Komponent</option>
                              </select>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                          {/* Tarif */}
                          <div className="col-span-2">
                            <input
                              type="number" min="0" placeholder="so'm"
                              value={item.tarif}
                              onChange={e => updateItem(i, j, 'tarif', e.target.value)}
                              onFocus={e => e.target.select()}
                              className="input text-sm border-blue-200 focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                            />
                          </div>
                          {/* Miqdor */}
                          <div className="col-span-2">
                            <input
                              type="number" min="0" placeholder="dona"
                              value={item.quantity_produced}
                              onChange={e => updateItem(i, j, 'quantity_produced', e.target.value)}
                              onFocus={e => e.target.select()}
                              className="input text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                            />
                          </div>
                          {/* O'chirish */}
                          <div className="col-span-1 flex justify-end">
                            {entry.items.length > 1 && (
                              <button onClick={() => removeItem(i, j)} className="text-red-300 hover:text-red-500 p-1"><X size={14} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Jami hisoblangan maosh */}
            {entries.length > 0 && (
              <div className="mt-3 p-3 bg-green-50 rounded-lg flex justify-between items-center">
                <span className="text-sm text-gray-600">Jami hisoblangan:</span>
                <span className="font-bold text-green-700 text-lg">
                  {fmt(entries.reduce((sum, e) => sum + calcEarnings(e), 0))} so'm
                </span>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={addEntry} className="btn-secondary btn-sm">
                <Plus size={14} /> Xodim qo'shish
              </button>
              <button onClick={saveBulk} disabled={bulkMutation.isPending} className="btn-primary btn-sm ml-auto">
                <Save size={14} /> {bulkMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
