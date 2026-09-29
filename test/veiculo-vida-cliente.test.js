/* ================================================================
   VEÍCULO COM VIDA — o lado do CLIENTE (js/veiculos.js), sem navegador.

   O módulo recebe Car/Heli/FX por injeção; aqui eles são dublês MÍNIMOS
   (grupo com posição e quaternion, contadores de chamada). O que se mede
   é o CONTRATO do cliente, que o teste de jogo (veiculo-vida-jogo) mede de
   novo no navegador:
     • a consulta lê a pose VIVA do grupo (nada de pose de um quadro atrás);
     • "meu veículo" é o que eu dirijo/piloto (a vítima não é coberta por ele);
     • no SOLO a regra roda local: 30 tiros de fuzil zeram o buggy, a
       queima tira a cobertura na hora e a explosão (5 s) tira o veículo do
       mundo e mata quem ficou dentro;
     • ONLINE nada é descontado aqui: o acerto vai para a rede;
     • o estilhaço respeita cobertura (a mesma do estilhaço em jogador);
     • quem entra no meio aplica o estado sem refazer a explosão.
   ================================================================ */
'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

const importar = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);

function grupo(x, y, z, yaw = 0) {
  return { position: { x, y, z }, quaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } };
}
function montar(opts = {}) {
  const chamadas = { remover: [], restaurar: [], explode: [], explodeFx: [], sair: 0, matar: 0, avisos: [] };
  const vehicles = [
    { cfg: { name: 'BUGGY' }, group: grupo(10, 0, 0) },
    { cfg: { name: 'ESPORTIVO GT' }, group: grupo(40, 0, 0) },
    { cfg: { name: 'CAMINHÃO MILITAR' }, group: grupo(80, 0, 0, Math.PI / 2) },
  ];
  const state = { driving: false, flying: false };
  const Car = { vehicles, group: vehicles[0].group,
    remover(v) { chamadas.remover.push(v); }, restaurar(v) { chamadas.restaurar.push(v); } };
  const Heli = { group: grupo(0, 30, 0), remover() { chamadas.remover.push(Heli); }, restaurar() { chamadas.restaurar.push(Heli); } };
  const FX = { burst() {}, spawnParticle() {} };
  let relogio = 0;
  const Grenades = { explode(p, k) { chamadas.explode.push([p, k]); }, explodeFx(p) { chamadas.explodeFx.push(p); } };
  return { chamadas, vehicles, state, Car, Heli, relogio: { get t() { return relogio; }, set t(v) { relogio = v; } },
    deps: { Car, Heli, FX, rand: () => 0.5, state, getGrenades: () => Grenades,
      sairDoVeiculo: () => { chamadas.sair++; state.driving = false; state.flying = false; },
      matarOcupante: () => { chamadas.matar++; }, avisar: m => chamadas.avisos.push(m),
      codigoDaArma: g => (g && g.codigo) || null, agora: () => relogio, ...opts } };
}
const X = { x: 1, y: 0, z: 0 };

describe('js/veiculos.js — o cliente da vida do veículo', () => {
  let V, VV;
  beforeEach(async () => {
    V = await importar('veiculos.js');
    VV = await importar('veiculo-vida.js');
    global.window = {};
  });
  afterEach(() => { delete global.window; });

  it('a consulta lê a pose VIVA do grupo, com giro', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    const o = { x: 0, y: 0.1, z: 0 };
    assert.ok(Math.abs(F.raio(o, X, 100).t - (10 - VV.TIPOS.buggy.caixas[0].max[0])) < 1e-9);
    m.vehicles[0].group.position.x = 20; // andou depois de criado
    assert.ok(Math.abs(F.raio(o, X, 100).t - (20 - VV.TIPOS.buggy.caixas[0].max[0])) < 1e-9, 'pose congelada na criação');
    // caminhão girado 90°: pelo lado X ele mostra a LARGURA
    m.vehicles[0].group.position.x = 500; m.vehicles[1].group.position.x = 500;
    const h = F.raio({ x: 60, y: 0.5, z: 0 }, X, 100);
    assert.equal(h.alvo.tipo, 'caminhao');
    assert.ok(Math.abs(h.t - (20 - VV.TIPOS.caminhao.caixas[0].max[2])) < 1e-9, `giro ignorado: ${h.t}`);
  });

  it('"meu veículo": o que eu dirijo ou piloto — e `ignorar` o tira da conta', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    assert.equal(F.meu(), null);
    m.state.driving = true;
    assert.equal(F.meu().id, 0);
    assert.ok(Math.abs(F.bloqueio({ x: 0, y: 0.1, z: 0 }, X, 100, F.meu()) - (40 + VV.TIPOS.esportivo.caixas[0].min[0])) < 1e-9);
    m.state.driving = false; m.state.flying = true;
    assert.equal(F.meu().id, 'heli');
  });

  it('SOLO: 29 tiros de fuzil não zeram o buggy; o 30º zera — para de proteger NA HORA; 5 s depois explode, some e mata quem ficou dentro', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    const b = F.porId(0), fuzil = { codigo: 'FUZIL' };
    for (let i = 0; i < 29; i++) F.acertarBala(b, 26, fuzil, null);
    assert.equal(b.vida, 26);
    assert.ok(F.raio({ x: 0, y: 0.1, z: 0 }, X, 30), 'com 26 de vida ainda devia proteger');
    m.state.driving = true; // o jogador está dentro
    F.acertarBala(b, 26, fuzil, null);
    assert.equal(b.estado, 'queimando');
    assert.equal(F.raio({ x: 0, y: 0.1, z: 0 }, X, 30), null, 'em chamas e ainda segurando bala');
    assert.ok(m.chamadas.avisos.some(a => /CHAMAS/.test(a)), 'quem está dentro não foi avisado');
    m.relogio.t = VV.QUEIMA_S * 1000 - 1; F.update(0.016, null);
    assert.equal(b.estado, 'queimando', 'explodiu antes da queima acabar');
    m.relogio.t = VV.QUEIMA_S * 1000 + 1; F.update(0.016, null);
    assert.equal(b.estado, 'destruido');
    assert.deepEqual(m.chamadas.remover, [m.vehicles[0]]);
    assert.equal(m.chamadas.sair, 1, 'quem estava dentro não saiu do veículo');
    assert.equal(m.chamadas.matar, 1, 'quem estava dentro não morreu');
    assert.equal(m.chamadas.explode.length, 1);
    assert.equal(m.chamadas.explode[0][1], 'VEICULO');
  });

  it('SOLO: faca não fura lataria; bazuca direta destrói o buggy num foguete', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    F.acertarBala(F.porId(0), 34, { codigo: 'FACA' }, null);
    assert.equal(F.porId(0).vida, 780);
    F.explosao({ x: 10 - VV.TIPOS.buggy.caixas[0].max[0], y: 0, z: 0 }, 'BAZUCA', 7.5, 110);
    assert.equal(F.porId(0).estado, 'queimando');
  });

  it('ONLINE: nada é descontado no cliente — o acerto vai para a rede', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    const rede = [];
    F.rede = { bala: (it, d, a) => rede.push(['bala', it.id, d, a]), explosao: (it, d, k) => rede.push(['explosao', it.id, d, k]) };
    global.window.__BR_active = true;
    F.acertarBala(F.porId(1), 26, 'FUZIL', null);
    F.explosao({ x: 40, y: 0, z: 0 }, 'GRANADA', 7.5, 110);
    assert.equal(F.porId(1).vida, 1170, 'o cliente descontou vida que é do servidor');
    assert.deepEqual(rede.map(r => r.slice(0, 2)), [['bala', 1], ['explosao', 1]]);
    // e a queima online não tem relógio local: quem manda explodir é o servidor
    F.queimar(1);
    m.relogio.t = 1e9; F.update(0.016, null);
    assert.equal(F.porId(1).estado, 'queimando');
    F.explodir(1, [40, 0, 0]);
    assert.equal(F.porId(1).estado, 'destruido');
    assert.equal(m.chamadas.explode.length, 0, 'online o cliente não aplica o dano da explosão');
    assert.equal(m.chamadas.explodeFx.length, 1, 'online a explosão ainda aparece');
  });

  it('o estilhaço respeita cobertura: com parede no meio, nada; sem, o dano cai com a distância até a LATARIA', () => {
    let bloqueado = true;
    const m = montar({ rayBlockedAt: (o, d, len) => (bloqueado ? len * 0.5 : Infinity) });
    const F = V.criarVeiculos(m.deps);
    const lat = 40 + VV.TIPOS.esportivo.caixas[0].min[0];
    F.explosao({ x: lat - 3, y: 0, z: 0 }, 'GRANADA', 7.5, 110);
    assert.equal(F.porId(1).vida, 1170, 'estilhaço atravessou a parede');
    bloqueado = false;
    F.explosao({ x: lat - 3, y: 0, z: 0 }, 'GRANADA', 7.5, 110);
    const esperado = VV.danoExplosivoNoVeiculo('GRANADA', Math.round(110 * (1 - 3 / 7.5) + 20));
    assert.ok(Math.abs(1170 - F.porId(1).vida - esperado) < 1e-9, `dano ${1170 - F.porId(1).vida} × ${esperado}`);
  });

  it('quem entra no meio aplica o estado sem refazer a explosão (sem clarão, sem som)', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    F.aplicarLista([{ v: 0, estado: 'destruido', pos: [10, 0, 0] }, { v: 1, estado: 'queimando' }, { v: 2, vida: 900, estado: 'inteiro' }]);
    assert.equal(F.porId(0).estado, 'destruido');
    assert.equal(m.chamadas.explodeFx.length + m.chamadas.explode.length, 0, 'refez a explosão de quem já tinha explodido');
    assert.equal(F.porId(1).inteiro, false);
    assert.equal(F.porId(2).vida, 900);
  });

  it('JOGAR DE NOVO (solo) devolve a frota inteira', () => {
    const m = montar();
    const F = V.criarVeiculos(m.deps);
    F.queimar(0); F.explodir(0);
    F.restaurar();
    assert.ok(F.itens.every(i => i.inteiro && i.vida === i.vidaMax));
    assert.equal(m.chamadas.restaurar.length, F.itens.length);
  });
});
