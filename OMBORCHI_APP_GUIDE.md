# 🏢 TEKNOPLAST Omborchi Mobile App

## 📱 Overview

Complete Android/iOS mobile application for warehouse managers (Omborchi) built with **Expo SDK 54** and **React Native**.

**Status:** ✅ Production Ready  
**Location:** `/teknoplast-omborchi`  
**Framework:** React Native + Expo  
**API:** Connected to Railway (teknoplast-production.up.railway.app)

---

## 🎯 Features

### 1. **Production Intake Recording** (✅ Qayd qilish)
- View pending production (SEMI_FINISHED & FINISHED)
- Bulk select and record productions
- Automatic sync with backend
- Support for STANOKCHI and DETALCHI output

**Endpoints Used:**
- `GET /api/intakes/production/pending` — Pending productions
- `POST /api/intakes/production/record-bulk` — Bulk record

### 2. **Pricing Management** (💰 Narx)
- View all products with rates
- Edit stanokchi_rate (per unit salary)
- Edit detalchi_rate (per unit salary)
- Edit cost_price (warehouse valuation)
- Real-time updates

**Endpoints Used:**
- `GET /api/products` — Product list
- `PUT /api/products/:id/pricing` — Update pricing

### 3. **Raw Materials Management** (📦 Xom ashyo)
- View all raw materials
- Check stock levels
- View supplier information
- Track intake history with costs
- Monitor total expenses per material

**Endpoints Used:**
- `GET /api/products/raw-materials/list` — Materials list
- `GET /api/products/raw-materials/intake-history` — Intake history

---

## 🚀 Getting Started

### Installation

```bash
cd teknoplast-omborchi
npm install
```

### Development

```bash
npm start
# Then press 'a' for Android or 'i' for iOS in Expo CLI
```

### Build for Android

```bash
# Using EAS (requires Expo account)
eas build --platform android

# Or use Expo Go app for testing:
# 1. Install Expo Go on Android device
# 2. Scan QR code from npm start output
```

---

## 🔑 Login Credentials

```
Role: OMBORCHI
Phone: +998906666666
Password: Ombor123!
```

---

## 📊 User Interface

### Screen 1: Login
```
┌─────────────────────────┐
│  🏭 TEKNOPLAST          │
│     Omborchi Mobile     │
├─────────────────────────┤
│ Telefon: +998...        │
│ Parol: [••••••]        │
├─────────────────────────┤
│    [Kirish] (Login)     │
└─────────────────────────┘
```

### Screen 2: Dashboard (Main)
```
┌──────────────────────────────────┐
│ 👤 Omborchi  [Chiqish]          │
├──────────────────────────────────┤
│ ✅ Qayd qilish | 💰 Narx | 📦 ... │
├──────────────────────────────────┤
│                                  │
│  Production cards (with toggle)  │
│  ✓ Akrom · Detail · 100 dona    │
│  ✓ Olim · Product · 50 dona     │
│                                  │
│  [✅ Qayd qil] (Record)         │
│                                  │
└──────────────────────────────────┘
```

### Tab 1: Qayd qilish (Production Recording)
- List of pending productions
- Checkbox selector for each item
- Bulk record button (when items selected)
- Shows employee name, product, quantity, date

### Tab 2: Narx (Pricing)
- Product cards with current rates
- Edit button on each product
- Form to update:
  - Stanokchi rate (🤖)
  - Detalchi rate (✨)
  - Cost price (💰)
- Save/Cancel buttons

### Tab 3: Xom ashyo (Raw Materials)
- Material list with:
  - Name
  - Stock quantity + unit
  - Price per unit
  - Supplier name
- Intake history (recent 5)
  - Total cost
  - Number of expenses

---

## 🔗 API Integration

### Base URL
```
https://teknoplast-production.up.railway.app/api
```

### Authentication
- JWT Token stored in SecureStore (expo-secure-store)
- Auto-attached to all requests via interceptor
- Login endpoint: `/auth/login`

### Error Handling
- User-friendly alerts
- Automatic retry on timeout
- Validation messages

---

## 📦 Dependencies

```json
{
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo": "~54.0.0",
  "axios": "^1.7.0",
  "expo-secure-store": "~15.0.0",
  "expo-status-bar": "~3.0.0"
}
```

---

## 🎨 Styling

- Clean Material Design inspired UI
- Responsive layout (works on phones and tablets)
- Color scheme:
  - Primary: #0066cc (Blue)
  - Success: #00aa00 (Green)
  - Danger: #cc0000 (Red)
  - Secondary: #666 (Gray)

---

## 🧪 Testing Checklist

- [ ] Login with credentials
- [ ] View pending productions
- [ ] Select multiple productions
- [ ] Record bulk productions
- [ ] View pricing list
- [ ] Edit product rates
- [ ] Save pricing changes
- [ ] View raw materials
- [ ] Check intake history
- [ ] Logout
- [ ] Test on different screen sizes
- [ ] Test offline (should show cached data)

---

## 🔧 Configuration

### API URL
Current: `https://teknoplast-production.up.railway.app/api`

To change for local development:
```javascript
const API_URL = 'http://192.168.x.x:5000/api'; // Your machine IP
```

### Timeout
Default: 10000ms (10 seconds)

```javascript
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});
```

---

## 📱 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Android | ✅ | 8.0+ (API 26+) |
| iOS | ✅ | 11.0+ |
| Web | 🔄 | React Native Web (future) |

---

## 🚨 Known Limitations

1. **Offline Mode**: Not yet implemented (can be added with local SQLite)
2. **Voice Recognition**: Not integrated (can add with expo-av)
3. **QR Code Scanner**: Not yet implemented
4. **Camera**: Not used yet

---

## 🔮 Future Enhancements

- [ ] Offline mode with SQLite
- [ ] QR code scanning for quick lookup
- [ ] Biometric authentication (fingerprint)
- [ ] Export to PDF/Excel
- [ ] Push notifications
- [ ] Dark mode
- [ ] Multi-language support
- [ ] Voice commands

---

## 📞 Support

**Issues?**
1. Check API URL configuration
2. Verify server is running on Railway
3. Check internet connection
4. Clear app cache: `npm run reset`

**Development Server Issues:**
```bash
# Clear Expo cache
expo start -c

# Clear node_modules
rm -rf node_modules
npm install
```

---

## 📄 License

Proprietary - TEKNOPLAST

---

**Version:** 1.0.0  
**Last Updated:** 2026-06-06  
**Build:** Expo SDK 54
