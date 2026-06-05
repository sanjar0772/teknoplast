# 🏭 TEKNOPLAST - Hisob-Kitob va Boshqaruv Tizimi
## Detalliy Texnik Specifikatsiya

---

## 📌 **1. TIZIM HAQIDA**

| Parametr | Qiymat |
|----------|--------|
| **Loyiha Nomi** | Teknoplast Hisob-Kitob Tizimi |
| **Maqsad** | Ishlab chiqarish, sotuv, hisob-kitob boshqaruvi |
| **Til** | Uzbek (Kirill) |
| **Frontend** | React (Web) + React Native (iOS/Android) |
| **Backend** | Node.js/Python + Express/FastAPI |
| **Database** | PostgreSQL |
| **Deploy** | Local (ilk) → VPS (keyinroq) |

---

## 👥 **2. FOYDALANUVCHI ROLLARI VA HUQUQLARI**

### **2.1 Ega/Rahbar (Owner/Manager)**
- **Huquqi**: To'liq kirish (Full Access)
- **Imkoniyatlari**:
  - ✅ Barcha hisobtlarni ko'rish
  - ✅ Barcha siyasat va tariffalarni o'zgartirish
  - ✅ Foydalanuvchilar qo'shish/o'chirish
  - ✅ Oylik hisobi (chastiladon/oylik) tasdiqlash
  - ✅ Xulosa reportlar (Dashboard)

### **2.2 Buxgalter (Accountant)**
- **Huquqi**: Hisob-kitob va oylik boshqaruvi
- **Imkoniyatlari**:
  - ✅ Oylik kalkulyatsiya va taqsimlab berish
  - ✅ Xarajatlar ro'yxati
  - ✅ Kirim-chiqim hisobi
  - ✅ Ombor mahsulotlari balansi
  - ❌ Narx o'zgartirish mumkin emas
  - ❌ Qo'shimcha foydalanuvchi qo'sha olmaydi

### **2.3 Sotuv Bolimi Boshlig'i (Sales Head)**
- **Huquqi**: Sotuv ma'lumotlari
- **Imkoniyatlari**:
  - ✅ Sotuv tarixini ko'rish
  - ✅ Mahsulot narxlarini ko'rish
  - ✅ Chegirmalarni o'rnatish (Ega tasdiqlashiga qarab)
  - ✅ Sotilgan mahsulot statistikasi
  - ❌ Xom ashyolar to'g'risida ma'lumot ko'ra olmaydi
  - ❌ Oylik hisobi o'zgartirolmaydi

### **2.4 Ishlab Chiqarish Boshlig'i (Production Head)**
- **Huquqi**: Ishlab chiqarish boshqaruvi
- **Imkoniyatlari**:
  - ✅ Xom ashyolar (Raw Materials) - kirim/chiqim
  - ✅ Mahsulot (Products) - miqdor, tur
  - ✅ Mashinalar holati (Machines status)
  - ✅ Ishlab chiqarish reporti
  - ✅ Xodimlar ishlab chiqarish (Piece-rate) ko'rish
  - ❌ Narxlar o'zgartirolmaydi
  - ❌ Sotuv ma'lumotini o'zgartirolmaydi

---

## 🎯 **3. ASOSIY MODULLAR (Features)**

### **3.1 Autentifikatsiya (Authentication)**
```
- Login/Logout
- Phone + Password (Uzbek formati)
- Session Management
- Role-based Access Control (RBAC)
- Password Reset
```

### **3.2 Dashboard (Bosh Sahifa)**
**Ega/Rahbar uchun:**
- 📊 Bugun sotuv (Today's sales)
- 📊 Bu oyda jami kirim
- 📊 Xodimlar soni
- 📊 Omborning holati

**Har bir rol uchun o'ziga xos Dashboard**

### **3.3 Hisob-Kitob Modulı (Accounting)**

#### **3.3.1 Oylik Kalkulyatsiyasi (Salary Calculation)**
```
Ustun Formula: 
- Har ishchi uchun kunlik tariff (piece-rate)
- Ishlab chiqargan mahsulot miqdori × narx
- Soatlar × soat tarifi
- Bonus/Jarima (agar bor)

Jaadval:
- Oyning 1-25 sanasida ishlab chiqarish
- 26-31 sanasida sonlarni tasdiq
- Oyning oxirida oylik chiqarish
```

#### **3.3.2 Xarajatlar (Expenses)**
```
Turlar:
- Xom ashyo (Raw Materials)
- Energiya (Electricity, Gas)
- Texnik xizmat
- Boshqa xarajatlar
```

#### **3.3.3 Kirim-Chiqim Hisobi (Income/Expense Report)**
```
Ko'rinishi:
- Oylik kirim (jami sotuv)
- Oylik chiqim (oylik + xarajatlar)
- Sof foyda (Profit)
- Grafik (Graph)
```

### **3.4 Sotuv Modulı (Sales)**

#### **3.4.1 Sotuv Registri (Sales Registry)**
```
Ustunlar:
- Sana
- Mahsulot nomi
- Miqdor
- Narx (birlik)
- Jami qiymat
- Keluvchi (Customer name)
- Status (Tolandi/Qoldiq)
```

#### **3.4.2 Narxlar (Pricing)**
```
O'zgartirinalar:
- Mahsulot → Narx
- Faqat Ega tasdiqlashiga qarab
- Tarix (History) saqlanadi
```

#### **3.4.3 Chegirmalar (Discounts)**
```
Turlari:
- Foizli chegirma (%)
- Qat'iy chegirma (Sum)
- Asosiy sabablar
```

### **3.5 Ishlab Chiqarish Modulı (Production)**

#### **3.5.1 Xom Ashyolar (Raw Materials)**
```
Ma'lumotlar:
- Nomi (Plastic type, etc.)
- Miqdori (Kg/Ton)
- Kirim sanasi
- Qo'llash sanasi
- Qoldiq (Balance)
- Narxi
```

#### **3.5.2 Mahsulotlar (Products)**
```
Ma'lumotlar:
- Nomi
- Turi (Tug'ma/Yasovchi)
- Ishlab chiqarish soni/kun
- Qoldiq omborda
- Narxi
- Brend (Xom ashyolar)
```

#### **3.5.3 Mashinalar (Machines)**
```
Ma'lumotlar:
- Nomi
- Holati (Ishlayapti/Buzilgan/Xizmat)
- Oxirgi xizmat sanasi
- Stanokchi (Operator)
- Ishlab chiqarish miqdori (daily)
```

#### **3.5.4 Xodimlar Ishlab Chiqarish (Worker Production)**
```
Ko'rinishi:
- Xodim nomi
- Turi (Stanokchi/Ishchi/Oshpaz/Shofir)
- Ishlab chiqarish soni (bugun/bu oyda)
- Kunlik tariff
- Jami hisoblanuvchi pul
```

### **3.6 Omborni Boshqarish (Inventory)**
```
- Mahsulotlar balansi
- Xom ashyolar miqdori
- Qaytarilgan (Return) mahsulotlar
- Ombor historiyasi
- Perishable warning (agar uzun turgan bo'lsa)
```

### **3.7 Reportlar (Reports)**

#### **3.7.1 Oylik Report**
```
- Jami sotuv
- Jami xarajat
- Sof foyda
- Ishlab chiqarish miqdori
- Xodimlar soni
```

#### **3.7.2 Sotuv Analitikasi**
```
- Mahsulot bo'yicha (by product)
- Muddat bo'yicha (by period)
- Grafik va jadval
```

#### **3.7.3 Xodim Hisobi**
```
- Oylik oyiga oylik
- Tartibi bo'yicha (by rank/type)
- Jami hisoblanuvchi pul
```

---

## 🤖 **3.8 CLAUDE AI INTEGRATION (NEW!)**

### **3.8.1 AI Oylik Analiz (Salary Analysis AI)**
```
Claude AI qiladi:
✨ Oylik kalkulyatsiyasini analiz qilish
✨ Qaysi xodim ko'p ishlagan, kam ishlagan
✨ Anomaliyalarni topish (normal emas holatlar)
✨ Tavsiyalar: "Ushbu xodim ko'p soatlar, bonus berish mumkin"
✨ Oylik taqsimlab berish optimizatsiyasi
✨ Tavsiya: "Ushbu oyda xarajatlar 20% ko'p, xurjat qilish kerak"

Output: Tahlil + Tavsiyalar (PDF/Dashboard)
```

### **3.8.2 AI Sotuv Prognozi (Sales Forecast AI)**
```
Claude AI qiladi:
✨ Sotuv trendlarini analiz qilish
✨ Qaysi mahsulot yaxshi sotilyapti
✨ Qaysi oyda sotuv ko'tariladi (prognoz)
✨ Tavsiyalar: "Mahsulot-X ish tanida 30% ko'p sotuv, stock oshirish kerak"
✨ Chavandozlik (Seasonal) pattern topish
✨ Narx optimallashtirish tavsiyalari

Output: Grafik + AI Analysis + Tavsiyalar
```

### **3.8.3 AI Xarajat Optimizatsiyasi (Expense Optimization)**
```
Claude AI qiladi:
✨ Barcha xarajatlarni kategoriyalashtirib analiz qilish
✨ Qaysi xarajat juda ko'p? Nima sababida?
✨ O'tgan oylar bilan taqqoslash
✨ Tavsiyalar: "Energiya xarajati 15% ko'p, mashinalari tekshirish kerak"
✨ Foydasiz xarajatlarni topish
✨ Budget tavsiyalari (agar budget belgilansa)

Output: Tahlil + Tavsiya + Action items
```

### **3.8.4 AI Ishlab Chiqarish Report (Production Report AI)**
```
Claude AI avtomatik yaratadi:
✨ Oylik ishlab chiqarish hisobini avtomatik yozing
✨ Mashinalar ishining tahlili
✨ Xom ashyolar iste'moli analizi
✨ Xodimlar ishlab chiqarish statistikasi
✨ Muammolar va solutsiyalar taklif qilish

Foyda: Ega/Rahbar hech narsa yozmasdan, AI avtomatik report tayyorlaydi
Output: Tayyorlangan Report (Word/PDF)
```

### **3.8.5 AI Chat Assistant (Q&A)**
```
Claude AI Chat:
- Foydalanuvchi: "Bu oyda sotuv qancha?"
- AI: "Bu oyda sotuv 50,000,000 so'm. Oz oy 40,000,000 edi, 25% ko'tarildi"

- Foydalanuvchi: "Xodim Otabek oyiga necha pul olishi kerak?"
- AI: "Otabek bu oyda 8,000,000 so'm olishi kerak (75 soat × 100,000)"

- Foydalanuvchi: "Qaysi mahsulot eng yaxshi sotilyapti?"
- AI: "Mahsulot-X 10,000 dona sotildi (70% of sales)"

Features:
✅ Natural language questions
✅ Uzbek tilida suhbat
✅ Context-aware javoblar (rol asosida)
✅ Tasdiqlash hujjatlari bilan javob
```

### **3.8.6 AI Smart Alerts (Intellekt Bildirishnomalar)**
```
Claude AI qiladi:
🔔 "Xom ashyo-A 1 kunlik yetadi, yangi order qilish kerak!"
🔔 "Xodim Sardor 3 kun kelmadi, oylik hisoblashda e'tibor berish kerak"
🔔 "Sotuv 40% tushdi o'tkan oyga qaraganda"
🔔 "Mashinani texnik xizmat qilish vaqti yetdi"
🔔 "Omborida 1000+ dona qolgan mahsulot, sotuv qo'llash kerak"

Qachon: Real-time, har soat tekshirish
```

---

## 🔌 **3.9 AI INTEGRATIONS**

### **Claude API Integration**
```
- API Endpoint: https://api.anthropic.com/v1/messages
- Model: claude-3-5-sonnet
- Max tokens: 2000-4000 (analysis uchun)
- Response time: < 2 soniya
- Caching: Shunga o'xshash so'rovlar кэшланadi
```

### **Data Flow (AI Processing)**
```
1. System → Data tayyorlash (Oylik, Sotuv, Xarajat)
2. Claude API → Send ma'lumotlar + Prompt
3. Claude → Analiz qiladi, tavsiya beradi
4. Dashboard → Natija ko'rsatish (Text + Grafik)
5. Cache → Keyingi 1 soat saqlanadi
```

---

## 💾 **4. DATABASE STRUKTURA (Main Tables)**

### **4.1 Users (Foydalanuvchilar)**
```sql
users
├── id (UUID)
├── phone (String, unique)
├── password (hashed)
├── full_name
├── role (enum: OWNER, ACCOUNTANT, SALES_HEAD, PRODUCTION_HEAD)
├── is_active (Boolean)
├── created_at
├── updated_at
```

### **4.2 Products (Mahsulotlar)**
```sql
products
├── id
├── name
├── type (Tug'ma/Yasovchi)
├── price
├── daily_production
├── stock_quantity
├── raw_material_id (FK)
├── created_at
```

### **4.3 Raw Materials (Xom Ashyolar)**
```sql
raw_materials
├── id
├── name
├── quantity (Kg/Ton)
├── unit (kg/ton)
├── price_per_unit
├── received_date
├── last_used_date
├── stock_balance
```

### **4.4 Sales (Sotuv)**
```sql
sales
├── id
├── product_id (FK)
├── quantity
├── unit_price
├── total_amount
├── customer_name
├── sale_date
├── status (PAID/PENDING)
├── discount_id (FK, optional)
```

### **4.5 Expenses (Xarajatlar)**
```sql
expenses
├── id
├── category (Raw Materials/Energy/Maintenance/Other)
├── amount
├── description
├── expense_date
├── created_by (FK → users)
```

### **4.6 Employees (Xodimlar)**
```sql
employees
├── id
├── name
├── type (Stanokchi/Ishchi/Oshpaz/Shofir)
├── daily_tariff
├── hire_date
├── is_active
```

### **4.7 Employee Production (Xodim Ishlab Chiqarish)**
```sql
employee_production
├── id
├── employee_id (FK)
├── production_date
├── quantity_produced
├── daily_tariff
├── calculated_amount
├── month (MM/YYYY)
```

### **4.8 Salary (Oylik)**
```sql
salaries
├── id
├── employee_id (FK)
├── month (MM/YYYY)
├── total_calculated
├── bonuses
├── penalties
├── net_amount
├── status (CALCULATED/APPROVED/PAID)
├── approved_by (FK → users, OWNER)
├── paid_date
```

### **4.9 Machines (Mashinalar)**
```sql
machines
├── id
├── name
├── status (WORKING/BROKEN/SERVICE)
├── operator_id (FK → employees)
├── last_service_date
├── daily_production_capacity
```

### **4.10 AI Analysis Results (AI Tahlil Natijalari)** - NEW!
```sql
ai_analyses
├── id
├── type (SALARY_ANALYSIS/SALES_FORECAST/EXPENSE_OPTIMIZATION/PRODUCTION_REPORT)
├── created_date
├── analysis_data (JSON - Claude API response)
├── recommendations (Text array)
├── status (COMPLETED/PROCESSING/ERROR)
├── generated_by (Claude AI)
├── expire_at (1 soat keyin cache o'chiriladi)
```

### **4.11 Smart Alerts (Intellekt Bildirishnomalar)** - NEW!
```sql
smart_alerts
├── id
├── type (LOW_STOCK/ABSENCE/SALES_DROP/MAINTENANCE/HIGH_INVENTORY)
├── severity (LOW/MEDIUM/HIGH/CRITICAL)
├── message
├── triggered_date
├── dismissed_by (FK → users)
├── action_taken (Text)
├── created_at
```

### **4.12 AI Chat History (Chat Tarix)** - NEW!
```sql
ai_chat_history
├── id
├── user_id (FK)
├── question (User savoli)
├── answer (Claude AI javob)
├── context_data (JSON - qaysi oydan/davr)
├── processing_time (ms)
├── created_at
```

### **4.13 Audit Log (Tarix)**
```sql
audit_logs
├── id
├── user_id (FK)
├── action (CREATE/UPDATE/DELETE)
├── table_name
├── record_id
├── changes (JSON)
├── timestamp
```

---

## 🔐 **5. XAVFSIZLIK (Security)**

✅ Password hashing (bcrypt)
✅ JWT tokens
✅ Role-based access control (RBAC)
✅ Audit logging (kim, nima o'zgartirgan)
✅ HTTPS (VPS'ga joylaganda)
✅ Rate limiting (login urinishlari)

---

## 📱 **6. RESPONSIVE DESIGN**

- **Web (React)**: Desktop va tablet uchun optimized
- **iOS (React Native)**: iPhone optimized
- **Android (React Native)**: Android optimized
- **Offline mode**: Mavjud (local storage)
- **Sync**: Internet qaytgan vaqtda serverga yuborish

---

## 🚀 **7. DEPLOY JARAYONI**

### **Bosqich 1: Local (Windows/Mac/Linux)**
```
1. Backend: http://localhost:5000
2. Frontend Web: http://localhost:3000
3. Database: PostgreSQL (local)
4. Mobile: Development/Simulator
```

### **Bosqich 2: VPS (Later)**
```
1. VPS server (DigitalOcean/Hetzner/AWS)
2. Backend: Port 5000 (PM2/Systemd)
3. Frontend: Nginx (static files)
4. Database: PostgreSQL (VPS'da)
5. SSL certificate
6. Domain name
```

---

## 📅 **8. TAYYORLASH GRAFIGI (Timeline)**

| Bosqich | Vaqt | Tavsif |
|---------|------|--------|
| 1. Database + API | 1-2 hafta | Backend va database tayyorlash |
| 2. Web Frontend | 1-2 hafta | React dashboard va modullari |
| 3. Mobile Apps | 1 hafta | iOS/Android react native |
| 4. **Claude AI Integration** 🤖 | **1 hafta** | **Barcha AI features** |
| 5. AI Features (5 moduli) | 1 hafta | Salary, Sales, Expense, Report, Chat |
| 6. Smart Alerts System | 3-4 kun | Real-time notifications |
| 7. Testing | 3-5 kun | Test qilish va bug fix |
| 8. Local Deploy | 2-3 kun | Local test |
| 9. VPS Deploy | 2-3 kun | Production ready |

**Jami vaqt**: ~6-8 hafta (Full AI + Mobile + Web + Backend)

---

## ✅ **9. KEYINGI QADAMLAR**

1. ✅ Bu specifikatsiyani ko'rib chiq
2. ✅ O'zgartirishlar bo'lsa ayt
3. ✅ Tech stack tasdiqlash
4. ✅ Database schema yaratish
5. ✅ Backend API development
6. ✅ Frontend development
7. ✅ Claude AI integration

---

## 🤖 **10. AI SPECIFIC REQUIREMENTS**

### **10.1 Claude API Integration Details**
```
- API Key: Environment variable (.env)
- Base URL: https://api.anthropic.com
- Model: claude-3-5-sonnet
- Request/Response timeout: 30 saniya
- Rate limiting: 1000 requests/min (Pro plan)
```

### **10.2 AI Prompts (Uzbek uchun optimized)**
```
Salary Analysis Prompt:
"Siz Teknoplast fabrikasining buxgalteri. Oylik kalkulyatsiyasini analiz qiling. 
Qaysi xodim ko'p ishlagan, kam ishlagan. Anomaliyalar, tavsiyalar."

Sales Forecast Prompt:
"Sotuv statistikasini tahlil qilib, next month prognoz qiling. 
Qaysi mahsulot eng yaxshi sotilyapti, narx strategiyasi."

Expense Optimization Prompt:
"Xarajatlarni kategoriyalashtirib analiz qiling. Noma'qul xarajatlar, 
optimizatsiya usullari, budget tavsiyalari."
```

### **10.3 AI Response Caching**
```
- Cache vaqti: 1 soat
- Cache key: hash(analysis_type + data)
- Storage: Redis (VPS'da) yoki In-memory (local)
- TTL: 3600 sekund
```

### **10.4 Error Handling**
```
❌ API rate limit exceeded → Retry after 60s
❌ API timeout → Show cached result yoki error message
❌ Invalid data → Return human-readable error
✅ Success → Cache va display result
```

### **10.5 Cost Estimation**
```
Claude API Usage (Sonnet 3.5):
- Salary Analysis: ~500 tokens
- Sales Forecast: ~1000 tokens
- Expense Optimization: ~800 tokens
- Production Report: ~1200 tokens
- Chat query: ~200 tokens

Farq: $0.003 per 1K input tokens
Taqdiri: 100 queries/oy = $0.30-$0.50/oy (juda arzon!)
```

---

## 📊 **11. SYSTEM ARCHITECTURE (AI bilan)**

```
┌─────────────────────────────────────────────────────┐
│           Web Frontend (React)                       │
│      + Mobile App (React Native iOS/Android)        │
└────────────────┬────────────────────────────────────┘
                 │
         ┌───────▼────────┐
         │   REST API     │
         │  (Node.js)     │
         └───────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐   ┌────▼─────┐   ┌──▼──────────┐
│      │   │          │   │             │
│  DB  │   │ Claude   │   │ File        │
│(PG)  │   │ AI API   │   │ Storage     │
│      │   │          │   │             │
└──────┘   └──────────┘   └─────────────┘

- Database: PostgreSQL (ishlab chiqarish, sotuv, oylik data)
- Claude API: AI analysis va tavsiyalar
- Cache: Smart alerts va recommendations
```

---

**Oxirgi yangilanish**: 2026-06-03
**Status**: 🔴 Specifikatsiya bosqichi
