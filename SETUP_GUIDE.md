# 🚀 TEKNOPLAST - COMPLETE SETUP GUIDE

## 📋 STATUS

✅ Specification tayyorlandi
✅ Backend API structure yaratildi
✅ Frontend React structure yaratildi
✅ Database schema ready
✅ Claude AI integration ready

---

## 🛠️ **INSTALLATION & SETUP**

### **STEP 1: DATABASE SETUP**

#### 1.1 PostgreSQL o'rnatish

**Windows:**
```bash
# https://www.postgresql.org/download/windows/ dan yuklash
# Installation paytida:
# - Password: (o'zingiz tanlang)
# - Port: 5432 (default)
# - pgAdmin: O'rnatish tavsiya qilishiladi
```

**Mac (Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Linux (Ubuntu):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo service postgresql start
```

#### 1.2 Database yaratish

```bash
# PostgreSQL'ga kirish
psql -U postgres

# Pasword kiriting (yuklash paytida o'zingiz belgilagan)
```

PostgreSQL shell'da:
```sql
CREATE DATABASE teknoplast;
\c teknoplast
-- Yuqoridagi database_schema.sql ni run qiling
```

Yoki command line'dan:
```bash
psql -U postgres -d teknoplast -f database_schema.sql
```

#### 1.3 Test user yaratish (optional)

```sql
INSERT INTO users (id, phone, password_hash, full_name, role)
VALUES (
  gen_random_uuid(),
  '+998901234567',
  '$2b$10$...', -- bcrypt hash (parolingiz)
  'Ega',
  'OWNER'
);
```

---

### **STEP 2: BACKEND SETUP**

#### 2.1 Node.js o'rnatish

**Windows/Mac/Linux:**
- https://nodejs.org/ dan LTS versiyasini yuklash
- Node v18.0.0 yoki yangroq

#### 2.2 Backend project sozlash

```bash
# Backend papkasiga o'tish
cd backend

# Dependencies o'rnatish
npm install

# Environment variables sozlash
cp .env.example .env

# .env faylini o'zingizning ma'lumotlaringiz bilan to'ldiring:
# DB_HOST=localhost
# DB_USER=postgres
# DB_PASSWORD=YOUR_PASSWORD
# ANTHROPIC_API_KEY=sk-ant-xxxxx (Claude API key)
```

#### 2.3 Backend ishga tushirish

```bash
# Development mode
npm run dev

# Server 5000 portda ishga tushar
# ✅ Server running on port 5000
```

#### 2.4 API Test qilish

```bash
# Health check
curl http://localhost:5000/health

# Login test
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998901234567","password":"password123"}'
```

---

### **STEP 3: FRONTEND SETUP**

#### 3.1 Frontend project sozlash

```bash
# Frontend papkasiga o'tish
cd frontend

# Dependencies o'rnatish
npm install

# Environment variables sozlash
cat > .env.local << EOF
VITE_API_URL=http://localhost:5000/api
EOF
```

#### 3.2 Frontend ishga tushirish

```bash
# Development server
npm run dev

# http://localhost:5173 da ochiladi
```

---

### **STEP 4: MOBILE SETUP (React Native)**

```bash
# React Native project yaratish
cd mobile

npm install

# iOS uchun
npm run ios

# Android uchun
npm run android
```

---

## 🔑 **CLAUDE API KEY OLISH**

1. https://console.anthropic.com ga o'tish
2. "Create API Key" bosish
3. Key nusxalash
4. Backend .env fayliga qo'yish:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```

---

## 📊 **SYSTEM ARCHITECTURE**

```
┌─────────────────────────────────────────────┐
│         FRONTEND                            │
│    React (Web) + React Native (Mobile)     │
│    localhost:5173                           │
└────────────────┬────────────────────────────┘
                 │
         ┌───────▼────────┐
         │   REST API     │
         │  (Node.js)     │
         │  localhost:5000│
         └───────┬────────┘
                 │
    ┌────────────┼─────────────────┐
    │            │                 │
┌───▼──┐   ┌────▼─────┐       ┌───▼──┐
│      │   │           │       │      │
│  DB  │   │ Claude AI │       │Cache │
│(PG)  │   │  (Sonnet) │       │      │
│5432  │   │           │       │      │
└──────┘   └───────────┘       └──────┘
```

---

## 🧪 **TESTING CREDENTIALS**

```
Phone: +998901234567
Password: password123
Role: OWNER (Full Access)
```

---

## 📱 **API ENDPOINTS**

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Current user

### Sales
- `GET /api/sales` - Barcha sotuv
- `POST /api/sales` - Yangi sotuv
- `PUT /api/sales/:id/status` - Status o'zgartirish

### Expenses
- `GET /api/expenses` - Barcha xarajat
- `POST /api/expenses` - Yangi xarajat

### AI Features
- `GET /api/ai/salary-analysis/:month` - Oylik tahlili
- `GET /api/ai/sales-forecast` - Sotuv prognozi
- `GET /api/ai/expense-optimization/:month` - Xarajat optimaliz
- `GET /api/ai/production-report/:month` - Ishlab chiqarish report
- `POST /api/ai/chat` - AI Chat
- `GET /api/ai/alerts` - Intellekt bildirishnomalar

---

## 📝 **DEPLOYMENT CHECKLIST**

### Local Development ✅
- [ ] PostgreSQL o'rnatilgan
- [ ] Backend ishga tushurilgan
- [ ] Frontend ishga tushurilgan
- [ ] Claude API key o'rnatilgan
- [ ] Test login qilindi

### VPS Deployment (Later)
- [ ] Domain nomi
- [ ] SSL Certificate
- [ ] PM2 (Process manager)
- [ ] Nginx (Reverse proxy)
- [ ] Environment variables

---

## 🐛 **TROUBLESHOOTING**

### Database connection xatosi
```bash
# PostgreSQL status tekshirish
sudo service postgresql status

# Port 5432 ochiq ekanligini tekshirish
netstat -tlnp | grep 5432
```

### Backend port allaqachon ishlatilmoqda
```bash
# 5000 portda ishlaydigan process topish va o'chirish
lsof -i :5000
kill -9 <PID>
```

### Frontend CSS xatosi
```bash
# Tailwind CSS qayta build qilish
npm run build
```

### Claude API xatosi
- API key to'g'ri ekanligini tekshirish
- Rate limits tekshirish: https://console.anthropic.com
- Token count tekshirish

---

## 📚 **QUYIDAGI AMALLARNI BAJARISH KERAK**

### Backend Routes (To'ldirish kerak):
- [ ] `src/routes/employees.js` - Xodimlar
- [ ] `src/routes/products.js` - Mahsulotlar
- [ ] `src/routes/salaries.js` - Oylik
- [ ] `src/routes/reports.js` - Hisobotlar

### Frontend Pages (Yaratish kerak):
- [ ] `src/pages/Dashboard.jsx` - Bosh sahifa
- [ ] `src/pages/SalesPage.jsx` - Sotuv
- [ ] `src/pages/ExpensesPage.jsx` - Xarajatlar
- [ ] `src/pages/SalariesPage.jsx` - Oylik
- [ ] `src/pages/EmployeesPage.jsx` - Xodimlar
- [ ] `src/pages/ProductsPage.jsx` - Mahsulotlar
- [ ] `src/pages/ReportsPage.jsx` - Hisobotlar
- [ ] `src/pages/AIPage.jsx` - AI Yordamchi

### Frontend Components (Yaratish kerak):
- [ ] `src/components/SalesForm.jsx`
- [ ] `src/components/SalesTable.jsx`
- [ ] `src/components/ExpenseForm.jsx`
- [ ] `src/components/AIChat.jsx`
- [ ] `src/components/AlertsPanel.jsx`

---

## 💡 **KEYINGI QADAMLAR**

1. ✅ Yuqoridagi setup amallarini bajaring
2. ✅ Backend va Frontend ishga tushurishni tekshiring
3. ✅ Login test qiling
4. ✅ Frontend pages/components yaratishni boshlang
5. ✅ Har bir modul uchun testlarni yozing
6. ✅ VPS ga deploy qilish uchun tayyorlaning

---

## 📞 **SUPPORT**

Agar savol yoki muammo bo'lsa, men yordam beraman!

**Stack:**
- Backend: Node.js + Express + PostgreSQL
- Frontend: React + Tailwind CSS
- AI: Claude API (Anthropic)
- Mobile: React Native (TBD)

---

**Created:** 2024-12-03
**Version:** 1.0.0
**Status:** 🔴 Development
