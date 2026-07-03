import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Scale, Truck, Printer, RotateCcw, Package, ArrowDown } from 'lucide-react';
import { COMPANY } from '../constants/company';
import { taroziAPI } from '../services/api';

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

const STORAGE_KEY = 'tarozi_recent_v1';
const COUNTER_KEY = 'tarozi_chek_no_v1';

// Sana/vaqtni mahalliy (UTC+5) ko'rinishda — toISOString ishlatmaymiz (timezone bug).
const nowLabel = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function TaroziPage() {
  const [mashina, setMashina] = useState('');
  const [mahsulot, setMahsulot] = useState('');
  const [brutto, setBrutto] = useState('');
  const [tara, setTara] = useState('');
  const [haydovchi, setHaydovchi] = useState('');
  const [recent, setRecent] = useState([]);
  const [serverMaxNo, setServerMaxNo] = useState(0);

  // Oxirgi cheklarni yuklash + serverdagi eng katta chek raqamini olish
  // (boshqa qurilmada ham raqam uzluksiz davom etsin)
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setRecent(Array.isArray(r) ? r : []);
    } catch { /* yo'q */ }
    taroziAPI.getAll().then(res => {
      const mx = parseInt(res.data?.max_no, 10) || 0;
      if (mx) setServerMaxNo(mx);
    }).catch(() => { /* server yo'q — localStorage bilan ishlaydi */ });
  }, []);

  const bruttoN = num(brutto);
  const taraN = num(tara);
  const netto = Math.max(0, bruttoN - taraN);

  // Keyingi chek raqami — localStorage va server maksimumidan kattasi + 1
  const chekNo = useMemo(() => {
    const n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) || 0;
    return Math.max(n, serverMaxNo) + 1;
  }, [recent, serverMaxNo]);

  const reset = () => {
    setMashina(''); setMahsulot(''); setBrutto(''); setTara(''); setHaydovchi('');
  };

  const validate = () => {
    if (!mashina.trim()) { toast.error('Mashina raqamini kiriting'); return false; }
    if (bruttoN <= 0) { toast.error("Yuk bilan og'irligini kiriting"); return false; }
    if (taraN <= 0) { toast.error('Tara (bo\'sh og\'irlik) ni kiriting'); return false; }
    if (bruttoN <= taraN) { toast.error("Yuk bilan og'irlik taradan katta bo'lishi kerak"); return false; }
    return true;
  };

  const handlePrint = () => {
    if (!validate()) return;
    // Chek raqamini oshirish va oxirgilar ro'yxatiga yozish
    const no = chekNo;
    localStorage.setItem(COUNTER_KEY, String(no));
    const entry = {
      no, mashina: mashina.trim(), mahsulot: mahsulot.trim(),
      haydovchi: haydovchi.trim(), brutto: bruttoN, tara: taraN, netto,
      vaqt: nowLabel(),
    };
    const next = [entry, ...recent].slice(0, 12);
    setRecent(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Serverga saqlash — admin (ega) cheklarni ko'rishi uchun. Xato bo'lsa ham chek chiqadi.
    taroziAPI.create({
      no, mashina: entry.mashina, mahsulot: entry.mahsulot, haydovchi: entry.haydovchi,
      brutto: bruttoN, tara: taraN, netto, sana: localDate(),
    }).then(() => setServerMaxNo(m => Math.max(m, no)))
      .catch(() => toast.error("Chek serverga saqlanmadi (internet?) — chop etildi"));
    // Chop etish — brauzer chek printerni tanlaydi
    setTimeout(() => window.print(), 60);
  };

  return (
    <div className="space-y-6">
      <div className="page-header print:hidden">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Scale size={22} className="text-blue-600" /> Tarozi
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Mashinani torting — yuk bilan og'irligi va tarani kiriting, jami (sof og'irlik) avtomatik hisoblanadi va chek chiqariladi.
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
              <label className="label flex items-center gap-1.5"><Truck size={14} /> Mashina raqami</label>
              <input value={mashina} onChange={e => setMashina(e.target.value.toUpperCase())}
                placeholder="01 A 123 BC"
                className="input text-lg font-semibold tracking-wide uppercase" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Package size={14} /> Mahsulot <span className="text-gray-400 font-normal">(ixtiyoriy)</span></label>
              <input value={mahsulot} onChange={e => setMahsulot(e.target.value)}
                placeholder="Masalan: granula, plastmassa..." className="input" />
            </div>
            <div>
              <label className="label">Haydovchi <span className="text-gray-400 font-normal">(ixtiyoriy)</span></label>
              <input value={haydovchi} onChange={e => setHaydovchi(e.target.value)}
                placeholder="Ism / familiya" className="input" />
            </div>
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
            <div className="flex justify-center text-gray-300"><ArrowDown size={20} /></div>
            <button onClick={handlePrint}
              className="btn-primary btn-lg w-full text-base shadow-lg shadow-blue-200">
              <Printer size={18} /> Chek chiqarish
            </button>
          </div>
        </div>

        {/* O'NG — natija paneli */}
        <div className="space-y-4">
          <div className="card bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 shadow-xl">
            <p className="text-sm text-blue-100">Jami — sof og'irlik (Netto)</p>
            <p className="text-5xl font-extrabold tracking-tight mt-2 leading-none">{fmt(netto)}</p>
            <p className="text-blue-100 mt-1 text-lg font-medium">kilogramm</p>
            <div className="mt-5 pt-4 border-t border-white/20 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-blue-100">Yuk bilan (Brutto)</span><span className="font-semibold">{fmt(bruttoN)} kg</span></div>
              <div className="flex justify-between"><span className="text-blue-100">Tara (bo'sh)</span><span className="font-semibold">− {fmt(taraN)} kg</span></div>
              <div className="flex justify-between border-t border-white/20 pt-2"><span className="text-blue-100">Mashina</span><span className="font-semibold">{mashina || '—'}</span></div>
            </div>
          </div>
          <div className="card-sm text-center text-xs text-gray-400">
            Keyingi chek raqami: <span className="font-semibold text-gray-600">№ {String(chekNo).padStart(4, '0')}</span>
          </div>
        </div>
      </div>

      {/* OXIRGI CHEKLAR */}
      {recent.length > 0 && (
        <div className="card print:hidden">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Oxirgi tortishlar</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left py-1.5">№</th>
                  <th className="text-left py-1.5">Vaqt</th>
                  <th className="text-left py-1.5">Mashina</th>
                  <th className="text-left py-1.5">Mahsulot</th>
                  <th className="text-right py-1.5">Brutto</th>
                  <th className="text-right py-1.5">Tara</th>
                  <th className="text-right py-1.5">Jami (sof)</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.no} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-400">{String(r.no).padStart(4, '0')}</td>
                    <td className="py-1.5 text-gray-500 whitespace-nowrap">{r.vaqt}</td>
                    <td className="py-1.5 font-medium">{r.mashina}</td>
                    <td className="py-1.5 text-gray-600">{r.mahsulot || '—'}</td>
                    <td className="py-1.5 text-right">{fmt(r.brutto)}</td>
                    <td className="py-1.5 text-right text-gray-500">{fmt(r.tara)}</td>
                    <td className="py-1.5 text-right font-bold text-blue-700">{fmt(r.netto)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== CHEK (faqat chop etishda ko'rinadi — 80mm) ===== */}
      <div id="tarozi-chek-print" className="hidden print:block bg-white text-black mx-auto"
        style={{ width: '80mm', fontFamily: "'Inter', monospace" }}>
        <div className="text-center pt-2 pb-1">
          <div className="font-bold text-[13px] leading-tight">{COMPANY.name}</div>
          <div className="text-[10px] leading-snug">{COMPANY.address}</div>
          <div className="text-[10px]">Тел: {COMPANY.phone}</div>
        </div>
        <div className="border-t border-dashed border-black my-1" />
        <div className="text-center font-bold text-[13px] tracking-wide">ТАРОЗИ ЧЕКИ</div>
        <div className="flex justify-between text-[11px] mt-1">
          <span>Чек №: {String(chekNo).padStart(4, '0')}</span>
          <span>{nowLabel()}</span>
        </div>
        <div className="border-t border-dashed border-black my-1" />

        <table className="w-full text-[12px]">
          <tbody>
            <tr><td className="py-0.5">Машина рақами</td><td className="py-0.5 text-right font-bold">{mashina}</td></tr>
            {mahsulot && <tr><td className="py-0.5">Маҳсулот</td><td className="py-0.5 text-right">{mahsulot}</td></tr>}
            {haydovchi && <tr><td className="py-0.5">Ҳайдовчи</td><td className="py-0.5 text-right">{haydovchi}</td></tr>}
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
          <span className="font-bold text-[13px]">ЖАМИ (соф)</span>
          <span className="font-extrabold text-[18px]">{fmt(netto)} кг</span>
        </div>
        <div className="border-t border-double border-black my-1" />

        <div className="text-[11px] mt-3 mb-1">Қабул қилди: ____________________</div>
        <div className="text-center text-[11px] font-semibold mt-2">Раҳмат!</div>
        <div className="text-center text-[9px] text-gray-500 mt-1 pb-2">TEKNOPLAST tarozi tizimi</div>
      </div>
    </div>
  );
}
