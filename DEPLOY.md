# 🚀 TEKNOPLAST — VPS'ga Deploy Qo'llanmasi

Bu qo'llanma tizimni VPS serverga joylashtirishning **to'liq qadam-baqadam** yo'lini ko'rsatadi.
Baza: **SQLite** (oddiy, zavod hajmi uchun yetarli).

---

## 0. VPS sotib olish

**Tavsiya (arzon + ishonchli):**
| Provider | Narx | Joylashuv |
|----------|------|-----------|
| **Hetzner** (CX22) | ~€4/oy | Germaniya (tavsiya) |
| **Contabo** (VPS S) | ~$6/oy | Germaniya/AQSH |
| DigitalOcean | $6/oy | Yevropa |

**Olish:**
1. Hetzner Cloud → ro'yxatdan o'ting → "New Project" → "Add Server"
2. **Ubuntu 24.04** tanlang
3. CX22 (2 vCPU, 4GB RAM) — yetarli
4. SSH kalit qo'shing (yoki parol)
5. Server yaratilgach **IP manzilni** oling (masalan `91.x.x.x`)

---

## 1. Serverga ulanish

Kompyuteringizdan (PowerShell yoki Terminal):
```bash
ssh root@91.x.x.x
```

---

## 2. Serverni sozlash (bir martalik)

```bash
# Yangilash
apt update && apt upgrade -y

# Node.js 20 LTS o'rnatish
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx

# PM2 (process manager)
npm install -g pm2

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Versiyalarni tekshirish
node -v && npm -v && nginx -v
```

---

## 3. Loyihani serverga yuklash

### Variant A — GitHub orqali (tavsiya)
Avval kompyuteringizda loyihani GitHub'ga yuklang, keyin:
```bash
mkdir -p /var/www/teknoplast
cd /var/www/teknoplast
git clone https://github.com/SIZNING_USERNAME/tex.git .
```

### Variant B — To'g'ridan-to'g'ri yuklash (SCP)
Kompyuteringizdan (yangi terminal):
```bash
# node_modules'siz yuklang (server o'zi o'rnatadi)
scp -r C:\Users\sanja\Downloads\tex\backend root@91.x.x.x:/var/www/teknoplast/
scp -r C:\Users\sanja\Downloads\tex\frontend root@91.x.x.x:/var/www/teknoplast/
scp C:\Users\sanja\Downloads\tex\ecosystem.config.js root@91.x.x.x:/var/www/teknoplast/
```

> 💡 **Mavjud ma'lumotlarni saqlash:** `backend/teknoplast.sqlite` faylini ham yuklang — barcha mahsulot/sotuv/foydalanuvchilar saqlanadi. Yuklamasangiz, server bo'sh bazadan boshlaydi.

---

## 4. Backend sozlash

```bash
cd /var/www/teknoplast/backend
npm install --omit=dev

# Environment faylini yaratish
cp .env.production.example .env
nano .env
```

`.env` ichida **JWT_SECRET**ni o'zgartiring. Yangi kalit yaratish:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Chiqgan qiymatni `JWT_SECRET=` ga qo'ying. `FRONTEND_URL`ni domeningizga moslang. Saqlang (Ctrl+O, Enter, Ctrl+X).

---

## 5. Frontend build

```bash
cd /var/www/teknoplast/frontend
npm install
npm run build
# natija: frontend/dist papkasi
```

---

## 6. Backend'ni PM2 bilan ishga tushirish

```bash
cd /var/www/teknoplast
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # chiqgan buyruqni nusxalab ishga tushiring (avto-start)

# Tekshirish
pm2 status
curl http://localhost:5000/api/health
```

---

## 7. Nginx sozlash

```bash
# Konfiguratsiyani nusxalash
cp /var/www/teknoplast/deploy/nginx-teknoplast.conf /etc/nginx/sites-available/teknoplast

# Domeningizni yozing
nano /etc/nginx/sites-available/teknoplast   # teknoplast.uz → o'z domeningiz

# Faollashtirish
ln -s /etc/nginx/sites-available/teknoplast /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t          # sintaksis tekshiruvi
systemctl reload nginx
```

Endi `http://91.x.x.x` (IP) yoki domen orqali tizim ochiladi.

---

## 8. Domen + HTTPS (SSL)

### Domen ulash
Domen sozlamalarida (masalan `teknoplast.uz`):
- **A record:** `@` → `91.x.x.x` (server IP)
- **A record:** `www` → `91.x.x.x`

### Bepul SSL (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d teknoplast.uz -d www.teknoplast.uz
# Email kiriting, shartlarga rozi bo'ling
# Avtomatik HTTPS sozlanadi + 90 kunda o'zi yangilanadi
```

Endi **https://teknoplast.uz** ishlaydi 🔒

---

## 9. Kunlik backup (avtomatik)

Tizimda kunlik backup allaqachon bor (cron 02:00, `backend/backups/`).
Qo'shimcha — backupni boshqa joyga nusxalash uchun:
```bash
crontab -e
# Quyidagini qo'shing (har kuni 03:00 da backup'ni tashqi papkaga):
0 3 * * * cp /var/www/teknoplast/backend/teknoplast.sqlite /root/backups/tek-$(date +\%F).sqlite
```

---

## 10. Yangilanish (kod o'zgarganda)

```bash
cd /var/www/teknoplast
git pull                              # yangi kodni olish
cd backend && npm install --omit=dev
cd ../frontend && npm install && npm run build
cd .. && pm2 restart teknoplast-api   # backendni qayta yoqish
```

---

## 📋 Tekshiruv ro'yxati
- [ ] VPS olindi, IP bor
- [ ] Node + Nginx + PM2 o'rnatildi
- [ ] Loyiha yuklandi
- [ ] `.env` da JWT_SECRET o'zgartirildi
- [ ] Frontend build qilindi
- [ ] PM2 ishlayapti (`pm2 status`)
- [ ] Nginx ishlayapti
- [ ] Domen + SSL ulandi
- [ ] Login tekshirildi

---

## 🆘 Muammolar
| Muammo | Yechim |
|--------|--------|
| Sahifa ochilmayapti | `pm2 logs` va `nginx -t` ni tekshiring |
| API 502 | Backend o'chgan — `pm2 restart teknoplast-api` |
| Login ishlamayapti | `.env` JWT_SECRET to'g'ri o'rnatilganini tekshiring |
| SSL xato | DNS A-record server IP'ga to'g'ri ko'rsatayotganini kuting (10-30 min) |

---

## 👤 Birinchi kirish
- Telefon: `+998901234567`
- Parol: `Admin123!`
> ⚠️ Birinchi kirishdan keyin parolni o'zgartiring (Foydalanuvchilar bo'limi).
