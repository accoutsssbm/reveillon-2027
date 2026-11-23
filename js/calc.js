// Todas as contas da festa: porções, lista de compras, totais, rateio e tarefas.
import { sum } from './util.js';

export const CONT = ['kg', 'L'];              // vendidos fracionados
export const rnd = (q, un) => q <= 0 ? 0 : CONT.includes(un) ? Math.ceil(q * 10 - 1e-9) / 10 : Math.ceil(q - 1e-9);

export const CATS = { entrada: 'Entradas', principal: 'Pratos principais', acompanhamento: 'Acompanhamentos', sobremesa: 'Sobremesas', mesa: 'Mesa posta (frutas e doces)', cafe: 'Café da manhã' };
export const ICATS = { bebida: 'Bebidas', descartavel: 'Descartáveis', aluguel: 'Aluguel de mesas e cadeiras' };
export const ST = { sim: 'Vou', talvez: 'Talvez', pend: 'Sem resposta', nao: 'Não vou' };

export function calc(S) {
  const cfg = S.config || {};
  const im = Object.fromEntries(S.insumos.map(i => [i.id, i]));
  const vai = S.pessoas.filter(p => p.status === 'sim');
  const A = vai.filter(p => p.tipo !== 'crianca').length, K = vai.length - A;
  const dA = vai.filter(p => p.dorme && p.tipo !== 'crianca').length, dK = vai.filter(p => p.dorme && p.tipo === 'crianca').length;
  const fc = +cfg.fc || 0, fcota = +cfg.fcota || 0;
  const P = A + K * fc, D = dA + dK * fc, H = vai.length, HD = dA + dK;
  const pr = {}, it = {}, de = {}, load = {}, gasto = {}, tasks = {};
  const own = (id, kind, nome, v, conta = true) => {
    if (!id) return;
    load[id] = (load[id] || 0) + 1;
    if (conta) gasto[id] = (gasto[id] || 0) + v;
    (tasks[id] = tasks[id] || []).push({ kind, nome, v });
  };

  // pratos: custo proporcional ao consumo
  for (const p of S.pratos) {
    const base = p.cat === 'cafe' ? D : P, f = +p.rende > 0 ? base / p.rende : 0;
    const lines = (p.ing || []).map(l => {
      const i = im[l.i] || { nome: '(insumo removido)', un: 'un', preco: 0 };
      const need = (+l.q || 0) * f;
      return { ...l, ins: i, need, cost: need * (+i.preco || 0) };
    });
    pr[p.id] = { lines, t: sum(lines, l => l.cost), base };
    if (p.sel) own(p.resp, p.cat === 'cafe' ? 'Café da manhã' : 'Cardápio', p.nome, pr[p.id].t, false);
  }
  // lista de compras por responsável, arredondada para embalagem fechada (é o gasto real)
  const shop = {};
  for (const p of S.pratos.filter(p => p.sel)) {
    const k = (p.resp || '') + '|' + (p.cat === 'cafe' ? 1 : 0);
    const g = shop[k] = shop[k] || { key: k, resp: p.resp || '', cafe: p.cat === 'cafe', it: {}, t: 0 };
    for (const l of pr[p.id].lines) {
      if (!l.need) continue;
      const e = g.it[l.i] = g.it[l.i] || { ins: l.ins, raw: 0, pr: [] };
      e.raw += l.need; if (!e.pr.includes(p.nome)) e.pr.push(p.nome);
    }
  }
  for (const g of Object.values(shop)) {
    for (const e of Object.values(g.it)) { e.buy = rnd(e.raw, e.ins.un); e.cost = e.buy * (+e.ins.preco || 0); g.t += e.cost; }
    if (g.resp) gasto[g.resp] = (gasto[g.resp] || 0) + g.t;
  }
  // bebidas, descartáveis, aluguel
  for (const x of S.itens) {
    const n = +x.n || 0, base = x.conta === 'dorme' ? HD : H;
    let q = x.tipo === 'fixo' ? n : (n > 0 ? base / n : 0);
    q = rnd(q, x.un);
    it[x.id] = { q, t: q * (+x.preco || 0) };
    if (x.sel) own(x.resp, ICATS[x.cat] || 'Item', x.nome, it[x.id].t);
  }
  // decoração (custo fixo)
  for (const d of S.decor) {
    const t = sum(d.mat || [], m => (+m.q || 0) * (+m.p || 0));
    de[d.id] = { t };
    if (d.sel) own(d.resp, 'Decoração', d.nome, t);
  }
  const shopV = Object.values(shop);
  const tot = {
    comida: sum(shopV.filter(g => !g.cafe), g => g.t),
    cafe: sum(shopV.filter(g => g.cafe), g => g.t),
    bebida: sum(S.itens.filter(x => x.sel && x.cat === 'bebida'), x => it[x.id].t),
    descartavel: sum(S.itens.filter(x => x.sel && x.cat === 'descartavel'), x => it[x.id].t),
    aluguel: sum(S.itens.filter(x => x.sel && x.cat === 'aluguel'), x => it[x.id].t),
    decoracao: sum(S.decor.filter(d => d.sel), d => de[d.id].t)
  };
  const total = Object.values(tot).reduce((a, b) => a + b, 0);
  const div = A + K * fcota, cota = div > 0 ? total / div : 0, cotaK = cota * fcota;

  // quem paga o quê, por família.
  // "de" aponta para o responsável da família. Se ele cobra junto, tudo da família (cota, gasto e pago) cai na conta dele.
  const byId = Object.fromEntries(S.pessoas.map(p => [p.id, p]));
  const chefe = p => { const h = p.de && byId[p.de]; return h && h.id !== p.id ? h : null; };
  // criança fica sempre na conta do responsável; adulto só quando a família é cobrada junto
  const alvo = p => { const h = chefe(p); return h && (h.cobrar_junto !== false || p.tipo === 'crianca') ? h.id : p.id; };
  const conta = id => pag[id] = pag[id] || { devido: 0, gasto: 0, pago: 0, kids: [], membros: [] };
  const pag = {};
  for (const p of vai) {
    const r = conta(alvo(p)), v = p.tipo === 'crianca' ? cotaK : cota;
    r.devido += v; r.membros.push({ id: p.id, nome: p.nome, tipo: p.tipo, v });
    if (alvo(p) !== p.id) r.kids.push(p.nome);
  }
  for (const p of S.pessoas) {
    if (!(gasto[p.id] || +p.pago)) continue;
    const r = conta(alvo(p)); r.gasto += gasto[p.id] || 0; r.pago += +p.pago || 0;
  }
  for (const id in pag) { const r = pag[id]; r.saldo = Math.round((r.devido - r.gasto - r.pago) * 100) / 100; }
  // famílias: responsável + quem aponta para ele
  const fam = {};
  for (const p of S.pessoas) { const h = chefe(p); if (h) (fam[h.id] = fam[h.id] || []).push(p); }
  return {
    im, A, K, dA, dK, P, D, H, HD, pr, it, de, shop, load, gasto, tasks, tot, total, div, cota, cotaK, pag, fam, alvo,
    talvez: S.pessoas.filter(p => p.status === 'talvez').length,
    pend: S.pessoas.filter(p => !p.status || p.status === 'pend').length
  };
}
