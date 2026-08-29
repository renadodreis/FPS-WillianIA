/* ================================================================
   QA — B7a NO CAMINHO DO BR: o traçante do projétil sai da BOCA.

   O DEFEITO QUE ESTE ARQUIVO NASCEU PARA PEGAR, e ele estava vivo.
   O `CLAUDE.md` afirmava que "traçante e clarão saem da boca (sempre saíram)".
   Era verdade para o HITSCAN e para o CLARÃO. Não era verdade para o caminho
   do BR, que é o modo em que o dono joga:

     · `game.js` entrega a `window.__BR_ballistics` a origem BALÍSTICA quando
       em XR — a que fica sobre a linha de mira, 6 a 20 cm acima da boca;
     · `br-game.js` guardava essa origem em `b.p` e desenhava o traçante A
       PARTIR DELA (`MP.FX.spawnTracer(b.p, …)`, três ocorrências no laço de
       balas).

   Ou seja: nas armas com `projSpeed`, em XR, o risco de luz começava no AR,
   acima do cano. É a família "consertar um caminho não alcança os outros" que
   o `CLAUDE.md` já registra para o `fire()` — e a razão de o B7a cobrar os
   TRÊS caminhos, não um.

   COMO ISTO NÃO PASSA POR ACIDENTE.
   · Não lê o argumento passado a `FX.spawnTracer`: lê o MESH que ficou na
     cena, subindo a cadeia de pais até `scene` (formato 5 da lista).
   · A âncora é a boca CONGELADA no instante do tiro (`canoPosDoTiro()`), que
     é a âncora `muzzle` do modelo desenhado — o `br-game.js` não a escreve.
     Ela também não pode ser lida viva: entre o disparo e o primeiro passo da
     bala passa um frame, e a boca já andou.
   · O disparo sai do GATILHO do Touch, dentro de uma partida BR de verdade,
     com o `__BR_ballistics` REAL instalado pelo `br-game.js`. O teste não
     chama `fire()` nem `stepBullets`.

   PORTA 3842 (faixa 3840–3858, compartilhada com o `xr-b7-origem`).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3842;
/* mesmo teto do B7a: acima de 5 cm o jogador vê a luz nascer fora da arma */
const TETO_VISUAL = 0.05;

describe('B7a · o traçante do projétil do BR sai da boca do cano',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, bot;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      bot = await startBRMatch(h, { hostCode: 'QUEDALIVRE' });
      await h.play(async () => {
        const G = window.__game, MP = window.__MP, T = MP.THREE;
        const naCena = o => { let p = o; while (p) { if (p === MP.scene) return true; p = p.parent; } return false; };
        /* pool de traçantes, identificado pela GEOMETRIA de js/fx.js */
        const pool = [];
        MP.scene.traverse(o => {
          if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry') return;
          const p = o.geometry.parameters;
          if (p && Math.abs(p.width - 0.025) < 1e-6 && Math.abs(p.depth - 1) < 1e-6) pool.push(o);
        });
        const foto = () => pool.map(m => m.position.toArray()
          .concat(m.quaternion.toArray(), m.scale.toArray(), [m.visible ? 1 : 0, m.material.opacity]).join(','));
        const desenhados = [];
        const orig = MP.FX.spawnTracer;
        MP.FX.spawnTracer = function (...args) {
          const antes = foto();
          const ret = orig.apply(this, args);
          const depois = foto();
          /* a boca CONGELADA no tiro: o primeiro passo da bala roda no frame
             seguinte, e a viva já andou com o recuo e com o jogador */
          const boca = new T.Vector3().fromArray(G.canoPosDoTiro());
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
            desenhados.push({
              aoCano: Math.min(a.distanceTo(boca), b.distanceTo(boca)),
              comprimento: meio * 2, naCena: naCena(m), visivel: m.visible,
            });
          }
          return ret;
        };
        window.__TBR = {
          pool: () => pool.length,
          lista: () => desenhados.slice(),
          limpa: () => { desenhados.length = 0; },
          /* quais armas da partida disparam PROJÉTIL (o `setupLoadout` do
             br-game.js marca fuzil, DMR, plasma e sniper com `projSpeed`) */
          projeteis: () => G.arsenal
            .map((g, i) => ({ i, nome: g.name, projSpeed: g.projSpeed || 0 }))
            .filter(x => x.projSpeed > 0),
          /* leva à mão a arma de PROJÉTIL de índice `alvo` e enche o pente.
             A troca é a do jogo (botão B do Touch), não `switchWeapon` na mão:
             o teste conduz a ENTRADA, não o produto. */
          async pegar(alvo) {
            for (const a of G.arsenal) if (a.projSpeed) a.locked = false;
            for (let i = 0; i < G.arsenal.length + 1; i++) {
              if (G.gunIndex === alvo) {
                const g = G.arsenal[alvo];
                g.spread = 0; g.spreadHip = 0; g.spreadAds = 0; g.pellets = 1;
                g.mag = g.magSize; g.reserve = 90; g.reloading = false;
                return { nome: g.name, projSpeed: g.projSpeed };
              }
              window.__A.botao('right', 'b-button', 1);
              await window.__A.espera(120);
              window.__A.botao('right', 'b-button', 0);
              await window.__A.espera(330);
            }
            return null;
          },
          async armaDeProjetil() {
            const lista = window.__TBR.projeteis();
            if (!lista.length) return null;
            return window.__TBR.pegar(lista[0].i);
          },
          /* altura de alça do MODELO — é o número que o defeito produzia */
          alcaDoModelo() {
            const idx = G.gunIndex, gun = G.arsenal[idx];
            const s = G.WeaponRig.activeSight(gun);
            if (!s) return 0;
            const c = (gun.modelStatus === 'fallback' && s.fb) ? s.fb : s;
            const mz = gun.muzzleAnchor.position;
            return Math.hypot(c.eye[0] - mz.x, c.eye[1] - mz.y);
          },
        };
        return true;
      });
      await h.play(() => window.__A.espera(700));
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    it('o PRIMEIRO segmento desenhado do projétil começa na boca, não na origem balística — ' +
      'em TODAS as armas de projétil da partida', async () => {
      const r = await h.play(async () => {
        const lista = window.__TBR.projeteis();
        if (!lista.length) return { semArma: true };
        const out = [];
        for (const alvo of lista) {
          const arma = await window.__TBR.pegar(alvo.i);
          if (!arma) continue;
          const alca = window.__TBR.alcaDoModelo();
          /* ESPERA A BALA ANTERIOR MORRER. `life` é 1,7 s e a bala em voo
             continua desenhando segmento a cada frame: sem isto, o "primeiro
             segmento" medido era o de um projétil da arma anterior, já a
             190 m e 294 m da boca. Medido — e teria sido lido como defeito. */
          await window.__A.espera(1900);
          window.__TBR.limpa();
          /* um toque curto: numa automática o gatilho preso dispara de novo e
             re-congela a boca no meio da medição */
          window.__A.botao('right', 'trigger', 1);
          await window.__A.espera(60);
          window.__A.botao('right', 'trigger', 0);
          /* o primeiro passo da bala roda no frame seguinte, dentro do brTick */
          await window.__A.espera(450);
          out.push({ arma, alca, desenhados: window.__TBR.lista() });
        }
        return { out, pool: window.__TBR.pool() };
      });
      assert.ok(!r.semArma,
        'nenhuma arma de projétil (`projSpeed`) na partida — o loadout do BR não chegou');
      assert.ok(r.pool > 0, 'nenhum mesh de traçante no grafo — a sonda não mede nada');
      const mediram = r.out.filter(x => x.desenhados.length > 0);
      assert.ok(mediram.length > 0,
        'nenhum traçante desenhado depois de nenhum disparo — o caso não mediu nada. ' +
        'Sem bala andando, este arquivo passaria vazio');
      const ruins = [], soltos = [], semDente = [];
      for (const x of mediram) {
        const p = x.desenhados[0];
        console.log('      [B7a/BR] %s (projSpeed %d, alça do modelo %s m): %d segmento(s), ' +
          'primeiro a %s cm da boca congelada',
          x.arma.nome, x.arma.projSpeed, x.alca.toFixed(4), x.desenhados.length,
          (p.aoCano * 100).toFixed(2));
        /* com alça nula, "traçante na boca" e "traçante na origem balística"
           seriam a mesma coisa e o caso não separaria nada */
        if (x.alca <= 0.02) semDente.push(`${x.arma.nome}: alça a ${x.alca.toFixed(4)} m do cano`);
        if (!p.naCena) soltos.push(`${x.arma.nome}: mesh fora do grafo da cena`);
        if (!p.visivel) soltos.push(`${x.arma.nome}: mesh invisível`);
        if (p.aoCano > TETO_VISUAL) {
          ruins.push(`${x.arma.nome}: ${(p.aoCano * 100).toFixed(2)} cm ` +
            `(a alça dela fica a ${(x.alca * 100).toFixed(2)} cm do cano)`);
        }
      }
      assert.equal(semDente.length, 0,
        `alça rente ao cano — o caso não separa defeito de acerto:\n  ${semDente.join('\n  ')}`);
      assert.equal(soltos.length, 0, soltos.join('\n  '));
      assert.equal(ruins.length, 0,
        `o traçante do projétil não começa na boca do cano:\n  ${ruins.join('\n  ')}\n` +
        `(teto ${TETO_VISUAL * 100} cm; a origem BALÍSTICA fica 6 a 20 cm acima da boca, e é de lá ` +
        'que o risco de luz NÃO pode sair — o jogador vê a bala nascer no ar)');
    });

    /* O SEGUNDO SEGMENTO EM DIANTE SEGUE A BALA, e é assim que tem de ser: o
       desvio é UM só, no primeiro passo, do tamanho da altura de alça, e some
       em 1/60 de segundo. Se o conserto tivesse puxado a BALA para a boca em
       vez de só o desenho, o que ACERTA teria mudado — e é justamente o que o
       B3 proíbe. Este caso guarda essa fronteira. */
    it('mover o traçante para a boca NÃO moveu a bala: a origem balística continua na linha de mira', async () => {
      const r = await h.play(async () => {
        const G = window.__game, MP = window.__MP, T = MP.THREE;
        const arma = await window.__TBR.armaDeProjetil();
        if (!arma) return { semArma: true };
        const alca = window.__TBR.alcaDoModelo();
        /* intercepta a entrada da balística SEM tirar o br-game do caminho:
           chama o original depois de registrar */
        const real = window.__BR_ballistics;
        let visto = null;
        window.__BR_ballistics = function (origem, dir, gun) {
          visto = origem.toArray();
          return real.apply(this, arguments);
        };
        window.__A.botao('right', 'trigger', 1);
        await window.__A.espera(60);
        window.__A.botao('right', 'trigger', 0);
        await window.__A.espera(320);
        window.__BR_ballistics = real;
        if (!visto) return { semTiro: true, arma };
        const O = new T.Vector3().fromArray(visto);
        const boca = new T.Vector3().fromArray(G.canoPosDoTiro());
        const cano = new T.Vector3().fromArray(G.canoDoTiro()).normalize();
        const v = new T.Vector3().subVectors(O, boca);
        const lo = v.dot(cano);
        return { arma, alca, longitudinal: lo,
          transversal: v.clone().addScaledVector(cano, -lo).length() };
      });
      assert.ok(!r.semArma, 'nenhuma arma de projétil na mão');
      assert.ok(!r.semTiro, `o gatilho não gerou projétil na ${r.arma.nome}`);
      console.log('      [B7a/BR bala] %s: long %s m · transv %s m · alça do modelo %s m',
        r.arma.nome, r.longitudinal.toFixed(4), r.transversal.toFixed(4), r.alca.toFixed(4));
      assert.ok(Math.abs(r.transversal - r.alca) < 0.01,
        `a bala da ${r.arma.nome} passou a nascer a ${r.transversal.toFixed(4)} m do cano contra ` +
        `${r.alca.toFixed(4)} m de altura de alça: o conserto do DESENHO mexeu no que ACERTA, ` +
        'e é isso que o B3 proíbe');
      assert.ok(Math.abs(r.longitudinal) < 0.02,
        `a bala da ${r.arma.nome} nasce a ${r.longitudinal.toFixed(4)} m da estação da boca`);
    });
  });
