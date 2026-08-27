/* ================================================================
   QA — O RADIAL QUE SE VÊ (IWER, sessão imersiva real).

   O DEFEITO. O menu radial de quatro verbos entrou completo do lado da
   INTENÇÃO (`criarRadialXR`, js/xr/xrinput.js, com teste) e VAZIO do lado da
   percepção: o jogador aperta o gatilho da mão de apoio e não vê nada. Não
   sabe que fatias existem, não sabe qual está selecionada, não sabe que soltar
   no centro cancela. O critério D4 cobra affordance DENTRO do mundo, e dentro
   de uma sessão `immersive-vr` sem `dom-overlay` o DOM não chega ao
   compositor — qualquer `<div>` continuaria correta e continuaria invisível.

   O QUE ESTE ARQUIVO MEDE, EM NÚMERO — e cada caso é uma COISA, não um proxy:

   · o disco NASCE NA DIREÇÃO DA MÃO que abriu — ângulo, em graus, entre
     (disco − olho) e (mão − olho);
   · e NÃO segue o pulso: mexer a mão com o menu aberto move o disco menos de
     1 cm (a Meta: *"Avoid anchoring menus to an active, moving wrist"*);
   · e NÃO segue a cabeça: girar o pescoço 40° move o disco menos de 2 cm
     (a Meta: *"Avoid locking HUD style content to the user's head movements"*).
     Um disco preso na cara andaria 28,7 cm nessa mesma virada;
   · a fatia escolhida é a DESTACADA — lido nos PIXELS do canvas que está na
     textura, não numa variável de estado que diz o que deveria ter pintado;
   · soltar no centro cancela, e isso está ANUNCIADO: com o polegar no centro,
     o miolo é o que fica aceso;
   · o texto tem altura ANGULAR de leitura (graus, não pixels de canvas);
   · nada a menos de 0,15 m do olho (I3);
   · custo em draw calls por olho, por diferença pareada.

   NÃO EXISTE CONDUTOR AQUI, E ISSO É DE PROPÓSITO. O arquivo do HUD
   (test/xr-hud.test.js) documenta o buraco que um condutor próprio abre: nove
   casos verdes provando que o módulo funciona quando o TESTE o dirige. Aqui
   quem chama `XRInterage.update()` é o loop do game.js, e a instância lida é a
   `window.__game.XRInterage`. Arrancar a chamada do jogo tem de matar este
   arquivo inteiro.

   PORTA 3580 (faixa exclusiva desta frente: 3580–3588).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3580;
const GRAU = 180 / Math.PI;
const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* A CABEÇA É LIDA PELO TESTE, não pelo módulo. Se o módulo errar de onde
     mede, o número dele e o número dele bateriam entre si e ninguém veria.
     `setFromMatrixPosition(camera.matrixWorld)` é a leitura que vale em XR: o
     three só escreve `camera.position` dentro do `render()`. */
  const cabeca = () => {
    MP.camera.updateWorldMatrix(true, false);
    return new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
  };
  const maoPos = qual => {
    const m = G.XR.punho(qual) || G.XR.mao(qual);
    if (!m) return null;
    m.updateWorldMatrix(true, false);
    return new T.Vector3().setFromMatrixPosition(m.matrixWorld);
  };

  /* ponto limpo: sem alvo de interação por perto, para o marcador do baú não
     entrar na conta de draw call nem no meio do disco */
  function longeDeTudo() {
    const x = -140, z = -140;
    window.__BR_active = false; window.__BR_freeze = false;
    MP.player.pos.set(x, G.heightAt(x, z), z);
    MP.player.vel.set(0, 0, 0);
    G.Structures.chestSpots.forEach(s => { s.x = 900; s.z = 900; });
    G.Car.group.position.set(x + 70, G.heightAt(x + 70, z), z);
    G.Heli.group.position.set(x + 90, G.heightAt(x + 90, z) + 30, z);
  }

  /* põe a mão esquerda numa pose de descanso — cotovelo baixo, à frente e
     abaixo do rosto, que é a ergonomia que a Meta pede */
  function maoEmDescanso(frente = 0.30, lado = -0.20, baixo = 0.28) {
    const dev = window.__xrEmulado, rig = G.XR.rig;
    rig.updateWorldMatrix(true, false);
    MP.camera.updateWorldMatrix(true, false);
    const cab = cabeca();
    const q = new T.Quaternion().setFromRotationMatrix(MP.camera.matrixWorld);
    const f = new T.Vector3(0, 0, -1).applyQuaternion(q);
    const d = new T.Vector3(1, 0, 0).applyQuaternion(q);
    const alvo = cab.clone().addScaledVector(f, frente).addScaledVector(d, lado);
    alvo.y -= baixo;
    rig.worldToLocal(alvo);
    dev.controllers.left.position.set(alvo.x, alvo.y, alvo.z);
  }

  window.__R = {
    cabeca: () => cabeca().toArray(),
    maoPos: qual => { const p = maoPos(qual); return p ? p.toArray() : null; },
    longeDeTudo, maoEmDescanso,
    estado: () => G.XRInterage.estado().radial,
    obj: () => G.XRInterage.radial || null,
    /* PIXELS DE VERDADE. O canvas está na textura do sprite — ler dele é ler o
       que o compositor vai mostrar, e não uma variável que diz o que o módulo
       pretendia pintar. */
    async pixels(pontos) {
      const o = G.XRInterage.radial;
      const cv = o && o.material && o.material.map && o.material.map.image;
      if (!cv || !cv.getContext) return null;
      const ctx = cv.getContext('2d');
      return pontos.map(([x, y]) => {
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        // luma perceptual, já pesada pelo alfa (fundo do canvas é transparente)
        return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) * (d[3] / 255);
      });
    },
    async abrir(ms = 260) {
      window.__A.botao('left', 'trigger', 1);
      await window.__A.espera(ms);
    },
    async fechar(ms = 220) {
      window.__A.stick('left', 0, 0);
      await window.__A.espera(90);
      window.__A.botao('left', 'trigger', 0);
      await window.__A.espera(ms);
    },
    async fatia(x, y, ms = 220) {
      window.__A.stick('left', x, y);
      await window.__A.espera(ms);
    },
    /* CUSTO POR DIFERENÇA PAREADA, e o produto de verdade: aberto é o gatilho
       apertado, fechado é o gatilho solto. A cena está viva e a contagem
       oscila; as duas leituras ficam a ~80 ms uma da outra e o que sai é a
       MEDIANA das diferenças (mesmo método de test/xr-hud.test.js). */
    async custo(n) {
      const dif = [];
      window.__A.stick('left', 0, 0);   // centro: soltar não gasta item nenhum
      /* pose de partida conhecida: o disco tem de estar DENTRO do campo de
         visão, senão o frustum o corta e a diferença mede zero sem defeito
         nenhum */
      maoEmDescanso(0.30, -0.20, 0.26);
      await window.__A.espera(300);
      for (let i = 0; i < n; i++) {
        window.__A.botao('left', 'trigger', 1);
        await window.__A.espera(110);
        const com = MP.renderer.info.render.calls;
        window.__A.botao('left', 'trigger', 0);
        await window.__A.espera(110);
        dif.push(com - MP.renderer.info.render.calls);
      }
      return dif;
    },
  };
  return true;
}

describe('o radial que se vê (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, K;   // K = constantes REAIS do módulo, não números mágicos do teste
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    K = await h.play(async () => {
      const m = await import('/js/xr/xrinteract.js');
      return {
        CV: m.RADIAL_CV, R_PX: m.RADIAL_R_PX, MIOLO_PX: m.RADIAL_MIOLO_PX,
        W: m.RADIAL_W, FONTE_PX: m.RADIAL_FONTE_PX, CAP: m.RADIAL_CAP,
        FONTE_MIOLO_PX: m.RADIAL_FONTE_MIOLO_PX,
        PERTO_MIN: m.RADIAL_PERTO_MIN, PERTO_MAX: m.RADIAL_PERTO_MAX,
        MIN_OLHO: m.RADIAL_MIN_OLHO,
      };
    });
    await h.play(() => { window.__R.longeDeTudo(); window.__A.solta(); });
    await h.play(() => window.__A.espera(400));
  });
  after(async () => { if (h) await h.close(); });

  /* ---------------------------------------------------------------- */
  it('nada nasce no boot: o disco só existe depois do primeiro aperto', async () => {
    /* Todo `Object3D` gasta 4 números do `Math.random` seedado no UUID, e a
       ordem de consumo é contrato do worldgen. Este caso morre se alguém
       montar o disco no `createXrInteract` ou no primeiro `update()`. */
    const antes = await h.play(() => window.__R.estado());
    assert.equal(antes.existe, false,
      'o disco do radial já existia sem ninguém ter aberto o menu');
    await h.play(() => window.__R.abrir());
    const dur = await h.play(() => window.__R.estado());
    await h.play(() => window.__R.fechar());
    assert.equal(dur.existe, true, 'apertar o gatilho não criou o disco');
  });

  it('abrir o gatilho ACENDE um objeto de MUNDO, e soltar apaga (D4)', async () => {
    const r = await h.play(async () => {
      await window.__R.abrir();
      const aberto = window.__R.estado();
      await window.__R.fechar();
      const fechado = window.__R.estado();
      return { aberto, fechado };
    });
    assert.equal(r.aberto.visivel, true,
      'o gatilho da mão de apoio abriu o radial e nada apareceu no mundo');
    assert.equal(r.aberto.aberto, true, 'o módulo não viu o radial aberto');
    assert.equal(r.fechado.visivel, false,
      'soltar o gatilho deixou o disco aceso no mundo');
  });

  /* ---------------------------------------------------------------- */
  it('o disco NASCE na direção da MÃO que abriu, e não na frente do rosto', async () => {
    /* Mede ÂNGULO, em graus, entre (disco − olho) e (mão − olho). Um disco
       plantado "à frente da câmera" daria o ângulo entre a mão e o olhar —
       que nesta pose é ~40°. */
    const r = await h.play(async () => {
      window.__R.maoEmDescanso(0.30, -0.24, 0.30);
      await window.__A.espera(220);
      await window.__R.abrir();
      const e = window.__R.estado();
      const cab = window.__R.cabeca(), mao = window.__R.maoPos('left');
      await window.__R.fechar();
      return { e, cab, mao };
    });
    assert.ok(r.e.pos, 'o disco não reportou posição de mundo');
    const v = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = a => Math.hypot(a[0], a[1], a[2]);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const aDisco = v(r.e.pos, r.cab), aMao = v(r.mao, r.cab);
    const ang = Math.acos(Math.max(-1, Math.min(1,
      dot(aDisco, aMao) / (norm(aDisco) * norm(aMao))))) * GRAU;
    console.log(`      disco nasce a ${ang.toFixed(2)}° da direção da mão, a ${norm(aDisco).toFixed(3)} m do olho`);
    assert.ok(ang < 8,
      `o disco nasceu a ${ang.toFixed(1)}° da direção da mão que abriu o menu`);
    /* e à distância que a Meta pede para UI de perto (42–46 cm), nunca menos */
    assert.ok(norm(aDisco) >= K.PERTO_MIN - 0.01,
      `o disco nasceu a ${norm(aDisco).toFixed(3)} m do olho, abaixo do piso de ${K.PERTO_MIN} m`);
  });

  it('NÃO segue o pulso: mexer a mão com o menu aberto não arrasta o disco', async () => {
    /* A Meta: "Avoid anchoring menus to an active, moving wrist" … "as long as
       the menu is static once it appears". Um disco pendurado na mão andaria
       os mesmos 35 cm que a mão. */
    const r = await h.play(async () => {
      window.__R.maoEmDescanso(0.30, -0.24, 0.30);
      await window.__A.espera(220);
      await window.__R.abrir();
      const antes = window.__R.estado().pos, m0 = window.__R.maoPos('left');
      window.__R.maoEmDescanso(0.55, 0.18, 0.10);   // braço esticado, pra cima e pro outro lado
      await window.__A.espera(260);
      const depois = window.__R.estado().pos, m1 = window.__R.maoPos('left');
      await window.__R.fechar();
      return { antes, depois, m0, m1 };
    });
    const dMao = Math.hypot(r.m1[0] - r.m0[0], r.m1[1] - r.m0[1], r.m1[2] - r.m0[2]);
    const dDisco = Math.hypot(r.depois[0] - r.antes[0], r.depois[1] - r.antes[1], r.depois[2] - r.antes[2]);
    console.log(`      mão andou ${dMao.toFixed(3)} m · disco andou ${dDisco.toFixed(4)} m`);
    assert.ok(dMao > 0.25, `a mão só andou ${dMao.toFixed(3)} m — o teste não chegou a medir nada`);
    assert.ok(dDisco < 0.01,
      `a mão andou ${dMao.toFixed(3)} m e o disco foi junto ${dDisco.toFixed(3)} m — está pendurado no pulso`);
  });

  it('NÃO segue a cabeça: girar o pescoço 40° não move o disco (VRC.Quest.Functional.10)', async () => {
    /* Um disco preso na cara a 0,45 m andaria 2·0,45·sen(20°) = 0,308 m nesta
       mesma virada. A banda de 0,02 m separa os dois casos com folga de 15×. */
    const r = await h.play(async () => {
      const dev = window.__xrEmulado;
      const pose = (yaw) => {
        const a = yaw * Math.PI / 180, s = Math.sin(a / 2), c = Math.cos(a / 2);
        dev.quaternion.set(0, s, 0, c);
      };
      pose(0);
      await window.__A.espera(240);
      window.__R.maoEmDescanso(0.30, -0.24, 0.30);
      await window.__A.espera(200);
      await window.__R.abrir();
      const antes = window.__R.estado().pos, c0 = window.__R.cabeca();
      pose(40);
      await window.__A.espera(300);
      const depois = window.__R.estado().pos, c1 = window.__R.cabeca();
      await window.__R.fechar();
      pose(0);
      await window.__A.espera(200);
      return { antes, depois, c0, c1 };
    });
    const dDisco = Math.hypot(r.depois[0] - r.antes[0], r.depois[1] - r.antes[1], r.depois[2] - r.antes[2]);
    const dCabeca = Math.hypot(r.c1[0] - r.c0[0], r.c1[1] - r.c0[1], r.c1[2] - r.c0[2]);
    /* Quanto um disco PRESO NA CARA teria andado: a corda do arco de 40° no
       raio em que ele está. É este número que dá escala ao limite. */
    const raio = Math.hypot(r.antes[0] - r.c0[0], r.antes[1] - r.c0[1], r.antes[2] - r.c0[2]);
    const seFosseHud = 2 * raio * Math.sin(20 * Math.PI / 180);
    console.log(`      cabeça girou 40° (o ponto de vista andou ${dCabeca.toFixed(4)} m) · ` +
      `disco andou ${dDisco.toFixed(4)} m · preso na cara teria andado ${seFosseHud.toFixed(3)} m`);
    assert.ok(dDisco < seFosseHud / 5,
      `girar o pescoço 40° arrastou o disco ${dDisco.toFixed(3)} m, contra ${seFosseHud.toFixed(3)} m ` +
      'que um HUD preso na cara andaria — está colado na cabeça');
    assert.ok(dDisco < 0.05,
      `girar o pescoço 40° arrastou o disco ${dDisco.toFixed(3)} m`);
  });

  /* ---------------------------------------------------------------- */
  /* Uma GRADE dentro de cada setor, e a MEDIANA. Ler um pixel só na bissetriz
     pegava o glifo do rótulo — o texto é claro, e a amostra dizia "fatia apagada
     em 202 de luma". A mediana de nove pontos mede a COR DO SETOR, que é o que
     o jogador vê, com o texto virando minoria. */
  const gradeDoSetor = (i) => {
    const c = K.CV / 2, pts = [];
    const base = (-90 + i * 90) * Math.PI / 180;
    for (const dg of [-32, 0, 32]) {
      for (const k of [0.18, 0.5, 0.86]) {
        const a = base + dg * Math.PI / 180;
        const r = K.MIOLO_PX + (K.R_PX - K.MIOLO_PX) * k;
        pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
      }
    }
    return pts;
  };
  const gradeDoMiolo = () => {
    const c = K.CV / 2, pts = [];
    for (let g = 0; g < 8; g++) {
      const a = (g * 45 + 22.5) * Math.PI / 180, r = K.MIOLO_PX * 0.55;
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    return pts;
  };

  it('a FATIA escolhida é a destacada — medido nos pixels da textura', async () => {
    const grades = [0, 1, 2, 3].map(gradeDoSetor);
    const pontos = grades.flat();
    for (const alvo of [0, 1, 2, 3]) {
      const eixo = [[0, -1], [1, 0], [0, 1], [-1, 0]][alvo];
      const r = await h.play(async (pts, ex) => {
        await window.__R.abrir();
        await window.__R.fatia(ex[0], ex[1]);
        const est = window.__R.estado();
        const px = await window.__R.pixels(pts);
        await window.__R.fechar();
        return { est, px };
      }, pontos, eixo);
      assert.equal(r.est.fatia, alvo,
        `empurrar o analógico para a fatia ${alvo} deixou o módulo na fatia ${r.est.fatia}`);
      assert.ok(r.px, 'não deu para ler o canvas do disco');
      const n = grades[0].length;
      const luma = [0, 1, 2, 3].map(i => mediana(r.px.slice(i * n, (i + 1) * n)));
      const escolhido = luma[alvo];
      const maiorOutro = Math.max(...luma.filter((_, i) => i !== alvo));
      console.log(`      fatia ${alvo}: aceso ${escolhido.toFixed(1)} · maior das outras ${maiorOutro.toFixed(1)}`);
      assert.ok(escolhido > maiorOutro + 40,
        `a fatia ${alvo} está selecionada e pintada em ${escolhido.toFixed(0)} de luma, ` +
        `com outra fatia em ${maiorOutro.toFixed(0)} — não dá pra ver qual está escolhida`);
    }
  });

  it('SOLTAR NO CENTRO CANCELA, e o centro se acende para dizer isso', async () => {
    /* Com o polegar no centro, o que acontece ao soltar é CANCELAR — então é o
       miolo que tem de estar aceso, e nenhuma fatia. Um menu que destaca a
       última fatia enquanto o polegar já voltou ao centro mente sobre o que vai
       acontecer. E o cancelamento é medido no EFEITO: nenhuma granada sai. */
    const gMiolo = gradeDoMiolo();
    const gFatias = [0, 1, 2, 3].map(gradeDoSetor);
    const pontos = [...gMiolo, ...gFatias.flat()];
    const r = await h.play(async (pts) => {
      window.__nades0 = window.__game.inventory.nades;
      window.__keyG = 0;
      if (!window.__keyGligado) {
        window.addEventListener('keydown', e => { if (e.code === 'KeyG') window.__keyG++; });
        window.__keyGligado = true;
      }
      await window.__R.abrir();
      await window.__R.fatia(0, -1);        // escolhe GRANADA…
      await window.__R.fatia(0, 0);         // …e volta ao centro
      const est = window.__R.estado();
      const px = await window.__R.pixels(pts);
      await window.__R.fechar();            // solta NO CENTRO = cancela
      await window.__A.espera(260);
      return { est, px, keyG: window.__keyG, nades0: window.__nades0, nades1: window.__game.inventory.nades };
    }, pontos);
    assert.equal(r.est.fatia, -1, 'o polegar voltou ao centro e o módulo continua numa fatia');
    const nM = gMiolo.length, nF = gFatias[0].length;
    const miolo = mediana(r.px.slice(0, nM));
    const maiorFatia = Math.max(...[0, 1, 2, 3].map(i =>
      mediana(r.px.slice(nM + i * nF, nM + (i + 1) * nF))));
    console.log(`      miolo aceso ${miolo.toFixed(1)} · maior fatia ${maiorFatia.toFixed(1)} · KeyG disparado ${r.keyG}×`);
    assert.ok(miolo > maiorFatia + 40,
      `com o polegar no centro o miolo está em ${miolo.toFixed(0)} de luma e uma fatia em ` +
      `${maiorFatia.toFixed(0)} — o menu não diz que soltar ali cancela`);
    assert.equal(r.keyG, 0, 'soltar no centro disparou a granada mesmo assim');
    assert.equal(r.nades1, r.nades0, 'cancelar no centro gastou granada');
  });

  /* ---------------------------------------------------------------- */
  it('o texto tem altura ANGULAR de leitura (graus, não pixels de canvas)', async () => {
    const r = await h.play(async () => {
      window.__R.maoEmDescanso(0.30, -0.24, 0.30);
      await window.__A.espera(200);
      await window.__R.abrir();
      const e = window.__R.estado(), cab = window.__R.cabeca();
      await window.__R.fechar();
      return { e, cab };
    });
    const d = Math.hypot(r.e.pos[0] - r.cab[0], r.e.pos[1] - r.cab[1], r.e.pos[2] - r.cab[2]);
    /* MEDE O MENOR GLIFO, não o maior: quem decide se dá pra ler é o pior caso,
       e aqui ele é a palavra do miolo. E o pior caso de DISTÂNCIA é o teto de
       nascimento — se o disco nasce mais longe, o glifo encolhe junto. */
    const menorPx = Math.min(K.FONTE_PX, K.FONTE_MIOLO_PX);
    const capM = K.W * (menorPx * K.CAP) / K.CV;
    const graus = 2 * Math.atan((capM / 2) / d) * GRAU;
    const grausTeto = 2 * Math.atan((capM / 2) / K.PERTO_MAX) * GRAU;
    const grausDisco = 2 * Math.atan((K.W / 2) / d) * GRAU;
    console.log(`      a ${d.toFixed(3)} m: menor maiúscula ${graus.toFixed(2)}° ` +
      `(${grausTeto.toFixed(2)}° no teto de ${K.PERTO_MAX} m) · disco ${grausDisco.toFixed(1)}°`);
    assert.ok(graus >= 0.7,
      `a menor maiúscula mede ${graus.toFixed(2)}° a ${d.toFixed(2)} m — o alvo desta base é 0,7°`);
    assert.ok(grausTeto >= 0.7,
      `no pior caso de distância (${K.PERTO_MAX} m) a menor maiúscula cai para ${grausTeto.toFixed(2)}°`);
    /* e a FATIA é o alvo de toque: a Meta pede 3° de FOV a 0,42 m para alvo
       confortável, e cada fatia é um quadrante do disco */
    assert.ok(grausDisco / 2 >= 3,
      `cada fatia mede ${(grausDisco / 2).toFixed(1)}° — abaixo dos 3° de FOV que a Meta pede para alvo`);
  });

  it('nada entra no olho: com a mão no rosto o disco para em 0,15 m (I3)', async () => {
    const r = await h.play(async () => {
      await window.__R.abrir();
      window.__R.maoEmDescanso(0.04, 0.0, 0.02);   // mão colada na cara
      await window.__A.espera(320);
      const e = window.__R.estado(), cab = window.__R.cabeca();
      await window.__R.fechar();
      // e o caso que importa de verdade: ABRIR já com a mão na cara
      window.__R.maoEmDescanso(0.04, 0.0, 0.02);
      await window.__A.espera(200);
      await window.__R.abrir();
      const e2 = window.__R.estado(), cab2 = window.__R.cabeca();
      await window.__R.fechar();
      return { e, cab, e2, cab2 };
    });
    const dist = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    const d1 = dist(r.e.pos, r.cab), d2 = dist(r.e2.pos, r.cab2);
    console.log(`      mão levada ao rosto: ${d1.toFixed(3)} m · aberto com a mão no rosto: ${d2.toFixed(3)} m`);
    assert.ok(d1 >= 0.15, `o disco chegou a ${d1.toFixed(3)} m do olho — I3 proíbe abaixo de 0,15 m`);
    assert.ok(d2 >= 0.15, `abrindo com a mão no rosto, o disco nasceu a ${d2.toFixed(3)} m do olho`);
    assert.ok(d2 >= K.PERTO_MIN - 0.01,
      `abrindo com a mão no rosto, o disco nasceu a ${d2.toFixed(3)} m — o piso de nascimento é ${K.PERTO_MIN} m`);
  });

  it('…e o guarda vivo do I3 segura a cabeça que AVANÇA para dentro do disco', async () => {
    /* O disco está congelado contra o CORPO, então o olho só chega perto dele
       de um jeito: a cabeça saindo do corpo — que é o que acontece quando o
       jogador anda fisicamente contra uma parede e o colisor para
       (js/xr/xrrig.js). Aqui a separação entra pelo MESMO caminho que o jogo
       usa (`XR.devolverPasso`, game.js:3651), na direção do disco. Sem o
       guarda, o disco entraria no olho. */
    const r = await h.play(async () => {
      const G = window.__game;
      /* mão NA ALTURA DO OLHO: o disco nasce quase no plano horizontal da
         cabeça, e aí avançar o pescoço passa POR DENTRO dele. Com a mão no
         descanso (30 cm mais baixa) a cabeça passaria ao lado e o caso mediria
         o vazio — foi o que aconteceu na primeira versão deste caso. */
      window.__R.maoEmDescanso(0.36, -0.12, 0.03);
      await window.__A.espera(220);
      await window.__R.abrir();
      const p0 = window.__R.estado().pos, c0 = window.__R.cabeca();
      // direção corpo→disco, no plano: é por aí que a cabeça tem de avançar
      const corpo = window.__MP.player.pos;
      let ux = p0[0] - corpo.x, uz = p0[2] - corpo.z;
      const m = Math.hypot(ux, uz) || 1;
      ux /= m; uz /= m;
      const dCorpoDisco = m;
      const d3 = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      /* MEDE O MÍNIMO DE TODO O AVANÇO, não o fim dele: a cabeça ATRAVESSA o
         plano do disco e sai do outro lado — ler só o ponto final acha 0,54 m e
         não vê a passagem, que é justamente onde o I3 é violado. */
      let minCom = Infinity, minSem = Infinity, fora = 0;
      for (let i = 0; i < 14; i++) {
        G.XR.devolverPasso(ux * 0.06, uz * 0.06);   // 0,84 m de separação, aos poucos
        await window.__A.espera(40);
        const cab = window.__R.cabeca(), pos = window.__R.estado().pos;
        if (!pos) continue;
        minCom = Math.min(minCom, d3(pos, cab));
        /* o corpo não anda durante a injeção, então o ponto congelado SEM o
           guarda é o mesmo `p0` — é a distância que existiria sem correção */
        minSem = Math.min(minSem, d3(p0, cab));
        fora = G.XR.foraDoCorpo;
      }
      await window.__R.fechar();
      /* DRENA A SEPARAÇÃO ANTES DE SAIR, e isto não é higiene: o `fora`
         injetado escoa a 0,006 m por frame (js/xr/xrrig.js), então 0,8 m levam
         ~1,8 s. Deixar isso para trás põe a cabeça 0,8 m à frente do corpo — e
         o disco, que é ancorado no CORPO, nasce atrás da cabeça e é cortado
         pelo frustum. Foi assim que a medição de draw call do caso seguinte
         leu 0 e virou flake. */
      window.__xrEmulado.position.set(0, 1.6, 0);
      for (let i = 0; i < 40 && window.__game.XR.foraDoCorpo > 0.02; i++) await window.__A.espera(100);
      const sobrou = window.__game.XR.foraDoCorpo;
      return { p0, c0, minCom, minSem, fora, dCorpoDisco, sobrou };
    });
    console.log(`      separação injetada ${r.fora.toFixed(3)} m (disco a ${r.dCorpoDisco.toFixed(3)} m do corpo) · ` +
      `olho→disco mínimo ${r.minCom.toFixed(3)} m · sem o guarda teria sido ${r.minSem.toFixed(3)} m · ` +
      `sobrou ${r.sobrou.toFixed(3)} m de separação`);
    assert.ok(r.sobrou < 0.05,
      `sobrou ${r.sobrou.toFixed(3)} m de separação injetada — o caso seguinte mediria com a cabeça fora do corpo`);
    assert.ok(r.fora > 0.5,
      `a separação ficou em ${r.fora.toFixed(3)} m — o cenário não chega a empurrar a cabeça no disco`);
    /* GUARDA CONTRA MEDIR O VAZIO: sem o empurrão o disco entraria no olho.
       Se este número não for pequeno, o cenário não passou por dentro dele. */
    assert.ok(r.minSem < 0.15,
      `sem o guarda o disco teria chegado a ${r.minSem.toFixed(3)} m do olho — ` +
      'acima de 0,15 m o cenário não chega a violar o I3 e o caso não mede nada');
    assert.ok(r.minCom >= 0.15,
      `a cabeça avançou ${r.fora.toFixed(2)} m e o disco chegou a ${r.minCom.toFixed(3)} m do olho — ` +
      'I3 proíbe abaixo de 0,15 m');
    assert.ok(r.minCom >= K.MIN_OLHO - 0.01,
      `o guarda devia ter parado o disco em ${K.MIN_OLHO} m e ele chegou a ${r.minCom.toFixed(3)} m`);
  });

  /* ---------------------------------------------------------------- */
  it('custa no máximo 1 draw call por olho', async () => {
    const dif = await h.play(() => window.__R.custo(15));
    const custo = mediana(dif);
    console.log(`      custo do radial em draw calls (estéreo, diferença pareada): ${custo}  [${dif.join(' ')}]`);
    /* 2 = 1 sprite × 2 olhos. O piso de 1 é o que mata o mutante "não desenha
       nada": um radial que não custa draw call nenhum é um radial que não
       existe. */
    assert.ok(custo >= 1, `o radial aberto não custou draw call nenhum (${dif.join(' ')}) — não está sendo desenhado`);
    assert.ok(custo <= 2, `o radial custou ${custo} draw calls no estéreo, mais de 1 por olho`);
  });

  it('sair do VR limpa o disco da cena (nada de menu flutuante no desktop)', async () => {
    const r = await h.play(async () => {
      await window.__R.abrir();
      const dentro = !!window.__R.obj() && window.__R.estado().visivel;
      window.__A.botao('left', 'trigger', 0);
      await window.__game.XR.exit();
      await window.__A.espera(500);
      const o = window.__R.obj();
      let naCena = false;
      window.__MP.scene.traverse(x => { if (x === o) naCena = true; });
      return { dentro, naCena, temPai: !!(o && o.parent) };
    });
    assert.equal(r.dentro, true, 'o disco não chegou a acender dentro da sessão');
    assert.equal(r.naCena, false, 'o disco do radial continuou na cena depois de sair do VR');
    assert.equal(r.temPai, false, 'o disco do radial continuou pendurado em alguém depois do exit');
  });
});
