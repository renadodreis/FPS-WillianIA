/* ================================================================
   QA — PRESET DE QUALIDADE DA SESSÃO XR.

   Medição que motivou o módulo (`npm run vr:censo`, mono, pose de spawn):
   frame sem sombra 198 draw calls · 0,65 M tris; as 4 cascatas CSM custam
   +42 draw calls e +0,16 M tris — 17,5% do quadro. Em estéreo tudo dobra, e
   o alvo do Quest 3 é 72 fps travados com teto de 180 draw calls.

   O QUE ESTE ARQUIVO PROTEGE, e é mais importante que o corte em si:

   1. **Restaurar ao sair.** Preset que vaza para o desktop é regressão de
      PC introduzida por VR — o jogador tira o headset, volta pro monitor e
      fica com duas cascatas de sombra desligadas para sempre.
   2. **Não cortar o que é contrato.** Nada que alimente o `Math.random`
      seedado (grama, árvores, pedras, flores, terreno, inimigos) pode
      mudar: quem está de headset ficaria num mundo DIFERENTE do dos outros
      jogadores da mesma partida.
   3. **Não ralar grama nem encurtar visão.** Isso é wallhack contra quem
      está deitado no mato, e vantagem para quem usa headset não é
      otimização, é defeito de projeto.

   O CORTE DE TRIÂNGULO DA GRAMA entrou depois, e é o item 3 levado a sério:
   o preset mexe no `CFG.GRASS_LOD_RING`, que é o anel a partir do qual a
   LÂMINA cai de 4 para 2 segmentos de altura. Base, meio e ponta continuam
   nos mesmos pontos; some a subdivisão intermediária. Mesma quantidade de
   lâmina, mesma altura, mesmo alcance — medido aqui, não prometido.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3460;

/* O padrão do DESKTOP, lido de js/config.js — e não um literal repetido aqui.
   É o que faz a asserção "o preset corta" ser um contrato entre dois módulos
   em vez de uma comparação entre dois números do mesmo arquivo. */
const ANEL_DESKTOP = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
  const m = /GRASS_LOD_RING:\s*(\d+)\s*,[^\n]*\n?[^\n]*=\s*default histórico/.exec(src) ||
    /GRASS_LOD_RING:\s*(\d+)/.exec(src);
  return +m[1];
})();

describe('política de qualidade (unidade, sem three)', () => {
  let planoDeQualidade;
  before(async () => { ({ planoDeQualidade } = await import('../js/xr/xrquality.js')); });

  it('deixa acesas as cascatas PRÓXIMAS e apaga as distantes', () => {
    const p = planoDeQualidade({ cascatas: 4 });
    assert.equal(p.cascatasLigadas, 2,
      'as cascatas distantes cobrem a maior área com o mesmo mapa: muito custo, pouca sombra visível');
  });

  it('nunca liga mais cascata do que existe', () => {
    assert.equal(planoDeQualidade({ cascatas: 1 }).cascatasLigadas, 1);
    assert.equal(planoDeQualidade({ cascatas: 0 }).cascatasLigadas, 0);
  });

  it('o modo agressivo corta mais, e não ao contrário', () => {
    const n = planoDeQualidade({ cascatas: 4 });
    const a = planoDeQualidade({ cascatas: 4, agressivo: true });
    assert.ok(a.cascatasLigadas <= n.cascatasLigadas);
    assert.ok(a.framebuffer <= n.framebuffer);
    assert.ok(a.maxFar <= n.maxFar);
  });

  it('a foveação fica LONGE do padrão do three (1.0 = periferia borrada)', () => {
    assert.ok(planoDeQualidade({ cascatas: 4 }).foveacao <= 0.25,
      'o three nasce em foveação máxima, e foi assim que o jogo rodou até agora');
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).foveacao < 1,
      'nem o modo agressivo pode voltar ao borrão do padrão');
  });

  it('o framebuffer não desce ao ponto de matar a legibilidade', () => {
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).framebuffer >= 0.8,
      'texto ilegível reprova na loja — escala não é lugar de economizar sem limite');
  });

  it('o anel de LOD da grama entra MAIS PERTO do que no desktop', () => {
    const p = planoDeQualidade({ cascatas: 4 });
    assert.ok(Number.isInteger(p.anelGrama),
      `anelGrama tem que ser um anel inteiro de chunk, veio ${p.anelGrama}`);
    assert.ok(p.anelGrama < ANEL_DESKTOP,
      `anelGrama ${p.anelGrama} não corta nada: o desktop já usa ${ANEL_DESKTOP} (js/config.js)`);
  });

  it('a lâmina COMPLETA nunca some do chunk onde o jogador está', () => {
    /* O anel é uma distância de Chebyshev em chunks: 0 já significa "só a
       célula sob os pés". Negativo seria reduzir TUDO, inclusive a grama que
       o jogador encosta a mão — deixa de ser LOD por distância. */
    assert.ok(planoDeQualidade({ cascatas: 4 }).anelGrama >= 0);
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).anelGrama >= 0,
      'nem o modo agressivo pode reduzir a lâmina debaixo do jogador');
  });

  it('o modo agressivo corta o anel da grama pelo menos tanto quanto o normal', () => {
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).anelGrama <=
      planoDeQualidade({ cascatas: 4 }).anelGrama);
  });
});

/* ================================================================
   O CANAL É O `CFG`, E ELE TEM DONO.

   `js/grass.js` relê `CFG.GRASS_LOD_RING` a cada `atualizarLods()` — o
   mesmo canal que este módulo já usava pro `CFG.CSM_MAX_FAR`. Isso é o que
   faz o corte de grama caber inteiro em dois arquivos, sem fiação nova no
   game.js (e sem o andaime-que-vira-produto que já mordeu esta frente seis
   vezes). Em troca, o round-trip do CFG passa a ser contrato testável.
   ================================================================ */
describe('preset e o CFG (unidade, renderer de mentira)', () => {
  let createXrQuality;
  before(async () => { ({ createXrQuality } = await import('../js/xr/xrquality.js')); });

  const rendererFalso = () => ({
    xr: {
      escala: 1, fov: 1,
      setFramebufferScaleFactor(v) { this.escala = v; },
      setFoveation(v) { this.fov = v; },
      getFoveation() { return this.fov; },
    },
  });

  it('aplicar escreve o anel da grama no CFG; restaurar devolve o que estava lá', () => {
    const CFG = { CSM_MAX_FAR: 160, GRASS_LOD_RING: ANEL_DESKTOP };
    const q = createXrQuality({ renderer: rendererFalso(), CFG });
    const p = q.aplicar();
    assert.equal(CFG.GRASS_LOD_RING, p.anelGrama,
      'entrou em XR e a grama continuou no anel do desktop');
    assert.ok(q.restaurar());
    assert.equal(CFG.GRASS_LOD_RING, ANEL_DESKTOP,
      'saiu do XR e o desktop herdou o anel do headset');
  });

  it('devolve o anel do CELULAR quando foi ele que estava valendo', () => {
    /* js/mobile.js aplica MOBILE_CFG ANTES de a grama nascer. Restaurar tem
       que devolver o que estava lá, não o padrão de desktop — senão entrar e
       sair do VR num celular PIORA o quadro de quem ficou no celular. */
    const CFG = { CSM_MAX_FAR: 90, GRASS_LOD_RING: 1 };
    const q = createXrQuality({ renderer: rendererFalso(), CFG });
    q.aplicar();
    q.restaurar();
    assert.equal(CFG.GRASS_LOD_RING, 1);
  });

  it('restaurar duas vezes não reescreve o anel da grama', () => {
    const CFG = { CSM_MAX_FAR: 160, GRASS_LOD_RING: ANEL_DESKTOP };
    const q = createXrQuality({ renderer: rendererFalso(), CFG });
    q.aplicar(); q.restaurar();
    CFG.GRASS_LOD_RING = 2;                 // alguém depois mexeu (menu, celular)
    assert.equal(q.restaurar(), false);
    assert.equal(CFG.GRASS_LOD_RING, 2, 'restaurar sem ter aplicado desfez o que não era seu');
  });

  it('o preset NÃO encosta em nada que alimente o Math.random seedado', () => {
    /* Guarda de fonte, e ela é a rede do invariante mais caro do repo: a
       ordem de consumo do rand seedado é contrato, e GRASS_TOTAL /
       GRASS_CHUNKS / TREE_COUNT / ROCK_COUNT / FLOWER_COUNT / TERRAIN_SEGS /
       ENEMY_COUNT são tetos de laço que sorteiam posição. VIEW_DIST entra
       junto por outro motivo: encurtar alcance de visão é wallhack.
       Comentários são removidos ANTES — este arquivo cita os sete de
       propósito, e um guarda que casasse comentário só saberia mentir. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'xr', 'xrquality.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const chave of ['GRASS_TOTAL', 'GRASS_CHUNKS', 'GRASS_HEIGHT', 'TREE_COUNT',
      'ROCK_COUNT', 'FLOWER_COUNT', 'TERRAIN_SEGS', 'ENEMY_COUNT', 'VIEW_DIST']) {
      assert.ok(!new RegExp(`${chave}\\s*[=:]`).test(src),
        `xrquality.js escreve em ${chave} — isso muda o MUNDO de quem usa headset`);
    }
  });
});

/* ================================================================
   A PERGUNTA QUE DECIDE SE ISTO É LOD OU WALLHACK, MEDIDA EM PIXEL.

   Contar lâmina e medir altura prova que a GEOMETRIA não mudou. Não prova
   o que o jogador ganha: quantos pixels A MAIS de um adversário deitado no
   mato ficam visíveis com a lâmina reduzida. Este bloco pergunta isso
   direto — alvo opaco do tamanho de um corpo deitado, plantado a 18/25/32 m,
   contado em pixels com o anel do desktop e com o anel do preset.

   A PRIMEIRA VERSÃO DESTE CASO NÃO SERVIA, e o motivo vale registrar: com o
   olho DEITADO (0,35 m) olhando o horizonte, a grama dos primeiros 15 m —
   que o preset não toca — escondia 100% do alvo em todas as configurações.
   Três casas decimais de 100%, e nenhuma capacidade de distinguir nada.
   Teste que não pode falhar não é teste: o olho subiu para 1,6 m olhando
   PARA BAIXO, que é a pose real de quem procura alguém deitado, e aí quem
   esconde é justamente a grama que troca de LOD.

   Roda FORA do XR de propósito: o que se mede aqui é o contrato da grama
   (js/grass.js) sob o valor que o preset escolhe, e ler o framebuffer da
   sessão imersiva seria medir o compositor junto.
   ================================================================ */
describe('LOD de lâmina não abre wallhack (pixels, Chrome headless)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, medido = null, anelPreset = null;
  before(async () => {
    const { planoDeQualidade } = await import('../js/xr/xrquality.js');
    anelPreset = planoDeQualidade({ cascatas: 4 }).anelGrama;   // o valor QUE VAI PRO HEADSET
    h = await bootGame({ port: PORT + 1 });
    medido = await h.play(async (aneis) => {
      const G = window.__game, MP = window.__MP, R = MP.renderer, THREE = MP.THREE;
      window.QA.reset(0, 0);
      window.QA.tick(300);                       // drena a fila de refill da grama

      const grama = MP.scene.children.filter(o => o.isInstancedMesh && o.material === G.Grass.material);
      const olhoY = G.groundAt(0, 0, 999) + 1.6; // EM PÉ, procurando alguém deitado
      const gl = R.getContext(), w = R.domElement.width, hh = R.domElement.height;
      const sombraSalva = R.shadowMap.enabled;
      R.shadowMap.enabled = false;
      const alvoMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, toneMapped: false });

      const casos = [];
      for (const d of [18, 25, 32]) for (const yc of [0.3, 0.5]) {
        const alvo = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.55), alvoMat);
        alvo.position.set(d, G.groundAt(d, 0, 999) + yc, 0);
        alvo.rotation.y = -Math.PI / 2;          // de frente pra câmera
        alvo.frustumCulled = false;
        MP.scene.add(alvo);
        const cam = new THREE.PerspectiveCamera(75, w / hh, 0.08, MP.CFG.VIEW_DIST + 600);
        cam.position.set(0, olhoY, 0);
        cam.lookAt(alvo.position);
        cam.updateMatrixWorld(true);
        const conta = () => {
          R.render(MP.scene, cam);
          const buf = new Uint8Array(w * hh * 4);
          gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let n = 0;
          for (let i = 0; i < buf.length; i += 4)
            if (buf[i] > 200 && buf[i + 1] < 60 && buf[i + 2] > 200) n++;
          return n;
        };
        for (const g of grama) g.visible = false;
        const semGrama = conta();                // teto: o alvo sem nada na frente
        for (const g of grama) g.visible = true;
        const visivel = {};
        for (const anel of aneis) {
          MP.CFG.GRASS_LOD_RING = anel;
          window.QA.tick(3);                     // Grass.update propaga o anel novo
          visivel[anel] = conta();
        }
        MP.CFG.GRASS_LOD_RING = aneis[0];
        window.QA.tick(3);
        MP.scene.remove(alvo);
        casos.push({ chave: `${d} m @ ${yc} m`, semGrama, visivel });
      }
      R.shadowMap.enabled = sombraSalva;
      return { casos, anelFinal: MP.CFG.GRASS_LOD_RING };
    }, [ANEL_DESKTOP, anelPreset]);
  });
  after(async () => { if (h) await h.close(); });

  it('a sonda ENXERGA o alvo — sem isso o resto não mediria nada', () => {
    for (const c of medido.casos)
      assert.ok(c.semGrama > 40,
        `${c.chave}: o alvo ocupa só ${c.semGrama} pixels sem grama — a sonda perdeu o alvo`);
    const teto = medido.casos.reduce((s, c) => s + c.semGrama, 0);
    const comGrama = medido.casos.reduce((s, c) => s + c.visivel[ANEL_DESKTOP], 0);
    assert.ok(comGrama < teto * 0.5,
      `a grama do desktop escondeu só ${teto - comGrama} de ${teto} pixels — ` +
      'a sonda está olhando pra um lugar sem grama e não mede ocultamento nenhum');
    assert.ok(comGrama > 0,
      'nenhum pixel de alvo passou nem no desktop: a medição saturou e não distingue nada');
  });

  it('com a lâmina reduzida o adversário deitado NÃO fica mais visível', () => {
    const teto = medido.casos.reduce((s, c) => s + c.semGrama, 0);
    const desk = medido.casos.reduce((s, c) => s + c.visivel[ANEL_DESKTOP], 0);
    const vr = medido.casos.reduce((s, c) => s + c.visivel[anelPreset], 0);
    const detalhe = medido.casos
      .map(c => `${c.chave}: ${c.visivel[ANEL_DESKTOP]} -> ${c.visivel[anelPreset]} de ${c.semGrama}`)
      .join(' | ');
    assert.ok(vr <= desk * 1.5 + 10,
      `a lâmina reduzida abriu visão: ${vr} pixels de alvo contra ${desk} no desktop. ${detalhe}`);
    assert.ok(1 - vr / teto > 0.9,
      `a grama com o preset esconde só ${(100 * (1 - vr / teto)).toFixed(1)}% do alvo. ${detalhe}`);
    console.log(`      alvo visível através da grama: ${desk} px no anel ${ANEL_DESKTOP} (desktop), ` +
      `${vr} px no anel ${anelPreset} (headset), de ${teto} px sem grama`);
  });

  it('a sonda devolveu o anel do desktop ao terminar', () => {
    assert.equal(medido.anelFinal, ANEL_DESKTOP);
  });
});

describe('preset aplicado na sessão de verdade', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('entrar na sessão APAGA as cascatas distantes', async () => {
    /* DUAS CORREÇÕES NESTE CASO, e as duas são de método.

       1. Ele ESPERA FRAMES antes de ler. `bootEmVR` volta quando
          `XR.presenting` fica true, mas quem aplica o preset é o `sync()` do
          `js/xr/xrboot.js`, que roda no frame SEGUINTE. Ler no mesmo instante é
          corrida — e ela perdeu, sob carga, depois de dezenas de execuções
          verdes. A espera é limitada: se o preset nunca for aplicado, o laço
          esgota e a asserção falha do mesmo jeito.
       2. Ele agora OLHA AS CASCATAS. A versão anterior tinha
          `sombras: G.csmDebug ? null : null` — os dois lados do ternário são o
          mesmo literal — e asseverava `dentro` duas vezes com nomes
          diferentes. O título prometia cascata apagada e nada no arquivo
          verificava cascata nenhuma. */
    const r = await h.play(async () => {
      const G = window.__game, R = window.__MP.renderer;
      const limite = R.info.render.frame + 120;
      while (!G.XR.qualidade.dentro && R.info.render.frame < limite)
        await new Promise(res => setTimeout(res, 16));
      return {
        dentro: G.XR.qualidade.dentro,
        cascatas: G.csmDebug.castShadow,
        presenting: G.XR.presenting,
      };
    });
    assert.equal(r.presenting, true, 'a sessão nem estava de pé — o caso não mediu o preset');
    assert.equal(r.dentro, true, 'o preset não foi aplicado ao entrar na sessão');
    assert.ok(r.cascatas.length >= 3, `só ${r.cascatas.length} cascatas: o CSM não é o do jogo`);
    assert.deepEqual(r.cascatas, r.cascatas.map((_, i) => i < 2),
      `dentro da sessão as cascatas ficaram ${JSON.stringify(r.cascatas)} — ` +
      'as duas PRÓXIMAS acesas e as distantes apagadas é o corte inteiro do preset de sombra');
  });

  it('o quadro fica MAIS BARATO com o preset — medido, não suposto', async () => {
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      const esperaFrames = n => new Promise(res => {
        const alvo = R.info.render.frame + n;
        const olha = () => (R.info.render.frame >= alvo ? res() : setTimeout(olha, 6));
        olha();
      });
      const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1] || 0;
      const amostra = async () => {
        const c = [];
        for (let i = 0; i < 9; i++) { await esperaFrames(1); c.push(R.info.render.calls); }
        return med(c);
      };
      await esperaFrames(20);
      const comPreset = await amostra();
      G.XR.qualidade.restaurar();                 // volta ao quadro cheio
      await esperaFrames(20);
      const semPreset = await amostra();
      G.XR.qualidade.aplicar();                   // e devolve o preset
      await esperaFrames(10);
      return { comPreset, semPreset };
    });
    assert.ok(r.comPreset < r.semPreset,
      `o preset não baixou o custo: ${r.comPreset} draw calls contra ${r.semPreset} sem ele`);
  });

  /* ================================================================
     GRAMA — A ÚNICA ALAVANCA DE TRIÂNGULO QUE SOBROU, E A CERCA DELA.

     Medido em sessão imersiva (IWER), mundo congelado, sombra desligada,
     seed 424242, spread 0 nas 9 amostras: a grama sozinha custa 434 k
     triângulos POR OLHO na pose de castelo, contra teto de 500 k pro
     frame inteiro. Apagando todo o resto do mundo o frame ainda estouraria.

     E é exatamente por ser a maior alavanca que ela é a mais perigosa:
     lâmina a menos, mais baixa ou com menos alcance é WALLHACK contra quem
     está deitado no mato. Por isso os três casos abaixo vêm em par — um
     mede o corte, os outros dois provam que ele é só SUBDIVISÃO.
     ================================================================ */
  const sondaGrama = async () => {
    /* Roda NA PÁGINA. Devolve, DENTRO DA MESMA SESSÃO, o custo de triângulo
       da grama com e sem o preset, mais o retrato do conteúdo dos chunks nos
       dois estados. Comparar absoluto entre execuções é o erro que já
       produziu o "não atribuído −1144" nesta frente. */
    const G = window.__game, MP = window.__MP, R = MP.renderer;
    const esperaFrames = n => new Promise(res => {
      const alvo = R.info.render.frame + n;
      const olha = () => (R.info.render.frame >= alvo ? res() : setTimeout(olha, 6));
      olha();
    });
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1] || 0;
    const spread = a => Math.max(...a) - Math.min(...a);
    const amostra = async (n = 9) => {
      const t = [];
      for (let i = 0; i < n; i++) { await esperaFrames(1); t.push(R.info.render.triangles); }
      return { tris: med(t), spread: spread(t) };
    };

    /* Os chunks são filhos DIRETOS da cena (js/grass.js faz `scene.add(mesh)`)
       e o que os identifica é o material compartilhado da grama. */
    const gramaMeshes = MP.scene.children.filter(o => o.isInstancedMesh && o.material === G.Grass.material);
    /* Esconder no ÚLTIMO instante antes do culling: escrever `visible` uma vez
       só não segura quem reescreve `visible` todo frame, e esse falso zero
       atribuiria à grama um custo que não é dela. */
    let esconder = false;
    const antesDaCena = MP.scene.onBeforeRender;
    MP.scene.onBeforeRender = function (...a) {
      if (esconder) for (const m of gramaMeshes) m.visible = false;
      if (antesDaCena) antesDaCena.apply(this, a);
    };
    const mostrar = () => { for (const m of gramaMeshes) m.visible = true; };

    const sombraSalva = R.shadowMap.enabled;
    R.shadowMap.enabled = false;      // o CSM escalona uma cascata por frame
    MP.setTimeScale(0);               // MUNDO CONGELADO: sem isso o stream anda entre amostras
    await esperaFrames(60);

    const trisDaGrama = async () => {
      esconder = false; mostrar();
      await esperaFrames(6);
      const com = await amostra();
      esconder = true;
      await esperaFrames(6);
      const sem = await amostra();
      esconder = false; mostrar();
      await esperaFrames(6);
      return { tris: com.tris - sem.tris, spread: Math.max(com.spread, sem.spread) };
    };

    /* CONSUMO DO `Math.random`. Em produção ele É o fluxo seedado (game.js
       troca a função e nunca devolve), então contar chamadas é a leitura
       direta do invariante. Duas janelas do MESMO tamanho, mundo congelado:
       uma com a troca de anel no meio, outra sem nada. */
    const contarNumaJanela = async (acao) => {
      const orig = Math.random;
      let n = 0;
      Math.random = function () { n++; return orig.apply(this, arguments); };
      try { if (acao) acao(); await esperaFrames(40); } finally { Math.random = orig; }
      return n;
    };

    const retrato = () => {
      const lods = G.Grass.debugLod();
      const bytes = lods.slice(0, 12).map(l => {
        const b = G.Grass.debugChunkBytes(l.cx, l.cz);
        return b ? `${l.cx},${l.cz}|${b.m.join(',')}|${b.ph.join(',')}|${b.ti.join(',')}` : null;
      });
      return {
        anel: MP.CFG.GRASS_LOD_RING,
        chunks: lods.length,
        laminasPorChunk: [...new Set(lods.map(l => l.laminas))],
        laminasTotal: lods.reduce((s, l) => s + l.laminas, 0),
        reduzidos: lods.filter(l => l.reduzida).length,
        alcance: G.Grass.PATCH_RADIUS,
        /* o mapa (anel de Chebyshev -> reduzida?) é o que prova que a grama
           OBEDECE o número novo, e não que alguém só trocou um campo */
        mapa: lods.map(l => ({
          anel: Math.max(Math.abs(l.cx - Math.round(G.player.pos.x / MP.CFG.GRASS_CHUNK_SIZE)),
            Math.abs(l.cz - Math.round(G.player.pos.z / MP.CFG.GRASS_CHUNK_SIZE))),
          reduzida: l.reduzida,
        })),
        bytes,
      };
    };

    const comPreset = await trisDaGrama();
    const retratoDentro = retrato();

    const randSemTroca = await contarNumaJanela(null);
    const randComTroca = await contarNumaJanela(() => G.XR.qualidade.restaurar());
    await esperaFrames(20);
    const semPreset = await trisDaGrama();
    const retratoSem = retrato();

    G.XR.qualidade.aplicar();
    await esperaFrames(20);
    const retratoDeVolta = retrato();

    /* ANEL ZERO É UM VALOR LEGÍTIMO, e é o do modo agressivo. Fica aqui
       porque `CFG.GRASS_LOD_RING || 4` — o jeito natural de escrever a
       leitura — transformaria o 0 em 4 CALADO: o modo agressivo não faria
       nada e nenhum outro caso perceberia. */
    G.XR.qualidade.restaurar();
    await esperaFrames(10);
    G.XR.qualidade.aplicar({ agressivo: true });
    await esperaFrames(20);
    const retratoAgressivo = retrato();
    G.XR.qualidade.restaurar();
    await esperaFrames(10);
    G.XR.qualidade.aplicar();
    await esperaFrames(20);

    R.shadowMap.enabled = sombraSalva;
    MP.setTimeScale(1);
    MP.scene.onBeforeRender = antesDaCena;
    mostrar();

    return {
      comPreset, semPreset, retratoDentro, retratoSem, retratoDeVolta, retratoAgressivo,
      randSemTroca, randComTroca,
      formas: G.Grass.debugBladeShapes(),
      chunksMedidos: gramaMeshes.length,
    };
  };

  let grama = null;
  it('a grama custa MENOS TRIÂNGULO com o preset — medido por subtração, na mesma sessão', async () => {
    grama = await h.play(sondaGrama);
    assert.equal(grama.comPreset.spread, 0,
      `mundo não estava congelado: spread ${grama.comPreset.spread} triângulos entre amostras`);
    assert.equal(grama.semPreset.spread, 0);
    assert.ok(grama.comPreset.tris > 0, 'a subtração não achou grama nenhuma — a sonda mediu o vazio');
    assert.ok(grama.comPreset.tris <= grama.semPreset.tris * 0.85,
      `o preset mal mexeu na grama: ${grama.comPreset.tris} triângulos estéreo contra ` +
      `${grama.semPreset.tris} sem ele (esperado ao menos −15%)`);
  });

  it('ANTI-TRAPAÇA: mesma quantidade de lâmina, mesma altura, mesmo alcance', () => {
    const d = grama.retratoDentro, s = grama.retratoSem;
    assert.ok(d.anel < s.anel, `o anel não mudou (${d.anel} dentro, ${s.anel} fora) — nada foi medido`);
    assert.equal(d.chunks, s.chunks, 'o preset tirou ou pôs CHUNK de grama');
    assert.deepEqual(d.laminasPorChunk, s.laminasPorChunk,
      'contagem de lâmina por chunk mudou entre os dois estados — densidade variável é wallhack');
    assert.equal(d.laminasPorChunk.length, 1,
      `chunks com contagens diferentes de lâmina: ${d.laminasPorChunk.join(', ')}`);
    assert.equal(d.laminasTotal, s.laminasTotal,
      `total de lâminas ${d.laminasTotal} com preset contra ${s.laminasTotal} sem ele`);
    assert.equal(d.alcance, s.alcance, 'o raio do tapete de grama mudou — encurtar alcance é wallhack');
    /* ALTURA e SILHUETA: as duas lâminas têm que ter a mesma extensão. É o que
       separa LOD (some a subdivisão) de grama rala (some a grama). */
    const f = grama.formas;
    assert.ok(f.completa.segmentos > f.reduzida.segmentos, 'as duas lâminas são a mesma');
    assert.ok(f.reduzida.triangulos < f.completa.triangulos);
    assert.equal(f.completa.alturaMax, f.reduzida.alturaMax, 'a lâmina reduzida ficou mais baixa');
    assert.equal(f.completa.larguraBase, f.reduzida.larguraBase);
    assert.equal(f.completa.larguraTopo, f.reduzida.larguraTopo);
    /* E o conteúdo do chunk — matriz de instância (posição, giro, ALTURA),
       fase do vento e tint — byte por byte igual nos dois estados. */
    assert.ok(d.bytes.length >= 12 && d.bytes.every(b => typeof b === 'string' && b.length > 40),
      'a sonda de bytes não leu chunk nenhum');
    assert.deepEqual(d.bytes, s.bytes,
      'o preset moveu/redimensionou lâmina: os bytes do chunk não batem');
  });

  it('a grama OBEDECE o anel novo — e volta ao anel do desktop quando ele sai', () => {
    const conforme = r => r.mapa.every(c => c.reduzida === (c.anel > r.anel));
    assert.ok(conforme(grama.retratoDentro),
      'com o preset, os chunks não seguem o anel que está no CFG: alguém trocou o número e ninguém leu');
    assert.ok(conforme(grama.retratoSem), 'sem o preset, os chunks não seguem o anel do desktop');
    assert.ok(grama.retratoDentro.reduzidos > grama.retratoSem.reduzidos,
      `o preset não reduziu chunk nenhum a mais (${grama.retratoDentro.reduzidos} contra ` +
      `${grama.retratoSem.reduzidos})`);
    assert.equal(grama.retratoDeVolta.anel, grama.retratoDentro.anel,
      'reaplicar o preset não devolveu o anel do headset');
    /* ANEL ZERO tem que chegar na grama como ZERO. `|| 4` o engoliria calado. */
    const ag = grama.retratoAgressivo;
    assert.equal(ag.anel, 0, `o modo agressivo pediu anel ${ag.anel}, não 0`);
    assert.ok(conforme(ag),
      'com anel 0 a grama não obedeceu: o chunk sob os pés é o único que fica com a lâmina completa');
    assert.ok(ag.reduzidos > grama.retratoDentro.reduzidos,
      `o modo agressivo reduziu ${ag.reduzidos} chunks, o normal ${grama.retratoDentro.reduzidos} ` +
      '— o 0 virou 4 no caminho');
  });

  it('trocar o anel não consome UM sorteio do Math.random', () => {
    /* Duas janelas de 40 frames com o mundo congelado: a segunda tem a troca
       de anel no meio. A ordem de consumo do rand seedado é contrato — um
       sorteio a mais aqui é um mundo diferente pra quem está de headset. */
    assert.ok(grama.randSemTroca >= 0);
    assert.equal(grama.randComTroca, grama.randSemTroca,
      `a janela com a troca de anel consumiu ${grama.randComTroca} sorteios contra ` +
      `${grama.randSemTroca} da janela igual sem troca`);
  });

  it('SAIR DA SESSÃO restaura tudo — preset que vaza pro desktop é regressão de PC', async () => {
    /* ESTE TESTE JÁ FOI FALSO, e é a lição mais cara desta rodada. A versão
       anterior chamava `restaurar()` na mão sem NUNCA sair da sessão, então
       não provava que a saída restaura — provava que a função existe. Pior:
       asseverava `getFramebufferScaleFactor() === 1`, e esse getter NÃO EXISTE
       no three r185, então a expressão caía num literal e a asserção não podia
       falhar. Enquanto isso, em produção, `restaurar()` tinha ZERO chamadas: o
       jogador tirava o headset e ficava com as sombras cortadas no monitor.

       Agora o teste sai da sessão de verdade e lê o ESTADO DO JOGO — cascatas,
       alcance de sombra e o LOD DE LÂMINA DA GRAMA — que é o que o jogador
       enxerga no monitor. A grama entrou aqui porque o vazamento dela é o mais
       silencioso dos três: o desktop ficaria com a lâmina de 2 segmentos a
       partir do primeiro anel, para sempre, e ninguém veria erro nenhum. */
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      const estado = () => {
        const lods = G.Grass.debugLod();
        const cx0 = Math.round(G.player.pos.x / MP.CFG.GRASS_CHUNK_SIZE);
        const cz0 = Math.round(G.player.pos.z / MP.CFG.GRASS_CHUNK_SIZE);
        return {
          cascatas: G.csmDebug.castShadow,
          maxFar: G.csmDebug.maxFar,
          cfgFar: G.csmDebug.cfgMaxFar,
          anelGrama: MP.CFG.GRASS_LOD_RING,
          // chunks do 2º ao 4º anel: cheios no desktop, reduzidos no preset
          reduzidosNoMeio: lods.filter(l => {
            const a = Math.max(Math.abs(l.cx - cx0), Math.abs(l.cz - cz0));
            return a >= 2 && a <= 4 && l.reduzida;
          }).length,
          laminas: lods.reduce((s, l) => s + l.laminas, 0),
          dentro: G.XR.qualidade.dentro,
          presenting: G.XR.presenting,
        };
      };
      const dentro = estado();
      await G.XR.exit();                              // SAI DE VERDADE
      for (let i = 0; i < 30 && G.XR.presenting; i++) await new Promise(r2 => setTimeout(r2, 50));
      await new Promise(r2 => setTimeout(r2, 300));   // deixa o sync reconciliar
      const fora = estado();
      return { dentro, fora };
    });
    assert.equal(r.dentro.dentro, true, 'o preset não estava aplicado dentro da sessão');
    assert.equal(r.fora.presenting, false, 'a sessão não terminou — o teste não mediu a saída');
    assert.equal(r.fora.dentro, false,
      'saiu da sessão e o preset continua marcado como aplicado');
    assert.deepEqual(r.fora.cascatas, r.dentro.cascatas.map(() => true),
      `as cascatas de sombra ficaram ${JSON.stringify(r.fora.cascatas)} no monitor depois de sair do VR`);
    assert.equal(r.fora.cfgFar, 160,
      `CFG.CSM_MAX_FAR ficou em ${r.fora.cfgFar} fora da sessão — o desktop herdou o corte do headset`);
    assert.equal(r.fora.anelGrama, ANEL_DESKTOP,
      `CFG.GRASS_LOD_RING ficou em ${r.fora.anelGrama} fora da sessão — o desktop herdou o LOD do headset`);
    assert.ok(r.dentro.reduzidosNoMeio > 0,
      'dentro da sessão nenhum chunk do 2º ao 4º anel estava reduzido: não havia o que vazar');
    assert.equal(r.fora.reduzidosNoMeio, 0,
      `${r.fora.reduzidosNoMeio} chunks continuaram com a lâmina reduzida no MONITOR depois de sair do VR`);
    assert.equal(r.fora.laminas, r.dentro.laminas,
      'entrar e sair do VR mudou a quantidade de lâminas de grama do mundo');
  });

  it('restaurar duas vezes não quebra nem desfaz o que não é seu', async () => {
    /* Roda DEPOIS do caso que sai da sessão, então o preset já está desfeito:
       a primeira chamada tem que ser no-op e não pode estragar o estado do
       monitor. Sem isto, um `restaurar()` extra vindo de qualquer caminho
       (saída dupla, sessão perdida por fora) desfaria o que não é seu. */
    const r = await h.play(() => {
      const G = window.__game;
      const antes = G.csmDebug.castShadow.slice();
      const a = G.XR.qualidade.restaurar();
      const b = G.XR.qualidade.restaurar();
      return { a, b, antes, depois: G.csmDebug.castShadow };
    });
    assert.equal(r.a, false, 'fora da sessão o preset já tinha sido desfeito — restaurar de novo é no-op');
    assert.equal(r.b, false);
    assert.deepEqual(r.depois, r.antes, 'restaurar sem ter aplicado mexeu na sombra do monitor');
  });
});
