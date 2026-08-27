/* ================================================================
   QA — GIRAR EM VR: SUAVE POR PADRÃO, EM PASSOS POR OPÇÃO.

   O dono do projeto vestiu o headset e reprovou o giro: "viro com o
   controle e move igual PC, movimento estático, uns 30 graus de uma vez,
   esse movimento não existe em VR". Ele estava descrevendo snap turn
   fixo — a decisão de conforto que o porte tinha tomado POR ele.

   O que a pesquisa achou (fontes em docs/vr/referencia-locomocao.md): todo
   FPS de VR do gênero — Alyx, Pavlov, Onward, Contractors, Population: ONE —
   oferece os DOIS giros com velocidade/ângulo ajustáveis, e a Meta escreve
   que é importante deixar o jogador escolher. O que a pesquisa REFUTOU é o
   padrão: a Meta manda nascer em snap ("Default to comfort-friendly
   options... and let users opt into more intense options"). Aqui o padrão é
   suave assim mesmo, porque o critério de pronto deste porte é o dono do
   projeto e ele jogou e reprovou o snap — e o modo em passos continua
   existindo, com ângulo ajustável, para quem enjoa.

   COMO ESTE ARQUIVO MEDE, E POR QUÊ ASSIM:

   - Sessão `immersive-vr` DE VERDADE, aberta pelo IWER (o runtime de
     emulação WebXR que a Meta publica), com os controles Touch sintéticos
     acionados pela API documentada (`updateAxes('thumbstick', x, y)`).
     Dublê escrito à mão tem a forma que quem escreveu imaginou.

   - A medida é a GUINADA DO OLHAR NO MUNDO (`camera.getWorldQuaternion`),
     amostrada UMA VEZ POR FRAME DA SESSÃO. Não é "quantos graus no fim":
     a diferença entre suave e em passos está na FORMA da curva, e uma
     medida só de início-e-fim dá o mesmo número para os dois. Um passo de
     45° aparece como um salto entre duas amostras vizinhas; giro suave
     nunca passa de poucos graus por frame.

   - O ponto de injeção é `XR.place`, que é por onde o yaw do rig chega ao
     jogo (game.js, applyFpsCamera). A propriedade é lida do objeto a cada
     chamada, então trocá-la intercepta o CALL SITE real, dentro do loop da
     sessão — não um dublê ao lado dele. Quem chama o frame continua sendo
     a sessão; o teste espera TEMPO e lê o efeito.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3420;
const GRAU = Math.PI / 180;

/* ---------- instalação (uma vez, já dentro da sessão) ---------- */
async function instalarGiro() {
  const G = window.__game, MP = window.__MP, XR = G.XR, THREE = MP.THREE;
  const mod = await import('/js/xr/xrturn.js');
  /* A INSTÂNCIA É A DE PRODUÇÃO (`XR.giro`, montada em js/xr/xrboot.js), não
     uma cópia criada aqui: cópia testaria o módulo, não o jogo. */
  const Q = {
    mod,
    giro: XR.giro,
    original: XR.place.bind(XR),
    ultimo: performance.now(),
    amostras: [], gravando: false, acum: 0, anterior: 0, piscadas: 0,
    _q: new THREE.Quaternion(), _v: new THREE.Vector3(),
    olharAgora() {
      XR.rig.updateMatrixWorld(true);
      G.camera.getWorldQuaternion(this._q);
      this._v.set(0, 0, -1).applyQuaternion(this._q);
      return Math.atan2(-this._v.x, -this._v.z);
    },
  };
  window.__GIROQA = Q;

  /* O ANDAIME SÓ OBSERVA. Enquanto o wiring não existia no game.js, este
     patch precisava CONDUZIR o giro (chamar `atualizar` e a vinheta) para
     haver o que medir. Com a fiação aplicada o game.js conduz — e um andaime
     que continua conduzindo faz o giro contar DUAS vezes: 60°/s por um
     segundo saía 117,9°, quase o dobro, e a piscada era a do próprio patch em
     vez da do jogo. Andaime que dirige o produto mede a si mesmo. */
  Q.piscou = () => XR.conforto.piscando > 0;

  XR.place = function (x, y, z, yaw) {
    Q.original(x, y, z, yaw);
    if (Q.gravando && Q.piscou()) Q.piscadas++;
    if (Q.gravando) {
      const y2 = Q.olharAgora();
      let d = y2 - Q.anterior;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      Q.acum += d;
      Q.anterior = y2;
      Q.amostras.push({ t: performance.now(), yaw: Q.acum, tunel: XR.conforto.tunel });
    }
  };
  return { ok: true, prefs: Q.giro.prefs };
}

/* ---------- um ensaio: segura o analógico, amostra, solta ----------
   Roda inteiro DENTRO da página: as amostras são por frame da sessão, e
   round-trip de puppeteer entre elas mediria o teste, não o jogo. */
async function ensaio(x, ms) {
  const Q = window.__GIROQA, A = window.__A, MP = window.__MP;
  A.solta();
  await A.espera(250);
  Q.acum = 0; Q.anterior = Q.olharAgora(); Q.amostras.length = 0; Q.piscadas = 0;
  /* SEMENTE EM ZERO. Sem ela o primeiro delta gravado nunca vira uma
     diferença `am[i]-am[i-1]` — e o passo de 45°, que cai justamente no
     primeiro frame depois de mexer no analógico, sumia da contagem de saltos
     enquanto continuava aparecendo no total. */
  Q.amostras.push({ t: performance.now(), yaw: 0, tunel: 0 });
  const p0 = { x: MP.player.pos.x, z: MP.player.pos.z };
  const c0 = { x: MP.camera.position.x, y: MP.camera.position.y, z: MP.camera.position.z };
  Q.gravando = true;
  A.stick('right', x, 0);
  await A.espera(ms);
  A.stick('right', 0, 0);
  await A.espera(60);
  Q.gravando = false;
  const am = Q.amostras;
  const passos = [];
  let maiorSalto = 0, saltos = 0;
  for (let i = 1; i < am.length; i++) {
    const d = Math.abs(am[i].yaw - am[i - 1].yaw);
    passos.push(d);
    if (d > maiorSalto) maiorSalto = d;
    if (d > 20 * Math.PI / 180) saltos++;
  }
  passos.sort((a, b) => a - b);
  const mediana = passos.length ? passos[passos.length >> 1] : 0;
  return {
    total: am.length ? am[am.length - 1].yaw : 0,
    n: am.length,
    maiorSalto, mediana, saltos, piscadas: Q.piscadas,
    tunelMax: am.reduce((m, s) => Math.max(m, s.tunel), 0),
    andou: Math.hypot(MP.player.pos.x - p0.x, MP.player.pos.z - p0.z),
    cabecaMexeu: Math.hypot(MP.camera.position.x - c0.x,
      MP.camera.position.y - c0.y, MP.camera.position.z - c0.z),
    segundos: am.length > 1 ? (am[am.length - 1].t - am[0].t) / 1000 : 0,
  };
}

async function preferir(p) {
  const Q = window.__GIROQA;
  Q.giro.preferir(p);
  return Q.giro.prefs;
}

describe('giro em VR (runtime emulado IWER)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    const r = await h.play(instalarGiro);
    assert.equal(r.ok, true);
  });
  after(async () => { if (h) await h.close(); });

  /* ---------------- o padrão ---------------- */

  it('o padrão de fábrica é giro CONTÍNUO, não em passos', async () => {
    // sem nada salvo = jogador novo, primeira vez que veste o headset
    const p = await h.play(() => {
      const Q = window.__GIROQA;
      window.localStorage.removeItem(Q.mod.CHAVE);
      return Q.mod.criarGiroXR({ armazem: window.localStorage }).prefs;
    });
    assert.equal(p.modo, 'suave',
      `o padrão veio "${p.modo}": snap turn fixo foi exatamente o que o dono reprovou`);
    assert.ok(p.velocidade >= 90 && p.velocidade <= 180,
      `velocidade padrão ${p.velocidade}°/s fora da faixa que os FPS de VR usam (90–180)`);
  });

  it('…e é a INSTÂNCIA DO JOGO que nasce assim, não só o módulo', async () => {
    /* O caso acima constrói uma instância nova para ler o padrão — e uma
       instância nova não prova nada sobre o que o JOGADOR recebe: quem monta o
       giro é js/xr/xrboot.js, e bastaria um `preferir` na fiação para o
       headset nascer em snap com este arquivo verde. É o buraco de ESTADO que
       esta base já pagou caro (cinco arquivos de teste de rig de roda verdes
       com o carro errado na primeira tela).

       Aqui a leitura é da instância que o jogo usa, com o armazém como o
       jogador novo o tem: vazio. */
    const r = await h.play(() => {
      const G = window.__game;
      let salvo;
      try { salvo = window.localStorage.getItem('callofai_vr'); } catch { salvo = 'INACESSÍVEL'; }
      return { prefs: G.XR.giro.prefs, salvo };
    });
    assert.equal(r.salvo, null,
      `o teste não está medindo um jogador novo: o armazém já tem "${r.salvo}"`);
    assert.equal(r.prefs.modo, 'suave',
      `a instância do jogo nasceu em "${r.prefs.modo}" — o dono reprovou o snap fixo ` +
      '("viro com o controle e move igual PC, uns 30 graus de uma vez")');
    assert.equal(r.prefs.velocidade, 180,
      `a instância do jogo nasceu a ${r.prefs.velocidade}°/s (o default do Immersive Web SDK é 180)`);
  });

  it('segurar o analógico gira SEM SALTOS — a curva é contínua', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 120 });
    const r = await h.play(ensaio, 1, 1000);
    assert.ok(r.n >= 20, `só ${r.n} amostras em ${r.segundos.toFixed(2)} s: a sessão não desenhou`);
    /* O critério é a FORMA da curva, não um teto absoluto de graus: a taxa de
       quadros do Chrome de teste varia, e um limite fixo mediria a máquina.
       Em giro contínuo todo frame anda quase o mesmo tanto (maior ≈ mediana);
       um passo de 45° é um outlier gigante sobre uma mediana perto de zero. */
    assert.ok(r.maiorSalto < Math.max(4 * r.mediana, 6 * GRAU),
      `maior passo entre frames vizinhos ${(r.maiorSalto / GRAU).toFixed(1)}° contra ` +
      `mediana ${(r.mediana / GRAU).toFixed(1)}° — isso é degrau, não giro contínuo`);
    assert.ok(Math.abs(r.total) > 60 * GRAU,
      `1 s de analógico no talo girou só ${(r.total / GRAU).toFixed(1)}°`);
  });

  it('empurrar pra DIREITA gira pra direita (e não o contrário)', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 120 });
    const dir = await h.play(ensaio, 1, 700);
    const esq = await h.play(ensaio, -1, 700);
    /* guinada do mundo cresce no sentido anti-horário visto de cima: virar
       pra DIREITA diminui. Medir só "quantos graus girou" deixa passar o
       giro invertido, que foi o defeito exato do movimento. */
    assert.ok(dir.total < -30 * GRAU,
      `analógico pra direita rendeu ${(dir.total / GRAU).toFixed(1)}° — sinal errado é giro invertido`);
    assert.ok(esq.total > 30 * GRAU,
      `analógico pra esquerda rendeu ${(esq.total / GRAU).toFixed(1)}°`);
  });

  it('a velocidade é do jogador: 60°/s e 180°/s giram na proporção', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 60 });
    const lento = await h.play(ensaio, 1, 1000);
    await h.play(preferir, { modo: 'suave', velocidade: 180 });
    const rapido = await h.play(ensaio, 1, 1000);
    const a = Math.abs(lento.total) / GRAU, b = Math.abs(rapido.total) / GRAU;
    assert.ok(a > 40 && a < 80, `60°/s por 1 s rendeu ${a.toFixed(1)}°`);
    assert.ok(b > 130 && b < 220, `180°/s por 1 s rendeu ${b.toFixed(1)}°`);
    assert.ok(b / a > 2.2, `razão ${(b / a).toFixed(2)}× entre 180 e 60: a velocidade não manda`);
  });

  it('encostar no analógico (0,12) não gira — zona morta', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 120 });
    const r = await h.play(ensaio, 0.12, 700);
    assert.ok(Math.abs(r.total) < 2 * GRAU,
      `${(r.total / GRAU).toFixed(2)}° com o analógico quase no centro: gira sem o jogador pedir`);
  });

  it('girar não anda com o jogador nem arrasta a cabeça dele', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 120 });
    const r = await h.play(ensaio, 1, 800);
    assert.ok(r.andou < 0.05, `o jogador andou ${r.andou.toFixed(3)} m só girando`);
    assert.ok(r.cabecaMexeu < 1e-4,
      `a pose da cabeça mudou ${r.cabecaMexeu.toFixed(4)} m: em VR a cabeça é do jogador`);
  });

  /* ---------------- o pivô ---------------- */

  /* O DEFEITO Nº 1 DA LISTA, e o mais fácil de não enxergar: o rig girava em
     torno da PRÓPRIA ORIGEM. Com a cabeça sobre a origem (jogador parado no
     centro do espaço de jogo) o giro é perfeito e todo teste passa. Basta o
     jogador dar dois passos no cômodo para cada virada TELEPORTAR a vista de
     lado — o mundo gira e escorrega ao mesmo tempo. Por isso este teste tira
     a cabeça do centro ANTES de girar: é a única posição em que o defeito
     aparece, e é a posição em que qualquer pessoa de headset está. */
  const pivo = async (modo, x) => {
    const A = window.__A, G = window.__game, MP = window.__MP, dev = window.__xrEmulado;
    const Q = window.__GIROQA;
    Q.giro.preferir(modo);
    A.solta();
    dev.position.set(0.71, 1.6, 0);        // dois passos fora do centro
    await A.espera(600);
    const p = new MP.THREE.Vector3();
    G.camera.getWorldPosition(p);
    const antes = { x: p.x, z: p.z, y: p.y };
    const yaw0 = Q.giro.yaw;               // o yaw é acumulado da sessão inteira
    A.stick('right', x, 0);
    await A.espera(900);
    A.stick('right', 0, 0);
    await A.espera(200);
    G.camera.getWorldPosition(p);
    dev.position.set(0, 1.6, 0);
    await A.espera(300);
    return {
      desliza: Math.hypot(p.x - antes.x, p.z - antes.z),
      subiu: Math.abs(p.y - antes.y),
      girou: Q.giro.yaw - yaw0,
    };
  };

  it('giro CONTÍNUO pivota na cabeça: fora do centro, a vista não escorrega', async () => {
    const r = await h.play(pivo, { modo: 'suave', velocidade: 180 }, 1);
    assert.ok(Math.abs(r.girou) > 60 * GRAU, `girou só ${(r.girou / GRAU).toFixed(1)}°`);
    assert.ok(r.desliza < 0.05,
      `a cabeça andou ${r.desliza.toFixed(3)} m de lado só de girar (medido em 0,71 m ` +
      'fora do centro) — o rig está girando em torno da própria origem, não da cabeça');
    assert.ok(r.subiu < 0.02, `a cabeça subiu ${r.subiu.toFixed(3)} m girando`);
  });

  it('giro em PASSOS pivota na cabeça também', async () => {
    const r = await h.play(pivo, { modo: 'passos', passo: 45 }, 1);
    assert.ok(Math.abs(Math.abs(r.girou) - 45 * GRAU) < 4 * GRAU,
      `o passo rendeu ${(r.girou / GRAU).toFixed(1)}°`);
    assert.ok(r.desliza < 0.05,
      `um passo de 45° teleportou a cabeça ${r.desliza.toFixed(3)} m de lado`);
    await h.play(preferir, { modo: 'suave', velocidade: 120, passo: 45 });
  });

  /* ---------------- conforto ---------------- */

  it('o giro contínuo fecha a vinheta de túnel enquanto gira', async () => {
    await h.play(preferir, { modo: 'suave', velocidade: 150 });
    const r = await h.play(ensaio, 1, 800);
    assert.ok(r.tunelMax > 0.2,
      `vinheta chegou a ${r.tunelMax.toFixed(2)} girando a 150°/s — ` +
      'reduzir fluxo óptico periférico é a recomendação da Meta pra locomoção contínua');
  });

  /* ---------------- a opção que continua existindo ---------------- */

  it('modo PASSOS continua disponível: uma inclinada, um passo', async () => {
    await h.play(preferir, { modo: 'passos', passo: 45 });
    const r = await h.play(ensaio, 1, 1000);
    assert.ok(Math.abs(Math.abs(r.total) - 45 * GRAU) < 4 * GRAU,
      `segurar 1 s no modo passos rendeu ${(r.total / GRAU).toFixed(1)}°, não 45° — ` +
      'segurar pro lado não pode girar em rajada');
    assert.equal(r.saltos, 1, `${r.saltos} saltos: o passo tem que ser UM`);
    assert.ok(r.piscadas >= 1, 'passo sem piscada lê como "a tela girou sozinha"');
  });

  it('o passo do modo PASSOS também é do jogador (30° em vez de 45°)', async () => {
    await h.play(preferir, { modo: 'passos', passo: 30 });
    const r = await h.play(ensaio, 1, 900);
    assert.ok(Math.abs(Math.abs(r.total) - 30 * GRAU) < 4 * GRAU,
      `passo de 30° rendeu ${(r.total / GRAU).toFixed(1)}°`);
  });

  it('voltar o analógico ao centro rearma o passo seguinte', async () => {
    await h.play(preferir, { modo: 'passos', passo: 45 });
    const r = await h.play(async () => {
      const Q = window.__GIROQA, A = window.__A;
      A.solta();
      await A.espera(250);
      Q.acum = 0; Q.anterior = Q.olharAgora(); Q.amostras.length = 0;
      Q.amostras.push({ t: performance.now(), yaw: 0, tunel: 0 });   // semente (ver ensaio)
      Q.gravando = true;
      for (let i = 0; i < 3; i++) {
        A.stick('right', 1, 0);
        await A.espera(200);
        A.stick('right', 0, 0);
        await A.espera(200);
      }
      Q.gravando = false;
      const am = Q.amostras;
      let saltos = 0;
      for (let i = 1; i < am.length; i++) {
        if (Math.abs(am[i].yaw - am[i - 1].yaw) > 15 * Math.PI / 180) saltos++;
      }
      return { total: am.length ? am[am.length - 1].yaw : 0, saltos };
    });
    assert.equal(r.saltos, 3, `três inclinadas deram ${r.saltos} passos`);
    assert.ok(Math.abs(Math.abs(r.total) - 135 * GRAU) < 6 * GRAU,
      `três passos de 45° deveriam somar 135°, deram ${(r.total / GRAU).toFixed(1)}°`);
  });

  /* ---------------- preferência do jogador ---------------- */

  it('a preferência sobrevive à sessão (fica salva)', async () => {
    const r = await h.play(async () => {
      const Q = window.__GIROQA;
      Q.giro.preferir({ modo: 'passos', velocidade: 150, passo: 30 });
      const cru = window.localStorage.getItem('callofai_vr');
      const outro = Q.mod.criarGiroXR({ armazem: window.localStorage });
      return { cru, prefs: outro.prefs };
    });
    assert.ok(r.cru, 'nada foi gravado: a preferência morre ao tirar o headset');
    assert.equal(r.prefs.modo, 'passos');
    assert.equal(r.prefs.velocidade, 150);
    assert.equal(r.prefs.passo, 30);
    await h.play(preferir, { modo: 'suave', velocidade: 120, passo: 45 });
  });

  it('armazenamento quebrado não derruba o giro (modo privado, cota cheia)', async () => {
    const r = await h.play(async () => {
      const Q = window.__GIROQA;
      const ruim = {
        getItem() { throw new Error('sem acesso'); },
        setItem() { throw new Error('cota'); },
      };
      const g = Q.mod.criarGiroXR({ armazem: ruim });
      g.preferir({ modo: 'suave', velocidade: 100 });
      const r1 = g.atualizar(0.5, 1);
      return { modo: g.prefs.modo, delta: r1.delta };
    });
    assert.equal(r.modo, 'suave');
    assert.ok(Math.abs(r.delta) > 0, 'com armazenamento quebrado o giro parou de girar');
  });
});
