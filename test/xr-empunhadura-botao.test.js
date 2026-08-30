/* ================================================================
   O BOTÃO QUE SEGURA A ARMA — e o que ele NÃO pode fazer.

   O dono, verbatim: "a mira e segurar a arma, isso precisa ser resolvido,
   precisamos de um botão, que segura e ele mira... isso não funciona hoje".
   Medido no produto antes desta rodada: o grip direito acendia `mouse.aiming`
   e a pose da arma era reescrita por `XRArma.aplicar()` logo depois — o
   jogador apertava e NADA mudava na tela. E não existia estado de empunhadura
   nenhum: a arma era solda na mão, sem empunhar, sem soltar, sem coldre.

   O QUE ESTE ARQUIVO MEDE, e em que unidade:
     · a distância, em METROS, entre a âncora `gripR` do modelo e a palma
       (`gripSpace`), com a arma empunhada e com a arma guardada;
     · a distância, em METROS, da arma até o ponto do coldre no corpo;
     · a variação da pose LOCAL da arma em relação à palma — em METROS e em
       GRAUS — quando o botão de mira assistida é apertado (B4: botão não
       teleporta a arma);
     · munição em PENTE e RESERVA ao coldrear no meio da recarga.

   DUAS ÂNCORAS INDEPENDENTES, de propósito. `gripR` vem de `gun.parts.handR`,
   que é posicionado por js/weaponrig.js a partir do perfil calibrado contra os
   GLBs — não por js/xr/xrweapon.js, que é o código sob teste. A palma vem do
   `getControllerGrip` do three, ou seja, do runtime. Nenhuma das duas é gerada
   por quem está sendo medido.

   PORTA 3670 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3670;
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

/* ================================================================
   PARTE 1 — A MÁQUINA DA EMPUNHADURA, sem navegador.

   É o módulo de verdade (`js/xr/xrinput.js`), não um dublê: a máquina é pura
   justamente para poder ser conferida sem headset. O que ela decide — se a
   arma está na mão — não tem como ser medido em graus, então aqui a grandeza
   é a SEQUÊNCIA de estados, e cada caso declara a sequência inteira.
   ================================================================ */
describe('a empunhadura é STICKY: um clique, um alternar', () => {
  let criarEmpunhadura;
  before(async () => { ({ criarEmpunhadura } = await import('../js/xr/xrinput.js')); });

  /* roda uma sequência de estados do botão e devolve o estado a cada passo */
  const correr = (m, seq) => seq.map(b => m.passo(b).engatado);

  it('nasce com a arma na mão, e o PRIMEIRO clique já solta', () => {
    const m = criarEmpunhadura('apertar');
    assert.equal(m.engatado, true, 'a arma tem de nascer na mão');
    // um clique = aperta e solta
    const s = correr(m, [true, false]);
    assert.deepEqual(s, [true, false],
      `um clique tinha de soltar a arma; a sequência deu ${JSON.stringify(s)}`);
  });

  it('o clique seguinte pega de volta, e alterna sem deriva em 6 cliques', () => {
    const m = criarEmpunhadura('apertar');
    const vistos = [];
    for (let i = 0; i < 6; i++) { m.passo(true); vistos.push(m.passo(false).engatado); }
    assert.deepEqual(vistos, [false, true, false, true, false, true],
      `seis cliques tinham de alternar seis vezes; deu ${JSON.stringify(vistos)}`);
  });

  it('SEGURAR e soltar também alterna (é o Sticky do XRI, não um Toggle)', () => {
    const m = criarEmpunhadura('apertar');
    // segura por muitos frames: nada acontece enquanto segura
    const durante = correr(m, [true, true, true, true]);
    assert.deepEqual(durante, [true, true, true, true],
      `segurar não pode soltar a arma sozinho; deu ${JSON.stringify(durante)}`);
    assert.equal(m.passo(false).engatado, false, 'soltar depois de segurar tinha de guardar');
  });

  it('o modo `manter` é hold: solta no instante em que o dedo sai', () => {
    const m = criarEmpunhadura('manter');
    assert.equal(m.passo(true).engatado, true);
    assert.equal(m.passo(false).engatado, false,
      'em `manter` soltar o botão tem de soltar a arma no mesmo frame');
  });

  it('CASO RUIM — o controle some com o botão apertado: a arma NÃO cai', () => {
    const m = criarEmpunhadura('apertar');
    m.passo(true);                       // segurando
    const semMao = m.semControle();      // o controle sumiu do rastreamento
    assert.equal(semMao.engatado, true,
      'perder o rastreamento por um frame não pode desarmar o jogador');
    // e quando a mão volta, ainda apertada, continua sem soltar
    assert.equal(m.passo(true).engatado, true, 'a mão voltou apertando: continua na mão');
    assert.equal(m.passo(false).engatado, false, 'e o clique completo seguinte solta normalmente');
  });

  it('CASO RUIM — trocar de modo com a arma na mão não derruba a arma', () => {
    const m = criarEmpunhadura('apertar');
    m.passo(true);
    m.modo = 'manter';                   // o jogador mudou a preferência segurando
    assert.equal(m.engatado, true, 'trocar de modo não pode soltar a arma');
  });
});

/* ================================================================
   PARTE 2 — O QUE SE VÊ NO HEADSET.
   ================================================================ */
function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  /* AMOSTRADO NO RENDER, e depois dele. Em XR a pose da câmera é escrita pelo
     three DENTRO do `render()`: um sampler que lê antes compõe rig(N) com
     pose(N−1), e nesta base os dois erros já se cancelaram exatamente. */
  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    const e = G.XRArma.estado();
    const gun = G.arsenal[G.gunIndex];
    const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);

    /* A ÂNCORA `gripR`, escrita por js/weaponrig.js (perfil calibrado contra o
       GLB) — NÃO por quem está sendo medido. */
    const gripR = gun && gun.parts && gun.parts.handR
      ? gun.parts.handR.getWorldPosition(new T.Vector3()) : null;
    const punho = G.XR.punho('right');
    let palma = null;
    if (punho) { punho.updateWorldMatrix(true, false); palma = punho.getWorldPosition(new T.Vector3()); }

    /* A pose da arma RELATIVA À PALMA: é o que B4 cobra. Em metros e em graus,
       e não "mudou/não mudou". */
    let locP = null, locQ = null;
    if (punho && gun && gun.group) {
      const inv = new T.Matrix4().copy(punho.matrixWorld).invert();
      const mm = new T.Matrix4().multiplyMatrices(inv, gun.group.matrixWorld);
      const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
      mm.decompose(p, q, s);
      locP = p.toArray(); locQ = q.toArray();
    }

    amostra = {
      ads: e.ads, mirando: e.mirando, naCara: e.naCara,
      coldre: e.coldre, empunhada: e.empunhada,
      recuo: e.recuo, desvio: e.desvio,
      gripNaPalma: (gripR && palma) ? palma.distanceTo(gripR) : null,
      gripR: gripR ? gripR.toArray() : null,
      olho: olho.toArray(),
      locP, locQ,
      duasMaos: e.duasMaos,
      /* A separação entre as MÃOS, em metros: é o que um braço humano tem de
         conseguir. A âncora `supportHand` do fuzil fica a 0,55 m da
         empunhadura (0,64 na DMR) e a 0,94 m do ombro — fora do alcance. */
      maosSeparadas: (() => {
        const pd = G.XR.punho('right'), pe = G.XR.punho('left');
        if (!pd || !pe) return null;
        pd.updateWorldMatrix(true, false); pe.updateWorldMatrix(true, false);
        return pd.getWorldPosition(new T.Vector3())
          .distanceTo(pe.getWorldPosition(new T.Vector3()));
      })(),
      aiming: !!(G.mouse && G.mouse.aiming),
      recarregando: !!(gun && gun.reloading),
      mag: gun ? gun.mag : null, reserve: gun ? gun.reserve : null,
      magSize: gun ? gun.magSize : null,
    };
    return v;
  };

  window.__AR = {
    ler: () => amostra,
    mao: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(x, y, z);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
    },
    maoE: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.left.position.set(x, y, z);
      d.controllers.left.quaternion.set(0, 0, 0, 1);
    },
    cabeca: (y = 1.70) => {
      const d = window.__xrEmulado;
      d.position.set(0, y, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    /* UM CLIQUE COMPLETO no grip direito, do jeito que a mão faz. */
    clique: async () => {
      window.__A.botao('right', 'squeeze', 1);
      await window.__A.espera(140);
      window.__A.botao('right', 'squeeze', 0);
      await window.__A.espera(140);
    },
    espera: ms => window.__A.espera(ms),
    gastarBala: () => { const g = G.arsenal[G.gunIndex]; if (g) g.mag = 1; },
    /* Põe a mão ESQUERDA sobre o eixo do cano, a `dist` metros da empunhadura.
       POR DELTA: `dev.controllers.*.position` está no espaço de referência da
       sessão e o cano está no mundo — escrever coordenada de mundo direto erra
       pelo deslocamento do rig. */
    maoEnoCano: async (dist, lado = 0, passos = 6) => {
      const dev = window.__xrEmulado;
      for (let i = 0; i < passos; i++) {
        const gun = G.arsenal[G.gunIndex];
        const pd = G.XR.punho('right'), pe = G.XR.punho('left');
        if (!gun || !gun.parts || !gun.parts.handR || !pd || !pe) break;
        pe.updateWorldMatrix(true, false);
        const grip = gun.parts.handR.getWorldPosition(new T.Vector3());
        const eixo = new T.Vector3().fromArray(G.direcaoDoCano()).normalize();
        const dir = new T.Vector3().crossVectors(eixo, new T.Vector3(0, 1, 0)).normalize();
        const alvo = grip.clone().addScaledVector(eixo, dist).addScaledVector(dir, lado);
        const falta = alvo.sub(pe.getWorldPosition(new T.Vector3()));
        const p = dev.controllers.left.position;
        dev.controllers.left.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await new Promise(r => setTimeout(r, 140));
      }
      await new Promise(r => setTimeout(r, 300));
      return window.__AR.ler();
    },
    /* Ângulo, em GRAUS, entre dois quaternions dados como array. */
    angulo: (a, b) => {
      const qa = new T.Quaternion().fromArray(a), qb = new T.Quaternion().fromArray(b);
      return 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180 / Math.PI;
    },
  };
  return true;
}

describe('segurar e guardar a arma, medido no headset',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(900));
    });
    after(async () => { if (h) await h.close(); });

    it('EMPUNHADA: a âncora do punho fica em cima da palma (B1)', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        await window.__AR.espera(700);
        return window.__AR.ler();
      });
      console.log(`  empunhada → gripR↔palma ${f3(r.gripNaPalma)} m · coldre ${f3(r.coldre)}`);
      assert.ok(r.gripNaPalma !== null, 'sem âncora de punho não há o que medir');
      assert.ok(r.gripNaPalma <= 0.03,
        `a arma tinha de estar NA palma: gripR↔palma deu ${f3(r.gripNaPalma)} m (teto 0,030)`);
      assert.equal(r.empunhada, true, 'a arma tem de nascer empunhada');
    });

    /* SUBSTITUÍDO em 2026-08-30 — o dono revogou o coldre por clique,
       testando no aparelho: "no grip direito tem um botão onde você
       seleciona e solta a arma... qual o objetivo de ficar sem arma? ele
       deveria ser o botão de mira... armas sempre a mão". Antes, um clique
       aqui mandava a arma pro ombro (gripR↔palma ≥0,25m, empunhada=false);
       o pedido inverte a régua: a arma NUNCA sai da palma, por clique nenhum
       — nem um, nem seis. `js/xr/xrinput.js` parou de chamar
       `empunha.passo()`; a máquina STICKY (`criarEmpunhadura`, describe pura
       acima) continua existindo e testada em isolamento, só não decide mais
       o estado real do jogo. */
    it('CLIQUE NENHUM guarda a arma — ela fica na palma sempre (pedido do dono, 2026-08-30)', async () => {
      const antes = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        await window.__AR.espera(500);
        return window.__AR.ler();
      });
      const dep = await h.play(async () => {
        for (let i = 0; i < 6; i++) await window.__AR.clique();   // seis cliques, de propósito
        await window.__AR.espera(500);
        return window.__AR.ler();
      });
      console.log(`  antes     → gripR↔palma ${f3(antes.gripNaPalma)} m · empunhada ${antes.empunhada}`);
      console.log(`  6 cliques → gripR↔palma ${f3(dep.gripNaPalma)} m · empunhada ${dep.empunhada}`);
      assert.equal(antes.empunhada, true, 'a arma tem de nascer na mão');
      assert.ok(antes.gripNaPalma <= 0.03, `nasceu fora da palma: ${f3(antes.gripNaPalma)} m`);
      assert.equal(dep.empunhada, true,
        'depois de 6 cliques a arma saiu da mão — o pedido "armas sempre a mão" quebrou');
      assert.ok(dep.gripNaPalma <= 0.03,
        `depois de 6 cliques a arma se afastou da palma: ${f3(dep.gripNaPalma)} m (teto 0,030)`);
    });

    it('B4 — a MIRA ASSISTIDA acende o ADS do jogo e NÃO move a arma', async () => {
      /* A mira assistida é a acessibilidade que substitui o antigo `mirar` do
         grip: para quem não consegue levantar o braço. Ela vale espalhamento e
         retículo, e o que este caso cobra é que ela não encoste na POSE — que
         é B4, e é o que oito de oito FPS de VR recusam fazer. */
      const antes = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);   // arma no quadril, longe da janela
        window.__game.entradaXR.prefs.miraAssistida = true;
        await window.__AR.espera(600);
        return window.__AR.ler();
      });
      const dur = await h.play(async () => {
        window.__A.botao('right', 'squeeze', 1);
        await window.__AR.espera(700);        // acima de MIRA_ASSISTIDA_MS (300)
        return window.__AR.ler();
      });
      await h.play(async () => {
        window.__A.botao('right', 'squeeze', 0);
        await window.__AR.espera(400);
        window.__game.entradaXR.prefs.miraAssistida = false;
        /* o clique completo acima guardou a arma (é o Sticky); devolve à mão
           para não contaminar os casos seguintes */
        await window.__AR.clique();
        await window.__AR.espera(400);
      });
      const dP = Math.hypot(dur.locP[0] - antes.locP[0], dur.locP[1] - antes.locP[1],
        dur.locP[2] - antes.locP[2]);
      const dA = await h.play((a, b) => window.__AR.angulo(a, b), antes.locQ, dur.locQ);
      console.log(`  solto    → aiming ${antes.aiming} ads ${f3(antes.ads)}`);
      console.log(`  APERTADO → aiming ${dur.aiming} ads ${f3(dur.ads)}` +
        ` · a arma andou ${f3(dP)} m e girou ${f3(dA)}° em relação à palma`);
      assert.equal(dur.aiming, true,
        'a mira assistida ligada tinha de acender o ADS do jogo (espalhamento/retículo)');
      assert.ok(dP <= 0.01,
        `B4: o botão moveu a arma ${f3(dP)} m em relação à palma (teto 0,010)`);
      assert.ok(dA <= 1.0,
        `B4: o botão girou a arma ${f3(dA)}° em relação à palma (teto 1,0°)`);
      assert.ok(dur.ads < 0.10,
        `o botão não pode acender o ADS FÍSICO: ele deu ${f3(dur.ads)} com a arma no quadril`);
    });

    it('B5 — a segunda mão engata onde o BRAÇO alcança, e não só na âncora', async () => {
      /* Outra frente mediu que a âncora `supportHand` é inalcançável: 0,9443 m
         do ombro contra 0,5881 m de braço em escala de VR, com o cotovelo
         travado em 176,0°. Com o engate por PONTO, o modo de duas mãos
         praticamente nunca acontecia. Agora o guarda-mão DESLIZA sobre o eixo
         do cano, e o que este caso cobra é a FAIXA: três separações de mão
         diferentes, todas confortáveis, todas engatando. */
      const linhas = [];
      for (const d of [0.22, 0.34, 0.46]) {
        const r = await h.play(async dist => {
          window.__AR.cabeca(1.70);
          window.__AR.mao(0.25, 1.25, -0.30);
          return window.__AR.maoEnoCano(dist);
        }, d);
        linhas.push({ d, ...r });
        console.log(`  mão a ${f3(d)} m da empunhadura → mãos separadas` +
          ` ${f3(r.maosSeparadas)} m · duas mãos ${r.duasMaos}`);
      }
      const solto = await h.play(async () => {
        window.__AR.cabeca(1.70);
        return window.__AR.maoEnoCano(0.34, 0.75);   // mão bem fora da linha
      });
      console.log(`  mão 0,75 m FORA da linha → separação ${f3(solto.maosSeparadas)} m` +
        ` · duas mãos ${solto.duasMaos}`);
      assert.ok(linhas.every(l => l.duasMaos),
        `as três separações confortáveis tinham de engatar: ${JSON.stringify(
          linhas.map(l => [f3(l.d), l.duasMaos]))}`);
      assert.ok(linhas.every(l => l.maosSeparadas <= 0.60),
        `nenhuma das poses podia exigir mais que 0,60 m entre as mãos: ${JSON.stringify(
          linhas.map(l => f3(l.maosSeparadas)))}`);
      /* A OUTRA PONTA DO LIMIAR, sem a qual este caso passaria com o engate
         preso em `true` para sempre. */
      assert.equal(solto.duasMaos, false,
        'com a mão longe da linha do cano o apoio tinha de DESENGATAR');
    });

    /* SUSPENSO EM 2026-08-30: a arma nunca mais holstera (ver o teste acima,
       "CLIQUE NENHUM guarda a arma"), então o cenário que este caso guardava
       — coldrear NO MEIO da recarga — ficou inalcançável no jogo real.
       Mantido em `skip`, não apagado: se o coldre por clique voltar por
       outro caminho, este é o primeiro guarda a reativar. */
    it.skip('CASO RUIM — guardar a arma NO MEIO da recarga não come munição', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.maoE(-0.25, 1.20, -0.25);
        window.__AR.gastarBala();
        await window.__AR.espera(300);
        const antes = window.__AR.ler();
        // começa a recarga pelo botão Y da mão esquerda (o caminho de hoje)
        window.__A.botao('left', 'y-button', 1);
        await window.__AR.espera(120);
        window.__A.botao('left', 'y-button', 0);
        await window.__AR.espera(250);
        const meio = window.__AR.ler();
        await window.__AR.clique();               // COLDREIA no meio da recarga
        await window.__AR.espera(2600);           // muito além de reloadTime
        const fim = window.__AR.ler();
        await window.__AR.clique();               // devolve a arma à mão
        await window.__AR.espera(400);
        return { antes, meio, fim };
      });
      console.log(`  antes → mag ${r.antes.mag}/${r.antes.magSize} reserva ${r.antes.reserve}`);
      console.log(`  meio  → recarregando ${r.meio.recarregando} mag ${r.meio.mag} reserva ${r.meio.reserve}`);
      console.log(`  fim   → empunhada ${r.fim.empunhada} mag ${r.fim.mag} reserva ${r.fim.reserve}`);
      assert.equal(r.meio.recarregando, true, 'o cenário não chegou a recarregar: nada foi testado');
      /* DUAS igualdades ligadas por `&&`, nunca um `||`: "a vida subiu OU os
         kits caíram" já passou nesta base porque a vida sobe sozinha. Nem
         `mag` nem `reserve` sobem sozinhos, e o teste não pega pickup nenhum. */
      assert.equal(r.fim.reserve, r.antes.reserve,
        `a reserva mudou de ${r.antes.reserve} para ${r.fim.reserve} guardando a arma no meio da recarga`);
      assert.equal(r.fim.mag, r.antes.mag,
        `o pente mudou de ${r.antes.mag} para ${r.fim.mag} guardando a arma no meio da recarga`);
    });

    /* SUSPENSO EM 2026-08-30: mesma causa do caso acima — sem coldre
       alcançável, "arma guardada não mira" não tem mais cenário real. */
    it.skip('CASO RUIM — guardada, a arma não mira nem que o gesto seja perfeito', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        await window.__AR.espera(400);
        await window.__AR.clique();               // guarda
        await window.__AR.espera(500);
        // e agora leva a mão exatamente para onde a mira engataria
        window.__AR.mao(0.016, 1.492, -0.256);
        await window.__AR.espera(800);
        const guardada = window.__AR.ler();
        await window.__AR.clique();               // devolve
        await window.__AR.espera(700);
        const naMao = window.__AR.ler();
        return { guardada, naMao };
      });
      console.log(`  guardada → ads ${f3(r.guardada.ads)} mirando ${r.guardada.mirando}` +
        ` · coldre ${f3(r.guardada.coldre)}`);
      console.log(`  na mão   → ads ${f3(r.naMao.ads)} mirando ${r.naMao.mirando}`);
      assert.ok(r.guardada.ads < 0.10,
        `arma guardada não pode mirar: o ADS deu ${f3(r.guardada.ads)}`);
      assert.equal(r.guardada.mirando, false, 'arma guardada não pode reportar `mirando`');
      /* A OUTRA PONTA DO LIMIAR, e ela é obrigatória: sem ela este caso passaria
         com o ADS quebrado para todo mundo — "cenário que não exercita o
         limiar" é o nono formato de teste que passa por acidente desta base. */
      assert.ok(r.naMao.ads > r.guardada.ads + 0.3,
        `com a arma de volta na mão e a MESMA pose, o ADS tinha de subir:` +
        ` guardada ${f3(r.guardada.ads)} → na mão ${f3(r.naMao.ads)}`);
    });
  });
