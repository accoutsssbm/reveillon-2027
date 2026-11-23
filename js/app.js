import { $, $$, esc, brl, fq, nv, num, norm, by, clone, sum, waLink, waNumber, fmtTel, toast, initToast, copyText, downloadBlob, shareFiles, store } from './util.js';
import { calc, CATS, ICATS, ST, rnd } from './calc.js';
import { parseRecipe, parsePeople, peopleFromFile } from './parse.js';
import { pixFromConfig, chaveFormatada, qrSvg } from './pix.js';
import { buildImage } from './images.js';
import * as db from './db.js';

/* ================= estado ================= */
const S = { config: {}, pessoas: [], insumos: [], pratos: [], itens: [], decor: [], contatos: {} };
let C = null, auth = null, loaded = false;
const ui = {
  sub: { comida: 'ceia', festa: 'decoracao' }, busca: '', opened: new Set(),
  me: store.get('rev27_eu', ''), divulgar: store.get('rev27_div', { resumo: true, cardapio: true, pagamentos: true, pix: true })
};
const meus = () => store.get('rev27_meus', []).filter(m => S.pessoas.some(p => p.id === m.id));
const tokenOf = id => (store.get('rev27_meus', []).find(m => m.id === id) || {}).token;
const nomeDe = id => (S.pessoas.find(p => p.id === id) || {}).nome || '';
const lim = () => +S.config.limite || 3;
const guestUrl = () => location.href.split('#')[0];
const folderUrl = () => new URL('folder/', guestUrl()).href;

const ICON = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  check: 'M4 12l5 5L20 6',
  plate: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10a5 5 0 0 1 0-10z',
  wallet: 'M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  people: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'
};
const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

const GUEST = [['inicio', 'Início', 'home'], ['confirmar', 'Confirmar', 'check'], ['cardapio', 'Cardápio', 'plate'], ['pagar', 'Pagamento', 'wallet']];
const ORG = [['org', 'Painel', 'grid'], ['org-pessoas', 'Pessoas', 'people'], ['org-comida', 'Comida', 'plate'], ['org-festa', 'Festa', 'star'], ['org-dinheiro', 'Dinheiro', 'wallet']];

function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('org')) return { mode: 'org', page: ORG.some(r => r[0] === h) ? h : 'org' };
  return { mode: 'guest', page: GUEST.some(r => r[0] === h) ? h : 'inicio' };
}

/* ================= dados ================= */
async function reload(tables = db.TABLES) {
  try {
    const res = await Promise.all(tables.map(t => db.load(t)));
    tables.forEach((t, i) => { if (t === 'config') S.config = res[i][0] || {}; else S[t] = res[i]; });
    if (auth) S.contatos = Object.fromEntries((await db.loadContatos()).map(c => [c.pessoa_id, c.telefone]));
    if (!auth) ui.admin = null; else if (ui.admin == null) ui.admin = await db.souAdmin();
    loaded = true; banner('');
  } catch (e) { banner(e.message); }
  schedule();
}
let rt = {};
function changed(table) {
  const t = table === 'contatos' ? 'pessoas' : table;
  if (!db.TABLES.includes(t)) return;
  clearTimeout(rt[t]); rt[t] = setTimeout(() => reload([t]), 400);
}
async function write(fn, tables) {
  try { await fn(); } catch (e) { toast(e.message); }
  await reload(tables);
}
// edição direta (organizador), com atualização imediata na tela
function patch(table, id, p) {
  if (table === 'config') { Object.assign(S.config, p); schedule(); return write(() => db.update('config', 1, p), ['config']); }
  const o = S[table].find(x => x.id === id); if (o) Object.assign(o, p);
  schedule();
  return write(() => db.update(table, id, p), [table]);
}
function delWithUndo(table, id) {
  const o = S[table].find(x => x.id === id); if (!o) return;
  const tel = table === 'pessoas' ? S.contatos[id] : null;
  S[table] = S[table].filter(x => x.id !== id); schedule();
  write(() => db.remove(table, id), [table]);
  toast(`“${o.nome}” excluído.`, () => write(async () => {
    await db.insert(table, [o]);
    if (tel) await db.upsert('contatos', { pessoa_id: id, telefone: tel });
  }, [table]));
}

function banner(t) { const b = $('#banner'); b.textContent = t; b.hidden = !t; }

/* ================= render ================= */
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

function render() {
  const r = route();
  document.body.dataset.mode = r.mode;
  C = calc(S);
  const ae = document.activeElement, k = ae && ae.dataset && ae.dataset.k;
  const sel = k && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  const y = scrollY;
  renderNav(r);
  let html;
  if (!db.configured) html = vSemConfig();
  else if (!loaded) html = `<p class="mut pad">Carregando a festa…</p>`;
  else if (r.mode === 'org' && !auth) html = vLogin();
  else html = (VIEWS[r.page] || vInicio)();
  $('#view').innerHTML = html;
  $$('#view details[data-open]').forEach(d => {
    if (ui.opened.has(d.dataset.open)) d.open = true;
    d.addEventListener('toggle', () => d.open ? ui.opened.add(d.dataset.open) : ui.opened.delete(d.dataset.open));
  });
  if (k) { const el = $(`[data-k="${CSS.escape(k)}"]`); if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch (e) {} } }
  scrollTo(0, y);
}

function renderNav(r) {
  const items = r.mode === 'org' ? (auth ? ORG : []) : GUEST;
  $('#nav').innerHTML = items.map(([id, label, ic]) =>
    `<a href="#${id}" class="${r.page === id ? 'on' : ''}" ${r.page === id ? 'aria-current="page"' : ''}>${ico(ic)}<span>${label}</span></a>`).join('');
  $('#nav').hidden = !items.length;
  $('#modo').innerHTML = r.mode === 'org'
    ? `<a href="#inicio" class="btn ghost sm">Tela do convidado</a>${auth ? `<button class="btn ghost sm" data-act="sair">Sair</button>` : ''}`
    : `<a href="#org" class="btn ghost sm">Organização</a>`;
}

/* ---------- pedaços ---------- */
const hero = (sub) => `<section class="hero">
  <svg class="hero-pic" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${HERO_SVG}</svg>
  <div class="hero-txt">
    <div class="script">Feliz Ano Novo</div>
    <div class="hero-sub">${esc([S.config.evento, S.config.data, S.config.local].filter(Boolean).join(' · '))}</div>
    ${sub}
  </div></section>`;
const kpis = () => `<div class="kp">
  <div class="big"><small>Valor por adulto</small><b>${C.div ? brl(C.cota) : '—'}</b>${C.K && C.cotaK ? `<small>Criança: ${brl(C.cotaK)}</small>` : ''}</div>
  <div><small>Confirmados</small><b>${C.A + C.K}</b><small>${C.A} adultos · ${C.K} crianças</small></div>
  <div><small>Total da festa</small><b>${brl(C.total)}</b><small>${diasTxt()}</small></div></div>`;
function diasTxt() { const d = Math.ceil((new Date(2027, 0, 1) - new Date()) / 864e5); return d > 0 ? `faltam ${d} dias` : 'Feliz 2027!'; }

const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const inp = (tb, id, f, v, o = {}) => `<input class="${o.cls || ''}" ${o.n ? 'inputmode="decimal"' : ''} data-tb="${tb}" data-id="${id}" data-f="${f}" ${o.n ? 'data-n="1"' : ''} data-k="${tb}-${id}-${f}" value="${esc(o.n ? nv(v) : v)}" aria-label="${esc(o.a || f)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>`;
const ck = (tb, id, f, v, txt) => `<label class="ck"><input type="checkbox" data-tb="${tb}" data-id="${id}" data-f="${f}" data-k="${tb}-${id}-${f}" ${v ? 'checked' : ''}><span>${txt}</span></label>`;
function respSel(tb, id, cur) {
  const ps = by(S.pessoas.filter(p => p.status !== 'nao'), 'nome');
  return `<select data-tb="${tb}" data-id="${id}" data-f="resp" data-k="${tb}-${id}-resp" aria-label="Responsável"><option value="">Sem responsável</option>${ps.map(p => {
    const n = C.load[p.id] || 0;
    return `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.nome)} (${n} tarefa${n === 1 ? '' : 's'}${n >= lim() && p.id !== cur ? ', cheia' : ''})</option>`;
  }).join('')}</select>`;
}
const chips = (key, opts) => `<div class="chips" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${ui.sub[key] === v}" class="${ui.sub[key] === v ? 'on' : ''}" data-act="sub" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
const tag = (t, c = '') => `<span class="tag ${c}">${t}</span>`;
const pixPay = v => pixFromConfig(S.config, v);

/* ================= TELAS DO CONVIDADO ================= */
function vInicio() {
  const m = meus();
  const conf = by(S.pessoas.filter(p => p.status === 'sim'), 'nome');
  const semResp = S.pratos.filter(p => p.sel && !p.resp).length;
  return hero(kpis()) + `
  ${m.length ? vMinhaParticipacao(m) : `<section class="card cta"><div><h2>Você vem?</h2><p class="mut">Confirme sua presença e a da sua família. Leva um minuto.</p></div><a class="btn pri" href="#confirmar">Confirmar presença</a></section>`}
  <div class="grid2">
    <section class="card"><h3>Confirmados (${conf.length})</h3>
      <div class="names">${conf.map(p => `<span>${esc(p.nome)}${p.tipo === 'crianca' ? ' <small>criança</small>' : ''}</span>`).join('') || '<span class="mut">Ninguém ainda.</span>'}</div>
      ${C.talvez ? `<p class="mut">${C.talvez} ainda em “talvez”.</p>` : ''}</section>
    <section class="card"><h3>Como funciona</h3>
      <p>Todo o custo da festa (comida, bebida, decoração, descartáveis e aluguel) é somado e dividido igualmente entre os adultos confirmados${+S.config.fcota > 0 ? `; criança paga ${fq(S.config.fcota * 100)}% do valor` : '; criança não paga'}.</p>
      <p>Quem leva um prato compra os ingredientes e esse gasto é descontado da sua parte.</p>
      <a class="btn" href="folder/">Como instalar e usar o app</a>
      ${semResp ? `<a class="btn" href="#cardapio">${semResp} prato(s) ainda sem ninguém, quer levar?</a>` : ''}</section>
  </div>`;
}
function vMinhaParticipacao(m) {
  return `<section class="card"><div class="row"><h2 class="grow">Sua participação</h2><a class="btn ghost sm" href="#confirmar">Adicionar pessoa</a></div>
  ${m.map(({ id }) => { const p = S.pessoas.find(x => x.id === id); const n = C.load[id] || 0;
    return `<div class="me-row"><div class="grow"><b>${esc(p.nome)}</b> <span class="mut">${p.tipo === 'crianca' ? 'criança' : 'adulto'}${n ? ` · ${n} tarefa(s)` : ''}</span></div>
    <div class="seg">${Object.entries(ST).filter(([k]) => k !== 'pend').map(([k, v]) => `<button data-act="g-st" data-id="${id}" data-v="${k}" class="${p.status === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <label class="ck"><input type="checkbox" data-act="g-dorme" data-id="${id}" ${p.dorme ? 'checked' : ''}><span>Vou dormir</span></label>
    ${C.fam[id] ? `<div class="fam-q"><span class="mut">Cobrança da família (${C.fam[id].length + 1} pessoas):</span><div class="seg"><button data-act="g-junto" data-id="${id}" data-v="1" class="${p.cobrar_junto !== false ? 'on' : ''}">Tudo junto</button><button data-act="g-junto" data-id="${id}" data-v="0" class="${p.cobrar_junto === false ? 'on' : ''}">Cada um a sua</button></div></div>` : ''}</div>`;
  }).join('')}</section>`;
}

function vConfirmar() {
  const m = meus();
  return `<h1 class="pt">Confirmar presença</h1>
  <p class="lead">Coloque você e quem vem com você. O WhatsApp é para a organização mandar sua parte do valor; só os organizadores veem.</p>
  ${m.length ? vMinhaParticipacao(m) : ''}
  <form id="f-reg" class="card">
    <div id="reg-rows">${regRow(0)}</div>
    <div class="row"><button type="button" class="btn" data-act="reg-add">+ Outra pessoa da família</button>
      <button type="button" class="btn ghost" data-act="imp-open" data-mode="guest">Tenho uma lista pronta</button></div>
    ${famOpts('reg')}
    <fieldset class="seg-f"><legend>Vocês vêm?</legend>
      <label><input type="radio" name="status" value="sim" checked><span>Vou</span></label>
      <label><input type="radio" name="status" value="talvez"><span>Talvez</span></label>
      <label><input type="radio" name="status" value="nao"><span>Não vou</span></label></fieldset>
    <button class="btn pri wide">Confirmar</button>
  </form>`;
}
// família no cadastro do convidado
function famOpts(pref) {
  const m = meus(), vistos = new Set(), ops = [];
  for (const { id } of m) {
    const p = S.pessoas.find(x => x.id === id); if (!p) continue;
    const h = p.de || p.id; if (vistos.has(h)) continue; vistos.add(h);
    ops.push(`<option value="${id}">Família de ${esc(nomeDe(h))}</option>`);
  }
  return `<div class="fam-opts">
    ${ops.length ? `<label class="l">Estas pessoas entram em qual família?<select id="${pref}-fam"><option value="">Nova família (a primeira pessoa é a responsável)</option>${ops.join('')}</select></label>` : ''}
    <label class="ck"><input type="checkbox" id="${pref}-junto" checked><span>Cobrar todos juntos, no nome da primeira pessoa</span></label>
    <p class="mut">Desmarque para cada adulto receber a própria cobrança. Dá para mudar depois.</p></div>`;
}
function regRow(i, org) {
  return `<div class="reg-row"><div class="f3">
    <label class="l">Nome${i || org ? '' : ' (você)'}<input name="nome" required autocomplete="${i || org ? 'off' : 'name'}"></label>
    <label class="l">WhatsApp${i || org ? ' (opcional)' : ''}<input name="tel" inputmode="tel" autocomplete="${i ? 'off' : 'tel'}" placeholder="(94) 9 9999-9999"></label>
    <label class="l">Idade<select name="tipo"><option value="adulto">Adulto</option><option value="crianca">Criança</option></select></label></div>
    <label class="ck"><input type="checkbox" name="dorme"><span>Vai dormir e tomar café da manhã</span></label>
    ${i ? '<button type="button" class="x" data-act="reg-del" aria-label="Tirar pessoa">Tirar</button>' : ''}</div>`;
}

function vCardapioG() {
  const m = meus(), me = meAtual();
  const pick = (tb, x) => {
    if (x.resp) {
      const mine = m.some(q => q.id === x.resp);
      return mine ? `<span class="who mine">${esc(nomeDe(x.resp))}</span><button class="btn sm ghost" data-act="g-drop" data-tb="${tb}" data-id="${x.id}" data-p="${x.resp}">Desistir</button>`
        : `<span class="who">${esc(nomeDe(x.resp))}</span>`;
    }
    return m.length ? `<button class="btn sm pri" data-act="g-pick" data-tb="${tb}" data-id="${x.id}">Eu levo</button>` : `<span class="who none">Precisa de alguém</span>`;
  };
  const meLoad = me ? (C.load[me] || 0) : 0;
  return `<h1 class="pt">Cardápio e quem leva</h1>
  <p class="lead">Escolha o que você vai levar. Quem leva compra os ingredientes ou materiais, e o valor é descontado da sua parte.</p>
  ${m.length > 1 ? `<label class="l me-sel">Você está escolhendo como<select data-act="g-me">${m.map(({ id }) => `<option value="${id}" ${id === me ? 'selected' : ''}>${esc(nomeDe(id))}</option>`).join('')}</select></label>` : ''}
  ${!m.length ? `<div class="alert">Para escolher um prato, <a href="#confirmar">confirme sua presença</a> primeiro.</div>` : meLoad >= lim() ? `<div class="alert">${esc(nomeDe(me))} já tem ${meLoad} tarefa(s). Deixe um pouco para os outros.</div>` : ''}
  ${Object.keys(CATS).map(c => { const ps = by(S.pratos.filter(p => p.sel && p.cat === c), 'nome'); if (!ps.length) return '';
    return `<section class="card"><h3>${CATS[c]}</h3>${ps.map(p => `<div class="pick-row"><span class="grow nm">${esc(p.nome)}${c === 'cafe' ? '' : ''}</span>${pick('pratos', p)}</div>`).join('')}</section>`; }).join('')}
  ${S.decor.some(d => d.sel) ? `<section class="card"><h3>Decoração</h3>${by(S.decor.filter(d => d.sel), 'nome').map(d => `<div class="pick-row"><span class="grow nm">${esc(d.nome)} <small class="mut">${esc(d.local)}</small></span>${pick('decor', d)}</div>`).join('')}</section>` : ''}
  ${S.itens.some(x => x.sel) ? `<section class="card"><h3>Bebidas, descartáveis e aluguel</h3>${by(S.itens.filter(x => x.sel), 'nome').map(x => `<div class="pick-row"><span class="grow nm">${esc(x.nome)} <small class="mut">${fq(C.it[x.id].q)} ${esc(x.un)}</small></span>${pick('itens', x)}</div>`).join('')}</section>` : ''}
  ${m.length ? `<section class="card cta"><div><h3>Quer levar outro prato?</h3><p class="mut">Escreva os ingredientes e para quantas pessoas a receita serve.</p></div><button class="btn pri" data-act="rec-open" data-mode="guest">Cadastrar meu prato</button></section>` : ''}`;
}
function meAtual() {
  const m = meus(); if (!m.length) return '';
  if (m.some(x => x.id === ui.me)) return ui.me;
  const ad = m.find(x => (S.pessoas.find(p => p.id === x.id) || {}).tipo !== 'crianca');
  return (ad || m[0]).id;
}

function vPagar() {
  const m = meus();
  const minhas = [...new Set(m.map(x => { const p = S.pessoas.find(q => q.id === x.id); return p ? C.alvo(p) : ''; }).filter(id => id && C.pag[id]))];
  const lista = Object.entries(C.pag).map(([id, r]) => ({ id, r, nome: nomeDe(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const pix = pixPay(0);
  return `<h1 class="pt">Pagamento</h1>
  <div class="grid2">
    <section class="card"><small class="mut">Valor por adulto</small><div class="big-n">${C.div ? brl(C.cota) : '—'}</div>
      <p class="mut">${C.K ? (C.cotaK ? `Criança: ${brl(C.cotaK)}. ` : 'Criança não paga. ') : ''}Total da festa ${brl(C.total)} dividido por ${fq(C.div)}. O valor muda conforme as confirmações.</p></section>
    ${minhas.map(id => { const r = C.pag[id], v = Math.max(r.saldo, 0), pl = pixPay(v);
      return `<section class="card"><small class="mut">${r.membros.length > 1 ? 'Parte da família de ' + esc(nomeDe(id)) + ' (' + esc(r.membros.map(x => x.nome).join(', ')) + ')' : 'Parte de ' + esc(nomeDe(id))}</small>
      <div class="big-n">${r.saldo > 0.009 ? brl(r.saldo) : r.saldo < -0.009 ? 'A receber ' + brl(-r.saldo) : 'Quitado'}</div>
      <p class="mut">Cota ${brl(r.devido)} · já gastou ${brl(r.gasto)} · já pagou ${brl(r.pago)}</p>
      ${r.saldo > 0.009 && pl ? `<div class="pix">${qrSvg(pl, 200)}<div><button class="btn pri" data-act="copy" data-v="${esc(pl)}">Copiar Pix copia e cola</button>
      ${S.config.whats_org ? `<a class="btn" target="_blank" rel="noopener" href="${esc(waLink(S.config.whats_org, `Oi! Já paguei minha parte do ${S.config.evento || 'réveillon'}: ${brl(v)} (${nomeDe(id)}).`))}">Avisar que paguei</a>` : ''}</div></div>` : ''}</section>`; }).join('')}
  </div>
  ${pix ? `<section class="card"><h3>Pix da festa</h3><div class="pix">${qrSvg(pix, 180)}<div>
    <p>Chave (${esc(S.config.pix_tipo)}): <b>${esc(chaveFormatada(S.config.pix_tipo, S.config.pix_chave))}</b><br>${esc(S.config.pix_nome)}</p>
    <button class="btn" data-act="copy" data-v="${esc(chaveFormatada(S.config.pix_tipo, S.config.pix_chave))}">Copiar chave</button>
    <button class="btn" data-act="copy" data-v="${esc(pix)}">Copiar Pix copia e cola</button>
    <p class="mut">Digite o valor da sua parte ao pagar.</p></div></div></section>` : `<div class="alert">A organização ainda não cadastrou a chave Pix.</div>`}
  <section class="card"><h3>Situação</h3>${lista.map(x => `<div class="pick-row"><span class="grow nm">${esc(x.nome)}</span>${x.r.saldo > 0.009 ? tag('falta ' + brl(x.r.saldo), 'bad') : tag('ok', 'ok')}</div>`).join('') || '<p class="mut">Ninguém confirmado ainda.</p>'}</section>`;
}

/* ================= TELAS DA ORGANIZAÇÃO ================= */
function vLogin() {
  return `<section class="card login"><h1 class="pt">Organização</h1><p class="mut">Entre com o usuário e a senha que você recebeu.</p>
  <form id="f-login"><label class="l">Usuário ou e-mail<input name="u" autocomplete="username" required></label>
  <label class="l">Senha${pwField('s', 'current-password')}</label>
  <button class="btn pri wide">Entrar</button></form>
  <button type="button" class="btn ghost sm" data-act="pw-forgot">Esqueci a senha</button></section>`;
}
// campo de senha com botão de mostrar/ocultar
const pwField = (name, ac) => `<span class="pw"><input name="${name}" type="password" autocomplete="${ac}" required ${ac === 'new-password' ? 'minlength="6"' : ''}><button type="button" class="btn ghost icon" data-act="pw-toggle" aria-label="Mostrar senha" aria-pressed="false">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="x" d="M4 4l16 16"/></svg></button></span>`;
function openEsqueci() {
  const u = ($('#f-login [name=u]') || {}).value || '';
  openDlg(`<h2>Recuperar senha</h2>
  <p>Digite o e-mail cadastrado. Vamos mandar um link para você criar uma senha nova.</p>
  <form id="f-esqueci"><label class="l">E-mail<input name="email" type="email" autocomplete="email" value="${esc(u.includes('@') ? u : '')}" required></label>
  <p class="mut">Se você entra só com o nome (sem e-mail), não há para onde mandar o link: peça a quem administra a festa para trocar sua senha no Supabase.</p>
  <div class="row"><button class="btn pri">Enviar link</button><button type="button" class="btn ghost" data-act="dlg-close">Cancelar</button></div></form>`);
}
function openMinhaSenha() {
  openDlg(`<h2>Mudar minha senha</h2>
  <form id="f-minhasenha"><label class="l">Senha atual${pwField('a', 'current-password')}</label>
  <label class="l">Senha nova (mínimo 6 caracteres)${pwField('s', 'new-password')}</label>
  <label class="l">Repita a senha nova${pwField('s2', 'new-password')}</label>
  <div class="row"><button class="btn pri">Salvar senha</button><button type="button" class="btn ghost" data-act="dlg-close">Cancelar</button></div></form>`);
}
async function openOrganizadores() {
  let lista = [];
  try { lista = await db.rpc('listar_organizadores'); } catch (e) { return toast(e.message); }
  openDlg(`<h2>Organizadores</h2>
  <p class="mut">Quem está aqui entra na tela da Organização e mexe em tudo, menos nesta lista.</p>
  <div>${lista.map(o => `<div class="pick-row"><span class="grow nm">${esc(o.email)}</span>${o.admin ? tag('admin', 'ok')
    : `<span class="row"><button type="button" class="btn sm" data-act="org-senha" data-v="${esc(o.email)}">Nova senha</button><button type="button" class="x" data-act="org-del" data-v="${esc(o.email)}">Remover</button></span>`}</div>`).join('')}</div>
  <h3 class="mt">Cadastrar organizador</h3>
  <form id="f-org"><div class="f2"><label class="l">Usuário${db.orgDomain ? ` (vira usuário@${esc(db.orgDomain)})` : ' (e-mail)'}<input name="u" autocomplete="off" required></label>
  <label class="l">Senha inicial (mínimo 6)${pwField('s', 'new-password')}</label></div>
  <p class="mut">Passe o usuário e a senha para a pessoa. Depois ela troca em Painel › Acesso › Mudar minha senha.</p>
  <div class="row"><button class="btn pri">Cadastrar</button><button type="button" class="btn ghost" data-act="dlg-close">Fechar</button></div></form>`);
}
function openSenhaOrg(email) {
  openDlg(`<h2>Nova senha</h2><p>Para <b>${esc(email)}</b>. Passe a senha nova para a pessoa; ela pode trocar depois em Painel › Acesso.</p>
  <form id="f-orgsenha"><input type="hidden" name="email" value="${esc(email)}">
  <label class="l">Senha nova (mínimo 6 caracteres)${pwField('s', 'new-password')}</label>
  <div class="row"><button class="btn pri">Salvar senha</button><button type="button" class="btn ghost" data-act="orgs-open">Voltar</button></div></form>`);
}
async function removerOrg(email) {
  if (!confirm(`Remover ${email}? A pessoa perde o acesso à Organização. Não dá para desfazer; para voltar, cadastre de novo.`)) return;
  try { await db.rpc('remover_organizador', { p_email: email }); toast(`${email} removido.`); openOrganizadores(); }
  catch (err) { toast(err.message); }
}
function openNovaSenha() {
  openDlg(`<h2>Criar senha nova</h2>
  <form id="f-novasenha"><label class="l">Senha nova (mínimo 6 caracteres)${pwField('s', 'new-password')}</label>
  <label class="l">Repita a senha nova${pwField('s2', 'new-password')}</label>
  <div class="row"><button class="btn pri">Salvar senha</button></div></form>`);
}
function vSemConfig() {
  return `<section class="card login"><h1 class="pt">Falta configurar</h1><p>Abra o arquivo <code>js/config.js</code> e cole a URL e a chave <i>anon</i> do seu projeto Supabase. O passo a passo está no README.</p></section>`;
}

function vPainel() {
  const t = C.tot, mx = Math.max(1, ...Object.values(t));
  const nomes = { comida: 'Comida da ceia', cafe: 'Café da manhã', bebida: 'Bebidas', descartavel: 'Descartáveis', aluguel: 'Aluguel', decoracao: 'Decoração' };
  const semResp = S.pratos.filter(p => p.sel && !p.resp).length + S.decor.filter(d => d.sel && !d.resp).length;
  const cheios = S.pessoas.filter(p => (C.load[p.id] || 0) > lim());
  const est = S.insumos.filter(i => i.est).length + S.itens.filter(x => x.est).length;
  const semPreco = S.insumos.filter(i => !+i.preco && S.pratos.some(p => p.sel && (p.ing || []).some(l => l.i === i.id))).length;
  const c = S.config;
  return hero(kpis()) + `
  ${cheios.length ? `<div class="alert bad">Sobrecarregados: ${cheios.map(p => esc(p.nome) + ' (' + C.load[p.id] + ')').join(', ')}.</div>` : ''}
  ${semPreco ? `<div class="alert bad">${semPreco} ingrediente(s) do cardápio sem preço. Veja <a href="#org-comida" data-act="sub" data-key="comida" data-v="compras">Comida › Compras e preços</a>.</div>` : ''}
  ${semResp ? `<div class="alert">${semResp} prato(s) ou decoração sem responsável.</div>` : ''}
  ${est ? `<div class="alert">${est} preços ainda são estimativa (marcados “est.”).</div>` : ''}
  <div class="grid2">
  <section class="card"><h3>Para onde vai o dinheiro</h3><div class="bars">${Object.entries(t).map(([k, v]) => `<div class="b"><span>${nomes[k]}</span><span class="tr"><i style="width:${v / mx * 100}%"></i></span><span class="r money">${brl(v)}</span></div>`).join('')}
    <div class="b tot"><b>Total</b><b class="r money">${brl(C.total)}</b></div></div></section>
  <section class="card"><h3>Link para os convidados</h3><p class="mut">Mande no grupo. Quem abre vê a festa, confirma presença e escolhe o que levar. Não consegue mexer em preços nem pagamentos.</p>
    <div class="row"><input readonly value="${esc(guestUrl())}" aria-label="Link"><button class="btn" data-act="copy" data-v="${esc(guestUrl())}">Copiar</button></div>
    <p class="mut">Folder com o passo a passo para instalar e usar o app:</p>
    <div class="row"><input readonly value="${esc(folderUrl())}" aria-label="Link do folder"><button class="btn" data-act="copy" data-v="${esc(folderUrl())}">Copiar</button><a class="btn" href="folder/">Abrir</a></div></section>
  </div>
  <section class="card"><h3>Acesso</h3><p class="mut">${ui.admin ? 'Você é a admin principal: cadastra quem organiza a festa. Cada um troca a própria senha aqui.' : 'Troque a senha que você recebeu por uma sua.'}</p>
    <div class="row"><button class="btn" data-act="senha-open">Mudar minha senha</button>${ui.admin ? '<button class="btn" data-act="orgs-open">Organizadores</button>' : ''}</div></section>
  ${vDivulgar()}
  <section class="card"><h3>Dados da festa e regras</h3><div class="f3">
    <label class="l">Nome do evento${inp('config', 1, 'evento', c.evento)}</label>
    <label class="l">Data${inp('config', 1, 'data', c.data)}</label>
    <label class="l">Local${inp('config', 1, 'local', c.local, { ph: 'Casa de quem?' })}</label>
    <label class="l">Tipo da chave Pix<select data-tb="config" data-id="1" data-f="pix_tipo" data-k="cfg-pixtipo">${opt({ telefone: 'Telefone', cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', aleatoria: 'Chave aleatória' }, c.pix_tipo)}</select></label>
    <label class="l">Chave Pix${inp('config', 1, 'pix_chave', c.pix_chave)}</label>
    <label class="l">Nome de quem recebe${inp('config', 1, 'pix_nome', c.pix_nome)}</label>
    <label class="l">Cidade de quem recebe${inp('config', 1, 'pix_cidade', c.pix_cidade, { ph: 'Parauapebas' })}</label>
    <label class="l">WhatsApp da organização${inp('config', 1, 'whats_org', c.whats_org, { ph: 'Recebe o “já paguei”' })}</label>
    <label class="l">Criança come (fração de 1 adulto)${inp('config', 1, 'fc', c.fc, { n: 1 })}</label>
    <label class="l">Criança paga (fração da cota)${inp('config', 1, 'fcota', c.fcota, { n: 1 })}</label>
    <label class="l">Limite de tarefas por pessoa${inp('config', 1, 'limite', c.limite, { n: 1 })}</label></div>
    <p class="mut">Criança paga 0 = não paga; 0,25 = paga um quarto. O Pix precisa de chave, nome e cidade para gerar o QR Code.</p></section>`;
}

function textoGrupo() {
  const d = ui.divulgar, L = [];
  L.push(`*${S.config.evento || 'Réveillon 2027'}*${S.config.data ? ' — ' + S.config.data : ''}${S.config.local ? '\n' + S.config.local : ''}`);
  if (d.resumo) {
    L.push(`\n*Resumo*\nConfirmados: ${C.A} adultos e ${C.K} crianças\nTotal da festa: ${brl(C.total)}\nValor por adulto: ${brl(C.cota)}${C.K && C.cotaK ? `\nValor por criança: ${brl(C.cotaK)}` : ''}`);
  }
  if (d.cardapio) {
    L.push('\n*Quem leva o quê*');
    for (const c of Object.keys(CATS)) {
      const ps = by(S.pratos.filter(p => p.sel && p.cat === c), 'nome'); if (!ps.length) continue;
      L.push(`_${CATS[c]}_`); ps.forEach(p => L.push(`• ${p.nome}: ${nomeDe(p.resp) || 'precisa de alguém'}`));
    }
    const dec = S.decor.filter(x => x.sel);
    if (dec.length) { L.push('_Decoração_'); dec.forEach(x => L.push(`• ${x.nome}: ${nomeDe(x.resp) || 'precisa de alguém'}`)); }
  }
  if (d.pagamentos) {
    const lista = Object.entries(C.pag).map(([id, r]) => ({ n: nomeDe(id), r })).sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));
    const f = lista.filter(x => x.r.saldo > 0.009), p = lista.filter(x => x.r.saldo <= 0.009);
    L.push('\n*Pagamentos*');
    if (f.length) { L.push('Falta pagar:'); f.forEach(x => L.push(`• ${x.r.membros.length > 1 ? `Família de ${x.n} (${x.r.membros.map(m => m.nome).join(', ')})` : x.n}: ${brl(x.r.saldo)}`)); }
    if (p.length) L.push('Já pagaram: ' + p.map(x => x.n).join(', '));
  }
  if (d.pix && S.config.pix_chave) {
    L.push(`\n*Pix* (${S.config.pix_tipo}): ${chaveFormatada(S.config.pix_tipo, S.config.pix_chave)}${S.config.pix_nome ? ' — ' + S.config.pix_nome : ''}`);
  }
  L.push(`\nConfirme presença e escolha o que levar: ${guestUrl()}`);
  return L.join('\n');
}
function vDivulgar() {
  const d = ui.divulgar;
  const box = (k, l) => `<label class="ck"><input type="checkbox" data-act="div" data-v="${k}" ${d[k] ? 'checked' : ''}><span>${l}</span></label>`;
  return `<section class="card" id="divulgar"><h3>Publicar no grupo</h3>
  <div class="row">${box('resumo', 'Resumo')}${box('cardapio', 'Quem leva o quê')}${box('pagamentos', 'Quem pagou e quem falta')}${box('pix', 'Pix')}</div>
  <textarea id="txt-grupo" rows="9" aria-label="Texto para o grupo">${esc(textoGrupo())}</textarea>
  <div class="row"><button class="btn pri" data-act="g-copy">Copiar texto</button>
    <a class="btn" target="_blank" rel="noopener" data-act="g-wa" href="https://wa.me/?text=${encodeURIComponent(textoGrupo())}">Abrir no WhatsApp</a></div>
  <h3 class="mt">Imagens para baixar</h3>
  <p class="mut">No celular, “Enviar” abre o WhatsApp direto. A imagem de pagamentos e a de resumo levam o QR Code do Pix.</p>
  <div class="imgs">${[['resumo', 'Resumo'], ['cardapio', 'Cardápio e quem leva'], ['pagamentos', 'Pagamentos e Pix']].map(([k, l]) =>
    `<div class="imgbtn"><b>${l}</b><div class="row"><button class="btn sm" data-act="img" data-v="${k}">Baixar</button><button class="btn sm ghost" data-act="img-share" data-v="${k}">Enviar</button></div></div>`).join('')}</div></section>`;
}

function vPessoas() {
  const chefes = by(S.pessoas.filter(p => !p.de), 'nome');
  const ord = { sim: 0, talvez: 1, pend: 2, nao: 3 };
  const ps = [...S.pessoas].sort((a, b) => (ord[a.status] - ord[b.status]) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const cnt = k => S.pessoas.filter(p => p.status === k).length;
  return `<h1 class="pt">Pessoas</h1>
  <div class="row stats">${tag(cnt('sim') + ' vão', 'ok')}${tag(cnt('talvez') + ' talvez', 'warn')}${tag(cnt('pend') + ' sem resposta')}${tag(cnt('nao') + ' não vão')}${tag((C.dA + C.dK) + ' dormem')}</div>
  <div class="card add"><h3>Adicionar</h3><p class="mut">Cadastre uma pessoa sozinha, uma família inteira ou alguém numa família que já existe.</p>
    <div class="row"><button type="button" class="btn pri" data-act="pes-open">Adicionar pessoa ou família</button>
    <button type="button" class="btn" data-act="imp-open" data-mode="org">Importar lista</button></div></div>
  <div class="cards">${ps.map(p => { const tel = S.contatos[p.id] || ''; const n = C.load[p.id] || 0;
    return `<div class="card pc ${p.status === 'nao' ? 'off' : ''}">
    <div class="r2">${inp('pessoas', p.id, 'nome', p.nome, { a: 'Nome', cls: 'strong' })}<button class="x" data-act="del" data-tb="pessoas" data-id="${p.id}">Excluir</button></div>
    <div class="seg">${Object.entries(ST).map(([k, v]) => `<button data-act="st" data-id="${p.id}" data-v="${k}" class="${p.status === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="f2"><label class="l">WhatsApp<input inputmode="tel" data-act="tel" data-id="${p.id}" data-k="tel-${p.id}" value="${esc(fmtTel(tel))}"></label>
    <label class="l">Idade<select data-tb="pessoas" data-id="${p.id}" data-f="tipo" data-k="pessoas-${p.id}-tipo">${opt({ adulto: 'Adulto', crianca: 'Criança' }, p.tipo)}</select></label>
    ${C.fam[p.id] ? `<div class="l">Família<span class="fam-tag">Responsável por ${C.fam[p.id].length} pessoa(s)</span></div>`
      : `<label class="l">Família de<select data-tb="pessoas" data-id="${p.id}" data-f="de" data-k="pessoas-${p.id}-de"><option value="">Ninguém (é a responsável ou vem sozinha)</option>${chefes.filter(a => a.id !== p.id).map(a => `<option value="${a.id}" ${a.id === p.de ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>`}</div>
    ${C.fam[p.id] ? `<div class="row">${ck('pessoas', p.id, 'cobrar_junto', p.cobrar_junto !== false, 'Cobrar a família junto')}<span class="mut">${esc(C.fam[p.id].map(x => x.nome).join(', '))}</span></div>` : ''}
    <div class="row">${ck('pessoas', p.id, 'dorme', p.dorme, 'Vai dormir')}<span class="grow"></span>${n ? tag(n + ' tarefa(s)', n > lim() ? 'bad' : '') : ''}
    ${tel ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(waLink(tel, `Oi, ${p.nome}! Tudo certo para o ${S.config.evento || 'réveillon'}? Confirme por aqui: ${guestUrl()}`))}">WhatsApp</a>` : ''}</div></div>`; }).join('') || '<p class="mut">Ninguém cadastrado ainda.</p>'}</div>`;
}

function pratoCard(p) {
  const r = C.pr[p.id], ins = by(S.insumos, 'nome');
  const semP = r.lines.filter(l => !+l.ins.preco).length;
  return `<div class="card ${p.sel ? '' : 'off'}">
  <div class="row">${ck('pratos', p.id, 'sel', p.sel, `<b class="nm">${esc(p.nome)}</b>`)}<span class="grow"></span><span class="money">${brl(r.t)}</span></div>
  <div class="mut">${fq(r.base)} porções · receita serve ${fq(p.rende)} pessoas${p.sugerido_por ? ' · sugerido por ' + esc(nomeDe(p.sugerido_por)) : ''}</div>
  ${semP ? `<div>${tag(semP + ' ingrediente(s) sem preço', 'bad')}</div>` : ''}
  ${p.sel ? respSel('pratos', p.id, p.resp) + (p.resp && (C.load[p.resp] || 0) > lim() ? tag('acima do limite de tarefas', 'bad') : '') : ''}
  <details data-open="pr-${p.id}"><summary>Receita e ingredientes</summary>
   <div class="f3 mt"><label class="l">Nome${inp('pratos', p.id, 'nome', p.nome)}</label>
   <label class="l">Serve quantas pessoas${inp('pratos', p.id, 'rende', p.rende, { n: 1 })}</label>
   <label class="l">Categoria<select data-tb="pratos" data-id="${p.id}" data-f="cat" data-k="pratos-${p.id}-cat">${opt(CATS, p.cat)}</select></label></div>
   <div class="ing">${r.lines.map((l, k) => `<div class="ln">
     <select class="a" data-tb="pratos" data-id="${p.id}" data-f="ing" data-sub="${k}" data-sf="i" data-k="pr-${p.id}-${k}-i" aria-label="Ingrediente">${ins.map(i => `<option value="${i.id}" ${i.id === l.i ? 'selected' : ''}>${esc(i.nome)} (${esc(i.un)})</option>`).join('')}</select>
     <input class="b" inputmode="decimal" data-tb="pratos" data-id="${p.id}" data-f="ing" data-sub="${k}" data-sf="q" data-n="1" data-k="pr-${p.id}-${k}-q" value="${nv(l.q)}" aria-label="Quantidade">
     <span class="c mut">${esc(l.ins.un)} · festa: ${fq(l.need)} · ${brl(l.cost)}</span>
     <button class="x z" data-act="ing-del" data-id="${p.id}" data-k2="${k}" aria-label="Tirar">×</button></div>`).join('')}</div>
   <div class="row mt"><button class="btn sm" data-act="ing-add" data-id="${p.id}">+ Ingrediente</button><button class="btn sm" data-act="rec-open" data-mode="org" data-id="${p.id}">Colar ingredientes em texto</button><span class="grow"></span><button class="x" data-act="del" data-tb="pratos" data-id="${p.id}">Excluir prato</button></div>
  </details></div>`;
}
function listaPratos(cats) {
  return cats.map(c => {
    const ps = by(S.pratos.filter(p => p.cat === c), 'nome'); if (!ps.length) return '';
    const on = ps.filter(p => p.sel), off = ps.filter(p => !p.sel);
    return `<section class="blk"><div class="row"><h3 class="grow">${CATS[c]}</h3>${tag(on.length + ' no cardápio')}</div>
    <div class="cards">${on.map(pratoCard).join('') || '<p class="mut">Nada escolhido.</p>'}</div>
    ${off.length ? `<details class="more" data-open="more-${c}"><summary>Mais ${off.length} opç${off.length === 1 ? 'ão' : 'ões'}</summary><div class="cards">${off.map(pratoCard).join('')}</div></details>` : ''}</section>`;
  }).join('');
}
function vComida() {
  const s = ui.sub.comida;
  let body = '';
  if (s === 'ceia') body = `<p class="lead">${fq(C.P)} porções (adultos + crianças × ${nv(S.config.fc)}). O valor no card é proporcional ao consumo; o total da festa usa a lista de compras em embalagens fechadas.</p>
    <button class="btn pri" data-act="rec-open" data-mode="org">+ Nova receita</button>${listaPratos(['entrada', 'principal', 'acompanhamento', 'sobremesa', 'mesa'])}`;
  if (s === 'cafe') body = `<p class="lead">Só para quem vai dormir: ${C.dA} adulto(s) e ${C.dK} criança(s), ${fq(C.D)} porções.</p>
    <button class="btn pri" data-act="rec-open" data-mode="org" data-cat="cafe">+ Nova receita</button>${listaPratos(['cafe'])}`;
  if (s === 'compras') body = vCompras();
  return `<h1 class="pt">Comida</h1>${chips('comida', [['ceia', 'Ceia'], ['cafe', 'Café da manhã'], ['compras', 'Compras e preços']])}${body}`;
}
function vCompras() {
  const b = norm(ui.busca);
  const ins = by(S.insumos, 'nome').filter(i => !b || norm(i.nome + ' ' + i.grupo).includes(b));
  const gs = [...new Set(ins.map(i => i.grupo || 'Outros'))].sort((a, c) => a === 'Sem preço' ? -1 : c === 'Sem preço' ? 1 : a.localeCompare(c, 'pt-BR'));
  const shops = Object.values(C.shop).sort((a, c) => (a.resp ? 0 : 1) - (c.resp ? 0 : 1) || nomeDe(a.resp).localeCompare(nomeDe(c.resp), 'pt-BR'));
  return `<p class="lead">Lista de compras de cada responsável, já em embalagens fechadas. Mudou um preço, todos os pratos que usam o insumo se atualizam.</p>
  <div class="cards">${shops.map(g => { const ls = Object.values(g.it).sort((a, c) => a.ins.nome.localeCompare(c.ins.nome, 'pt-BR'));
    return `<div class="card"><div class="row"><h3 class="grow">${esc(nomeDe(g.resp) || 'Sem responsável')}</h3>${tag(g.cafe ? 'Café' : 'Ceia')}<span class="money">${brl(g.t)}</span></div>
    <table><tbody>${ls.map(l => `<tr><td>${esc(l.ins.nome)}${+l.ins.preco ? '' : ' ' + tag('sem preço', 'bad')}<div class="mut sm">${esc(l.pr.join(', '))}</div></td><td class="r">${fq(l.buy)} ${esc(l.ins.un)}</td><td class="r">${brl(l.cost)}</td></tr>`).join('')}</tbody></table>
    <div class="row"><button class="btn sm" data-act="shop-copy" data-v="${esc(g.key)}">Copiar lista</button>${g.resp && S.contatos[g.resp] ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(waLink(S.contatos[g.resp], shopText(g)))}">Mandar no WhatsApp</a>` : ''}</div></div>`; }).join('') || '<p class="mut">Marque pratos para gerar as listas.</p>'}</div>
  <section class="blk"><div class="row"><h3 class="grow">Insumos e preço unitário</h3><input id="busca" class="search" data-k="busca" placeholder="Buscar insumo" value="${esc(ui.busca)}" aria-label="Buscar insumo"></div>
  ${gs.map(g => `<details class="card more" data-open="ins-${esc(g)}" ${g === 'Sem preço' ? 'open' : ''}><summary>${esc(g)} (${ins.filter(i => (i.grupo || 'Outros') === g).length})</summary>
    <div class="insg"><span class="h">Insumo</span><span class="h">Unidade</span><span class="h">Preço</span><span class="h">Grupo</span><span></span>
    ${ins.filter(i => (i.grupo || 'Outros') === g).map(i => `${inp('insumos', i.id, 'nome', i.nome, { a: 'Insumo' })}${inp('insumos', i.id, 'un', i.un, { a: 'Unidade' })}
     <div class="pr">${inp('insumos', i.id, 'preco', i.preco, { n: 1, a: 'Preço de ' + i.nome })}${i.est ? '<span class="est">est.</span>' : ''}</div>${inp('insumos', i.id, 'grupo', i.grupo, { a: 'Grupo' })}
     <button class="x" data-act="del" data-tb="insumos" data-id="${i.id}" aria-label="Excluir ${esc(i.nome)}">×</button>`).join('')}</div></details>`).join('')}
  <form class="card add" id="f-insumo"><h3>Novo insumo ou tempero</h3><div class="f3">
    <label class="l">Nome<input name="nome" required></label><label class="l">Unidade de compra<input name="un" value="un" list="uns"></label>
    <label class="l">Preço<input name="preco" inputmode="decimal" value="0"></label><label class="l">Grupo<input name="grupo" value="Temperos" list="grs"></label></div>
    <datalist id="uns">${['kg', 'L', 'un', 'pct', 'lata', 'cx', 'dúzia', 'maço', 'garrafa', 'pote'].map(u => `<option value="${u}">`).join('')}</datalist>
    <datalist id="grs">${[...new Set(S.insumos.map(i => i.grupo))].map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <button class="btn pri">Adicionar</button></form></section>`;
}
const shopText = g => `Lista de compras — ${nomeDe(g.resp) || 'sem responsável'} (${g.cafe ? 'café da manhã' : 'ceia'})\n` + Object.values(g.it).map(l => `• ${l.ins.nome}: ${fq(l.buy)} ${l.ins.un}`).join('\n') + `\nTotal estimado: ${brl(g.t)}`;

function vFesta() {
  return `<h1 class="pt">Festa</h1>${chips('festa', [['decoracao', 'Decoração'], ['estrutura', 'Bebidas e estrutura']])}${ui.sub.festa === 'decoracao' ? vDecor() : vEstrutura()}`;
}
function vEstrutura() {
  return `<div class="explica"><b>Como a quantidade é calculada</b>
  <p>“1 para cada N pessoas”: com 10 confirmados e refrigerante “1 garrafa para cada 2 pessoas”, a lista pede 5 garrafas. Aqui criança conta como pessoa inteira. “Quantidade fixa” não muda com o número de pessoas (papel-alumínio, saco de lixo).</p></div>
  ${Object.entries(ICATS).map(([c, t]) => { const xs = by(S.itens.filter(x => x.cat === c), 'nome'); const st = sum(xs.filter(x => x.sel), x => C.it[x.id].t);
    return `<section class="blk"><div class="row"><h3 class="grow">${t}</h3><span class="money">${brl(st)}</span></div><div class="cards">${xs.map(x => `<div class="card ${x.sel ? '' : 'off'}">
     <div class="r3">${ck('itens', x.id, 'sel', x.sel, '<span class="sr">Incluir</span>')}${inp('itens', x.id, 'nome', x.nome, { a: 'Item', cls: 'strong' })}<button class="x" data-act="del" data-tb="itens" data-id="${x.id}" aria-label="Excluir">×</button></div>
     <div class="sentence">${x.tipo === 'fixo'
       ? `Comprar ${inp('itens', x.id, 'n', x.n, { n: 1, cls: 'w5', a: 'Quantidade' })} ${inp('itens', x.id, 'un', x.un, { cls: 'w7', a: 'Unidade' })}`
       : `1 ${inp('itens', x.id, 'un', x.un, { cls: 'w7', a: 'Unidade' })} para cada ${inp('itens', x.id, 'n', x.n, { n: 1, cls: 'w5', a: 'Pessoas' })} <select data-tb="itens" data-id="${x.id}" data-f="conta" data-k="itens-${x.id}-conta" class="w9" aria-label="Quem conta">${opt({ todos: 'pessoas', dorme: 'que dormem' }, x.conta)}</select>`}</div>
     <div class="f2"><label class="l">Como calcula<select data-tb="itens" data-id="${x.id}" data-f="tipo" data-k="itens-${x.id}-tipo">${opt({ rende: '1 para cada N pessoas', fixo: 'Quantidade fixa' }, x.tipo)}</select></label>
      <label class="l">Preço por ${esc(x.un)}${x.est ? ' <span class="est">est.</span>' : ''}${inp('itens', x.id, 'preco', x.preco, { n: 1 })}</label></div>
     ${respSel('itens', x.id, x.resp)}
     <div class="row"><b class="grow">${fq(C.it[x.id].q)} ${esc(x.un)}</b><span class="money">${brl(C.it[x.id].t)}</span></div></div>`).join('')}</div></section>`; }).join('')}
  <form class="card add" id="f-item"><h3>Novo item</h3><div class="f3">
    <label class="l">Nome<input name="nome" required></label><label class="l">Grupo<select name="cat">${opt(ICATS, 'bebida')}</select></label>
    <label class="l">Como calcula<select name="tipo">${opt({ rende: '1 para cada N pessoas', fixo: 'Quantidade fixa' }, 'rende')}</select></label>
    <label class="l">N pessoas ou quantidade<input name="n" inputmode="decimal" value="2"></label><label class="l">Unidade<input name="un" value="un"></label><label class="l">Preço<input name="preco" inputmode="decimal" value="0"></label></div>
    <button class="btn pri">Adicionar</button></form>`;
}
function decorCard(d) {
  return `<div class="card ${d.sel ? '' : 'off'}">
  <div class="row">${ck('decor', d.id, 'sel', d.sel, `<b class="nm">${esc(d.nome)}</b>`)}<span class="grow"></span><span class="money">${brl(C.de[d.id].t)}</span></div>
  <div class="mut">${esc(d.descr)}</div>
  <a href="https://br.pinterest.com/search/pins/?q=${encodeURIComponent(d.busca || d.nome)}" target="_blank" rel="noopener">Ver fotos de referência</a>
  ${d.sel ? respSel('decor', d.id, d.resp) : ''}
  <details data-open="de-${d.id}"><summary>Materiais (${(d.mat || []).length})</summary>
   <div class="ing">${(d.mat || []).map((m, k) => `<div class="ln m">
    <input class="a" data-tb="decor" data-id="${d.id}" data-f="mat" data-sub="${k}" data-sf="n" data-k="de-${d.id}-${k}-n" value="${esc(m.n)}" aria-label="Material">
    <input class="b" inputmode="decimal" data-tb="decor" data-id="${d.id}" data-f="mat" data-sub="${k}" data-sf="q" data-n="1" data-k="de-${d.id}-${k}-q" value="${nv(m.q)}" aria-label="Quantidade">
    <input class="u" data-tb="decor" data-id="${d.id}" data-f="mat" data-sub="${k}" data-sf="un" data-k="de-${d.id}-${k}-un" value="${esc(m.un)}" aria-label="Unidade">
    <input class="p" inputmode="decimal" data-tb="decor" data-id="${d.id}" data-f="mat" data-sub="${k}" data-sf="p" data-n="1" data-k="de-${d.id}-${k}-p" value="${nv(m.p)}" aria-label="Preço">
    <button class="x z" data-act="mat-del" data-id="${d.id}" data-k2="${k}" aria-label="Tirar">×</button></div>`).join('')}</div>
   ${(d.mat || []).some(m => m.est) ? '<p class="est">Preços estimados; troque pelo valor real.</p>' : ''}
   <div class="row mt"><button class="btn sm" data-act="mat-add" data-id="${d.id}">+ Material</button><span class="grow"></span><button class="x" data-act="del" data-tb="decor" data-id="${d.id}">Excluir ideia</button></div></details></div>`;
}
function vDecor() {
  const pref = ['Painel de fotos', 'Pergolado', 'Mesa grande', 'Mesas dos convidados', 'Parede / teto', 'Entrada', 'Brinde da virada'];
  const locais = [...new Set(S.decor.map(d => d.local || 'Outros'))].sort((a, b) => ((pref.indexOf(a) + 99) % 99) - ((pref.indexOf(b) + 99) % 99));
  return `<p class="lead">A decoração é custo fixo: não muda com o número de pessoas.</p>
  <div class="refs"><figure><img src="assets/ref1.jpg" alt="Arco de balões branco e prata com cortina metalizada e números 2027" loading="lazy"><figcaption>Referência 1: arco, cortina prata, letreiro e números.</figcaption></figure>
  <figure><img src="assets/ref2.jpg" alt="Números metalizados com base de balões e balões cromados pendurados" loading="lazy"><figcaption>Referência 2: balões cromados pendurados, bom para o pergolado.</figcaption></figure></div>
  ${locais.map(l => { const ds = by(S.decor.filter(d => (d.local || 'Outros') === l), 'nome'); const on = ds.filter(d => d.sel), off = ds.filter(d => !d.sel);
    return `<section class="blk"><div class="row"><h3 class="grow">${esc(l)}</h3>${tag(on.length + ' escolhida(s)')}</div><div class="cards">${on.map(decorCard).join('') || '<p class="mut">Nenhuma escolhida.</p>'}</div>
    ${off.length ? `<details class="more" data-open="dm-${esc(l)}"><summary>Outras ${off.length} ideia(s)</summary><div class="cards">${off.map(decorCard).join('')}</div></details>` : ''}</section>`; }).join('')}
  <form class="card add" id="f-decor"><h3>Nova ideia de decoração</h3><div class="f3">
    <label class="l">Nome<input name="nome" required></label><label class="l">Local<input name="local" list="locais" value="Pergolado"></label><label class="l">Descrição<input name="descr"></label></div>
    <datalist id="locais">${pref.map(p => `<option value="${p}">`).join('')}</datalist><button class="btn pri">Criar</button></form>`;
}

function contaHtml(id, famHead) {
  const r = C.pag[id], p = S.pessoas.find(x => x.id === id) || { nome: '?' };
  const tel = S.contatos[id] || (famHead ? S.contatos[famHead.id] : '') || '';
  const v = Math.max(r.saldo, 0), pl = pixPay(v), grupo = r.membros.length > 1;
  const quem = grupo ? `a parte da família (${r.membros.map(m => m.nome).join(', ')})` : (tel === S.contatos[id] ? 'sua parte' : `a parte de ${p.nome}`);
  const msg = `Oi, ${(tel === S.contatos[id] ? p : famHead || p).nome}! ${quem.charAt(0).toUpperCase() + quem.slice(1)} do ${S.config.evento || 'réveillon'} ficou em ${brl(v)}.`
    + (S.config.pix_chave ? `\nPix (${S.config.pix_tipo}): ${chaveFormatada(S.config.pix_tipo, S.config.pix_chave)}` : '') + (pl ? `\n\nPix copia e cola:\n${pl}` : '');
  return `<div class="conta">
    <div class="row"><b class="grow nm">${esc(grupo ? (famHead ? 'Conta única da família' : 'Família de ' + p.nome) : p.nome)}</b>${r.saldo > 0.009 ? tag('falta ' + brl(r.saldo), 'bad') : r.saldo < -0.009 ? tag('receber ' + brl(-r.saldo), 'warn') : tag('quitado', 'ok')}</div>
    ${grupo ? `<div class="membros">${r.membros.map(m => `<span>${esc(m.nome)}${m.tipo === 'crianca' ? ' <small>criança</small>' : ''}</span><b>${brl(m.v)}</b>`).join('')}</div>` : ''}
    <div class="mini"><span>Cota</span><b>${brl(r.devido)}</b><span>Já gastou</span><b>${brl(r.gasto)}</b></div>
    <div class="f2"><label class="l">Já pagou<input inputmode="decimal" data-act="pago" data-id="${id}" data-k="pago-${id}" value="${nv(r.pago)}"></label>
    <label class="l">WhatsApp${tel && !S.contatos[id] && famHead ? ' (de ' + esc(famHead.nome) + ')' : ''}<input inputmode="tel" data-act="tel" data-id="${id}" data-k="tel2-${id}" value="${esc(fmtTel(S.contatos[id] || ''))}" placeholder="${esc(fmtTel(tel))}"></label></div>
    <div class="row">${r.saldo > 0.009 ? `<button class="btn sm" data-act="quitar" data-id="${id}">Marcar como pago</button>` : ''}
    ${r.saldo > 0.009 && tel ? `<a class="btn sm pri" target="_blank" rel="noopener" href="${esc(waLink(tel, msg))}">Cobrar no WhatsApp</a>` : ''}
    ${r.saldo > 0.009 && !tel ? `<button class="btn sm" data-act="copy" data-v="${esc(msg)}">Copiar cobrança</button>` : ''}
    ${r.saldo > 0.009 ? `<button class="btn sm ghost" data-act="img-p" data-id="${id}">Imagem com QR</button>` : ''}</div></div>`;
}
function vDinheiro() {
  const contas = Object.values(C.pag);
  const falta = sum(contas.filter(r => r.saldo > 0), r => r.saldo), dev = sum(contas.filter(r => r.saldo < 0), r => -r.saldo), recebido = sum(contas, r => r.pago);
  const blocks = [], usados = new Set();
  for (const hid in C.fam) {
    const h = S.pessoas.find(p => p.id === hid); if (!h) continue;
    const membros = [h, ...C.fam[hid]], ids = membros.map(m => m.id).filter(id => C.pag[id]);
    if (!ids.length) continue;
    membros.forEach(m => usados.add(m.id));
    blocks.push({ h, membros, ids });
  }
  for (const id in C.pag) if (!usados.has(id)) blocks.push({ ids: [id] });
  const peso = b => Math.max(...b.ids.map(id => C.pag[id].saldo)), nomeB = b => b.h ? b.h.nome : nomeDe(b.ids[0]);
  blocks.sort((a, b) => peso(b) - peso(a) || nomeB(a).localeCompare(nomeB(b), 'pt-BR'));
  return `<h1 class="pt">Dinheiro</h1>
  <div class="kpis"><div class="card"><small class="mut">Por adulto</small><b class="big-n">${brl(C.cota)}</b>${C.K ? `<small class="mut">Criança: ${brl(C.cotaK)}</small>` : ''}</div>
   <div class="card"><small class="mut">Falta receber</small><b class="big-n">${brl(falta)}</b></div>
   <div class="card"><small class="mut">Já recebido</small><b class="big-n">${brl(recebido)}</b></div>
   <div class="card"><small class="mut">A devolver</small><b class="big-n">${brl(dev)}</b><small class="mut">quem gastou mais que a cota</small></div></div>
  <p class="lead">Total ${brl(C.total)} ÷ ${fq(C.div)} (${C.A} adultos${C.K ? ` + ${C.K} crianças × ${nv(S.config.fcota)}` : ''}). O que cada um gastou comprando para a festa é descontado. Famílias podem ser cobradas juntas, no nome do responsável, ou cada adulto separado; quem não tem WhatsApp cadastrado recebe pela pessoa responsável da família.</p>
  <div class="cards">${blocks.map(b => b.h ? `<div class="card fam">
    <div class="row"><h3 class="grow nm">Família de ${esc(b.h.nome)}</h3>
    <div class="seg" role="group" aria-label="Cobrança da família"><button data-act="junto" data-id="${b.h.id}" data-v="1" class="${b.h.cobrar_junto !== false ? 'on' : ''}">Cobrar junto</button><button data-act="junto" data-id="${b.h.id}" data-v="0" class="${b.h.cobrar_junto === false ? 'on' : ''}">Separado</button></div></div>
    ${b.ids.map(id => contaHtml(id, b.h)).join('')}</div>`
    : `<div class="card">${contaHtml(b.ids[0], null)}</div>`).join('') || '<p class="mut">Ninguém confirmado ainda.</p>'}</div>
  ${vDivulgar()}`;
}

const VIEWS = { inicio: vInicio, confirmar: vConfirmar, cardapio: vCardapioG, pagar: vPagar, org: vPainel, 'org-pessoas': vPessoas, 'org-comida': vComida, 'org-festa': vFesta, 'org-dinheiro': vDinheiro };

/* ================= diálogos ================= */
const dlg = () => $('#dlg');
function openDlg(html) { $('#dlg-body').innerHTML = html; if (!dlg().open) dlg().showModal(); const f = $('#dlg-body input, #dlg-body textarea'); if (f) f.focus(); }
const closeDlg = () => dlg().close();

// --- organizador: adicionar pessoa ou família ---
function openPessoas() {
  const chefes = by(S.pessoas.filter(p => !p.de), 'nome');
  openDlg(`<h2>Adicionar pessoa ou família</h2>
  <form id="f-pes"><div id="pes-rows">${regRow(0, true)}</div>
  <button type="button" class="btn" data-act="reg-add" data-w="pes-rows">+ Outra pessoa da família</button>
  <div class="f2 mt"><label class="l">Família<select name="fam"><option value="">Nova família (a primeira pessoa é a responsável)</option>${chefes.map(p => `<option value="${p.id}">Entrar na família de ${esc(p.nome)}</option>`).join('')}</select></label>
  <label class="l">Resposta<select name="status">${opt(ST, 'pend')}</select></label></div>
  <label class="ck"><input type="checkbox" name="junto" checked><span>Cobrar a família junto, no nome da responsável (só vale para família nova)</span></label>
  <div class="row"><button class="btn pri">Cadastrar</button><button type="button" class="btn ghost" data-act="dlg-close">Cancelar</button></div></form>`);
}
async function salvarPessoas(f, v) {
  const rows = $$('.reg-row', f).map(r => ({ nome: $('[name=nome]', r).value.trim(), tel: $('[name=tel]', r).value, tipo: $('[name=tipo]', r).value, dorme: $('[name=dorme]', r).checked })).filter(r => r.nome);
  if (!rows.length) return;
  const base = r => ({ nome: r.nome, tipo: r.tipo, status: v.status, dorme: r.dorme });
  closeDlg();
  await write(async () => {
    let ins;
    if (v.fam) ins = await db.insert('pessoas', rows.map(r => ({ ...base(r), de: v.fam })));
    else {
      ins = await db.insert('pessoas', [{ ...base(rows[0]), cobrar_junto: !!v.junto }]);
      if (rows.length > 1) ins = ins.concat(await db.insert('pessoas', rows.slice(1).map(r => ({ ...base(r), de: ins[0].id }))));
    }
    const tels = ins.map((p, i) => ({ pessoa_id: p.id, telefone: String(rows[i].tel || '').replace(/[^\d+]/g, '') })).filter(t => t.telefone);
    if (tels.length) await db.insert('contatos', tels);
    toast(`${ins.length} pessoa(s) cadastrada(s).`);
  }, ['pessoas']);
}

// --- importar lista de pessoas ---
let imp = { mode: 'org', rows: [] };
function openImport(mode) {
  imp = { mode, rows: [] };
  openDlg(`<h2>${mode === 'org' ? 'Importar lista de pessoas' : 'Cadastrar uma lista'}</h2>
  <p class="mut">Cole uma pessoa por linha, ou anexe um arquivo (.txt, .csv, planilha .xlsx ou contatos .vcf). Pode escrever o telefone, “criança” e “dorme” na mesma linha.</p>
  <textarea id="imp-txt" rows="6" placeholder="Maria Souza; (94) 99999-1111; dorme&#10;João; criança&#10;Pedro, Ana, Lucas"></textarea>
  <div class="row"><label class="btn"><input type="file" id="imp-file" accept=".txt,.csv,.xlsx,.xls,.ods,.vcf,text/plain,text/csv" hidden>Anexar arquivo</label>
  <button class="btn" data-act="imp-read">Ler lista</button><span class="grow"></span><button class="btn ghost" data-act="dlg-close">Cancelar</button></div>
  <div id="imp-prev"></div>`);
}
function renderImp() {
  const ex = new Set(S.pessoas.map(p => norm(p.nome)));
  $('#imp-prev').innerHTML = imp.rows.length ? `<h3 class="mt">${imp.rows.length} pessoa(s) encontrada(s)</h3>
  <div class="imp">${imp.rows.map((r, i) => `<div class="imp-r ${r.off ? 'off' : ''}">
   <label class="ck"><input type="checkbox" data-imp="${i}" data-f="on" ${r.off ? '' : 'checked'}><span class="sr">Incluir</span></label>
   <input data-imp="${i}" data-f="nome" value="${esc(r.nome)}" aria-label="Nome">
   <input data-imp="${i}" data-f="telefone" value="${esc(fmtTel(r.telefone))}" inputmode="tel" aria-label="WhatsApp" placeholder="WhatsApp">
   <select data-imp="${i}" data-f="tipo" aria-label="Idade">${opt({ adulto: 'Adulto', crianca: 'Criança' }, r.tipo)}</select>
   <label class="ck"><input type="checkbox" data-imp="${i}" data-f="dorme" ${r.dorme ? 'checked' : ''}><span>Dorme</span></label>
   ${ex.has(norm(r.nome)) ? tag('já cadastrado', 'warn') : '<span></span>'}</div>`).join('')}</div>
  ${imp.mode === 'guest' ? `<fieldset class="seg-f"><legend>Vocês vêm?</legend><label><input type="radio" name="imp-st" value="sim" checked><span>Vou</span></label><label><input type="radio" name="imp-st" value="talvez"><span>Talvez</span></label></fieldset>${famOpts('imp')}`
    : `<label class="l">Resposta de todos<select id="imp-st">${opt(ST, 'pend')}</select></label>
       <label class="ck"><input type="checkbox" id="imp-mesma"><span>São todos da mesma família (a primeira pessoa é a responsável)</span></label>
       <label class="ck"><input type="checkbox" id="imp-junto" checked><span>Cobrar a família junto</span></label>`}
  <button class="btn pri wide" data-act="imp-save">Cadastrar ${imp.rows.filter(r => !r.off).length} pessoa(s)</button>` : '<p class="mut">Nenhum nome encontrado.</p>';
}
async function saveImport() {
  const rows = imp.rows.filter(r => !r.off && r.nome.trim());
  if (!rows.length) return;
  const st = imp.mode === 'guest' ? ($('input[name="imp-st"]:checked') || {}).value || 'sim' : $('#imp-st').value;
  rows.forEach(r => r.status = st);
  if (imp.mode === 'guest') return registrar(rows, $('#imp-fam') ? $('#imp-fam').value : '', $('#imp-junto').checked);
  const mesma = $('#imp-mesma').checked, junto = $('#imp-junto').checked;
  await write(async () => {
    let ins = await db.insert('pessoas', rows.slice(0, mesma ? 1 : rows.length).map(r => ({ nome: r.nome.trim(), tipo: r.tipo, status: r.status, dorme: !!r.dorme, cobrar_junto: junto })));
    if (mesma && rows.length > 1) ins = ins.concat(await db.insert('pessoas', rows.slice(1).map(r => ({ nome: r.nome.trim(), tipo: r.tipo, status: r.status, dorme: !!r.dorme, de: ins[0].id }))));
    const tels = ins.map((p, i) => ({ pessoa_id: p.id, telefone: String(rows[i].telefone || '').replace(/[^\d+]/g, '') })).filter(t => t.telefone);
    if (tels.length) await db.insert('contatos', tels);
    toast(`${ins.length} pessoa(s) cadastrada(s).`);
  }, ['pessoas']);
  closeDlg();
}
async function registrar(rows, familia, junto) {
  try {
    const lista = rows.map((r, i) => ({ nome: r.nome.trim(), telefone: r.telefone || '', tipo: r.tipo, dorme: !!r.dorme, status: r.status, ...(i ? {} : { junto: junto !== false }) }));
    const res = await db.rpc('registrar', familia ? { lista, p_familia: familia, p_tk: tokenOf(familia) } : { lista });
    const atuais = store.get('rev27_meus', []);
    store.set('rev27_meus', [...atuais, ...res.map(x => ({ id: x.id, token: x.token }))]);
    toast(`${res.length} pessoa(s) confirmada(s). Obrigado!`);
    if (dlg().open) closeDlg();
    await reload(['pessoas']);
    location.hash = '#inicio';
  } catch (e) { toast(e.message); }
}

// --- receita por texto ---
let rec = { mode: 'org', rows: [], pratoId: '' };
function openRecipe(mode, pratoId, cat) {
  rec = { mode, rows: [], pratoId: pratoId || '' };
  const p = pratoId ? S.pratos.find(x => x.id === pratoId) : null;
  openDlg(`<h2>${p ? 'Adicionar ingredientes a ' + esc(p.nome) : 'Nova receita'}</h2>
  ${p ? '' : `<div class="f3"><label class="l">Nome do prato<input id="rec-nome" required></label>
   <label class="l">Categoria<select id="rec-cat">${opt(mode === 'guest' ? Object.fromEntries(Object.entries(CATS)) : CATS, cat || 'principal')}</select></label>
   <label class="l">Serve quantas pessoas<input id="rec-rende" inputmode="numeric" value="10"></label></div>`}
  <label class="l">Ingredientes com quantidade, separados por vírgula ou um por linha
  <textarea id="rec-txt" rows="5" placeholder="Arroz 1 kg, 2 latas de milho, 300 g de bacon, 1 cebola, sal a gosto"></textarea></label>
  <p class="mut">As quantidades são para o número de pessoas acima. O app ajusta para quantos confirmarem.</p>
  <div class="row"><button class="btn" data-act="rec-read">Ler ingredientes</button><span class="grow"></span><button class="btn ghost" data-act="dlg-close">Cancelar</button></div>
  <div id="rec-prev"></div>`);
}
function renderRec() {
  const ins = by(S.insumos, 'nome');
  $('#rec-prev').innerHTML = rec.rows.length ? `<h3 class="mt">Confira</h3><p class="mut">Ingredientes novos entram sem preço${rec.mode === 'guest' ? ' e a organização completa depois' : ''}.</p>
  <div class="ing">${rec.rows.map((r, i) => `<div class="ln rec">
   <select class="a" data-rec="${i}" data-f="i" aria-label="Ingrediente"><option value="">Novo: ${esc(r.nome)}</option>${ins.map(x => `<option value="${x.id}" ${x.id === r.i ? 'selected' : ''}>${esc(x.nome)} (${esc(x.un)})</option>`).join('')}</select>
   <input class="b" data-rec="${i}" data-f="q" inputmode="decimal" value="${nv(r.q)}" aria-label="Quantidade">
   <input class="u" data-rec="${i}" data-f="un" value="${esc(r.i ? (S.insumos.find(x => x.id === r.i) || {}).un : r.un)}" ${r.i ? 'readonly' : ''} aria-label="Unidade">
   <span class="c">${r.aviso ? tag(esc(r.aviso), 'warn') : ''}</span>
   <button class="x z" data-act="rec-del" data-k2="${i}" aria-label="Tirar">×</button></div>`).join('')}</div>
  <button class="btn pri wide mt" data-act="rec-save">Salvar receita</button>` : '';
}
async function saveRecipe() {
  const rows = rec.rows.filter(r => r.nome || r.i);
  if (rec.mode === 'guest') {
    const me = meAtual(), tk = tokenOf(me);
    const nome = $('#rec-nome').value.trim(); if (!nome) return toast('Dê um nome ao prato.');
    try {
      await db.rpc('sugerir_prato', { pid: me, tk, p_nome: nome, p_cat: $('#rec-cat').value, p_rende: num($('#rec-rende').value) || 10,
        p_ing: rows.map(r => r.i ? { i: r.i, q: r.q } : { nome: r.nome, un: r.un, q: r.q }) });
      toast('Prato cadastrado no seu nome.'); closeDlg(); await reload(['pratos', 'insumos']);
    } catch (e) { toast(e.message); }
    return;
  }
  await write(async () => {
    const novos = rows.filter(r => !r.i);
    if (novos.length) {
      const ins = await db.insert('insumos', novos.map(r => ({ nome: r.nome, un: r.un || 'un', preco: 0, grupo: 'Sem preço', est: false })));
      novos.forEach((r, k) => r.i = ins[k].id);
    }
    const ing = rows.map(r => ({ i: r.i, q: r.q }));
    if (rec.pratoId) {
      const p = S.pratos.find(x => x.id === rec.pratoId);
      await db.update('pratos', rec.pratoId, { ing: [...(p.ing || []), ...ing] });
    } else {
      const nome = $('#rec-nome').value.trim(); if (!nome) throw new Error('Dê um nome ao prato.');
      const [p] = await db.insert('pratos', [{ nome, cat: $('#rec-cat').value, rende: num($('#rec-rende').value) || 10, sel: true, ing }]);
      ui.opened.add('pr-' + p.id);
    }
    toast('Receita salva.'); closeDlg();
  }, ['pratos', 'insumos']);
}

/* ================= imagens ================= */
async function imagem(kind, share, extra) {
  toast('Gerando imagem…');
  const blob = await buildImage(kind, { S, C, ...extra });
  const name = `reveillon2027-${extra && extra.nome ? norm(extra.nome).replace(/\W+/g, '-') : kind}.png`;
  if (share) {
    const ok = await shareFiles([new File([blob], name, { type: 'image/png' })], kind === 'pagamentos' ? textoGrupo() : '');
    if (ok) return;
    toast('Este aparelho não envia direto; a imagem foi baixada.');
  }
  downloadBlob(blob, name);
}

/* ================= eventos ================= */
function bind() {
  document.addEventListener('change', async e => {
    const el = e.target, d = el.dataset;
    if (d.imp !== undefined) { const r = imp.rows[+d.imp]; if (d.f === 'on') r.off = !el.checked; else r[d.f] = el.type === 'checkbox' ? el.checked : el.value; if (d.f === 'on') renderImp(); return; }
    if (d.rec !== undefined) { const r = rec.rows[+d.rec]; r[d.f] = d.f === 'q' ? num(el.value) : el.value; if (d.f === 'i') renderRec(); return; }
    if (d.act === 'g-dorme') return guestUpdate(d.id, { p_dorme: el.checked });
    if (d.act === 'g-me') { ui.me = el.value; store.set('rev27_eu', ui.me); return schedule(); }
    if (d.act === 'div') { ui.divulgar[d.v] = el.checked; store.set('rev27_div', ui.divulgar); return schedule(); }
    if (d.act === 'pago') {
      // o valor mostrado soma o que todos da conta já pagaram; a diferença fica registrada na pessoa da conta
      const r = C.pag[d.id], p = S.pessoas.find(x => x.id === d.id); if (!r || !p) return;
      const outros = r.pago - (+p.pago || 0);
      return patch('pessoas', d.id, { pago: Math.round((num(el.value) - outros) * 100) / 100 });
    }
    if (d.act === 'tel') { const t = el.value.replace(/[^\d+]/g, ''); S.contatos[d.id] = t; return write(() => db.upsert('contatos', { pessoa_id: d.id, telefone: t }), []); }
    if (el.id === 'imp-file') {
      const f = el.files[0]; if (!f) return;
      try { imp.rows = await peopleFromFile(f); renderImp(); } catch (err) { toast(err.message); }
      return;
    }
    if (!d.tb || !auth) return;
    let v = el.type === 'checkbox' ? el.checked : d.n ? num(el.value) : el.value.trim();
    if (d.f === 'resp' || d.f === 'de') v = v || null;
    const o = d.tb === 'config' ? S.config : S[d.tb].find(x => x.id === d.id);
    if (!o) return;
    if (d.sub !== undefined) {
      const arr = clone(o[d.f] || []); if (!arr[+d.sub]) return;
      arr[+d.sub][d.sf] = v; if (d.sf === 'p') arr[+d.sub].est = false;
      return patch(d.tb, d.id, { [d.f]: arr });
    }
    const p = { [d.f]: v }; if (d.f === 'preco') p.est = false;
    patch(d.tb, d.id, p);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'busca') { ui.busca = e.target.value; schedule(); }
    if (e.target.id === 'txt-grupo') { const a = $('[data-act="g-wa"]'); if (a) a.href = 'https://wa.me/?text=' + encodeURIComponent(e.target.value); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'button')) return;
    const a = b.dataset.act, id = b.dataset.id;
    switch (a) {
      case 'sub': ui.sub[b.dataset.key] = b.dataset.v; if (b.tagName !== 'A') { e.preventDefault(); scrollTo(0, 0); } schedule(); break;
      case 'sair': await db.logout(); auth = null; location.hash = '#inicio'; break;
      case 'tema': toggleTheme(); break;
      case 'copy': copyText(b.dataset.v); break;
      case 'dlg-close': closeDlg(); break;
      case 'pw-toggle': {
        const i = b.parentElement.querySelector('input'), ver = i.type === 'password';
        i.type = ver ? 'text' : 'password'; b.setAttribute('aria-pressed', ver); b.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha'); i.focus(); break;
      }
      case 'pw-forgot': openEsqueci(); break;
      case 'senha-open': openMinhaSenha(); break;
      case 'orgs-open': openOrganizadores(); break;
      case 'org-senha': openSenhaOrg(b.dataset.v); break;
      case 'org-del': removerOrg(b.dataset.v); break;
      // convidado
      case 'g-st': guestUpdate(id, { p_status: b.dataset.v }); break;
      case 'g-pick': case 'g-drop': {
        const me = a === 'g-pick' ? meAtual() : b.dataset.p, tk = tokenOf(me);
        if (a === 'g-pick' && (C.load[me] || 0) >= lim()) toast(`${nomeDe(me)} já tem ${C.load[me]} tarefa(s). Tudo bem, mas veja se não ficou pesado.`);
        try { const ok = await db.rpc('assumir', { pid: me, tk, p_tabela: b.dataset.tb, p_item: id, p_liberar: a === 'g-drop' }); if (!ok && a === 'g-pick') toast('Alguém escolheu isso antes de você.'); }
        catch (err) { toast(err.message); }
        reload([b.dataset.tb]); break;
      }
      case 'reg-add': { const w = $('#' + (b.dataset.w || 'reg-rows')); w.insertAdjacentHTML('beforeend', regRow(w.children.length, !!b.dataset.w)); $$('input[name="nome"]', w).pop().focus(); break; }
      case 'pes-open': openPessoas(); break;
      case 'reg-del': b.closest('.reg-row').remove(); break;
      // importação
      case 'imp-open': openImport(b.dataset.mode); break;
      case 'imp-read': imp.rows = parsePeople($('#imp-txt').value); renderImp(); break;
      case 'imp-save': saveImport(); break;
      // receita
      case 'rec-open': if (b.dataset.mode === 'guest' && !meus().length) { location.hash = '#confirmar'; break; } openRecipe(b.dataset.mode, id, b.dataset.cat); break;
      case 'rec-read': rec.rows = parseRecipe($('#rec-txt').value, S.insumos); renderRec(); break;
      case 'rec-del': rec.rows.splice(+b.dataset.k2, 1); renderRec(); break;
      case 'rec-save': saveRecipe(); break;
      // organização
      case 'st': patch('pessoas', id, { status: b.dataset.v }); break;
      case 'del': delWithUndo(b.dataset.tb, id); break;
      case 'quitar': { const r = C.pag[id], p = S.pessoas.find(x => x.id === id); patch('pessoas', id, { pago: Math.round(((+p.pago || 0) + r.saldo) * 100) / 100 }); toast('Marcado como pago.'); break; }
      case 'junto': patch('pessoas', id, { cobrar_junto: b.dataset.v === '1' }); break;
      case 'g-junto': { const tk = tokenOf(id); try { await db.rpc('cobranca_familia', { pid: id, tk, p_junto: b.dataset.v === '1' }); } catch (err) { toast(err.message); } reload(['pessoas']); break; }
      case 'ing-add': { const p = S.pratos.find(x => x.id === id), f = by(S.insumos, 'nome')[0]; if (!p || !f) break; ui.opened.add('pr-' + id); patch('pratos', id, { ing: [...(p.ing || []), { i: f.id, q: 1 }] }); break; }
      case 'ing-del': { const p = S.pratos.find(x => x.id === id); const old = clone(p.ing || []); patch('pratos', id, { ing: old.filter((_, k) => k !== +b.dataset.k2) }); toast('Ingrediente retirado.', () => patch('pratos', id, { ing: old })); break; }
      case 'mat-add': { const d = S.decor.find(x => x.id === id); ui.opened.add('de-' + id); patch('decor', id, { mat: [...(d.mat || []), { n: 'Novo material', q: 1, un: 'un', p: 0 }] }); break; }
      case 'mat-del': { const d = S.decor.find(x => x.id === id); const old = clone(d.mat || []); patch('decor', id, { mat: old.filter((_, k) => k !== +b.dataset.k2) }); toast('Material retirado.', () => patch('decor', id, { mat: old })); break; }
      case 'shop-copy': copyText(shopText(C.shop[b.dataset.v])); break;
      case 'g-copy': copyText($('#txt-grupo').value); break;
      case 'img': imagem(b.dataset.v, false); break;
      case 'img-share': imagem(b.dataset.v, true); break;
      case 'img-p': imagem('pessoa', true, { nome: nomeDe(id), extra: C.pag[id] }); break;
    }
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f));
    if (f.id === 'f-login') {
      try { auth = await db.login(v.u, v.s); await reload(); } catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-esqueci') {
      try { await db.recuperarSenha(v.email); closeDlg(); toast('Se esse e-mail estiver cadastrado, o link chega em alguns minutos. Veja também o spam.'); }
      catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-novasenha') {
      if (v.s !== v.s2) return toast('As duas senhas não são iguais.');
      try { await db.novaSenha(v.s); closeDlg(); toast('Senha alterada.'); location.hash = '#org'; }
      catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-minhasenha') {
      if (v.s !== v.s2) return toast('As duas senhas novas não são iguais.');
      try { await db.trocarSenha(v.a, v.s); closeDlg(); toast('Senha alterada.'); } catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-orgsenha') {
      try { await db.rpc('redefinir_senha_organizador', { p_email: v.email, p_senha: v.s }); toast(`Senha de ${v.email} alterada.`); openOrganizadores(); }
      catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-org') {
      const email = db.toEmail(v.u);
      try { await db.rpc('criar_organizador', { p_email: email, p_senha: v.s }); toast(`Organizador ${email} cadastrado.`); openOrganizadores(); }
      catch (err) { toast(err.message); }
      return;
    }
    if (f.id === 'f-reg') {
      const st = v.status || 'sim';
      const rows = $$('.reg-row', f).map(r => ({ nome: $('[name=nome]', r).value.trim(), telefone: $('[name=tel]', r).value, tipo: $('[name=tipo]', r).value, dorme: $('[name=dorme]', r).checked, status: st })).filter(r => r.nome);
      if (rows.length) registrar(rows, $('#reg-fam') ? $('#reg-fam').value : '', $('#reg-junto').checked);
      return;
    }
    if (!auth) return;
    if (f.id === 'f-pes') return salvarPessoas(f, v);
    const nome = String(v.nome || '').trim(); if (!nome) return;
    if (f.id === 'f-insumo') await write(() => db.insert('insumos', [{ nome, un: v.un || 'un', preco: num(v.preco), grupo: String(v.grupo || 'Outros').trim() || 'Outros', est: false }]), ['insumos']);
    if (f.id === 'f-item') await write(() => db.insert('itens', [{ nome, cat: v.cat, tipo: v.tipo, n: num(v.n) || 1, conta: 'todos', un: v.un || 'un', preco: num(v.preco), sel: true }]), ['itens']);
    if (f.id === 'f-decor') await write(() => db.insert('decor', [{ nome, local: String(v.local || 'Outros').trim() || 'Outros', descr: v.descr || '', busca: nome, sel: true, mat: [] }]), ['decor']);
    f.reset(); toast(`“${nome}” adicionado.`);
  });
  addEventListener('hashchange', () => { scrollTo(0, 0); schedule(); });
  dlg().addEventListener('click', e => { if (e.target === dlg()) closeDlg(); });
}
async function guestUpdate(id, p) {
  const tk = tokenOf(id); if (!tk) return toast('Este celular não tem permissão para alterar essa pessoa.');
  try {
    await db.rpc('atualizar_participacao', { pid: id, tk, p_nome: null, p_tipo: null, p_status: null, p_dorme: null, p_telefone: null, ...p });
  } catch (e) { toast(e.message); }
  reload(['pessoas']);
}

/* ================= tema ================= */
function applyTheme(t) { document.documentElement.dataset.theme = t; const m = $('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#111215' : '#f2f3f5'; $('#tema').setAttribute('aria-label', t === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'); $('#tema').dataset.t = t; }
function toggleTheme() { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('rev27_tema', t); applyTheme(t); }

/* ================= desenho do topo ================= */
const HERO_SVG = (() => {
  let s = `<defs><linearGradient id="tin" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#dcdfe3"/><stop offset=".5" stop-color="#7d838c"/><stop offset="1" stop-color="#c4c8ce"/></linearGradient>
  <radialGradient id="chr" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c9cdd3"/><stop offset=".8" stop-color="#6d737c"/><stop offset="1" stop-color="#9aa0a8"/></radialGradient>
  <radialGradient id="wht" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e9eaec"/><stop offset="1" stop-color="#bfc2c7"/></radialGradient>
  <linearGradient id="num" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#b9bec6"/><stop offset=".55" stop-color="#8d939c"/><stop offset="1" stop-color="#eef0f2"/></linearGradient></defs>
  <rect width="600" height="260" fill="#1d1f24"/>`;
  for (let i = 0; i < 150; i++) s += `<line x1="${40 + i * 3.6}" y1="10" x2="${40 + i * 3.6 + ((i % 5) - 2) * .6}" y2="250" stroke="url(#tin)" stroke-width="2.4" opacity="${(.35 + ((i * 37) % 10) / 16).toFixed(2)}"/>`;
  [[60, 250, 28, 1], [42, 212, 24, 0], [52, 176, 20, 1], [40, 142, 26, 0], [62, 110, 22, 1], [58, 76, 24, 0], [86, 48, 20, 1], [116, 26, 26, 0], [152, 12, 22, 1], [80, 228, 14, 0], [30, 186, 12, 1], [90, 92, 12, 0]]
    .forEach(([x, y, r, c]) => s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${c ? 'chr' : 'wht'})"/>`);
  s += `<text x="350" y="200" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="700" font-size="140" fill="url(#num)" stroke="#f7f8fa" stroke-width="2" letter-spacing="-4">2027</text>`;
  return s;
})();

/* ================= instalar como app ================= */
function initInstalar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const b = $('#instalar');
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return; // já está aberto como app
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let pedido = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e; b.hidden = false; });
  addEventListener('appinstalled', () => { b.hidden = true; pedido = null; });
  if (ios) b.hidden = false;
  b.addEventListener('click', async () => {
    if (pedido) { pedido.prompt(); await pedido.userChoice; pedido = null; b.hidden = true; return; }
    openDlg(`<h2>Instalar no iPhone</h2>
    <p>1. Abra este endereço no <b>Safari</b>.<br>2. Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).<br>3. Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</p>
    <p class="mut">O ícone do Réveillon 2027 aparece na tela do celular e abre como app, sem a barra do navegador.</p>
    <p><a href="folder/#instalar">Ver o passo a passo com imagens</a></p>
    <div class="row"><button class="btn pri" data-act="dlg-close">Entendi</button></div>`);
  });
}

/* ================= início ================= */
async function start() {
  applyTheme(store.get('rev27_tema', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#tema').addEventListener('click', toggleTheme);
  initInstalar();
  initToast(); bind();
  if (!db.configured) { loaded = true; return schedule(); }
  db.onAuth(s => { const had = !!auth; auth = s; if (!!s !== had) reload(); });
  auth = await db.session();
  await reload();
  if (db.linkErro) toast('O link de recuperação expirou ou já foi usado. Peça outro em “Esqueci a senha”.');
  else if (db.recuperando) { location.hash = '#org'; openNovaSenha(); }
  db.subscribe(changed);
  setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 60000);
}
start();
