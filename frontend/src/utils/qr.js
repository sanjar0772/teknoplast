// QR kodni PNG rasm sifatida yuklab olish.
// Eng ishonchli yo'l — <canvas> (QRCodeCanvas) dan to'g'ridan-to'g'ri Blob olish.
// Blob URL desktop (.exe / Electron) va brauzerda ham barqaror ishlaydi.

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Canvas elementdan PNG yuklab olish (yoki yangi oynada ochish — zaxira yo'l).
export function downloadCanvasPng(canvas, filename = 'qr-kod.png') {
  if (!canvas || typeof canvas.toBlob !== 'function') return false;
  try {
    canvas.toBlob((blob) => {
      if (!blob) {
        // Zaxira: ba'zi muhitlar toBlob'ni bo'sh qaytaradi — data URL bilan urinamiz
        try { triggerDownload(canvas.toDataURL('image/png'), filename); } catch {}
        return;
      }
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
    return true;
  } catch {
    return false;
  }
}

// Id bo'yicha QR yuklab olish. Avval <canvas>, bo'lmasa <svg> dan rasm yasaydi.
export function downloadQR(elementId, filename = 'qr-kod') {
  const host = document.getElementById(elementId);
  if (!host) return false;

  // 1) Canvas bo'lsa — eng ishonchli yo'l
  const canvas = host.tagName?.toLowerCase() === 'canvas' ? host : host.querySelector('canvas');
  if (canvas) return downloadCanvasPng(canvas, filename);

  // 2) Aks holda SVG'ni canvasga chizib yuklaymiz
  const svg = host.tagName?.toLowerCase() === 'svg' ? host : host.querySelector('svg');
  if (!svg) return false;
  try {
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const base =
        svg.viewBox?.baseVal?.width ||
        parseInt(svg.getAttribute('width'), 10) ||
        110;
      const scale = 6, pad = 24, dim = base * scale;
      const c = document.createElement('canvas');
      c.width = dim + pad * 2;
      c.height = dim + pad * 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, pad, pad, dim, dim);
      downloadCanvasPng(c, filename);
    };
    img.src = svg64;
    return true;
  } catch {
    return false;
  }
}

// Orqaga moslik uchun eski nom
export const downloadQRById = downloadQR;
