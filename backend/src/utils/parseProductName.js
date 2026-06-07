/**
 * Mahsulot nomidan RANG (lotin) va RAZMER (sort/nav) ni ajratib oladi.
 * Kirill nomlar uchun: "... / кизил", "... ок 2сорт", "Барг тувак яшил" kabi.
 *
 * MUHIM: bu funksiya `name` ni o'zgartirmaydi — faqat base_name / rang / razmer
 * yordamchi ustunlarini hisoblaydi (Smart Grid'da rang ustuni bo'yicha filtr/qidiruv uchun).
 */

// Kirill rang so'zi -> Lotin (o'zbekcha) rang
const COLOR_MAP = {
  'кизил': 'qizil', 'қизил': 'qizil', 'кизл': 'qizil',
  'яшил': 'yashil', 'яшл': 'yashil',
  'кок': "ko'k", 'кўк': "ko'k",
  'ок': 'oq', 'оқ': 'oq',
  'кора': 'qora', 'қора': 'qora',
  'сарик': 'sariq', 'сариқ': 'sariq',
  'пушти': 'pushti',
  'серий': 'kulrang', 'сери': 'kulrang', 'серый': 'kulrang', 'сер': 'kulrang',
  'хаво': 'havorang', 'ҳаво': 'havorang',
  'ментол': 'mentol',
  'фиолетвий': 'binafsha', 'фиолетовый': 'binafsha', 'фиолет': 'binafsha',
  'оранжевий': "to'q sariq", 'оранжевый': "to'q sariq",
  'шаффоф': 'shaffof', 'шафоф': 'shaffof',
  'кулранг': 'kulrang',
};

// Lotin ranglar ro'yxati (frontend dropdown bilan mos)
const LATIN_COLORS = ['oq', 'shaffof', "ko'k", 'qizil', 'yashil', 'sariq', 'qora',
  'kulrang', 'pushti', 'havorang', 'mentol', 'binafsha', 'och yashil', 'och sariq', "to'q sariq"];

// "оч яшил" (och) yoki "тўқ ..." (to'q) modifikatorlari bilan rang so'zini tahlil qiladi
function parseColorPhrase(phrase) {
  let s = (phrase || '').toLowerCase().trim();
  if (!s) return null;
  let prefix = '';
  if (/^оч\s+/.test(s)) { prefix = 'och '; s = s.replace(/^оч\s+/, '').trim(); }
  else if (/^(тўқ|тук|туқ)\s+/.test(s)) { prefix = "to'q "; s = s.replace(/^(тўқ|тук|туқ)\s+/, '').trim(); }
  const base = COLOR_MAP[s];
  if (!base) return null;
  return (prefix + base).trim();
}

// "2 сорт", "2сорт", "(2 сорт)", "1,5 сорт" -> { grade:"2-sort", rest:"..." }
function extractGrade(text) {
  const m = (text || '').match(/(\d+(?:[.,]\d+)?)\s*-?\s*сорт/i);
  if (m) {
    return {
      grade: m[1].replace('.', ',') + '-sort',
      rest: text.replace(m[0], ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  return { grade: null, rest: text };
}

function parseProductName(rawName) {
  const name = (rawName || '').trim();
  if (!name) return null;
  let rang = null, razmer = null, base = name;

  const slash = name.lastIndexOf('/');
  if (slash >= 0) {
    // "/" dan keyingi qism — rang (ehtimol grade bilan)
    const left = name.slice(0, slash).trim();
    const g = extractGrade(name.slice(slash + 1).trim());
    if (g.grade) razmer = g.grade;
    const color = parseColorPhrase(g.rest);
    if (color) { rang = color; base = left; }
    else if (g.grade) { base = left; }   // grade bor, lekin rang noaniq
    else base = name;                     // o'ng tomon rang emas — ajratmaymiz
  } else {
    // "/" yo'q — oxiridagi rang so'zini qidiramiz
    const g = extractGrade(name);
    if (g.grade) razmer = g.grade;
    const tokens = g.rest.split(/\s+/);
    let found = null, cut = 0;
    if (tokens.length >= 2) { const c2 = parseColorPhrase(tokens.slice(-2).join(' ')); if (c2) { found = c2; cut = 2; } }
    if (!found && tokens.length >= 1) { const c1 = parseColorPhrase(tokens.slice(-1)[0]); if (c1) { found = c1; cut = 1; } }
    if (found) { rang = found; base = tokens.slice(0, tokens.length - cut).join(' ').trim(); }
    else base = g.grade ? g.rest.trim() : name;
  }

  if (!base) base = name;
  return { rang, razmer, base_name: base };
}

module.exports = { parseProductName, COLOR_MAP, LATIN_COLORS };
