// Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) e QR Code.
import qrcode from './vendor/qrcode.mjs';

const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').trim();
const f = (id, v) => id + String(v.length).padStart(2, '0') + v;

export function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function chaveFormatada(tipo, chave) {
  const c = String(chave || '').trim();
  if (!c) return '';
  if (tipo === 'telefone') {
    let d = c.replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return '+' + d;
  }
  if (tipo === 'cpf' || tipo === 'cnpj') return c.replace(/\D/g, '');
  if (tipo === 'email') return c.toLowerCase();
  return c;
}

// Retorna '' quando falta chave, nome ou cidade.
export function pixPayload({ tipo, chave, nome, cidade, valor, txid }) {
  const k = chaveFormatada(tipo, chave);
  const n = ascii(nome).toUpperCase().slice(0, 25), c = ascii(cidade).toUpperCase().slice(0, 15);
  if (!k || !n || !c) return '';
  let s = f('00', '01')
    + f('26', f('00', 'br.gov.bcb.pix') + f('01', k))
    + f('52', '0000') + f('53', '986');
  if (valor && valor > 0) s += f('54', (Math.round(valor * 100) / 100).toFixed(2));
  s += f('58', 'BR') + f('59', n) + f('60', c)
    + f('62', f('05', (ascii(txid || '***').replace(/\s/g, '') || '***').slice(0, 25)))
    + '6304';
  return s + crc16(s);
}

export function pixFromConfig(cfg, valor, txid) {
  return pixPayload({ tipo: cfg.pix_tipo, chave: cfg.pix_chave, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valor, txid });
}

// matriz do QR (para SVG e canvas)
export function qrMatrix(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
  return m;
}
export function qrSvg(text, size = 220) {
  const m = qrMatrix(text), n = m.length, pad = 3, t = n + pad * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + pad} ${r + pad}h1v1h-1z`; }));
  return `<svg viewBox="0 0 ${t} ${t}" width="${size}" height="${size}" role="img" aria-label="QR Code do Pix" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
export function drawQr(ctx, text, x, y, size) {
  const m = qrMatrix(text), n = m.length, pad = 3, s = size / (n + pad * 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#000';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) ctx.fillRect(Math.floor(x + (c + pad) * s), Math.floor(y + (r + pad) * s), Math.ceil(s), Math.ceil(s)); }));
}
