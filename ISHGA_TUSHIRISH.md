# TEKNOPLAST — Ishga Tushirish Qo'llanmasi

## Talab qilinadigan dasturlar
- Node.js 18+ (https://nodejs.org)
- PostgreSQL 15+ (https://postgresql.org)
- Git (ixtiyoriy)

---

## 1. DATABASE SOZLASH

### PostgreSQL o'rnatish (Windows)
1. https://postgresql.org dan yuklab o'rnating
2. O'rnatish vaqtida parol yozing (esda saqlang)

### Database yaratish
```sql
-- pgAdmin yoki psql da:
CREATE DATABASE teknoplast;
```

### Schemani yuklash
```bash
psql -U postgres -d teknoplast -f database/schema.sql
```

---

## 2. BACKEND SOZLASH

```bash
cd backend

# .env fayl yaratish
copy ..\.env.example .env
# .env faylni oching va to'ldiring

# Paketlarni o'rnatish
npm install

# Ishga tushirish
npm run dev
```

Backend: http://localhost:5000

---

## 3. FRONTEND SOZLASH (yangi terminal)

```bash
cd frontend

# Paketlarni o'rnatish
npm install

# Ishga tushirish
npm run dev
```

Frontend: http://localhost:5173

---

## 4. BIRINCHI LOGIN

```
Telefon: +998901234567
Parol: Admin123!
```

> **Muhim:** Birinchi kirishda parolni o'zgartiring!

---

## 5. BIRINCHI FOYDALANUVCHI YARATISH

Database ga qo'lda qo'shish:

```bash
node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Admin123!', 10);
console.log(hash);
"
```

Natija hashni olib:
```sql
UPDATE users SET password_hash = 'HASH_BU_YERGA' WHERE phone = '+998901234567';
```

---

## DOCKER BILAN (ixtiyoriy)

```bash
# .env faylini yarating
copy .env.example .env

# Docker bilan ishga tushirish
docker-compose up -d

# Frontend: http://localhost:5173
# Backend: http://localhost:5000
# DB: localhost:5432
```

---

## API ENDPOINTS

| Method | URL | Tavsif |
|--------|-----|--------|
| POST | /api/auth/login | Kirish |
| GET | /api/auth/me | Profil |
| GET | /api/sales | Sotuvlar |
| POST | /api/sales | Sotuv qo'shish |
| GET | /api/expenses | Xarajatlar |
| GET | /api/employees | Xodimlar |
| POST | /api/production/bulk | Kunlik ishlab chiqarish |
| POST | /api/salaries/calculate | Oylik hisoblash |
| GET | /api/reports/dashboard | Dashboard |
| GET | /api/reports/pdf/monthly | PDF hisobot |
| GET | /api/reports/excel/sales | Excel sotuv |
| POST | /api/ai/chat | AI chat |
| GET | /api/ai/alerts | Smart ogohlantirishlar |

---

## VPS GA DEPLOY

```bash
# VPS da:
git clone <repo> teknoplast
cd teknoplast
cp .env.example .env
# .env ni to'ldiring (NODE_ENV=production)

# PM2 bilan backend:
npm install -g pm2
cd backend && npm install
pm2 start src/index.js --name teknoplast-backend

# Frontend build:
cd ../frontend && npm install && npm run build
# nginx bilan serve qiling
```

---

## XATOLIKLAR

| Xato | Yechim |
|------|--------|
| DB ulanmayapti | PostgreSQL ishga tushganini tekshiring |
| Port band | `netstat -ano | findstr :5000` |
| JWT xato | .env dagi JWT_SECRET ni tekshiring |
| AI ishlamayapti | ANTHROPIC_API_KEY ni tekshiring |
