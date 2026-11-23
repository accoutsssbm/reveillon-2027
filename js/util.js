// Funções pequenas usadas em todo o app.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fq = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const nv = v => String(v ?? '').replace('.', ',');
export const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); const x = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(x) ? x : 0; };
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const by = (a, k) => [...a].sort((x, y) => String(x[k] ?? '').localeCompare(String(y[k] ?? ''), 'pt-BR'));
export const clone = o => JSON.parse(JSON.stringify(o));
export const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

// Telefone para link do WhatsApp (assume Brasil quando vier sem DDI)
export function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
export const waLink = (tel, text) => {
  const n = waNumber(tel);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};
export const fmtTel = tel => {
  const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel || '';
};

let toastT = 0, undoFn = null;
export function toast(msg, undo) {
  const t = $('#toast');
  $('#toast-t').textContent = msg;
  undoFn = undo || null;
  $('#toast-b').hidden = !undo;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 7000 : 3500);
}
export function initToast() {
  $('#toast-b').addEventListener('click', () => { const f = undoFn; undoFn = null; $('#toast').hidden = true; if (f) f(); });
}

export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado.'); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); toast(ok ? 'Copiado.' : 'Não deu para copiar neste navegador.'); return ok;
  }
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Compartilha arquivos (celular abre a folha de compartilhar, com WhatsApp). Retorna false se não suportado.
export async function shareFiles(files, text) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return true; }
  return false;
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
