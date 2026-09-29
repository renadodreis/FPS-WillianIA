/* ================================================================
   VEÍCULOS COM VIDA — o lado do CLIENTE.

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não...
   pra sempre!!". A regra (caixas, vida, dano, queima, explosão) é UMA, em
   js/veiculo-vida.js, a mesma do servidor e dos bots. Aqui mora o que só o
   cliente tem: a pose DESENHADA de cada veículo (a do three, com rampa e
   tudo), o encaminhamento do acerto (rede no BR, conta local no solo), a
   fumaça e o fogo, e a explosão que tira o veículo do mundo.

   Quem consulta:
     • game.js compõe o `Structures.rayHit/segBlocked` com `bloqueio`/
       `segmento` — é por ali que a bala do hitscan (`rayBlockedAt`), o
       projétil do BR, o foguete, a granada (quica na lataria), a vítima
       (`youWereHit`) e a visada da IA passam a conhecer o veículo INTEIRO;
     • game.js (hitscan) e br-game.js (projétil, estilhaço) chamam
       `acertarBala`/`explosao` quando a bala para numa lataria;
     • br-game.js pluga a REDE (`rede`) e aplica o que o servidor decide
       (`aplicarVida`, `queimar`, `explodir`, `aplicarLista`).

   Autoridade: no BR online a vida é do SERVIDOR — o cliente só reporta.
   No solo (sem sala) a mesma regra roda aqui, localmente.
   ================================================================ */
import * as VV from './veiculo-vida.js';

/* o tipo de vida de cada modelo de js/car.js */
const TIPO_DO_CFG = { BUGGY: 'buggy', 'ESPORTIVO GT': 'esportivo', 'CAMINHÃO MILITAR': 'caminhao' };

export function criarVeiculos(deps) {
  const { Car, Heli, FX, rand, state,
    getGrenades = () => null,          // explodeFx/explode (criado depois)
    sairDoVeiculo = () => {},          // tira o jogador do carro/heli (game.js tryToggleCar)
    matarOcupante = () => {},          // solo: quem está dentro morre
    avisar = () => {},                 // centerMsg
    codigoDaArma = () => null,         // índice do arsenal → código (FUZIL, ...)
    rayBlockedAt = null,               // cobertura do estilhaço (game.js)
    agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), // ms (QA injeta)
  } = deps;

  const itens = [];
  function novoItem(id, tipo, grupo, ref) {
    const T = VV.TIPOS[tipo];
    const it = {
      id, tipo, ref, grupo, vida: T.vida, vidaMax: T.vida, estado: 'inteiro', inteiro: true,
      queimaAte: 0, fumacaAcc: 0, avisou: 0,
      /* a pose DESENHADA, lida na hora da consulta (nada de pose de um quadro atrás) */
      pose: {
        get x() { return grupo.position.x; }, get y() { return grupo.position.y; },
        get z() { return grupo.position.z; }, q: grupo.quaternion,
      },
    };
    itens.push(it);
    return it;
  }
  Car.vehicles.forEach((v, i) => {
    const tipo = TIPO_DO_CFG[v.cfg.name];
    if (!tipo) throw new Error(`veículo sem tipo de vida: ${v.cfg.name}`);
    novoItem(i, tipo, v.group, v);
  });
  const heliItem = novoItem(VV.HELI, 'heli', Heli.group, Heli);
  const porId = id => itens.find(it => String(it.id) === String(id)) || null;
  const deCarro = v => itens.find(it => it.ref === v) || null;

  /* o veículo em que EU estou (a vítima não é coberta pelo próprio veículo:
     quem atirou já decidiu que a esfera veio antes da lataria) */
  function meu() {
    if (state.flying) return heliItem;
    if (state.driving) return deCarro(Car.vehicles.find(v => v.group === Car.group));
    return null;
  }

  /* ---------------- consultas (bala e visada) ---------------- */
  function raio(o, d, maxDist, ignorar = null) {
    return VV.raioNaFrota(o, d, maxDist, itens, ignorar);
  }
  function bloqueio(o, d, maxDist, ignorar = null) {
    const h = VV.raioNaFrota(o, d, maxDist, itens, ignorar);
    return h ? h.t : Infinity;
  }
  function segmento(a, b, ignorar = null) {
    return !!VV.segmentoNaFrota(a, b, itens, ignorar);
  }

  /* ---------------- acerto ----------------
   `rede` é plugada pelo br-game.js: { bala(item, dano, gun, ponto),
   explosao(item, dano, kind, impacto) }. Com a sala no ar é ela quem
   leva o acerto ao servidor; sem sala, a conta é local. */
  const api = { rede: null };
  const online = () => !!(api.rede && typeof window !== 'undefined' && window.__BR_active);

  /* `arma`: o código (FUZIL, ...) que o projétil carrega, ou o objeto da
     arma na mão (hitscan) */
  function acertarBala(item, dano, arma, ponto) {
    if (!item || !item.inteiro) return;
    if (ponto) FX.burst(ponto, _normalPara(item, ponto), 'spark');
    if (online()) { api.rede.bala(item, dano, arma, ponto); return; }
    danificarLocal(item, VV.danoDeBalaNoVeiculo(typeof arma === 'string' ? arma : codigoDaArma(arma), dano));
  }
  /* estilhaço de uma explosão local (granada/foguete) nos veículos em volta:
     a mesma queda do dano em jogador, medida até a LATARIA */
  function explosao(p, kind, raioEx, danoMax) {
    for (const it of itens) {
      if (!it.inteiro) continue;
      const d = VV.distanciaAoVeiculo(p, it.pose, it.tipo);
      if (d >= raioEx) continue;
      if (!estilhacoAlcanca(p, it, d)) continue; // parede/morro/outro veículo no meio
      const dano = Math.round(danoMax * (1 - d / raioEx) + 20);
      if (online()) api.rede.explosao(it, dano, kind, p);
      else danificarLocal(it, VV.danoExplosivoNoVeiculo(kind, dano));
    }
  }
  /* a mesma cobertura do estilhaço em jogador (grenades.js blastClear): do
     ponto 0,2 m acima da explosão até o meio da lataria, sem contar o
     próprio veículo. Encostado nele (d < 0,5 m) não há o que cobrir. */
  function estilhacoAlcanca(p, it, d) {
    if (!rayBlockedAt || d < 0.5) return true;
    const cx = VV.TIPOS[it.tipo].caixas[0];
    const o = { x: p.x, y: p.y + 0.2, z: p.z };
    const alvo = { x: it.pose.x, y: it.pose.y + (cx.min[1] + cx.max[1]) / 2, z: it.pose.z };
    const dx = alvo.x - o.x, dy = alvo.y - o.y, dz = alvo.z - o.z, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return rayBlockedAt(o, { x: dx / len, y: dy / len, z: dz / len }, len, it) >= len - 0.15;
  }
  function danificarLocal(item, dano) {
    if (!item.inteiro || !(dano > 0)) return;
    aplicarVida(item.id, item.vida - dano);
    if (item.vida <= 0) queimar(item.id);
  }

  /* ---------------- estado (do servidor, ou local no solo) ---------------- */
  function aplicarVida(id, vida) {
    const it = porId(id);
    if (!it || it.estado !== 'inteiro' || !Number.isFinite(vida)) return;
    it.vida = Math.max(0, Math.min(it.vidaMax, vida));
    // quem está dentro sente o veículo apanhar (Warzone: "critical damage")
    if (it === meu()) {
      const k = it.vida / it.vidaMax;
      if (k <= 0.25 && it.avisou < 2) { it.avisou = 2; avisar('⚠ DANO CRÍTICO — saia do veículo!', 1800); }
      else if (k <= 0.5 && it.avisou < 1) { it.avisou = 1; avisar('Veículo danificado', 1400); }
    }
  }
  /* vida zero: PARA DE PROTEGER na hora, motor morto, 5 s em chamas */
  function queimar(id) {
    const it = porId(id);
    if (!it || it.estado !== 'inteiro') return;
    it.vida = 0;
    it.estado = 'queimando';
    it.inteiro = false;
    it.queimaAte = agora() + VV.QUEIMA_S * 1000;
    if (it.ref === Heli) Heli.semSustentacao = true;
    else it.ref.semMotor = true;
    if (it === meu()) avisar('🔥 VEÍCULO EM CHAMAS — SAIA!', 2600);
  }
  /* explodiu: o veículo SOME (Fortnite: "be removed"); no solo, a explosão
     fere em volta e mata quem ficou dentro; online, isso é do servidor */
  function explodir(id, pos, silencioso = false) {
    const it = porId(id);
    if (!it || it.estado === 'destruido') return;
    const dentro = it === meu();
    it.vida = 0; it.estado = 'destruido'; it.inteiro = false;
    _v.set(pos ? pos[0] : it.pose.x, pos ? pos[1] : it.pose.y, pos ? pos[2] : it.pose.z);
    if (dentro) sairDoVeiculo();
    const G = getGrenades();
    if (silencioso || !G) { /* já tinha explodido (quem entrou no meio): só some */ }
    else if (!online() && G.explode) G.explode(_v.clone(), 'VEICULO');
    else if (G.explodeFx) G.explodeFx(_v.clone());
    // destroços escuros voando
    if (!silencioso) for (let i = 0; i < 14; i++) {
      _w.set(rand(-1, 1), rand(0.6, 1.6), rand(-1, 1)).normalize().multiplyScalar(rand(5, 11));
      FX.spawnParticle(_v, _w, i % 3 ? 0x2a2b2e : 0x5a3a22, rand(0.12, 0.3), rand(0.9, 1.6), 14);
    }
    if (it.ref === Heli) Heli.remover();
    else Car.remover(it.ref);
    if (dentro && !online()) matarOcupante();
  }
  /* init de quem entra com a partida rodando: [{ v, vida, estado, pos }] */
  function aplicarLista(lista) {
    for (const e of Array.isArray(lista) ? lista : []) {
      if (!e) continue;
      if (e.estado === 'destruido') explodir(e.v, e.pos, true); // já tinha explodido: só some
      else if (e.estado === 'queimando') queimar(e.v);
      else aplicarVida(e.v, +e.vida);
    }
  }
  /* solo: JOGAR DE NOVO devolve a frota inteira */
  function restaurar() {
    for (const it of itens) {
      it.vida = it.vidaMax; it.estado = 'inteiro'; it.inteiro = true; it.avisou = 0; it.queimaAte = 0;
      if (it.ref === Heli) Heli.restaurar();
      else Car.restaurar(it.ref);
    }
  }

  /* ---------------- quadro: fumaça, fogo e o relógio do solo ---------------- */
  const _v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    clone() { return { x: this.x, y: this.y, z: this.z, clone() { return this; } }; } };
  const _w = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; },
    multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; } };
  function update(dt, camPos) {
    const t = agora();
    for (const it of itens) {
      if (it.estado === 'destruido') continue;
      if (it.estado === 'queimando' && !online() && t >= it.queimaAte) { explodir(it.id); continue; }
      const k = it.vida / it.vidaMax;
      if (k > 0.5) continue;
      if (camPos && Math.hypot(camPos.x - it.pose.x, camPos.z - it.pose.z) > 160) continue;
      it.fumacaAcc += dt;
      const passo = it.estado === 'queimando' ? 0.05 : k <= 0.25 ? 0.09 : 0.16;
      if (it.fumacaAcc < passo) continue;
      it.fumacaAcc = 0;
      const topo = VV.TIPOS[it.tipo].caixas[0].max[1];
      _v.set(it.pose.x + rand(-0.4, 0.4), it.pose.y + topo, it.pose.z + rand(-0.4, 0.4));
      _w.set(rand(-0.4, 0.4), rand(1.2, 2.2), rand(-0.4, 0.4));
      if (it.estado === 'queimando') {
        FX.spawnParticle(_v, _w, rand() < 0.5 ? 0xff7a22 : 0xffb347, rand(0.3, 0.55), rand(0.35, 0.6), -1.5, true);
        _w.set(rand(-0.3, 0.3), rand(1.8, 2.8), rand(-0.3, 0.3));
        FX.spawnParticle(_v, _w, 0x1e1e20, rand(0.5, 0.9), rand(1.2, 1.8), -0.8);
      } else {
        FX.spawnParticle(_v, _w, k <= 0.25 ? 0x2c2c2e : 0x77746e, rand(0.35, 0.65), rand(1.0, 1.6), -0.6);
      }
    }
  }

  /* normal grosseira da faísca: do centro do veículo para o ponto */
  function _normalPara(item, p) {
    const n = { x: p.x - item.pose.x, y: p.y - item.pose.y, z: p.z - item.pose.z };
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / l, y: n.y / l, z: n.z / l };
  }

  return Object.assign(api, {
    itens, porId, meu, raio, bloqueio, segmento, acertarBala, explosao,
    aplicarVida, queimar, explodir, aplicarLista, restaurar, update,
    TIPOS: VV.TIPOS, ARMAS: VV.DANO_BALA_MAX,
    regra: VV, // br-game.js é script clássico: a regra pura chega por aqui
  });
}
