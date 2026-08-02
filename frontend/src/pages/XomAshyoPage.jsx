import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Boxes, Printer, RotateCcw, Package, ArrowDown, Cable, Unplug, Activity, User, Coins } from 'lucide-react';
import { COMPANY } from '../constants/company';
import { xomAshyoAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { useTaroziScale, serialSupported, BAUD_RATES, savedBaud } from '../utils/taroziSerial';

// Toshkent bo'yicha bugungi sana (YYYY-MM-DD) — UTC bug'siz
const localDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const num = (v) => {
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const STORAGE_KEY = 'xom_ashyo_recent_v1';
const COUNTER_KEY = 'xom_ashyo_akt_no_v1';

// Sana/vaqtni mahalliy (UTC+5) ko'rinishda — toISOString ishlatmaymiz (timezone bug).
const nowLabel = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function XomAshyoPage() {
  const user = useAuthStore((s) => s.user);
  const [sotuvchi, setSotuvchi] = useState('');
  const [oluvchi, setOluvchi] = useState(user?.full_name || '');
  const [mahsulot, setMahsulot] = useState('');
  const [brutto, setBrutto] = useState('');
  const [tara, setTara] = useState('');
  const [narx, setNarx] = useState('');       // kg narxi (so'm/kg)
  const [tolangan, setTolangan] = useState(''); // to'langan summa
  const [recent, setRecent] = useState([]);
  const [serverMaxNo, setServerMaxNo] = useState(0);
  const [saving, setSaving] = useState(false);

  // Tarozi indikatori (RS-232) — og'irlikni avtomatik o'qish
  const scale = useTaroziScale();
  const [baud, setBaud] = useState(savedBaud);
  const [diag, setDiag] = useState(false);

  // Oxirgi aktlarni yuklash + serverdagi eng katta akt raqamini olish
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setRecent(Array.isArray(r) ? r : []);
    } catch { /* yo'q */ }
    xomAshyoAPI.getAll().then(res => {
      const mx = parseInt(res.data?.max_no, 10) || 0;
      if (mx) setServerMaxNo(mx);
    }).catch(() => { /* server yo'q — localStorage bilan ishlaydi */ });
  }, []);

  // Oluvchi bo'sh bo'lsa — login qilgan foydalanuvchi ismini qo'yamiz
  useEffect(() => {
    if (!oluvchi && user?.full_name) setOluvchi(user.full_name);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const bruttoN = num(brutto);
  const taraN = num(tara);
  const netto = Math.max(0, bruttoN - taraN);
  const narxN = num(narx);
  const jami = Math.round(netto * narxN);       // netto × kg narxi
  const tolanganN = num(tolangan);
  const qoldiq = Math.max(0, jami - tolanganN);  // to'lanmagan qism

  // Keyingi akt raqami — localStorage va server maksimumidan kattasi + 1
  const aktNo = useMemo(() => {
    const n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) || 0;
    return Math.max(n, serverMaxNo) + 1;
  }, [recent, serverMaxNo]);

  const reset = () => {
    setSotuvchi(''); setMahsulot(''); setBrutto(''); setTara(''); setNarx(''); setTolangan('');
    setOluvchi(user?.full_name || '');
  };

  // Tarozida turgan og'irlikni maydonga ko'chirish
  const olish = (setter, nomi) => {
    if (scale.overload) { toast.error('Tarozida ortiqcha yuk (OL)'); return; }
    if (scale.kg === null) { toast.error("Tarozidan ma'lumot kelmayapti"); return; }
    const v = Math.round(scale.kg * 10) / 10;
    setter(String(v));
    toast.success(`${nomi}: ${fmt(v)} kg olindi`);
  };

  const validate = () => {
    if (!sotuvchi.trim()) { toast.error('Sotuvchi ismini kiriting'); return false; }
    if (bruttoN <= 0) { toast.error("Yuk bilan og'irligini kiriting"); return false; }
    if (taraN <= 0) { toast.error('Tara (bo\'sh og\'irlik) ni kiriting'); return false; }
    if (bruttoN <= taraN) { toast.error("Yuk bilan og'irlik taradan katta bo'lishi kerak"); return false; }
    if (narxN <= 0) { toast.error('Kg narxini kiriting'); return false; }
    if (tolanganN > jami) { toast.error("To'langan summa jamidan katta bo'lmasin"); return false; }
    return true;
  };

  const handlePrint = () => {
    if (!validate() || saving) return;
    setSaving(true);
    // Akt raqamini oshirish va oxirgilar ro'yxatiga yozish
    const no = aktNo;
    localStorage.setItem(COUNTER_KEY, String(no));
    const entry = {
      no, sotuvchi: sotuvchi.trim(), oluvchi: oluvchi.trim(), mahsulot: mahsulot.trim(),
      brutto: bruttoN, tara: taraN, netto, narx_kg: narxN, summa: jami, tolangan: tolanganN, qoldiq,
      vaqt: nowLabel(),
    };
    const next = [entry, ...recent].slice(0, 12);
    setRecent(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Serverga saqlash — akt + avtomatik xarajat (RAW_MATERIAL, jami summa). Xato bo'lsa ham akt chiqadi.
    xomAshyoAPI.create({
      no, sotuvchi: entry.sotuvchi, oluvchi: entry.oluvchi, mahsulot: entry.mahsulot,
      brutto: bruttoN, tara: taraN, netto, narx_kg: narxN, summa: jami, tolangan: tolanganN, sana: localDate(),
    }).then(() => {
      setServerMaxNo(m => Math.max(m, no));
      toast.success('Qabul akti saqlandi va xarajatga yozildi');
    }).catch(() => toast.error('Akt serverga saqlanmadi (internet?) — chop etildi'))
      .finally(() => setSaving(false));
    // Chop etish
    setTimeout(() => window.print(), 60);
  };

  return (
    <div className="space-y-6">
      <div className="page-header print:hidden">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Boxes size={22} className="text-blue-600" /> Xom ashyo qabul qilish
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sotuvchidan xom ashyoni torting — brutto va tarani kiriting, kg narxini belgilang (jami avtomatik).
            To'langan summani kiriting, qoldiq o'zi hisoblanadi. Akt ikkala imzo joyi bilan chiqadi; jami summa xarajatga yoziladi.
          </p>
        </div>
        <button onClick={reset} className="btn-secondary btn-sm">
          <RotateCcw size={14} /> Tozalash
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        {/* CHAP — kiritish */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="label flex items-center gap-1.5"><User size={14} /> Sotuvchi (kimdan olindi)</label>
              <input value={sotuvchi} onChange={e => setSotuvchi(e.target.value)}
                placeholder="Sotuvchi ism / familiya yoki tashkilot"
                className="input text-base font-semibold" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><User size={14} /> Oluvchi (qabul qildi)</label>
              <input value={oluvchi} onChange={e => setOluvchi(e.target.value)}
                placeholder="Qabul qilgan xodim" className="input" />
              <p className="text-xs text-gray-400 mt-1">Tizimga kirgan xodim avtomatik qo'yildi — o'zgartirsa bo'ladi.</p>
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Package size={14} /> Xom ashyo nomi <span className="text-gray-400 font-normal">(ixtiyoriy)</span></label>
              <input value={mahsulot} onChange={e => setMahsulot(e.target.value)}
                placeholder="Masalan: granula, drobilka, plastmassa..." className="input" />
            </div>
          </div>

          {/* TAROZI INDIKATORI — RS-232 orqali avtomatik o'qish */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Cable size={15} className="text-blue-600" /> Tarozi indikatori
              </h2>
              {scale.connected ? (
                <span className={scale.stable ? 'badge-green' : 'badge-yellow'}>
                  {scale.stable ? 'Barqaror' : 'Tebranmoqda'}
                </span>
              ) : (
                <span className="badge-gray">Ulanmagan</span>
              )}
            </div>

            {!serialSupported() ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                Bu brauzer tarozini o'qiy olmaydi. Kompyuterda <b>Google Chrome</b> yoki{' '}
                <b>Microsoft Edge</b> dan foydalaning. Og'irliklarni qo'lda ham kiritsa bo'ladi.
              </p>
            ) : !scale.connected ? (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Tezlik (baud)</label>
                  <select value={baud} onChange={e => setBaud(parseInt(e.target.value, 10))}
                    className="select w-32">
                    {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <button onClick={() => scale.connect(baud)} disabled={scale.busy} className="btn-primary">
                  <Cable size={16} /> {scale.busy ? 'Ulanmoqda...' : 'Tarozini ulash'}
                </button>
                <p className="text-xs text-gray-400 basis-full">
                  Tugmani bosgach chiqadigan ro'yxatdan USB↔RS-232 shnurni (COM port) tanlang.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-900 text-white px-4 py-3">
                  <span className="text-xs text-gray-400">Tarozida hozir</span>
                  <span className="text-3xl font-extrabold tabular-nums">
                    {scale.overload ? 'OL' : scale.kg === null ? '—' : fmt(scale.kg)}
                    <span className="text-base font-medium text-gray-400 ml-1">kg</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => olish(setBrutto, 'Brutto')} className="btn-success">
                    <ArrowDown size={15} /> Brutto ga olish
                  </button>
                  <button onClick={() => olish(setTara, 'Tara')} className="btn-secondary">
                    <ArrowDown size={15} /> Tara ga olish
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => setDiag(d => !d)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    <Activity size={12} /> Diagnostika
                  </button>
                  <button onClick={scale.disconnect} className="btn-secondary btn-sm">
                    <Unplug size={13} /> Uzish
                  </button>
                </div>
              </>
            )}

            {scale.error && <p className="text-sm text-red-600">{scale.error}</p>}

            {diag && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-2 max-h-40 overflow-auto">
                <p className="text-[10px] text-gray-400 mb-1">Indikatordan kelayotgan xom ma'lumot:</p>
                {scale.log.length === 0
                  ? <p className="text-xs text-gray-400">Hali ma'lumot kelmadi.</p>
                  : scale.log.map((l, i) => (
                    <div key={`${l.t}-${i}`} className="text-[10px] font-mono text-gray-600 border-b border-gray-100 py-0.5">
                      <span className="text-gray-800">{l.line}</span>
                      <span className="text-gray-400 ml-2">{l.hex}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Yuk bilan og'irligi (Brutto)</label>
                <div className="relative">
                  <input value={brutto} onChange={e => setBrutto(e.target.value)} inputMode="decimal"
                    placeholder="0" className="input text-right text-xl font-bold pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">kg</span>
                </div>
              </div>
              <div>
                <label className="label">Tara (bo'sh og'irlik)</label>
                <div className="relative">
                  <input value={tara} onChange={e => setTara(e.target.value)} inputMode="decimal"
                    placeholder="0" className="input text-right text-xl font-bold pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">kg</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label flex items-center gap-1.5"><Coins size={14} /> Kg narxi</label>
                <div className="relative">
                  <input value={narx} onChange={e => setNarx(e.target.value)} inputMode="decimal"
                    placeholder="0" className="input text-right text-xl font-bold pr-16" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">so'm/kg</span>
                </div>
              </div>
              <div>
                <label className="label">Jami (netto × narx)</label>
                <div className="input text-right text-xl font-extrabold bg-gray-50 text-emerald-700">
                  {fmt(jami)} <span className="text-sm font-medium text-gray-400">so'm</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">To'landi</label>
                <div className="relative">
                  <input value={tolangan} onChange={e => setTolangan(e.target.value)} inputMode="decimal"
                    placeholder="0" className="input text-right text-xl font-bold pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">so'm</span>
                </div>
                <button type="button" onClick={() => setTolangan(String(jami))}
                  className="text-xs text-blue-600 hover:underline mt-1">To'liq to'landi</button>
              </div>
              <div>
                <label className="label">Qoldiq (to'lanmagan)</label>
                <div className={`input text-right text-xl font-extrabold bg-gray-50 ${qoldiq > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {fmt(qoldiq)} <span className="text-sm font-medium text-gray-400">so'm</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center text-gray-300"><ArrowDown size={20} /></div>
            <button onClick={handlePrint} disabled={saving}
              className="btn-primary btn-lg w-full text-base shadow-lg shadow-blue-200">
              <Printer size={18} /> {saving ? 'Saqlanmoqda...' : 'Aktni chiqarish'}
            </button>
          </div>
        </div>

        {/* O'NG — natija paneli */}
        <div className="space-y-4">
          <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 shadow-xl">
            <p className="text-sm text-blue-100">Sof og'irlik (Netto)</p>
            <p className="text-5xl font-extrabold tracking-tight mt-2 leading-none">{fmt(netto)}</p>
            <p className="text-blue-100 mt-1 text-lg font-medium">kilogramm</p>
            <div className="mt-5 pt-4 border-t border-white/20 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-blue-100">Yuk bilan (Brutto)</span><span className="font-semibold">{fmt(bruttoN)} kg</span></div>
              <div className="flex justify-between"><span className="text-blue-100">Tara (bo'sh)</span><span className="font-semibold">− {fmt(taraN)} kg</span></div>
              <div className="flex justify-between border-t border-white/20 pt-2"><span className="text-blue-100">Sotuvchi</span><span className="font-semibold">{sotuvchi || '—'}</span></div>
              <div className="flex justify-between"><span className="text-blue-100">Oluvchi</span><span className="font-semibold">{oluvchi || '—'}</span></div>
            </div>
          </div>
          {/* SUMMA — jami / to'landi / qoldiq */}
          <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0 shadow-xl">
            <p className="text-sm text-emerald-100">Jami summa {narxN > 0 && <span className="opacity-80">({fmt(netto)} kg × {fmt(narxN)})</span>}</p>
            <p className="text-4xl font-extrabold tracking-tight mt-1 leading-none">{fmt(jami)}</p>
            <p className="text-emerald-100 mt-1 text-base font-medium">so'm</p>
            <div className="mt-4 pt-3 border-t border-white/20 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-emerald-100">To'landi</span><span className="font-semibold">{fmt(tolanganN)} so'm</span></div>
              <div className="flex justify-between"><span className="text-emerald-100">Qoldiq (to'lanmagan)</span><span className="font-bold">{fmt(qoldiq)} so'm</span></div>
            </div>
          </div>
          <div className="card-sm text-center text-xs text-gray-400">
            Keyingi akt raqami: <span className="font-semibold text-gray-600">№ {String(aktNo).padStart(4, '0')}</span>
          </div>
        </div>
      </div>

      {/* OXIRGI AKTLAR */}
      {recent.length > 0 && (
        <div className="card print:hidden">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Oxirgi qabullar</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left py-1.5">№</th>
                  <th className="text-left py-1.5">Vaqt</th>
                  <th className="text-left py-1.5">Sotuvchi</th>
                  <th className="text-left py-1.5">Xom ashyo</th>
                  <th className="text-right py-1.5">Brutto</th>
                  <th className="text-right py-1.5">Tara</th>
                  <th className="text-right py-1.5">Netto</th>
                  <th className="text-right py-1.5">Jami</th>
                  <th className="text-right py-1.5">To'landi</th>
                  <th className="text-right py-1.5">Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.no} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-400">{String(r.no).padStart(4, '0')}</td>
                    <td className="py-1.5 text-gray-500 whitespace-nowrap">{r.vaqt}</td>
                    <td className="py-1.5 font-medium">{r.sotuvchi}</td>
                    <td className="py-1.5 text-gray-600">{r.mahsulot || '—'}</td>
                    <td className="py-1.5 text-right">{fmt(r.brutto)}</td>
                    <td className="py-1.5 text-right text-gray-500">{fmt(r.tara)}</td>
                    <td className="py-1.5 text-right font-bold text-blue-700">{fmt(r.netto)} kg</td>
                    <td className="py-1.5 text-right font-bold text-emerald-700">{fmt(r.summa)}</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(r.tolangan || 0)}</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">{fmt(r.qoldiq || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== AKT (faqat chop etishda ko'rinadi — 80mm) ===== */}
      <div id="xom-ashyo-akt-print" className="hidden print:block bg-white text-black mx-auto"
        style={{ width: '80mm', fontFamily: "'Inter', monospace" }}>
        <div className="text-center pt-2 pb-1">
          <div className="font-bold text-[13px] leading-tight">{COMPANY.name}</div>
          <div className="text-[10px] leading-snug">{COMPANY.address}</div>
          <div className="text-[10px]">Тел: {COMPANY.phone}</div>
        </div>
        <div className="border-t border-dashed border-black my-1" />
        <div className="text-center font-bold text-[13px] tracking-wide">ХОМ АШЁ ҚАБУЛ АКТИ</div>
        <div className="flex justify-between text-[11px] mt-1">
          <span>Акт №: {String(aktNo).padStart(4, '0')}</span>
          <span>{nowLabel()}</span>
        </div>
        <div className="border-t border-dashed border-black my-1" />

        <table className="w-full text-[12px]">
          <tbody>
            <tr><td className="py-0.5">Сотувчи</td><td className="py-0.5 text-right font-bold">{sotuvchi}</td></tr>
            <tr><td className="py-0.5">Олувчи</td><td className="py-0.5 text-right">{oluvchi || '—'}</td></tr>
            {mahsulot && <tr><td className="py-0.5">Хом ашё</td><td className="py-0.5 text-right">{mahsulot}</td></tr>}
          </tbody>
        </table>
        <div className="border-t border-dashed border-black my-1" />

        <table className="w-full text-[12px]">
          <tbody>
            <tr><td className="py-0.5">Юк билан (Брутто)</td><td className="py-0.5 text-right font-semibold">{fmt(bruttoN)} кг</td></tr>
            <tr><td className="py-0.5">Тара (бўш)</td><td className="py-0.5 text-right font-semibold">{fmt(taraN)} кг</td></tr>
          </tbody>
        </table>
        <div className="border-t border-double border-black my-1" />
        <div className="flex justify-between items-baseline px-0.5">
          <span className="font-bold text-[13px]">СОФ (Нетто)</span>
          <span className="font-extrabold text-[18px]">{fmt(netto)} кг</span>
        </div>
        <div className="border-t border-double border-black my-1" />

        {/* НАРХ ва СУММА */}
        <table className="w-full text-[12px]">
          <tbody>
            <tr><td className="py-0.5">Кг нархи</td><td className="py-0.5 text-right font-semibold">{fmt(narxN)} сўм/кг</td></tr>
            <tr><td className="py-0.5 font-bold">ЖАМИ</td><td className="py-0.5 text-right font-bold">{fmt(jami)} сўм</td></tr>
            <tr><td className="py-0.5">Тўланди</td><td className="py-0.5 text-right font-semibold">{fmt(tolanganN)} сўм</td></tr>
          </tbody>
        </table>
        <div className="border-2 border-black rounded-md mt-1.5 py-1.5 px-1.5 text-center">
          <div className="text-[11px] font-semibold">ҚОЛДИҚ (тўланмаган)</div>
          <div className="font-extrabold text-[24px] leading-none mt-0.5">{fmt(qoldiq)}</div>
          <div className="text-[11px] font-semibold">сўм</div>
        </div>

        {/* ИМЗОЛАР */}
        <div className="mt-4 space-y-3 text-[11px]">
          <div>
            <div>Сотувчи имзо: ____________________</div>
            <div className="text-[9px] text-gray-500 mt-0.5">({sotuvchi})</div>
          </div>
          <div>
            <div>Олувчи имзо: ____________________</div>
            <div className="text-[9px] text-gray-500 mt-0.5">({oluvchi || '—'})</div>
          </div>
        </div>

        <div className="text-center text-[11px] font-semibold mt-3">Раҳмат!</div>
        <div className="text-center text-[9px] text-gray-500 mt-1 pb-2">TEKNOPLAST хом ашё тизими</div>
      </div>
    </div>
  );
}
