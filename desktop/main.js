const { app, BrowserWindow, session, shell, Menu } = require('electron');
const path = require('path');

// Eslatma: HTTP kesh YOQILGAN (tez ishlashi uchun). index.html server tomonidan
// 'no-cache' bilan beriladi -> har doim eng yangi tekshiriladi, hash'li JS/CSS esa
// keshda qoladi -> start tez. Kerak bo'lsa menyudan "To'liq yangilash (Ctrl+Shift+R)".

// TEKNOPLAST sayt manzili (Railway). Kerak bo'lsa o'zgartiring yoki
// TEKNOPLAST_URL muhit o'zgaruvchisi orqali boshqaring.
const APP_URL = process.env.TEKNOPLAST_URL || 'https://teknoplast-production.up.railway.app';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'TEKNOPLAST',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Mikrofon (Ahmad ovozi) uchun media ruxsati
      // contextIsolation yoqilgan holda ham getUserMedia ishlaydi
    },
  });

  mainWindow.loadURL(APP_URL);

  // Tashqi havolalar — tashqi brauzerda ochilsin
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Ulanish uzilganda foydalanuvchiga xabar
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    if (code === -106 || code === -105 || code === -109) {
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <html><head><meta charset="utf-8"><title>TEKNOPLAST</title></head>
        <body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
        <div>
          <h1>🔌 Internet ulanmagan</h1>
          <p style="color:#94a3b8">TEKNOPLAST serveriga ulanib bo'lmadi.<br/>Internetni tekshirib, qayta urinib ko'ring.</p>
          <button onclick="location.reload()" style="margin-top:16px;padding:12px 28px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer">Qayta urinish</button>
        </div></body></html>
      `));
    }
  });
}

app.whenReady().then(async () => {
  // Mikrofon / kamera ruxsatini avtomatik berish (Ahmad ovozli buyruq uchun)
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'camera', 'videoCapture', 'clipboard-read', 'notifications'];
    callback(allowed.includes(permission));
  });

  // Oddiy menyu (faqat kerakli amallar)
  const template = [
    {
      label: 'TEKNOPLAST',
      submenu: [
        { label: 'Yangilash', accelerator: 'F5', click: () => mainWindow?.reload() },
        {
          label: 'To\'liq yangilash (keshni tozalash)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: async () => {
            try { await session.defaultSession.clearCache(); } catch {}
            try { await session.defaultSession.clearStorageData(); } catch {}
            mainWindow?.webContents.reloadIgnoringCache();
          },
        },
        { label: 'To\'liq ekran', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { type: 'separator' },
        { label: 'Chiqish', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'Tahrirlash',
      submenu: [
        { role: 'cut', label: 'Kesish' },
        { role: 'copy', label: 'Nusxalash' },
        { role: 'paste', label: 'Joylash' },
        { role: 'selectAll', label: 'Hammasini belgilash' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
