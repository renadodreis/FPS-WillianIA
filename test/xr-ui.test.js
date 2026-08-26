/* ================================================================
   QA — O PAINEL DE SESSÃO DENTRO DO HEADSET (IWER, sessão imersiva real).

   O QUE ESTÁ SENDO COBRADO. O menu, as opções e a pausa deste jogo são DOM, e
   DOM não é desenhado dentro de uma sessão `immersive-vr`. O resultado medido
   no critério F5/I4 do docs/vr/criterio-aaa.md: entrar em VR começava a
   partida à força porque não havia outro estado alcançável, e não existia
   caminho de volta. A preferência de giro existia em API
   (`XR.giro.preferir(...)`) e não tinha tela — só dava pra trocar pelo
   console, o que reprova o critério A2.

   COMO ESTE ARQUIVO EVITA MEDIR A SI MESMO. O módulo ainda não está fiado no
   game.js (o wiring vai no relatório). Então o teste instala UM condutor —
   uma cadeia de `session.requestAnimationFrame` que chama `update()` uma vez
   por frame, exatamente como o wiring vai chamar — e depois **só observa**:
   aperta botão de verdade pelo `window.__A`, espera TEMPO de verdade e LÊ o
   estado. Nenhuma asserção chama a função sob teste, que é como o efeito
   contaria duas vezes.

   E as ações de jogo entram por injeção, como o módulo foi desenhado: PAUSAR
   e RETOMAR são o `setPaused` DE VERDADE do game.js (escritor único de
   `state.paused`), então "pausar pausa mesmo" é medido no produto — em metros
   que o jogador não andou. RECENTRAR e SAIR são contadores, porque o que o
   módulo promete ali é chamar a ação uma vez.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3440;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* Ferramentas na página. `page.evaluate` com string ignora os argumentos, por
   isso tudo é função normal instalada em `window.__U` (mesmo motivo do
   `window.__A` do test/helpers/iwer.js). */
async function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* O PAINEL DO JOGO, não uma cópia. Enquanto o game.js não tinha fiação, este
     arquivo criava a própria instância e a conduzia com um laço próprio — era a
     única forma de haver o que medir. Com a fiação aplicada isso vira defeito:
     passam a existir DOIS painéis na cena reagindo ao mesmo apontar, e o clique
     em "GIRO" alterna o valor duas vezes e volta ao original. O teste mediu a
     briga entre as duas instâncias, não o produto.

     Segunda vez que essa armadilha aparece nesta frente (a primeira foi um
     andaime que conduzia o giro e fazia 60°/s virar 117,9°). Andaime que
     duplica o produto mede a si mesmo. */
  window.__UI = G.XRUI;
  window.__conta = { recentrar: 0, sair: 0, reaparecer: 0 };

  /* Sem condutor: quem chama `update()` uma vez por frame é o game.js. O
     "andou frame?" sai do contador do próprio renderer — encadear
     `requestAnimationFrame` aqui morria em três frames quando outro caminho
     também agendava, e um contador que para vira falso negativo. */
  window.__drv = {
    pausado: false,
    get frames() { return MP.renderer.info.render.frame; },
  };

  const v3 = a => new T.Vector3(a[0], a[1], a[2]);

  window.__U = {
    estado: () => window.__UI.estado(),
    painelNaCena: () => !!MP.scene.getObjectByName('xrUiPainel'),
    olho: () => {
      MP.camera.updateWorldMatrix(true, false);
      return MP.camera.getWorldPosition(new T.Vector3()).toArray();
    },
    /* frente HORIZONTAL da cabeça, em coordenada de MUNDO (em XR o quaternion
       local da câmera é a cabeça relativa ao rig e não serve) */
    frente: () => {
      MP.camera.updateWorldMatrix(true, false);
      const q = MP.camera.getWorldQuaternion(new T.Quaternion());
      const f = new T.Vector3(0, 0, -1).applyQuaternion(q);
      f.y = 0;
      return f.normalize().toArray();
    },
    /* gira a CABEÇA (o headset), que é o que o jogador faz de verdade */
    cabecaYaw: g => {
      const dev = window.__xrEmulado;
      dev.quaternion.set(0, Math.sin(g * Math.PI / 360), 0, Math.cos(g * Math.PI / 360));
    },
    /* põe a mão numa pose confortável e aponta pra um ponto do MUNDO.
       `dev.controllers[*]` vive no espaço de referência = o rig. */
    apontar: (qual, alvoMundo) => {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      rig.updateWorldMatrix(true, false);
      MP.camera.updateWorldMatrix(true, false);
      const cab = MP.camera.getWorldPosition(new T.Vector3());
      const mao = new T.Vector3(cab.x + (qual === 'left' ? -0.22 : 0.22), cab.y - 0.35, cab.z);
      const m = new T.Matrix4().lookAt(mao, v3(alvoMundo), new T.Vector3(0, 1, 0));
      const q = new T.Quaternion().setFromRotationMatrix(m);
      const p = mao.clone();
      rig.worldToLocal(p);
      q.premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
      dev.controllers[qual].position.set(p.x, p.y, p.z);
      dev.controllers[qual].quaternion.set(q.x, q.y, q.z, q.w);
    },
    async menu() {
      window.__A.botao('right', 'thumbstick', 1);
      await window.__A.espera(150);
      window.__A.botao('right', 'thumbstick', 0);
      await window.__A.espera(200);
    },
    async clique(qual) {
      window.__A.botao(qual || 'right', 'trigger', 1);
      await window.__A.espera(150);
      window.__A.botao(qual || 'right', 'trigger', 0);
      await window.__A.espera(200);
    },
    linha: id => (window.__UI.estado().linhas || []).find(l => l.id === id) || null,
    pos: () => { const p = MP.player.pos; return [p.x, p.y, p.z]; },
    prefsGiro: () => G.XR.giro.prefs,
    salvo: () => { try { return JSON.parse(window.localStorage.getItem('callofai_vr') || '{}'); } catch { return {}; } },
    pausado: () => G.state.paused,
    /* CUSTO EM DRAW CALLS, POR DIFERENÇA PAREADA. A cena está viva e a
       contagem oscila vários calls entre frames: medir "aberto" e "fechado" em
       janelas separadas por segundos mistura o custo da UI com a deriva do
       mundo. Aqui as duas leituras ficam a ~150 ms uma da outra e o que sai é
       a MEDIANA das diferenças. */
    async custo(n) {
      const dif = [];
      const ver = v => {
        window.__drv.pausado = true;   // senão o condutor reescreve visible
        const p = MP.scene.getObjectByName('xrUiPainel');
        const r = MP.scene.getObjectByName('xrUiRaio');
        if (p) p.visible = v;
        if (r) r.visible = v;
      };
      for (let i = 0; i < n; i++) {
        ver(true); await window.__A.espera(70);
        const com = MP.renderer.info.render.calls;
        ver(false); await window.__A.espera(70);
        dif.push(com - MP.renderer.info.render.calls);
      }
      /* devolve o estado como estava: `update()` do painel só escreve
         `visible` na ABERTURA, então sair daqui com ele apagado deixaria o
         menu invisível para os testes seguintes */
      ver(true);
      window.__drv.pausado = false;
      return dif;
    },
  };
  return true;
}

describe('painel de sessão em VR (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    await h.play(() => window.__A.espera(400));
  });
  after(async () => { if (h) await h.close(); });

  it('nada nasce antes de o jogador abrir (o worldgen depende da ordem do rand)', async () => {
    const r = await h.play(() => ({
      naCena: window.__U.painelNaCena(),
      frames: window.__drv.frames,
      estado: window.__U.estado(),
    }));
    assert.ok(r.frames > 5, `o condutor não rodou (${r.frames} frames) — sem frame não há medida`);
    assert.equal(r.naCena, false, 'o painel foi criado sem o jogador pedir');
    assert.equal(r.estado.montado, false, 'a malha do painel nasceu no boot');
  });

  it('o clique do analógico direito abre o painel — e é o único botão livre do mapa', async () => {
    const r = await h.play(async () => {
      await window.__U.menu();
      await window.__A.espera(300);
      return { naCena: window.__U.painelNaCena(), e: window.__U.estado(), pausado: window.__U.pausado() };
    });
    assert.equal(r.naCena, true, 'o botão de menu não criou o painel');
    assert.equal(r.e.aberto, true, 'o painel não abriu');
    assert.equal(r.e.visivel, true, 'o painel abriu invisível');
    assert.equal(r.pausado, true, 'abrir o painel não pausou o jogo (VRC.Quest.Functional.2)');
  });

  it('abre a ~1,0 m e ocupa um ângulo confortável, com texto acima de 1°', async () => {
    const e = await h.play(() => window.__U.estado());
    console.log(`      distância ${e.distancia.toFixed(3)} m · painel ${e.grausH.toFixed(1)}° × ${e.grausV.toFixed(1)}°` +
      ` · linha ${e.grausLinha.toFixed(2)}° · texto ${e.grausTexto.toFixed(2)}°`);
    assert.ok(e.distancia >= 0.75 && e.distancia <= 1.25,
      `painel a ${e.distancia.toFixed(3)} m — fora da faixa de leitura (Oculus BP: nada abaixo de 0,75 m)`);
    /* Oculus BP: a UI deve caber "no terço central da área de visão" — com os
       110° horizontais do Quest 3 isso é ~36,7°; o Android XR dá 41° pelo
       mesmo raciocínio. Ver docs/vr/referencia-ui.md §3. */
    assert.ok(e.grausH >= 20 && e.grausH <= 36.7,
      `o painel ocupa ${e.grausH.toFixed(1)}° na horizontal — fora do terço central da vista`);
    assert.ok(e.grausTexto >= 0.7,
      `texto com ${e.grausTexto.toFixed(2)}° de altura angular — abaixo do alvo de 0,7°`);
  });

  it('girar a cabeça 20° NÃO leva o painel junto (não é colado na cara)', async () => {
    const r = await h.play(async () => {
      window.__U.cabecaYaw(0);
      await window.__A.espera(500);
      const antes = window.__U.estado().pos;
      window.__U.cabecaYaw(20);
      await window.__A.espera(600);
      return { antes, depois: window.__U.estado().pos };
    });
    const d = dist(r.antes, r.depois);
    console.log(`      o painel andou ${(d * 1000).toFixed(1)} mm com a cabeça girando 20°` +
      ` (colado na cara andaria ~${(2 * 1.0 * Math.sin(10 * Math.PI / 180) * 1000).toFixed(0)} mm)`);
    assert.ok(d <= 0.03, `o painel acompanhou a cabeça (${d.toFixed(3)} m) — é menu head-locked`);
  });

  it('girar 150° traz o painel de volta — nenhum estado sem saída (I4)', async () => {
    const r = await h.play(async () => {
      window.__U.cabecaYaw(0);
      await window.__A.espera(600);
      window.__U.cabecaYaw(150);
      await window.__A.espera(1400);
      const e = window.__U.estado(), olho = window.__U.olho(), f = window.__U.frente();
      const dx = e.pos[0] - olho[0], dz = e.pos[2] - olho[2];
      const n = Math.hypot(dx, dz) || 1;
      const cos = (dx / n) * f[0] + (dz / n) * f[2];
      return { graus: Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI, dist: e.distancia };
    });
    console.log(`      depois de girar 150°, o painel voltou a ${r.graus.toFixed(1)}° da vista, a ${r.dist.toFixed(2)} m`);
    assert.ok(r.graus <= 35, `o painel ficou a ${r.graus.toFixed(1)}° da vista — o jogador perdeu o menu de vez`);
    assert.ok(r.dist >= 0.75 && r.dist <= 1.25,
      `o painel reposicionado parou a ${r.dist.toFixed(2)} m — reposicionar não pode encurtar a distância de leitura`);
    await h.play(async () => { window.__U.cabecaYaw(0); await window.__A.espera(1200); });
  });

  it('apontar com a mão escolhe a linha apontada, e não outra', async () => {
    const r = await h.play(async () => {
      const linhas = window.__U.estado().linhas;
      const fora = [];
      for (const l of linhas) {
        window.__U.apontar('right', l.centro);
        await window.__A.espera(220);
        const e = window.__U.estado();
        fora.push({ pedido: l.id, lido: e.item && e.item.id, mao: e.mao });
      }
      return fora;
    });
    for (const x of r) {
      assert.equal(x.lido, x.pedido, `apontei para "${x.pedido}" e o painel marcou "${x.lido}"`);
      assert.equal(x.mao, 'right', 'a mão que aponta não foi reconhecida');
    }
    console.log(`      ${r.length} linhas apontadas, ${r.length} acertos`);
  });

  it('a preferência de giro tem TELA: o gatilho troca suave↔passos e o valor persiste', async () => {
    const r = await h.play(async () => {
      const antes = window.__U.prefsGiro().modo;
      window.__U.apontar('right', window.__U.linha('giroModo').centro);
      await window.__A.espera(220);
      await window.__U.clique('right');
      await window.__A.espera(250);
      return { antes, depois: window.__U.prefsGiro().modo, salvo: window.__U.salvo().modo };
    });
    assert.notEqual(r.depois, r.antes, `o modo de giro não mudou (continua "${r.antes}")`);
    assert.equal(r.salvo, r.depois, 'a escolha não foi persistida em localStorage');
    console.log(`      modo de giro: ${r.antes} → ${r.depois} (persistido)`);
  });

  it('o + e o − do slider mexem no valor, dentro dos limites do módulo de giro', async () => {
    const r = await h.play(async () => {
      // garante o modo em PASSOS, onde a linha do slider é o ÂNGULO do passo
      if (window.__U.prefsGiro().modo !== 'passos') {
        window.__U.apontar('right', window.__U.linha('giroModo').centro);
        await window.__A.espera(220);
        await window.__U.clique('right');
        await window.__A.espera(250);
      }
      const l = window.__U.linha('passo');
      const antes = window.__U.prefsGiro().passo;
      window.__U.apontar('right', l.mais);
      await window.__A.espera(220);
      const zonaMais = (window.__U.estado().item || {}).zona;
      await window.__U.clique('right');
      await window.__A.espera(250);
      const maior = window.__U.prefsGiro().passo;
      window.__U.apontar('right', window.__U.linha('passo').menos);
      await window.__A.espera(220);
      const zonaMenos = (window.__U.estado().item || {}).zona;
      await window.__U.clique('right');
      await window.__A.espera(250);
      return { antes, maior, menor: window.__U.prefsGiro().passo, zonaMais, zonaMenos };
    });
    assert.equal(r.zonaMais, 'mais', 'apontar no + não foi reconhecido como +');
    assert.equal(r.zonaMenos, 'menos', 'apontar no − não foi reconhecido como −');
    assert.ok(r.maior > r.antes || r.antes >= 90,
      `o + não aumentou o passo (${r.antes}° → ${r.maior}°)`);
    assert.ok(r.menor < r.maior, `o − não diminuiu o passo (${r.maior}° → ${r.menor}°)`);
    console.log(`      passo do giro: ${r.antes}° → ${r.maior}° → ${r.menor}°`);
  });

  it('a vinheta de conforto é desligável pela tela e a escolha fica salva', async () => {
    const r = await h.play(async () => {
      const antes = window.__UI.prefs.vinheta;
      window.__U.apontar('right', window.__U.linha('vinheta').centro);
      await window.__A.espera(220);
      await window.__U.clique('right');
      await window.__A.espera(250);
      return { antes, depois: window.__UI.prefs.vinheta, salvo: window.__U.salvo().vinheta };
    });
    assert.notEqual(r.depois, r.antes, 'a vinheta não alternou');
    assert.equal(r.salvo, r.depois, 'a escolha da vinheta não foi persistida');
    console.log(`      vinheta: ${r.antes} → ${r.depois} (persistido)`);
  });

  it('RECENTRAR zera o giro SEM mover o jogador no mundo', async () => {
    /* O contador virou medição de EFEITO quando o painel passou a ser o do
       jogo. É melhor assim: recentrar tem que zerar o giro artificial e NÃO
       deslocar o jogador — a origem muda, o jogador não anda. Já houve o
       defeito oposto aqui (recentrar deslocava até 0,72 m no mundo). */
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      G.XR.giro.preferir({ modo: 'suave', velocidade: 180 });
      /* Gira com o painel FECHADO: aberto, ele captura a entrada de propósito
         (senão o analógico do menu andaria com o jogador no mundo). */
      window.__UI.fechar();
      await window.__A.espera(250);
      window.__A.stick('right', 1, 0);
      await window.__A.espera(500);
      window.__A.solta();
      await window.__A.espera(200);
      const yawAntes = G.XR.giro.yaw;
      window.__UI.abrir('pausa');
      await window.__A.espera(350);
      const p0 = [MP.player.pos.x, MP.player.pos.z];
      window.__U.apontar('right', window.__U.linha('recentrar').centro);
      await window.__A.espera(220);
      await window.__U.clique('right');
      await window.__A.espera(300);
      return {
        yawAntes, yawDepois: G.XR.giro.yaw,
        andou: Math.hypot(MP.player.pos.x - p0[0], MP.player.pos.z - p0[1]),
        aberto: window.__U.estado().aberto,
      };
    });
    assert.ok(Math.abs(r.yawAntes) > 0.3, `o giro não acumulou antes do teste (${r.yawAntes})`);
    assert.equal(+r.yawDepois.toFixed(4), 0, `recentrar deixou o giro em ${r.yawDepois} rad`);
    assert.ok(r.andou < 0.02,
      `recentrar deslocou o jogador ${r.andou.toFixed(3)} m no mundo — mudar a origem não é andar`);
    assert.equal(r.aberto, true, 'recentrar fechou o painel');
  });

  it('pausado é pausado: o analógico não move o jogador um metro sequer', async () => {
    const r = await h.play(async () => {
      const antes = window.__U.pos();
      window.__A.stick('left', 0, -1);
      await window.__A.espera(1200);
      window.__A.solta();
      await window.__A.espera(200);
      return { antes, depois: window.__U.pos(), pausado: window.__U.pausado() };
    });
    const d = Math.hypot(r.depois[0] - r.antes[0], r.depois[2] - r.antes[2]);
    assert.equal(r.pausado, true, 'o painel abriu e o jogo não estava pausado');
    assert.ok(d <= 0.10, `o jogador andou ${d.toFixed(3)} m com o painel de pausa aberto`);
    console.log(`      1,2 s de analógico no talo com a pausa aberta: ${(d * 1000).toFixed(0)} mm`);
  });

  it('o painel aberto custa poucas draw calls, e fechado custa ZERO', async () => {
    const r = await h.play(async () => {
      const MP = window.__MP;
      const vis = () => ['xrUiPainel', 'xrUiRaio']
        .map(n => { const o = MP.scene.getObjectByName(n); return o ? !!o.visible : null; });
      const dif = await window.__U.custo(9);
      await window.__A.espera(250);
      const visAberto = vis();
      await window.__U.menu();          // fecha
      await window.__A.espera(300);
      return { dif, visAberto, visFechado: vis(), estado: window.__U.estado() };
    });
    const custo = mediana(r.dif);
    console.log(`      custo do painel em draw calls (estéreo, diferença pareada): ${custo}  [${r.dif.join(' ')}]`);
    assert.equal(r.estado.aberto, false, 'o botão de menu não fechou o painel');
    /* 4 = (painel + raio) × 2 olhos. A banda existe porque a diferença
       pareada tem ±2 de ruído; o TETO em 4 é o que pega a regressão que já
       aconteceu aqui: com `side: DoubleSide` o three desenha material
       transparente em dois passes e o custo vai a 6. */
    assert.ok(custo >= 2 && custo <= 4,
      `o painel custou ${custo} draw calls — o esperado é 4 (painel + raio, × 2 olhos)`);
    /* e o "fechado custa ZERO" é determinístico: os dois objetos existem e
       estão invisíveis, e o three nem visita objeto invisível */
    assert.deepEqual(r.visAberto, [true, true], 'o painel aberto não tinha malha visível — teste cego');
    assert.deepEqual(r.visFechado, [false, false], 'fechado, o painel continuou sendo desenhado');
  });

  it('fechar devolve o jogo: despausa e o analógico anda de novo', async () => {
    const r = await h.play(async () => {
      const pausado = window.__U.pausado();
      const antes = window.__U.pos();
      window.__A.stick('left', 0, -1);
      await window.__A.espera(1200);
      window.__A.solta();
      await window.__A.espera(200);
      return { pausado, antes, depois: window.__U.pos() };
    });
    const d = Math.hypot(r.depois[0] - r.antes[0], r.depois[2] - r.antes[2]);
    assert.equal(r.pausado, false, 'fechar o painel não despausou');
    assert.ok(d > 0.3, `o jogador andou só ${d.toFixed(3)} m depois de fechar o painel — a pausa ficou presa`);
    console.log(`      1,2 s de analógico com o painel fechado: ${d.toFixed(2)} m`);
  });

  it('SAIR DA PARTIDA existe, é acionável e encerra a sessão', async () => {
    /* ÚLTIMO da bateria de propósito: a ação é a do jogo e encerra a partida E
       a sessão imersiva — `voltarAoMenu()` aterrissa no menu principal, que
       ainda é DOM, e ficar de pé no mundo sem menu seria o beco que esta
       rodada veio fechar. Medir com contador em dublê provaria só que a função
       foi chamada; o que importa é que o jogador realmente SAI. */
    const r = await h.play(async () => {
      await window.__U.menu();
      await window.__A.espera(300);
      const tinhaLinha = !!window.__U.linha('sair');
      window.__U.apontar('right', window.__U.linha('sair').centro);
      await window.__A.espera(220);
      await window.__U.clique('right');
      await window.__A.espera(600);
      return { tinhaLinha, presenting: window.__game.XR.presenting };
    });
    assert.equal(r.tinhaLinha, true, 'o painel de pausa não oferece saída da partida');
    assert.equal(r.presenting, false,
      'acionar SAIR não encerrou a sessão: o jogador ficaria de pé no mundo, sem menu');
  });

  it('a tela de MORTE é o mesmo painel, com as saídas da morte', async () => {
    /* Sem isto, morrer no headset é beco sem saída: a tela de morte é DOM e
       não é desenhada dentro da sessão. Aqui se mede o painel, não o contador
       — a ação de reaparecer é do jogo e reinicia a partida de verdade. */
    const r = await h.play(async () => {
      window.__UI.abrir('morte');
      await window.__A.espera(350);
      const e = window.__U.estado();
      return { ids: e.linhas.map(l => l.id), modo: e.modo, dist: e.distancia, aberto: e.aberto };
    });
    assert.equal(r.modo, 'morte');
    assert.ok(r.ids.includes('reaparecer'), `a tela de morte não oferece reaparecer: ${r.ids.join(', ')}`);
    assert.ok(r.ids.includes('sair'), `a tela de morte não oferece sair: ${r.ids.join(', ')}`);
    assert.ok(r.dist > 0.75 && r.dist < 1.25, `painel de morte a ${r.dist.toFixed(2)} m`);
    assert.equal(r.aberto, true);
  });

  it('sem erro de console durante a sessão inteira (I2)', async () => {
    assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
    assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
  });
});
