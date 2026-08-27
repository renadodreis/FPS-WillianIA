/* ================================================================
   QA — PEGAR O CARRO E ABRIR O BAÚ COM A MÃO, DENTRO DA SESSÃO IMERSIVA.

   O relato do dono foi "não consigo pegar o carro, abrir os baús". A causa
   não era alcance: era que o aviso de interação é DOM (`#prompt`,
   index.html:55) e DOM NÃO É RENDERIZADO dentro de uma sessão imersiva. O
   jogador nunca viu "E — ENTRAR NO VEÍCULO", e não existe tecla E num Touch.

   E havia um segundo defeito, mais silencioso: o baú do BATTLE ROYALE é
   aberto por um listener de `keydown` DE VERDADE (br-game.js:1828), enquanto
   o caminho de VR escrevia direto no Set `justPressed` (game.js:3047). Sem
   evento, sem baú — para sempre, sem erro no console.

   Por isso os testes aqui cobram o PRODUTO:
   · existe sinal VISUAL 3D do alvo (a recomendação da Meta é explícita:
     "include visual and audio cues to indicate which object is currently
     targeted");
   · o gesto da mão de apoio ABRE o baú de verdade (item muda de lugar);
   · o gesto emite um KeyboardEvent REAL — o caminho que o BR escuta;
   · a MÃO escolhe entre dois alvos equivalentes, medido por DIREÇÃO;
   · e o alcance de gameplay NÃO muda: fora do raio, o gesto não faz nada.
     Mexer nisso seria vetor de trapaça (test/security-regression.test.js).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3480;   // faixa exclusiva desta frente (3480-3488)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* Ferramentas na página (mesmo motivo de xr-weapon.test.js: `page.evaluate`
   com string ignora argumentos; funções normais + `window.__I`). */
function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  function indice(qual) {
    const s = MP.renderer.xr.getSession();
    const fontes = Array.from(s.inputSources);
    for (let i = 0; i < fontes.length; i++) if (fontes[i] && fontes[i].handedness === qual) return i;
    return -1;
  }
  function raio(qual) {
    const i = indice(qual);
    return i < 0 ? null : MP.renderer.xr.getController(i);
  }
  function porControle(qual, posMundo, quatMundo) {
    const dev = window.__xrEmulado, rig = G.XR.rig;
    rig.updateWorldMatrix(true, false);
    if (posMundo) {
      const v = new T.Vector3().fromArray(posMundo);
      rig.worldToLocal(v);
      dev.controllers[qual].position.set(v.x, v.y, v.z);
    }
    if (quatMundo) {
      const q = new T.Quaternion().fromArray(quatMundo);
      q.premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
      dev.controllers[qual].quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
  /* aponta a mão de apoio PARA um ponto do mundo, a partir de uma posição de
     mão confortável (cotovelo baixo, como a ergonomia da Meta pede) */
  function apontarPara(qual, alvo) {
    G.camera.updateWorldMatrix(true, false);
    const cab = G.camera.getWorldPosition(new T.Vector3());
    const mao = new T.Vector3(cab.x + (qual === 'left' ? -0.22 : 0.22), cab.y - 0.42, cab.z - 0.28);
    const m = new T.Matrix4().lookAt(mao, new T.Vector3().fromArray(alvo), new T.Vector3(0, 1, 0));
    const q = new T.Quaternion().setFromRotationMatrix(m);
    porControle(qual, mao.toArray(), q.toArray());
  }

  /* Dois baús equivalentes, à esquerda e à direita do jogador, dentro do raio
     de 2,4 m que js/interact.js já usa. Mexer no SPOT (e não no mesh) é de
     propósito: o que está sendo medido é a ESCOLHA, não a arte. */
  function plantarBaus(distancia) {
    const p = MP.player.pos;
    const sp = G.Structures.chestSpots;
    const d = distancia === undefined ? 1.5 : distancia;
    sp[0].x = p.x - d; sp[0].z = p.z;
    sp[1 % sp.length].x = p.x + d; sp[1 % sp.length].z = p.z;
    return {
      esquerda: [p.x - d, G.heightAt(p.x - d, p.z), p.z],
      direita: [p.x + d, G.heightAt(p.x + d, p.z), p.z],
      quantos: sp.length,
    };
  }
  /* O HARNESS NASCE COM `__BR_active` LIGADO (test/helpers/harness.js:198,
     `online: true` é o padrão histórico: tira a IA solo do caminho). Só que
     `js/interact.js:58` esconde baú e bazuca atrás de `!window.__BR_active` —
     e o baú do BR de verdade não existe sem partida. Sem desligar a bandeira,
     o cenário de baú é inalcançável e o teste mediria o vazio. */
  function soloDeVerdade() {
    window.__BR_active = false;
    window.__BR_freeze = false;
  }
  function longeDeTudo() {
    // ponto limpo: sem canhão, sem brinquedos, sem segredo, longe da torre
    const x = -120, z = -120;
    MP.player.pos.set(x, G.heightAt(x, z), z);
    MP.player.vel.set(0, 0, 0);
    G.Car.group.position.set(x + 60, G.heightAt(x + 60, z), z);
    G.Heli.group.position.set(x + 80, G.heightAt(x + 80, z) + 30, z);
  }

  window.__I = {
    porControle, apontarPara, plantarBaus, longeDeTudo, soloDeVerdade, raio,
    marcador: () => MP.scene.getObjectByName('xrInteracaoMarcador') || null,
    marcadorPos: () => {
      const m = MP.scene.getObjectByName('xrInteracaoMarcador');
      if (!m) return null;
      m.updateWorldMatrix(true, false);
      return m.getWorldPosition(new T.Vector3()).toArray();
    },
    /* D3: o gesto é a EMPUNHADURA. E como a mão fica a mais de 7,5 cm da casca
       do baú (ela está no peito, apontando), o que vale aqui é o agarre à
       DISTÂNCIA — que é verbo separado e pede confirmação: mantém o grip
       apontado além de HOLD_LONGE (0,30 s). */
    async gesto() {
      window.__A.botao('left', 'squeeze', 1);
      await window.__A.espera(450);
      window.__A.botao('left', 'squeeze', 0);
      await window.__A.espera(180);
    },
    /* o mesmo gesto no botão errado, para provar que ele NÃO vale */
    async gestoNoGatilho() {
      window.__A.botao('left', 'trigger', 1);
      await window.__A.espera(450);
      window.__A.botao('left', 'trigger', 0);
      await window.__A.espera(180);
    },
  };
  window.__keyE = 0;
  window.addEventListener('keydown', e => { if (e.code === 'KeyE') window.__keyE++; });
  return true;
}

describe('interação pela mão em VR (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    await h.play(() => { window.__I.soloDeVerdade(); window.__I.longeDeTudo(); });
    await h.play(() => window.__A.espera(300));
  });
  after(async () => { if (h) await h.close(); });

  it('sem alvo por perto, não há marcador aceso', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      window.__game.Structures.chestSpots.forEach(s => { s.x = 900; s.z = 900; });
      await window.__A.espera(350);
      const m = window.__I.marcador();
      return { existe: !!m, visivel: !!(m && m.visible), estado: window.__game.XRInterage.estado() };
    });
    assert.equal(r.visivel, false, 'o marcador ficou aceso sem nenhum alvo em alcance');
    assert.equal(r.estado.alvo, null, 'a camada de interação inventou um alvo do nada');
  });

  it('com um baú em alcance, aparece marcador 3D EM CIMA do baú (o HUD 2D não existe em VR)', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(1.5);
      window.__I.apontarPara('left', b.esquerda);
      await window.__A.espera(400);
      const m = window.__I.marcador();
      return {
        existe: !!m, visivel: !!(m && m.visible),
        pos: window.__I.marcadorPos(),
        esquerda: b.esquerda, direita: b.direita,
        estado: window.__game.XRInterage.estado(),
      };
    });
    assert.ok(r.existe, 'nenhum objeto 3D de marcação foi criado — em VR o prompt de DOM é invisível');
    assert.equal(r.visivel, true, 'o marcador existe mas está invisível com um baú em alcance');
    assert.ok(r.estado.alvo && /BA[ÚU]/i.test(r.estado.alvo.txt),
      `o alvo escolhido não foi o baú: ${r.estado.alvo && r.estado.alvo.txt}`);
    assert.ok(r.estado.alvo.acionavel, 'o baú está a 1,5 m e a camada marcou como fora de alcance');
    const d = dist(r.pos, r.esquerda);
    assert.ok(d < 0.9, `o marcador ficou a ${d.toFixed(2)} m do baú apontado`);
  });

  it('a MÃO escolhe entre dois baús equivalentes — medido por DIREÇÃO, não por "clicou"', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(1.5);
      window.__I.apontarPara('left', b.esquerda);
      await window.__A.espera(420);
      const esq = window.__I.marcadorPos();
      window.__I.apontarPara('left', b.direita);
      await window.__A.espera(420);
      const dir = window.__I.marcadorPos();
      return { esq, dir, b };
    });
    assert.ok(r.esq && r.dir, 'o marcador sumiu no meio da troca de alvo');
    const dEsq = dist(r.esq, r.b.esquerda);
    const dDir = dist(r.dir, r.b.direita);
    assert.ok(dEsq < 0.9,
      `apontando para a ESQUERDA o marcador ficou a ${dEsq.toFixed(2)} m do baú da esquerda`);
    assert.ok(dDir < 0.9,
      `apontando para a DIREITA o marcador ficou a ${dDir.toFixed(2)} m do baú da direita`);
    assert.ok(dist(r.esq, r.dir) > 1.5,
      'o marcador não se moveu quando a mão trocou de alvo: a direção da mão não está sendo usada');
  });

  it('o gesto da mão de apoio ABRE o baú de verdade', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(1.5);
      window.__I.apontarPara('left', b.esquerda);
      const G = window.__game;
      G.inventory.medkits = 4;
      G.Interact.chest.medkits = 0;
      await window.__A.espera(400);
      const antes = { chest: G.Interact.chest.medkits, inv: G.inventory.medkits };
      await window.__I.gesto();
      await window.__A.espera(250);
      return { antes, depois: { chest: G.Interact.chest.medkits, inv: G.inventory.medkits } };
    });
    assert.equal(r.antes.chest, 0);
    assert.ok(r.depois.chest > r.antes.chest,
      `o gatilho da mão de apoio não guardou nada no baú (${r.antes.chest} → ${r.depois.chest}): a interação não chegou no jogo`);
    assert.ok(r.depois.inv < r.antes.inv, 'o inventário não mudou — o baú não trocou item nenhum');
  });

  it('D3 — o mesmo gesto NO GATILHO não abre o baú (o botão de pegar é o grip)', async () => {
    /* Este é o teste de EFEITO do critério D3. O unitário
       (test/xr-agarrar.test.js) prova a geometria; aqui, dentro da sessão
       imersiva de verdade, prova-se que apertar o botão errado não mexe no
       mundo — VRC.Quest.Input.2: "use the Touch controller's grip button rather
       than the trigger button". */
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(1.5);
      window.__I.apontarPara('left', b.esquerda);
      const G = window.__game;
      G.inventory.medkits = 4;
      G.Interact.chest.medkits = 0;
      await window.__A.espera(400);
      const acionavel = !!(G.XRInterage.estado().alvo || {}).acionavel;
      await window.__I.gestoNoGatilho();
      await window.__A.espera(250);
      const noGatilho = { chest: G.Interact.chest.medkits, inv: G.inventory.medkits };
      await window.__I.gesto();                       // agora no grip
      await window.__A.espera(250);
      return { acionavel, noGatilho, noGrip: { chest: G.Interact.chest.medkits, inv: G.inventory.medkits } };
    });
    assert.equal(r.acionavel, true, 'o cenário não pôs o baú em alcance — o teste mediria o vazio');
    assert.equal(r.noGatilho.chest, 0,
      'o GATILHO abriu o baú: pegar no gatilho é exatamente o que o critério D3 reprova');
    assert.equal(r.noGatilho.inv, 4, 'o gatilho mexeu no inventário');
    assert.ok(r.noGrip.chest > 0,
      'e o GRIP não abriu: o botão certo ficou sem verbo, que é pior que o defeito original');
  });

  it('o gesto emite um KeyboardEvent REAL — é o único caminho que o baú do BR escuta', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(1.5);
      window.__I.apontarPara('left', b.esquerda);
      await window.__A.espera(400);
      window.__keyE = 0;
      await window.__I.gesto();
      await window.__A.espera(220);
      return { eventos: window.__keyE };
    });
    assert.ok(r.eventos >= 1,
      'nenhum keydown de KeyE chegou no window: br-game.js:1828 escuta EVENTO, e escrever direto em justPressed nunca abre o baú do BR');
    assert.ok(r.eventos <= 2, `o gesto disparou ${r.eventos} eventos — um aperto tem que valer um evento`);
  });

  it('FORA do raio de gameplay o gesto não faz nada (o alcance não pode virar vetor de trapaça)', async () => {
    const r = await h.play(async () => {
      window.__I.soloDeVerdade();
      window.__I.longeDeTudo();
      const b = window.__I.plantarBaus(7.5);   // muito além dos 2,4 m de js/interact.js
      window.__I.apontarPara('left', b.esquerda);
      const G = window.__game;
      G.inventory.medkits = 4;
      G.Interact.chest.medkits = 0;
      await window.__A.espera(400);
      const estado = G.XRInterage.estado();
      await window.__I.gesto();
      await window.__A.espera(250);
      return { estado, chest: G.Interact.chest.medkits, inv: G.inventory.medkits };
    });
    assert.equal(r.chest, 0, 'o baú a 7,5 m foi usado: a camada de VR ampliou o alcance do jogo');
    assert.equal(r.inv, 4, 'o inventário mudou com o baú fora de alcance');
    if (r.estado.alvo) {
      assert.equal(r.estado.alvo.acionavel, false,
        'a camada marcou como acionável um alvo que o jogo recusa — o jogador aperta e nada acontece');
    }
  });

  it('sair do VR limpa o marcador da cena (nada de anel flutuante no desktop)', async () => {
    const r = await h.play(async () => {
      await window.__game.XR.exit();
      await new Promise(res => setTimeout(res, 400));
      window.__game.tick(1 / 60);
      const m = window.__I.marcador();
      return { presenting: window.__game.XR.presenting, existe: !!m, visivel: !!(m && m.visible) };
    });
    assert.equal(r.presenting, false, 'a sessão não terminou');
    assert.equal(r.visivel, false, 'o marcador de VR continuou aceso depois de sair da sessão');
  });
});
