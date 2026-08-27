/* ================================================================
   RUNTIME WebXR EMULADO (IWER) PARA OS TESTES.

   O IWER é o Immersive Web Emulation Runtime que a Meta publica — o kit
   oficial de desenvolvimento WebXR sem aparelho. Ele instala um
   `navigator.xr` completo, abre sessão `immersive-vr` de verdade no Chrome
   e expõe controles Touch sintéticos com a API documentada
   (`updateAxes`, `updateButtonValue`, `setButtonValueImmediate`).

   Testar controle de VR com dublê escrito à mão é errado: o dublê tem a
   forma que quem escreveu imaginou, não a forma que a plataforma entrega.
   Aqui o teste aciona o MESMO objeto que o navegador entregaria.

   PRECISA ENTRAR ANTES DE QUALQUER SCRIPT DA PÁGINA (`evaluateOnNewDocument`,
   que é o `initScripts` do harness): o `xrEnv()` de js/xr/xrenv.js lê
   `navigator.xr` no escopo do módulo, e runtime instalado depois chega tarde.
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function runtimeEmulado() {
  const umd = fs.readFileSync(
    path.join(ROOT, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  return `${umd}
;(function () {
  try {
    var IWER = globalThis.IWER;
    var dev = new IWER.XRDevice(IWER.metaQuest3);
    /* forceInstall: o Chrome desta maquina JA tem navigator.xr nativo, que
       responde "nao suporto" a tudo por nao haver headset. Sem forcar, o
       IWER se recusa a substituir um runtime nativo e a emulacao nao sobe. */
    dev.installRuntime({ forceInstall: true });
    dev.primaryInputMode = 'controller';
    globalThis.__xrEmulado = dev;   // QA: controles, recenter, visibilidade
    /* Acionador dos controles, disponivel na pagina como window.__A. Existe
       para que os testes sejam FUNCOES normais em vez de strings: page.evaluate
       com string ignora os argumentos, e a alternativa (interpolar codigo) traz
       de volta a costura fragil que este arquivo veio eliminar.
       Os ids de botao/eixo sao os do config oficial da Meta para o Touch:
       trigger, squeeze, thumbstick, x-button/y-button (esq), a-button/b-button (dir). */
    var TODOS = ['trigger','squeeze','thumbstick','x-button','y-button','a-button','b-button'];
    globalThis.__A = {
      stick: function (mao, x, y) { dev.controllers[mao].updateAxes('thumbstick', x, y); },
      botao: function (mao, id, v) { dev.controllers[mao].updateButtonValue(id, v); },
      solta: function () {
        ['left', 'right'].forEach(function (m) {
          dev.controllers[m].updateAxes('thumbstick', 0, 0);
          TODOS.forEach(function (b) {
            try { dev.controllers[m].updateButtonValue(b, 0); } catch (e) { void e; }
          });
        });
      },
      espera: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    };
  } catch (e) {
    globalThis.__xrEmuladoErro = String(e && e.message || e);
  }
})();`;
}

/* Sobe o jogo com o runtime emulado e entra em sessão imersiva de verdade.
   O botão de VR só nasce depois que `isSessionSupported` resolve — por isso a
   espera por condição em vez de timeout. */
async function bootEmVR(bootGame, { port, autoStart = false, emJogo = true, initScripts = [] } = {}) {
  const h = await bootGame({
    // o runtime PRIMEIRO: scripts extras podem depender de já haver navigator.xr
    port, autoStart, initScripts: [runtimeEmulado(), ...initScripts], protocolTimeout: 300000,
  });
  const erro = await h.play(() => window.__xrEmuladoErro || null);
  if (erro) { await h.close(); throw new Error(`IWER não instalou: ${erro}`); }
  await h.page.waitForFunction("!!document.getElementById('btnVR')",
    { timeout: 60000, polling: 200 });
  await h.page.click('#btnVR');
  await h.page.waitForFunction('window.__game.XR.presenting === true',
    { timeout: 60000, polling: 100 });
  /* ENTRAR EM VR DEIXOU DE COMEÇAR A PARTIDA. O game.js chamava
     `startGame(false)` ao entrar na sessão porque não havia menu no mundo;
     agora quem abre é o menu (js/xr/xrmenu.js), e a partida só começa quando o
     jogador escolhe. Os arquivos que medem ARMA, CORPO, LOCOMOÇÃO, HUD, TATO e
     INTERAÇÃO precisam do jogo RODANDO e ganhavam isso de graça daquela linha:
     é ela que este `emJogo` substitui, no MESMO ponto do tempo (dentro da
     sessão, depois do rig pronto). Quem quer medir o MENU passa `emJogo: false`. */
  if (emJogo) await h.page.evaluate(() => { window.__game.forceStart(); });
  return h;
}

module.exports = { runtimeEmulado, bootEmVR };
