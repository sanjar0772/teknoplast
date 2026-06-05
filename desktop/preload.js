// Preload — xavfsiz ko'prik (hozircha minimal).
// Kelajakda native funksiyalar (printer, fayl) shu yerda qo'shiladi.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('teknoplast', {
  isDesktop: true,
  platform: process.platform,
  version: '1.0.0',
});
