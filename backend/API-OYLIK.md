# 🏭 TEKNOPLAST - OYLIK HISOBLASH API

## 📊 Oylik Hisoblash Sistemasi

Barcha 36 ishchi uchun avtomatik oylik hisoblash va salary slip generation.

---

## 🔐 AUTHENTICATION

Barcha requestlarga JWT token kerak:

```bash
Authorization: Bearer {JWT_TOKEN}
```

**Test users:**
```
ACCOUNTANT:  +998902222222 / Accountant123!
OWNER:       +998901111111 / Owner123!
```

---

## 📈 API ENDPOINTS

### 1️⃣ OYLIK HISOBLASH

#### POST `/api/salaries/calculate`
**Barcha ishchilar uchun oylikni hisoblash**

```bash
curl -X POST http://localhost:5000/api/salaries/calculate \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2024-06",
    "tax_rate": 0.05,
    "social_rate": 0.03
  }'
```

**Javob:**
```json
{
  "message": "36 xodim oylik hisoblandi",
  "salaries": [
    {
      "id": "abc123",
      "employee_id": "emp1",
      "month": "2024-06",
      "total_calculated": 2400000,
      "tax_amount": 120000,
      "social_security": 72000,
      "work_days": 20,
      "total_produced": 150,
      "net_amount": 2208000,
      "bonuses": 0,
      "penalties": 0,
      "status": "CALCULATED"
    }
    ...
  ],
  "summary": {
    "total_employees": 36,
    "total_gross": 86400000,
    "total_tax": 4320000,
    "total_net": 72912000
  }
}
```

---

### 2️⃣ OYLIK RO'YXATI

#### GET `/api/salaries/?month=2024-06`
**Oylik barcha ishchilarni ko'rish**

```bash
curl -X GET http://localhost:5000/api/salaries/?month=2024-06 \
  -H "Authorization: Bearer {TOKEN}"
```

**Javob:**
```json
{
  "salaries": [
    {
      "id": "sal123",
      "employee_id": "emp1",
      "employee_name": "Faziliddin",
      "employee_type": "ISHCHI",
      "month": "2024-06",
      "total_calculated": 2400000,
      "tax_amount": 120000,
      "social_security": 72000,
      "net_amount": 2208000,
      "status": "CALCULATED",
      "work_days": 20,
      "total_produced": 0
    }
  ],
  "summary": {
    "total_employees": 36,
    "total_amount": 86400000,
    "paid_amount": 0,
    "paid_count": 0,
    "approved_count": 0,
    "calculated_count": 36
  },
  "month": "2024-06"
}
```

---

### 3️⃣ OYLIK JAMLANMA

#### GET `/api/salaries/monthly/summary?month=2024-06`
**Oy bo'yicha jami hisobot**

```bash
curl -X GET http://localhost:5000/api/salaries/monthly/summary?month=2024-06 \
  -H "Authorization: Bearer {TOKEN}"
```

**Javob:**
```json
{
  "month": "2024-06",
  "summary": {
    "total_employees": 36,
    "gross_total": 86400000,
    "total_tax": 4320000,
    "total_social": 2592000,
    "total_bonuses": 0,
    "total_penalties": 0,
    "net_total": 72912000,
    "paid_count": 0,
    "approved_count": 0,
    "calculated_count": 36
  },
  "breakdown_by_type": [
    {
      "type": "ISHCHI",
      "count": 25,
      "total_net": 55680000
    },
    {
      "type": "SHOFIR",
      "count": 4,
      "total_net": 8800000
    },
    {
      "type": "OSHPAZ",
      "count": 4,
      "total_net": 7680000
    },
    {
      "type": "STANOKCHI",
      "count": 3,
      "total_net": 652000
    }
  ]
}
```

---

### 4️⃣ BIR ISHCHINING OYLIG'I

#### GET `/api/salaries/employee/{employee_id}?month=2024-06`
**Bitta ishchining oylik detallarini ko'rish**

```bash
curl -X GET http://localhost:5000/api/salaries/employee/emp123?month=2024-06 \
  -H "Authorization: Bearer {TOKEN}"
```

**Javob:**
```json
{
  "salary": {
    "id": "sal123",
    "employee_id": "emp123",
    "name": "Faziliddin",
    "type": "ISHCHI",
    "phone": "",
    "month": "2024-06",
    "total_calculated": 2400000,
    "tax_amount": 120000,
    "social_security": 72000,
    "bonuses": 0,
    "penalties": 0,
    "net_amount": 2208000,
    "status": "CALCULATED",
    "work_days": 20,
    "total_produced": 0
  }
}
```

---

### 5️⃣ BONUS / JARIMA QO'SHISH

#### PUT `/api/salaries/{id}/adjust`
**Bonus yoki jarimani qo'shish/olib tashlash**

```bash
curl -X PUT http://localhost:5000/api/salaries/sal123/adjust \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "bonuses": 100000,
    "penalties": 50000,
    "notes": "Juda yaxshi ishladi"
  }'
```

**Javob:**
```json
{
  "salary": {
    "id": "sal123",
    "total_calculated": 2400000,
    "bonuses": 100000,
    "penalties": 50000,
    "net_amount": 2450000,
    "status": "CALCULATED",
    "notes": "Juda yaxshi ishladi"
  }
}
```

---

### 6️⃣ OYLIK TASDIQLASH

#### PUT `/api/salaries/{id}/approve`
**OWNER oylikni tasdiqlaydi**

```bash
curl -X PUT http://localhost:5000/api/salaries/sal123/approve \
  -H "Authorization: Bearer {TOKEN}"
```

**Javob:**
```json
{
  "salary": {
    "id": "sal123",
    "status": "APPROVED",
    "approved_by": "user123",
    "net_amount": 2450000
  }
}
```

---

### 7️⃣ OYLIK TO'LASH

#### PUT `/api/salaries/{id}/pay`
**Oylikni to'ladi**

```bash
curl -X PUT http://localhost:5000/api/salaries/sal123/pay \
  -H "Authorization: Bearer {TOKEN}"
```

**Javob:**
```json
{
  "salary": {
    "id": "sal123",
    "status": "PAID",
    "paid_date": "2024-06-30",
    "net_amount": 2450000
  }
}
```

---

### 8️⃣ SALARY SLIP (HTML)

#### GET `/api/salary-slip/{id}`
**Salary slip HTML ko'rish**

```bash
curl -X GET http://localhost:5000/api/salary-slip/sal123 \
  -H "Authorization: Bearer {TOKEN}"
```

Brauzer'da to'liq formatted salary slip ko'rsatiladi (print qilish mumkin).

---

## 📋 WORKFLOW (QO'YADIGAN TARTIB)

```
1. Ishlab chiqarish ro'yxati ✅ (production endpoints)
   ↓
2. KIRIMCHI qayd qiladi ✅ (intakes endpoints)
   ↓
3. ACCOUNTANT oylik hisoblaydi 👈 (salaries/calculate)
   ↓
4. ACCOUNTANT bonus/jarima qo'shadi 👈 (salaries/:id/adjust)
   ↓
5. OWNER tasdiqlaydi 👈 (salaries/:id/approve)
   ↓
6. OWNER to'laydi 👈 (salaries/:id/pay)
   ↓
7. Salary slip chop qilinadi 👈 (salary-slip/:id)
```

---

## 🧮 HISOB-KITOB FORMULA

```
Brutto (Gross) = Ishlab chiqarish buyicha hisoblangan summa

Soliq (Tax) = Brutto × 5%
Ijtimoiy sug'urta = Brutto × 3%

Netto = Brutto - Soliq - Ijtimoiy sug'urta + Bonuslar - Jarimalar
```

**Misol:**
```
Brutto:           2,400,000 UZS
Soliq (5%):       -  120,000
Sug'urta (3%):    -   72,000
Bonus:            +  100,000
Jarima:           -   50,000
─────────────────────────────
NETTO:            2,258,000 UZS  (To'lanadigan)
```

---

## 🎯 TEST QILISH

### 1. Login qilish
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+998902222222",
    "password": "Accountant123!"
  }'
```

### 2. Oylik hisoblash
```bash
curl -X POST http://localhost:5000/api/salaries/calculate \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"month": "2024-06"}'
```

### 3. Oylik ro'yxatini ko'rish
```bash
curl -X GET http://localhost:5000/api/salaries/?month=2024-06 \
  -H "Authorization: Bearer {TOKEN}"
```

### 4. Salary slip ko'rish
```bash
# Birinchi, salary ID'ni olish kerak (yuqoridagi ro'yxatdan)
curl -X GET http://localhost:5000/api/salary-slip/{SAL_ID} \
  -H "Authorization: Bearer {TOKEN}"
```

---

## 📊 HOZIR ISHLAYOTGAN

- ✅ 36 ta ishchi database'da
- ✅ Oylik avtomatik hisoblash
- ✅ Soliq va ijtimoiy sug'urta chegirmasi
- ✅ Bonus/jarima qo'shish
- ✅ Tasdiqlash va to'lash jarayoni
- ✅ Salary slip HTML generatsiya
- ✅ Oylik jamlanma va hisobot
- ✅ Ishchi bo'yicha oylik

---

## 🚀 KEYINGI BOSQICHLAR

- [ ] Admin dashboard'i (React)
- [ ] Salary slip PDF generatsiya
- [ ] Oylik archive (murakkab filtr)
- [ ] Ishchi statistikasi dashboard
- [ ] Kunlik ishlab chiqarish kirimchi
- [ ] Avtomatik salf spreadsheet yaratish

