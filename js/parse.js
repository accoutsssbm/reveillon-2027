// Leitura de texto livre: receitas ("Arroz 1 kg, 2 latas de milho, sal a gosto")
// e listas de pessoas (texto colado, .txt, .csv, .xlsx ou contatos .vcf).
import { norm } from './util.js';

const NUMW = { meia: .5, meio: .5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12 };
// unidade digitada → [unidade de compra, fator]
const UNITS = [
  [/^(kg|kgs|quilo|quilos)$/, 'kg', 1], [/^(g|gr|grs|grama|gramas)$/, 'kg', .001],
  [/^(l|lt|lts|litro|litros)$/, 'L', 1], [/^(ml|mls)$/, 'L', .001],
  [/^(un|und|unid|unidade|unidades)$/, 'un', 1],
  [/^(lata|latas)$/, 'lata', 1], [/^(pct|pcts|pacote|pacotes)$/, 'pct', 1],
  [/^(cx|caixa|caixas|caixinha|caixinhas)$/, 'cx', 1], [/^(dz|duzia|duzias)$/, 'dúzia', 1],
  [/^(maco|macos)$/, 'maço', 1], [/^(bandeja|bandejas)$/, 'bandeja', 1],
  [/^(garrafa|garrafas)$/, 'garrafa', 1], [/^(pote|potes|vidro|vidros)$/, 'pote', 1],
  [/^(dente|dentes)$/, 'dente', 1], [/^(colher|colheres)$/, 'colher', 1], [/^(xicara|xicaras|copo|copos)$/, 'xícara', 1]
];
const MEDIDA = { colher: .015, 'xícara': .2, dente: .005 }; // aproximação em kg/L

function unitOf(w) { const n = norm(w); for (const [re, un, f] of UNITS) if (re.test(n)) return { un, f }; return null; }
function parseNum(tok) {
  const t = norm(tok);
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/'); return +a / +b; }
  if (/^\d+([.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
  if (t in NUMW) return NUMW[t];
  return null;
}
const singular = w => w.replace(/(oes|aes)$/, 'ao').replace(/(ns)$/, 'm').replace(/([^s])s$/, '$1');
const key = s => norm(s).replace(/[-_/]/g, ' ').split(/\s+/).filter(w => !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w)).map(singular).join(' ');

export function matchInsumo(nome, insumos) {
  const k = key(nome); if (!k) return null;
  let best = null, score = 0;
  for (const i of insumos) {
    const ik = key(i.nome.replace(/\d+\s*(g|kg|ml|l)\b/gi, ''));
    let s = 0;
    if (ik === k) s = 100;
    else if (ik.startsWith(k + ' ') || k.startsWith(ik + ' ')) s = 70;
    else if (ik.split(' ')[0] === k.split(' ')[0] && k.split(' ')[0].length > 3) s = 40;
    if (s > score) { score = s; best = i; }
  }
  return score >= 40 ? best : null;
}

// Uma linha por ingrediente ou separados por vírgula/ponto e vírgula.
export function parseRecipe(text, insumos) {
  const parts = String(text || '').split(/[\n,;]+| e (?=\d)/).map(s => s.trim().replace(/^\s*(?:[-•*]+|\d+[.)])\s*/, '')).filter(Boolean);
  return parts.map(raw => {
    let s = raw.replace(/\(.*?\)/g, ' ').replace(/(\d)([a-zA-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
    const aGosto = /a gosto|q\.?b\.?|pitada/i.test(s);
    s = s.replace(/a gosto|q\.?b\.?|uma pitada de|pitada de|pitada/ig, '').trim();
    const w = s.split(' ');
    let q = null, u = null, nameW = [];
    for (let i = 0; i < w.length; i++) {
      const n = q == null ? parseNum(w[i]) : null;
      if (n != null) { q = n; const un = w[i + 1] && unitOf(w[i + 1]); if (un) { u = un; i++; } continue; }
      if (q != null && !u && unitOf(w[i]) && nameW.length === 0) { u = unitOf(w[i]); continue; }
      nameW.push(w[i]);
    }
    let nome = nameW.join(' ').replace(/^(de|da|do)\s+/i, '').trim();
    if (!nome) nome = raw;
    nome = nome.charAt(0).toUpperCase() + nome.slice(1);
    const m = matchInsumo(nome, insumos);
    let un = u ? u.un : (m ? m.un : 'un'), qq = q == null ? null : q * (u ? u.f : 1), aviso = '';
    if (m && u && MEDIDA[u.un] && ['kg', 'L'].includes(m.un)) { qq = q * MEDIDA[u.un]; un = m.un; }
    else if (m && u && u.un !== m.un) aviso = `vendido em ${m.un}`;
    else if (m) { un = m.un; if (q != null && !u && ['kg', 'L'].includes(m.un)) aviso = `confira: ${q} ${m.un}?`; }
    if (aGosto && qq == null) { qq = ['kg', 'L'].includes(un) ? .02 : .2; aviso = 'a gosto'; }
    if (qq == null) { qq = 1; aviso = aviso || 'confira a quantidade'; }
    if (!m && MEDIDA[un]) { qq = qq * MEDIDA[un]; un = 'kg'; }
    return { raw, nome, q: Math.round(qq * 1000) / 1000, un, i: m ? m.id : '', aviso };
  });
}

// ----- pessoas -----
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
export function parsePeople(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let line of lines) {
    if (/^nome\b/i.test(line) && /(telefone|whats|tipo)/i.test(line)) continue; // cabeçalho
    let tel = '';
    const pm = line.match(PHONE);
    if (pm && pm[1].replace(/\D/g, '').length >= 8) { tel = pm[1].replace(/[^\d+]/g, ''); line = line.replace(pm[1], ' '); }
    const toks = line.split(/[;\t,|]| - /).map(t => t.trim()).filter(Boolean);
    let tipo = 'adulto', dorme = false, status = '';
    const names = [];
    for (let t of toks) {
      const age = t.match(/\b(\d{1,2})\s*anos?\b/i);
      if (age) { if (+age[1] < 12) tipo = 'crianca'; t = t.replace(age[0], '').trim(); if (!t) continue; }
      const n = norm(t);
      if (/^(crianca|criancas|kid|infantil|filho|filha|c)$/.test(n) || /\bcrianca\b/.test(n)) { tipo = 'crianca'; continue; }
      if (/^(adulto|a)$/.test(n)) continue;
      if (/^(dorme|vai dormir|dormir|sim dorme)$/.test(n)) { dorme = true; continue; }
      if (/^(sim|vou|confirmado)$/.test(n)) { status = 'sim'; continue; }
      if (/^(talvez)$/.test(n)) { status = 'talvez'; continue; }
      if (/^(nao|nao vou)$/.test(n)) { status = 'nao'; continue; }
      if (/^\d{1,2}( anos)?$/.test(n)) { if (parseInt(n) < 12) tipo = 'crianca'; continue; }
      names.push(t.replace(/\s+/g, ' '));
    }
    if (!names.length) continue;
    if (names.length > 1 && !tel) names.forEach(nm => out.push({ nome: nm, telefone: '', tipo: 'adulto', dorme: false, status: status || 'sim' }));
    else out.push({ nome: names[0], telefone: tel, tipo, dorme, status: status || 'sim' });
  }
  return out;
}

export function parseVcf(text) {
  const out = [];
  for (const card of String(text).split(/BEGIN:VCARD/i).slice(1)) {
    const fn = (card.match(/^FN[^:]*:(.+)$/im) || [])[1];
    const tel = (card.match(/^TEL[^:]*:(.+)$/im) || [])[1];
    if (fn) out.push({ nome: fn.trim(), telefone: (tel || '').replace(/[^\d+]/g, ''), tipo: 'adulto', dorme: false, status: 'sim' });
  }
  return out;
}

let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxLoading = xlsxLoading || new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => err(new Error('Não consegui abrir planilhas agora. Salve como .csv e tente de novo.'));
    document.head.appendChild(s);
  });
}

// Lê arquivo anexado e devolve as pessoas encontradas.
export async function peopleFromFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.vcf')) return parseVcf(await file.text());
  if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.ods')) {
    const X = await loadXlsx();
    const wb = X.read(await file.arrayBuffer());
    const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    return parsePeople(rows.map(r => r.filter(c => c != null && String(c).trim() !== '').join(';')).join('\n'));
  }
  return parsePeople(await file.text());
}
