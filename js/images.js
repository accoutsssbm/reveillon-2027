// Imagens informativas (1080 x 1350) para baixar ou mandar no grupo.
import { brl, fq } from './util.js';
import { CATS } from './calc.js';
import { pixFromConfig, chaveFormatada, drawQr } from './pix.js';

const W = 1080, H = 1350;

function header(ctx, cfg, sub) {
  ctx.fillStyle = '#17181c'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, '#dfe2e6'); g.addColorStop(.5, '#80868f'); g.addColorStop(1, '#c9cdd2');
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = .25 + ((i * 37) % 10) / 22;
    ctx.fillStyle = g; ctx.fillRect(i * 4.2, 0, 2.2, 360);
  }
  ctx.globalAlpha = 1;
  const fade = ctx.createLinearGradient(0, 150, 0, 380);
  fade.addColorStop(0, 'rgba(23,24,28,0)'); fade.addColorStop(1, 'rgba(23,24,28,1)');
  ctx.fillStyle = fade; ctx.fillRect(0, 150, W, 230);
  // balões
  const ball = (x, y, r, chrome) => {
    const rg = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
    if (chrome) { rg.addColorStop(0, '#fff'); rg.addColorStop(.4, '#c4c8ce'); rg.addColorStop(.85, '#6b717a'); rg.addColorStop(1, '#9aa0a8'); }
    else { rg.addColorStop(0, '#fff'); rg.addColorStop(.75, '#e8e9eb'); rg.addColorStop(1, '#b9bcc1'); }
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  };
  [[70, 70, 58, 1], [150, 40, 44, 0], [40, 170, 46, 0], [120, 140, 30, 1], [1010, 60, 54, 0], [940, 40, 36, 1], [1040, 160, 34, 1]].forEach(b => ball(...b));
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = '400 104px Allura, cursive'; ctx.fillText('Feliz Ano Novo', W / 2, 150);
  const mg = ctx.createLinearGradient(0, 170, 0, 310);
  mg.addColorStop(0, '#ffffff'); mg.addColorStop(.48, '#b8bdc4'); mg.addColorStop(.52, '#8a9099'); mg.addColorStop(1, '#f2f3f5');
  ctx.font = '700 150px Outfit, sans-serif'; ctx.fillStyle = mg; ctx.fillText('2027', W / 2, 300);
  ctx.font = '500 30px Outfit, sans-serif'; ctx.fillStyle = '#c9ccd3';
  ctx.fillText([cfg.evento, cfg.data, cfg.local].filter(Boolean).join('  ·  '), W / 2, 352);
  ctx.font = '600 40px Outfit, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(sub, W / 2, 410);
  ctx.textAlign = 'left';
}

function card(ctx, x, y, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 28); ctx.fill();
}

const fit = (ctx, t, w) => { if (ctx.measureText(t).width <= w) return t; while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };

// rows: {h:'título'} | {t, r, c}  — distribui em 1 ou 2 colunas com a maior fonte que couber
function drawRows(ctx, rows, x, y, w, h) {
  for (let fs = 34; fs >= 17; fs--) {
    const lh = fs * 1.42, hh = fs * 1.9;
    const height = rs => rs.reduce((s, r) => s + (r.h ? hh : lh), 0);
    for (const cols of [1, 2]) {
      if (cols === 2 && fs > 28) continue;
      const per = []; let cur = [], acc = 0;
      const lim = h;
      for (const r of rows) {
        const rh = r.h ? hh : lh;
        if (acc + rh > lim && cur.length) { per.push(cur); cur = []; acc = 0; }
        cur.push(r); acc += rh;
      }
      per.push(cur);
      if (per.length > cols) continue;
      const cw = (w - (cols - 1) * 40) / cols;
      per.forEach((col, ci) => {
        let yy = y; const cx = x + ci * (cw + 40);
        for (const r of col) {
          if (r.h) {
            ctx.font = `700 ${Math.round(fs * 1.05)}px Outfit, sans-serif`; ctx.fillStyle = '#17181c';
            ctx.fillText(fit(ctx, r.h, cw), cx, yy + hh * .72);
            ctx.fillStyle = '#d5d8dd'; ctx.fillRect(cx, yy + hh * .86, cw, 2); yy += hh;
          } else {
            ctx.font = `500 ${fs}px Outfit, sans-serif`;
            let rw = 0;
            if (r.r) { ctx.font = `600 ${fs}px Outfit, sans-serif`; rw = ctx.measureText(r.r).width + 16; ctx.fillStyle = r.c || '#17181c'; ctx.textAlign = 'right'; ctx.fillText(r.r, cx + cw, yy + lh * .72); ctx.textAlign = 'left'; }
            ctx.font = `500 ${fs}px Outfit, sans-serif`; ctx.fillStyle = r.m ? '#6b7079' : '#23252b';
            ctx.fillText(fit(ctx, r.t, cw - rw), cx, yy + lh * .72); yy += lh;
          }
        }
      });
      return true;
    }
  }
  return false;
}

function pixBlock(ctx, cfg, valor, x, y) {
  const payload = pixFromConfig(cfg, valor);
  if (!payload) return 0;
  drawQr(ctx, payload, x, y, 230);
  ctx.fillStyle = '#17181c'; ctx.font = '700 32px Outfit, sans-serif';
  ctx.fillText('Pague pelo Pix', x + 260, y + 50);
  ctx.font = '500 26px Outfit, sans-serif'; ctx.fillStyle = '#3a3d44';
  ctx.fillText('Chave: ' + fit(ctx, chaveFormatada(cfg.pix_tipo, cfg.pix_chave), 520), x + 260, y + 96);
  ctx.fillText(fit(ctx, cfg.pix_nome || '', 600), x + 260, y + 136);
  if (valor) { ctx.font = '700 30px Outfit, sans-serif'; ctx.fillStyle = '#17181c'; ctx.fillText('Valor: ' + brl(valor), x + 260, y + 186); }
  else { ctx.fillStyle = '#6b7079'; ctx.fillText('Use o valor da sua parte.', x + 260, y + 186); }
  return 260;
}

export async function buildImage(kind, { S, C, nome, extra }) {
  try { await Promise.all([document.fonts.load('104px Allura'), document.fonts.load('700 40px Outfit'), document.fonts.load('500 30px Outfit')]); } catch (e) {}
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), cfg = S.config || {};
  const titles = { resumo: 'Resumo da festa', cardapio: 'Cardápio e quem leva', pagamentos: 'Pagamentos', pessoa: 'Sua parte' };
  header(ctx, cfg, titles[kind] || '');
  const X = 50, Y = 450, CW = W - 100, CH = H - Y - 50;
  card(ctx, X, Y, CW, CH);
  const ix = X + 44, iw = CW - 88; let iy = Y + 40, ih = CH - 80;
  const rows = [];
  if (kind === 'resumo') {
    ctx.fillStyle = '#6b7079'; ctx.font = '500 30px Outfit, sans-serif'; ctx.fillText('Valor por adulto', ix, iy + 30);
    ctx.fillStyle = '#17181c'; ctx.font = '700 84px Outfit, sans-serif'; ctx.fillText(C.div ? brl(C.cota) : '—', ix, iy + 120);
    ctx.font = '500 30px Outfit, sans-serif'; ctx.fillStyle = '#3a3d44';
    ctx.fillText(`${C.A + C.K} confirmados · ${C.A} adultos · ${C.K} crianças` + (C.K ? ` (criança: ${brl(C.cotaK)})` : ''), ix, iy + 172);
    ctx.fillText(`Total da festa: ${brl(C.total)} · ${C.dA + C.dK} vão dormir`, ix, iy + 214);
    iy += 250; ih -= 250;
    const q = pixBlock(ctx, cfg, 0, ix, Y + CH - 270); if (q) ih -= q;
    const conf = S.pessoas.filter(p => p.status === 'sim').map(p => p.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    ctx.fillStyle = '#17181c'; ctx.font = '700 30px Outfit, sans-serif'; ctx.fillText(`Confirmados (${conf.length})`, ix, iy + 28);
    let fs = 28, lines;
    const wrap = () => { ctx.font = `500 ${fs}px Outfit, sans-serif`; const L = []; let cur = '';
      for (const n of conf) { const t = cur ? cur + '  ·  ' + n : n; if (ctx.measureText(t).width > iw && cur) { L.push(cur); cur = n; } else cur = t; }
      if (cur) L.push(cur); return L; };
    do { lines = wrap(); } while (lines.length * fs * 1.45 > ih - 50 && --fs > 14);
    ctx.fillStyle = '#23252b'; lines.forEach((l, k) => ctx.fillText(fit(ctx, l, iw), ix, iy + 70 + k * fs * 1.45));
    if (!conf.length) { ctx.fillStyle = '#6b7079'; ctx.fillText('Ninguém confirmado ainda', ix, iy + 70); }
  }
  if (kind === 'cardapio') {
    const nm = id => (S.pessoas.find(p => p.id === id) || {}).nome;
    for (const c of Object.keys(CATS)) {
      const ps = S.pratos.filter(p => p.sel && p.cat === c);
      if (!ps.length) continue;
      rows.push({ h: CATS[c] });
      ps.forEach(p => rows.push({ t: p.nome, r: nm(p.resp) || 'ninguém ainda', c: p.resp ? '#17181c' : '#b3261e' }));
    }
    const dec = S.decor.filter(d => d.sel);
    if (dec.length) { rows.push({ h: 'Decoração' }); dec.forEach(d => rows.push({ t: d.nome, r: nm(d.resp) || 'ninguém ainda', c: d.resp ? '#17181c' : '#b3261e' })); }
    const its = S.itens.filter(x => x.sel && x.resp);
    if (its.length) { rows.push({ h: 'Bebidas e estrutura' }); its.forEach(x => rows.push({ t: x.nome, r: nm(x.resp) })); }
  }
  if (kind === 'pagamentos') {
    const lista = Object.entries(C.pag).map(([id, r]) => ({ p: S.pessoas.find(x => x.id === id) || { nome: '?' }, r }))
      .sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
    const pagos = lista.filter(x => x.r.saldo <= 0.009), faltam = lista.filter(x => x.r.saldo > 0.009);
    ctx.fillStyle = '#3a3d44'; ctx.font = '500 30px Outfit, sans-serif';
    ctx.fillText(`Valor por adulto: ${brl(C.cota)}${C.K && C.cotaK ? ` · criança: ${brl(C.cotaK)}` : ''}`, ix, iy + 30);
    iy += 56; ih -= 56;
    const q = pixBlock(ctx, cfg, 0, ix, Y + CH - 270); if (q) ih -= q;
    rows.push({ h: `Falta pagar (${faltam.length})` });
    faltam.forEach(x => rows.push({ t: x.r.membros.length > 1 ? `Família de ${x.p.nome} (${x.r.membros.length})` : x.p.nome, r: brl(x.r.saldo), c: '#b3261e' }));
    if (!faltam.length) rows.push({ t: 'Ninguém. Tudo pago!', m: 1 });
    rows.push({ h: `Já pagaram (${pagos.length})` });
    pagos.forEach(x => rows.push({ t: x.r.membros.length > 1 ? `Família de ${x.p.nome} (${x.r.membros.length})` : x.p.nome, r: x.r.saldo < -0.009 ? 'receber ' + brl(-x.r.saldo) : 'pago', c: '#1f7a4d' }));
    if (!pagos.length) rows.push({ t: 'Ninguém ainda', m: 1 });
  }
  if (kind === 'pessoa') {
    const r = extra;
    ctx.fillStyle = '#6b7079'; ctx.font = '500 32px Outfit, sans-serif'; ctx.fillText(fit(ctx, r.membros.length > 1 ? 'Família de ' + nome : nome, iw), ix, iy + 34);
    ctx.fillStyle = '#17181c'; ctx.font = '700 96px Outfit, sans-serif'; ctx.fillText(brl(Math.max(r.saldo, 0)), ix, iy + 140);
    ctx.font = '500 28px Outfit, sans-serif'; ctx.fillStyle = '#3a3d44';
    const lines = [r.membros.length > 1 ? `${r.membros.map(m => m.nome + ' ' + brl(m.v)).join(' · ')}` : `Cota: ${brl(r.devido)}`, `Cota total: ${brl(r.devido)}`, `Já gastou com a festa: ${brl(r.gasto)}`, `Já pagou: ${brl(r.pago)}`];
    lines.forEach((l, k) => ctx.fillText(fit(ctx, l, iw), ix, iy + 200 + k * 44));
    pixBlock(ctx, cfg, Math.max(r.saldo, 0), ix, Y + CH - 290);
  }
  if (rows.length) drawRows(ctx, rows, ix, iy, iw, ih);
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}
