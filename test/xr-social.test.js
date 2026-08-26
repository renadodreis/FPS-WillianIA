/* ================================================================
   QA — CONVERSA, PLACAR E SALA DENTRO DO HEADSET (IWER, sessão real).

   O QUE ESTÁ SENDO COBRADO. A §7 de docs/vr/referencia-ui.md declara três
   pendências do critério H1: "Chat, placar e lobby do BR — dos 17 itens da
   lista fechada do H1, estes três continuam só no DOM". Dentro de uma sessão
   `immersive-vr` sem `dom-overlay` o DOM não chega ao compositor: o `<input>`
   do chat (br-game.js, `openChat`) recebe foco e não aparece, o `#brRoster`
   não aparece, e o lobby inteiro não aparece. Este arquivo mede o substituto
   dentro do mundo.

   COMO ESTE ARQUIVO EVITA MEDIR A SI MESMO — e por que ele MUDOU. A primeira
   versão instalava a própria instância do módulo e chamava `apontar()` e
   `acionar()` na mão. Isso funcionava só enquanto ninguém fiava o produto: no
   instante em que o painel passa a chamar as mesmas funções, o clique conta
   DUAS vezes. É a armadilha que já apareceu seis vezes nesta frente (giro de
   60 °/s virando 117,9°; o clique em "GIRO" alternando duas vezes e voltando).
   As regras aqui, agora:

     · O CONDUTOR É O JOGO. Quem chama `apontar`/`acionar`/`pintar` do módulo
       social é o `XRUI.update()` do game.js, uma vez por frame. Este arquivo
       NUNCA chama nenhuma das três. Ele aponta o controle de verdade, puxa o
       gatilho de verdade, espera TEMPO e LÊ.
     · A INSTÂNCIA É A DO JOGO. `G.XRUI.conectarSocial(...)` liga a fiação na
       instância que o painel já hospeda — a MESMA que o wiring do game.js vai
       ligar, pelo mesmo método. Duas instâncias na mesma superfície seriam o
       defeito, não a medida.
     · ANDAIME DECLARADO, E É ESTE: enquanto o wiring não entra no game.js, o
       `ler`/`enviar`/`acoes` que o produto vai receber chega daqui. `enviar`
       emite no socket DE VERDADE (o mesmo `chat` que o br-game.js usa) e
       `roster` é o payload que o SERVIDOR mandou, guardado cru. O que é dublê
       são as duas ações do lobby (COMEÇAR/SAIR), que viram contador: a de sair
       encerra a sessão imersiva de verdade e mataria o resto do arquivo.
     · CONTAGEM DE FRAME VEM DO RENDERER (`renderer.info.render.frame`), nunca
       de uma cadeia própria de `requestAnimationFrame`.

   O QUE É MEDIDO, E NÃO PROXIADO:
     · ângulo do texto em GRAUS, a partir dos PIXELS que o PAINEL pintou
       (`getImageData` acha a caixa da maiúscula) e da distância REAL da malha;
     · a mensagem sai por um gatilho de verdade, dá a volta no SERVIDOR e
       reaparece no `#brChatLog` do cliente;
     · o placar é comparado com o `roster` que o servidor mandou, campo a
       campo;
     · o custo em draw calls sai de diferença PAREADA no renderer do jogo, com
       o instrumento CALIBRADO antes (ele tem que enxergar um custo conhecido
       para que o zero queira dizer alguma coisa).

   PORTAS 3510–3519 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3510;
const GRAU_ALVO = 0.7;    // alvo de altura angular de texto (Microsoft/Android XR)

const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/* Ferramentas instaladas NA PÁGINA. `page.evaluate` com string ignora os
   argumentos — por isso tudo aqui é função normal em `window.__S`, mesmo
   motivo do `window.__A` de test/helpers/iwer.js. */
async function instalar() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  window.__mod = await import('/js/xr/xrsocial.js');

  /* ESPIÃO PURO do que trafega no socket — não alimenta nada, só observa. As
     mensagens de SISTEMA do servidor ("fulano entrou") ficam de fora: contá-las
     faria a asserção de "uma mensagem só" depender de quem entrou na sala. */
  const sock = MP.socket;          // `window.__game` não tem socket; `__MP` tem
  window.__espia = { enviadas: [], ecos: [] };
  window.__rosterCru = null;
  if (sock) {
    sock.on('chat', d => { if (d && !d.sys) window.__espia.ecos.push(d); });
    sock.on('roster', d => { window.__rosterCru = d; });
  }
  window.__conta = { comecar: 0, sair: 0 };

  /* A FIAÇÃO, no mesmo método que o game.js vai usar. Uma instância: a que o
     painel já hospeda. */
  const soc = G.XRUI.conectarSocial({
    ler: () => ({
      eu: { id: (window.__MP_init && window.__MP_init.id) || null, nick: 'EU' },
      partida: 1,
      tempo: '01:23',
    }),
    enviar: txt => {
      window.__espia.enviadas.push(txt);
      if (sock) sock.emit('chat', { msg: txt });
    },
    acoes: {
      comecar: () => { window.__conta.comecar++; },
      sair: () => { window.__conta.sair++; },
    },
  });
  /* referência de LEITURA (zonas, estado). Nada aqui chama apontar/acionar. */
  window.__social = soc;

  const v3 = a => new T.Vector3(a[0], a[1], a[2]);

  window.__S = {
    async esperar(n) {
      const alvo = MP.renderer.info.render.frame + n;
      const t0 = Date.now();
      while (MP.renderer.info.render.frame < alvo && Date.now() - t0 < 10000) {
        await new Promise(r => setTimeout(r, 16));
      }
    },
    /* abre/fecha o painel do JOGO com o botão de verdade (clique do analógico) */
    async menu() {
      window.__A.botao('right', 'thumbstick', 1);
      await window.__A.espera(150);
      window.__A.botao('right', 'thumbstick', 0);
      await window.__A.espera(250);
    },
    async clicar() {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(160);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(220);
    },
    estadoUi: () => G.XRUI.estado(),
    /* ESPERA O JOGADOR ASSENTAR. O painel é plantado onde o olho está no
       instante da abertura e depois fica ancorado NO MUNDO — abrir no meio da
       queda do spawn deixa o menu 1,7 m acima da cabeça, e a medição de altura
       angular sai a 1,98 m em vez de 1,00 m (medido). Nada disso é do módulo
       social; é a superfície que ele herda, e por isso entra no preparo. */
    async assentar() {
      const T2 = MP.THREE;
      let ant = MP.camera.getWorldPosition(new T2.Vector3()).y;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        await new Promise(r => setTimeout(r, 200));
        const y = MP.camera.getWorldPosition(new T2.Vector3()).y;
        if (MP.player.onGround && Math.abs(y - ant) < 0.005) return true;
        ant = y;
      }
      return false;
    },
    /* O módulo segura mensagem por 1300 ms porque o SERVIDOR descarta em
       silêncio abaixo de 1200. Um caso que quer medir "duas seguidas" precisa
       COMEÇAR liberado, senão mede a sobra do caso anterior. */
    async esperarDesbloqueio() {
      const t0 = Date.now();
      while (soc.estado().bloqueado && Date.now() - t0 < 6000) {
        await new Promise(r => setTimeout(r, 100));
      }
      return soc.estado().bloqueado;
    },
    /* Pede ao servidor um `roster` fresco. É o MESMO `hello` que o lobby de DOM
       manda a cada tecla digitada no nick (multiplayer-client.js, `sendHello`),
       e o servidor responde com `broadcastRoster()`. Sem isto o único roster da
       sessão chega no boot, antes de existir ouvinte, e o caso mediria o vazio. */
    pedirRoster: () => {
      const BR = window.__BR_debug;
      if (!sock) return false;
      sock.emit('hello', {
        nick: (BR && BR.S && BR.S.nick) || 'QA',
        colors: (BR && BR.S && BR.S.myColors) || undefined,
      });
      return true;
    },
    /* GEOMETRIA REAL da malha do painel — não constantes deste arquivo. */
    painelReal: () => {
      const p = G.XRUI.painel;
      if (!p) return null;
      const e = G.XRUI.estado();
      return {
        larguraM: p.geometry.parameters.width,
        alturaM: p.geometry.parameters.height,
        distanciaM: e.distancia,
        cvW: p.material.map.image.width,
        cvH: p.material.map.image.height,
      };
    },
    /* MEDE A CAIXA DA MAIÚSCULA de fato pintada dentro de um retângulo do
       canvas que O PAINEL desenhou. Varre o alfa: linha "acesa" é linha com
       pelo menos um pixel de texto acima do fundo. Isto FALHA se alguém
       encolher a fonte — é o oposto de uma guarda de constante. */
    capPx: (x0, y0, x1, y1) => {
      const cv = G.XRUI.painel.material.map.image;
      const ctx = cv.getContext('2d');
      const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
      const d = ctx.getImageData(Math.round(x0), Math.round(y0), w, h).data;
      /* o fundo do painel é escuro e o texto é claro: "aceso" = luminância
         bem acima do fundo, medida no próprio retângulo */
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (l < min) min = l; if (l > max) max = l;
      }
      const corte = min + (max - min) * 0.55;
      let topo = -1, base = -1;
      const corridas = [];
      for (let y = 0; y < h; y++) {
        let acesa = false;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l > corte) { acesa = true; break; }
        }
        if (acesa) { if (topo < 0) topo = y; base = y; }
        else if (topo >= 0) { corridas.push(base - topo + 1); topo = -1; base = -1; }
      }
      if (topo >= 0) corridas.push(base - topo + 1);
      return corridas.length ? Math.max(...corridas) : 0;
    },
    /* LUMINÂNCIA MÉDIA de um retângulo do canvas do painel. É como se mede o
       REALCE (a faixa `rgba(92,226,122,0.16)` que marca a zona sob o
       ponteiro): sobre o fundo `rgba(8,12,18,0.90)` ele multiplica a
       luminância da área por ~3,7. Serve para provar que o realce SUMIU — o
       que uma leitura de estado interno não prova, porque o canvas só é
       repintado quando a assinatura muda. */
    mediaLum: (x0, y0, x1, y1) => {
      const cv = G.XRUI.painel.material.map.image;
      const ctx = cv.getContext('2d');
      const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
      const d = ctx.getImageData(Math.round(x0), Math.round(y0), w, h).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) {
        soma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      return soma / (d.length / 4);
    },
    /* ponto do CANVAS -> ponto do MUNDO, pela matriz REAL do painel */
    mundoDoPixel: (px, py) => {
      const p = G.XRUI.painel;
      const cv = p.material.map.image;
      const L = p.geometry.parameters.width, A = p.geometry.parameters.height;
      p.updateWorldMatrix(true, false);
      const local = new T.Vector3((px / cv.width - 0.5) * L, (0.5 - py / cv.height) * A, 0);
      return local.applyMatrix4(p.matrixWorld).toArray();
    },
    /* aponta a mão de verdade para um ponto do MUNDO (mesma receita do
       test/xr-ui.test.js: o controle vive no espaço de referência = o rig) */
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
    /* aponta para um PIXEL do canvas e devolve o que O PAINEL entendeu */
    async mirarPixel(px, py) {
      window.__S.apontar('right', window.__S.mundoDoPixel(px, py));
      await window.__S.esperar(3);
      return window.__S.estadoUi().item;
    },
    /* aponta para o centro de uma zona do módulo e devolve o que O PAINEL viu */
    async mirarZona(id) {
      const z = window.__social.zonas().find(q => q.id === id);
      if (!z) return null;
      return window.__S.mirarPixel((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2);
    },
    /* Tira AS DUAS mãos do painel. Uma só não basta: o painel tenta a direita e
       depois a ESQUERDA (`for (const qual of ['right','left'])`), e o controle
       esquerdo parado na pose de repouso do runtime acerta a tela — foi assim
       que a primeira versão deste caso leu `fundo` com a mão direita apontada
       para o chão. */
    async paraLonge() {
      const p = G.XRUI.painel;
      p.updateWorldMatrix(true, false);
      const fora = p.getWorldPosition(new T.Vector3());
      fora.y -= 4;
      window.__S.apontar('right', fora.toArray());
      window.__S.apontar('left', fora.toArray());
      await window.__S.esperar(3);
      return window.__S.estadoUi().item;
    },
    drawCalls: () => MP.renderer.info.render.calls,
    painelVisivel: v => { G.XRUI.painel.visible = v; },
    chatDom: () => {
      const el = document.getElementById('brChatLog');
      return el ? el.textContent : '';
    },
  };
  return true;
}

describe('conversa, placar e sala dentro do headset',
  { timeout: 600000, skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;

    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalar);
      /* Abre o painel DO JOGO com o botão de verdade e DEIXA ABERTO: é o
         `update()` dele que conduz o módulo social, e painel fechado retorna na
         primeira guarda. A superfície medida daqui em diante é a de verdade —
         a malha do jogo, na distância do jogo, com a textura do jogo. */
      const assentou = await h.play(() => window.__S.assentar());
      assert.equal(assentou, true, 'o jogador não assentou no chão: o painel nasceria no meio da queda');
      await h.play(() => window.__S.menu());
      await h.play(() => window.__S.esperar(10));
      const est = await h.play(() => ({
        montado: !!window.__game.XRUI.painel,
        aberto: window.__game.XRUI.aberto,
        temSocial: !!window.__game.XRUI.social,
        aba: window.__game.XRUI.estado().aba,
        distancia: window.__game.XRUI.estado().distancia,
      }));
      assert.equal(est.montado, true, 'o painel do jogo não montou: não há superfície real para medir');
      assert.equal(est.aberto, true, 'o painel precisa ficar ABERTO: fechado, ninguém conduz o módulo');
      assert.equal(est.temSocial, true, 'o painel não hospedou o módulo social');
      assert.equal(est.aba, 'pausa', 'a aba de entrada tem que ser a do painel, não uma social');
      /* a distância é a premissa de TODO o dimensionamento de fonte deste
         módulo (o cabeçalho de xrsocial.js deriva as fontes de 1,00 m) */
      assert.ok(est.distancia >= 0.75 && est.distancia <= 1.25,
        `o painel abriu a ${est.distancia.toFixed(3)} m — fora da distância em que as fontes foram dimensionadas`);
    });

    after(async () => { if (h) await h.close(); });

    /* ---------------------------------------------------------------- */
    it('não cria nada: zero Object3D e zero números do Math.random', async () => {
      const r = await h.play(async () => {
        const MP = window.__MP, mod = window.__mod;
        const antesFilhos = MP.scene.children.length;
        const orig = Math.random;
        let n = 0;
        Math.random = () => { n++; return orig(); };
        /* instância DESCARTÁVEL, e é por isso que ela pode existir: ela nunca
           encosta no painel, não é conduzida por ninguém e morre nesta linha.
           O que se mede é o CUSTO DE CRIAR — o do produto já foi pago no
           `conectarSocial` do before, antes de qualquer asserção. */
        const s = mod.createXrSocial({ ler: () => ({}), enviar: () => {} });
        s.selecionar('placar');
        s.roster({ players: [{ id: 'a', nick: 'x', kills: 1, alive: true }], hostId: 'a' });
        s.assinatura();
        Math.random = orig;
        return { consumo: n, novosFilhos: MP.scene.children.length - antesFilhos };
      });
      assert.equal(r.consumo, 0, 'gastar Math.random no boot desloca o worldgen de todos');
      assert.equal(r.novosFilhos, 0, 'nada de Object3D: o módulo mora no canvas do painel');
    });

    it('custa ZERO draw call: mora na textura que já existe', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        await S.paraLonge();                       // sem realce sob o ponteiro
        /* CALIBRAÇÃO. Um "zero" só quer dizer alguma coisa se o instrumento
           conseguir enxergar um custo conhecido no mesmo instante: a malha do
           painel some e volta, e a diferença tem que aparecer. Sem isto, uma
           cena que não desenha nada devolveria zero e o teste passaria cego. */
        const conhecido = [];
        for (let i = 0; i < 5; i++) {
          S.painelVisivel(true); await S.esperar(2);
          const com = S.drawCalls();
          S.painelVisivel(false); await S.esperar(2);
          conhecido.push(com - S.drawCalls());
        }
        S.painelVisivel(true); await S.esperar(2);
        const social = [];
        for (let i = 0; i < 9; i++) {
          soc.selecionar('pausa');
          await S.esperar(2);
          const semSocial = S.drawCalls();
          soc.selecionar('placar');
          await S.esperar(2);
          social.push(S.drawCalls() - semSocial);
        }
        soc.selecionar('pausa');
        await S.esperar(2);
        return { conhecido, social, total: S.drawCalls() };
      });
      assert.ok(r.total > 50,
        `a cena desenhou ${r.total} draw calls no total — medida cega, não há o que comparar`);
      assert.ok(mediana(r.conhecido) >= 2,
        `a malha do painel sumindo custou ${mediana(r.conhecido)} draw calls: ` +
        `o instrumento não enxerga um custo conhecido [${r.conhecido}]`);
      assert.equal(mediana(r.social), 0,
        `a UI social não pode custar draw call: ${r.social}`);
      console.log(`      calibração (malha do painel): ${mediana(r.conhecido)} · ` +
        `custo das abas sociais: ${mediana(r.social)}`);
    });

    /* ---------------------------------------------------------------- */
    it('o texto de cada aba passa do alvo de 0,7° na malha e distância REAIS', async () => {
      const medidas = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        await S.paraLonge();
        const geo = S.painelReal();
        const saida = {};
        // uma sala cheia: é o pior caso de densidade
        const jog = [];
        for (let i = 0; i < 18; i++) {
          jog.push({ id: 'p' + i, nick: 'JOGADOR' + i, kills: 18 - i, alive: i % 5 !== 0 });
        }
        soc.roster({ players: jog, hostId: 'p0', aliveCount: 15, phase: 'PLAYING' });
        for (let i = 0; i < 4; i++) soc.receber({ nick: 'ALGUEM' + i, msg: 'mensagem de teste ' + i });
        for (const aba of ['chat', 'placar', 'sala']) {
          soc.selecionar(aba);
          await S.esperar(3);              // quem pinta é o painel, não o teste
          const zonas = soc.zonas().filter(z => z.tipo !== 'aba');
          let menor = 1e9, maiorLinha = 0;
          for (const z of zonas) {
            const cap = S.capPx(z.x0 + 6, z.y0 + 2, z.x1 - 6, z.y1 - 2);
            if (cap > 0) { menor = Math.min(menor, cap); maiorLinha = Math.max(maiorLinha, cap); }
          }
          saida[aba] = { menorCapPx: menor === 1e9 ? 0 : menor, maiorCapPx: maiorLinha, zonas: zonas.length };
        }
        soc.selecionar('pausa');
        await S.esperar(2);
        return { geo, saida };
      });
      const { geo } = medidas;
      // pré-condição: a superfície é a de leitura demorada da Meta/Oculus BP
      assert.ok(geo.distanciaM >= 0.75 && geo.distanciaM <= 1.25,
        `painel a ${geo.distanciaM.toFixed(3)} m — as fontes deste módulo foram dimensionadas a 1,00 m`);
      for (const aba of ['chat', 'placar', 'sala']) {
        const m = medidas.saida[aba];
        assert.ok(m.zonas >= 3, `aba ${aba} com ${m.zonas} zonas: conteúdo vazio não é conteúdo`);
        assert.ok(m.menorCapPx > 0, `aba ${aba} não pintou texto nenhum nas zonas`);
        const alturaM = geo.alturaM * (m.menorCapPx / geo.cvH);
        const graus = 2 * Math.atan((alturaM / 2) / geo.distanciaM) * 180 / Math.PI;
        console.log(`      aba ${aba}: menor maiúscula ${m.menorCapPx} px = ${graus.toFixed(2)}°`);
        assert.ok(graus >= GRAU_ALVO,
          `aba ${aba}: menor maiúscula ${m.menorCapPx} px = ${graus.toFixed(3)}° ` +
          `(alvo ${GRAU_ALVO}°) a ${geo.distanciaM.toFixed(3)} m`);
      }
    });

    it('lista grande vira PÁGINAS, não letra menor', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        await S.paraLonge();
        const conta = async n => {
          const jog = [];
          for (let i = 0; i < n; i++) jog.push({ id: 'q' + i, nick: 'N' + i, kills: n - i, alive: true });
          soc.roster({ players: jog, hostId: 'q0', aliveCount: n, phase: 'PLAYING' });
          soc.selecionar('placar');
          await S.esperar(3);
          const zs = soc.zonas().filter(z => z.tipo === 'jogador');
          let menor = 1e9;
          for (const z of zs) {
            const cap = S.capPx(z.x0 + 6, z.y0 + 2, z.x1 - 6, z.y1 - 2);
            if (cap > 0) menor = Math.min(menor, cap);
          }
          return { linhas: zs.length, menorCapPx: menor === 1e9 ? 0 : menor };
        };
        const pouco = await conta(6), muito = await conta(60);
        const temPaginacao = soc.zonas().some(z => z.tipo === 'pagina');
        soc.selecionar('pausa');
        await S.esperar(2);
        return { pouco, muito, temPaginacao };
      });
      assert.ok(r.pouco.menorCapPx > 0 && r.muito.menorCapPx > 0,
        'nenhuma das duas listas pintou texto: a comparação de tamanho seria vazia');
      assert.ok(r.muito.linhas <= 16,
        `60 jogadores viraram ${r.muito.linhas} linhas numa página só`);
      assert.equal(r.temPaginacao, true, '60 jogadores sem controle de página é lista sem saída');
      assert.equal(r.muito.menorCapPx, r.pouco.menorCapPx,
        'a letra encolheu para caber mais gente — o certo é paginar');
    });

    /* ---------------------------------------------------------------- */
    it('a mensagem escolhida dá a volta no SERVIDOR e volta pro cliente', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        await S.esperarDesbloqueio();
        soc.selecionar('chat');
        await S.esperar(3);
        const z = soc.zonas().find(q => q.tipo === 'rapida');
        window.__espia.ecos.length = 0;
        window.__espia.enviadas.length = 0;
        const antesDom = S.chatDom();
        const sob = await S.mirarZona(z.id);
        await S.clicar();                       // o PAINEL é que aciona
        const t0 = Date.now();
        while (window.__espia.ecos.length === 0 && Date.now() - t0 < 8000) {
          await new Promise(x => setTimeout(x, 50));
        }
        return {
          sob, acionou: S.estadoUi().ultimoAcionado,
          enviadas: window.__espia.enviadas.slice(),
          ecos: window.__espia.ecos.slice(),
          antesDom, depoisDom: S.chatDom(),
          rapidas: window.__mod.RAPIDAS.slice(),
          zonaId: z.id,
        };
      });
      assert.ok(r.sob && r.sob.id === r.zonaId && r.sob.zona === 'social',
        `apontei para a mensagem rápida e o painel marcou ${JSON.stringify(r.sob)}`);
      assert.equal(r.enviadas.length, 1,
        `mirar e puxar o gatilho tinha que enviar UMA mensagem (enviou ${r.enviadas.length})`);
      assert.ok(r.rapidas.includes(r.enviadas[0]),
        `saiu texto fora da lista fechada: ${JSON.stringify(r.enviadas[0])}`);
      assert.ok(r.ecos.length >= 1, 'o servidor não devolveu a mensagem');
      assert.equal(r.ecos[0].msg, r.enviadas[0], 'o servidor devolveu outra coisa');
      assert.ok(r.depoisDom.includes(r.enviadas[0]) && !r.antesDom.includes(r.enviadas[0]),
        'a mensagem não chegou ao cliente pelo caminho de verdade');
      assert.equal(r.acionou, r.zonaId, 'o painel não registrou o acionamento da zona apontada');
    });

    it('a mensagem recebida aparece na aba de conversa', async () => {
      const r = await h.play(async () => {
        const soc = window.__social;
        const marca = 'ECO' + Math.floor(Date.now() % 100000);
        soc.receber({ nick: 'FULANO', msg: marca });
        const linhas = soc.zonas().filter(z => z.tipo === 'log').map(z => z.txt);
        return { marca, linhas };
      });
      assert.ok(r.linhas.some(l => l && l.includes(r.marca)),
        `mensagem recebida não apareceu no log: ${JSON.stringify(r.linhas)}`);
    });

    it('respeita o intervalo do servidor em vez de mentir pro jogador', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        const bloqueadoAntes = await S.esperarDesbloqueio();
        soc.selecionar('chat');
        await S.esperar(3);
        const zs = soc.zonas().filter(q => q.tipo === 'rapida');
        window.__espia.ecos.length = 0;
        window.__espia.enviadas.length = 0;
        await S.mirarZona(zs[0].id);
        await S.clicar();
        await S.mirarZona(zs[1].id);   // logo em seguida: o servidor descartaria
        await S.clicar();
        const t0 = Date.now();
        while (Date.now() - t0 < 3000) await new Promise(x => setTimeout(x, 100));
        return {
          bloqueadoAntes,
          enviadas: window.__espia.enviadas.slice(),
          ecos: window.__espia.ecos.map(e => e.msg),
          intervalo: window.__mod.INTERVALO_MS,
        };
      });
      assert.equal(r.bloqueadoAntes, false,
        'o caso começou já bloqueado: mediria a sobra do caso anterior, não duas escolhas seguidas');
      assert.equal(r.enviadas.length, 1,
        `duas escolhas seguidas mandaram ${r.enviadas.length} mensagens; ` +
        `o servidor só aceita uma a cada ${r.intervalo} ms`);
      assert.equal(r.ecos.length, 1,
        `o servidor ecoou ${r.ecos.length} — a segunda foi descartada em silêncio`);
    });

    /* ---------------------------------------------------------------- */
    it('o placar bate campo a campo com o roster que o SERVIDOR mandou', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        window.__rosterCru = null;
        S.pedirRoster();
        const t0 = Date.now();
        while (!window.__rosterCru && Date.now() - t0 < 10000) {
          await new Promise(x => setTimeout(x, 100));
        }
        const cru = window.__rosterCru;
        if (!cru) return { semRoster: true };
        /* ESTA linha é o wiring do br-game.js (`socket.on('roster')`), e é a
           única coisa que este arquivo empurra para dentro do módulo. */
        soc.roster(cru);
        soc.selecionar('placar');
        await S.esperar(3);
        const linhas = soc.zonas().filter(z => z.tipo === 'jogador')
          .map(z => ({ nick: z.dados.nick, kills: z.dados.kills, alive: z.dados.alive }));
        soc.selecionar('pausa');
        await S.esperar(2);
        return { semRoster: false, cru: cru.players, linhas };
      });
      assert.equal(r.semRoster, false, 'o servidor não mandou roster nenhum: o teste não mediu o produto');
      assert.ok(r.cru.length >= 1, 'o roster do servidor veio vazio: nada para comparar');
      assert.equal(r.linhas.length, r.cru.length,
        `placar com ${r.linhas.length} linhas para ${r.cru.length} jogadores do servidor`);
      for (const p of r.cru) {
        const l = r.linhas.find(x => x.nick === p.nick);
        assert.ok(l, `${p.nick} está no roster do servidor e não está no placar`);
        assert.equal(l.kills, p.kills, `abates de ${p.nick} divergem`);
        assert.equal(l.alive, p.alive, `estado de vida de ${p.nick} diverge`);
      }
    });

    it('placar ordena por abates, com os vivos na frente', async () => {
      const r = await h.play(() => {
        const soc = window.__social;
        soc.roster({
          players: [
            { id: 'a', nick: 'AA', kills: 1, alive: true },
            { id: 'b', nick: 'BB', kills: 9, alive: false },
            { id: 'c', nick: 'CC', kills: 4, alive: true },
          ],
          hostId: 'a', aliveCount: 2, phase: 'PLAYING',
        });
        soc.selecionar('placar');
        return soc.zonas().filter(z => z.tipo === 'jogador').map(z => z.dados.nick);
      });
      assert.deepEqual(r, ['CC', 'AA', 'BB'],
        'ordem errada: vivos primeiro, e entre eles quem tem mais abates');
    });

    it('ANTI-CHEAT: posição de jogador nunca vaza pro placar', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        soc.roster({
          players: [
            { id: 'a', nick: 'AA', kills: 1, alive: true, pos: [123.5, 7, -456.25] },
            { id: 'b', nick: 'BB', kills: 2, alive: true, pos: { x: 987.75, y: 3, z: 654.5 } },
          ],
          hostId: 'a', aliveCount: 2, phase: 'PLAYING',
        });
        soc.selecionar('placar');
        await S.esperar(3);
        const zs = soc.zonas();
        return {
          campos: zs.filter(z => z.dados).map(z => Object.keys(z.dados).sort().join(',')),
          texto: zs.map(z => String(z.txt || '')).join(' | '),
          cru: JSON.stringify(zs),
        };
      });
      assert.ok(r.campos.length >= 2, 'o placar não montou linha nenhuma: nada para inspecionar');
      for (const c of r.campos) {
        assert.ok(!/(^|,)(pos|x|y|z|dist|distancia)(,|$)/.test(c),
          `o placar carrega campo de posição: ${c}`);
      }
      for (const n of ['123.5', '456.2', '987.7', '654.5']) {
        assert.ok(!r.texto.includes(n), `coordenada ${n} apareceu no texto do placar`);
        assert.ok(!r.cru.includes(n), `coordenada ${n} sobreviveu no modelo do placar`);
      }
    });

    /* ---------------------------------------------------------------- */
    it('COMEÇAR PARTIDA só existe para o anfitrião, e aciona UMA vez', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        const eu = (window.__MP_init && window.__MP_init.id) || 'eu';
        const jog = [{ id: eu, nick: 'EU', kills: 0, alive: true },
          { id: 'outro', nick: 'OUTRO', kills: 0, alive: true }];
        soc.roster({ players: jog, hostId: 'outro', aliveCount: 2, phase: 'LOBBY' });
        soc.selecionar('sala');
        await S.esperar(3);
        const semHost = soc.zonas().some(z => z.id === 'comecar');
        soc.roster({ players: jog, hostId: eu, aliveCount: 2, phase: 'LOBBY' });
        await S.esperar(3);
        const comHost = soc.zonas().some(z => z.id === 'comecar');
        window.__conta.comecar = 0;
        const sob = await S.mirarZona('comecar');
        await S.clicar();
        await S.esperar(3);
        soc.selecionar('pausa');
        await S.esperar(2);
        return { semHost, comHost, sob, chamadas: window.__conta.comecar,
          acionou: S.estadoUi().ultimoAcionado };
      });
      assert.equal(r.semHost, false, 'botão de começar apareceu para quem não é anfitrião — botão morto');
      assert.equal(r.comHost, true, 'o anfitrião ficou sem o botão de começar');
      assert.ok(r.sob && r.sob.id === 'comecar', `apontei para COMEÇAR e o painel marcou ${JSON.stringify(r.sob)}`);
      assert.equal(r.acionou, 'comecar', 'mirar e puxar o gatilho não acionou o botão');
      /* 1, não 2: com dois donos do mesmo gatilho (o painel e um andaime) esta
         contagem vira 2 — foi assim que o clique em "GIRO" alternava e voltava. */
      assert.equal(r.chamadas, 1, `a ação de começar foi chamada ${r.chamadas} vezes`);
    });

    it('a sala mostra quem está nela, com a coroa do anfitrião', async () => {
      const r = await h.play(() => {
        const soc = window.__social;
        soc.roster({
          players: [{ id: 'a', nick: 'ANFI', kills: 0, alive: true },
            { id: 'b', nick: 'ZE', kills: 0, alive: true, spectator: true }],
          hostId: 'a', aliveCount: 2, phase: 'LOBBY',
        });
        soc.selecionar('sala');
        return soc.zonas().filter(z => z.tipo === 'jogador')
          .map(z => ({ nick: z.dados.nick, txt: z.txt }));
      });
      assert.equal(r.length, 2, 'a sala não listou os dois jogadores');
      const anfi = r.find(x => x.nick === 'ANFI');
      const ze = r.find(x => x.nick === 'ZE');
      assert.ok(anfi && /♛|👑|\*/.test(anfi.txt), `anfitrião sem marca: ${anfi && anfi.txt}`);
      assert.ok(ze && /espec|ESPEC/i.test(ze.txt), `espectador sem marca: ${ze && ze.txt}`);
    });

    /* ---------------------------------------------------------------- */
    it('apontar a faixa de abas TROCA de aba, com o raio e o gatilho de verdade', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        soc.selecionar('pausa');
        await S.esperar(3);
        const antes = soc.aba;
        const sobAba = await S.mirarZona('aba:placar');
        await S.clicar();
        await S.esperar(3);
        const depois = soc.aba;
        await S.mirarZona('aba:pausa');
        await S.clicar();
        await S.esperar(3);
        return { antes, sobAba, depois, final: soc.aba,
          /* o que o PAINEL registrou ter acionado — leitura independente de
             `soc.aba`, que é o mesmo getter dos dois lados e por isso não
             provaria nada sozinho */
          registrou: S.estadoUi().ultimoAcionado };
      });
      assert.equal(r.antes, 'pausa');
      assert.ok(r.sobAba && r.sobAba.id === 'aba:placar' && r.sobAba.zona === 'social',
        `apontei para a aba PLACAR e o painel marcou ${JSON.stringify(r.sobAba)}`);
      assert.equal(r.depois, 'placar', 'a aba não trocou');
      assert.equal(r.final, 'pausa', 'não dá pra voltar para a PAUSA — beco sem saída');
      assert.equal(r.registrou, 'aba:pausa',
        'o painel não registrou ter acionado a aba — quem trocou a aba não foi o gatilho');
    });

    it('na aba PAUSA o corpo do painel é do DONO; na aba social é do módulo', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        soc.roster({ players: [{ id: 'a', nick: 'AA', kills: 1, alive: true }], hostId: 'a' });
        soc.selecionar('pausa');
        await S.esperar(3);
        /* o meio do CORPO, longe de qualquer linha do placar: é justamente o
           vazio que precisa ser reivindicado. */
        const noCorpo = await S.mirarPixel(512, 538);
        const naFaixa = await S.mirarPixel(128, 40);
        soc.selecionar('placar');
        await S.esperar(3);
        const noCorpoSocial = await S.mirarPixel(512, 538);
        const naFaixaSocial = await S.mirarPixel(128, 40);
        soc.selecionar('pausa');
        await S.esperar(2);
        return { noCorpo, naFaixa, noCorpoSocial, naFaixaSocial };
      });
      assert.ok(r.noCorpo && r.noCorpo.zona !== 'social',
        `na aba PAUSA o corpo tem que ser do painel, e o painel marcou ${JSON.stringify(r.noCorpo)} — ` +
        'reivindicá-lo comeria o clique de RETOMAR/SAIR do menu do jogo');
      assert.ok(r.naFaixa && r.naFaixa.zona === 'social' && r.naFaixa.id === 'aba:pausa',
        `a faixa de abas tem que responder mesmo na aba PAUSA: ${JSON.stringify(r.naFaixa)}`);
      assert.ok(r.noCorpoSocial && r.noCorpoSocial.zona === 'social',
        `na aba social o corpo INTEIRO é do módulo, e o painel marcou ${JSON.stringify(r.noCorpoSocial)} — ` +
        'a linha do painel ficaria acionável por baixo do placar desenhado');
      assert.ok(r.naFaixaSocial && r.naFaixaSocial.id === 'aba:pausa',
        `a faixa de abas sumiu na aba social: ${JSON.stringify(r.naFaixaSocial)}`);
    });

    it('o gatilho com a mão FORA do painel não aciona a última zona apontada', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social;
        soc.selecionar('sala');
        await S.esperar(3);
        const z = soc.zonas().find(q => q.id === 'sair');
        await S.mirarZona('sair');            // fica sob o ponteiro...
        await S.esperar(3);
        const sobAntes = S.estadoUi().item;
        const lumRealce = S.mediaLum(z.x0 + 4, z.y0 + 6, z.x1 - 4, z.y1 - 8);
        const fora = await S.paraLonge();     // ...e a mão sai do painel
        await S.esperar(3);
        const lumLimpa = S.mediaLum(z.x0 + 4, z.y0 + 6, z.x1 - 4, z.y1 - 8);
        window.__conta.sair = 0;
        await S.clicar();
        await S.esperar(3);
        soc.selecionar('pausa');
        await S.esperar(2);
        return { sobAntes, fora, saiu: window.__conta.sair, lumRealce, lumLimpa };
      });
      assert.ok(r.sobAntes && r.sobAntes.id === 'sair',
        `o teste não chegou a apontar para SAIR: ${JSON.stringify(r.sobAntes)}`);
      assert.equal(r.fora, null, 'com a mão fora do painel não pode sobrar alvo nenhum');
      assert.equal(r.saiu, 0,
        'o gatilho fora do painel acionou SAIR DA PARTIDA — o jogador atirando sairia da partida');
      /* e o realce tem que SUMIR do canvas, não só do estado: o painel repinta
         por assinatura, e uma zona esquecida sob o ponteiro fica acesa na tela
         apontando para um botão que a mão não está mais mirando. */
      assert.ok(r.lumRealce > r.lumLimpa * 1.5,
        `a zona não estava realçada quando a mão apontava para ela ` +
        `(${r.lumRealce.toFixed(1)} vs ${r.lumLimpa.toFixed(1)}) — a medida está cega`);
    });

    it('MORRER devolve a aba PAUSA: a saída não fica escondida atrás do placar', async () => {
      const r = await h.play(async () => {
        const S = window.__S, soc = window.__social, UI = window.__game.XRUI;
        soc.selecionar('placar');
        await S.esperar(3);
        const antes = soc.aba;
        UI.abrir('morte');                    // o mesmo caminho do game.js
        await S.esperar(3);
        const e = S.estadoUi();
        const ids = (e.linhas || []).map(l => l.id);
        UI.fechar(); await S.esperar(2);
        UI.abrir('pausa'); await S.esperar(3);
        return { antes, aba: e.aba, modo: e.modo, ids, aberto: S.estadoUi().aberto };
      });
      assert.equal(r.antes, 'placar', 'o teste não chegou a sair da aba de pausa');
      assert.equal(r.modo, 'morte', 'o painel não entrou em modo de morte');
      assert.equal(r.aba, 'pausa',
        'morreu com o PLACAR aberto e a tela de morte ficou por baixo da tabela — sem saída visível');
      assert.ok(r.ids.includes('sair'), `a tela de morte não oferece saída: ${r.ids.join(', ')}`);
      assert.equal(r.aberto, true, 'o painel ficou fechado e os testes seguintes mediriam o vazio');
    });

    it('repinta só quando o conteúdo muda', async () => {
      const r = await h.play(() => {
        const soc = window.__social;
        soc.selecionar('placar');
        soc.roster({ players: [{ id: 'a', nick: 'AA', kills: 1, alive: true }], hostId: 'a' });
        const a1 = soc.assinatura();
        const a2 = soc.assinatura();
        soc.roster({ players: [{ id: 'a', nick: 'AA', kills: 2, alive: true }], hostId: 'a' });
        const a3 = soc.assinatura();
        soc.selecionar('chat');
        const a4 = soc.assinatura();
        soc.selecionar('pausa');
        return { igual: a1 === a2, mudouKill: a1 !== a3, mudouAba: a3 !== a4 };
      });
      assert.equal(r.igual, true, 'a assinatura muda sozinha: o painel repintaria 1024×768 a cada frame');
      assert.equal(r.mudouKill, true, 'um abate a mais não mudou a assinatura: o placar congelaria');
      assert.equal(r.mudouAba, true, 'trocar de aba não mudou a assinatura');
    });

    it('sem erro de console durante a sessão inteira', async () => {
      assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
      assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
    });
  });
