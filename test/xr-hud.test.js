/* ================================================================
   QA — O HUD DENTRO DO MUNDO (IWER, sessão imersiva real).

   O QUE ESTÁ SENDO COBRADO. O critério H1 do docs/vr/criterio-aaa.md mediu
   **0 objetos de HUD dentro do mundo**: vida, armadura, munição, arma,
   inventário, zona e feed de abates vivem em `#hud` (index.html), e o DOM não
   é desenhado dentro de uma sessão `immersive-vr`. Todos os testes de HUD do
   repositório leem `innerHTML` e `style.opacity` — continuam certos e
   continuam invisíveis. É o exemplo mais puro de teste que mede o dublê em
   vez do produto, e por isso aqui NADA é lido do DOM.

   O QUE ESTE ARQUIVO MEDE, EM NÚMERO:
   · a munição está na ARMA, e o número que aparece é o `gun.mag` de verdade
     depois de um tiro de verdade (gatilho do Touch, não escrita em variável);
   · o texto tem altura ANGULAR suficiente para ser lido no aparelho — graus,
     não pixels de canvas;
   · os painéis ENCARAM o olho, e o ângulo é medido contra a normal da malha;
   · nada entra no olho (I3): com a arma no rosto durante o ADS, o painel dela
     sai da frente;
   · o painel do pulso está pendurado na PALMA (`gripSpace`), não no raio de
     mira, e a menos de 20 cm dela;
   · custo em draw calls.

   COMO ESTE ARQUIVO EVITA MEDIR A SI MESMO. O módulo ainda não está fiado no
   game.js (o wiring vai no relatório), então o teste instala UM condutor: uma
   cadeia de `session.requestAnimationFrame` que chama `update()` uma vez por
   frame, igual ao wiring. Depois disso o teste só OBSERVA — aperta botão de
   verdade, espera tempo de verdade e lê. E o `ler()` do condutor é o mesmo do
   wiring: lê `player`, `gun` e `inventory` do jogo, sem inventar dado.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3442;
const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function instalarFerramentas() {
  const { createXrHud } = await import('/js/xr/xrhud.js');
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* O MESMO `ler()` do wiring: dado do jogo, nada inventado. */
  const ler = () => {
    const g = G.gun;
    const br = window.__BR_debug && window.__BR_debug.S;
    return {
      oculto: G.state.driving || G.state.flying || !G.state.started,
      /* a mira do jogo: botão OU arma trazida ao olho — é a linha
         `mouse.aiming = cmd.mirar || XRArma.mirando()` do game.js */
      ads: !!G.mouse.aiming,
      vida: MP.player.health / MP.player.maxHealth,
      armadura: MP.player.armor / MP.player.armorMax,
      arma: g ? g.name : '',
      melee: !!(g && g.melee),
      pente: g ? g.mag : 0,
      reserva: g ? g.reserve : 0,
      recarregando: !!(g && g.reloading),
      granadas: G.inventory.nades,
      medkits: G.inventory.medkits,
      abates: 0,
      br: br ? { fase: br.phase, vivos: br.alive, tempo: '', zona: '' } : null,
      feed: [],
    };
  };

  window.__HUD = createXrHud({ THREE: T, ler });

  /* `pausado` existe para o teste conseguir medir a cena SEM o HUD: o
     condutor reanexa por frame (a mão some e volta o tempo todo), então sem
     parar o condutor o `exit()` é desfeito antes da primeira leitura. */
  window.__drv = { frames: 0, pausado: false };
  const passo = () => {
    const s = MP.renderer.xr.getSession && MP.renderer.xr.getSession();
    if (!s) return;
    window.__drv.frames++;
    if (window.__drv.pausado) { s.requestAnimationFrame(passo); return; }
    MP.camera.updateWorldMatrix(true, false);
    window.__HUD.update({
      arma: MP.weaponRoot,
      pulso: G.XR.punho('left') || G.XR.mao('left'),
      cabeca: MP.camera.getWorldPosition(new T.Vector3()),
    });
    s.requestAnimationFrame(passo);
  };
  MP.renderer.xr.getSession().requestAnimationFrame(passo);

  window.__H = {
    estado: () => {
      MP.camera.updateWorldMatrix(true, false);
      return window.__HUD.estado(MP.camera.getWorldPosition(new T.Vector3()));
    },
    naCena: nome => {
      let achou = null;
      MP.scene.traverse(o => { if (o.name === nome) achou = o; });
      return !!achou;
    },
    ler,
    gun: () => ({ mag: G.gun.mag, reserve: G.gun.reserve, name: G.gun.name, melee: !!G.gun.melee }),
    vida: () => MP.player.health,
    setVida: v => { MP.player.health = v; },
    /* distância do painel do pulso à PALMA (`gripSpace`) e ao raio de mira:
       pendurar no espaço errado é o defeito B1 do critério, e a diferença é
       medível — 45° e 5,2 cm no Touch Plus */
    aoPunho: () => {
      const p = window.__HUD.pulso, punho = G.XR.punho('left');
      if (!p || !punho) return null;
      p.updateWorldMatrix(true, false); punho.updateWorldMatrix(true, false);
      return p.getWorldPosition(new T.Vector3())
        .distanceTo(punho.getWorldPosition(new T.Vector3()));
    },
    paiDoPulso: () => {
      const p = window.__HUD.pulso, punho = G.XR.punho('left');
      return !!(p && punho && p.parent === punho);
    },
    paiDaArma: () => {
      const p = window.__HUD.arma;
      return !!(p && p.parent === MP.weaponRoot);
    },
    async tiro() {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(220);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(280);
    },
    async ads(on) {
      window.__A.botao('right', 'squeeze', on ? 1 : 0);
      await window.__A.espera(900);
    },
    /* CUSTO EM DRAW CALLS, POR DIFERENÇA PAREADA. A cena está viva (grama,
       animais, partículas, tracer do tiro anterior) e a contagem oscila vários
       calls entre frames: medir "com" e "sem" em janelas separadas por
       segundos mistura o custo da UI com a deriva do mundo — já deu 0, 6, 8 e
       10 para a mesma UI. Aqui as duas leituras ficam a ~150 ms uma da outra e
       o que sai é a MEDIANA das diferenças, que cancela a deriva. */
    async custo(n) {
      const dif = [];
      const ver = v => {
        window.__drv.pausado = true;   // senão o condutor reescreve visible
        if (window.__HUD.arma) window.__HUD.arma.visible = v;
        if (window.__HUD.pulso) window.__HUD.pulso.visible = v;
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
    /* põe a mão esquerda numa pose de "olhar o pulso", à frente e abaixo do
       rosto — é o gesto que o jogador faz de verdade */
    pulsoNaVista: () => {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      rig.updateWorldMatrix(true, false);
      MP.camera.updateWorldMatrix(true, false);
      const cab = MP.camera.getWorldPosition(new T.Vector3());
      const q = MP.camera.getWorldQuaternion(new T.Quaternion());
      const f = new T.Vector3(0, 0, -1).applyQuaternion(q);
      const alvo = cab.clone().addScaledVector(f, 0.35);
      alvo.y -= 0.20;
      rig.worldToLocal(alvo);
      dev.controllers.left.position.set(alvo.x, alvo.y, alvo.z);
    },
  };
  return true;
}

describe('HUD dentro do mundo em VR (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    await h.play(() => window.__A.espera(600));
  });
  after(async () => { if (h) await h.close(); });

  it('o HUD existe DENTRO do mundo — não no DOM, que a sessão não desenha', async () => {
    const r = await h.play(() => ({
      frames: window.__drv.frames,
      arma: window.__H.naCena('xrHudArma'),
      pulso: window.__H.naCena('xrHudPulso'),
      e: window.__H.estado(),
    }));
    assert.ok(r.frames > 5, `o condutor não rodou (${r.frames} frames) — sem frame não há medida`);
    assert.equal(r.arma, true, 'o painel de munição não está no grafo da cena');
    assert.equal(r.pulso, true, 'o painel do pulso não está no grafo da cena');
    assert.equal(r.e.visivel.arma, true, 'o painel da arma nasceu invisível');
  });

  it('a munição está NA ARMA, e o painel do pulso na PALMA (gripSpace, não no raio de mira)', async () => {
    const r = await h.play(() => ({
      paiDaArma: window.__H.paiDaArma(),
      paiDoPulso: window.__H.paiDoPulso(),
      aoPunho: window.__H.aoPunho(),
      e: window.__H.estado(),
    }));
    assert.equal(r.paiDaArma, true, 'o painel de munição não é filho do weaponRoot');
    assert.equal(r.paiDoPulso, true,
      'o painel do pulso não está pendurado no gripSpace — pendurar no targetRaySpace erra 45° e 5,2 cm (B1)');
    assert.ok(r.aoPunho !== null && r.aoPunho <= 0.20,
      `o painel do pulso está a ${(r.aoPunho * 100).toFixed(1)} cm da palma — não é um painel de pulso`);
    console.log(`      painel do pulso a ${(r.aoPunho * 100).toFixed(1)} cm da palma`);
  });

  it('dá para LER: o texto passa de 1° de altura angular, à distância medida', async () => {
    const r = await h.play(async () => {
      window.__H.pulsoNaVista();
      await window.__A.espera(500);
      return window.__H.estado();
    });
    for (const chave of ['arma', 'pulso']) {
      const p = r[chave];
      console.log(`      ${chave}: ${p.distancia.toFixed(2)} m · painel ${p.grausH.toFixed(1)}° × ${p.grausV.toFixed(1)}°` +
        ` · texto ${p.grausTexto.toFixed(2)}° · encara o olho a ${p.anguloEncara.toFixed(1)}°`);
      /* 0,7° é o alvo em que Microsoft (tipografia em MR) e Android XR
         convergem; 0,35–0,4° é o piso absoluto. O limiar do teste é o ALVO,
         não o piso — ver docs/vr/referencia-ui.md §3.3. */
      assert.ok(p.grausTexto >= 0.7,
        `${chave}: texto com ${p.grausTexto.toFixed(2)}° — abaixo do alvo de 0,7° de altura angular`);
      assert.ok(p.anguloEncara <= 12,
        `${chave}: a normal do painel está ${p.anguloEncara.toFixed(1)}° fora do olho — lido de esguelha`);
      assert.ok(p.distancia >= 0.22,
        `${chave}: a ${p.distancia.toFixed(2)} m do olho — I3 proíbe geometria a menos de 0,15 m`);
    }
  });

  it('o número que aparece é o pente de VERDADE: um tiro do Touch muda os dois', async () => {
    const r = await h.play(async () => {
      const antes = window.__H.gun();
      const assinAntes = window.__H.estado().arma.assinatura;
      await window.__H.tiro();
      await window.__A.espera(300);
      return { antes, depois: window.__H.gun(), assinAntes, assinDepois: window.__H.estado().arma.assinatura };
    });
    assert.ok(r.depois.mag < r.antes.mag,
      `o tiro não saiu (pente ${r.antes.mag} → ${r.depois.mag}) — sem tiro não há o que medir`);
    assert.notEqual(r.assinDepois, r.assinAntes, 'o painel não redesenhou depois do tiro');
    assert.ok(r.assinDepois.startsWith(String(r.depois.mag) + '|'),
      `o painel mostra "${r.assinDepois.split('|')[0]}" e o pente tem ${r.depois.mag}`);
    console.log(`      pente ${r.antes.mag} → ${r.depois.mag}, e o painel acompanhou`);
  });

  it('a vida do jogador aparece no painel da arma', async () => {
    const r = await h.play(async () => {
      const cheia = window.__H.estado().arma.assinatura;
      window.__H.setVida(37);
      await window.__A.espera(400);
      /* a vida REGENERA sozinha neste jogo: ler o painel e o jogador no mesmo
         instante é a única comparação honesta */
      const ferido = window.__H.estado().arma.assinatura;
      const vidaAgora = Math.round(window.__H.ler().vida * 100);
      window.__H.setVida(100);
      await window.__A.espera(500);
      return { cheia, ferido, vidaAgora, volta: window.__H.estado().arma.assinatura };
    });
    assert.notEqual(r.ferido, r.cheia, 'levar a vida a 37 não mudou o painel');
    const noPainel = Number(r.ferido.split('|')[3]);
    assert.ok(Math.abs(noPainel - r.vidaAgora) <= 1,
      `o painel mostra ${noPainel}% de vida e o jogador tem ${r.vidaAgora}%`);
    assert.equal(r.volta, r.cheia, 'a vida cheia não voltou ao painel');
    console.log(`      vida ${r.vidaAgora}% no jogador, ${noPainel}% no painel da arma`);
  });

  it('mirando, o painel da arma SAI da frente — nada atravessa o olho (I3)', async () => {
    const r = await h.play(async () => {
      await window.__H.ads(true);
      const mirando = { e: window.__H.estado(), ads: window.__H.ler().ads };
      await window.__H.ads(false);
      await window.__A.espera(400);
      return { mirando, solto: window.__H.estado() };
    });
    assert.equal(r.mirando.ads, true, 'o botão de mira não acendeu o ADS — o cenário não aconteceu');
    assert.equal(r.mirando.e.visivel.arma, false,
      'o painel de munição continuou aceso com a arma no rosto — geometria dentro do olho (I3)');
    assert.equal(r.solto.visivel.arma, true, 'soltar a mira não devolveu o painel de munição');
  });

  it('o HUD inteiro custa poucas draw calls', async () => {
    const r = await h.play(async () => {
      const dif = await window.__H.custo(9);
      /* A PROVA DE QUE O TESTE NÃO ESTÁ CEGO. Com a fiação aplicada, o game.js
         chama `update()` todo frame e remonta o HUD no frame seguinte a
         qualquer `exit()` — desligar e conferir "sumiu?" vira corrida perdida
         contra o próprio produto. O que continua determinístico é o efeito
         VISÍVEL: o HUD some no ADS e some quando a arma encosta no olho, por
         desenho. Se `visivel` não responder a isso, a medida de custo acima
         está medindo outra coisa. */
      const visDe = () => window.__H.estado().visivel;
      const antesADS = visDe();
      window.__A.botao('right', 'squeeze', 1);
      await window.__A.espera(400);
      const durADS = visDe();
      window.__A.solta();
      await window.__A.espera(400);
      const foraDaCena = !!antesADS.arma && !durADS.arma;
      return { dif, foraDaCena, antesADS, durADS };
    });
    const custo = mediana(r.dif);
    console.log(`      custo do HUD em draw calls (estéreo, diferença pareada): ${custo}  [${r.dif.join(' ')}]`);
    assert.equal(r.foraDaCena, true,
      `o HUD da arma não reagiu ao ADS (antes ${JSON.stringify(r.antesADS)}, ` +
      `durante ${JSON.stringify(r.durADS)}) — sem reação, a medida de custo acima é cega`);
    /* 4 = 2 painéis × 2 olhos. A banda existe porque a diferença pareada tem
       ±2 de ruído; o TETO em 4 é o que pega a regressão que já aconteceu aqui:
       com `side: DoubleSide` o three desenha material transparente em dois
       passes e o custo vai a 8. */
    assert.ok(custo >= 2 && custo <= 4,
      `o HUD custou ${custo} draw calls — o esperado é 4 (2 painéis × 2 olhos)`);
  });

  it('depois do exit() o HUD volta sozinho no frame seguinte (a mão some e volta o tempo todo)', async () => {
    /* O controle some e volta o tempo todo (dormiu, saiu do campo de rastreio),
       e com ele o pai do painel do pulso. Remontar tem que ser barato e
       automático — e é o game.js quem chama `update()` todo frame. */
    const r = await h.play(async () => {
      window.__HUD.exit();
      await window.__A.espera(500);
      return { arma: window.__H.naCena('xrHudArma'), pulso: window.__H.naCena('xrHudPulso'), e: window.__H.estado() };
    });
    assert.equal(r.arma, true, 'o painel da arma não voltou depois do exit()');
    assert.equal(r.pulso, true, 'o painel do pulso não voltou depois do exit()');
    assert.equal(r.e.visivel.arma, true, 'o painel voltou apagado');
  });

  it('sem erro de console durante a sessão inteira (I2)', async () => {
    assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
    assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
  });
});
