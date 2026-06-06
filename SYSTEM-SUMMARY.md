# 🏭 TEKNOPLAST ZAVODI - TULIK SISTEM XULOSA

**Tarikh:** 2024-06-06 | **Status:** ✅ KO'TAMMALASHTIRISH TUGALLANDI

---

## 📊 HOZIRDA NIMA BOR?

### 1. 🎯 PRODUCTION SYSTEM (ISHLAB CHIQARISH)
- ✅ **Stanokchi** (Mashina operatori) - Yarim-tayyor mahsulot
- ✅ **Detalchi** (Detali tayyorlash) - Tayyor mahsulot
- ✅ **Product-based salary** - Har bir mahsulot uchun alohida tarif

**Endpoints:**
```
POST   /api/production                 → Ishlab chiqarish ro'yxat
POST   /api/production/bulk            → O'pka ishlab chiqarish
GET    /api/production/daily/{date}    → Kunlik hisobot
```

---

### 2. 📥 INTAKE SYSTEM (KIRIMCHI - QA'BQO'LAYUVCHI)
- ✅ **KIRIMCHI** - Ishlab chiqarilgan mahsulotni qayd qiladi
- ✅ **Yarim tayyor vs Tayyor** - 2 darajali ishlab chiqarish
- ✅ **Approved** - Stanokchi/Detalchining salary avtomatik hisobi

**Endpoints:**
```
GET    /api/intakes/production/pending        → Tasdiqlanishni kutayotgan ishlar
POST   /api/intakes/production/record         → Bitta mahsulotni qayd qilish
POST   /api/intakes/production/record-bulk    → O'pka qayd qilish
GET    /api/intakes/production/recorded       → Qayd qilingan ishlar
```

---

### 3. 🛒 RAW MATERIALS SYSTEM (TAMINOTCHI - XOME ASHYO)
- ✅ **TAMINOTCHI** - Xom ashyo (raw materials) boshqaruvi
- ✅ **Auto expense** - Xom ashyo qo'shilsa avtomatik xarajat yaratiladi
- ✅ **Stock tracking** - Qolgan miqdor, minimal haraji

**Endpoints:**
```
POST   /api/products/raw-materials            → Xom ashyo qo'shish
PUT    /api/products/raw-materials/:id/stock  → Qoldiqni yangilash
GET    /api/products/raw-materials/list       → Xom ashyo ro'yxati
GET    /api/products/raw-materials/intake-history → Kirim tarixi
```

---

### 4. 💰 SALARY SYSTEM (OYLIK HISOBI)
- ✅ **Avtomatik hisoblash** - Barcha 36 xodim uchun
- ✅ **Soliq va ijtimoiy sug'urta** - 5% + 3% avtomatik chegirma
- ✅ **Bonus/Jarima** - Hisobchilar qo'sha oladi
- ✅ **Workflow:** Hisoblash → Surash → Tasdiqlash → To'lash → Chop

**Endpoints:**
```
POST   /api/salaries/calculate           → Oylik hisoblash
GET    /api/salaries/?month=2024-06      → Oylik ro'yxati
GET    /api/salaries/monthly/summary     → Jamlanma va hisobot
GET    /api/salaries/employee/:id        → Bir xodimning oylig'i
PUT    /api/salaries/:id/adjust          → Bonus/jarima qo'shish
PUT    /api/salaries/:id/approve         → Tasdiqlash
PUT    /api/salaries/:id/pay             → To'laganligini belgilash
GET    /api/salary-slip/:id              → Salary slip (HTML)
```

---

### 5. 📱 MOBILE APP (OMBORCHI - OMBOR BOSHQARUVCHISI)
- ✅ **Login** - JWT autentifikatsiya
- ✅ **Tab 1: Qayd qilish** - Ishlab chiqarilgan mahsulotni qayd qilish
- ✅ **Tab 2: Narx** - Mahsulot narxlari (stanokchi, detalchi, cost price)
- ✅ **Tab 3: Xom ashyo** - Xom ashyo va kirim tarixi
- ✅ **Offline ready** - Expo SDK 54

**Login credentials:**
```
Telefon:  +998906666666
Parol:    Ombor123!
```

---

### 6. 🖥️ ADMIN DASHBOARD (REACT FRONTEND)
- ✅ **Salaries page** - Oylik boshqaruv
- ✅ **Real-time updates** - API bilan sinxronizatsiya
- ✅ **Beautiful UI** - Modern, responsive design
- ✅ **Modal forms** - Bonus/jarima qo'shish

---

## 👥 ISHCHILAR (36 TA)

### Tur bo'yicha:
- **ISHCHI** - 25 ta (бухгалтер, уста, erdamchi, boshqa)
- **OSHPAZ** - 4 ta (Oshpazlar)
- **SHOFIR** - 4 ta (Shofirlar)
- **STANOKCHI** - 3 ta (Mashina operatorlari)

### Turlar:
```
бухгалтер (Hisobchi)
сифат (Sifat tekshiruvchi)
кол.центр (Call center)
ердамчи (Erdamchi)
дробилка (Crusher operatori)
электрик (Elektrikchi)
шофер (Shofir)
уста (Usta/Meister)
склад (Omborchi)
технолог (Texnolog)
ошпаз (Oshpaz/Kook)
охрана (Xavfsizlik)
```

---

## 🔐 FOYDALANUVCHILAR (8 TA)

```
OWNER:           +998901234567 / Admin123!           (Tizim egasi - barcha huquq)
OWNER:           +998901111111 / Owner123!           (Egasi - barcha huquq)
ACCOUNTANT:      +998902222222 / Accountant123!      (Hisobchi - oylik boshqaruvchi)
SALES_HEAD:      +998903333333 / Sales123!           (Savdo boshli)
PRODUCTION_HEAD: +998904444444 / Production123!      (Ishlab chiqarish boshli)
KIRIMCHI:        +998905555555 / Kirim123!           (QA'BQOLAYVCHI)
OMBORCHI:        +998906666666 / Ombor123!           (OMBOR BOSHQARUVCHI)
TAMINOTCHI:      +998907777777 / Taminot123!         (TAMINOTCHI)
```

---

## 🎯 WORKFLOW (QO'YADIGAN TARTIB)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. STANOKCHI/DETALCHI - ISHLAB CHIQARISH                   │
│    → Production database'ga qayd qilinadi                   │
│    → Quantity va date bilan                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. KIRIMCHI - QAYD QILISH                                  │
│    → pending production'larni ko'radi                       │
│    → Bulk select bilan qayd qiladi                         │
│    → Avtomatik salary hisoblash (rate × quantity)          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. TAMINOTCHI - XOM ASHYO                                  │
│    → Supplier'dan xom ashyo olinadi                        │
│    → Quantity va price bilan qo'shiladi                   │
│    → Avtomatik expense yaratiladi (cost)                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ACCOUNTANT - OYLIK HISOBLASH                            │
│    → Oyni tanlaydi (2024-06)                               │
│    → "Oylik Hisoblash" tugmasini bosadi                    │
│    → Brutto = production × product_rate                    │
│    → Netto = Brutto - Tax(5%) - Social(3%)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. ACCOUNTANT - BONUS/JARIMA                               │
│    → Agar bonus/jarima bo'lsa "Surash" tugmasini bosadi   │
│    → Bonus qo'shadi yoki jarima olib tashlaydi            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. OWNER - TASDIQLASH                                      │
│    → Hisobchilar tayyorlagan oylik ro'yxatini ko'radi      │
│    → Status: CALCULATED → APPROVED                         │
│    → "Tasdiqlash" tugmasini bosadi                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. OWNER - TO'LASH                                         │
│    → Status: APPROVED → PAID                               │
│    → "To'lash" tugmasini bosadi                            │
│    → Paid_date avtomatik yangilandi                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SALARY SLIP - CHOP/SHARE                                │
│    → Har bir xodim uchun HTML slip yaratiladi              │
│    → Print qilish mumkin                                    │
│    → Brutto, deductions, netto hammasi ko'rsatiladi       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 HISOB-KITOB FORMULA

```
BRUTTO = Ishlab chiqarish × Mahsulot narxi
         (agar stanokchi_rate bor bo'lsa)

SOLIQ = Brutto × 5%
IJTIMOIY_SUGURTA = Brutto × 3%

NETTO = Brutto - Soliq - Ijtimoiy_sugurta + Bonuslar - Jarimalar
```

**Misol - Stanokchi:**
```
Ishlab chiqarish: 100 dona
Mahsulot narxi:   25,000 UZS/dona
─────────────────────────────
Brutto:           2,500,000 UZS
Soliq (5%):      -  125,000
Sug'urta (3%):   -   75,000
─────────────────────────────
NETTO:            2,300,000 UZS
```

---

## 🔄 INTEGRATSIYALAR

### BACKEND (Express.js + Node)
```
✅ 8 ta default users (8 rol)
✅ JWT autentifikatsiya
✅ Role-Based Access Control (RBAC)
✅ Database migrations (xavfsiz update)
✅ Audit logging (barcha o'zgarishlar)
✅ Error handling (validatsiya)
✅ Cron jobs (backup, alerts)
```

### FRONTEND (React)
```
✅ Login page
✅ Dashboard
✅ Salaries page (yangi)
✅ Beautiful UI
✅ Real-time API sync
```

### MOBILE (React Native + Expo)
```
✅ Omborchi app
✅ 3 tabs (Qayd, Narx, Xom ashyo)
✅ JWT token storage
✅ Offline ready
✅ QR code scanner ready
```

---

## 📱 QANDAY TEST QILISH?

### 1. Backend ishlamoqda?
```bash
curl http://localhost:5000/api/health
```

### 2. Login test
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998902222222","password":"Accountant123!"}'
```

### 3. Oylik hisoblash
```bash
curl -X POST http://localhost:5000/api/salaries/calculate \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"month":"2024-06"}'
```

### 4. Salary slip ko'rish
```bash
# Browser'da: http://localhost:5000/api/salary-slip/{SALARY_ID}
# Salary ID olish:
curl -X GET "http://localhost:5000/api/salaries/?month=2024-06" \
  -H "Authorization: Bearer {TOKEN}"
```

---

## 🚀 DEPLOYMENT (RAILWAY)

```bash
# Barcha kod git'da
git add -A
git commit -m "Complete salary system with 36 employees"
git push origin main

# Railway avtomatik deploy qiladi
# Frontend: https://teknoplast-production.up.railway.app
# Backend: https://teknoplast-production.up.railway.app/api
```

---

## ✨ KEYINGI BOSQICHLAR (IXTIYORIY)

- [ ] **Attendance tracking** - Kun-sanab kelib-ketish
- [ ] **Advanced reports** - Excel/PDF export
- [ ] **Mobile app offline** - SQLite sync
- [ ] **Salary history** - Ko'nka oylik arkivi
- [ ] **Analytics dashboard** - Advanced charts
- [ ] **Mobile app publication** - Google Play + App Store
- [ ] **SMS notifications** - Salary updates
- [ ] **Voice-to-text** - Uzbek tiliga speech recognition

---

## 📚 DOCUMENTATION

```
/backend/API-OYLIK.md           ← Oylik API dokumentatsiya
/backend/API.md                 ← Boshqa API docs (agar bor)
/SYSTEM-SUMMARY.md              ← Bu file
```

---

## 🎯 STATISTIC

| Metrika | Qiymat |
|---------|--------|
| **Ishchilar** | 36 ta |
| **Rollar** | 8 ta |
| **API Endpoints** | 50+ ta |
| **Database Tables** | 15+ ta |
| **Mobile Screens** | 4 ta |
| **Frontend Pages** | 10+ ta |
| **Deployment** | Railway |

---

## 🏆 TAYIN QILINGAN VAZIFALAR

| Rol | Vazifa | Status |
|-----|--------|--------|
| **OWNER** | Tizim boshqaruvi, oylik tasdiqlash/to'lash | ✅ |
| **ACCOUNTANT** | Oylik hisoblash, bonus/jarima | ✅ |
| **PRODUCTION_HEAD** | Ishlab chiqarish boshqaruvi | ✅ |
| **KIRIMCHI** | Qayd qilish, approve | ✅ |
| **OMBORCHI** | Narx, xom ashyo boshqaruvi | ✅ |
| **TAMINOTCHI** | Xom ashyo kirim | ✅ |
| **SALES_HEAD** | Savdo statistikasi | ✅ |

---

## 💡 NOTES

- Barcha xarajatlar **UZS** da (O'zbekiston so'mi)
- Vaqt zonasi: **Asia/Tashkent**
- Database: **SQLite** (local) / **PostgreSQL** (production)
- Backup: **Kunlik soat 02:00 da**
- Token TTL: **24 hours**

---

**Tizim tayyor! 🎉 Hozir test qilib ko'ring!**

Savollar? Email: support@teknoplast.uz
