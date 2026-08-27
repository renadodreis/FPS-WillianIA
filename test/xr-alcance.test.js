/* ================================================================
   QA — DE ONDE SE MEDE O ALCANCE DE INTERAÇÃO (IWER, sessão imersiva real).

   O QUE MUDOU DEBAIXO DESTE ASSUNTO. Até `2d55610` o colisor seguia a cabeça
   1:1 e a separação cabeça↔corpo era ruído (0,0131 m no pior frame de 1799).
   Era por isso que o critério D2 ficava verde com `js/interact.js` medindo
   tudo de `player.pos`: medir do corpo e medir da cabeça davam o mesmo número.

   Agora a parede SEGURA o corpo — e tinha de segurar, porque o passo recusado
   voltava para o colisor e ele atravessava 10,9623 m num pedido de 10 m. A
   separação deixou de ser transitória, e a régua virou uma decisão de verdade.

   A RÉGUA ESCOLHIDA (docs/vr/referencia-interacao.md §8):

       ref.xz = cabeça.xz − o que o mundo RECUSOU   (no eixo corpo→cabeça)
       ref.y  = player.pos.y
       e nunca mais que TETO_FORA do corpo

   Porque `cabeça = player.pos + passoPendente + fora` (js/xr/xrrig.js,
   `place()`), a diferença entre "medir da cabeça" e "medir do corpo" É, ponto
   por ponto, o que a parede negou ao corpo do jogador. Devolver isso ao
   alcance é alcance por parede — e o servidor **não valida distância de baú**
   (`server.js`, `openChest`), então a régua do cliente é a única trava desse
   caminho.

   O QUE ESTE ARQUIVO MEDE:

   1. A RÉGUA, como função pura, com números duros nas duas pontas.
   2. A SEPARAÇÃO REAL: quanto a cabeça sai do corpo quando o jogador anda
      fisicamente contra uma estrutura do jogo — medido pelo caminho de
      produção inteiro (pose do headset → rig → colisão → `devolverPasso`).
   3. AS DUAS PONTAS NO PRODUTO: que o alcance normal não encolheu (o baú abre
      onde sempre abriu) e que não dá para abrir baú do outro lado da parede.

   PORTA 3582 (faixa exclusiva desta frente: 3580–3588).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3582;

function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  const cabeca = () => {
    MP.camera.updateWorldMatrix(true, false);
    return new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
  };

  function soloLimpo() {
    window.__BR_active = false;
    window.__BR_freeze = false;
  }
  /* ponto sem canhão, sem brinquedo, sem segredo, longe de carro e helicóptero:
     `current()` tem ordem de prioridade, e um brinquedo por perto responderia
     antes do baú */
  function longeDeTudo(x = -140, z = -140) {
    MP.player.pos.set(x, G.heightAt(x, z), z);
    MP.player.vel.set(0, 0, 0);
    G.Car.group.position.set(x + 70, G.heightAt(x + 70, z), z);
    G.Heli.group.position.set(x + 90, G.heightAt(x + 90, z) + 30, z);
    G.Structures.chestSpots.forEach(s => { s.x = 900; s.z = 900; });
  }

  /* Põe UM baú a `d` metros do CORPO, na direção `(ux,uz)`. Mexe no SPOT (é o
     que `js/interact.js` lê), não no mesh: o que está sendo medido é a régua,
     não a arte. */
  function bauA(d, ux = 1, uz = 0) {
    const P = MP.player.pos, s = G.Structures.chestSpots[0];
    const m = Math.hypot(ux, uz) || 1;
    s.x = P.x + (ux / m) * d;
    s.z = P.z + (uz / m) * d;
    return [s.x, s.z];
  }

  /* A TECLA DE VERDADE, no caminho de verdade: `js/interact.js` lê o Set
     `justPressed`, que o listener global do game.js popula a partir de um
     `keydown` real (game.js:1433). */
  function teclaE() {
    const op = { code: 'KeyE', key: 'KeyE', bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', op));
    window.dispatchEvent(new KeyboardEvent('keyup', op));
  }

  window.__L = {
    soloLimpo, longeDeTudo, bauA, teclaE,
    cabeca: () => cabeca().toArray(),
    corpo: () => MP.player.pos.toArray(),
    fora: () => G.XR.foraDoCorpo,
    baus: () => ({ medkits: G.Interact.chest.medkits, nades: G.Interact.chest.nades, meat: G.Interact.chest.meat }),
    inv: () => ({ medkits: G.inventory.medkits, nades: G.inventory.nades, meat: G.inventory.meat }),
    encher: () => { G.inventory.medkits = 3; G.inventory.nades = 3; G.inventory.meat = 0; },

    /* A RÉGUA, alimentada com números que quem chama passa. É a função que
       `js/interact.js` usa; aqui ela é exercitada isolada e com dado vivo. */
    async regua(corpo, cab, foraM) {
      const m = await import('/js/interact.js');
      const out = new T.Vector3();
      const c = cab ? new T.Vector3().fromArray(cab) : null;
      m.pontoDeAlcance(out, new T.Vector3().fromArray(corpo), c, foraM);
      return { pos: out.toArray(), teto: m.TETO_FORA };
    },

    /* SEPARAÇÃO REAL: anda FISICAMENTE contra a primeira estrutura que houver
       na direção `(ux,uz)` e devolve o pico de `XR.foraDoCorpo`. Caminho de
       produção inteiro — pose do headset, rig, colisão do jogo,
       `devolverPasso`. Nada é injetado. */
    async andarContra(ux, uz, metros) {
      const dev = window.__xrEmulado;
      const p0 = { x: dev.position.x, y: dev.position.y, z: dev.position.z };
      const corpo0 = MP.player.pos.toArray();
      const passos = Math.max(1, Math.round(metros / 0.05));   // 5 cm por etapa
      let pico = 0;
      const trilha = [];
      for (let i = 1; i <= passos; i++) {
        dev.position.set(p0.x + ux * 0.05 * i, p0.y, p0.z + uz * 0.05 * i);
        await window.__A.espera(45);
        const f = G.XR.foraDoCorpo;
        if (f > pico) pico = f;
        trilha.push(+f.toFixed(4));
      }
      return {
        pico, trilha, corpo0,
        corpo: MP.player.pos.toArray(), cabeca: cabeca().toArray(),
      };
    },
    voltarPose() { window.__xrEmulado.position.set(0, 1.6, 0); },

    /* PAREDE DE VERDADE, escolhida da lista do próprio mundo. Sondar com
       `collide` num raio era adivinhação e não achava nada; aqui a parede é um
       AABB de `Structures.walls` — bloco alto, com pegada larga, com o chão do
       lado de fora na altura da base dele. A aproximação é pela face −X. */
    acharParede() {
      const W = G.Structures.walls;
      let melhor = null;
      for (const w of W) {
        if (w.noCollide) continue;
        const alt = w.y1 - w.y0, larg = w.z1 - w.z0, fundo = w.x1 - w.x0;
        if (alt < 2.5 || larg < 3 || fundo < 1) continue;
        const zc = (w.z0 + w.z1) / 2;
        const xFora = w.x0 - 1.6;
        const chao = G.heightAt(xFora, zc);
        // o bloco tem de barrar quem está de pé nesse chão (banda vertical)
        if (!(chao + 1.7 > w.y0 && chao < w.y1 - 0.12)) continue;
        // e o chão logo em frente não pode ser rampa que empurre o jogador
        if (Math.abs(G.heightAt(xFora - 0.6, zc) - chao) > 0.35) continue;
        const d = Math.hypot(xFora, zc);
        if (!melhor || d < melhor.d) melhor = { x: xFora, z: zc, chao, d, w };
      }
      return melhor;
    },
    /* Planta o jogador em frente à parede achada, `folga` metros da face. */
    plantarAntesDa(par, folga) {
      const x = par.w.x0 - folga, z = par.z;
      MP.player.pos.set(x, G.heightAt(x, z), z);
      MP.player.vel.set(0, 0, 0);
      return [x, z];
    },
  };
  return true;
}

const hip = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('de onde se mede o alcance de interação', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    await h.play(() => { window.__L.soloLimpo(); window.__L.longeDeTudo(); window.__A.solta(); });
    await h.play(() => window.__A.espera(400));
  });
  after(async () => { if (h) await h.close(); });

  /* ================================================================
     1. A RÉGUA, como função pura.
     ================================================================ */
  describe('a régua', () => {
    it('sem cabeça (fora do XR) a referência É o corpo, sem desvio nenhum', async () => {
      const r = await h.play(() => window.__L.regua([10, 2, -4], null, 0));
      assert.deepEqual(r.pos, [10, 2, -4]);
    });

    it('com o mundo aceitando o passo, a referência é a CABEÇA (D2)', async () => {
      /* É isto que o D2 cobra: "Reprova: decisão a partir de player.pos".
         Nada recusado ⇒ a régua tem de estar em cima da cabeça. */
      const r = await h.play(() => window.__L.regua([0, 1, 0], [0.20, 1.7, 0], 0));
      assert.ok(Math.abs(r.pos[0] - 0.20) < 1e-6,
        `com 0 m recusado a régua parou em x=${r.pos[0].toFixed(4)}, e a cabeça está em 0,20`);
      assert.equal(r.pos[2], 0);
    });

    it('o que o mundo RECUSOU não vira alcance — nem um centímetro', async () => {
      /* A cabeça 0,60 m adiante porque a parede segurou o corpo: a régua fica
         no corpo. Este é o caso que impede abrir baú do outro lado do muro. */
      const r = await h.play(() => window.__L.regua([0, 1, 0], [0.60, 1.7, 0], 0.60));
      assert.ok(Math.abs(r.pos[0]) < 1e-6,
        `0,60 m de cabeça, 0,60 m recusado, e a régua andou ${r.pos[0].toFixed(4)} m`);
    });

    it('recusa PARCIAL desconta só o que foi recusado', async () => {
      const r = await h.play(() => window.__L.regua([0, 1, 0], [0.60, 1.7, 0], 0.25));
      assert.ok(Math.abs(r.pos[0] - 0.35) < 1e-6,
        `0,60 m de cabeça com 0,25 m recusado devia dar 0,35 m e deu ${r.pos[0].toFixed(4)}`);
    });

    /* O CASO QUE ISOLA O DESCONTO — e ele existe porque validação independente
       provou que o caso de SESSÃO do baú (lá embaixo) fica VERDE com o desconto
       arrancado: quem o segurava era o TETO de 0,35 m, não o desconto, e a
       afirmação escrita nele era falsa. Aqui a separação fica ABAIXO do teto,
       então o teto não pode salvar: se o desconto sumir, a régua anda e o caso
       morre. Foi a oitava ocorrência de "teste que passa por acidente" nesta
       base — a primeira em que o furo era de um caso inteiro, não de um assert. */
    it('ABAIXO do teto, quem segura a régua é o DESCONTO — não o teto', async () => {
      const r = await h.play(async () => {
        const m = await import('/js/interact.js');
        return { teto: m.TETO_FORA, ...(await window.__L.regua([0, 1, 0], [0.30, 1.7, 0], 0.30)) };
      });
      assert.ok(0.30 < r.teto,
        `este caso só vale com a separação (0,30 m) ABAIXO do teto (${r.teto} m); ajuste os números se o teto mudar`);
      assert.ok(Math.abs(r.pos[0]) < 1e-6,
        `0,30 m de cabeça com 0,30 m recusado devia deixar a régua no corpo e ela andou ${r.pos[0].toFixed(4)} m — ` +
        'sem o desconto, o teto sozinho deixaria passar os 0,30 m inteiros');
    });

    it('há um TETO absoluto, para separação que o `fora` não explique', async () => {
      const r = await h.play(() => window.__L.regua([0, 1, 0], [2.5, 1.7, 0], 0));
      assert.ok(Math.abs(r.pos[0] - r.teto) < 1e-6,
        `2,50 m de cabeça sem recusa devia parar no teto de ${r.teto} m e parou em ${r.pos[0].toFixed(4)}`);
      /* O NÚMERO DA DIREITA MUDOU e o motivo fica escrito: `FORA_MAX` era 0,50 m
         quando era limiar de CONFORTO; virou 0,32 m quando foi recalculado pela
         geometria (colisor r=0,42 + near 0,08 = o outro lado aparece em 0,34 m).
         Com isso o teto de alcance passou a ficar ACIMA do ponto de preto, e
         isso é mais restritivo, não menos: no alcance máximo a tela já fechou. */
      assert.ok(r.teto > 0.13 && r.teto < 0.60,
        `o teto de ${r.teto} m tem de ficar acima do pico de encosto de parede (0,133 m)`);
    });

    it('sem saber quanto foi recusado, assume que foi TUDO (padrão seguro)', async () => {
      /* É o padrão de quem não fia `foraXR`. Errar para o lado permissivo aqui
         é abrir alcance por parede em silêncio. */
      const r = await h.play(() => window.__L.regua([0, 1, 0], [0.60, 1.7, 0], undefined));
      assert.ok(Math.abs(r.pos[0]) < 1e-6,
        `sem saber a recusa a régua andou ${r.pos[0].toFixed(4)} m à frente do corpo`);
    });

    it('o Y NUNCA vem da cabeça: a esfera do helicóptero não pode mudar de tamanho', async () => {
      /* `fora` só existe no plano horizontal. Levar o Y da cabeça mudaria em
         ~1,6 m a esfera de 5 m do helicóptero e a banda de 3,5 m da bazuca —
         retoque de gameplay disfarçado de correção de VR.

         A CABEÇA TEM DESLOCAMENTO HORIZONTAL DE PROPÓSITO. Com a cabeça
         exatamente em cima do corpo a régua sai pelo atalho de "não há
         direção" e nem chega na linha do Y — a primeira versão deste caso
         ficou VERDE com o defeito reinjetado justamente por isso. */
      const r = await h.play(() => window.__L.regua([0, 12.5, 0], [0.2, 14.1, 0.1], 0));
      assert.equal(r.pos[1], 12.5, `a régua subiu para y=${r.pos[1]} junto com a cabeça`);
      assert.ok(Math.abs(r.pos[0] - 0.2) < 1e-6 && Math.abs(r.pos[2] - 0.1) < 1e-6,
        'o caso precisa de deslocamento horizontal para chegar na conta do Y — e não teve');
    });
  });

  /* ================================================================
     2. A SEPARAÇÃO REAL, medida no produto inteiro.
     ================================================================ */
  describe('a separação cabeça↔corpo, medida andando de verdade', () => {
    it('andar no plano aberto NÃO separa a cabeça do corpo', async () => {
      const r = await h.play(async () => {
        window.__L.soloLimpo(); window.__L.longeDeTudo();
        window.__L.voltarPose();
        await window.__A.espera(500);
        const s = await window.__L.andarContra(1, 0, 1.2);
        window.__L.voltarPose();
        await window.__A.espera(300);
        return s;
      });
      const andou = hip(r.corpo, r.corpo0);
      console.log(`      caminhada livre de 1,2 m: corpo andou ${andou.toFixed(3)} m · separação máxima ${r.pico.toFixed(4)} m`);
      /* GUARDA CONTRA MEDIR O VAZIO: separação zero também é o que sai se a
         pose do headset nunca chegar ao rig. O corpo TEM de ter andado. */
      assert.ok(andou > 0.9,
        `o corpo só andou ${andou.toFixed(3)} m de 1,2 m de caminhada física — a pose não chegou ao jogo`);
      assert.ok(r.pico < 0.10,
        `andar 1,2 m em campo aberto separou a cabeça do corpo em ${r.pico.toFixed(3)} m — ` +
        'o colisor devia estar seguindo a cabeça');
    });

    it('andar CONTRA uma estrutura separa — e é essa separação que a régua desconta', async () => {
      const r = await h.play(async () => {
        window.__L.soloLimpo();
        const par = window.__L.acharParede();
        if (!par) return { par: null };
        window.__L.plantarAntesDa(par, 1.1);
        window.__L.voltarPose();
        await window.__A.espera(600);
        const s = await window.__L.andarContra(1, 0, 1.8);
        window.__L.voltarPose();
        await window.__A.espera(300);
        return { par: { x: par.x, z: par.z, x0: par.w.x0 }, ...s };
      });
      assert.ok(r.par, 'não achei parede utilizável em Structures.walls — o cenário não montou');
      const sep = hip(r.cabeca, r.corpo);
      const andou = hip(r.corpo, r.corpo0);
      console.log(`      parede em x=${r.par.x0.toFixed(1)} · corpo andou ${andou.toFixed(3)} m de 1,80 m · ` +
        `separação máxima ${r.pico.toFixed(4)} m · cabeça−corpo no fim ${sep.toFixed(4)} m`);
      assert.ok(andou < 1.3,
        `o corpo andou ${andou.toFixed(3)} m dos 1,8 m contra a parede — ela não segurou nada`);
      assert.ok(r.pico > 0.15,
        `andar 1,8 m contra uma estrutura só separou ${r.pico.toFixed(4)} m — ` +
        'ou a parede não segurou o corpo, ou o cenário não tem parede');
    });
  });

  /* ================================================================
     3. AS DUAS PONTAS, no produto.
     ================================================================ */
  describe('as duas pontas', () => {
    it('o alcance NORMAL não encolheu: o baú a 2,3 m abre', async () => {
      const r = await h.play(async () => {
        window.__L.soloLimpo(); window.__L.longeDeTudo(); window.__L.voltarPose();
        window.__L.encher();
        await window.__A.espera(350);
        window.__L.bauA(2.3, 1, 0);
        await window.__A.espera(350);
        const op = document.getElementById('prompt').style.opacity;
        const txt = document.getElementById('prompt').textContent;
        const antes = window.__L.baus();
        window.__L.teclaE();
        await window.__A.espera(350);
        return { op, txt, antes, depois: window.__L.baus() };
      });
      assert.equal(r.op, '1', `o baú a 2,30 m não acendeu o aviso (opacidade ${r.op})`);
      assert.match(r.txt, /BA[ÚU]/i, `o aviso a 2,30 m do baú diz "${r.txt}"`);
      assert.ok(r.depois.medkits > r.antes.medkits,
        `KeyE a 2,30 m do baú não moveu item nenhum (${JSON.stringify(r.antes)} → ${JSON.stringify(r.depois)})`);
    });

    it('…e o baú a 2,55 m continua fora de alcance', async () => {
      const r = await h.play(async () => {
        window.__L.soloLimpo(); window.__L.longeDeTudo(); window.__L.voltarPose();
        window.__L.encher();
        await window.__A.espera(350);
        window.__L.bauA(2.55, 1, 0);
        await window.__A.espera(350);
        const op = document.getElementById('prompt').style.opacity;
        const antes = window.__L.baus();
        window.__L.teclaE();
        await window.__A.espera(350);
        return { op, antes, depois: window.__L.baus() };
      });
      assert.equal(r.op, '0', 'o baú a 2,55 m acendeu o aviso — o raio de 2,4 m cresceu');
      assert.deepEqual(r.depois, r.antes, 'KeyE a 2,55 m do baú mexeu no baú mesmo assim');
    });

    it('a régua DA INSTÂNCIA DO JOGO nunca passa da cabeça nem do teto', async () => {
      /* Lê `window.__game.Interact.alcance()` — a instância que o game.js
         constrói e roda, não uma cópia do teste. É o invariante que vale nas
         duas fiações: com ou sem `cabecaXR`/`foraXR`, o ponto de medida fica
         entre o corpo e a cabeça, e nunca além do teto. Fica VERMELHO se
         alguém trocar a régua pela cabeça crua. */
      const r = await h.play(async () => {
        window.__L.soloLimpo();
        const par = window.__L.acharParede();
        if (!par) return { par: null };
        window.__L.plantarAntesDa(par, 1.1);
        window.__L.voltarPose();
        await window.__A.espera(600);
        const amostras = [];
        const dev = window.__xrEmulado;
        const p0 = { x: dev.position.x, z: dev.position.z };
        for (let i = 1; i <= 36; i++) {
          dev.position.set(p0.x + 0.05 * i, dev.position.y, p0.z);
          await window.__A.espera(45);
          amostras.push({
            ref: window.__game.Interact.alcance(),
            corpo: window.__L.corpo(),
            cab: window.__L.cabeca(),
            fora: window.__L.fora(),
          });
        }
        window.__L.voltarPose();
        for (let i = 0; i < 40 && window.__game.XR.foraDoCorpo > 0.02; i++) await window.__A.espera(100);
        return { par: true, amostras, teto: (await import('/js/interact.js')).TETO_FORA };
      });
      assert.ok(r.par, 'não achei parede utilizável em Structures.walls');
      let piorCorpo = 0, piorSobra = -Infinity, maiorFora = 0;
      for (const a of r.amostras) {
        const dCorpo = hip(a.ref, a.corpo);
        const dCabeca = hip(a.cab, a.corpo);
        piorCorpo = Math.max(piorCorpo, dCorpo);
        piorSobra = Math.max(piorSobra, dCorpo - dCabeca);
        maiorFora = Math.max(maiorFora, a.fora);
      }
      console.log(`      ${r.amostras.length} amostras · separação máxima ${maiorFora.toFixed(3)} m · ` +
        `régua saiu no máximo ${piorCorpo.toFixed(4)} m do corpo (teto ${r.teto} m) · ` +
        `passou da cabeça em ${piorSobra.toFixed(4)} m`);
      assert.ok(maiorFora > 0.15, `a separação máxima foi ${maiorFora.toFixed(3)} m — o cenário não montou`);
      assert.ok(piorCorpo <= r.teto + 1e-6,
        `a régua chegou a ${piorCorpo.toFixed(4)} m do corpo, acima do teto de ${r.teto} m`);
      assert.ok(piorSobra <= 1e-6,
        `a régua passou ${piorSobra.toFixed(4)} m ALÉM da cabeça — está inventando alcance`);
    });

    it('NÃO SE ABRE BAÚ ATRAVÉS DA PAREDE, com separação de verdade no ar', async () => {
      /* O cenário completo: o jogador anda fisicamente contra uma estrutura, o
         corpo para, a cabeça segue. O baú fica ADIANTE da cabeça — dentro dos
         2,4 m dela, fora dos 2,4 m do corpo. Medir da cabeça crua o abriria.

         Este é o caso que fica VERMELHO no dia em que alguém "consertar" o D2
         trocando a régua pela cabeça sem desconto. */
      const r = await h.play(async () => {
        window.__L.soloLimpo();
        window.__game.Structures.chestSpots.forEach(s => { s.x = 900; s.z = 900; });
        const par = window.__L.acharParede();
        if (!par) return { par: null };
        window.__L.plantarAntesDa(par, 1.1);
        window.__L.voltarPose();
        window.__L.encher();
        await window.__A.espera(600);
        const s = await window.__L.andarContra(1, 0, 1.8);
        const fora = window.__L.fora();
        const corpo = window.__L.corpo(), cab = window.__L.cabeca();
        /* O baú entre 2,4 m da cabeça e além dos 2,4 m do corpo: no meio da
           faixa que a régua da cabeça crua abriria de graça. */
        const sep = Math.hypot(cab[0] - corpo[0], cab[2] - corpo[2]);
        const d = 2.4 + sep / 2;
        const bau = window.__L.bauA(d, 1, 0);
        await window.__A.espera(350);
        const op = document.getElementById('prompt').style.opacity;
        const antes = window.__L.baus();
        window.__L.teclaE();
        await window.__A.espera(350);
        const depois = window.__L.baus();
        window.__L.voltarPose();
        await window.__A.espera(300);
        return { par: { x0: par.w.x0 }, fora, corpo, cab, bau, d, op, antes, depois, pico: s.pico };
      });
      assert.ok(r.par, 'não achei parede utilizável em Structures.walls');
      const sep = hip(r.cab, r.corpo);
      const dCorpo = Math.hypot(r.bau[0] - r.corpo[0], r.bau[1] - r.corpo[2]);
      const dCabeca = Math.hypot(r.bau[0] - r.cab[0], r.bau[1] - r.cab[2]);
      console.log(`      separação ${sep.toFixed(3)} m (fora=${r.fora.toFixed(3)}) · ` +
        `baú a ${dCorpo.toFixed(3)} m do corpo e ${dCabeca.toFixed(3)} m da cabeça`);
      assert.ok(sep > 0.15, `a separação ficou em ${sep.toFixed(3)} m — o cenário de parede não montou`);
      assert.ok(dCorpo > 2.4, `o baú ficou a ${dCorpo.toFixed(3)} m do corpo, dentro do raio: não mede nada`);
      assert.ok(dCabeca < 2.4, `o baú ficou a ${dCabeca.toFixed(3)} m da cabeça, fora do raio: não mede nada`);
      assert.equal(r.op, '0',
        `o baú a ${dCorpo.toFixed(2)} m do corpo (mas ${dCabeca.toFixed(2)} m da cabeça, do outro lado da ` +
        'parede) acendeu o aviso — a régua está entregando o alcance que a parede negou');
      assert.deepEqual(r.depois, r.antes,
        'KeyE abriu um baú que está do outro lado da parede');
    });
  });
});
