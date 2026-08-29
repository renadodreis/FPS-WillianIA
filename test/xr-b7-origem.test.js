/* ================================================================
   QA — B7: DE ONDE O TIRO NASCE, E DE ONDE ELE APARECE (VR).

   O QUE ESTE ARQUIVO MEDE, E POR QUE ELE EXISTE.
   O critério B7 antigo cobrava "origem do raio a ≤ 5 cm da boca do cano" e
   reprovava sete das oito armas com os MESMOS DÍGITOS por cinco rodadas. A
   pesquisa (`docs/vr/referencia-origem-do-tiro.md`, §8.1) mostrou por quê:
   aqueles sete números saem de `js/weaponrig.js` com uma calculadora, sem o
   jogo rodando — são, ao quarto decimal, a ALTURA DE ALÇA de cada perfil.
   O critério media a geometria do ASSET e chamava isso de comportamento do
   código; nenhuma mudança em `fire()` mexia nele.

   O B7 reescrito (commit fd3ee45) cobra CINCO coisas, e são estas cinco que
   este arquivo mede — uma por caso, com a reinjeção anotada em cada um:

     B7a · o que se VÊ (clarão, traçante, primeiro segmento de projétil
           desenhado) começa a ≤ 0,05 m da âncora `muzzle`, CONGELADA no
           instante do tiro, nos três caminhos de `fire()`;
     B7b · a origem BALÍSTICA, decomposta contra o eixo do cano: longitudinal
           ≤ 0,02 m da boca, transversal = altura de alça da mira ATIVA
           ± 0,01 m — e reprova ABAIXO também, porque transversal zero é
           origem no cano, o defeito que o B3 existe para impedir;
     B7c · o segmento boca→origem não cruza sólido (head glitching);
     B7d · projétil VISÍVEL (a bazuca) nasce na boca, ≤ 0,02 m;
     B7-M· a faca golpeia a ≤ 0,05 m do PUNHO e a ≤ 1° do eixo da lâmina.

   A ÂNCORA, E POR QUE ELA NÃO É A LINHA DE MIRA.
   `altura de alça` aqui NÃO é lida do código de tiro: ela é calculada das
   constantes do perfil de `js/weaponrig.js` (`sights[].eye` da mira ativa) e
   da âncora `muzzle` do modelo desenhado (`gun.muzzleAnchor.position`). O
   código de `fire()` não escreve nenhuma das duas. É a mesma disciplina que
   `test/xr-mira.test.js` adotou depois de calcular 1,86e-15 m comparando
   `miraDoTiro()` consigo mesma — e é o motivo de a medida deste arquivo
   poder ficar VERMELHA.

   CONGELAMENTO. Tudo o que é comparado com o tiro sai das sondas congeladas
   do `game.js` (`origemDoTiro`, `direcaoDoTiro`, `canoPosDoTiro`,
   `canoDoTiro`). Ler o cano DEPOIS do disparo mede o RECUO: 0,88° numa
   automática (15 cm a 10 m) e 42 cm na bazuca. As sondas que rodam DENTRO do
   disparo (traçante, clarão, foguete) não usam a congelada: elas montam a
   âncora `muzzle` na hora, da matriz da arma — no ramo do foguete o
   `marcarCanoQA()` só roda DEPOIS do `Rockets.fire`, e ler a congelada ali dá
   a boca do tiro ANTERIOR (medido: 0,1517 m de "defeito" inexistente). Elas
   rodam no MESMO instante síncrono do disparo, então não há recuo entre uma
   coisa e outra.

   E A ÂNCORA NÃO É `canoMundo()`. Aquele acessor devolve a posição do GRUPO DE
   FX do clarão, que é filho da âncora — medir o clarão contra ele é medir um
   objeto contra si mesmo. Reinjetado (grupo do clarão pendurado na linha de
   mira) o caso continuava dando 0,000 cm; com a âncora vinda de
   `gun.muzzleAnchor.position` × a matriz da arma, o mesmo mutante dá 9,10 cm.

   PORTA 3840 (faixa 3840–3858 deste arquivo e do `xr-b7-tracer-br`).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3840;

/* B7a — o que se VÊ. 5 cm é o teto do critério: acima disso a bala nasce
   visivelmente no ar, longe da arma que o jogador tem na mão. */
const TETO_VISUAL = 0.05;
/* B7b — longitudinal: a origem fica na ESTAÇÃO da boca ao longo do cano.
   Quem tira a projeção do avanço manda a origem para a ocular: medido −0,65 m
   no fuzil, −0,70 m na escopeta, −0,78 m no DMR. */
const TETO_LONG = 0.02;
/* B7b — transversal: a origem fica SOBRE a linha de mira, e o afastamento do
   cano é exatamente a altura de alça da mira ATIVA. Teto E PISO: zero reprova
   (origem no cano = a paralaxe que o B3 impede) e sobra reprova. */
const TETO_TRANS = 0.01;
/* B7d — projétil VISÍVEL. Aqui o teto é duro: origem deslocada num foguete
   detona perto de quem atirou (medido: 42 de dano em si mesmo). */
const TETO_FOGUETE = 0.02;
const TETO_FACA = 0.05;
const TETO_FACA_GRAUS = 1.0;

async function instalarB7() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const WR = G.WeaponRig;
  /* Sem dispersão e com um projétil: o que se mede aqui é a ORIGEM e o EIXO
     do tiro, e chumbo aleatório em cima disso só embaralha a leitura. */
  for (const a of G.arsenal) { a.spread = 0; a.spreadHip = 0; a.spreadAds = 0; a.pellets = 1; }

  const vec = a => new T.Vector3().fromArray(a);
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
  const naCena = o => { let p = o; while (p) { if (p === MP.scene) return true; p = p.parent; } return false; };

  /* ---- o TRAÇANTE, lido no GRAFO DA CENA ----
     Não se lê o argumento passado a `FX.spawnTracer`: lê-se o MESH que ficou
     desenhado, subindo a cadeia de pais até a `scene` e reprovando se ela não
     chegar lá. Ler `visible` sem perguntar se está no grafo é o formato 5 da
     lista do CLAUDE.md — objeto com `visible: true` e sem pai não é desenhado
     por ninguém. O pool é identificado pela GEOMETRIA (BoxGeometry
     0,025 × 0,025 × 1, de js/fx.js), não por nome. */
  const pool = [];
  MP.scene.traverse(o => {
    if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry') return;
    const p = o.geometry.parameters;
    if (p && Math.abs(p.width - 0.025) < 1e-6 && Math.abs(p.depth - 1) < 1e-6) pool.push(o);
  });
  const foto = () => pool.map(m => m.position.toArray()
    .concat(m.quaternion.toArray(), m.scale.toArray(), [m.visible ? 1 : 0, m.material.opacity]).join(','));

  /* o clarão: os três planos do flash carregam `userData.weaponFx` */
  let flash = null;
  MP.scene.traverse(o => { if (!flash && o.isMesh && o.userData && o.userData.weaponFx) flash = o; });

  /* A ÂNCORA `muzzle` DO MODELO, em coordenadas de mundo — e NÃO o
     `canoMundo()`. Os dois dão o mesmo ponto no código são, mas `canoMundo()`
     lê o GRUPO DE FX do clarão, que é filho da âncora: medir o clarão contra
     ele é medir um objeto contra si mesmo. Reinjetei o defeito para conferir —
     pendurei o grupo do clarão na linha de mira — e o caso continuou dando
     0,000 cm. Com a âncora vinda de `gun.muzzleAnchor.position` × a matriz da
     arma, o mesmo mutante dá 9,10 cm. */
  const ancoraDoModelo = () => {
    const gun = G.arsenal[G.gunIndex];
    gun.group.updateWorldMatrix(true, false);
    return gun.muzzleAnchor.position.clone().applyMatrix4(gun.group.matrixWorld);
  };

  const tracers = [], clarao = [], foguetes = [];
  /* SONDA-OBSERVADORA, não condutora: chama o original PRIMEIRO e só depois
     lê o que ficou na cena. O disparo continua vindo do gatilho do Touch,
     dentro do laço do jogo — o teste não chama `fire()`. */
  const origTracer = MP.FX.spawnTracer;
  MP.FX.spawnTracer = function (...args) {
    const antes = foto();
    const ret = origTracer.apply(this, args);
    const depois = foto();
    const boca = ancoraDoModelo();
    for (let i = 0; i < pool.length; i++) {
      if (antes[i] === depois[i]) continue;
      const m = pool[i];
      m.updateWorldMatrix(true, false);
      const centro = new T.Vector3().setFromMatrixPosition(m.matrixWorld);
      const eixo = new T.Vector3().setFromMatrixColumn(m.matrixWorld, 2);
      const meio = eixo.length() / 2;
      eixo.normalize();
      const a = centro.clone().addScaledVector(eixo, -meio);
      const b = centro.clone().addScaledVector(eixo, meio);
      /* o traçante é desenhado do "de" para o "até"; qual ponta é a boca não
         é decisão do teste — pega a mais próxima e mede ela. Se as DUAS
         estiverem longe, o número reprova de qualquer jeito. */
      const dA = a.distanceTo(boca), dB = b.distanceTo(boca);
      tracers.push({
        aoCano: Math.min(dA, dB), comprimento: meio * 2,
        naCena: naCena(m), visivel: m.visible, opacidade: m.material.opacity,
      });
    }
    if (flash) {
      flash.updateWorldMatrix(true, false);
      clarao.push({
        aoCano: new T.Vector3().setFromMatrixPosition(flash.matrixWorld).distanceTo(boca),
        naCena: naCena(flash), visivel: flash.visible,
      });
    }
    return ret;
  };
  /* o FOGUETE: `js/rockets.js` já marca o grupo com `userData.__rocket`. */
  const origRocket = G.Rockets.fire;
  G.Rockets.fire = function (...args) {
    const ret = origRocket.apply(this, args);
    const boca = ancoraDoModelo();
    let m = null;
    MP.scene.traverse(o => { if (!m && o.userData && o.userData.__rocket && o.visible) m = o; });
    if (m) {
      m.updateWorldMatrix(true, false);
      foguetes.push({
        aoCano: new T.Vector3().setFromMatrixPosition(m.matrixWorld).distanceTo(boca),
        naCena: naCena(m), visivel: m.visible,
      });
    }
    return ret;
  };

  window.__B7 = {
    poolTracers: () => pool.length,
    achouClarao: () => !!flash,
    arma: () => (G.arsenal[G.gunIndex] || {}).name || '?',
    destravadas: () => G.arsenal.filter(a => !a.locked).length,

    /* A ÂNCORA INDEPENDENTE: altura de alça da mira ATIVA, em metros de
       mundo, calculada das constantes do perfil e da âncora do modelo. O
       código de tiro não escreve nenhuma das duas. */
    geo() {
      const idx = G.gunIndex, gun = G.arsenal[idx];
      const perfil = WR.inspect(idx);
      const sight = WR.activeSight(gun);
      /* mesma regra do `sightCoords` de js/weaponrig.js (GLB calibrado x
         fallback procedural), repetida porque lá ela é interna */
      const c = sight ? ((gun.modelStatus === 'fallback' && sight.fb) ? sight.fb : sight) : null;
      const mz = gun.muzzleAnchor.position;
      /* sem mira (a faca) a referência é o punho — B7-M mede outra coisa */
      const olho = c ? c.eye : (perfil && perfil.anchors.gripR) || [0, 0, 0];
      gun.group.updateWorldMatrix(true, false);
      const escala = gun.group.getWorldScale(new T.Vector3()).x;
      /* o eixo do cano em espaço local é o -Z do modelo; esta leitura só vale
         se a âncora não tiver giro próprio, e isso é AFIRMADO no caso. */
      const q = gun.muzzleAnchor.quaternion;
      return {
        idx, arma: gun.name, mira: sight ? sight.id : null,
        temMira: !!c, modelo: gun.modelStatus || 'procedural',
        alturaAlca: Math.hypot(olho[0] - mz.x, olho[1] - mz.y) * escala,
        ancoraGiro: 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI,
        escala,
      };
    },

    /* quantos acessórios de mira o perfil daquela arma tem — usado só para
       ESCOLHER a arma do caso das miras; nenhuma asserção sai daqui */
    nMiras(gun) {
      const p = WR.inspect(G.arsenal.indexOf(gun));
      return p ? p.sights.length : 0;
    },
    /* altura de alça de QUALQUER arma, sem precisar tê-la na mão — usada só
       para ESCOLHER a arma do B7c (quanto mais alta a alça, mais longe do
       cano a origem fica, e mais folga o cenário de parede precisa ter) */
    alcaDe(gun) {
      const idx = G.arsenal.indexOf(gun);
      const perfil = WR.inspect(idx);
      if (!perfil || !perfil.sights.length) return 0;
      const s = perfil.sights[0];
      const c = (gun.modelStatus === 'fallback' && s.fb) ? s.fb : s;
      const mz = gun.muzzleAnchor.position;
      return Math.hypot(c.eye[0] - mz.x, c.eye[1] - mz.y);
    },
    async trocar() {
      window.__A.botao('right', 'b-button', 1);
      await window.__A.espera(120);
      window.__A.botao('right', 'b-button', 0);
      await window.__A.espera(330);
    },
    async acharArma(filtro) {
      for (const a of G.arsenal) if (filtro(a)) a.locked = false;
      for (let i = 0; i < G.arsenal.length + 1; i++) {
        const g = G.arsenal[G.gunIndex];
        if (g && !g.locked && filtro(g)) return g.name;
        await window.__B7.trocar();
      }
      return null;
    },
    /* a troca de acessório de mira pelo caminho real do jogo (KeyT ->
       WeaponRig.cycleSight), para o VALOR ESPERADO mudar dentro do teste */
    async trocarMira() {
      for (const alvo of [document, window]) {
        alvo.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
        alvo.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT', bubbles: true }));
      }
      await window.__A.espera(340);
    },
    /* pose da MÃO direita: o quaternion do IWER é um objeto {x,y,z,w} simples
       e nem sempre tem `.set` — chamar método que não existe derrubaria o caso
       antes de medir */
    mao(x, y, z, w) {
      const q = window.__xrEmulado.controllers.right.quaternion;
      if (typeof q.set === 'function') q.set(x, y, z, w);
      else { q.x = x; q.y = y; q.z = z; q.w = w; }
    },
    /* a direção do afastamento cano→alça, VIVA (usada só para montar cenário
       do B7c; nenhuma asserção sai daqui) */
    ladoDaAlca() {
      const idx = G.gunIndex, gun = G.arsenal[idx];
      const sight = WR.activeSight(gun);
      const c = sight ? ((gun.modelStatus === 'fallback' && sight.fb) ? sight.fb : sight) : null;
      if (!c) return null;
      const mz = gun.muzzleAnchor.position;
      gun.group.updateWorldMatrix(true, false);
      return new T.Vector3(c.eye[0] - mz.x, c.eye[1] - mz.y, 0)
        .applyMatrix4(new T.Matrix4().extractRotation(gun.group.matrixWorld)).normalize().toArray();
    },
    bloqueio(de, dir, dist) {
      return MP.rayBlockedAt(vec(de), vec(dir).normalize(), dist);
    },
    canoVivo: () => G.canoMundo(),

    armarBR() {
      window.__balistica = null;
      window.__BR_ballistics = (origem, dir) => {
        window.__balistica = { origem: origem.toArray(), dir: dir.toArray() };
      };
    },

    /* UM aperto de gatilho, e a leitura completa do que o jogo fez. */
    async tiro(msSegurando = 150) {
      const g = G.arsenal[G.gunIndex];
      if (g) { g.mag = Math.max(g.mag, 5); g.reloading = false; }
      const geo = window.__B7.geo();
      tracers.length = 0; clarao.length = 0; foguetes.length = 0;
      window.__balistica = null;
      const antes = G.origemDoTiro().join(',');
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(msSegurando);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(280);
      const O = vec(G.origemDoTiro());
      const D = vec(G.direcaoDoTiro()).normalize();
      const M = vec(G.canoPosDoTiro());
      const b = vec(G.canoDoTiro()).normalize();
      const v = new T.Vector3().subVectors(O, M);
      const lo = v.dot(b);
      const tr = v.clone().addScaledVector(b, -lo);
      const saiu = G.origemDoTiro().join(',') !== antes || O.lengthSq() > 0;
      const out = {
        arma: geo.arma, mira: geo.mira, idx: geo.idx, geo, saiu,
        longitudinal: lo, transversal: tr.length(),
        ladoDaAlca: tr.length() > 1e-6 ? tr.clone().normalize().toArray() : null,
        grausDoCano: ang(D, b),
        boca: M.toArray(), origem: O.toArray(),
        tracers: tracers.slice(), clarao: clarao.slice(), foguetes: foguetes.slice(),
        balistica: null,
      };
      if (window.__balistica) {
        const Ob = vec(window.__balistica.origem);
        const vb = new T.Vector3().subVectors(Ob, M);
        const lb = vb.dot(b);
        out.balistica = {
          longitudinal: lb,
          transversal: vb.clone().addScaledVector(b, -lb).length(),
        };
      }
      return out;
    },

    /* B7-M: a faca. O PUNHO é o `gripSpace` do WebXR — "the centroid of the
       user's fist" (MDN) —, uma referência da PLATAFORMA, fora do código de
       mira. O eixo da lâmina é o -Z da âncora do modelo, congelado no golpe. */
    faca() {
      const O = vec(G.origemDoTiro());
      const D = vec(G.direcaoDoTiro()).normalize();
      const eixo = vec(G.canoDoTiro()).normalize();
      const punho = G.XR.punho('right');
      const idx = G.gunIndex, gun = G.arsenal[idx];
      const perfil = WR.inspect(idx);
      gun.group.updateWorldMatrix(true, false);
      const gp = vec(perfil.anchors.gripR).applyMatrix4(gun.group.matrixWorld);
      const pt = vec(perfil.anchors.muzzle).applyMatrix4(gun.group.matrixWorld);
      const diagonal = pt.clone().sub(gp).normalize();
      let aoPunho = null;
      if (punho) {
        punho.updateWorldMatrix(true, false);
        aoPunho = O.distanceTo(new T.Vector3().setFromMatrixPosition(punho.matrixWorld));
      }
      return {
        arma: gun.name, temPunho: !!punho, aoPunho,
        grausDoEixo: ang(D, eixo),
        /* a MEDIDA DA CAUSA: o quanto a diagonal punho→ponta (o eixo ERRADO,
           que era de onde saía o golpe) difere do eixo da lâmina. Se as duas
           coincidissem, o caso acima não separaria nada. */
        grausDaDiagonal: ang(diagonal, eixo),
      };
    },
  };
  return true;
}

describe('B7 · o tiro nasce na arma, e o que se vê nasce na boca',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarB7);
      await h.play(() => window.__A.espera(700));
    });
    after(async () => { if (h) await h.close(); });

    /* ================================================================
       B7a · O QUE SE VÊ SAI DA BOCA — caminho HITSCAN.
       Reinjeção: trocar `FX.spawnTracer(_v3, …)` por
       `FX.spawnTracer(_rayOrig, …)` no `game.js` põe o traçante na origem
       balística, 6 a 20 cm acima da boca.
       ================================================================ */
    it('B7a · o traçante do hitscan começa na BOCA, e o mesh está no grafo da cena', async () => {
      const r = await h.play(async () => {
        const out = [];
        const n = Math.min(window.__B7.destravadas(), 4);
        for (let i = 0; i < n; i++) {
          const g = window.__game.arsenal[window.__game.gunIndex];
          if (g && !g.rocket && !g.melee) out.push(await window.__B7.tiro());
          await window.__B7.trocar();
        }
        return { out, pool: window.__B7.poolTracers() };
      });
      assert.ok(r.pool > 0, 'nenhum mesh de traçante encontrado no grafo — a sonda não mede nada');
      const medidos = r.out.filter(t => t.tracers.length > 0);
      assert.ok(medidos.length > 0,
        `nenhum traçante desenhado em ${r.out.length} disparo(s) — o caso não mediu nada`);
      const ruins = [], soltos = [];
      for (const t of medidos) {
        console.log('      [B7a hitscan] %s: %d traçante(s), pior início a %s cm da boca',
          t.arma, t.tracers.length,
          (Math.max(...t.tracers.map(x => x.aoCano)) * 100).toFixed(2));
        for (const tc of t.tracers) {
          if (tc.aoCano > TETO_VISUAL) ruins.push(`${t.arma}: ${(tc.aoCano * 100).toFixed(2)} cm`);
          if (!tc.naCena) soltos.push(`${t.arma}: mesh fora do grafo da cena`);
          if (!tc.visivel) soltos.push(`${t.arma}: mesh invisível`);
        }
      }
      assert.equal(soltos.length, 0, soltos.join('\n  '));
      assert.equal(ruins.length, 0,
        `o traçante não começa na boca do cano:\n  ${ruins.join('\n  ')}\n` +
        `(teto ${TETO_VISUAL * 100} cm; a origem BALÍSTICA fica 6 a 20 cm acima da boca — ` +
        'é dela que o traçante NÃO pode sair)');
    });

    it('B7a · o clarão sai da boca e está pendurado no grafo da cena', async () => {
      const r = await h.play(async () => {
        await window.__B7.acharArma(g => !g.rocket && !g.melee);
        return { achou: window.__B7.achouClarao(), t: await window.__B7.tiro() };
      });
      assert.ok(r.achou, 'nenhum mesh de clarão (`userData.weaponFx`) no grafo — a sonda não mede nada');
      assert.ok(r.t.clarao.length > 0, 'o clarão não foi amostrado em nenhum disparo');
      const pior = Math.max(...r.t.clarao.map(c => c.aoCano));
      console.log('      [B7a clarão] %s: %s cm da boca', r.t.arma, (pior * 100).toFixed(3));
      assert.equal(r.t.clarao.every(c => c.naCena), true,
        'o clarão está com `visible` ligado mas fora do grafo da cena — ninguém o desenha');
      assert.ok(pior <= TETO_VISUAL,
        `o clarão nasce a ${(pior * 100).toFixed(2)} cm da boca (teto ${TETO_VISUAL * 100} cm)`);
    });

    /* ================================================================
       B7b · A ORIGEM BALÍSTICA FICA NA LINHA DE MIRA.
       Reinjeções e o número de cada uma (§10.2 da referência):
         origem volta para a boca .......... transversal 0,0000 (esperado 0,0910) 🔴
         tirar a projeção do avanço ........ longitudinal −0,65 m               🔴
         origem sobe 10 cm na mira ......... transversal 0,1910                 🔴
       ================================================================ */
    it('B7b · a origem balística fica na estação da boca e a exatamente uma ' +
      'altura de alça dela — arma a arma', async () => {
      const r = await h.play(async () => {
        const out = [];
        const n = Math.min(window.__B7.destravadas(), 4);
        for (let i = 0; i < n; i++) {
          const g = window.__game.arsenal[window.__game.gunIndex];
          if (g && !g.rocket && !g.melee) out.push(await window.__B7.tiro());
          await window.__B7.trocar();
        }
        return out;
      });
      assert.ok(r.length > 0, 'nenhum disparo medido');
      const longos = [], fora = [], semDente = [], tortos = [];
      for (const t of r) {
        console.log('      [B7b] %s (%s): long %s m · transv %s m · alça do modelo %s m · %s° do cano',
          t.arma, t.mira, t.longitudinal.toFixed(4), t.transversal.toFixed(4),
          t.geo.alturaAlca.toFixed(4), t.grausDoCano.toFixed(4));
        assert.equal(t.saiu, true, `o gatilho não virou tiro na ${t.arma}`);
        /* a decomposição em x,y locais só é válida se a âncora do cano não
           tiver giro próprio — afirmado, não suposto */
        if (t.geo.ancoraGiro > 0.01) tortos.push(`${t.arma}: âncora do cano girada ${t.geo.ancoraGiro.toFixed(3)}°`);
        /* o caso só separa alguma coisa se a alça estiver LONGE do cano: com
           altura zero, "transversal = altura" e "origem no cano" seriam a
           mesma afirmação, e o caso não poderia reprovar o defeito que existe
           para pegar */
        if (t.geo.alturaAlca < 0.02) semDente.push(`${t.arma}: alça a só ${t.geo.alturaAlca.toFixed(4)} m do cano`);
        if (Math.abs(t.longitudinal) > TETO_LONG) {
          longos.push(`${t.arma}: ${t.longitudinal.toFixed(4)} m à frente/atrás da boca`);
        }
        const erro = Math.abs(t.transversal - t.geo.alturaAlca);
        if (erro > TETO_TRANS) {
          fora.push(`${t.arma} (${t.mira}): transversal ${t.transversal.toFixed(4)} m ` +
            `contra alça de ${t.geo.alturaAlca.toFixed(4)} m — erro ${(erro * 100).toFixed(2)} cm`);
        }
      }
      assert.equal(tortos.length, 0, tortos.join('\n  '));
      assert.equal(semDente.length, 0,
        `a altura de alça é pequena demais para este caso separar defeito:\n  ${semDente.join('\n  ')}`);
      assert.equal(longos.length, 0,
        `a origem do tiro não está na estação da boca (teto ${TETO_LONG} m):\n  ${longos.join('\n  ')}\n` +
        '(origem na ocular, sem a projeção do avanço, dá −0,65 a −0,78 m)');
      assert.equal(fora.length, 0,
        `a origem balística não está sobre a linha de mira:\n  ${fora.join('\n  ')}\n` +
        `(teto ${TETO_TRANS * 100} cm para MAIS e para MENOS — transversal zero é origem no cano, ` +
        'que é a paralaxe que o B3 existe para impedir)');
    });

    /* O CASO QUE MATA O MUTANTE DE DESLOCAMENTO CONSTANTE. Um defeito que
       some um offset fixo passa arma a arma — todas as três armas do começo
       têm alturas de alça diferentes, mas um mutante calibrado numa delas
       poderia escapar nas outras por acaso. Aqui o valor ESPERADO muda DENTRO
       do mesmo disparo-a-disparo, na MESMA arma: o fuzil tem três acessórios
       de mira e a alça vale 0,0910 · 0,1520 · 0,1570 m. */
    it('B7b · trocando o acessório de mira do fuzil, a origem acompanha a alça NOVA', async () => {
      const r = await h.play(async () => {
        const nome = await window.__B7.acharArma(
          g => !g.rocket && !g.melee && window.__B7.nMiras(g) >= 2);
        if (!nome) return { semArma: true };
        const out = [];
        for (let i = 0; i < 3; i++) {
          out.push(await window.__B7.tiro());
          await window.__B7.trocarMira();
        }
        return out;
      });
      assert.ok(!r.semArma,
        'nenhuma arma com dois ou mais acessórios de mira — o caso não mediu nada');
      const miras = new Set(r.map(t => t.mira));
      assert.ok(miras.size >= 2,
        `o acessório de mira não mudou (${[...miras].join(', ')}) — sem isso o valor esperado ` +
        'fica constante e o caso não separa mutante de offset fixo');
      const alturas = new Set(r.map(t => t.geo.alturaAlca.toFixed(4)));
      assert.ok(alturas.size >= 2,
        `a altura de alça esperada não mudou entre as miras (${[...alturas].join(', ')})`);
      const fora = [];
      for (const t of r) {
        console.log('      [B7b miras] %s / %s: transv %s m · alça %s m',
          t.arma, t.mira, t.transversal.toFixed(4), t.geo.alturaAlca.toFixed(4));
        const erro = Math.abs(t.transversal - t.geo.alturaAlca);
        if (erro > TETO_TRANS) fora.push(`${t.mira}: ${t.transversal.toFixed(4)} contra ${t.geo.alturaAlca.toFixed(4)} m`);
      }
      assert.equal(fora.length, 0,
        `a origem não acompanhou a mira ativa:\n  ${fora.join('\n  ')}`);
    });

    /* O COMPLEMENTAR OBRIGATÓRIO (formato 10 da lista do CLAUDE.md). Com a
       arma em pé, a altura de alça é vertical no MUNDO, e um mutante que
       somasse `+Y` fixo em espaço de mundo passaria. Rolando a arma 90°, a
       alça deixa de ser vertical — e a medida, que é feita no referencial do
       CANO, tem de dar o mesmo número. */
    it('B7b · com a arma ROLADA 90°, o afastamento continua sendo a altura de alça', async () => {
      const r = await h.play(async () => {
        await window.__B7.acharArma(g => !g.rocket && !g.melee);
        const emPe = await window.__B7.tiro();
        const s = Math.sin(Math.PI / 4), c = Math.cos(Math.PI / 4);
        window.__B7.mao(0, 0, s, c);
        await window.__A.espera(400);
        const rolada = await window.__B7.tiro();
        const upArma = (() => {
          const gun = window.__game.arsenal[window.__game.gunIndex];
          gun.group.updateWorldMatrix(true, false);
          return new window.__MP.THREE.Vector3()
            .setFromMatrixColumn(gun.group.matrixWorld, 1).toArray();
        })();
        window.__B7.mao(0, 0, 0, 1);
        await window.__A.espera(350);
        return { emPe, rolada, upArma };
      });
      /* o roll CHEGOU na arma? sem isto o caso mediria a mesma pose duas vezes */
      const upY = Math.abs(r.upArma[1]);
      console.log('      [B7b roll] up da arma no mundo: [%s] · transv em pé %s m · rolada %s m (alça %s m)',
        r.upArma.map(v => v.toFixed(3)).join(', '),
        r.emPe.transversal.toFixed(4), r.rolada.transversal.toFixed(4),
        r.rolada.geo.alturaAlca.toFixed(4));
      assert.ok(upY < 0.4,
        `a arma não rolou: o +Y dela ainda aponta ${upY.toFixed(3)} para cima no mundo — ` +
        'o caso complementar mediria a mesma pose de novo');
      const erro = Math.abs(r.rolada.transversal - r.rolada.geo.alturaAlca);
      assert.ok(erro <= TETO_TRANS,
        `com a arma rolada, o afastamento deu ${r.rolada.transversal.toFixed(4)} m contra ` +
        `${r.rolada.geo.alturaAlca.toFixed(4)} m de alça (erro ${(erro * 100).toFixed(2)} cm) — ` +
        'um offset somado em espaço de MUNDO passa em pé e morre aqui');
      assert.ok(Math.abs(r.rolada.longitudinal) <= TETO_LONG,
        `com a arma rolada, a origem saiu da estação da boca: ${r.rolada.longitudinal.toFixed(4)} m`);
    });

    /* O CAMINHO DO BR — armas com `projSpeed` não são hitscan: saem por
       `window.__BR_ballistics`. Consertar o hitscan não alcança este ramo, e
       foi exatamente o que aconteceu: 9,10 cm no fuzil, 20,00 cm no plasma,
       CONSTANTE em toda distância. */
    it('B7b · a origem do projétil do BR obedece à mesma decomposição', async () => {
      const r = await h.play(async () => {
        await window.__B7.acharArma(g => !g.rocket && !g.melee);
        window.__B7.armarBR();
        const g = window.__game.arsenal[window.__game.gunIndex];
        const antes = g.projSpeed;
        g.projSpeed = 300; g.projDrop = 0;
        const t = await window.__B7.tiro();
        g.projSpeed = antes;
        return t;
      });
      assert.ok(r.balistica,
        `o gatilho não gerou projétil na ${r.arma} — o caso não mediu nada`);
      console.log('      [B7b BR] %s: long %s m · transv %s m · alça %s m',
        r.arma, r.balistica.longitudinal.toFixed(4),
        r.balistica.transversal.toFixed(4), r.geo.alturaAlca.toFixed(4));
      assert.ok(Math.abs(r.balistica.longitudinal) <= TETO_LONG,
        `o projétil do BR nasce a ${r.balistica.longitudinal.toFixed(4)} m da estação da boca`);
      const erro = Math.abs(r.balistica.transversal - r.geo.alturaAlca);
      assert.ok(erro <= TETO_TRANS,
        `o projétil do BR nasce a ${r.balistica.transversal.toFixed(4)} m do cano contra ` +
        `${r.geo.alturaAlca.toFixed(4)} m de alça (erro ${(erro * 100).toFixed(2)} cm). ` +
        'Erro de ORIGEM em projétil é CONSTANTE em toda distância — não dá para compensar mirando mais alto');
    });

    /* ================================================================
       B7c · SEM HEAD GLITCHING.
       O segmento boca→origem tem 6 a 20 cm e aponta para o LADO DA ALÇA. Ele
       só cruza sólido se houver parede nesse intervalo, e um caso rodado no
       descampado não exercita limiar nenhum (formato 9 da lista do CLAUDE.md).

       O CENÁRIO É CONSTRUÍDO DE PROPÓSITO, E O MOTIVO ESTÁ ESCRITO AQUI.
       Tentei antes deixar o cenário "acontecer": andar com o jogador contra a
       parede e varrer poses de mão. Não serve — medido, as oito poses deram
       sólido a ∞ na direção da alça, porque a alça aponta para CIMA e parede é
       vertical. Um caso assim passa sempre, e passaria também com o defeito
       dentro. Então o teste ROLA a arma 90° (a alça vai para o lado), guina a
       mão até a alça apontar para a parede e aproxima a boca até o sólido
       ficar a uma altura-de-alça + 15 cm. É a configuração mais apertada em
       que o critério AINDA é satisfazível.

       E o caso só vale se a reinjeção o derrubasse: ANTES de afirmar que o
       segmento não alcança o sólido, ele afirma que subir a origem 40 cm
       (§10.4 da referência) alcançaria. Sem essa medida, "não cruzou" seria só
       o descampado falando.

       O QUE ESTE CASO NÃO PROVA — escrito porque o número tenta dizer mais do
       que ele diz. Ele NÃO prova que o jogador é incapaz de pôr a origem do
       outro lado de uma parede: com a boca meio metro à frente do ombro e o
       colisor em r = 0,42 m, o cano ENTRA no sólido, e aí qualquer alça
       positiva põe a origem além dele. Isso é geometria, não código, e vale
       para todo FPS de VR com height over bore. O que o caso prova é que a
       origem fica onde o B7b diz, e que uma mudança de código que a afaste
       mais do cano é pega.
       ================================================================ */
    it('B7c · o segmento boca→origem não atravessa sólido, com a alça virada para a parede', async () => {
      const r = await h.play(async () => {
        const G = window.__game, MP = window.__MP, T = MP.THREE;
        /* A ARMA DE ALÇA MAIS ALTA é a que corre mais risco: quanto mais longe
           do cano a origem nasce, mais fácil ela cair do outro lado. */
        const alca = Math.max(...G.arsenal.filter(g => !g.rocket && !g.melee)
          .map(g => window.__B7.alcaDe(g)));
        await window.__B7.acharArma(
          g => !g.rocket && !g.melee && window.__B7.alcaDe(g) >= alca - 1e-6);

        /* 1. pontos do mundo com parede à altura da arma, e a direção dela */
        const dirs = [];
        for (let a = 0; a < 16; a++) dirs.push([Math.cos(a * Math.PI / 8), 0, Math.sin(a * Math.PI / 8)]);
        const spots = [];
        for (let x = -170; x <= 170 && spots.length < 20; x += 5) {
          for (let z = -170; z <= 170 && spots.length < 20; z += 5) {
            const gy = MP.groundAt ? MP.groundAt(x, z) : MP.heightAt(x, z);
            const p = [x, gy + 1.35, z];
            for (const d of dirs) {
              const t = window.__B7.bloqueio(p, d, 2.0);
              if (Number.isFinite(t) && t > 0.3 && t < 2.0) { spots.push({ x, z, gy, d, t }); break; }
            }
          }
        }
        if (!spots.length) return { semParede: true };

        const s45 = Math.sin(Math.PI / 4), c45 = Math.cos(Math.PI / 4);
        const poseYaw = th => {
          const sy = Math.sin(th / 2), cy = Math.cos(th / 2);
          /* q = guinada(th) · rolagem(90°) */
          window.__B7.mao(sy * s45, sy * c45, cy * s45, cy * c45);
        };
        const alvo = alca + 0.15;
        const tentados = [];
        let ok = null;
        for (const cand of spots) {
          MP.player.pos.set(cand.x, cand.gy + 0.1, cand.z);
          MP.player.vel.set(0, 0, 0);
          poseYaw(0);
          await window.__A.espera(400);
          const u0 = window.__B7.ladoDaAlca();
          if (!u0) continue;
          /* guinada necessária: um giro de +θ em torno de +Y soma θ ao ângulo
             atan2(x, z) do vetor */
          const th = Math.atan2(cand.d[0], cand.d[2]) - Math.atan2(u0[0], u0[2]);
          poseYaw(th);
          await window.__A.espera(300);
          let u = window.__B7.ladoDaAlca();
          let dist = window.__B7.bloqueio(window.__B7.canoVivo(), u, 2.5);
          for (let passo = 0; passo < 4 && Number.isFinite(dist); passo++) {
            MP.player.pos.x += u[0] * (dist - alvo);
            MP.player.pos.z += u[2] * (dist - alvo);
            MP.player.vel.set(0, 0, 0);
            await window.__A.espera(320);
            u = window.__B7.ladoDaAlca();
            dist = window.__B7.bloqueio(window.__B7.canoVivo(), u, 2.5);
          }
          tentados.push([cand.x, cand.z, Number.isFinite(dist) ? +dist.toFixed(3) : null]);
          if (Number.isFinite(dist) && dist > alca + 0.05 && dist < alca + 0.35) { ok = cand; break; }
        }
        if (!ok) { window.__B7.mao(0, 0, 0, 1); return { semLado: true, alvo, tentados }; }

        const t = await window.__B7.tiro();
        const boca = new T.Vector3().fromArray(t.boca);
        const O = new T.Vector3().fromArray(t.origem);
        const v = new T.Vector3().subVectors(O, boca);
        const comprimento = v.length();
        const solido = window.__B7.bloqueio(t.boca, v.clone().normalize().toArray(), 1.2);
        window.__B7.mao(0, 0, 0, 1);
        await window.__A.espera(300);
        return { spot: ok, arma: t.arma, comprimento,
          solido: Number.isFinite(solido) ? solido : null, alturaAlca: t.geo.alturaAlca };
      });
      assert.ok(!r.semParede, 'nenhuma parede encontrada no mundo — o cenário do B7c não montou');
      assert.ok(!r.semLado,
        `em nenhuma parede a boca parou a ~${(r.alvo || 0).toFixed(2)} m do sólido no lado da alça ` +
        `— [x, z, distância]: ${JSON.stringify(r.tentados || [])}`);
      console.log('      [B7c] %s em (%d, %d): segmento boca→origem %s m · sólido a %s m na mesma direção',
        r.arma, r.spot.x, r.spot.z, r.comprimento.toFixed(4),
        r.solido === null ? '∞' : r.solido.toFixed(4));
      /* PRIMEIRO a prova de que o cenário exercita o limiar */
      assert.ok(r.solido !== null,
        'não há sólido nenhum na direção do afastamento — sem parede, este caso não poderia reprovar nada');
      assert.ok(r.comprimento + 0.40 > r.solido,
        `o cenário é frouxo demais: mesmo subindo a origem 40 cm (segmento de ` +
        `${(r.comprimento + 0.40).toFixed(3)} m) ela não alcançaria o sólido a ${r.solido.toFixed(3)} m`);
      /* E SÓ ENTÃO a afirmação */
      assert.ok(r.comprimento < r.solido,
        `o segmento boca→origem tem ${r.comprimento.toFixed(4)} m e o sólido está a ` +
        `${r.solido.toFixed(4)} m: o tiro nasce DO OUTRO LADO da parede que o cano não atravessa`);
    });

    /* ================================================================
       B7d · PROJÉTIL VISÍVEL NASCE NA BOCA.
       Não é exceção implícita: é cláusula. Origem deslocada num foguete
       detona perto de quem atirou — 42 de dano em si mesmo, medido.
       Reinjeção: `Rockets.fire(_rayOrig, _rayDir)` põe o foguete de 0,46 a
       0,91 m ATRÁS da boca.
       ================================================================ */
    it('B7d · o foguete da bazuca nasce na boca, e o mesh desenhado começa lá', async () => {
      const r = await h.play(async () => {
        const nome = await window.__B7.acharArma(g => g.rocket);
        if (!nome) return { semBazuca: true };
        return { nome, t: await window.__B7.tiro() };
      });
      assert.ok(!r.semBazuca, 'nenhuma bazuca destravada — o caso não mediu nada');
      const t = r.t;
      const dist = Math.hypot(t.longitudinal, t.transversal);
      console.log('      [B7d] %s: origem a %s m da boca (long %s · transv %s) · %d mesh(es) de foguete',
        t.arma, dist.toFixed(4), t.longitudinal.toFixed(4), t.transversal.toFixed(4), t.foguetes.length);
      assert.ok(dist <= TETO_FOGUETE,
        `o foguete da ${t.arma} nasce a ${(dist * 100).toFixed(1)} cm da boca (teto ${TETO_FOGUETE * 100} cm); ` +
        'origem atrás da boca faz o foguete detonar na cara de quem atira — 42 de dano medidos');
      assert.ok(t.foguetes.length > 0,
        'nenhum mesh de foguete apareceu no grafo da cena — o projétil VISÍVEL não foi medido');
      const piorMesh = Math.max(...t.foguetes.map(f => f.aoCano));
      assert.equal(t.foguetes.every(f => f.naCena && f.visivel), true,
        'o mesh do foguete está fora do grafo da cena ou invisível');
      assert.ok(piorMesh <= TETO_VISUAL,
        `o mesh do foguete aparece a ${(piorMesh * 100).toFixed(2)} cm da boca (teto ${TETO_VISUAL * 100} cm)`);
      assert.ok(t.grausDoCano <= 0.5,
        `o foguete sai a ${t.grausDoCano.toFixed(3)}° do eixo do cano — sem zeragem, ele voa PARALELO à alça`);
    });

    /* ================================================================
       B7-M · ARMA BRANCA É OUTRO CRITÉRIO.
       Faca não tem cano, e cobrar cano dela produzia 0,4367 m de "reprova"
       que não descrevia defeito nenhum. O que a faca deve é golpear onde a
       MÃO está e na direção da LÂMINA.
       Reinjeção: tirar o `_rayDir.copy(_canoDirDoTiro)` do ramo melee do
       `game.js` devolve o golpe à diagonal punho→ponta.
       ================================================================ */
    it('B7-M · a faca golpeia a partir do punho e na direção da lâmina', async () => {
      const r = await h.play(async () => {
        const nome = await window.__B7.acharArma(g => g.melee);
        if (!nome) return { semFaca: true };
        await window.__B7.tiro();
        return { nome, m: window.__B7.faca() };
      });
      assert.ok(!r.semFaca, 'nenhuma arma branca no arsenal — o caso não mediu nada');
      const m = r.m;
      console.log('      [B7-M] %s: origem a %s m do punho · %s° do eixo da lâmina ' +
        '(a diagonal punho→ponta está a %s° dele)',
        m.arma, m.aoPunho === null ? '—' : m.aoPunho.toFixed(4),
        m.grausDoEixo.toFixed(4), m.grausDaDiagonal.toFixed(4));
      assert.ok(m.temPunho,
        'a sessão não entregou `gripSpace` na mão direita — sem a mão do jogador não há o que medir');
      /* A MEDIDA DA CAUSA, antes da afirmação: se a diagonal punho→ponta
         coincidisse com o eixo da lâmina, a asserção seguinte não separaria
         nada. Medido em sessão: 10,13°. */
      assert.ok(m.grausDaDiagonal > 3,
        `a diagonal punho→ponta está a só ${m.grausDaDiagonal.toFixed(3)}° do eixo da lâmina — ` +
        'os dois eixos precisam DIFERIR para este caso separar defeito de acerto');
      assert.ok(m.aoPunho <= TETO_FACA,
        `o golpe da ${m.arma} nasce a ${(m.aoPunho * 100).toFixed(1)} cm do punho (teto ${TETO_FACA * 100} cm)`);
      assert.ok(m.grausDoEixo <= TETO_FACA_GRAUS,
        `a ${m.arma} golpeia a ${m.grausDoEixo.toFixed(3)}° do eixo da lâmina (teto ${TETO_FACA_GRAUS}°) — ` +
        'a 2 m, 8° são 28 cm: mata quem a lâmina não encostou e erra quem ela encostou');
    });
  });
