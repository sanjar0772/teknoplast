# TEKNOPLAST — Windows ilova (Desktop)

Bu Electron ilovasi TEKNOPLAST tizimini alohida Windows dasturi sifatida ochadi
(Railway serveriga ulanadi, ish stolida o'z oynasi va yorlig'i bo'ladi).

## 🛠️ O'rnatish (ishlab chiqaruvchi uchun)

```bash
cd desktop
npm install
```

## ▶️ Sinab ko'rish (ishga tushirish)

```bash
npm start
```

TEKNOPLAST oynasi ochiladi.

## 📦 .exe yasash (o'rnatuvchi fayl)

```bash
npm run dist
```

Tugagach, **`desktop/dist/`** papkasida:
- `TEKNOPLAST Setup 1.0.0.exe` — o'rnatuvchi fayl

Shu `.exe` ni boshqa kompyuterlarga berib o'rnatish mumkin.
O'rnatgandan keyin ish stolida **TEKNOPLAST** yorlig'i paydo bo'ladi.

## ⚙️ Sozlash

- **Sayt manzili:** `main.js` ichida `APP_URL` (hozir Railway).
  Yoki ishga tushirishda: `set TEKNOPLAST_URL=https://...` (Windows).
- **Mikrofon:** Ahmad ovozi uchun ruxsat avtomatik beriladi.

## 🖼️ Logotip (ixtiyoriy)

`icon.ico` faylini shu papkaga qo'shing va `package.json` → `build.win`
ichiga `"icon": "icon.ico"` qatorini qo'shing.

## ⚠️ Eslatma — Ahmad ovozli BUYRUQ (mikrofon → matn)

Electron'da brauzerning ichki ovoz-tanish xizmati (Google) ishlamaydi.
- ✅ **Ahmad GAPIRISHI** (ovozda javob) — ishlaydi
- ✅ **Matn, rasm, hisobot, barcha amallar** — ishlaydi
- ⚠️ **Mikrofon → matn** (ovozli buyruq) — desktopda cheklangan

To'liq ovozli buyruq desktopda kerak bo'lsa — server orqali (Groq Whisper)
transkripsiya qo'shish mumkin (keyingi bosqich).
