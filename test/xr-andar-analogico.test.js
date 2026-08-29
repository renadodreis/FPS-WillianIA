/* ================================================================
   QA — O ANALÓGICO DO HEADSET ANDA COMO ANALÓGICO (A3/A4 e o "parecer
   natural" que o dono do projeto pediu).

   O DEFEITO, e ele é de FORMA do vetor, não de velocidade. O `game.js`
   traduzia o analógico esquerdo em QUATRO BOOLEANOS (`KeyW/KeyA/KeyS/KeyD`
   com limiar de 0,15). Três consequências, todas medíveis:

     1. **Oito direções.** Empurrar o polegar a 22,5° do eixo anda a 0° ou a
        45°: o erro de direção chega a 22,5° e o jogador corrige com o
        pescoço, que é exatamente o que enjoa.
     2. **Uma velocidade só.** Meio analógico e analógico no talo dão a MESMA
        velocidade — não existe andar devagar para se posicionar.
     3. **Zona morta de 0,28, não de 0,18.** A conta: `js/xr/xrinput.js`
        desconta `DEADZONE` (0,18) e normaliza por `ANDAR_CHEIO_SZ`
        (= (0,85 − 0,18)/(1 − 0,18) = 0,817). Para o booleano acender é
        preciso `andar.y ≥ 0,15`, o que exige o polegar em **0,2805**. Ou
        seja: 10 pontos de curso a mais do que o produto declara, e o jogador
        sente o comando "morto" no começo.

   O toque do CELULAR deste mesmo jogo já entrega vetor analógico
   (`game.js`, `Touch.getMove()`), e é assim que o headset passa a entregar.

   O QUE ESTE ARQUIVO MEDE — grandezas físicas, no mundo, com o jogo
   conduzindo:
     · a DIREÇÃO da velocidade do jogador contra a direção do polegar levada
       ao mundo pela guinada da vista (graus);
     · a MAGNITUDE da velocidade contra o curso do analógico (m/s);
     · o curso mínimo que tira o jogador do lugar (a zona morta de verdade).

   POR QUE NÃO É TESTE QUE PASSA POR ACIDENTE. A régua é o EIXO DO POLEGAR
   composto com `yawDaVista()` — duas grandezas que existem antes e fora do
   código sob teste (uma é entrada do runtime emulado, a outra é a fonte
   única de guinada que o jogo inteiro já usa). O teste NÃO lê o vetor de
   marcha calculado pelo `playerUpdate` e o compara com ele mesmo (formato 2
   da lista do CLAUDE.md), e não mede contagem nem existência (formato 3):
   mede ângulo e metro por segundo. Com a tradução em booleanos de volta, o
   caso da direção mede 22,5° de erro e o da magnitude vê as duas velocidades
   iguais.

   PORTA 3664 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3664;
const nrm = d => {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
};

async function instalarSondas() {
  const G = window.__game, MP = window.__MP;

  window.__AN = {
    /* Empurra o polegar num ÂNGULO e num CURSO dados e devolve a velocidade
       do jogador no mundo depois que ela assenta. O ângulo é medido a partir
       de "para a frente" e cresce para a direita, que é a convenção do eixo
       do analógico (x para a direita, y para a frente = −y do gamepad). */
    async empurrar(grausDoEixo, curso, ms = 900) {
      const r = grausDoEixo * Math.PI / 180;
      const x = Math.sin(r) * curso, y = Math.cos(r) * curso;
      /* o eixo Y do gamepad é invertido: para a frente é NEGATIVO */
      window.__A.stick('left', x, -y);
      await window.__A.espera(ms);
      const v = MP.player.vel;
      const out = {
        vx: v.x, vz: v.z,
        rapidez: Math.hypot(v.x, v.z),
        /* direção da velocidade no mundo, em graus, no mesmo referencial do
           yaw do jogo (0 = −Z, cresce como o yaw de three) */
        dir: Math.atan2(-v.x, -v.z) / Math.PI * 180,
        vista: G.yawDaVista() / Math.PI * 180,
        noChao: MP.player.onGround,
      };
      window.__A.solta();
      await window.__A.espera(500);
      return out;
    },
    /* velocidade de referência do perfil ativo, para o teste não fixar
       número que a política de velocidade pode mudar por outro motivo */
    velocidades: () => ({ andar: G.XRAndar.andar, correr: G.XRAndar.correr }),
    plano: () => {
      /* campo aberto e parado: ladeira e colisão contaminam a direção */
      MP.player.vel.set(0, 0, 0);
    },
  };
  return true;
}

describe('o analógico do headset anda como analógico (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarSondas);
    await h.play(() => window.__A.espera(900));
  });
  after(async () => { if (h) await h.close(); });

  it('a DIREÇÃO segue o polegar, e não oito setores', async () => {
    /* 22,5° é o pior caso da tradução em booleanos: fica exatamente entre
       "só frente" e "frente+direita". */
    const casos = [];
    /* curso 0,80 de propósito: `CORRER_TILT` é 0,92, e no batente entraria a
       corrida — que muda a MAGNITUDE e não a direção, mas suja a leitura. */
    for (const ang of [0, 22.5, 45, 67.5, 112.5, 157.5, -22.5, -67.5]) {
      const r = await h.play(a => window.__AN.empurrar(a, 0.80), ang);
      /* SINAL: em three o yaw cresce para a ESQUERDA (um yaw +θ leva −Z para
         (−sinθ, 0, −cosθ)), e o polegar cresce para a DIREITA. Daí o menos. */
      const esperado = r.vista - ang;          // polegar levado ao mundo pela vista
      casos.push({ ang, erro: nrm(r.dir - esperado), rapidez: r.rapidez });
    }
    for (const c of casos) {
      console.log(`      polegar a ${String(c.ang).padStart(6)}° → erro de direção ${c.erro.toFixed(2).padStart(7)}°` +
        ` · ${c.rapidez.toFixed(3)} m/s`);
    }
    const pior = casos.reduce((a, b) => (Math.abs(b.erro) > Math.abs(a.erro) ? b : a));
    assert.ok(Math.abs(pior.erro) < 4,
      `o jogador anda ${pior.erro.toFixed(1)}° fora da direção do polegar (pior caso: polegar a ${pior.ang}°). ` +
      'Acima de 4° o comando virou setor: a tradução em KeyW/KeyA/KeyS/KeyD só tem oito direções, ' +
      'e o erro máximo dela é 22,5°');
  });

  it('a MAGNITUDE é proporcional ao curso do analógico', async () => {
    const meio = await h.play(() => window.__AN.empurrar(0, 0.5));
    const cheio = await h.play(() => window.__AN.empurrar(0, 0.84));
    const vel = await h.play(() => window.__AN.velocidades());
    console.log(`      curso 0,50 → ${meio.rapidez.toFixed(3)} m/s · curso 0,84 → ${cheio.rapidez.toFixed(3)} m/s` +
      `  (andar do perfil: ${vel.andar.toFixed(3)} m/s)`);
    assert.ok(cheio.rapidez > 0.3,
      `com o analógico em 0,84 o jogador andou ${cheio.rapidez.toFixed(3)} m/s — não andou`);
    /* A razão entre os dois cursos, depois da zona morta, é
       (0,50 − 0,18)/(0,84 − 0,18) = 0,485. Um degrau de booleano dá razão 1. */
    const razao = meio.rapidez / cheio.rapidez;
    assert.ok(razao < 0.85,
      `meio analógico deu ${meio.rapidez.toFixed(3)} m/s e o analógico quase no talo deu ` +
      `${cheio.rapidez.toFixed(3)} m/s (razão ${razao.toFixed(2)}): a velocidade não depende do curso — ` +
      'é o degrau da tradução em booleanos');
    assert.ok(razao > 0.15,
      `meio analógico quase não moveu (razão ${razao.toFixed(2)}) — a curva engoliu o meio do curso`);
  });

  it('a ZONA MORTA é a declarada (0,18), não 0,28', async () => {
    /* 0,22 está confortavelmente dentro do curso útil declarado e MORTO na
       tradução em booleanos, que precisa de 0,2805 para acender a tecla. */
    const r = await h.play(() => window.__AN.empurrar(0, 0.22, 1100));
    const dentro = await h.play(() => window.__AN.empurrar(0, 0.14, 1100));
    console.log(`      curso 0,22 → ${r.rapidez.toFixed(3)} m/s · curso 0,14 (dentro da zona morta) → ${dentro.rapidez.toFixed(3)} m/s`);
    /* O limiar é 0,05 m/s e não um número redondo maior: com zona morta radial
       de 0,18 e o curso útil normalizado por `ANDAR_CHEIO_SZ`, o polegar em
       0,22 pede 6 % do passo — ~0,10 m/s, que é ANDAR DEVAGAR de propósito.
       O que este caso cobra é a separação contra o zero exato que a tradução
       em booleanos entregava, não uma velocidade mínima inventada. */
    assert.ok(r.rapidez > 0.05,
      `com o polegar em 0,22 o jogador andou ${r.rapidez.toFixed(3)} m/s: o comando está morto até 0,28 — ` +
      'dez pontos de curso a mais do que a zona morta que o produto declara (DEADZONE 0,18)');
    assert.ok(dentro.rapidez < 0.05,
      `com o polegar em 0,14, DENTRO da zona morta, o jogador andou ${dentro.rapidez.toFixed(3)} m/s — ` +
      'a zona morta sumiu e o tremor do polegar vai empurrar o jogador');
  });
});
