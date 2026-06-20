import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

// Avtomatik yangilanish: SPA ochiq qolganda yangi deploy o'zi yetib bormaydi —
// foydalanuvchi qo'lda F5 bosishi kerak edi. Bu hook har daqiqada va oyna
// fokuslanganda serverdagi yangi JS bundle nomini tekshiradi; o'zgargan bo'lsa
// (= yangi versiya chiqqan) sahifani avtomatik qayta yuklaydi. Agar foydalanuvchi
// shu payt biror maydonga yozayotgan bo'lsa — yangilamaydi, faqat ogohlantiradi.

// Hozir yuklangan (ishlayotgan) bundle nomini DOM script tegidan olamiz
function loadedBundle() {
  const el = document.querySelector('script[src*="/assets/index-"]');
  const m = el && el.getAttribute('src') && el.getAttribute('src').match(/index-[\w-]+\.js/);
  return m ? m[0] : null;
}

// Serverdagi eng yangi index.html ichidan bundle nomini olamiz (kesh ishlatmasdan)
async function latestBundle() {
  const res = await fetch(`/?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/\/assets\/(index-[\w-]+\.js)/);
  return m ? m[1] : null;
}

export default function useAutoUpdate() {
  const baseRef = useRef(loadedBundle());
  const notifiedRef = useRef(false);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      try {
        const latest = await latestBundle();
        if (!latest || stopped) return;
        // Dastlab baza nomini aniqlaymiz (dev rejimida null bo'lishi mumkin)
        if (!baseRef.current) { baseRef.current = latest; return; }
        if (latest === baseRef.current) return;

        // Yangi versiya topildi
        const a = document.activeElement;
        const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
        if (typing) {
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            toast('🔄 Yangi versiya tayyor. Ishingizni saqlab, sahifani yangilang.',
              { duration: 8000, id: 'app-update' });
          }
          return;
        }
        // Hech narsa yozilmayapti — xavfsiz, avtomatik yangilaymiz
        window.location.reload();
      } catch {
        // tarmoq xatosi — keyingi tekshiruvda qayta urinadi
      }
    };

    const id = setInterval(check, 60000);          // har 1 daqiqada
    const onFocus = () => check();                  // oynaga qaytganda
    window.addEventListener('focus', onFocus);
    const t = setTimeout(check, 8000);              // dastlabki tekshiruv (yuklanib bo'lgach)

    return () => {
      stopped = true;
      clearInterval(id);
      clearTimeout(t);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
