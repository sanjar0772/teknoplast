// QR kodni (qrcode.react SVG) PNG rasm sifatida yuklab olish.
// svgEl — DOMdagi <svg> elementi (QRCodeSVG render qilgan).
export function downloadQRPng(svgEl, filename = 'qr-kod.png', scale = 6) {
  if (!svgEl) return;
  try {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const base =
        svgEl.viewBox?.baseVal?.width ||
        svgEl.width?.baseVal?.value ||
        parseInt(svgEl.getAttribute('width'), 10) ||
        110;
      const pad = 24;
      const dim = base * scale;
      const canvas = document.createElement('canvas');
      canvas.width = dim + pad * 2;
      canvas.height = dim + pad * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, dim, dim);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      a.click();
    };
    img.src = svg64;
  } catch {
    /* sukut — yuklab bo'lmasa, foydalanuvchi chop etishi mumkin */
  }
}

// Element id bo'yicha ichidagi birinchi <svg> ni topib yuklab olish.
export function downloadQRById(elementId, filename) {
  const host = document.getElementById(elementId);
  const svg = host?.tagName?.toLowerCase() === 'svg' ? host : host?.querySelector('svg');
  downloadQRPng(svg, filename);
}
