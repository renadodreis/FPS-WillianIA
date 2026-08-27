import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { CFG, SETTINGS, persistSettings, applyMobileCfg, MOBILE_RES_FLOOR,
  MOBILE_PHYSICS_MAX_STEPS, MOBILE_GRASS_REBUILD_BUDGET } from './js/config.js';
import { isMobileEnv } from './js/mobile.js';
import { createTouchControls, createOrientationGate, clampPitch, LOOK_RAD_PER_CSS_PX,
  SPRINT_MAG as TOUCH_SPRINT_MAG } from './js/touchcontrols.js';
import { clamp, lerp, damp, rand, TAU, _v1, _v2, _v3, chaseCamPos, chaseLook } from './js/utils.js';
import { createTerrain } from './js/terrain.js';
import { createBiomes } from './js/biomes.js';
import * as Climate from './js/climate.js';
import { createCover } from './js/cover.js';
import { createSFX } from './js/sfx.js';
import { createStructures } from './js/structures.js';
import * as CityLayout from './js/citylayout.js';
import { createFX } from './js/fx.js';
import { createDmgNums } from './js/dmgnums.js';
import * as HitCore from './js/hitfeel-core.js';
import { createHitFeel } from './js/hitfeel.js';
import { createWeapons } from './js/weapons.js';
import { createWeaponRig } from './js/weaponrig.js';
import { createWeaponModels } from './js/weaponmodels.js';
import { createFpBody } from './js/fpbody.js';
import { createCharModels } from './js/charmodels.js';
import { createScenery } from './js/scenery.js';
import { createCar } from './js/car.js';
import { createHeli } from './js/heli.js';
import { createGrenades } from './js/grenades.js';
import { createRockets } from './js/rockets.js';
import { createPickups } from './js/pickups.js';
import { createEnv } from './js/env.js';
import { createWater } from './js/water.js';
import { createGrass } from './js/grass.js';
import { createVolcano } from './js/volcano.js';
import { createEnemies } from './js/enemies.js';
import { createBoss } from './js/boss.js';
import { createAmb } from './js/amb.js';
import { createAnimals } from './js/animals.js';
import { createNight } from './js/night.js';
import { createSkeletons } from './js/skeletons.js';
import { createAlien } from './js/alien.js';
import { createInteract } from './js/interact.js';
import { createPrewarm } from './js/prewarm.js';
import { createResolutionScaler } from './js/adaptivequality.js';
import { installFastSAP } from './js/sapbroadphase.js';
import { autoTierSettings } from './js/gputier.js';
import { createPerfHud } from './js/perfhud.js';
import { createXrBoot } from './js/xr/xrboot.js';
import { criarEntradaXR } from './js/xr/xrinput.js';
import { eixoDeGiro } from './js/xr/xrturn.js';
import { createXrButton, xrButtonState } from './js/xr/xrbutton.js';
import { createXrWeapon } from './js/xr/xrweapon.js';
import { createXrInteract } from './js/xr/xrinteract.js';
import { createXrUi } from './js/xr/xrui.js';
import { createXrHud } from './js/xr/xrhud.js';
import { createXrHaptics } from './js/xr/xrhaptics.js';
import { createXrFrameRate } from './js/xr/xrframerate.js';
import { criarLocomocaoXR, ROTULOS as ROTULOS_ANDAR } from './js/xr/xrlocomotion.js';
import { createCannon } from './js/cannon.js';
import { createMapToys } from './js/maptoys.js';
import { createMenuCamera, wireMenuUI } from './js/menuscene.js';
import { createSecrets } from './js/secrets.js';
import { buildChest } from './js/chestmodel.js';

/* ================================================================
   PORTÃO DO MENU — o estado dos botões é DERIVADO do estado ATUAL.

   Antes o #btnNew era travado UMA vez no boot, por um instantâneo de
   `__mpSocket`: se a sala caísse depois, ou se o br-game.js nunca
   carregasse, o botão ficava morto com "ABRINDO LOBBY..." PARA SEMPRE e
   nada avisava (é o "trava" relatado pelo dono). Agora quem decide é
   paintMenu(), chamado por quem MUDA o estado — boot, queda/volta de
   socket e falha do carregamento do BR.

   Declarado ANTES do bootstrap de propósito: os handlers de socket lá
   embaixo chamam paintMenu() e não podem pegar TDZ.
   ================================================================ */
const MenuGate = {
  wired: false,      // os listeners do menu já existem (fim deste módulo)
  dropped: false,    // socket caído SEM ninguém pedir (a reconexão segue tentando)
  broken: null,      // sala online inutilizável de vez (br-game.js não carregou)
  soloChosen: false, // o jogador escolheu SOLO e SAIU da sala (reversível)
  voltando: false,   // clicou em MULTIJOGADOR vindo do solo: reconectando
  bootLabel: '',     // fase atual do boot, pra etiqueta de progresso (ver bootFase)
  bootFases: [],      // histórico das fases já anunciadas — QA/teste de progresso honesto
};
let __voltaTimer = 0;
/* multiplayer-client.js é script CLÁSSICO e roda ANTES deste módulo
   (deferido): a falha do br-game.js pode ser anterior ao boot daqui. Por
   isso o portão além de receber o empurrão (__MP_onlineDown) também PUXA
   a bandeira que aquele arquivo deixa em window. */
const brQuebrado = () => MenuGate.broken || window.__BR_loadFailed || null;
/* `__MP_soloOnly` entra junto com `MenuGate.soloChosen` porque os dois são
   levantados no MESMO clique (ver o handler do #btnNew) — só que o de window é
   o público, o que o multiplayer-client.js lê pra não tomar a tela. Derivar
   dos dois deixa o menu correto mesmo quando a escolha de solo chega de fora
   (QA, ou um caminho novo que esqueça o interno). */
const emSolo = () => MenuGate.soloChosen || !!window.__MP_soloOnly;
/* EXISTE uma sala pra usar (mesmo com o socket fechado de propósito pelo
   solo). É o que decide se MULTIJOGADOR tem pra onde levar o jogador. */
const temSala = () => !!__mpSocket && !brQuebrado();
// ...e a sala está ATIVA agora: conectado, inteiro e com o jogador dentro dela
const salaNoAr = () => temSala() && !MenuGate.dropped && !emSolo();
function paintMenu() {
  const btn = document.getElementById('btnNew');
  if (!btn) return;
  const cfg = document.getElementById('btnSettings');
  const mult = document.getElementById('btnMulti');
  const aviso = document.getElementById('menuNotice');
  /* `state` só existe a partir da metade deste módulo, e paintMenu só é
     chamado do fim dele em diante (MenuGate.wired) ou de callbacks — mas
     ler por window.__game evita depender dessa ordem. Sem estado ainda =
     boot: não iniciado e, portanto, sem pausa. */
  const S = window.__game ? window.__game.state : null;
  const jogando = !!(S && S.started);
  const pausado = !!(S && S.paused);
  /* SOLO VALE SEMPRE. Ele já foi travado enquanto `salaNoAr()` fosse
     verdadeiro — e em produção o servidor está SEMPRE no ar, então o botão
     nunca era clicável: o menu tinha um botão morto. Hoje o único motivo pra
     travar é não ter dono (boot) ou já haver partida em andamento — com a
     partida rodando o #overlay é tela de PAUSA, e prometer "NOVO JOGO" ali
     seria mentira (startGame recusa). */
  let texto = null, travado = true, motivo = '';
  // etiqueta honesta: mesmo prefixo de sempre (index.html nasce com ele, e
  // /CARREGANDO/i é o sinal que outros testes/scripts já leem) + a fase REAL
  // que acabou de terminar (ver bootFase) — nunca uma barra fake.
  if (!MenuGate.wired) texto = 'CARREGANDO O MUNDO...' + (MenuGate.bootLabel ? ` (${MenuGate.bootLabel})` : '');
  else if (!jogando) { travado = false; texto = __mpSocket ? '▶ JOGAR SOLO' : '▶ NOVO JOGO — SOLO'; }
  if (MenuGate.wired && MenuGate.voltando)
    motivo = '⏳ VOLTANDO PRA SALA ONLINE... SE O MAPA JÁ TIVER MUDADO, A PÁGINA RECARREGA.';
  else if (MenuGate.wired && emSolo() && temSala())
    motivo = '🔌 JOGO SOLO — VOCÊ NÃO ESTÁ NA SALA ONLINE. MULTIJOGADOR TE LEVA PRA LÁ.';
  else if (MenuGate.wired && brQuebrado())
    motivo = '⚠ A SALA ONLINE NÃO CARREGOU — DÁ PRA JOGAR SOLO AGORA.';
  else if (MenuGate.wired && MenuGate.dropped)
    motivo = '⚠ CONEXÃO COM A SALA CAIU — TENTANDO VOLTAR. DÁ PRA JOGAR SOLO ENQUANTO ISSO.';
  if (texto !== null && btn.textContent !== texto) btn.textContent = texto;
  btn.classList.toggle('disabled', travado);
  btn.setAttribute('aria-disabled', String(travado));
  if (cfg) {
    cfg.classList.toggle('disabled', !MenuGate.wired);
    cfg.setAttribute('aria-disabled', String(!MenuGate.wired));
  }
  /* MULTIJOGADOR: só abre painel quando existe sala pra mostrar. Fora isso o
     rótulo conta o motivo em vez de aceitar um clique que não faria nada.
     Vindo do SOLO ele é a PORTA DE VOLTA — antes dizia "RECARREGUE A PÁGINA",
     que era a confissão de que a escolha de solo era de mão única. */
  if (mult) {
    // o espaço duplo do rótulo é o mesmo espaço-duro do index.html (&nbsp;):
    // sem ele o texto "pula" na primeira repintura
    const podeMp = MenuGate.wired && temSala() && !MenuGate.dropped && !MenuGate.voltando;
    let mtexto = '🌐  MULTIJOGADOR';
    if (!MenuGate.wired) mtexto = '🌐  MULTIJOGADOR — CARREGANDO...';
    else if (MenuGate.voltando) mtexto = '🌐  VOLTANDO PRA SALA...';
    else if (!temSala() || MenuGate.dropped) mtexto = '🌐  MULTIJOGADOR — SALA FORA DO AR';
    else if (emSolo() && jogando) mtexto = '🌐  MULTIJOGADOR — SAIR DO SOLO E VOLTAR';
    else if (emSolo()) mtexto = '🌐  MULTIJOGADOR — VOLTAR PRA SALA';
    if (mult.textContent !== mtexto) mult.textContent = mtexto;
    mult.classList.toggle('disabled', !podeMp);
    mult.setAttribute('aria-disabled', String(!podeMp));
  }
  if (aviso) { aviso.textContent = motivo; aviso.hidden = !motivo; }

  /* ---- painel de pausa: no BR a partida NÃO para, e isso é dito ----
     A partida é autoritativa no SERVIDOR. Parar o brTick local daria
     imunidade e dessincronizaria (é o vetor que playerDamage protege), então
     em vez de fingir congelamento a pausa conta a verdade. `brlive` é o
     gancho pro visual encolher o painel — ver docs/2026-08-09-menu-unico.md. */
  const ov = document.getElementById('overlay');
  const tag = document.getElementById('pausedTagText');
  const warn = document.getElementById('pausedWarn');
  const brAoVivo = jogando && pausado && !!window.__BR_active;
  if (ov) ov.classList.toggle('brlive', brAoVivo);
  if (tag) tag.textContent = brAoVivo ? '— MENU ABERTO · A PARTIDA CONTINUA —' : '— PAUSADO —';
  if (warn) {
    warn.textContent = brAoVivo
      ? 'A partida é do servidor: o gás, os tiros e o GOLEM não param enquanto este menu está aberto.'
      : '';
    warn.hidden = !brAoVivo;
  }
}
/* PROGRESSO HONESTO DO BOOT — troca a etiqueta "CARREGANDO O MUNDO..." por
   uma fase REAL (o texto só muda quando aquele pedaço do worldgen já
   terminou de rodar; ver as chamadas `await bootFase(...)` espalhadas pelo
   módulo) e cede a vez ao navegador pra pintar essa mudança AGORA — sem o
   `await` aqui, `paintMenu()` mexeria no DOM mas o resto do boot, que é
   síncrono, continuaria bloqueando o thread principal até o fim, e o
   usuário nunca veria a troca de etiqueta antes do módulo inteiro acabar.
   `setTimeout(0)`, não `requestAnimationFrame`: a aba pode estar oculta
   durante um teste automatizado (rAF não dispara — ver o comentário
   equivalente em scripts/vr-baseline.js) e o boot não pode depender disso
   pra continuar. `bootFases` é só o registro cru pra QA (test/carregamento-
   progresso.test.js) prezar que são fases DE VERDADE, não uma etiqueta
   estática mudando de cor. */
async function bootFase(label) {
  MenuGate.bootLabel = label;
  MenuGate.bootFases.push(label);
  paintMenu();
  await new Promise(resolve => setTimeout(resolve, 0));
}
/* ganchos do multiplayer-client.js: a sala online caiu / voltou (o BR pode
   chegar atrasado, e nesse caso o menu volta a ser dele) */
window.__MP_onlineDown = motivo => {
  MenuGate.broken = String(motivo || 'sala online indisponível');
  paintMenu();
};
window.__MP_onlineUp = () => { MenuGate.broken = null; paintMenu(); };

/* ================================================================
   MULTIPLAYER — bootstrap aditivo. Conecta ANTES da geração do mundo
   pra receber a seed da sala: mesma seed => mapa idêntico pra todos.
   Sem servidor (window.io ausente ou timeout de 3s), segue 100% solo.
   ================================================================ */
let __mpSocket = null, __mpSpawn = null;
if (window.io) {
  try {
    __mpSocket = window.io();
    const __mpInit = await new Promise(res => {
      const to = setTimeout(() => res(null), 3000);
      __mpSocket.once('init', d => { clearTimeout(to); res(d); });
    });
    if (__mpInit) {
      __mpSpawn = __mpInit.spawn;
      window.__MP_init = __mpInit;
      const __worldSeed = __mpInit.worldSeed >>> 0; // a seed que MONTOU este mundo
      let __mpS = __worldSeed; // mulberry32 seedado no lugar do Math.random
      Math.random = function () {
        __mpS = (__mpS + 0x6D2B79F5) | 0;
        let t = Math.imul(__mpS ^ (__mpS >>> 15), 1 | __mpS);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      /* RECONEXÃO ANTES DE O CLIENTE BR EXISTIR. O servidor manda um `init`
         FRESCO (id novo) a cada conexão, e o transporte do engine.io cai com
         facilidade durante o boot — a main thread fica travada montando o
         mundo. Quem adotava esse init era o multiplayer-client.js, que só
         boota depois de br-game.js terminar de baixar: nessa janela NINGUÉM
         escutava `init`, e o window.__MP_init ficava órfão do socket para
         sempre. Consequência real: o servidor sabe que este socket é o
         anfitrião, mas o cliente compara com um id morto e o botão de começar
         nunca destrava; pelo mesmo caminho, os eventos que o servidor manda
         pra TODOS endereçados por id (playerKilled, matchEnd) deixam de se
         reconhecer. Este é o ÚNICO listener de `init` do cliente: o BR assume
         o posto preenchendo window.__MP_onInit no boot — um slot, e não um
         segundo addListener, senão o mesmo init seria adotado duas vezes. */
      window.__MP_onInit = null;
      __mpSocket.on('init', d => {
        if (window.__MP_onInit) { window.__MP_onInit(d); return; }
        if (!d) return;
        /* Mesma seed = mesma sala e MESMO mundo: só a identidade mudou, e
           adotá-la é local (o servidor nunca confia em id declarado pelo
           cliente; `init` só chega do próprio socket). A seed seguindo igual,
           o Math.random seedado acima NÃO é refeito — a ordem de consumo do
           worldgen é contrato. Seed diferente = o mundo divergiu e recarregar
           é o caminho limpo (hookável como __MP_respawn: o QA preserva o
           contexto da página em vez de recarregar). */
        if ((d.worldSeed >>> 0) === __worldSeed) Object.assign(window.__MP_init, d);
        else (window.__MP_reload || (() => location.reload()))();
      });
      /* QUEDA DE SOCKET — o cliente inteiro não tratava isto em lugar
         nenhum. Sem estes dois handlers a sala podia morrer e o menu
         seguia dizendo "ABRINDO LOBBY..." num botão travado, sem saída.
         Só mexem em pintura de menu: nada de estado de jogo, nada de
         dano, nada de reload (o reconnect do socket.io continua dono da
         volta por si). */
      /* `dropped` significa "caiu SEM ninguém pedir". O botão SOLO agora fecha
         o socket de propósito (entrarEmSolo): tratar isso como queda faria o
         menu avisar "CONEXÃO CAIU — TENTANDO VOLTAR" numa saída voluntária, e
         travaria justamente o MULTIJOGADOR, que é a porta de volta. */
      __mpSocket.on('disconnect', () => { MenuGate.dropped = !emSolo(); paintMenu(); });
      __mpSocket.on('connect', () => {
        MenuGate.dropped = false;
        // volta do solo: quem abre o lobby é o chegouNaSala (declaração de
        // função, içada — ela mora lá embaixo, junto dos botões do menu)
        if (MenuGate.voltando) chegouNaSala(); else paintMenu();
      });
    } else { __mpSocket.close(); __mpSocket = null; }
  } catch (e) { console.warn('[MP] servidor indisponível — modo solo', e); __mpSocket = null; }
}


const { simplex, heightAt, buildHeightGrid, groundAt, slopeAt, terrainNormal, biomeAt,
  sampleAt, geometricNormalAt, slopeDegreesAt, surfaceAt, setBiomes,
  platforms, WATER_LEVEL, addObstacle, obstaclesNear, CITY, VOLCANO } = createTerrain({ lerp, clamp });
// grade CANÔNICA construída AQUI, antes de QUALQUER consumidor: malha visual,
// heightfield do Cannon, grama, spawns e consultas leem a MESMA superfície
// triangulada — a semântica de heightAt nunca troca durante a execução.
/* A/B de resolução (gap 12): ?segs=440 → célula 2,5 m. MUDA o layout do
   mundo pro mesmo seed (worldgen lê heightAt da grade) — ferramenta de
   MEDIÇÃO solo; adoção real = mudar CFG.TERRAIN_SEGS pra todos de uma vez. */
const _segsQA = +(new URLSearchParams(location.search).get('segs') || 0);
if (_segsQA >= 55 && _segsQA <= 880) {
  CFG.TERRAIN_SEGS = _segsQA;
  console.warn(`[A/B] TERRAIN_SEGS=${_segsQA} — mundo diverge do canônico`);
}
/* CELULAR — decidido ANTES de qualquer consumidor de CFG (névoa, camera.far,
   sombra, grama): adivinhar depois é tela travada no boot. `isMobileEnv()`
   (js/mobile.js) já respeita `?mobile=1` / `?mobile=0`, então QA liga o modo
   celular num desktop sem tocar em código. O corte NÃO encosta em WORLD_SIZE
   nem TERRAIN_SEGS — a grade de altura e a ordem do `rand` seedado (contrato
   do worldgen) saem idênticas às do desktop, o mapa é o MESMO pra todos. */
const __mobile = isMobileEnv();
if (__mobile) console.info('[celular] preset móvel:', JSON.stringify(applyMobileCfg()));
buildHeightGrid(CFG.WORLD_SIZE, CFG.TERRAIN_SEGS);
// biomas centralizados: pesos/limiar únicos p/ cores, grama, clima e debug
const Biomes = createBiomes({ simplex, heightAt, slopeAt,
  WATER_LEVEL, CITY, VOLCANO, cityCategory: CityLayout.cityCategory,
  smoothstep: THREE.MathUtils.smoothstep,
  GRASS_FADE1: CityLayout.GRASS_FADE1, CORE_RADIUS: CityLayout.CORE_RADIUS });
setBiomes(Biomes.classifyAt);

const SFX = createSFX({ SETTINGS, clamp, rand });

/* ================== renderer / cena / pós ================== */
const canvas = document.getElementById('game');
/* `antialias: true` existe POR CAUSA DO VR, e quase não custa no desktop. O
   three repassa esse atributo pro framebuffer da sessão XR
   (`samples: attributes.antialias ? 4 : 0`, WebXRManager.js): com `false`, o
   headset renderiza com ZERO amostra de MSAA — e em XR o EffectComposer está
   fora do caminho, então o SMAA do desktop também não existe lá. Resultado:
   serrilhado em tudo, que é metade do "a qualidade está horrível". No desktop
   o quadro passa pelos render targets do composer e o buffer do canvas só
   recebe o blit final, então o MSAA daqui praticamente não é exercido. */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
/* PRIMEIRO boot: a string da GPU escolhe o preset de partida (js/gputier.js).
   Existindo configuração salva o módulo não encosta em nada — a escolha
   manual do jogador vence e persiste. Roda ANTES do primeiro setPixelRatio
   e antes do pós ler bloom/SMAA, senão o preset chegaria tarde demais. */
const __tier = autoTierSettings({
  gl: renderer.getContext(),
  stored: (() => { try { return localStorage.getItem('callofai_cfg'); } catch { return null; } })(),
  settings: SETTINGS,
  search: location.search, // ?tier=alto|medio|baixo|off (suporte/QA)
  mobile: __mobile,        // celular tem preset próprio ('mobile'), não é "GPU fraca"
});
if (__tier.applied) {
  persistSettings(); // vira a config salva: a partir daqui quem manda é o jogador
  console.info(`[qualidade] tier "${__tier.tier}" (${__tier.reason})` +
    `${__tier.gpu ? ' — GPU: ' + __tier.gpu : ''} → ${JSON.stringify(__tier.preset)}`);
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, SETTINGS.res));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r184: PCFSoft foi absorvido pelo PCF (evita warning)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CFG.EXPOSURE; // ~0.6 (ACES)
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0xb9d1e4);
scene.fog = new THREE.Fog(FOG_COLOR, CFG.VIEW_DIST * 0.5, CFG.VIEW_DIST);

/* O `far` é o da NÉVOA, não 600 m além dela. A névoa é linear e satura em
   `CFG.VIEW_DIST`: tudo entre 420 e 1020 m era desenhado 100% da cor da névoa —
   pixel que não muda nada na tela e custa draw call em dobro no headset.
   Medido em sessão estéreo, mundo congelado: castelo 500 → 374 draw calls
   (−25%) e 1,67 M → 1,48 M triângulos.

   Duas coisas tinham que ser resolvidas ANTES, e foram:
   1. Os feixes de findability (`js/farbeacon.js`) prendem o z no far e
      continuam visíveis de qualquer canto do mapa — sem isso, encurtar o far
      apagaria um recurso de orientação.
   2. As estrelas moravam a 1500 m e já eram recortadas hoje (o céu noturno
      estava 96% vazio); foram trazidas para 300 m em js/env.js.

   O que muda na tela: relevo além de 420 m deixa de ocluir o que está além de
   420 m — e esse relevo é 100% cor de névoa. Dentro dos 420 m, idêntico. */
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, CFG.VIEW_DIST);
camera.position.set(0, 3, 8);

/* ---- XR (Quest) ----
   Fachada única do porte pra headset: ambiente, sessão e rig de câmera.
   Criar aqui é seguro porque NADA disto aloca — o rig é preguiçoso de
   propósito, já que todo Object3D novo gasta 4 números do `Math.random`
   seedado (linha ~201) e deslocaria o worldgen inteiro. Quem cria o rig
   é a primeira sessão de verdade, muito depois do mundo montado. */
const entradaXR = criarEntradaXR();
/* TATO E TAXA DE QUADROS DA SESSÃO. Nenhum dos dois aloca `Object3D` — só
   número e objeto simples — então podem nascer aqui sem gastar os 4 números do
   `Math.random` seedado do UUID. Fora de XR `getSession()` devolve null e o
   `emitir` sai na terceira linha. */
const XRTato = createXrHaptics({
  getSession: () => (renderer.xr && renderer.xr.getSession && renderer.xr.getSession()) || null,
});
const XRTaxa = createXrFrameRate();   // alvo 72 Hz
/* PEGAR ITEM vibra. O vocabulário de pulsos já previa `pegar` e ele era o
   único dos seis eventos sem emissor. Os dois lugares que pegam coisa do chão
   (js/interact.js e js/pickups.js) passam pelo mesmo `SFX.pickup()`, então
   decorar o som é o gancho exato — e não obriga os dois módulos a conhecerem
   háptico de VR, que não é assunto deles. */
{
  const somPegar = SFX.pickup.bind(SFX);
  SFX.pickup = (...a) => { XRTato.emitir('pegar', { mao: 'right' }); return somPegar(...a); };
}
let _uiFocoAntes = '';                // borda de hover do painel, pro tique de UI
let xrYaw = 0;              // giro artificial acumulado (js/xr/xrturn.js), em radianos
const _passoXR = { x: 0, z: 0 };   // passo físico do cômodo, drenado do rig por frame
// onde o passo deveria ter chegado, para saber o que a colisão comeu (ver tick)
const _alvoPassoXR = { x: 0, z: 0, dx: 0, dz: 0, pedido: 0 };
let aoMudarSessaoXr = () => {}; // preenchido lá embaixo, quando o botão existe
const _xrCabeca = new THREE.Vector3();
const XR = createXrBoot({ THREE, renderer, scene, camera,
  /* O preset de qualidade da sessão (js/xr/xrquality.js) precisa do CSM, e o
     CSM nasce DEPOIS desta chamada — por isso um resolvedor preguiçoso, e não
     o objeto: destructuring avalia na hora e cairia na zona morta do `const`.
     O headset desenha duas vezes por frame a 72 Hz, e as cascatas de sombra
     distantes são a maior fatia configurável do quadro (+42 draw calls de 240,
     medido por subtração). Aplicado ao entrar e DESFEITO ao sair — preset que
     vaza pro desktop é regressão de PC. */
  getCsm: () => csm, CFG,
  /* TUDO que a sessão criou sai aqui. Sem `XRUI.exit()`/`XRHud.exit()` o
     painel de VR ficava GRUDADO NO MONITOR depois de tirar o headset —
     `depthTest: false` e `renderOrder` alto, por cima do jogo, com o jogo
     pausado e sem nenhum caminho de fechar. E o gatilho era a própria pausa
     por perda de foco: tirar o aparelho abria o painel sozinho. */
  onEnter: () => { XRAndar.aplicar(); aoMudarSessaoXr(); },
  onExit: () => { XRAndar.restaurar(); XRArma.exit(); XRInterage.exit(); XRUI.exit(); XRHud.exit(); aoMudarSessaoXr(); } });
/* FOVEAÇÃO: o three nasce em 1.0 — o MÁXIMO ("Set default foveation to
   maximum", WebXRManager.js:46). Foveação máxima manda o compositor renderizar
   a PERIFERIA em resolução baixa; no Quest isso é um borrão que acompanha a
   cabeça, e o jogador enxerga como imagem ruim sem saber nomear. Ninguém nunca
   chamou `setFoveation` aqui, então o jogo rodou o tempo todo no pior ajuste
   possível de nitidez. 0,2 mantém o centro inteiro e ainda alivia o extremo da
   borda; 0 seria resolução cheia em todo o campo. */
renderer.xr.setFoveation(0.2);

// ambiente PMREM para os MeshStandardMaterial não ficarem chapados
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
}

/* ---- céu + sol ---- */
const sky = new Sky();
sky.scale.setScalar(45000);
scene.add(sky);
const SUN_ELEV = 27, SUN_AZIM = 155; // fim de tarde dourado
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZIM));
{
  const u = sky.material.uniforms;
  u.turbidity.value = 1.8;
  u.rayleigh.value = 1.15;          // horizonte menos estourado
  u.mieCoefficient.value = 0.0008;  // halo do sol bem contido (sem véu branco)
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  if (u.cloudCoverage) { // nuvens procedurais do Sky no r184
    u.cloudCoverage.value = 0.38;
    u.cloudDensity.value = 0.45;
  }
  /* Compressão soft-Reinhard do glare HDR do céu: `texColor/(1+k*texColor)`
     satura em 1/k, então k decide QUANTO do céu passa do limiar do bloom.

     Antes k era fixo em 0,55 (teto 1,82) e o limiar do bloom é 1,0 — ou seja,
     todo céu com radiância bruta acima de 2,22 florescia. No golden hour o
     `mieCoefficient` sobe de 0,0008 para 0,0078 (~10×) e o halo do sol vira
     uma área enorme acima desse valor: o horizonte inteiro virava um borrão
     branco. Agora k é uniform e acompanha o próprio mie — quanto maior o
     halo, mais apertada a compressão. Fora do golden hour nada muda. */
  u.uGlare = { value: CFG.GLARE_BASE };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform float uGlare;\nvoid main() {')
    .replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'gl_FragColor = vec4( texColor / ( 1.0 + uGlare * texColor ), 1.0 );'
    );
}

/* ---- luzes ---- */
const hemiLight = new THREE.HemisphereLight(0xa9cdf2, 0x687a4d, 0.42);
scene.add(hemiLight);
const ambLight = new THREE.AmbientLight(0xffffff, 0.16);
scene.add(ambLight);

// Cascaded Shadow Maps — 4 cascatas para sombra nítida perto e barata longe
const csm = new CSM({
  maxFar: CFG.CSM_MAX_FAR,
  cascades: 4,
  mode: 'practical',
  parent: scene,
  shadowMapSize: CFG.SHADOW_MAP_SIZE,
  lightDirection: sunDir.clone().negate().normalize(),
  camera,
  lightIntensity: 1.8,
});
csm.fade = true;
for (const l of csm.lights) {
  l.color.setHex(0xffe7c0);
  l.shadow.bias = -0.00022;
  l.shadow.normalBias = 0.02;
}
let csmFarCursor = 1, csmFullRefresh = true, csmLastUpdateMask = 0;
for (let i = 0; i < csm.lights.length; i++)
  csm.lights[i].shadow.autoUpdate = i === 0;
const csmLastCameraPos = camera.position.clone();
const csmLastCameraQuat = camera.quaternion.clone();
const csmLastLightDirection = csm.lightDirection.clone();
const CSM_CAMERA_JUMP_SQ = (CFG.CSM_MAX_FAR / 8) ** 2;
const CSM_CAMERA_TURN = THREE.MathUtils.degToRad(30);
const CSM_LIGHT_TURN = THREE.MathUtils.degToRad(2);
function invalidateCsmShadows() { csmFullRefresh = true; }
function invalidateCsmDiscontinuities() {
  if (camera.position.distanceToSquared(csmLastCameraPos) > CSM_CAMERA_JUMP_SQ ||
      camera.quaternion.angleTo(csmLastCameraQuat) > CSM_CAMERA_TURN ||
      csm.lightDirection.angleTo(csmLastLightDirection) > CSM_LIGHT_TURN)
    invalidateCsmShadows();
  csmLastCameraPos.copy(camera.position);
  csmLastCameraQuat.copy(camera.quaternion);
  csmLastLightDirection.copy(csm.lightDirection);
}
function scheduleCsmShadows() {
  csmLastUpdateMask = 0;
  for (let i = 0; i < csm.lights.length; i++) {
    const shadow = csm.lights[i].shadow;
    shadow.autoUpdate = i === 0;
    shadow.needsUpdate = false;
  }
  if (!renderer.shadowMap.enabled) return;
  if (csmFullRefresh) {
    for (let i = 0; i < csm.lights.length; i++) {
      csm.lights[i].shadow.needsUpdate = true;
      csmLastUpdateMask |= 1 << i;
    }
    csmFullRefresh = false;
    return;
  }
  if (csm.lights.length <= 1) return;
  csm.lights[csmFarCursor].shadow.needsUpdate = true;
  csmLastUpdateMask = 1 << csmFarCursor;
  csmFarCursor = csmFarCursor + 1 < csm.lights.length ? csmFarCursor + 1 : 1;
}
function csmShadowMask(key) {
  let mask = 0;
  for (let i = 0; i < csm.lights.length; i++)
    if (csm.lights[i].shadow[key]) mask |= 1 << i;
  return mask;
}
// registrar materiais que recebem as cascatas
const csmMaterials = [];
function csmMat(mat) { csm.setupMaterial(mat); csmMaterials.push(mat); return mat; }
csmMat.unregister = mat => {
  for (let i = csmMaterials.length - 1; i >= 0; i--)
    if (csmMaterials[i] === mat) csmMaterials.splice(i, 1);
  const shader = csm.shaders.get(mat);
  csm.shaders.delete(mat);
  if (shader) {
    delete shader.uniforms.CSM_cascades;
    delete shader.uniforms.cameraNear;
    delete shader.uniforms.shadowFar;
  }
  if (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile'))
    delete mat.onBeforeCompile;
  if (mat.defines) {
    delete mat.defines.USE_CSM;
    delete mat.defines.CSM_CASCADES;
    delete mat.defines.CSM_FADE;
  }
};

/* ---- composer: Render -> Bloom -> SMAA -> Output (Output SEMPRE por último) ---- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CFG.BLOOM_STRENGTH, CFG.BLOOM_RADIUS, CFG.BLOOM_THRESHOLD
);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
composer.addPass(smaaPass);
composer.addPass(new OutputPass());
bloomPass.enabled = +SETTINGS.bloom !== 0;
/* SMAA são 3 passes em resolução CHEIA (bordas, pesos, mistura) — sozinho custa
   mais que o passe da cena inteira, e era o único efeito sem botão. Desligar só
   deixa a borda serrilhada: não muda geometria, culling nem o que fica visível,
   então não abre vantagem competitiva. */
smaaPass.enabled = +SETTINGS.aa !== 0;
if (+SETTINGS.shadow === 0) renderer.shadowMap.enabled = false;

/* ---- resolução: teto do jogador + escala adaptativa ----
   BUG que isto conserta: o EffectComposer congela o pixelRatio na
   construção e só o atualiza via setPixelRatio(). O menu chamava apenas
   renderer.setPixelRatio(), então trocar "Resolução" mudava o canvas mas
   NÃO os render targets do pós — quem baixava pra "Desempenho" pra fugir
   do travamento continuava renderizando na resolução do boot. */
function pixelRatioCeiling() {
  // localStorage corrompido faz `+SETTINGS.res` virar NaN; setPixelRatio(NaN)
  // zera o canvas (tela preta). Lixo aqui cai no padrão.
  const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const wanted = +SETTINGS.res;
  return Math.min(dpr, Number.isFinite(wanted) && wanted > 0 ? wanted : 1);
}
function applyPixelRatio(value) {
  /* EM XR A RESOLUÇÃO NÃO É NOSSA. O framebuffer pertence à sessão:
     `setPixelRatio`/`setSize` viram no-op com aviso no console. E é
     exatamente em XR que o escalador adaptativo mais tentaria mexer —
     ele reage a frame estourado, que no começo de uma sessão é a regra.
     Seria enxurrada de aviso sem mudar um pixel. O botão equivalente em
     XR é `renderer.xr.setFramebufferScaleFactor`, e ele é assunto da
     triagem de perf (Fase 2), não deste caminho. */
  if (XR.presenting) return;
  renderer.setPixelRatio(value);
  composer.setPixelRatio(value); // sem isto o pós continua na razão antiga
}
/* No celular o piso de desktop (0,75) não dá folga: quando o frame estoura,
   0,75 ainda é caro demais e a escala fica presa no chão sem resolver. */
const resScaler = createResolutionScaler(__mobile
  ? { ceiling: pixelRatioCeiling(), floor: MOBILE_RES_FLOOR }
  : { ceiling: pixelRatioCeiling() });
applyPixelRatio(resScaler.scale);

/* Overlay de diagnóstico (F3 ou ?perf=1): p50, p1%, engasgos, draw calls,
   triângulos e escala de resolução. Desligado não custa nada — e enquanto
   está ligado assume o `renderer.info` (ver js/perfhud.js). */
const perfHud = createPerfHud({ renderer,
  getScale: () => resScaler.scale, getCeiling: () => resScaler.ceiling });

/* ---- prewarm: linka os programas WebGL fora do tiroteio ---- */
const prewarm = createPrewarm({ renderer, scene, camera });
let prewarmBusy = false, prewarmNextAt = 0;
/* Janela segura = menu, lobby ou pausa. Aqui ninguém sente meio segundo
   de compilação; no meio do combate seria o travamento que queremos matar. */
function prewarmIfIdle(nowMs) {
  if (prewarmBusy || nowMs < prewarmNextAt) return;
  prewarmBusy = true;
  prewarmNextAt = nowMs + 1000;
  // sem await no loop: rejeição aqui viraria unhandledrejection no console
  Promise.resolve(prewarm.flush()).catch(() => {}).finally(() => { prewarmBusy = false; });
}

/* ================== física (cannon-es) ================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
/* O collisionPairs de fábrica varre TODO par (i,j) porque estático×estático
   dá `continue` em vez de `break`: com ~1000 colisores de cenário parados
   era 47% da CPU do cliente. installFastSAP troca só a varredura por uma
   equivalente O(N × ativos) — mesmos pares, mesma ordem (js/sapbroadphase.js,
   equivalência provada em test/sap-broadphase.test.js). */
world.broadphase = installFastSAP(new CANNON.SAPBroadphase(world));
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.05;

/* heightfield na MESMA grade do PlaneGeometry visual (célula de 5 m, mesmos
   vértices, MESMA diagonal de triangulação) — física e malha descrevem a
   mesma superfície; carros deixam de flutuar/afundar entre as duas. */
{
  const elem = CFG.WORLD_SIZE / CFG.TERRAIN_SEGS;
  const n = CFG.TERRAIN_SEGS + 1;
  const half = CFG.WORLD_SIZE / 2;
  const data = [];
  for (let i = 0; i < n; i++) {
    data.push([]);
    for (let j = 0; j < n; j++) {
      data[i].push(heightAt(-half + j * elem, -half + i * elem));
    }
  }
  const hfShape = new CANNON.Heightfield(data, { elementSize: elem });
  const hfBody = new CANNON.Body({ mass: 0 });
  hfBody.addShape(hfShape);
  /* eixos locais x→+Z, y→+X, z→+Y (rotação de -120° em torno de (1,1,1)):
     alinha a diagonal das células do cannon com a do PlaneGeometry — com a
     orientação antiga cada célula divergia dentro dos triângulos. */
  hfBody.quaternion.set(-0.5, -0.5, -0.5, 0.5);
  hfBody.position.set(-half, 0, -half);
  hfBody.updateAABB();
  world.addBody(hfBody);
}

/* ================== terreno visual ================== */
const COL_GRASS_A = new THREE.Color(0x55973e); // grama base
const COL_GRASS_B = new THREE.Color(0x6fae4a); // grama clara
const COL_SAND    = new THREE.Color(0xd7c08c);
const COL_ROCK    = new THREE.Color(0x8d8f96);
const COL_DIRT    = new THREE.Color(0x9a7e54);
const COL_FOREST  = new THREE.Color(0x3e7a31);
const COL_SNOW    = new THREE.Color(0xe8eef4);
const COL_BASALT  = new THREE.Color(0x241d1a); // rocha vulcânica escura
const COL_CITY_GROUND = new THREE.Color(0x34373d); // base escura sob o distrito (asfalto/terra batida)

let terrainMesh;
{
  const g = new THREE.PlaneGeometry(CFG.WORLD_SIZE, CFG.WORLD_SIZE, CFG.TERRAIN_SEGS, CFG.TERRAIN_SEGS);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = slopeAt(x, z);
    const nVar = simplex.noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
    c.copy(COL_GRASS_A).lerp(COL_GRASS_B, nVar);
    // fatores de bioma da fonte CENTRAL (js/biomes.js) — mesmos limiares de antes
    const cls = Biomes.classifyAt(x, z);
    c.lerp(COL_SAND, cls.desertK);    // bioma deserto
    c.lerp(COL_FOREST, cls.forestK);  // bioma floresta
    if (h < 0.9) c.lerp(COL_SAND, THREE.MathUtils.smoothstep(0.9 - h, 0, 1.4));       // baixadas arenosas
    if (slope > 0.45) c.lerp(COL_DIRT, THREE.MathUtils.smoothstep(slope, 0.45, 0.75)); // barranco
    if (slope > 0.7) c.lerp(COL_ROCK, THREE.MathUtils.smoothstep(slope, 0.7, 1.05));   // rocha
    if (h > 17) c.lerp(COL_ROCK, THREE.MathUtils.smoothstep(h, 17, 26));               // topos rochosos
    if (h > 21) c.lerp(COL_SNOW, THREE.MathUtils.smoothstep(h, 21, 28));               // picos nevados
    // vulcão: basalto escuro cobre neve/rocha clara (casa com o modelo 3D)
    const dVol = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dVol < VOLCANO.r * 1.15)
      c.lerp(COL_BASALT, 0.9 * (1 - THREE.MathUtils.smoothstep(dVol, VOLCANO.r * 0.8, VOLCANO.r * 1.15)));
    // distrito urbano: base escura sob ruas/prédios (a geometria da rua cobre por
    // cima); canteiros verdes mantêm grama; borda esmaece de volta ao terreno
    const dCity = Math.hypot(x - CITY.x, z - CITY.z);
    if (dCity < CityLayout.GRASS_FADE1 + 4) {
      const cat = CityLayout.cityCategory(x, z);
      if (cat === 'green') { /* canteiro: mantém verde */ }
      else if (cat) c.lerp(COL_CITY_GROUND, 0.85);
      else {
        const k = 1 - THREE.MathUtils.smoothstep(dCity, CityLayout.CORE_RADIUS, CityLayout.GRASS_FADE1);
        c.lerp(COL_CITY_GROUND, 0.85 * k);
      }
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.0 }));
  terrainMesh = new THREE.Mesh(g, m);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
}

/* ================== água: lagos nas bacias do terreno ================== */
const Water = createWater({ CFG, WATER_LEVEL, scene, sunDir });

/* ================================================================
   GRAMA REATIVA — InstancedMesh em chunks que acompanham o player.
   Vento no vertex shader + dobra quando player/carro passam.
   ================================================================ */
/* Clareiras de grama sob as vagas de veículos: o array é preenchido DEPOIS
   (Structures ainda não existe aqui) e a grama refaz os chunks já criados.
   A criação da Grass NÃO pode mudar de lugar: ela consome o rand seedado e
   qualquer reordenação muda o layout do mundo inteiro pra mesma seed. */
const grassClearings = [];
const Grass = createGrass({ CFG, rand, TAU, heightAt, biomeAt, WATER_LEVEL, simplex, scene, sunDir, CITY, VOLCANO, clearings: grassClearings, cityGrassFactor: CityLayout.cityGrassFactor,
  worldSeed: ((window.__MP_init && window.__MP_init.worldSeed) >>> 0) || 424242, surfaceAt,
  // celular: menos chunks re-preenchidos por frame. É só PACING — o conteúdo
  // de cada chunk é determinístico por (cx,cz) no RNG local da grama, então
  // QUANDO ele é preenchido não muda um byte do mundo.
  rebuildBudget: __mobile ? MOBILE_GRASS_REBUILD_BUDGET : undefined });
await bootFase('terreno e grama');

/* ================================================================
   VEGETAÇÃO — árvores (2 LODs), pedras e flores, tudo InstancedMesh
   ================================================================ */
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

function paintGeometry(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const _c = new THREE.Color();

/* árvore "gota de goma": tronco + 3 esferas de copa, mescladas com vertex color */
function treeGeoHigh() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 2.8, 7, 1);
  trunk.translate(0, 1.4, 0);
  parts.push(paintGeometry(trunk, _c.setHex(0x6b4a2e)));
  const s1 = new THREE.SphereGeometry(1.95, 12, 9);  s1.scale(1, 0.92, 1);  s1.translate(0, 3.7, 0);
  parts.push(paintGeometry(s1, _c.setHex(0x4e8a35)));
  const s2 = new THREE.SphereGeometry(1.45, 11, 8);  s2.translate(0.55, 4.95, 0.25);
  parts.push(paintGeometry(s2, _c.setHex(0x5d9c3e)));
  const s3 = new THREE.SphereGeometry(1.05, 10, 7);  s3.translate(-0.45, 5.55, -0.2);
  parts.push(paintGeometry(s3, _c.setHex(0x6cab46)));
  return BufferGeometryUtils.mergeGeometries(parts);
}
function treeGeoLow() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 5, 1);
  trunk.translate(0, 1.3, 0);
  parts.push(paintGeometry(trunk, _c.setHex(0x6b4a2e)));
  const crown = new THREE.SphereGeometry(2.1, 7, 5); crown.scale(1, 1.25, 1); crown.translate(0, 4.3, 0);
  parts.push(paintGeometry(crown, _c.setHex(0x558f39)));
  return BufferGeometryUtils.mergeGeometries(parts);
}

const treeMat = csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
const treeHiMesh = new THREE.InstancedMesh(treeGeoHigh(), treeMat, CFG.TREE_COUNT);
const treeLoMesh = new THREE.InstancedMesh(treeGeoLow(), treeMat, CFG.TREE_COUNT);
treeHiMesh.castShadow = treeHiMesh.receiveShadow = true;
treeLoMesh.castShadow = true;
treeHiMesh.frustumCulled = false; // a malha cobre o mapa todo; culling por instância não compensa
treeLoMesh.frustumCulled = false;
scene.add(treeHiMesh, treeLoMesh);

const Structures = createStructures({ clamp, rand, TAU, heightAt, slopeAt, platforms, WATER_LEVEL, CITY, scene, csmMat, paintGeometry });

// clareiras de grama: uma por vaga de veículo + o buggy do spawn (7.5, -6).
// O refill (Grass.refreshAll) roda no FIM do init: fillChunk consome o rand
// seedado e aqui ainda deslocaria o stream das árvores/vegetação.
grassClearings.push({ x: 7.5, z: -6, r: 4.5 },
  Structures.castle.clearing,
  ...Structures.towerClearings, // escada das torres de vigia: grama não atravessa degrau
  ...Structures.carSpots.map(s => ({ x: s.x, z: s.z, r: s.type === 'truck' ? 5.5 : 4.5 })));

/* paredes das construções também são sólidas pra física dos veículos —
   sem isso carro/caminhão atravessavam prédios, fortes e muros */
for (const b of Structures.walls) {
  if (b.noCollide) continue;
  const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2, hz = (b.z1 - b.z0) / 2;
  if (hx < 0.04 || hy < 0.04 || hz < 0.04) continue;
  const wb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  wb.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  wb.userData = {
    category: 'rigid',
    sourceId: b.city ? 'city-wall' : b.castle ? 'castle-wall' : 'wall',
    hardForVehicle: true,
  };
  wb.updateAABB(); // CANNON calcula o AABB na criação (origem) e nunca mais — sem isto o broadphase não enxerga o corpo
  world.addBody(wb);
  if (b.castle) Structures.castle.registerPhysicsBody(world, wb);
  if (b.city) Structures.city.registerBody(wb); // destruição da cidade remove estes
}
/* ESCOMBROS: os colisores das ruínas só entram em Structures.walls no destroy(),
   depois deste loop — sem um corpo criado aqui o entulho barrava jogador e bala
   mas o CARRO ATRAVESSAVA. Os corpos nascem prontos (com updateAABB) e ficam
   FORA do mundo; a cidade os adiciona/remove junto com a troca de estado. */
for (const b of Structures.ruinWalls) {
  const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2, hz = (b.z1 - b.z0) / 2;
  if (hx < 0.04 || hy < 0.04 || hz < 0.04) continue;
  const rb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  rb.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  rb.userData = { category: 'rigid', sourceId: 'city-ruin', hardForVehicle: true };
  rb.updateAABB(); // estático posicionado após o construtor: AABB ficaria na origem
  Structures.city.registerRuinBody(rb);
}
Structures.city.bindPhysics(world);

/* apoio físico do castelo para RaycastVehicle. O player/IA consulta
   groundAt(), mas as rodas só enxergam corpos CANNON: sem estas superfícies
   o terreno ondulado reaparecia por baixo do pátio e da rampa visual. */
for (const surface of Structures.castle.vehicleSurfaces) {
  const hx = (surface.x1 - surface.x0) / 2;
  const hy = surface.thickness / 2;
  let hz = (surface.z1 - surface.z0) / 2;
  const body = new CANNON.Body({ mass: 0 });

  if (surface.kind === 'ramp') {
    const centerZ = (surface.z0 + surface.z1) / 2;
    body.position.set((surface.x0 + surface.x1) / 2, 0, centerZ);
    const vertices = [];
    const indices = [];
    const nodes = [
      { z: surface.segments[0].z0, y: surface.segments[0].y0 },
      ...surface.segments.map(segment => ({ z: segment.z1, y: segment.y1 })),
    ];
    // Quatro vértices por nó: topo E/D e fundo E/D. A malha fechada não
    // deixa faces verticais internas que prendam o chassi entre segmentos.
    for (const node of nodes) {
      vertices.push(
        -hx, node.y, node.z - centerZ,
        hx, node.y, node.z - centerZ,
        -hx, node.y - surface.thickness, node.z - centerZ,
        hx, node.y - surface.thickness, node.z - centerZ,
      );
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = i * 4, b = (i + 1) * 4;
      indices.push(
        a, b, b + 1, a, b + 1, a + 1,             // topo
        a + 3, b + 3, b + 2, a + 3, b + 2, a + 2, // fundo
        a, a + 2, b + 2, a, b + 2, b,             // lateral esquerda
        a + 1, b + 1, b + 3, a + 1, b + 3, a + 3, // lateral direita
      );
    }
    const last = (nodes.length - 1) * 4;
    indices.push(
      0, 1, 3, 0, 3, 2,                         // tampa interna
      last, last + 2, last + 3, last, last + 3, last + 1, // tampa externa
    );
    body.addShape(new CANNON.Trimesh(vertices, indices));
  } else {
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(
      (surface.x0 + surface.x1) / 2,
      surface.topY - hy,
      (surface.z0 + surface.z1) / 2,
    );
  }

  body.userData = {
    category: 'structural',
    sourceId: 'castle-surface',
    castlePart: surface.castlePart,
    hardForVehicle: false,
  };
  body.updateAABB();
  world.addBody(body);
  Structures.castle.registerPhysicsBody(world, body);
}

/* lajes FÍSICAS do pavimento urbano: o asfalto/calçada visual fica ~0,1 m
   acima do terreno; sem corpo os veículos afundavam as rodas no visual.
   Registradas na cidade: somem na destruição junto com o pavimento visual. */
{
  const cx = CITY.x, cz = CITY.z, gy = heightAt(cx, cz);
  const SW = CityLayout.CITY_CONST.SIDEWALK_W;
  const registerSlab = body => {
    body.userData = { category: 'structural', sourceId: 'street-slab', hardForVehicle: false };
    body.updateAABB();
    world.addBody(body);
    Structures.city.registerBody(body);
  };
  for (const r of CityLayout.ROADS) {
    const hx = (r.x1 - r.x0) / 2 + SW, hz = (r.z1 - r.z0) / 2 + SW, hy = 0.45;
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    // topo = topo do asfalto (trimBox de 0.12 centrado em gy+0.08)
    b.position.set(cx + (r.x0 + r.x1) / 2, gy + 0.14 - hy, cz + (r.z0 + r.z1) / 2);
    registerSlab(b);
  }
  { // praça pavimentada (disco ao redor da torre)
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(CityLayout.PLAZA.r, CityLayout.PLAZA.r, 0.9, 20) });
    b.position.set(cx, gy + 0.08 - 0.45, cz);
    registerSlab(b);
  }
}

const treeSpots = []; // posições das árvores (LOD + minimapa)
{
  const lim = CFG.WORLD_SIZE * 0.47;
  let tries = 0;
  while (treeSpots.length < CFG.TREE_COUNT && tries++ < CFG.TREE_COUNT * 30) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (Math.hypot(x, z) < 26) continue;                       // longe do spawn
    if (slopeAt(x, z) > 0.5) continue;                         // sem árvore em barranco
    const y = heightAt(x, z);
    if (y < 0.8) continue;                                     // nem na areia
    const bio = biomeAt(x, z);
    if (bio < -0.18) continue;                                 // deserto: sem árvores
    // bosques: ruído decide densidade; floresta é bem mais densa
    if (simplex.noise(x * 0.006 + 50, z * 0.006 - 80) < (bio > 0.34 ? -0.3 : 0.05)) continue;
    let nearBuild = false;
    for (const st of Structures.sites) if (Math.hypot(x - st.x, z - st.z) < st.r + 4) { nearBuild = true; break; }
    if (nearBuild) continue;
    const sRand = rand(0.75, 1.5);
    const isExcluded = (CITY && Math.hypot(x - CITY.x, z - CITY.z) < 92) ||
                       (VOLCANO && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r) ||
                       Structures.castle.excludesGuardRoute(x, z);
    const s = isExcluded ? 0.0001 : sRand;
    // variação de cor: verdes, outono dourado e tons profundos por região
    const cv = simplex.noise(x * 0.004 - 90, z * 0.004 + 60);
    const tint = cv > 0.45 ? 0xffaa58 : cv > 0.3 ? 0xffd98a : cv < -0.45 ? 0x7ddf9a : 0xffffff;
    const rot = rand(TAU);
    treeSpots.push({ x, y: isExcluded ? -100 : y, z, s, rot, tint });
    if (!isExcluded) {
      addObstacle(x, z, 0.45 * s, { category: 'rigid', sourceId: 'tree' });
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.32 * s, 1.8, 0.32 * s)) });
      body.position.set(x, y + 1.8, z);
      body.userData = { category: 'rigid', sourceId: 'tree:' + treeSpots.length, hardForVehicle: true };
      body.updateAABB(); // idem paredes: AABB ficava na origem
      world.addBody(body);
    }
  }
}
await bootFase('construções e árvores');

/* re-balanceia LOD por distância (perto = detalhada, longe = barata) */
const TREE_LOD_DIST = 70;
const _dummy = new THREE.Object3D();
let treeVariantMeshes = null; // [InstancedMesh] quando os GLBs chegam
function rebucketTrees(px, pz) {
  let lo = 0;
  if (treeVariantMeshes) {
    const counts = treeVariantMeshes.map(() => 0);
    for (const t of treeSpots) {
      _dummy.position.set(t.x, t.y - 0.15, t.z);
      _dummy.rotation.set(0, t.rot, 0);
      _dummy.scale.setScalar(t.s);
      _dummy.updateMatrix();
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < TREE_LOD_DIST) {
        const m = treeVariantMeshes[t.variant || 0];
        m.setColorAt(counts[t.variant || 0], _c.setHex(t.tint));
        m.setMatrixAt(counts[t.variant || 0]++, _dummy.matrix);
      } else if (d < CFG.VIEW_DIST) { treeLoMesh.setColorAt(lo, _c.setHex(t.tint)); treeLoMesh.setMatrixAt(lo++, _dummy.matrix); }
    }
    treeVariantMeshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  } else {
    let hi = 0;
    for (const t of treeSpots) {
      _dummy.position.set(t.x, t.y - 0.15, t.z);
      _dummy.rotation.set(0, t.rot, 0);
      _dummy.scale.setScalar(t.s);
      _dummy.updateMatrix();
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < TREE_LOD_DIST) { treeHiMesh.setColorAt(hi, _c.setHex(t.tint)); treeHiMesh.setMatrixAt(hi++, _dummy.matrix); }
      else if (d < CFG.VIEW_DIST) { treeLoMesh.setColorAt(lo, _c.setHex(t.tint)); treeLoMesh.setMatrixAt(lo++, _dummy.matrix); }
    }
    treeHiMesh.count = hi;
    treeHiMesh.instanceMatrix.needsUpdate = true;
    if (treeHiMesh.instanceColor) treeHiMesh.instanceColor.needsUpdate = true;
  }
  treeLoMesh.count = lo;
  treeLoMesh.instanceMatrix.needsUpdate = true;
  if (treeLoMesh.instanceColor) treeLoMesh.instanceColor.needsUpdate = true;
}

/* ---- cenário 3D dos assets: árvores reais instanciadas + pontos de interesse ---- */
const Scenery = createScenery();
(async () => {
  try {
    // três famílias de árvore (a "assets" é um bosquete inteiro por instância)
    const geos = await Promise.all([
      Scenery.bakedGeometry('/assets/models/Cenários/giant_low_poly_tree.glb', { height: 12 }),
      Scenery.bakedGeometry('/assets/models/Cenários/low_poly_tree_with_twisting_branches.glb', { height: 8.5 }),
      Scenery.bakedGeometry('/assets/models/Cenários/low_poly__tree_assets.glb', { height: 7 }),
      Scenery.bakedGeometry('/assets/models/Cenários/low_poly_tree_log_and_stump.glb', { height: 1.3 }),
    ]);
    treeVariantMeshes = geos.map(g => {
      const m = new THREE.InstancedMesh(g, treeMat, CFG.TREE_COUNT);
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    treeHiMesh.count = 0;
    treeHiMesh.visible = false;
    for (let i = 0; i < treeSpots.length; i++) {
      const t = treeSpots[i];
      const bio = biomeAt(t.x, t.z);
      // campo: retorcidas; floresta: bosquetes densos; 8% tocos;
      // a "giant tree" é uma ILHA FLUTUANTE com bonsai — vira marco raro (1/40)
      t.variant = (i % 40 === 0 && bio > 0.3) ? 0
        : (i % 12 === 0) ? 3
          : bio > 0.34 ? (i % 2 ? 1 : 2) : (i % 3 === 0 ? 2 : 1);
      // escala pelo índice (sem rand(): este bloco roda em timing assíncrono e
      // o stream semeado precisa ficar idêntico entre os clientes)
      if (t.variant === 3) t.s = 0.8 + (i % 5) * 0.1;  // toco não vira arbusto gigante
      if (t.variant === 0) t.s = 1.2 + (i % 5) * 0.1;  // ilha flutuante imponente
    }
    rebucketTrees(player.pos.x, player.pos.z);
  } catch (err) { console.error('Árvores GLB falharam — mantendo procedurais:', err); }
})();

/* pontos de interesse novos: MERCADO na beira da cidade, REFÚGIO NA ÁRVORE na
   floresta e barris espalhados — com colisão (player + veículos) e, por serem
   sites, os baús do Battle Royale nascem neles automaticamente.
   RNG PRÓPRIO e determinístico: este bloco roda depois do load assíncrono dos
   GLBs — se usasse o rand() semeado global, cada cliente consumiria a sequência
   num ponto diferente (timing de rede) e o refúgio nasceria em lugares
   DIFERENTES pra cada jogador, quebrando o mundo compartilhado */
(async () => {
  let poiSeed = ((window.__MP_init && window.__MP_init.worldSeed) >>> 0 || 424242) ^ 0xBEEF;
  const poiRand = (a = 1, b) => {
    poiSeed = (poiSeed + 0x6D2B79F5) | 0;
    let x = Math.imul(poiSeed ^ (poiSeed >>> 15), 1 | poiSeed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    const r = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return b === undefined ? r * a : a + r * (b - a);
  };
  const placeProp = (p, x, z, ry) => {
    p.root.position.set(x, heightAt(x, z), z);
    p.root.rotation.y = ry || 0;
    scene.add(p.root);
    const hx = p.size.x / 2 * 0.72, hy = p.size.y / 2, hz = p.size.z / 2 * 0.72;
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    body.position.set(x, heightAt(x, z) + hy, z);
    body.userData = { category: 'rigid', sourceId: 'structure', hardForVehicle: true };
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry || 0);
    body.updateAABB();
    world.addBody(body);
    addObstacle(x, z, Math.max(hx, hz) * 0.9); // player não atravessa
  };
  try {
    const cidade = Structures.sites.find(s => s.type === 'cidade');
    const mx = cidade ? cidade.x + cidade.r + 16 : 60, mz = cidade ? cidade.z - 18 : 60;
    const mercado = await Scenery.prop('/assets/models/Cenários/mercado.glb', { height: 7 });
    placeProp(mercado, mx, mz, 0.4);
    Structures.sites.push({ x: mx, z: mz, r: Math.max(mercado.size.x, mercado.size.z) / 2 + 3, type: 'mercado' });

    // refúgio na árvore: primeiro canto de floresta plano que achar
    let tx = 0, tz = 0;
    for (let i = 0; i < 300; i++) {
      const a = poiRand(TAU), r = poiRand(150, 420);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (biomeAt(x, z) > 0.4 && slopeAt(x, z) < 0.3 && heightAt(x, z) > WATER_LEVEL + 1.5 &&
          !Structures.sites.some(s => Math.hypot(x - s.x, z - s.z) < s.r + 20)) { tx = x; tz = z; break; }
    }
    if (tx || tz) {
      const casa = await Scenery.prop('/assets/models/Cenários/low_poly_tree_house.glb', { height: 13 });
      placeProp(casa, tx, tz, poiRand(TAU));
      Structures.sites.push({ x: tx, z: tz, r: Math.max(casa.size.x, casa.size.z) / 2 + 3, type: 'refúgio' });
    }

    // barris de madeira: cobertura leve perto dos POIs novos
    const barril = await Scenery.prop('/assets/models/Cenários/wooden_barrel.glb', { height: 1.05 });
    // sem refúgio (busca de clareira na floresta falhou) os 3 barris dele não
    // existem: antes caíam em (4,2)/(-3,-4)/(2,-5) — em cima do acampamento inicial
    const spots = [[mx + 5, mz + 4], [mx - 6, mz + 2], [mx + 3, mz - 6]];
    if (tx || tz) spots.push([tx + 4, tz + 2], [tx - 3, tz - 4], [tx + 2, tz - 5]);
    const BARRIL_R = 0.42, BARRIL_H = 1.05;
    for (const [bx, bz] of spots) {
      const by = heightAt(bx, bz);
      const b = barril.root.clone(true);
      b.position.set(bx, by, bz);
      b.rotation.y = poiRand(TAU);
      scene.add(b);
      addObstacle(bx, bz, 0.55, { category: 'rigid', sourceId: 'barrel' }); // player não atravessa
      // ...e o CARRO também não: sem corpo CANNON o barril era decoração
      // atravessável (só o cacto é "vegetação macia" de propósito).
      const body = new CANNON.Body({ mass: 0,
        shape: new CANNON.Cylinder(BARRIL_R, BARRIL_R, BARRIL_H, 10) });
      body.position.set(bx, by + BARRIL_H / 2, bz);
      body.userData = { category: 'rigid', sourceId: 'barrel', hardForVehicle: true };
      body.updateAABB(); // estático posicionado após o construtor: AABB ficaria na origem
      world.addBody(body);
    }
    // tira árvores que nasceram dentro dos POIs novos e refaz o LOD
    for (let i = treeSpots.length - 1; i >= 0; i--) {
      const t = treeSpots[i];
      for (const s of Structures.sites) {
        if ((s.type === 'mercado' || s.type === 'refúgio') && Math.hypot(t.x - s.x, t.z - s.z) < s.r + 2) {
          treeSpots.splice(i, 1);
          break;
        }
      }
    }
    rebucketTrees(player.pos.x, player.pos.z);
  } catch (err) { console.error('POIs GLB falharam — mundo segue como era:', err); }
})();

/* pedras: icosaedro deformado, flat shading estilizado */
{
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v1.fromBufferAttribute(p, i);
    const n = 1 + simplex.noise(_v1.x * 1.7 + 9, _v1.y * 1.7 - 4 + _v1.z) * 0.28;
    p.setXYZ(i, _v1.x * n, _v1.y * n * 0.78, _v1.z * n);
  }
  g.computeVertexNormals();
  const m = csmMat(new THREE.MeshStandardMaterial({ color: 0x8d929c, roughness: 0.95, metalness: 0.02, flatShading: true }));
  const rocks = new THREE.InstancedMesh(g, m, CFG.ROCK_COUNT);
  rocks.castShadow = rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  const lim = CFG.WORLD_SIZE * 0.47;
  let placed = 0, tries = 0;
  while (placed < CFG.ROCK_COUNT && tries++ < CFG.ROCK_COUNT * 20) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (Math.hypot(x, z) < 18) continue;
    const sRand = Math.pow(Math.random(), 2.2) * 2.6 + 0.35;
    const isExcluded = (CITY && Math.hypot(x - CITY.x, z - CITY.z) < 92) ||
                       (VOLCANO && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r) ||
                       Structures.castle.excludesGuardRoute(x, z);
    const s = isExcluded ? 0.0001 : sRand;
    const y = heightAt(x, z) - s * 0.3;
    const rX = rand(-0.3, 0.3), rY = rand(TAU), rZ = rand(-0.3, 0.3);
    const scX = rand(0.8, 1.3), scZ = rand(0.8, 1.3);
    _dummy.position.set(x, isExcluded ? -100 : y, z);
    _dummy.rotation.set(rX, rY, rZ);
    _dummy.scale.set(s * scX, s, s * scZ);
    _dummy.updateMatrix();
    rocks.setMatrixAt(placed++, _dummy.matrix);
    if (!isExcluded && s > 1.1) {
      addObstacle(x, z, s * 0.8, { category: 'rigid', sourceId: 'rock' });
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(s * 0.75) });
      body.position.set(x, y + s * 0.2, z);
      body.userData = { category: 'rigid', sourceId: 'rock:' + placed, hardForVehicle: true };
      body.updateAABB(); // idem paredes: AABB ficava na origem
      world.addBody(body);
    }
  }
  rocks.count = placed;
  scene.add(rocks);
}

/* flores: cruz de 2 quads, cores vivas pro bloom dar um brilho sutil */
{
  const q1 = new THREE.PlaneGeometry(0.22, 0.22); q1.translate(0, 0.11, 0);
  const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const g = BufferGeometryUtils.mergeGeometries([q1, q2]);
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissiveIntensity: 0.25 });
  const flowers = new THREE.InstancedMesh(g, m, CFG.FLOWER_COUNT);
  flowers.frustumCulled = false;
  const palette = [0xfff3c4, 0xffd24d, 0xff7e5f, 0xc98bff, 0xff9ad5, 0xfdfdfd];
  const lim = CFG.WORLD_SIZE * 0.45;
  let placed = 0, tries = 0;
  while (placed < CFG.FLOWER_COUNT && tries++ < CFG.FLOWER_COUNT * 8) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (slopeAt(x, z) > 0.4) continue;
    const y = heightAt(x, z);
    if (y < 0.9) continue;
    if (biomeAt(x, z) < -0.12) continue; // sem flores no deserto
    if (simplex.noise(x * 0.01 - 200, z * 0.01 + 140) < 0.18) continue; // em manchas
    const isExcluded = (CITY && Math.hypot(x - CITY.x, z - CITY.z) < 92) ||
                       (VOLCANO && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r) ||
                       Structures.castle.excludesDecoration(x, z);
    const rot = rand(TAU);
    const scaleRand = rand(0.7, 1.5);
    const scale = isExcluded ? 0.0001 : scaleRand;
    _dummy.position.set(x, isExcluded ? -100 : y, z);
    _dummy.rotation.set(0, rot, 0);
    _dummy.scale.setScalar(scale);
    _dummy.updateMatrix();
    flowers.setMatrixAt(placed, _dummy.matrix);
    flowers.setColorAt(placed, _c.setHex(palette[(Math.random() * palette.length) | 0]));
    placed++;
  }
  flowers.count = placed;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);
}

/* cactos saguaro no deserto */
{
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.23, 2.4, 9);
  trunk.translate(0, 1.2, 0);
  parts.push(paintGeometry(trunk, _c.setHex(0x3f7d46)));
  const cap = new THREE.SphereGeometry(0.18, 9, 6);
  cap.translate(0, 2.4, 0);
  parts.push(paintGeometry(cap, _c.setHex(0x4a8c50)));
  const a1h = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 7); a1h.rotateZ(Math.PI / 2); a1h.translate(0.34, 1.15, 0);
  parts.push(paintGeometry(a1h, _c.setHex(0x3f7d46)));
  const a1v = new THREE.CylinderGeometry(0.1, 0.1, 0.85, 7); a1v.translate(0.56, 1.6, 0);
  parts.push(paintGeometry(a1v, _c.setHex(0x4a8c50)));
  const a2h = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 7); a2h.rotateZ(Math.PI / 2); a2h.translate(-0.3, 1.55, 0);
  parts.push(paintGeometry(a2h, _c.setHex(0x3f7d46)));
  const a2v = new THREE.CylinderGeometry(0.09, 0.09, 0.6, 7); a2v.translate(-0.47, 1.88, 0);
  parts.push(paintGeometry(a2v, _c.setHex(0x4a8c50)));
  const geo = BufferGeometryUtils.mergeGeometries(parts);
  const m = csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const cacti = new THREE.InstancedMesh(geo, m, 160);
  cacti.castShadow = true;
  cacti.frustumCulled = false;
  const limC = CFG.WORLD_SIZE * 0.47;
  let nCac = 0, triesC = 0;
  while (nCac < 160 && triesC++ < 4000) {
    const x = rand(-limC, limC), z = rand(-limC, limC);
    if (biomeAt(x, z) > -0.25 || slopeAt(x, z) > 0.4) continue;
    if (heightAt(x, z) < WATER_LEVEL + 0.5) continue; // cacto não nasce no lago
    const isExcluded = (CITY && Math.hypot(x - CITY.x, z - CITY.z) < 92) ||
                       (VOLCANO && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r) ||
                       Structures.castle.excludesGuardRoute(x, z);
    const rY = rand(TAU), rZ = rand(-0.06, 0.06);
    const scaleRand = rand(0.7, 1.5);
    const scale = isExcluded ? 0.0001 : scaleRand;
    _dummy.position.set(x, isExcluded ? -100 : heightAt(x, z), z);
    _dummy.rotation.set(0, rY, rZ);
    _dummy.scale.setScalar(scale);
    _dummy.updateMatrix();
    cacti.setMatrixAt(nCac++, _dummy.matrix);
    if (!isExcluded) {
      // MATRIZ DE COLISÃO: cacto é "vegetação macia" — bloqueia o PLAYER
      // (círculo), mas NÃO tem corpo Cannon: carro passa (comportamento
      // intencional, documentado; grama/flor = decorativo puro, nada colide)
      addObstacle(x, z, 0.35, { category: 'softVegetation', sourceId: 'cactus' });
    }
  }
  cacti.count = nCac;
  scene.add(cacti);
}

const FX = createFX({ rand, _v1, scene, camera });

/* ================== HUD: helpers ================== */
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  healthFill: $('healthFill'), ammoMag: $('ammoMag'), ammoReserve: $('ammoReserve'),
  damageFlash: $('damageFlash'), healLow: $('healLow'), killfeed: $('killfeed'),
  prompt: $('prompt'), centerMsg: $('centerMsg'), speedo: $('speedo'), speedVal: $('speedVal'),
  ammoWrap: $('ammoWrap'), overlay: $('overlay'), fps: $('fps'), minimap: $('minimap'),
  weaponName: $('weaponName'), slots: $('slots'), scoreVal: $('scoreVal'), killsVal: $('killsVal'),
  nadeCount: $('nadeCount'), medCount: $('medCount'), invNade: $('invNade'), invMed: $('invMed'),
  bossWrap: $('bossWrap'), bossFill: $('bossFill'), dmgDir: $('dmgDir'), banner: $('banner'),
  scope: $('scope'), waterTint: $('waterTint'), healFx: $('healFx'), armorFill: $('armorFill'),
  missionText: $('missionText'), invPanel: $('invPanel'), invList: $('invList'), deathScreen: $('deathScreen'),
  deathSub: $('deathSub'), deathBtns: $('deathBtns'),
};
let bannerTimer = null;
function showBanner(html, dur = 3500) {
  ui.banner.innerHTML = html;
  ui.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), dur);
}

/* camada de tela do game feel: DOM/CSS/FX próprios (index.html e style.css
   não são desta rodada) — ver js/hitfeel.js */
const HitFeel = createHitFeel({ ui, SFX, FX, camera });
/* aceita sabor ('hit' | 'head' | 'kill') e o booleano antigo (compat) */
function showHitmarker(flavor) {
  const sabor = flavor === true ? 'kill' : flavor === false || !flavor ? 'hit' : flavor;
  HitFeel.hitmarker(sabor);
  // o tato conta a MESMA história que a tela: hit < head < kill
  XRTato.emitir('acerto', { sabor, mao: 'right' });
}
function addKillFeed(html) {
  const div = document.createElement('div');
  div.className = 'kf';
  div.innerHTML = html;
  ui.killfeed.prepend(div);
  while (ui.killfeed.children.length > 5) ui.killfeed.lastChild.remove();
  setTimeout(() => { div.style.opacity = '0'; }, 3600);
  setTimeout(() => div.remove(), 4400);
}
let flashT = 0;
function damageFlash(strength = 1) {
  flashT = Math.max(flashT, 0.5 * strength);
}
let msgTimer = null;
function centerMsg(text, dur = 1800) {
  ui.centerMsg.textContent = text;
  ui.centerMsg.style.opacity = '1';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => ui.centerMsg.style.opacity = '0', dur);
}

/* números de dano flutuantes (pool de divs) */
const DmgNums = createDmgNums({ rand, _v1, camera });

/* ================================================================
   ARMA EM PRIMEIRA PESSOA — modelo procedural + sway/bob/ADS/recoil
   ================================================================ */
scene.add(camera); // necessário p/ renderizar filhos da câmera (a arma)

const { weaponRoot, weaponKick, arsenal, knuckleMat } = createWeapons({ camera });
const WeaponRig = createWeaponRig({ arsenal, camera, weaponRoot });
function unlockWeapon(i, msg) {
  if (!arsenal[i].locked) return;
  arsenal[i].locked = false;
  SFX.unlock();
  showBanner(`${arsenal[i].name} DESBLOQUEADA<small>${msg || 'pressione ' + (i + 1) + ' para equipar'}</small>`, 4200);
  updateSlotsHUD();
}
let gun = arsenal[0];
gun.group.visible = true;
let switchAnim = 1; // 0 = arma abaixada, 1 = pronta

/* flash do cano: compartilhado, reanexado à arma ativa */
const muzzle = new THREE.Group();
const muzzleMatFlash = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
{
  const q = new THREE.PlaneGeometry(0.34, 0.34);
  const f1 = new THREE.Mesh(q, muzzleMatFlash);
  const f2 = new THREE.Mesh(q, muzzleMatFlash); f2.rotation.y = Math.PI / 2;
  const f3 = new THREE.Mesh(q, muzzleMatFlash); f3.rotation.x = Math.PI / 2;
  for (const f of [f1, f2, f3]) f.userData.weaponFx = true; // FX transparente: não conta como corpo da arma
  muzzle.add(f1, f2, f3);
}
const muzzleLight = new THREE.PointLight(0xffc274, 0, 11, 2.2);
muzzle.add(muzzleLight);
gun.muzzleAnchor.add(muzzle);
let muzzleT = 0;
function muzzleFlash(scale = 1) {
  muzzleT = 0.05;
  muzzle.rotation.z = rand(TAU);
  muzzle.scale.setScalar(rand(0.8, 1.35) * scale);
}

/* O nome da arma vai num <span class="wn"> só para o celular poder escondê-lo
   por CSS e manter número + cadeado: o arsenal é a única leitura de qual arma
   vem e do que está trancado, e no toque a troca é o botão `swap` (que só anda
   pra frente). No desktop o <span> é inline sem estilo — layout idêntico. */
function updateSlotsHUD() {
  ui.slots.innerHTML = arsenal.map((w, i) =>
    `<div class="slot${w === gun ? ' active' : ''}" style="${w.locked ? 'opacity:.35' : ''}"><b>${i + 1}</b>${w.locked ? '🔒 ' : ''}<span class="wn">${w.name}</span></div>`).join('');
}
function switchWeapon(idx) {
  if (arsenal[idx] === gun || state.driving) return;
  if (arsenal[idx].locked) { centerMsg('Arma trancada — encontre-a explorando o mundo', 1400); return; }
  gun.reloading = false; // troca cancela recarga
  gun.group.visible = false;
  gun = arsenal[idx];
  gun.group.visible = true;
  gun.muzzleAnchor.add(muzzle);
  switchAnim = 0;
  SFX.switchW();
  updateAmmoHUD();
  updateSlotsHUD();
}
weaponRoot.position.copy(gun.hipV);

/* ================== controles / input ================== */
const controls = new PointerLockControls(camera, document.body);

const state = {
  started: false, pointerLocked: false, lockFailed: false,
  driving: false, flying: false, gameTime: 0,
  cinematic: false, // destruição da cidade: timeline assume a câmera/input
};
/* ================================================================
   PAUSA TEM UM ESCRITOR SÓ: setPaused.

   Era convenção — e convenção não segura ninguém: o valor cru era
   escrito direto em vários lugares (os próprios testes faziam isso).
   Escrever `state.paused` sem passar pelo setPaused troca o valor sem
   mexer no #overlay nem no Touch.setPlaying, e no CELULAR isso deixa o
   jogador SEM SAÍDA: não existe ESC, o único jeito de pausar é o botão
   de toque, que some junto com `html.playing`.

   O valor real mora aqui fora; a propriedade é um acessor que DELEGA a
   escrita crua pro único escritor. Assim a dessincronia deixa de ser
   possível — quem insistir no caminho antigo recebe o comportamento
   correto e um aviso no console.
   ================================================================ */
let __paused = true;
Object.defineProperty(state, 'paused', {
  enumerable: true,
  get() { return __paused; },
  set(v) {
    console.warn('[menu] state.paused escrito direto — delegado a setPaused()');
    setPaused(!!v);
  },
});

const keys = {};
const justPressed = new Set();
window.addEventListener('keydown', e => {
  // digitando num campo (nick, chat, código do anfitrião): o jogo não captura teclas
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space' || e.code === 'ControlLeft' || e.code === 'Tab') e.preventDefault();
  if (!keys[e.code]) justPressed.add(e.code);
  keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const mouse = { shooting: false, aiming: false, clicked: false, swayX: 0, swayY: 0 };
window.addEventListener('mousedown', e => {
  if (!state.started || state.paused) return;
  if (e.button === 0) { mouse.shooting = true; mouse.clicked = true; }
  if (e.button === 2) mouse.aiming = true;
});
window.addEventListener('wheel', e => {
  if (!state.started || state.paused || state.driving) return;
  const stepDir = e.deltaY > 0 ? 1 : arsenal.length - 1;
  let idx = arsenal.indexOf(gun);
  for (let n = 0; n < arsenal.length; n++) {
    idx = (idx + stepDir) % arsenal.length;
    if (!arsenal[idx].locked) break;
  }
  switchWeapon(idx);
}, { passive: true });
window.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.shooting = false;
  if (e.button === 2) mouse.aiming = false;
});
window.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => {
  if (!state.pointerLocked) return;
  mouse.swayX += e.movementX;
  mouse.swayY += e.movementY;
});

controls.addEventListener('lock', () => {
  state.pointerLocked = true;
  // lock funcionou: ESC volta a pausar normalmente (partida iniciada via
  // socket nasce com lockFailed=true e deixava o ESC num limbo sem menu)
  state.lockFailed = false;
  if (state.started) setPaused(false);
});
controls.addEventListener('unlock', () => {
  state.pointerLocked = false;
  if (state.started && !state.lockFailed) setPaused(true);
});

/* ================================================================
   AVISO DE ORIENTAÇÃO. Fora do celular o módulo devolve um objeto inerte
   (`blocking()` sempre false), então o setPaused do desktop sai idêntico.
   Declarado ANTES do setPaused de propósito: `const` em TDZ estourava o
   primeiro setPaused numa rodada anterior. Ver js/touchcontrols.js.
   ================================================================ */
const Orient = createOrientationGate({
  isMobile: __mobile,
  /* girar pra retrato em partida PAUSA. Retomar é do jogador (toque na tela),
     igual ao ESC do desktop — sair do retrato não retoma sozinho. Isto não
     congela nem desconecta o servidor: é a mesma pausa local que o ESC já era. */
  onBlock() { if (state.started && !state.paused) setPaused(true); },
});

/* ================================================================
   MORTO — o terceiro dono de tela, e o único que fica ACIMA do menu.

   O #deathScreen é `position: fixed` no z-index 200; o #overlay (menu E
   pausa) vive no 100 e o #deathScreen não declara `pointer-events`. Ou
   seja: com os dois na tela ao mesmo tempo o menu fica interativo,
   INVISÍVEL e inalcançável por trás da morte. MORTO e PAUSA passam a ser
   mutuamente exclusivos, e a regra de quem cede é diferente por modo:

   · SOLO — a tela de morte É a saída (JOGAR DE NOVO / VOLTAR AO MENU).
     Pausar por cima dela mostraria um menu cujo único botão grande
     (#btnNew) está travado com a partida em andamento: jogador preso.
     Então a pausa é RECUSADA enquanto a saída está na tela.
   · ONLINE — o desfecho é do SERVIDOR (recap da eliminação → resultado →
     espectador) e ele precisa ser lido. Aí a morte é quem sai de cena.
     Era isso que o multiplayer-client.js fazia na mão dentro de
     LOBBY.overlay; agora sai de graça em qualquer caminho que pause.

   Nada aqui guarda estado próprio: os dois estados são LIDOS do DOM
   (classe `.show` e o `hidden` dos botões). É o que mantém correto o
   caminho legado de br-game.js, que tira o `.show` direto no elemento.

   DECLARADO ANTES do setPaused de propósito — o setPaused lê `Morte` e
   `const` em TDZ já estourou o primeiro setPaused numa rodada anterior
   (ver o comentário do Orient logo acima). Os corpos dos métodos citam
   `MENU`, `Touch` e `controls`, que só existem mais abaixo: eles só
   rodam em tempo de partida, muito depois de tudo estar montado.
   ================================================================ */
const Morte = {
  get naTela() { return ui.deathScreen.classList.contains('show'); },
  // a tela de morte tem saída própria? (só o solo tem)
  get temSaida() { return Morte.naTela && !!ui.deathBtns && !ui.deathBtns.hidden; },
  mostrar() {
    /* Mesma condição do fluxo de morte: online quem manda no desfecho é o
       servidor, e oferecer "JOGAR DE NOVO" ali seria reset de estado numa
       partida autoritativa (ver restartMatch). */
    const solo = !(window.__MP_active || window.__BR_active);
    // o menu sai ANTES da morte entrar (é a metade "entrar em MORTO" da regra)
    if (state.paused) setPaused(false);
    MENU.close();
    if (ui.deathBtns) ui.deathBtns.hidden = !solo;
    if (ui.deathSub) {
      ui.deathSub.textContent = solo
        ? 'o mundo continua o mesmo — escolha como seguir'
        : 'reiniciando...';
    }
    ui.deathScreen.classList.add('show');
    if (!solo) return;
    /* SOLTA O PONTEIRO. Nada soltava o pointer lock na morte: o jogador
       seguia olhando (e, até o gate do playerUpdate, andando e pulando) por
       trás do "VOCÊ MORREU", e o mouse não alcançava botão nenhum.
       Depois do `.show` de propósito: o `unlock` chama setPaused(true), que
       agora recusa porque a saída já está na tela. */
    Touch.setPlaying(false); // celular: solta dedo preso e tira os analógicos
    try { controls.unlock(); } catch (e) {}
    const b = document.getElementById('btnRetry');
    if (b && b.focus) b.focus();
  },
  esconder() {
    ui.deathScreen.classList.remove('show');
    if (ui.deathBtns) ui.deathBtns.hidden = true;
  },
};

function setPaused(p) {
  /* Celular em retrato bloqueado: o #rotateGate cobre a tela inteira (z 400)
     e come todo o toque. Deixar o jogo rodando por baixo é alvo parado — nem
     anda, nem atira, nem alcança o botão de pausa. Vale principalmente pro BR,
     que começa a partida sem o jogador tocar em nada. */
  if (!p && Orient.blocking()) p = true;
  if (p && Morte.naTela) {
    if (Morte.temSaida) return;  // SOLO: a saída está na tela; nada sobe atrás dela
    Morte.esconder();            // ONLINE: o desfecho do servidor tem prioridade
  }
  __paused = p; // ÚNICA escrita do valor (ver o acessor de state.paused)
  ui.overlay.classList.toggle('hidden', !p);
  ui.overlay.classList.toggle('paused', p && state.started);
  // display síncrono: a transição de opacity trava junto com o hitch da
  // geração da partida e o menu ficava na tela por cima do jogo
  ui.overlay.style.display = p ? 'flex' : 'none';
  ui.hud.classList.toggle('on', !p);
  // celular: `playing` no <html> mostra/esconde os controles de toque, e sair
  // de partida SOLTA tudo (dedo que "ficou" apertado = tiro infinito)
  Touch.setPlaying(state.started && !p);
  // o painel precisa contar a verdade do estado NOVO (em BR a partida segue)
  paintMenu();
}

/* ================================================================
   CONTROLES DE TOQUE (celular). Fora do celular o módulo devolve um
   objeto inerte: nenhum listener, nenhum elemento, nada muda no
   desktop. Ver js/touchcontrols.js.
   ================================================================ */
const Touch = createTouchControls({ isMobile: __mobile, mouse, state, setPaused });
/* HUD com nome de TECLA: no celular não existe "E". Só o JS resolve texto (o
   CSS não reescreve conteúdo), e o botão equivalente se chama USAR. */
if (__mobile) {
  // os espaços em volta do "·" são os MESMOS &nbsp; do index.html
  /* "[TAB]" no título do inventário é a mesma promessa vazia: o painel abre e
     fecha pelo BOTÃO INV. Dentro de #hud (pointer-events: none) ele nunca
     recebe o dedo — sem essa linha parece um modal que ignora o toque. */
  const invTitle = ui.invPanel.querySelector('h3');
  if (invTitle) invTitle.textContent = 'INVENTÁRIO  ·  BOTÃO INV FECHA';
  const speedoHint = ui.speedo.querySelector('small');
  if (speedoHint) speedoHint.textContent = 'KM/H  ·  USAR PARA SAIR';
}

/* ================================================================
   PLAYER — controlador FPS (movimento, pulo, agachar, game feel)
   ================================================================ */
const player = {
  pos: new THREE.Vector3(0, heightAt(0, 4) , 4), // pés
  vel: new THREE.Vector3(),
  onGround: true,
  launchT: 0, // >0 = voo balístico do Canhão de Circo (sem controle de solo)
  eyeH: 1.62, crouchT: 0,
  radius: 0.42,
  health: 100, maxHealth: 100,
  lastDamageT: -99, dead: false,
  coyote: 0,
  bobTime: 0, bobAmp: 0,
  landDip: 0, landDipVel: 0,
  stepAcc: 0,
  slideT: -1, slideDir: new THREE.Vector3(),
  healPool: 0, invulnUntil: 0,
  armor: 0, armorMax: 50, // escudo azul (recompensa do COLOSSO)
};
const WALK_SPEED = 5.2, RUN_SPEED = 8.6, CROUCH_SPEED = 2.6, ADS_SPEED = 3.4;
/* VELOCIDADE DENTRO DO HEADSET. Os quatro números acima são convenção de FPS de
   monitor: o jogo ANDA a 5,2 m/s — mais rápido do que um humano CORRE — e corre
   a 8,6, que é velocidade de atleta. No monitor ninguém estranha; dentro do
   headset, com o corpo parado, é a maior fonte de conflito visual-vestibular
   que sobrou neste porte. Fora da sessão este módulo devolve exatamente os
   números do PC, então o desktop não muda em nada. */
const XRAndar = criarLocomocaoXR({
  /* A ACELERAÇÃO do PC entra no `base` junto com as velocidades, e isso não é
     opcional: sem ela `aceleracao()` devolve 0, `accelK` vira 0 e o jogador não
     anda NEM NO MONITOR. Foi o que aconteceu quando este wiring nasceu com só
     os quatro números de velocidade — o desktop parou de andar em silêncio, e
     quem pegou foi o teste que compara os dois lados da saída da sessão. */
  base: {
    andar: WALK_SPEED, correr: RUN_SPEED, agachar: CROUCH_SPEED, mirar: ADS_SPEED,
    aceleraSolo: 11, aceleraAr: 2.6,
  },
  apresentando: () => XR.presenting,
  armazem: (() => { try { return window.localStorage; } catch { return null; } })(),
});
const GRAVITY = 22, JUMP_VEL = 8.4;

/* modelos 3D reais: armas GLB nas mãos + corpo rigado em primeira pessoa
   (as âncoras procedurais viram alvos de IK — coreografia de recarga intacta) */
const WeaponModels = createWeaponModels({ arsenal });
// com os GLBs resolvidos (ready OU fallback), o rig constrói miras/mecanismos
// calibrados por cima — também pro fallback procedural (perfil fb)
// try/catch POR ARMA + .catch: uma arma que falhe ao montar mecanismos (ex.: GLB
// em fallback) não pode derrubar o attach das outras (bug da escopeta sumindo).
WeaponModels.ready.then(() => {
  for (const g of arsenal) {
    try { WeaponRig.attachComplements(g); }
    catch (e) { console.warn('[rig] attachComplements falhou em', g.name, e); }
  }
}).catch(e => console.warn('[rig] WeaponModels.ready rejeitou', e));
const FpBody = createFpBody({ camera, player, state, getGun: () => gun, weaponRoot, arsenal });

let fovCur = 75;
let adsT = 0;          // 0 = hip, 1 = mirando
let sprintT = 0;
const swayPos = new THREE.Vector3(), swayRot = new THREE.Vector3();
let trauma = 0;        // screen shake 0..1
function addTrauma(t) { trauma = Math.min(1, trauma + t); }

/* recoil com mola (impulso + retorno suave) */
const recoil = {
  pitch: 0, pitchVel: 0, yaw: 0, yawVel: 0,
  applied: 0, appliedYaw: 0,
  kickZ: 0, kickRot: 0, shotIdx: 0, lastShotT: -9,
};

/* PONTE DE TECLADO DO VR — e ela não é firula, é o que torna o BR jogável.

   Metade do jogo não lê `keys[]`: lê EVENTO de teclado. Em `br-game.js` há um
   `addEventListener('keydown')` que trata sozinho o pulo da nave, a abertura do
   paraquedas, o BAÚ (`KeyE` → `tryOpenCrate`) e cinco das oito armas. A entrada
   do headset escrevia só `keys[]`/`justPressed`, então no aparelho nada disso
   existia — o jogador caía da nave sem poder pular, sem paraquedas, e olhava
   para um baú que não abria. Foi o "não consigo pegar o carro, abrir os baús".

   Consertar cada chamador seria caçar sintoma. A ponte emite o MESMO evento que
   o teclado emitiria, então tudo que já escuta teclado passa a funcionar no
   headset — inclusive o que for escrito amanhã.

   Só na BORDA: `keydown` repetido a 72 Hz dispararia `tryOpenCrate` setenta e
   duas vezes por segundo. E `keys`/`justPressed` continuam sendo escritos aqui
   em vez de ficarem por conta do listener, porque um `stopImmediatePropagation`
   de qualquer outro ouvinte não pode ser o que decide se o jogador anda. */
const _teclasXR = new Set();
function teclaXR(code, ativo) {
  const antes = _teclasXR.has(code);
  if (!!ativo === antes) return;
  if (ativo) { _teclasXR.add(code); if (!keys[code]) justPressed.add(code); keys[code] = true; }
  else { _teclasXR.delete(code); keys[code] = false; }
  try {
    window.dispatchEvent(new KeyboardEvent(ativo ? 'keydown' : 'keyup',
      { code, key: code, bubbles: true, cancelable: true }));
  } catch { /* sem KeyboardEvent no ambiente: as teclas acima já valem */ }
}
/* Sair da sessão com botão apertado deixaria a tecla presa para sempre. */
function soltarTeclasXR() { for (const c of [..._teclasXR]) teclaXR(c, false); }

/* ROTAÇÃO DA VISTA NO MUNDO — a única que serve para decidir direção em VR.

   Em XR `camera.quaternion` é a pose da CABEÇA RELATIVA AO RIG (o three
   reescreve os dois todo frame; o grafo é `scene > xrRig > camera`). Calcular
   "pra frente" a partir dela ignora o giro do rig: assim que o jogador dá um
   passo de snap turn, ou simplesmente se vira de corpo, andar pra frente o leva
   para o lado oposto do que ele enxerga. Girado 180°, o movimento fica
   exatamente invertido — e foi assim que chegou o relato "pra frente vai pra
   trás". Fora de XR a câmera é filha da cena e os dois são a mesma coisa.

   `getWorldQuaternion` usa a `matrixWorld` do último render — um frame de
   atraso, imperceptível, e é a leitura correta. */
const _qVista = new THREE.Quaternion();
const _eulerVista = new THREE.Euler(0, 0, 0, 'YXZ');
const vistaMundo = () => (XR.presenting ? camera.getWorldQuaternion(_qVista) : camera.quaternion);

function playerUpdate(dt, t) {
  /* CANAL ANALÓGICO DO TOQUE, somado ao teclado. Sem dedo na tela,
     `tMove.active` é false e `tMove.mag` é 0 — o resultado do teclado sai
     IDÊNTICO ao de antes (coberto por test/touch-controls.test.js). Correr no
     toque é o analógico no talo, não um botão: assim deslizar e coyote time
     continuam saindo dos MESMOS `justPressed` do teclado. */
  const tMove = Touch.getMove();
  const sprintHeld = keys['ShiftLeft'] || keys['ShiftRight'] || tMove.mag > TOUCH_SPRINT_MAG;
  const crouchHeld = keys['ControlLeft'] || keys['ControlRight'];
  let fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  let str = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  if (tMove.active) { fwd += tMove.y; str += tMove.x; }

  const sliding = player.slideT > 0;
  player.crouchT = damp(player.crouchT, (crouchHeld || sliding) ? 1 : 0, 12, dt);
  const sprinting = sprintHeld && fwd > 0 && !mouse.aiming && !mouse.shooting && player.crouchT < 0.4 && player.onGround && !sliding;

  // deslizar (CTRL durante o sprint) — com cooldown de 0.3s
  const spdNow = Math.hypot(player.vel.x, player.vel.z);
  if (justPressed.has('ControlLeft') && sprintHeld && fwd > 0 && player.onGround && spdNow > 6 && player.slideT <= -0.3) {
    player.slideT = 0.78;
    player.slideDir.set(player.vel.x, 0, player.vel.z).normalize();
    SFX.slide();
  }
  player.slideT -= dt;

  // direção desejada no plano XZ a partir do yaw da câmera NO MUNDO
  const _qv = vistaMundo();
  _v1.set(0, 0, -1).applyQuaternion(_qv); _v1.y = 0; _v1.normalize();
  _v2.set(1, 0, 0).applyQuaternion(_qv);  _v2.y = 0; _v2.normalize();
  _v3.set(0, 0, 0).addScaledVector(_v1, fwd).addScaledVector(_v2, str);
  if (_v3.lengthSq() > 1) _v3.normalize();

  let speed = XRAndar.andar;
  if (sprinting) speed = XRAndar.correr;
  if (mouse.aiming) speed = XRAndar.mirar;
  speed = lerp(speed, XRAndar.agachar, player.crouchT);
  if (player.pos.y < WATER_LEVEL + 0.6) speed *= 0.45; // vadear água pesa

  // aceleração suave, independente de framerate (canhão > deslizar > controle)
  if (player.launchT > 0) {
    // voo balístico do Canhão de Circo: mantém o momento horizontal (só um
    // arrasto de ar mínimo), sem controle de solo — é uma bala de canhão.
    player.launchT -= dt;
    const drag = Math.max(0, 1 - 0.12 * dt);
    player.vel.x *= drag; player.vel.z *= drag;
  } else if (player.slideT > 0) {
    const k = clamp(player.slideT / 0.78, 0, 1);
    const sp = 10.6 * (0.3 + 0.7 * k);
    player.vel.x = damp(player.vel.x, player.slideDir.x * sp, 8, dt);
    player.vel.z = damp(player.vel.z, player.slideDir.z * sp, 8, dt);
  } else {
    /* A ACELERAÇÃO é onde as fontes de conforto CONVERGEM: aceleração
       instantânea é mais confortável que gradual, e a Meta chama isso de
       velocidade quantizada. Uma rampa de 270 ms é exatamente o estímulo que
       as duas recomendações mandam evitar. Fora da sessão devolve o 11/2,6 de
       sempre. */
    const accelK = XRAndar.aceleracao(player.onGround);
    player.vel.x = damp(player.vel.x, _v3.x * speed, accelK, dt);
    player.vel.z = damp(player.vel.z, _v3.z * speed, accelK, dt);
  }

  // gravidade + pulo (com coyote time)
  player.vel.y -= GRAVITY * dt;
  if (player.onGround) player.coyote = 0.12; else player.coyote -= dt;
  if (justPressed.has('Space') && player.coyote > 0 && (player.crouchT < 0.5 || player.slideT > 0)) {
    player.vel.y = JUMP_VEL;
    player.onGround = false; player.coyote = 0;
    player.slideT = 0; // pulo cancela o deslize
    SFX.jump();
  }

  player.pos.addScaledVector(player.vel, dt);

  // colisão com chão (terreno OU plataforma/andar de prédio)
  const groundY = groundAt(player.pos.x, player.pos.z, player.pos.y);
  const wasGrounded = player.onGround;
  if (player.pos.y <= groundY) {
    if (MapToys && !wasGrounded && MapToys.tryBounce(player, groundY)) {
      // quicou na cama elástica: mantém no ar (não assenta nem toca o chão)
    } else {
      if (!wasGrounded && player.vel.y < -7) {
        player.landDipVel = player.vel.y * 0.016;
        addTrauma(Math.min(0.35, -player.vel.y * 0.018));
        SFX.land();
      }
      player.pos.y = groundY;
      player.vel.y = Math.max(0, player.vel.y);
      player.onGround = true;
    }
  } else if (wasGrounded && player.vel.y <= 0 && player.pos.y - groundY < 0.55) {
    // gruda no chão em descidas (evita "voinhos" que cortam o sprint)
    player.pos.y = groundY;
    player.vel.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // colisão com árvores/pedras (push-out por círculo)
  for (const o of obstaclesNear(player.pos.x, player.pos.z)) {
    const dx = player.pos.x - o.x, dz = player.pos.z - o.z;
    const d = Math.hypot(dx, dz), min = o.r + player.radius;
    if (d < min && d > 1e-4) {
      player.pos.x = o.x + dx / d * min;
      player.pos.z = o.z + dz / d * min;
    }
  }
  Structures.collide(player.pos, player.radius, 1.7); // paredes das construções
  // colisão com veículos (círculo aproximado do chassi — antes dava pra atravessar)
  if (!state.driving) for (const v of Car.vehicles) {
    const vp = v.group.position;
    if (Math.abs(player.pos.y - vp.y) > 3) continue;
    const r = Math.max(v.cfg.half[0], v.cfg.half[2]) * 0.9 + player.radius;
    const dx = player.pos.x - vp.x, dz = player.pos.z - vp.z;
    const d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { player.pos.x = vp.x + dx / d * r; player.pos.z = vp.z + dz / d * r; }
  }
  // limites do mundo
  const lim = CFG.WORLD_SIZE * 0.49;
  player.pos.x = clamp(player.pos.x, -lim, lim);
  player.pos.z = clamp(player.pos.z, -lim, lim);

  // ---- game feel: bob, dip de aterrissagem, passos ----
  const spdXZ = Math.hypot(player.vel.x, player.vel.z);
  const moving = spdXZ > 0.5 && player.onGround;
  player.bobAmp = damp(player.bobAmp, moving ? Math.min(1, spdXZ / XRAndar.correr) : 0, 8, dt);
  player.bobTime += dt * (5.6 + spdXZ * 0.85);
  // mola do dip de pouso
  player.landDipVel += (-player.landDip * 130 - player.landDipVel * 11) * dt;
  player.landDip += player.landDipVel * dt;
  // passos sincronizados com o bob
  if (moving) {
    player.stepAcc += spdXZ * dt;
    const stride = sprinting ? 2.6 : 1.9;
    if (player.stepAcc > stride) { player.stepAcc = 0; SFX.step(sprinting); }
  }

  // kit médico: cura gradual
  if (player.healPool > 0 && !player.dead && player.health < player.maxHealth) {
    const h = Math.min(player.healPool, 55 * dt, player.maxHealth - player.health);
    player.health += h;
    player.healPool -= 55 * dt;
    updateHealthHUD();
  }
  // regeneração estilo CoD após 5s sem dano
  if (!player.dead && player.health < player.maxHealth && t - player.lastDamageT > 5) {
    player.health = Math.min(player.maxHealth, player.health + 14 * dt);
    updateHealthHUD();
  }

  adsT = damp(adsT, (mouse.aiming && !state.driving) ? 1 : 0, 13, dt);
  sprintT = damp(sprintT, sprinting ? 1 : 0, 8, dt);
}

/* ================================================================
   CÂMERA FPS + ARMA POR FRAME — sway, bob, ADS, recoil, screen shake
   ================================================================ */
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _poseEuler = new THREE.Euler(); // sway/sprint/tilt compostos SOBRE a pose do rig
const _poseQ = new THREE.Quaternion();
let csmDirty = false;
let leanRoll = 0;
let dmgDirT = 0;
let breathApplied = 0; // respiração da luneta (delta aplicado no frame anterior)
let deathK = 0;        // animação de morte (câmera tomba)

/* HUD por frame: escrever uma propriedade de estilo invalida o CSSOM mesmo
   quando o valor é o MESMO — e vinheta de cura, luneta, mira, flash de dano
   e tinta d'água passam quase o jogo inteiro no mesmo valor. O texto
   produzido é idêntico ao de antes; só a escrita redundante some. */
function styleOnce(el, prop, value) {
  const seen = el.__hudSeen || (el.__hudSeen = {});
  if (seen[prop] === value) return;
  seen[prop] = value;
  el.style[prop] = value;
}
function setOpacityOnce(el, value) { styleOnce(el, 'opacity', value); }

/* ================================================================
   OLHAR POR TOQUE. No celular NÃO existe pointer lock, então o giro que o
   PointerLockControls fazia dentro do `mousemove` morre — aqui ele é
   reproduzido com a MESMA matemática (Euler 'YXZ', yaw -= dx, pitch -= dy,
   mesmo clamp de ±1,55 de applyFpsCamera).

   Por que é seguro escrever na câmera aqui: `applyFpsCamera` não é dona da
   orientação base — ela LÊ o quaternion e soma só o DELTA de recuo/respiração
   (contra recoil.applied). Escrever antes dela é exatamente o que o
   PointerLockControls fazia entre frames.

   Uma vez POR FRAME, nunca dentro do handler de `pointermove`: rajada de
   eventos viraria jitter e trabalho fora do frame. Roll (`_euler.z`) é
   propriedade do applyFpsCamera (shake/lean/morte) — não se escreve aqui.
   ================================================================ */
function applyTouchLook() {
  const look = Touch.takeLook();
  if (!look.dx && !look.dy) return;
  /* sensibilidade reduzida na mira: reusa o MESMO multiplicador que o mouse
     usa (`controls.pointerSpeed`, escrito por applyFpsCamera:1547 a partir do
     ADS e do zoom da arma). Um frame de atraso, zero cálculo duplicado. */
  const ps = controls.pointerSpeed > 0 ? controls.pointerSpeed : 1;
  const sens = LOOK_RAD_PER_CSS_PX * ps;
  _euler.setFromQuaternion(camera.quaternion);
  _euler.y -= look.dx * sens;
  _euler.x = clampPitch(_euler.x - look.dy * sens);
  camera.quaternion.setFromEuler(_euler);
  // o balanço da arma é alimentado pelo MESMO sinal que o mousemove daria
  mouse.swayX += look.dx;
  mouse.swayY += look.dy;
}

function applyFpsCamera(dt, t) {
  // ---- screen shake (trauma decai, intensidade = trauma²) ----
  trauma = Math.max(0, trauma - dt * 1.7);
  const sh = trauma * trauma;
  const shakeRoll = (Math.sin(t * 41) * 0.5 + Math.sin(t * 23.7) * 0.5) * sh * 0.05;
  const shakeX = Math.sin(t * 37.2) * sh * 0.05;
  const shakeY = Math.cos(t * 43.7) * sh * 0.05;

  // ---- molas do recoil ----
  recoil.pitchVel += (-recoil.pitch * 210 - recoil.pitchVel * 15) * dt;
  recoil.pitch += recoil.pitchVel * dt;
  recoil.yawVel += (-recoil.yaw * 210 - recoil.yawVel * 15) * dt;
  recoil.yaw += recoil.yawVel * dt;
  recoil.kickZ = damp(recoil.kickZ, 0, 13, dt);
  recoil.kickRot = damp(recoil.kickRot, 0, 11, dt);

  // overlay de luneta: só miras tipo 'overlay' (DMR/snipers/luneta 2x),
  // e só quando o ADS está quase completo — o jogador nunca fica sem referência
  const activeSight = WeaponRig.activeSight(gun);
  const scopedK = (activeSight && activeSight.reticle === 'overlay') ? clamp((adsT - 0.7) / 0.3, 0, 1) : 0;
  const breath = (Math.sin(t * 1.5) * 0.0011 + Math.sin(t * 0.83) * 0.0007) * scopedK;

  // aplica delta do recoil + respiração na rotação da câmera (compatível com PointerLock)
  _euler.setFromQuaternion(camera.quaternion);
  _euler.x += (recoil.pitch - recoil.applied) + (breath - breathApplied);
  _euler.y += (recoil.yaw - recoil.appliedYaw);
  breathApplied = breath;
  recoil.applied = recoil.pitch;
  recoil.appliedYaw = recoil.yaw;
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const slideK = clamp(player.slideT / 0.78, 0, 1);
  deathK = player.dead ? Math.min(1, deathK + dt * 1.5) : 0;
  leanRoll = damp(leanRoll, state.driving ? 0 : (-strafe * 0.014 - slideK * 0.06), 7, dt);
  _euler.z = shakeRoll + leanRoll + deathK * 0.85; // tomba ao morrer
  _euler.x = clamp(_euler.x, -1.55, 1.55);
  /* EM VR A CABEÇA É DO JOGADOR. O jogo move os PÉS — o rig — e o three
     escreve a câmera com a pose do headset relativa a esse pai. Tudo que
     mexeria a cabeça de fora (recoil, screen shake, tombo da morte, roll de
     strafe) continua sendo CALCULADO porque alimenta a arma e o HUD, mas não
     chega na câmera: arrastar a vista de quem está com o aparelho na cara é
     enjoo, não game feel. O giro do rig fica em 0 — girar o mundo sob o
     jogador é a mesma armadilha, e giro artificial é da Fase 3 (snap turn). */
  if (XR.presenting) XR.place(player.pos.x, player.pos.y, player.pos.z, xrYaw);
  else camera.quaternion.setFromEuler(_euler);

  // ---- posição do olho: altura (agachar), bob, dip de pouso, shake ----
  const eyeH = lerp(1.62, 1.04, player.crouchT) * (1 - deathK * 0.78); // cai no chão ao morrer
  const bobScale = 1 - adsT * 0.82;
  const bobY = Math.sin(player.bobTime * 2) * 0.046 * player.bobAmp * bobScale;
  const bobX = Math.cos(player.bobTime) * 0.034 * player.bobAmp * bobScale;
  if (!XR.presenting) {
    // altura do olho, bob e dip só existem fora do VR: no headset a altura vem
    // do aparelho (`local-floor`) e agachar é agachar de verdade
    _v2.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.copy(player.pos);
    camera.position.y += eyeH + bobY * 0.55 + player.landDip;
    camera.position.addScaledVector(_v2, bobX * 0.4 + shakeX);
    camera.position.y += shakeY;
  }

  // ---- sway da arma (acompanha o mouse com atraso) ----
  const swTX = clamp(-mouse.swayX * 0.0021, -0.09, 0.09);
  const swTY = clamp(-mouse.swayY * 0.0021, -0.09, 0.09);
  mouse.swayX = 0; mouse.swayY = 0;
  swayRot.x = damp(swayRot.x, swTY * (1 - adsT * 0.7), 9, dt);
  swayRot.y = damp(swayRot.y, swTX * (1 - adsT * 0.7), 9, dt);
  swayPos.x = damp(swayPos.x, swTX * 0.55, 9, dt);
  swayPos.y = damp(swayPos.y, -swTY * 0.4, 9, dt);

  // ---- troca de arma (abaixa/levanta) + pose de sprint (arma erguida, CoD) ----
  switchAnim = Math.min(1, switchAnim + dt * 3.4);
  const ads = adsT * adsT * (3 - 2 * adsT); // smoothstep
  const lower = 1 - switchAnim;
  const sprintPose = sprintT * (1 - ads) * (gun.reloading ? 0.25 : 1);

  // ---- recarga em fases: inclina -> tira o pente -> encaixa -> tapa -> ferrolho ----
  // (fases calculadas ANTES da pose: a inclinação compõe com o quaternion de ADS)
  let slap = 0, boltK = 0, tilt = 0, reloadK = 0;
  if (gun.reloading) {
    reloadK = clamp(1 - (gun.reloadEnd - t) / gun.reloadTime, 0, 1);
    tilt = THREE.MathUtils.smoothstep(reloadK, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(reloadK, 0.8, 0.97));
    slap = Math.sin(clamp((reloadK - 0.66) / 0.12, 0, 1) * Math.PI);
    boltK = Math.sin(clamp((reloadK - 0.82) / 0.15, 0, 1) * Math.PI);
  }

  // pose hip↔ADS: posição E rotação vêm do rig — a mira ativa define o eixo
  // óptico que precisa terminar no -Z da câmera (slerp, não Euler solto)
  const hipPose = WeaponRig.hipPose(gun);
  const adsPose = WeaponRig.adsPose(gun);
  weaponRoot.position.lerpVectors(hipPose.pos, adsPose.pos, ads);
  weaponRoot.quaternion.slerpQuaternions(hipPose.quat, adsPose.quat, ads);
  weaponRoot.position.x += (bobX * 0.55 + swayPos.x) * bobScale - sprintPose * 0.055;
  weaponRoot.position.y += (bobY + swayPos.y) * bobScale + Math.sin(t * 1.7) * 0.0035 * (1 - adsT)
                         - lower * 0.3 - sprintPose * 0.02 - tilt * 0.07;
  weaponRoot.position.z += sprintPose * 0.07;
  _poseEuler.set(
    swayRot.x + sprintPose * 0.55 - lower * 0.7 + tilt * 0.32,
    swayRot.y + sprintPose * 0.24,
    swayRot.y * 0.6 + leanRoll * 2.2 + sprintPose * 0.2 - tilt * 0.38);
  weaponRoot.quaternion.multiply(_poseQ.setFromEuler(_poseEuler));

  // âncoras com authority 'clip' pertencem ao AnimationMixer do GLB (sniper
  // Agulha): a coreografia procedural NÃO pode escrever nelas
  const magProc = gun.parts.mag && gun.parts.mag.userData.authority !== 'clip';
  if (gun.reloading) {
    const magOut = THREE.MathUtils.smoothstep(reloadK, 0.14, 0.3);
    const magIn = THREE.MathUtils.smoothstep(reloadK, 0.48, 0.66);
    const magDrop = magOut * (1 - magIn);
    if (magProc) {
      const b = gun.parts.mag.userData.base;
      gun.parts.mag.position.y = b.y - magDrop * 0.19;
      gun.parts.mag.rotation.x = b.rx - magDrop * 0.55;
    }
    if (gun.parts.pump) { // escopeta: bombeia durante a recarga
      const cyc = (reloadK > 0.25 && reloadK < 0.95) ? Math.max(0, Math.sin(reloadK * Math.PI * 4)) : 0;
      gun.parts.pump.position.z = gun.parts.pump.userData.z0 + cyc * 0.085;
    }
  } else if (magProc) {
    const b = gun.parts.mag.userData.base;
    gun.parts.mag.position.y = b.y;
    gun.parts.mag.rotation.x = b.rx;
  }
  // mão esquerda acompanha o pente durante a recarga (sai da arma e volta)
  if (gun.parts.handL) {
    const hb = gun.parts.handL.userData.base;
    if (gun.reloading) {
      if (gun.parts.mag && gun.parts.mag.userData.authority !== 'clip') {
        // arma com pente PROCEDURAL: a mão persegue o pente (sai e volta)
        const grab = THREE.MathUtils.smoothstep(reloadK, 0.06, 0.18) * (1 - THREE.MathUtils.smoothstep(reloadK, 0.72, 0.85));
        _v1.copy(gun.parts.mag.position); _v1.y -= 0.08; _v1.z += 0.03;
        gun.parts.handL.position.lerpVectors(hb.p, _v1, grab);
        gun.parts.handL.rotation.x = hb.rx + grab * 0.5;
      } else if (gun.parts.pump) { // escopeta: mão à porta inserindo cartuchos
        const grab = THREE.MathUtils.smoothstep(reloadK, 0.15, 0.3) * (1 - THREE.MathUtils.smoothstep(reloadK, 0.85, 0.95));
        const bob = Math.abs(Math.sin(reloadK * Math.PI * 5)) * 0.025;
        gun.parts.handL.position.set(lerp(hb.p.x, 0.05, grab), lerp(hb.p.y, -0.05 + bob, grab), lerp(hb.p.z, 0.06, grab));
      } else {
        // sniper (pente clip-owned, animado pelo GLB) e bazuca: mão no apoio dianteiro,
        // sem gesto de porta indevido nem perseguir um nó dirigido pelo clip
        gun.parts.handL.position.copy(hb.p);
        gun.parts.handL.rotation.x = hb.rx;
      }
    } else {
      gun.parts.handL.position.copy(hb.p);
      gun.parts.handL.rotation.x = hb.rx;
    }
  }
  // animação de cura: arma abaixa, vinheta verde pulsa
  healAnimT = Math.max(0, healAnimT - dt);
  if (healAnimT > 0) {
    const hk = Math.sin(Math.min(1, (1.3 - healAnimT) / 1.3) * Math.PI);
    weaponRoot.position.y -= hk * 0.16;
    weaponRoot.rotation.x -= hk * 0.35;
    setOpacityOnce(ui.healFx, (hk * 0.9).toFixed(2));
  } else if (player.healPool > 0) {
    setOpacityOnce(ui.healFx, '0.35');
  } else {
    setOpacityOnce(ui.healFx, '0');
  }

  // ciclo pós-tiro (bomba da escopeta / ferrolho) — a fase usa a duração REAL
  // do ciclo desta arma (cadência), não um valor fixo
  gun.cycleT = Math.max(0, gun.cycleT - dt);
  const cycleDur = gun.cycleDur || (gun.pellets > 1 ? 0.55 : 0.32);
  if (gun.parts.pump && !gun.reloading) {
    const ph = gun.cycleT > 0 ? Math.sin((1 - gun.cycleT / cycleDur) * Math.PI) : 0;
    gun.parts.pump.position.z = gun.parts.pump.userData.z0 + ph * 0.09;
  }
  if (gun.parts.bolt && gun.parts.bolt.userData.authority !== 'clip') {
    const ph = gun.cycleT > 0 ? Math.sin((1 - gun.cycleT / cycleDur) * Math.PI) : 0;
    gun.parts.bolt.position.z = gun.parts.bolt.userData.z0 + (ph + boltK) * 0.05;
  }

  weaponKick.position.z = recoil.kickZ;
  weaponKick.position.y = -slap * 0.03;
  weaponKick.rotation.x = recoil.kickRot + slap * 0.07;
  weaponRoot.visible = !state.driving && !state.flying && scopedK < 0.85; // na luneta, vê só o retículo

  // modelos GLB: animações embutidas da arma + rig de miras/mecanismos + IK
  WeaponModels.update(dt);
  WeaponRig.update(dt, t, gun, adsT);
  FpBody.update(dt, t);

  // ---- flash do cano ----
  muzzleT = Math.max(0, muzzleT - dt);
  const mk = muzzleT / 0.05;
  muzzleMatFlash.opacity = mk * 0.95;
  muzzleLight.intensity = mk * 26;

  // ---- luneta: overlay + sensibilidade do mouse reduzida no zoom ----
  setOpacityOnce(ui.scope, scopedK.toFixed(2));
  controls.pointerSpeed = lerp(1, gun.adsFov < 40 ? 0.36 : 0.75, ads);

  // ---- FOV: 75 base, 85 correndo, ADS por arma (55 / 62 / 26) ----
  // faca: botão direito é pose de guarda, sem zoom de arma de fogo
  let fovTarget = state.driving ? 72 : lerp(lerp(75, 85, sprintT), gun.melee ? 75 : gun.adsFov, ads);
  const newFov = damp(fovCur, fovTarget, 11, dt);
  if (Math.abs(newFov - fovCur) > 0.001) {
    fovCur = newFov;
    camera.fov = fovCur;
    camera.updateProjectionMatrix();
    csmDirty = true;
  }

  // ---- mira dinâmica (abre com movimento, some no ADS) ----
  const spd = Math.hypot(player.vel.x, player.vel.z);
  const gap = 7 + spd * 1.4 + trauma * 18 + (player.onGround ? 0 : 9);
  const gapPx = gap.toFixed(1) + 'px';
  if (ui.crosshair.__hudGap !== gapPx) { ui.crosshair.__hudGap = gapPx; ui.crosshair.style.setProperty('--gap', gapPx); }
  // só some quando existe uma referência ADS válida na tela (faca: nunca some)
  setOpacityOnce(ui.crosshair, (state.driving || WeaponRig.sightRefK(gun, adsT) > 0.5) ? '0' : '1');

  // flash de dano decai + indicador de direção
  flashT = Math.max(0, flashT - dt * 1.4);
  setOpacityOnce(ui.damageFlash, Math.min(1, flashT * 1.6).toFixed(2));
  dmgDirT = Math.max(0, dmgDirT - dt);
  setOpacityOnce(ui.dmgDir, dmgDirT > 0 ? '1' : '0');
  // tinta azulada quando a câmera mergulha
  setOpacityOnce(ui.waterTint, camera.position.y < WATER_LEVEL ? '1' : '0');
}

/* ================================================================
   TIRO — hitscan com raycast, recoil com padrão, balística visual
   ================================================================ */
/* ---- inventário, pontuação, kit médico ---- */
const inventory = { nades: 3, nadesMax: 5, medkits: 1, medkitsMax: 3, meat: 0, meatMax: 6 };
let healAnimT = 0;
function updateInvHUD() {
  ui.nadeCount.textContent = inventory.nades;
  ui.medCount.textContent = inventory.medkits;
  ui.invNade.classList.toggle('zero', inventory.nades === 0);
  ui.invMed.classList.toggle('zero', inventory.medkits === 0);
}
let score = 0, kills = 0;
function addScore(pts, isKill) {
  score += pts;
  if (isKill) kills++;
  ui.scoreVal.textContent = score;
  ui.killsVal.textContent = kills;
}
function useMedkit(t) {
  if (inventory.medkits <= 0 || player.dead || player.health >= player.maxHealth - 1) return;
  inventory.medkits--;
  player.healPool = 65; // cura ao longo do tempo
  healAnimT = 1.3;      // animação da mão erguendo o kit
  SFX.medkit();
  updateInvHUD();
}
function eatMeat() {
  if (inventory.meat <= 0 || player.dead || player.health >= player.maxHealth - 1) return;
  inventory.meat--;
  player.healPool = 38;
  healAnimT = 1.0;
  SFX.eat();
  updateInvHUD();
}

/* ---- recarga (por arma) ---- */
function updateAmmoHUD() {
  ui.ammoMag.textContent = gun.melee ? '—' : gun.mag;
  ui.ammoMag.classList.toggle('empty', !gun.melee && gun.mag === 0);
  ui.ammoReserve.textContent = gun.melee ? '' : '| ' + gun.reserve;
  ui.weaponName.textContent = gun.name;
}
function reloadBlocked() { // mesma condição do gate de tiro: morto/dirigindo/pausado/nave/cinemática
  return player.dead || state.driving || state.paused || window.__BR_freeze || state.cinematic;
}
function startReload(t) {
  if (reloadBlocked()) return; // R dirigindo/morto não toca SFX nem recarrega
  if (gun.reloading || gun.mag === gun.magSize || gun.reserve <= 0) return;
  gun.reloading = true;
  XRTato.emitir('recarga', { mao: 'right' });   // carregador sai
  gun.reloadEnd = t + gun.reloadTime;
  // escopeta: cartucho a cartucho ao longo da MESMA duração (a bomba continua
  // percorrendo o curso inteiro); o último cartucho entra no reloadEnd.
  if (gun.parts.pump) {
    gun.reloadPerShell = gun.reloadTime / Math.max(1, gun.magSize - gun.mag);
    gun.nextShellT = t + gun.reloadPerShell;
  }
  SFX.reload();
}
function finishReload() {
  if (reloadBlocked()) return; // recarga pendente só completa fora do estado bloqueado (sem soft-lock)
  const take = Math.min(gun.magSize - gun.mag, gun.reserve);
  gun.mag += take; gun.reserve -= take;
  XRTato.emitir('recarga-pronta', { mao: 'right' });   // ferrolho: forte e curto
  gun.reloading = false;
  updateAmmoHUD();
}
// avança a recarga a cada frame: ESCOPETA carrega 1 cartucho por vez (cancelável
// mantendo o parcial); as demais enchem o pente de uma vez no fim.
function updateReload(t) {
  if (!gun.reloading || reloadBlocked()) return;
  if (gun.parts.pump) {
    if (t >= (gun.nextShellT || Infinity) && gun.mag < gun.magSize && gun.reserve > 0) {
      gun.mag += 1; gun.reserve -= 1; updateAmmoHUD(); SFX.reload();
      XRTato.emitir('recarga-pronta', { mao: 'right' });   // escopeta, cartucho a cartucho
      gun.nextShellT = t + (gun.reloadPerShell || gun.reloadTime);
    }
    if (gun.mag >= gun.magSize || gun.reserve <= 0) gun.reloading = false;
  } else if (t >= gun.reloadEnd) {
    finishReload();
  }
}

/* marcha ao longo do raio testando terreno e troncos (LOS barato em heightfield) */
function rayBlockedAt(origin, dir, maxDist) {
  const wallT = Structures.rayHit(origin, dir, maxDist); // paredes param bala
  const lim = Math.min(maxDist, wallT);
  const step = 1.6;
  for (let d = step; d < lim; d += step) {
    const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
    if (y < heightAt(x, z)) return d - step * 0.5;
    if (y < heightAt(x, z) + 3.4) { // só checa árvores perto do chão
      for (const o of obstaclesNear(x, z)) {
        if ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < o.r * o.r * 0.8) return d;
      }
    }
  }
  return wallT;
}

/* áudio espacial: listener na câmera + probe de oclusão barato.
   O SFX só chama isto dentro de um orçamento (ver js/sfx3d.js) — nunca por
   folha de grama, nunca por som que já morreu na distância. */
const _occFrom = new THREE.Vector3(), _occDir = new THREE.Vector3();
SFX.setSpatial({
  camera,
  occluded(pos) {
    _occFrom.copy(camera.position);
    _occDir.set(pos.x - _occFrom.x, (pos.y || 0) - _occFrom.y, pos.z - _occFrom.z);
    const len = _occDir.length();
    if (len < 0.5) return false;
    _occDir.multiplyScalar(1 / len);
    return rayBlockedAt(_occFrom, _occDir, len) < len - 0.4;
  },
});

const _rayDir = new THREE.Vector3(), _rayOrig = new THREE.Vector3(), _hitPos = new THREE.Vector3();

/* DE ONDE O JOGADOR MIRA. Fora de XR é a câmera — mirar é girar a vista com o
   mouse, e a arma é filha da câmera. Em XR isso vira a pior experiência
   possível: a arma cola na cabeça e acertar exige APONTAR O ROSTO para o
   inimigo. A recomendação da Meta é ancorar a ação de entrada no CONTROLE, não
   na cabeça. Em VR a cabeça olha; a MÃO mira.

   Sem mão na sessão (controle dormindo, só um pareado), cai na câmera: pior
   experiência é melhor que arma sem direção.

   ARMADILHA DO THREE: `getWorldDirection` devolve o +Z do objeto — só
   `Camera` sobrescreve para devolver -Z. Usar o método direto no objeto do
   controle faria o tiro sair para TRÁS da mão. Por isso a direção é extraída
   do quaternion de mundo aqui, de um jeito só, que vale para os dois. */
const _qMira = new THREE.Quaternion();
/* A ordem aqui é a hierarquia da verdade: a linha de mira da ARMA (a ocular do
   perfil, que é onde o jogador põe o olho), depois o PUNHO, e só então o raio de
   mira do controle. O punho vem antes do raio porque os dois divergem 45,4° e
   5,2 cm no Touch — o -Z do grip é a direção do POLEGAR, não do cano. */
const fonteDaMira = () => (XR.presenting && (XRArma.miraNode() || XR.punho('right') || XR.mao('right'))) || camera;
function miraOrigem(out) { return fonteDaMira().getWorldPosition(out); }
function miraDirecao(out) {
  return out.set(0, 0, -1).applyQuaternion(fonteDaMira().getWorldQuaternion(_qMira)).normalize();
}
const _hitAgg = new THREE.Vector3();
const _missEnd = new THREE.Vector3();
// ponto zerado da mira, para o tiro sair do cano SEM desalinhar (ver fire)
const _origemDoTiro = new THREE.Vector3();   // QA: de onde o raio partiu de fato
const _direcaoDoTiro = new THREE.Vector3();  // QA: e para onde, ANTES do spread
/* QA: a LINHA DE MIRA no instante do tiro. Ler a mira depois do disparo mede o
   recuo, não o alinhamento — numa automática o cano já subiu vários graus
   quando a sonda chega. B3 pergunta se o tiro sai por onde a alça apontava
   NAQUELE instante, e é isto que responde. */
const _miraOrigDoTiro = new THREE.Vector3(), _miraDirDoTiro = new THREE.Vector3();
/* QA: para onde o CANO apontava no instante do tiro. Ler o cano depois do
   disparo mede o RECUO — numa automática ele já subiu quase um grau quando a
   sonda chega, e 0,88° a 10 m são 15 cm de "defeito" que não existe. */
const _canoDirDoTiro = new THREE.Vector3();
const _qCanoQA = new THREE.Quaternion();
function marcarCanoQA() {
  _canoDirDoTiro.set(0, 0, -1).applyQuaternion(muzzle.getWorldQuaternion(_qCanoQA));
}
/* Registra o que ESTE disparo usou. Tem que ser chamada em TODO ramo de
   `fire()` que dá `return` cedo: a faca e a bazuca saíam antes da linha de
   registro, então `origemDoTiro()` devolvia o valor da arma ANTERIOR e
   qualquer medição feita com a faca na mão media o fuzil de antes. */
/* DUAS COISAS DIFERENTES, e juntá-las já produziu um teste que não podia
   falhar: o TIRO (de onde saiu, para onde foi) e a LINHA DE MIRA daquele
   instante. Na bazuca a versão anterior copiava a direção JÁ CONVERGIDA por
   cima do registro da mira — as duas viravam a mesma reta, e comparar uma reta
   consigo mesma dá zero por álgebra. A mira é registrada antes de qualquer
   convergência, pelo `marcarMiraQA`. */
function marcarMiraQA(orig, dir) {
  _miraOrigDoTiro.copy(orig); _miraDirDoTiro.copy(dir);
}
function marcarTiroQA(orig, dir) {
  _origemDoTiro.copy(orig); _direcaoDoTiro.copy(dir);
  marcarCanoQA();
}
function fire(t) {
  /* TATO DO TIRO, antes de qualquer ramo: vale pra faca, foguete, laser e
     hitscan. A mão é a que segura a arma. O peso sai de `shotTrauma(gun)`
     dentro do módulo — o MESMO número do screenshake, então arma pesada pesa
     nos dois sentidos. */
  XRTato.emitir('tiro', { arma: gun, mao: 'right' });
  // faca (melee): golpe curto, sem munição/flash/som de tiro
  if (gun.melee) {
    gun.cycleT = 0.34; gun.cycleDur = 0.34;
    addTrauma(HitCore.shotTrauma(gun));
    recoil.kickZ += 0.12; recoil.kickRot += 0.1;
    SFX.melee();
    miraOrigem(_rayOrig);
    miraDirecao(_rayDir);
    if (window.__BR_melee) window.__BR_melee(_rayOrig, _rayDir, gun.dmg);
    marcarMiraQA(_rayOrig, _rayDir);
    marcarTiroQA(_rayOrig, _rayDir);
    return;
  }
  gun.mag--;
  updateAmmoHUD();
  muzzleFlash(gun.pellets > 1 ? 1.5 : 1);
  if (gun.laser) SFX.laser();
  else SFX.shot(gun.pellets > 1 ? 'shotgun' : gun.adsFov < 40 ? 'dmr' : 'rifle');
  addTrauma(HitCore.shotTrauma(gun)); // peso por arma, com teto pra automática não saturar
  lastShotInfo.pos.copy(player.pos);
  lastShotInfo.t = t;
  // ciclo visual (bomba/ferrolho) em TODO disparo — automáticas também —
  // nunca mais longo que o intervalo real de cadência da arma
  gun.cycleDur = Math.min(gun.pellets > 1 ? 0.55 : 0.32, (60 / gun.rpm) * 0.92);
  gun.cycleT = gun.cycleDur;
  WeaponRig.ejectShell(gun); // estojo poolado (só perfis balísticos com shellPort)

  // bazuca: dispara foguete físico em vez de hitscan
  if (gun.rocket) {
    SFX.rocket();
    addTrauma(0.28); // soma ao trauma base da arma: continua o coice mais pesado do arsenal
    recoil.pitchVel += 2.3;
    recoil.kickZ += 0.28;
    recoil.kickRot += 0.2;
    miraOrigem(_rayOrig);
    miraDirecao(_rayDir);
    marcarMiraQA(_rayOrig, _rayDir);   // a mira CRUA, antes de qualquer convergência
    muzzle.getWorldPosition(_v3);
    // voando, o tiro sai do HELICÓPTERO, não da câmera de perseguição (10m atrás)
    if (state.flying) { _v3.copy(Heli.group.position); _v3.y += 1.6; _rayOrig.copy(_v3); }
    // convergência: o foguete nasce na BOCA REAL do tubo mas voa até o ponto
    // mirado na linha central (primeiro obstáculo ou zero de 120 m). Parede
    // colada na boca continua sendo atingida — a colisão parte do muzzle.
    /* EM XR A BAZUCA NÃO ZERA. A zeragem por `rayBlockedAt` converge o foguete
       do tubo para o primeiro obstáculo à frente — e a distância desse
       obstáculo MUDA a cada tiro. Medido em sessão: zeragem indo de 5,60 a
       120,00 m entre dois disparos, ângulo de até 2,4172°, 2,23 m de desvio a
       100 m. Ângulo que anda sozinho não dá para compensar na mão. O foguete
       passa a sair paralelo à linha de mira, com o afastamento constante da
       altura da alça — e ele tem estilhaço, então centímetros não decidem
       nada; o que decidia era a deriva.
       No monitor a zeragem fica: lá o cano está a centímetros do eixo da
       câmera, o erro é pequeno, e mudar isso mexeria na mira do PC sem
       necessidade. */
    if (XR.presenting) {
      _v1.copy(_rayOrig).addScaledVector(_rayDir, 120);
    } else {
      const zeroD = Math.max(4, Math.min(rayBlockedAt(_rayOrig, _rayDir, 240), 120));
      _v1.copy(_rayOrig).addScaledVector(_rayDir, zeroD);
      _rayDir.copy(_v1).sub(_v3).normalize();
    }
    // BR: até aqui a bazuca do outro jogador era INVISÍVEL E MUDA — o
    // lançamento não gerava evento nenhum (o shotHit só nasce no acerto).
    // Reaproveita o `shotFired` que já existe: os outros clientes ouvem o
    // disparo sair do tubo e cronometram o estrondo pelo tempo de voo.
    // (antes do Rockets.fire: js/rockets.js reusa o _v1 compartilhado)
    if (window.__BR_shotMiss) window.__BR_shotMiss(_v3, _v1, 'BAZUCA');
    /* EM XR O FOGUETE NASCE NA LINHA DE MIRA, pelo mesmo motivo do hitscan e do
       projétil do BR: origem no tubo com direção da alça deixa um erro
       CONSTANTE do tamanho da altura da alça, e erro de origem não fecha em
       distância nenhuma. No monitor continua saindo do tubo. */
    const origemFoguete = XR.presenting ? _rayOrig : _v3;
    Rockets.fire(origemFoguete, _rayDir);
    marcarTiroQA(origemFoguete, _rayDir);
    return;
  }

  // ---- recoil: sobe sempre, deriva lateral conforme a sequência ----
  if (t - recoil.lastShotT > 0.35) recoil.shotIdx = 0;
  recoil.lastShotT = t;
  const idx = recoil.shotIdx++;
  const adsMul = 1 - adsT * 0.45;
  recoil.pitchVel += (gun.recoilP + Math.min(idx, 10) * 0.028) * adsMul;
  const drift = (idx < 4 ? rand(-0.1, 0.1) : Math.sin(idx * 0.55) * 0.16) + rand(-gun.recoilY, gun.recoilY) * 0.5;
  recoil.yawVel += drift * adsMul;
  recoil.kickZ += gun.kick;
  recoil.kickRot += gun.kick * 0.9;

  // ---- spread por arma (quadril > mirando; mover/pular abre o cone) ----
  const spd = Math.hypot(player.vel.x, player.vel.z);
  const spread = lerp(gun.spreadHip, gun.spreadAds, adsT) + spd * 0.0006 + (player.onGround ? 0 : 0.012);
  miraOrigem(_rayOrig);
  muzzle.getWorldPosition(_v3);
  /* EM VR O TIRO SAI DO CANO. A origem do raio era a linha de mira — a ocular
     do perfil, onde o jogador põe o olho — e o cano fica 44 a 91 cm à frente
     dela. Isso é visível (a bala nasce do nada) e é risco de SEGURANÇA: o
     servidor valida ALCANCE a partir da origem que o cliente manda, e o mesmo
     arquivo já trata esse risco no helicóptero, logo abaixo, com o comentário
     dizendo que "o servidor rejeitaria a origem longe da posição autoritativa".

     A PRIMEIRA VERSÃO DISTO ZERAVA O TIRO e plantou um defeito pior. Ela
     punha a origem na boca do cano e re-mirava para um ponto de zeragem dado
     por `rayBlockedAt` — o primeiro obstáculo à frente. Só que cano e linha de
     mira NÃO são colineares: a alça deste jogo fica de 6 a 20 cm acima do cano
     (é a "sight height over bore" de qualquer arma, aqui exagerada — um fuzil
     real tem ~4 cm). Com origem no cano e alvo na mira, os dois só concordam
     numa distância, e medido em sessão o tiro passava a 18 cm do ponto da alça
     a 2 m e a 70 cm a 50 m. Pior: a zeragem dependia do cenário, então o ponto
     de impacto ANDAVA entre um tiro e o outro — 1,03 cm de deriva em três
     tiros idênticos. Não dá nem para compensar na mão.

     ESTA VERSÃO SEPARA O QUE SE VÊ DO QUE ACERTA, que é como o gênero resolve:
     o traçante e o clarão continuam saindo da boca do cano (`_v3`, logo
     acima — nada disso muda), e o RAIO BALÍSTICO nasce sobre a LINHA DE MIRA,
     no ponto dela que está na mesma altura longitudinal do cano. Consequência:
     o tiro passa exatamente pelo ponto que a alça indica em TODA distância, e
     não há zeragem nenhuma para andar. O jogador continua vendo a bala sair do
     cano — a diferença é invisível, e é o que os FPS fazem desde sempre
     (visual cosmético, raio autoritativo).

     O anti-cheat não é tocado: `br-game.js` monta `fromPos` de `player.pos`, e
     não da origem do raio (medido por validação independente). */
  _miraOrigDoTiro.copy(_rayOrig);
  miraDirecao(_miraDirDoTiro);
  marcarCanoQA();
  if (XR.presenting) {
    _rayDir.copy(_miraDirDoTiro);
    /* projeção do cano sobre a linha de mira, sem alocar: quanto o cano
       avançou ao longo da direção da mira */
    const avanco = (_v3.x - _rayOrig.x) * _rayDir.x
      + (_v3.y - _rayOrig.y) * _rayDir.y
      + (_v3.z - _rayOrig.z) * _rayDir.z;
    if (avanco > 0) _rayOrig.addScaledVector(_rayDir, avanco);
  }
  // voando, origem do tiro é o HELICÓPTERO — a câmera de perseguição fica ~10m
  // atrás e o servidor rejeitaria a origem longe da posição autoritativa
  if (state.flying) {
    _v3.copy(Heli.group.position); _v3.y += 1.6;
    _rayOrig.copy(_v3);
  }

  /* QA: a origem REAL do raio, já decidida (cano em VR, olho no desktop,
     helicóptero voando). O critério B7 cobra a distância dela até a boca do
     cano, e a razão de existir esta linha é que a suíte media a DIREÇÃO da
     mira e nunca a origem contra a geometria da arma. */
  _origemDoTiro.copy(_rayOrig);

  let hitAny = false, killAny = false, headAny = false, totalDmg = 0;
  let remoteHit = false, missEndSet = false;
  for (let p = 0; p < gun.pellets; p++) {
    // a direção é a da MIRA, sempre: a origem já foi levada para a linha dela
    miraDirecao(_rayDir);
    /* QA: a direção do PRIMEIRO projétil, antes do spread. Sem isto não há como
       medir de fora o que B3 cobra — a distância entre o raio disparado e a
       linha de mira. A suíte media a direção da MIRA e a chamava de "direção do
       tiro"; desde que a origem passou para o cano, as duas deixaram de ser a
       mesma coisa. */
    if (p === 0) _direcaoDoTiro.copy(_rayDir);
    _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(spread * Math.sqrt(Math.random()));
    _rayDir.add(_v1).normalize();

    // BR online: armas marcadas com projSpeed disparam projétil real (queda + tempo de voo)
    /* O PROJÉTIL SAI DA MESMA ORIGEM QUE O HITSCAN. Este ramo nascia sempre no
       cano (`_v3`), e como a alça fica 6 a 20 cm acima dele o erro era
       CONSTANTE em toda distância — 9,10 cm no fuzil, 20,00 cm no plasma,
       medido em sessão. Pior que no hitscan: erro de ORIGEM em projétil não
       fecha em distância nenhuma, então não dá nem para compensar mirando mais
       alto. E é o caminho do BR, que é o modo jogado de verdade.
       Fora de XR nada muda: `_rayOrig` é a própria origem da mira. */
    if (window.__BR_ballistics && gun.projSpeed) {
      window.__BR_ballistics(XR.presenting ? _rayOrig : _v3, _rayDir, gun);
      continue;
    }

    // inimigos comuns (esferas analíticas)
    let bestT = Infinity, bestEnemy = null, bestPart = null, bestBoss = false;
    for (const e of Enemies.list) {
      if (!e.alive) continue;
      if (e.group.position.distanceToSquared(_rayOrig) > 240 * 240) continue;
      for (const s of e.hitSpheres()) {
        _v2.copy(s.c).sub(_rayOrig);
        const proj = _v2.dot(_rayDir);
        if (proj < 0 || proj > 240) continue;
        const d2 = _v2.lengthSq() - proj * proj;
        if (d2 < s.r * s.r) {
          const tHit = proj - Math.sqrt(s.r * s.r - d2);
          if (tHit < bestT) { bestT = tHit; bestEnemy = e; bestPart = s.part; bestBoss = false; }
        }
      }
    }
    // bosses (Colosso, Visitante...)
    let bestBossObj = null, bestExtra = null;
    for (const B2 of Bosses) {
      if (!B2.alive) continue;
      for (const s of B2.hitSpheres()) {
        _v2.copy(s.c).sub(_rayOrig);
        const proj = _v2.dot(_rayDir);
        if (proj < 0 || proj > 300) continue;
        const d2 = _v2.lengthSq() - proj * proj;
        if (d2 < s.r * s.r) {
          const tHit = proj - Math.sqrt(s.r * s.r - d2);
          if (tHit < bestT) { bestT = tHit; bestEnemy = null; bestExtra = null; bestPart = s.part; bestBoss = true; bestBossObj = B2; }
        }
      }
    }
    // alvos extras: animais, zumbis, fantasmas
    for (const a of extraTargets) {
      if (!a.alive || a.enabled === false) continue;
      for (const s of a.hitSpheres()) {
        _v2.copy(s.c).sub(_rayOrig);
        const proj = _v2.dot(_rayDir);
        if (proj < 0 || proj > 240) continue;
        const d2 = _v2.lengthSq() - proj * proj;
        if (d2 < s.r * s.r) {
          const tHit = proj - Math.sqrt(s.r * s.r - d2);
          if (tHit < bestT) { bestT = tHit; bestEnemy = null; bestBoss = false; bestBossObj = null; bestExtra = a; bestPart = s.part; }
        }
      }
    }
    // jogadores remotos (PVP online) — mesmo padrão de hitSpheres dos alvos acima
    let bestRemote = null;
    if (window.__MP_remotePlayers) for (const rp of window.__MP_remotePlayers) {
      if (!rp.alive) continue;
      if (rp.group.position.distanceToSquared(_rayOrig) > 240 * 240) continue;
      for (const s of rp.hitSpheres()) {
        _v2.copy(s.c).sub(_rayOrig);
        const proj = _v2.dot(_rayDir);
        if (proj < 0 || proj > 240) continue;
        const d2 = _v2.lengthSq() - proj * proj;
        if (d2 < s.r * s.r) {
          const tHit = proj - Math.sqrt(s.r * s.r - d2);
          if (tHit < bestT) { bestT = tHit; bestEnemy = null; bestBoss = false; bestBossObj = null; bestExtra = null; bestRemote = rp; bestPart = s.part; }
        }
      }
    }
    const blockT = rayBlockedAt(_rayOrig, _rayDir, Math.min(bestT, 240));

    if (blockT < bestT) {
      _hitPos.copy(_rayOrig).addScaledVector(_rayDir, blockT);
      terrainNormal(_hitPos.x, _hitPos.z, _v1);
      FX.burst(_hitPos, _v1, p % 2 ? 'spark' : 'dirt');
      FX.spawnTracer(_v3, _hitPos, gun.laser ? 0x52ffe6 : 0xffe9a8);
    } else if (bestEnemy || bestBoss || bestExtra || bestRemote) {
      _hitPos.copy(_rayOrig).addScaledVector(_rayDir, bestT);
      FX.burst(_hitPos, _rayDir.clone().negate(), bestBoss ? 'spark' : 'blood');
      FX.spawnTracer(_v3, _hitPos, gun.laser ? 0x52ffe6 : 0xffe9a8);
      const head = bestPart === 'head' || bestPart === 'core';
      let dmg = head ? gun.dmg * 2 : gun.dmg;
      let died;
      if (bestRemote && !bestRemote.isBoss) {
        // JOGADOR REMOTO: o acerto é PREDIÇÃO — o servidor ainda pode recusar
        // (alcance, imunidade, alvo já morto, orçamento). Quem decide mostrar
        // hitmarker/número é o portão em br-game.js, no flush do queueHit.
        // Aqui a mão só reporta o acerto; a tela não é avisada.
        // (o GOLEM mora na MESMA lista, mas o dano dele vai por `bossHit`:
        //  outro handler, sem alcance nem imunidade — feedback imediato.)
        bestRemote.damage(dmg, _hitPos, { head });
        remoteHit = true;
      } else {
        if (bestRemote) { bestRemote.damage(dmg, _hitPos, { head }); remoteHit = true; }
        else if (bestBoss) died = bestBossObj.damage(dmg, _hitPos, _rayDir, bestPart);
        else if (bestExtra) died = bestExtra.damage(dmg, _hitPos, _rayDir, head);
        else died = bestEnemy.damage(dmg, _hitPos, _rayDir, bestPart === 'head');
        hitAny = true; totalDmg += dmg;
        headAny = headAny || head;
        _hitAgg.copy(_hitPos);
        if (died) killAny = true; // pontuação é creditada no die() do alvo
      }
    } else {
      _hitPos.copy(_rayOrig).addScaledVector(_rayDir, 240);
      FX.spawnTracer(_v3, _hitPos, gun.laser ? 0x52ffe6 : 0xffe9a8);
    }
    if (!missEndSet) { missEndSet = true; _missEnd.copy(_hitPos); }
  }
  // BR: quem não foi atingido não via NADA deste disparo — o shotHit só é
  // replicado quando acerta. Um shotFired por gatilho mostra muzzle/tracer.
  if (!remoteHit && missEndSet && window.__BR_shotMiss) window.__BR_shotMiss(_v3, _missEnd);
  if (hitAny) {
    DmgNums.spawn(_hitAgg, Math.round(totalDmg), headAny);
    showHitmarker(HitCore.hitmarkerFlavor({ kill: killAny, head: headAny }));
    if (killAny) { SFX.kill(); }
    else if (headAny) SFX.headshot();
    else SFX.hit();
  }
}

function shootUpdate(dt, t) {
  updateReload(t);
  if (justPressed.has('KeyR')) startReload(t);
  if (justPressed.has('Digit1')) switchWeapon(0);
  if (justPressed.has('Digit2')) switchWeapon(1);
  if (justPressed.has('Digit3')) switchWeapon(2);
  if (justPressed.has('KeyQ')) useMedkit(t);
  if (justPressed.has('KeyF')) eatMeat();
  if (justPressed.has('Tab')) {
    const open = !ui.invPanel.classList.contains('open');
    ui.invPanel.classList.toggle('open', open);
    if (open) Interact.renderInv();
  }
  if (justPressed.has('KeyT')) { // troca o acessório de mira (só armas com 2+ miras)
    const s = WeaponRig.cycleSight(gun);
    if (s) {
      gun.adsFov = s.fov;
      WeaponRig.applySightVisibility(gun);
      centerMsg('Mira: ' + s.label, 1100);
      SFX.switchW();
    }
  }
  // no helicóptero PODE atirar (porta aberta); dirigindo não — as mãos estão no volante
  if (state.driving || state.paused || player.dead || window.__BR_freeze || state.cinematic) { mouse.clicked = false; return; }
  if (justPressed.has('KeyG') && !state.flying) Grenades.throwNade(t);
  const interval = 60 / gun.rpm;
  const want = gun.auto ? mouse.shooting : mouse.clicked;
  if (want && switchAnim > 0.8 && t - gun.lastShot >= interval) {
    if (gun.reloading && gun.mag > 0) gun.reloading = false; // atirar CANCELA a recarga (mantém o já carregado)
    if (!gun.reloading) {
      if (gun.mag > 0) {
        gun.lastShot = t;
        fire(t);
      } else if (t - gun.lastShot > 0.25) {
        gun.lastShot = t; SFX.empty(); startReload(t);
      }
    }
  }
  mouse.clicked = false;
}

/* ================== dano no player / morte / HUD de vida ================== */
function updateHealthHUD() {
  const h = Math.max(0, player.health);
  ui.healthFill.style.width = (h / player.maxHealth * 100) + '%';
  ui.healthFill.classList.toggle('low', h < 35);
  ui.healLow.style.opacity = h < 35 ? ((1 - h / 35) * 0.85).toFixed(2) : '0';
}
function updateArmorHUD() {
  ui.armorFill.style.width = (player.armor / player.armorMax * 100) + '%';
}
function playerDamage(dmg, fromPos, cause) {
  // no BR online, pausar NÃO pode dar imunidade (senão vira exploit em tiroteio)
  if (player.dead || (state.paused && !window.__BR_active)) return;
  if (state.gameTime < (player.invulnUntil || 0)) return; // proteção de spawn
  const shield = HitCore.armorAbsorb(player.armor, dmg); // azul absorve 70% até quebrar
  if (shield.absorbed > 0) {
    player.armor = shield.armor;
    dmg = shield.dmg;
    updateArmorHUD();
  }
  player.health -= dmg;
  // "quanto eu tomei?", "ainda tenho escudo?", "o próximo me mata?" —
  // as três respostas saem juntas, no mesmo instante do golpe
  const lethalNext = HitCore.lethalThreat(player.health, dmg);
  if (dmg > 0 || shield.absorbed > 0) HitFeel.tookHit(dmg, shield.absorbed, lethalNext);
  if (shield.broke) HitFeel.armorBreak();
  player.lastDamageT = state.gameTime;
  const causeType = cause && typeof cause.type === 'string' ? cause.type : 'environment';
  player.lastDamageCause = {
    type: causeType,
    attackerId: cause && cause.attackerId ? String(cause.attackerId) : null,
    weapon: cause && cause.weapon ? String(cause.weapon) : null,
    t: Date.now(),
  };
  // arranhão e tiro de sniper deixaram de sacudir igual: o flash e o tranco
  // passam a medir o TAMANHO do golpe (e o golpe que quase mata bate mais forte)
  damageFlash(lethalNext ? 1.6 : clamp(0.55 + dmg * 0.016, 0.55, 1.2));
  addTrauma(clamp(0.14 + dmg * 0.006, 0.14, 0.55));
  SFX.hurt();
  // dano é no CORPO, não na arma: as duas mãos
  XRTato.emitir('dano', { dano: dmg, letal: lethalNext });
  if (fromPos) { // seta apontando de onde veio o dano
    _euler.setFromQuaternion(camera.quaternion);
    const worldAng = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
    const deg = (_euler.y + Math.PI - worldAng) * 180 / Math.PI;
    ui.dmgDir.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    dmgDirT = 0.9;
  }
  updateHealthHUD();
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    SFX.deathSting();
    timeScale = 0.35; // câmera lenta enquanto cai
    addKillFeed('<b>Você</b> caiu em combate');
    setTimeout(() => Morte.mostrar(), 600);
    /* ONLINE segue igual: o desfecho é do servidor (recap → espectador).
       SOLO não recarrega mais a página — a tela de morte ganhou saída
       própria e JOGAR DE NOVO reinicia a PARTIDA, não o MUNDO (o worldgen
       não roda de novo: a ordem de consumo do rand seedado é contrato). */
    if (window.__MP_active || window.__BR_active) setTimeout(() => window.__MP_respawn(), 3600);
  }
}

const Volcano = createVolcano({ scene, VOLCANO, player, playerDamage, csmMat });

const Car = createCar({ damp, rand, _v1, _v2, heightAt, SFX, FX, scene, world, csmMat, Structures, ui, state, keys, CITY, stampTrack: Grass.stampTrack });

const Heli = createHeli({ CFG, clamp, damp, _v1, groundAt, SFX, scene, camera, csmMat, Structures, ui, centerMsg, state, keys, mouse, player, chaseCamPos });

/* ================== entrar/sair + câmera de perseguição ================== */
let driveBlend = 0;
const _camQ = new THREE.Quaternion();
const _lookM = new THREE.Matrix4();

function tryToggleCar() {
  if (state.flying) { Heli.exit(); return; }
  if (state.driving) {
    // sair: posiciona o player ao lado esquerdo do veículo
    _v1.set(0, 0, -2.6).applyQuaternion(Car.group.quaternion).add(Car.group.position);
    const gy = heightAt(_v1.x, _v1.z);
    player.pos.set(_v1.x, Math.max(gy, _v1.y - 0.5), _v1.z);
    player.vel.set(0, 0, 0);
    state.driving = false;
    ui.speedo.style.display = 'none';
    ui.ammoWrap.style.display = '';
    SFX.carDoor();
  } else {
    if (Heli.tryEnter()) return;
    const { v, d } = Car.nearest(player.pos);
    if (d < 4.5) {
      // BR online: carro com outro jogador dentro não aceita segundo motorista
      if (window.__BR_takenCars && window.__BR_takenCars.has(Car.vehicles.indexOf(v))) {
        centerMsg('Veículo ocupado!', 1400);
        return;
      }
      Car.setCur(v);
      // desvira o veículo se estiver capotado
      const up = v.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      if (up.y < 0.5) {
        const f = v.chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
        const yaw = Math.atan2(-f.z, f.x);
        v.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
        v.chassisBody.position.y += 1.2;
        v.chassisBody.velocity.set(0, 0, 0);
        v.chassisBody.angularVelocity.set(0, 0, 0);
      }
      state.driving = true;
      ui.speedo.style.display = 'block';
      ui.ammoWrap.style.display = 'none';
      mouse.shooting = false; mouse.aiming = false;
      SFX.carDoor();
      SFX.engineStart();
      chaseCamPos.copy(camera.position); // a câmera parte de onde está (lerp suave)
    }
  }
}

function carCameraUpdate(dt) {
  driveBlend = damp(driveBlend, (state.driving || state.flying) ? 1 : 0, 4.5, dt);
  if (driveBlend < 0.002) return;
  const vg = state.flying ? Heli.group : Car.group;

  // alvo atrás do veículo, sempre acima do terreno
  _v1.set(state.flying ? -10.5 : -7.4, state.flying ? 4.2 : 3.1, 0).applyQuaternion(vg.quaternion).add(vg.position);
  const minY = Math.max(heightAt(_v1.x, _v1.z) + 0.7, vg.position.y + 1.6);
  if (_v1.y < minY) _v1.y = minY;
  chaseCamPos.x = damp(chaseCamPos.x, _v1.x, 5.5, dt);
  chaseCamPos.y = damp(chaseCamPos.y, _v1.y, 5.5, dt);
  chaseCamPos.z = damp(chaseCamPos.z, _v1.z, 5.5, dt);

  const vg2 = state.flying ? Heli.group : Car.group;
  _v2.set(2.6, 1.15, 0).applyQuaternion(vg2.quaternion).add(vg2.position);
  chaseLook.x = damp(chaseLook.x, _v2.x, 9, dt);
  chaseLook.y = damp(chaseLook.y, _v2.y, 9, dt);
  chaseLook.z = damp(chaseLook.z, _v2.z, 9, dt);

  // mistura posição e rotação entre FPS e perseguição
  camera.position.lerp(chaseCamPos, driveBlend);
  _lookM.lookAt(camera.position, chaseLook, _v3.set(0, 1, 0));
  _camQ.setFromRotationMatrix(_lookM);
  camera.quaternion.slerp(_camQ, driveBlend);

  // enquanto dirige, o "player" acompanha o veículo (recentra a grama etc.)
  if (state.driving) {
    player.pos.copy(Car.group.position);
    player.pos.y = heightAt(player.pos.x, player.pos.z);
    player.vel.set(0, 0, 0);
  }
}

/* ================================================================
   INIMIGOS — corpos de cápsulas/esferas, FSM, animação procedural
   Estados: PATRULHA -> ALERTA -> PERSEGUIR -> ATACAR
   ================================================================ */
const lastShotInfo = { pos: new THREE.Vector3(), t: -99 };
function setTimeScale(v) { timeScale = v; }
const Pickups = createPickups({ heightAt, SFX, scene, Structures, showBanner, centerMsg, getGun: () => gun, updateAmmoHUD, updateInvHUD, updateArmorHUD, player, inventory }); // criado antes: Enemies dropa loot
const Chars = createCharModels();
const Enemies = createEnemies({ CFG, clamp, lerp, damp, rand, TAU, _v1, _v2, _v3, heightAt, slopeAt, terrainNormal, WATER_LEVEL, obstaclesNear, SFX, FX, scene, csmMat, Structures, addScore, addKillFeed, player, playerDamage, addTrauma, Car, Pickups, knuckleMat, lastShotInfo, Chars });

/* registro do último tiro do player (os inimigos "ouvem") */
/* alvos extras (animais, zumbis, fantasmas) e lista de bosses */
const extraTargets = [];
const Bosses = [];
const MFlags = { colosso: false, alien: false, night: false }; // marcos de missão

const Grenades = createGrenades({ clamp, rand, _v1, heightAt, groundAt, terrainNormal, rayBlockedAt, Structures, SFX, FX, scene, camera, updateInvHUD, state, player, playerDamage, addTrauma, recoil, inventory, Car, Enemies, Bosses, extraTargets });



/* ================================================================
   BOSS — COLOSSO, guardião do forte (o núcleo brilhante é o ponto fraco)
   ================================================================ */
let timeScale = 1; // câmera lenta cinematográfica na morte do boss
const Boss = createBoss({ clamp, damp, rand, TAU, _v1, _v2, heightAt, groundAt, SFX, FX, scene, csmMat, Structures, ui, addScore, addKillFeed, showBanner, player, playerDamage, addTrauma, Bosses, Pickups, MFlags, setTimeScale });
/* Rockets criado APOS o Boss (dependencia declarada) — só é usado em runtime */
const Rockets = createRockets({ rand, _v1, _v2, heightAt, FX, scene, Structures, player, Enemies, Grenades, Boss, Bosses, extraTargets });

/* Cobertura de céu: chuva/neve não caem dentro de prédios/torre/nave e o som
   fica abafado. Fontes: footprints×altura dos lotes da cidade + TODAS as lajes
   caminháveis (andares da torre, plataformas) — zero raycast por gota. */
const Cover = createCover();
function buildCityCover() {
  const cityY = 3.2; // platô urbano
  CityLayout.LOTS.forEach((lot, i) => {
    const r = CityLayout.footprintRect(lot, 0.4);
    Cover.addRoofRect({ x0: CITY.x + r.x0, x1: CITY.x + r.x1, z0: CITY.z + r.z0, z1: CITY.z + r.z1,
      roofY: cityY + lot.h, sourceId: 'city' });
  });
}
buildCityCover();
// estruturas do CAMPO (torres/cabanas): telhado climático próprio — o evento
// da cidade remove só o source 'city'; 'campo' fica de pé
for (const r of Structures.fieldRoofs)
  Cover.addRoofRect({
    x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, roofY: r.roofY,
    sourceId: r.castle ? 'castle' : 'campo',
  });
for (const p of platforms) {
  if (p.ramp) continue;
  if ((p.x1 - p.x0) * (p.z1 - p.z0) < 6) continue; // só lajes com área de teto
  Cover.addRoofRect({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y: 0, roofY: p.y,
    sourceId: p.city ? 'city' : p.castle ? 'castle' : 'slab' });
}
Structures.castle.registerCleanup(() => Cover.removeBySource('castle'));
// cidade destruída = telhado climático some junto (e volta no restore)
Structures.city.onStateChange = st => {
  // A troca remove/reinsere lajes CANNON logo após este callback. Veículos
  // hibernados precisam recuperar a suspensão antes que o apoio físico mude,
  // senão podem permanecer congelados no ar até alguma interação externa.
  for (const v of Car.vehicles) Car.wake(v);
  Cover.removeBySource('city');
  if (st === 'intact') {
    buildCityCover();
    for (const p of platforms) {
      if (p.ramp || !p.city) continue;
      if ((p.x1 - p.x0) * (p.z1 - p.z0) < 6) continue;
      Cover.addRoofRect({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, roofY: p.y, sourceId: 'city' });
    }
  }
};

const Env = createEnv({ CFG, clamp, lerp, damp, rand, TAU, SFX, scene, camera, renderer, csm, sky, sunDir, hemiLight, ambLight, Water, Grass, Structures, _euler,
  worldSeed: ((window.__MP_init && window.__MP_init.worldSeed) >>> 0) || 424242,
  coverAt: (x, y, z) => Cover.coverAt(x, y, z),
  // por gota/floco: booleano, sem objeto por consulta (js/cover.js)
  isCovered: (x, y, z) => Cover.isCovered(x, y, z) });

/* ================================================================
   VIDA AMBIENTE — borboletas, pássaros, pólen, fogueira, fumaça,
   bandeiras tremulando e canto de passarinhos
   ================================================================ */
const Amb = createAmb({ rand, TAU, _v1, _v2, heightAt, biomeAt, addObstacle, SFX, FX, scene, csmMat, Structures, player });

/* ================================================================
   ANIMAIS — cervos (carne) e lobos (selvagens, mordem)
   ================================================================ */
const Animals = createAnimals({ clamp, rand, TAU, heightAt, slopeAt, WATER_LEVEL, CITY, scene, csmMat, addScore, player, playerDamage, extraTargets, Pickups, Structures, obstaclesNear, SFX });

/* ================================================================
   CRIATURAS DA NOITE — zumbis e fantasmas (somem ao amanhecer)
   ================================================================ */
const Night = createNight({ rand, TAU, heightAt, WATER_LEVEL, SFX, scene, csmMat, Structures, obstaclesNear, addScore, addKillFeed, state, player, playerDamage, extraTargets, Pickups, Env, MFlags });

const Skeletons = createSkeletons({ rand, TAU, heightAt, WATER_LEVEL, SFX, scene, csmMat, addScore, addKillFeed, player, playerDamage, extraTargets, Pickups, Structures, obstaclesNear });

/* ================================================================
   BOSS 2 — O VISITANTE (alien na cratera do deserto) -> arma PLASMA
   ================================================================ */
const Alien = createAlien({ rand, TAU, _v1, _v2, heightAt, biomeAt, WATER_LEVEL, CITY, SFX, FX, scene, csmMat, addScore, addKillFeed, showBanner, unlockWeapon, state, player, playerDamage, Bosses, Pickups, MFlags, setTimeScale, Structures, Chars });

/* ================================================================
   MISSÕES — cadeia com recompensas
   ================================================================ */
const Missions = (() => {
  function baseCleared() {
    // roda por frame enquanto a missão está ativa: sem filter/every (1 array
    // + 2 closures por base por frame), só uma varredura
    for (const b of Structures.baseSites) {
      let guards = 0, vivos = 0;
      for (const e of Enemies.list) {
        if (!e.plan || !e.plan.army || Math.hypot(e.plan.x - b.x, e.plan.z - b.z) >= 30) continue;
        guards++;
        if (e.alive) vivos++;
      }
      if (guards && !vivos) return true;
    }
    return false;
  }
  const list = [
    { text: 'Elimine 6 inimigos', ok: () => kills >= 6,
      rw() { inventory.nades = Math.min(inventory.nadesMax, inventory.nades + 2); updateInvHUD(); addScore(300); }, rt: '+2 granadas · +300 pts' },
    { text: 'Limpe uma base militar (■ no radar)', ok: baseCleared,
      rw() { inventory.medkits = inventory.medkitsMax; updateInvHUD(); addScore(500); }, rt: 'kits médicos cheios · +500 pts' },
    { text: 'Chegue ao topo da TORRE NEXUS (cidade)', ok: () => player.pos.y > Structures.towerTopY - 1.5,
      rw() { addScore(800); }, rt: 'BAZUCA e helicóptero no telhado · +800 pts' },
    { text: 'Derrote o COLOSSO no forte oriental', ok: () => MFlags.colosso,
      rw() { addScore(600); }, rt: 'ARMADURA azul do guardião · +600 pts' },
    { text: 'Investigue a queda no deserto: O VISITANTE', ok: () => MFlags.alien,
      rw() { addScore(800); }, rt: 'rifle de PLASMA · +800 pts' },
    { text: 'Sobreviva a uma noite inteira', ok: () => MFlags.night,
      rw() { inventory.meat = inventory.meatMax; updateInvHUD(); addScore(1000); }, rt: 'provisões cheias · +1000 pts' },
  ];
  let idx = 0;
  function refresh() {
    ui.missionText.textContent = idx < list.length ? list[idx].text : 'Mundo livre — cace, dirija, explore!';
  }
  function update() {
    if (idx >= list.length) return;
    if (list[idx].ok()) {
      const m = list[idx];
      m.rw();
      showBanner('MISSÃO CONCLUÍDA<small>' + m.rt + '</small>', 4200);
      SFX.unlock();
      idx++;
      refresh();
    }
  }
  refresh();
  return { update, get idx() { return idx; }, set idx(v) { idx = clamp(v, 0, list.length); refresh(); } };
})();
await bootFase('criaturas e missões');

/* ================================================================
   INTERAÇÃO — baús, bazuca, veículos (tecla E)
   ================================================================ */
let Cannon = null; // Canhão de Circo — criado no FIM do init (pós-worldgen); Interact lê via getter
let MapToys = null; // 5 atrações do mapa — idem; Interact e playerUpdate leem via referência
let Secrets = null; // 3 segredos (armas trancadas) — depende de MapToys, vem por último
const Interact = createInteract({ heightAt, SFX, scene, csmMat, Structures, ui, centerMsg, arsenal, unlockWeapon, updateInvHUD, state, justPressed, player, inventory, Car, Heli, tryToggleCar, getCannon: () => Cannon, getMapToys: () => MapToys, getSecrets: () => Secrets, isMobile: __mobile,
  /* D2 — DE ONDE SE MEDE O ALCANCE. Em VR o colisor para na parede e a cabeça
     segue (js/xr/xrrig.js); a régua passa a ser a CABEÇA, descontado o que o
     mundo RECUSOU. Fora de XR os dois são `null`/0 e nada muda.
     A GUARDA `XR.presenting` NÃO É ENFEITE: `headWorldPosition` devolve a
     câmera de DESKTOP quando não há sessão, e aí o alcance passaria a medir da
     altura do olho com bob — mudança de gameplay no monitor. */
  cabecaXR: alvo => (XR.presenting ? XR.headWorldPosition(alvo) : null),
  foraXR: () => (XR.presenting ? XR.foraDoCorpo : 0),
});
/* A arma na mão e o alvo de interação marcado no MUNDO: em VR não existe centro
   de tela onde pendurar retículo nem dica de "aperte E". */
const XRArma = createXrWeapon({ THREE, WeaponRig, arsenal });
const XRInterage = createXrInteract({
  THREE, scene, player, state, heightAt, Structures, Car, Heli, arsenal,
  getCannon: () => Cannon, getMapToys: () => MapToys, getSecrets: () => Secrets,
  /* A MESMA RÉGUA do js/interact.js, e isso é contrato: o marcador diz "dá pra
     usar daqui" e quem resolve a tecla é o outro módulo. Duas réguas = o
     jogador vê verde e o jogo recusa. */
  cabecaXR: alvo => (XR.presenting ? XR.headWorldPosition(alvo) : null),
  foraXR: () => (XR.presenting ? XR.foraDoCorpo : 0),
});
/* PAINEL E HUD DENTRO DO MUNDO. O menu, as opções e o HUD são DOM, e DOM não
   existe dentro de uma sessão imersiva: com o aparelho na cara não havia como
   pausar, mudar o conforto ou sair da partida. */
const XRUI = createXrUi({
  THREE, scene, camera, giro: XR.giro,
  andar: XRAndar, rotulosAndar: ROTULOS_ANDAR,
  armazem: (() => { try { return window.localStorage; } catch { return null; } })(),
  acoes: {
    pausar: () => setPaused(true),
    retomar: () => setPaused(false),
    // recentrar zera o giro artificial e replanta o rig SEM mover o jogador no mundo
    /* `calibrar()` junto: a referência de altura do corpo não desce sozinha
       (ela só sobe, com sustentação), e recentrar é o gesto que o jogador já
       usa quando alguma coisa ficou fora do lugar. */
    recentrar: () => { XR.giro.zerar(); xrYaw = 0; XR.corpo.calibrar(); XR.place(player.pos.x, player.pos.y, player.pos.z, xrYaw); },
    /* SAIR encerra a sessão junto, e é deliberado: `voltarAoMenu()` aterrissa
       no menu principal, que ainda é DOM. Sair da partida sem sair do VR
       deixaria o jogador de pé no mundo sem menu — o beco que esta rodada veio
       fechar. */
    /* SAIR DA PARTIDA aterrissa no MENU DENTRO DO MUNDO: `voltarAoMenu()`
       derruba `started`, e no frame seguinte o `tick` reabre este painel em
       modo `menu`. Encerrar a sessão junto (o `XR.exit()` que estava aqui) era
       o remendo de quando o menu principal só existia no DOM — quem sai do VR
       agora é a linha SAIR DO VR do próprio menu. */
    sair: () => { voltarAoMenu(); },
    reaparecer: () => restartMatch(),
    // em partida online o morto fica morto até a rodada acabar
    podeReaparecer: () => !window.__BR_active,
  },
});
/* CONVERSA, PLACAR E SALA DENTRO DO MUNDO. As três telas sociais do BR são DOM,
   e DOM não chega ao compositor dentro da sessão: o campo de texto do chat
   recebe foco e fica invisível, o placar fica invisível e o lobby inteiro fica
   invisível. Elas viram ABAS deste mesmo painel — e não um quarto objeto na
   cena, que custaria mais draw call por olho.
   Nenhum canal novo: as mensagens saem pelo evento `chat` que o br-game.js já
   usa (o servidor já limita a cadência e já corta o tamanho), e o placar lê o
   `roster` que o servidor já transmite — que de propósito NÃO carrega posição,
   porque transmitir posição seria wallhack. */
XRUI.conectarSocial({
  ler: () => {
    const D = window.__BR_debug;
    const t = (D && D.S && D.S.matchT) ? Math.max(0, Math.floor(D.S.matchT())) : 0;
    const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    return {
      eu: { id: (window.__MP_init && window.__MP_init.id) || '' },
      // sem partida em andamento não existe "sair da partida": botão morto é
      // pior que botão ausente, e chegava-se nele em dois cliques do menu
      jogando: state.started,
      partida: (D && D.S && D.S.matchNum) || '',
      tempo: (D && D.S && D.S.phase === 'PLAY') ? `${mm}:${ss}` : '',
    };
  },
  enviar: msg => { if (__mpSocket) __mpSocket.emit('chat', { msg }); },
  acoes: {
    /* mesmo evento do botão do lobby de DOM: o servidor recusa quem não é
       anfitrião, e o painel só oferece o botão a quem é. FECHA porque quem
       manda começar quer jogar — painel aberto mantém o jogo pausado. */
    comecar: () => { if (__mpSocket) __mpSocket.emit('requestStart'); XRUI.fechar(); },
    // ...e daqui também se sai para o menu DENTRO do mundo, não para o desktop
    sair: () => { voltarAoMenu(); },
  },
});
/* OS DOIS ALIMENTADORES — ouvintes ADITIVOS no mesmo socket. O br-game.js
   continua dono do log de chat e do placar de DOM; nada aqui os substitui. */
if (__mpSocket) {
  __mpSocket.on('roster', d => XRUI.social.roster(d));
  __mpSocket.on('chat', d => XRUI.social.receber(d));
}
/* O MENU PRINCIPAL DENTRO DO MUNDO — o que vem ANTES da partida. Entrar em VR
   começava a partida à força porque o menu é DOM: sem tela no headset,
   "jogando" era o único estado alcançável e o jogador não escolhia nada.
   As linhas de conforto NÃO são repetidas aqui: o painel entrega as dele
   prontas ao módulo (js/xr/xrmenu.js), e o lobby é a aba SALA que já existe. */
XRUI.conectarMenu({
  ler: () => ({
    pronto: MenuGate.wired,
    jogando: state.started,
    sala: temSala(),
    caiu: MenuGate.dropped,
    solo: emSolo(),
    voltando: MenuGate.voltando,
    quebrado: brQuebrado(),
  }),
  acoes: {
    /* o MESMO caminho do #btnNew: sai da sala, fecha o painel de DOM e começa.
       `trusted` falso porque não há gesto de mouse aqui — e no headset não há
       pointer lock a pedir (startGame já trata isso). */
    solo: () => { entrarEmSolo(); MENU.close(); startGame(false); },
    /* o MESMO caminho do #btnMulti: vindo do solo, reconecta. Quem mostra a
       sala é a aba SALA do painel, e quem troca de aba é o js/xr/xrui.js. */
    multi: () => { if (emSolo()) voltarParaSala(); },
    sairVR: () => { XR.exit(); },
  },
});
const XRHud = createXrHud({
  THREE,
  ler: () => ({
    oculto: state.driving || state.flying || !state.started || state.paused,
    ads: mouse.aiming,
    vida: player.health / player.maxHealth,
    armadura: player.armor / player.armorMax,
    arma: gun ? gun.name : '',
    melee: !!(gun && gun.melee),
    pente: gun ? gun.mag : 0,
    reserva: gun ? gun.reserve : 0,
    recarregando: !!(gun && gun.reloading),
    granadas: inventory.nades,
    medkits: inventory.medkits,
    abates: kills,
    br: (window.__BR_active && window.__BR_debug) ? (() => {
      /* `tempo` e `zona` chegavam como string vazia literal: dois dos itens do
         HUD estavam cabeados e cegos. O relógio da partida é `S.matchT()` e o
         estado do gás é o rótulo do controlador de zona. */
      const D = window.__BR_debug, t = Math.max(0, Math.floor(D.S.matchT ? D.S.matchT() : 0));
      const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
      return {
        fase: D.S.phase, vivos: D.S.alive,
        tempo: `${mm}:${ss}`,
        zona: D.zc ? (D.zc.label || (D.zc.closesIn > 0 ? `zona fecha em ${Math.ceil(D.zc.closesIn)}s` : '')) : '',
      };
    })() : null,
    // o DOM continua sendo o MODELO do feed; o painel do pulso é só a vista
    feed: ui.killfeed ? Array.prototype.slice.call(ui.killfeed.children, -3).map(e => e.textContent) : [],
    /* H1, item 17: o minimapa. O canvas é o do próprio jogo — o painel do
       pulso é uma VISTA dele, não um segundo radar. `versao` diz ao HUD
       quando vale subir a textura à GPU. */
    mapa: { canvas: MiniMap.canvasXR(), versao: MiniMap.versao },
  }),
});

/* ================== minimapa / radar (canvas 2D) ================== */
const _eulerMapa = new THREE.Euler(0, 0, 0, 'YXZ');
const MiniMap = (() => {
  const S = 168, C = S / 2, RANGE = 95;
  const S_XR = 256;   // o mapa do pulso é lido a ~35 cm; 168 px ficaria serrilhado
  const cv = ui.minimap;
  let worker = null, legacyCtx = null;
  /* Canvas SÓ do headset. Dentro de uma sessão imersiva o `<canvas>` do DOM
     não chega ao compositor, então o mapa do pulso (js/xr/xrhud.js) precisa de
     uma superfície própria — a mesma cena, desenhada pela mesma função, num
     canvas que vira textura. Nasce preguiçoso: quem nunca entra em VR não
     paga um byte. Canvas de DOM não é `Object3D` e não consome o
     `Math.random` seedado, mas a preguiça vale pela memória. */
  let cvXR = null, ctxXRv = null, versao = 0, ultimoYaw = 0;
  function ctxXR() {
    if (!ctxXRv) {
      cvXR = document.createElement('canvas');
      cvXR.width = S_XR; cvXR.height = S_XR;
      ctxXRv = cvXR.getContext('2d');
    }
    return ctxXRv;
  }
  /* PARALELISMO: o radar é desenhado num Web Worker via OffscreenCanvas —
     o jogo só posta um Float32Array compacto de posições (15x/s). Sem suporte
     do navegador, cai no desenho clássico na thread principal. */
  if (window.Worker && cv.transferControlToOffscreen) {
    try {
      const off = cv.transferControlToOffscreen();
      worker = new Worker('js/minimap-worker.js');
      worker.postMessage({ type: 'init', canvas: off,
        sites: Structures.sites.flatMap(s => [s.x, s.z]) }, [off]);
      worker.onerror = e => console.warn('[minimap] worker falhou:', e.message);
    } catch (e) { worker = null; }
  }
  if (!worker) legacyCtx = cv.getContext('2d');

  function pack() {
    const picks = Pickups.actives();
    const ens = Enemies.list.filter(e => e.alive);
    const bs = Bosses.filter(b => b.alive);
    const buf = new Float32Array(6 + picks.length * 2 + 1 + ens.length * 3 + 1 + bs.length * 3);
    let i = 0;
    buf[i++] = ultimoYaw; buf[i++] = player.pos.x; buf[i++] = player.pos.z;
    buf[i++] = Car.group.position.x; buf[i++] = Car.group.position.z;
    buf[i++] = picks.length;
    for (const p of picks) { buf[i++] = p.root.position.x; buf[i++] = p.root.position.z; }
    buf[i++] = ens.length;
    for (const e of ens) {
      buf[i++] = e.group.position.x; buf[i++] = e.group.position.z;
      buf[i++] = (e.fsm === 'PERSEGUIR' || e.fsm === 'ATACAR') ? 1 : 0;
    }
    buf[i++] = bs.length;
    for (const b of bs) { buf[i++] = b.pos().x; buf[i++] = b.pos().z; buf[i++] = b.name === 'VISITANTE' ? 1 : 0; }
    return buf;
  }
  /* O YAW DO MAPA VEM DA VISTA NO MUNDO, e isto é o defeito que este bloco
     conserta. Em XR `camera.quaternion` é a pose da cabeça RELATIVA AO RIG, e
     o giro artificial (analógico) mora no RIG: lendo a câmera direto, o
     minimapa ignorava TODO giro de analógico — girar 180° com o polegar
     deixava o mapa apontando para o lado oposto do que o jogador via. É o
     mesmo defeito que já custou o movimento invertido e o `rotY` errado
     mandado ao servidor; a fonte única certa é `vistaMundo()`. Fora de XR o
     resultado é idêntico ao de antes (a câmera é filha da cena). A ordem
     'YXZ' também importa: com 'XYZ' e a cabeça inclinada, `_euler.y` não é o
     yaw. */
  function draw() {
    _eulerMapa.setFromQuaternion(vistaMundo(), 'YXZ');
    ultimoYaw = _eulerMapa.y;
    if (worker) { const b = pack(); worker.postMessage({ type: 'draw', b }, [b.buffer]); }
    else drawLegacy(legacyCtx, S);
    /* o mapa do pulso: mesma função, mesmo frame, outra superfície */
    if (XR.presenting) { drawLegacy(ctxXR(), S_XR); versao++; }
  }
  function drawLegacy(ctx, Spx) {
    /* TUDO abaixo desta linha desenha em coordenadas de 168 px — que é como o
       radar foi desenhado, com espessuras e raios escolhidos nessa escala. O
       canvas do pulso é maior só para não serrilhar; o `scale` faz a conta. */
    const k = Spx / 168;
    ctx.clearRect(0, 0, Spx, Spx);
    const yaw = ultimoYaw;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(C, C);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (const r of [C * 0.45, C * 0.85]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-C, 0); ctx.lineTo(C, 0); ctx.moveTo(0, -C); ctx.lineTo(0, C); ctx.stroke();
    ctx.rotate(yaw);
    const px = player.pos.x, pz = player.pos.z;
    const put = (wx, wz) => [ (wx - px) / RANGE * C, (wz - pz) / RANGE * C ];
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', 0, -C + 14);
    {
      const [x, y] = put(Car.group.position.x, Car.group.position.z);
      if (x * x + y * y < C * C * 0.92) { ctx.fillStyle = '#4dd8ff'; ctx.fillRect(x - 3.5, y - 3.5, 7, 7); }
    }
    ctx.fillStyle = 'rgba(225,225,225,0.45)';
    for (const s of Structures.sites) {
      const [x, y] = put(s.x, s.z);
      if (x * x + y * y < C * C * 0.92) ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.fillStyle = '#7dff8a';
    for (const p of Pickups.actives()) {
      const [x, y] = put(p.root.position.x, p.root.position.z);
      if (x * x + y * y < C * C * 0.92) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const e of Enemies.list) {
      if (!e.alive) continue;
      const [x, y] = put(e.group.position.x, e.group.position.z);
      if (x * x + y * y > C * C * 0.92) continue;
      const hot = e.fsm === 'PERSEGUIR' || e.fsm === 'ATACAR';
      ctx.fillStyle = hot ? '#ff4030' : 'rgba(255,120,90,0.8)';
      ctx.beginPath(); ctx.arc(x, y, hot ? 4 : 3, 0, TAU); ctx.fill();
    }
    for (const B2 of Bosses) {
      if (!B2.alive) continue;
      let [bx, by] = put(B2.pos().x, B2.pos().z);
      const dEdge = Math.hypot(bx, by), maxR = C * 0.84;
      if (dEdge > maxR) { bx *= maxR / dEdge; by *= maxR / dEdge; }
      ctx.fillStyle = B2.name === 'VISITANTE' ? '#35ffc8' : '#ff7a1e';
      ctx.beginPath();
      ctx.moveTo(bx, by - 7); ctx.lineTo(bx + 5.5, by); ctx.lineTo(bx, by + 7); ctx.lineTo(bx - 5.5, by);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(C, C);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  return {
    draw,
    /* leitura pura para o HUD do headset e para QA. `versao` é o que diz à
       textura que vale subir à GPU; `ultimoYaw` é o que prova, de fora, que o
       mapa segue o giro artificial e não só a cabeça. */
    canvasXR: () => (XR.presenting ? (ctxXR(), cvXR) : null),
    ctxXR,
    S_XR,
    get versao() { return versao; },
    get ultimoYaw() { return ultimoYaw; },
  };
})();

/* radar das ATRAÇÕES: overlay 2D por cima do minimapa. Ícones coloridos na
   posição real quando perto, CLAMPADOS na borda quando longe — o jogador sempre
   vê a DIREÇÃO das atrações (o radar só alcança 95 m; elas vivem a 150-360 m). */
const ToysRadar = (() => {
  const S = 168, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const wrap = document.getElementById('minimapWrap');
  if (wrap) wrap.appendChild(cv);
  const ctx = cv.getContext('2d');
  /* Duas superfícies, um desenho: o overlay do monitor (que limpa a própria
     camada) e o mapa do pulso em VR (que NÃO limpa — o minimapa acabou de
     pintar a base ali). Mesmo yaw de mundo do MiniMap, pela mesma razão. */
  function draw() {
    pinta(ctx, S, true);
    if (XR.presenting) pinta(MiniMap.ctxXR(), MiniMap.S_XR, false);
  }
  function pinta(ctx, Spx, limpar) {
    const k = Spx / 168;
    if (limpar) ctx.clearRect(0, 0, Spx, Spx);
    if (!MapToys) return;
    ctx.save(); ctx.scale(k, k); ctx.translate(C, C); ctx.rotate(MiniMap.ultimoYaw);
    const maxR = C * 0.8;
    // atrações + POIs do mundo (entradas dos térreos ocos, segredos): mesma
    // regra de clamp na borda, senão POI fora do alcance de 95 m some
    const pois = MapToys.landmarks.concat(Structures.poiMarks, Secrets ? Secrets.marks : []);
    for (const l of pois) {
      let x = (l.x - player.pos.x) / 95 * C, y = (l.z - player.pos.z) / 95 * C;
      const d = Math.hypot(x, y);
      const far = d > maxR;
      if (far) { x *= maxR / d; y *= maxR / d; }
      ctx.fillStyle = '#' + l.color.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(x, y, far ? 2.6 : 3.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  return { draw };
})();

/* ================== loop principal ================== */
let lastNow = performance.now();
let treeAcc = 9, fpsFrames = 0, fpsAcc = 0, fpsVal = 0, miniAcc = 0;
/* No celular o teto de substeps cai pra 2: com frame lento o passo fixo
   dispara até 3 substeps por render, multiplicando CPU exatamente quando ela
   já estourou (espiral da morte do substep fixo). */
const PHYSICS_DT = 1 / 60;
const PHYSICS_MAX_STEPS = __mobile ? Math.min(3, MOBILE_PHYSICS_MAX_STEPS) : 3;
const perf = { physicsSteps: 0, physicsDroppedMs: 0, simulationCoverage: 1, frameMs: 0,
  simMs: 0, renderScale: 1, renderScaleChanges: 0 };
const carPosV = new THREE.Vector3();
let menuT = 0;

/* ---- passeio cinematográfico do menu ----
   Planos por pontos de interesse REAIS do mapa (a cidade, o castelo, a boca
   do vulcão, o carro do spawn). Os alvos saem de Structures/CityLayout/
   VOLCANO — nada aqui sorteia nada: consumir o `Math.random` seedado mudaria
   o layout do mundo (invariante do worldgen). `at(v)` preenche o vetor
   recebido, então o passeio inteiro roda com zero alocação por frame. */
let menuFortY = 0; // chão do forte: constante, amostrado uma vez só
/* hora travada do menu (pico do golden hour) e a hora de volta ao jogo — o
   ciclo dinâmico é feature anunciada no próprio subtítulo, não pode ficar preso */
const MENU_TOD = 0.715, GAME_TOD = 0.33;
/* Ordem proposital: abre no SPAWN (íntimo, e o plano mais barato de desenhar,
   que é o que a página mostra enquanto ainda está bootando) e só então abre
   pro panorama — cidade, castelo, vulcão. */
/* ENQUADRAMENTO. Duas coisas decidem se o passeio aparece ou não:

   1) `pan`/`tilt` (ver js/menuscene.js) deslocam a MIRA, não a câmera. O
      painel do menu mora na coluna ESQUERDA da tela, então todo plano usa
      pan negativo: o assunto vai pro terço direito, longe do texto. Sem isso
      o castelo nascia atrás do card de controles e cortado ao meio.
   2) a distância: o fog do mundo começa em VIEW_DIST*0.5 = 210 m. Assunto
      além de ~260 m vira névoa; todos os raios ficam abaixo disso.

   Os ângulos iniciais (a0) foram escolhidos contra o azimute do sol do golden
   hour (~101°, ver MENU_TOD): a luz entra de RASPÃO no assunto (sombras
   longas, volume) em vez de estourar de frente ou virar silhueta. */
const MENU_SHOTS = [
  { key: 'carro', dur: 9,
    at: v => v.set(Car.group.position.x, Car.group.position.y + 0.9, Car.group.position.z),
    r0: 15.5, r1: 9.6, h0: 5.4, h1: 3.4, a0: 0.55, spin: 0.055, fov0: 48, fov1: 54,
    pan: -0.20, tilt: 0.05 },
  { key: 'cidade', dur: 11,
    // meio da Torre Nexus: a torre (38 m) vira o eixo vertical do plano
    at: v => v.set(Structures.heliSpot.x, Structures.heliSpot.y * 0.62, Structures.heliSpot.z),
    r0: 158, r1: 104, h0: 28, h1: 13, a0: 2.90, spin: 0.028, fov0: 44, fov1: 50,
    pan: -0.24, tilt: -0.03 },
  { key: 'castelo', dur: 10,
    at: v => v.set(Structures.FORT_POS.x,
      menuFortY || (menuFortY = heightAt(Structures.FORT_POS.x, Structures.FORT_POS.z) + 9),
      Structures.FORT_POS.z),
    r0: 88, r1: 58, h0: 32, h1: 16, a0: 0.62, spin: -0.030, fov0: 46, fov1: 52,
    pan: -0.26, tilt: 0.02 },
  { key: 'vulcao', dur: 10,
    // câmera ABAIXO do meio do cone: o vulcão recorta contra o céu do fim de
    // tarde e a boca de lava fica acima do centro. De cima (o plano antigo) o
    // que se via era uma mancha escura de basalto ocupando a tela inteira.
    at: v => v.set(VOLCANO.x, VOLCANO.baseY + VOLCANO.h * 0.66, VOLCANO.z),
    r0: 288, r1: 224, h0: -8, h1: -26, a0: 3.30, spin: 0.024, fov0: 42, fov1: 48,
    pan: -0.20, tilt: -0.07 },
];
const MenuCam = createMenuCamera({ THREE, camera, heightAt, shots: MENU_SHOTS,
  cutEl: document.getElementById('menuCut'),
  /* Só corta de plano com o prewarm QUENTE e OCIOSO: pelo menos um flush
     completo e fila vazia. Sem isto o corte pra cidade linka os shaders dela
     na hora (síncrono) — segundos de main thread travada em GPU fraca, o
     socket cai e o multiplayer recarrega a página no meio do menu (raiz do
     cancelamento em cadeia de test/br-drops; ver test/menuscene-gate.test.js). */
  mayTour: () => { const s = prewarm.stats; return s.runs > 0 && s.queued === 0; } });
await bootFase('cenário e câmeras');

/* O DONO DO LOOP É O RENDERER, e não o `requestAnimationFrame` da janela.
   Dentro de uma sessão WebXR quem agenda frame é `session.requestAnimationFrame`
   (cadência do headset, 72 Hz no Quest 3, com a pose da cabeça junto), e o
   three só sabe trocar uma fila pela outra se o loop for dele. No desktop
   `setAnimationLoop` cai no mesmo `requestAnimationFrame` de sempre — a
   cadência não muda. */
/* true assim que o primeiro tick() sincrono já rodou — ver o bloco
   "PRIMEIRO FRAME ANTECIPADO" logo depois de Grass.refreshAll(). Evita que
   startLoop(), religado no fim do módulo por hábito, desenhe um SEGUNDO
   frame de graça antes mesmo do loop contínuo começar. */
let __primeiroFrameFeito = false;
function startLoop() {
  renderer.setAnimationLoop(() => tick());
  /* O PRIMEIRO FRAME É SÍNCRONO, e isso não é detalhe: o `animate()` antigo
     era `requestAnimationFrame(animate); tick();` — ele agendava o próximo
     frame E desenhava um AGORA, ainda dentro da avaliação do módulo. Um
     refactor que devia ser neutro no desktop não pode apagar isso calado:
     é ele que põe a primeira imagem na tela e que roda a primeira rodada de
     prewarm de shader antes de qualquer coisa depender delas.
     Hoje esse primeiro tick() já rolou mais cedo (ver noSeedRender), então
     aqui só falta religar o loop CONTÍNUO — rodar de novo desenharia um
     frame idêntico à toa. */
  if (!__primeiroFrameFeito) { __primeiroFrameFeito = true; tick(); }
}
function stepPhysics(dt, intendedDt = dt) {
  const stepsBefore = world.stepnumber;
  const accumulatorBefore = world.accumulator;
  world.step(PHYSICS_DT, dt, PHYSICS_MAX_STEPS);
  perf.physicsSteps = world.stepnumber - stepsBefore;
  const dropped = Math.max(0,
    accumulatorBefore + dt - perf.physicsSteps * PHYSICS_DT - world.accumulator);
  perf.physicsDroppedMs = dropped * 1000;
  perf.simulationCoverage = intendedDt > 0
    ? clamp((dt - dropped) / intendedDt, 0, 1)
    : 1;
}
function renderFrame() {
  perfHud.beginFrame(); // zera o contador de draw calls antes dos passes do pós
  invalidateCsmDiscontinuities();
  if (csmDirty) {
    csm.updateFrustums();
    invalidateCsmShadows();
    csmDirty = false;
  }
  csm.update();
  scheduleCsmShadows();
  /* EM XR O PÓS SAI DO CAMINHO — e isso não é otimização, é requisito: o
     EffectComposer desenha nos render targets DELE, e o framebuffer da
     sessão WebXR não é um deles. Com o composer no caminho o headset
     simplesmente não recebe imagem. (De quebra, passe de tela cheia em
     estéreo custa o dobro; ver docs/vr/baseline.md.) */
  if (XR.presenting) renderer.render(scene, camera);
  else composer.render();
}
function tick(forceDt) {
  const now = performance.now();
  const frameDt = forceDt !== undefined ? forceDt : (now - lastNow) / 1000;
  const simFrameDt = forceDt !== undefined ? frameDt : Math.min(frameDt, 0.05);
  const dt = simFrameDt * timeScale;
  const intendedDt = frameDt * timeScale;
  lastNow = now;
  perf.physicsSteps = 0;
  perf.physicsDroppedMs = 0;
  perf.simulationCoverage = 1;
  perf.frameMs = frameDt * 1000;

  /* ANTES de qualquer coisa tocar em câmera: reconcilia o grafo com a
     sessão XR. A sessão pode acabar por fora (headset tirado, botão do
     sistema, bateria), então quem manda é o `isPresenting` do renderer,
     não um espelho local. */
  const xrOn = XR.sync();

  /* ENTROU EM VR = ESTÁ NO MENU. Isto era `startGame(false)`: o menu é DOM,
     DOM não é desenhado dentro da sessão imersiva, e começar à força era o
     único estado alcançável — ao preço de o jogador não escolher NADA (nem
     solo, nem multijogador, nem lobby, nem conforto). Agora o menu existe
     dentro do mundo (js/xr/xrmenu.js) e é ele que abre.
     Quem FECHA é a partida começando: pelo SOLO do próprio menu, ou pelo
     `matchStart` do servidor, que chama `forceStart` (br-game.js). */
  if (xrOn && !state.started && !XRUI.aberto) XRUI.abrir('menu');
  if (xrOn && state.started && XRUI.aberto && XRUI.modo === 'menu') XRUI.fechar();
  // saiu da sessão com botão apertado: sem isto a tecla fica presa pra sempre
  if (!xrOn && _teclasXR.size) soltarTeclasXR();
  /* Sessão acabou (headset tirado, botão do sistema, bateria): solta o ouvinte
     de `frameratechange` e o pulso em voo. Os dois saem na primeira linha
     quando não há nada a soltar — chamar por frame no desktop é de graça. */
  if (!xrOn) { XRTaxa.soltar(); XRTato.soltar(); _uiFocoAntes = ''; }

  /* A ARMA MORA NA MÃO, NÃO NA CABEÇA. Fora de XR ela é filha da câmera e
     mirar é girar a vista. Em XR isso colaria a arma no rosto: o jogador teria
     que apontar a CABEÇA para o inimigo, que é a experiência que a Meta manda
     evitar. Reconciliado por frame (e não uma vez ao entrar) porque a mão
     aparece e some com o controle: dormiu, desligou, só um pareado. */
  {
    const paiDaArma = (xrOn && (XR.punho('right') || XR.mao('right'))) || camera;
    if (weaponRoot.parent !== paiDaArma) paiDaArma.add(weaponRoot);
  }

  /* CONTROLES DO HEADSET. A intenção vira as MESMAS teclas que o teclado
     escreveria: assim colisão, rampa, escada, veículo e arma continuam sendo
     o código já testado, e não uma segunda física só pra VR. O giro é em
     PASSOS de 45° (js/xr/xrinput.js explica por quê) e mora no rig — girar a
     câmera do jogador é justamente o que não se pode fazer. */
  if (xrOn) {
    const sessao = renderer.xr.getSession && renderer.xr.getSession();
    const fontes = sessao ? sessao.inputSources : null;
    /* DECLARA A TAXA. A sessão nasce a 90 Hz por herança; 90 dá 11,11 ms por
       frame contra 13,89 a 72 — 25% mais orçamento numa linha, num quadro que
       está a 4,3× do teto de draw calls. Idempotente. */
    XRTaxa.aplicar(sessao);
    /* O painel come a entrada enquanto está aberto — senão o gatilho que
       escolhe "SAIR DA PARTIDA" dispara um tiro no mesmo frame. `ler(fontes)`
       continua rodando SEMPRE para que as bordas (apertar ≠ segurar) não
       mintam na hora de fechar. */
    const ui3d = XRUI.update({ dt, fontes, maos: { left: XR.mao('left'), right: XR.mao('right') } });
    /* TATO DO PAINEL. O módulo da UI não emite evento de foco: devolve o item
       sob o raio e o que foi acionado. A BORDA é calculada aqui — um tique por
       linha nova, um clique por escolha, na mão que está apontando. */
    const alvoUi = ui3d.item ? ui3d.item.id + '|' + ui3d.item.zona : '';
    if (alvoUi && alvoUi !== _uiFocoAntes) XRTato.emitir('ui-foco', { mao: ui3d.mao || 'right' });
    _uiFocoAntes = alvoUi;
    if (ui3d.acionou) XRTato.emitir('ui-toque', { mao: ui3d.mao || 'right' });
    /* Headset tirado ou menu do sistema aberto = sessão 'visible-blurred' ou
       'hidden'. A loja exige que o app pause sozinho nesse caso, e não só no
       botão. */
    if (XR.visibility !== 'visible' && !XRUI.aberto && state.started) XRUI.abrir('pausa');
    // a tela de morte de DOM não é desenhada no headset
    if (Morte.naTela && !XRUI.aberto) XRUI.abrir('morte');
    const cmd = entradaXR.ler(fontes);

    /* O BONECO É DO JOGADOR, NÃO DA CÂMERA. Pendurado na câmera ele afunda o
       quanto o jogador for mais baixo que o modelo (medido: −0,30 m a 1,60 m de
       olho, −0,65 m a 1,25 m) e tomba junto com o pescoço ao olhar pra baixo.
       Anexar por frame porque o rig só nasce no XR.sync (anexar é idempotente). */
    if (XR.rig) XR.corpo.anexar(XR.rig, FpBody.bodyRoot);
    XR.corpo.update(dt);

    /* O COLISOR SEGUE A CABEÇA. Andar pelo cômodo movia a vista e deixava a
       cápsula parada: o jogador atravessava parede andando de verdade e a cota
       do terreno era lida onde ele ESTAVA. Drenado ANTES do playerUpdate, a
       física do frame já roda debaixo da cabeça — e a cabeça não pula, porque o
       que entra em player.pos sai do acumulado do rig (js/xr/xrrig.js). */
    /* DRENA SEMPRE, aplica só quando pode. Drenar só quando o jogo aceita o
       passo fazia o rig acumular enquanto o jogador estava morto ou dirigindo
       (medido: 1,200 m e 1,005 m) e despejar tudo num frame ao voltar — o
       colisor teleportava. O teto de `consumirPasso` cuida do resto. */
    /* DRENA SÓ QUANDO PODE APLICAR. Drenar sempre parecia resolver o
       represamento, e criou coisa pior: o passo saía do acumulado sem entrar em
       `player.pos`, e como a cabeça vai para `(x,z) + passo`, a VISTA era
       arrastada de volta — morto, o mundo congelava. O represamento já está
       resolvido do lado certo: `consumirPasso` tem teto por frame e devolve o
       excedente ao acumulado, então o que ficou guardado escoa em alguns frames
       em vez de teleportar o colisor de uma vez. */
    if (!state.driving && !state.flying && !player.dead) {
      XR.consumirPasso(_passoXR);
      player.pos.x += _passoXR.x;
      player.pos.z += _passoXR.z;
      /* ONDE O PASSO DEVERIA TER CHEGADO. A rejeição só é conhecida DEPOIS da
         física do frame — a colisão do jogo não é uma função só: paredes,
         obstáculos e veículos empurram `player.pos` em pontos diferentes do
         `playerUpdate`. Chamar só `Structures.collide` aqui não bastava: o
         carro, que foi o caso medido, colide noutro trecho. */
      _alvoPassoXR.pedido = Math.hypot(_passoXR.x, _passoXR.z);
      _alvoPassoXR.x = player.pos.x; _alvoPassoXR.z = player.pos.z;
      _alvoPassoXR.dx = _passoXR.x; _alvoPassoXR.dz = _passoXR.z;
    } else _alvoPassoXR.pedido = 0;

    /* GIRO: contínuo por padrão, em passos por opção do jogador
       (js/xr/xrturn.js explica por que o padrão diverge do "default to snap"
       da Meta). O pivô é a cabeça, e isso é do rig. */
    // com o painel aberto o yaw não pode acumular invisível e saltar ao retomar
    const giroXR = XR.giro.atualizar(dt, ui3d.capturando ? 0 : eixoDeGiro(fontes));
    xrYaw = XR.giro.yaw;
    /* A vinheta tem que ser DESLIGÁVEL, e desligar de verdade: zerar as
       entradas não bastaria, porque a esfera continuaria no caminho do render. */
    if (XRUI.prefs.vinheta) {
      XR.conforto.anexar();                    // idempotente: só reacende
      if (giroXR.passo) XR.conforto.piscar();  // só o modo em passos pisca
    } else XR.conforto.soltar();
    /* VINHETA: a periferia fecha ao andar E ao girar. A vinheta da Meta reage a
       três eventos separados (Movement, Rotation, Acceleration), não só a andar;
       o túnel de giro só começa acima de 45°/s pra não piscar na mira fina. */
    if (XRUI.prefs.vinheta) {
      /* O teto da vinheta é a corrida QUE VALE na sessão, não a do monitor:
         com a velocidade de VR (2,8 m/s) e o teto do PC (8,6), a periferia
         mal fechava e o túnel virava enfeite. */
      XR.conforto.update(dt, Math.hypot(player.vel.x, player.vel.z), XRAndar.correr,
        giroXR.velocidade);
    }
    /* A CABEÇA ENTROU NO SÓLIDO — e esta linha fica FORA do `if` da vinheta de
       propósito. Desligar a vinheta é escolha do jogador; ver e atirar do outro
       lado da parede depois de andar fisicamente para dentro dela não é opção
       de conforto, é integridade do mundo (e, num jogo com outros jogadores,
       seria espiar por parede). O colisor agora PARA na parede (js/xr/xrrig.js);
       sem este escurecimento o jogador ficaria com a vista do lado de lá sem
       sinal nenhum. */
    XR.conforto.intrusao(dt, XR.foraDoCorpo);
    /* PAINEL ABERTO NÃO JOGA. Sem esta guarda, o gatilho que escolhe "SAIR DA
       PARTIDA" dispara um tiro no mesmo frame, e o analógico do menu anda com o
       jogador no mundo. Soltar as teclas presas é parte do acordo: sair da
       tradução de entrada com botão apertado deixaria a tecla travada. */
    if (ui3d.capturando) { if (_teclasXR.size) soltarTeclasXR(); mouse.shooting = false; }
    else {
      teclaXR('KeyW', cmd.andar.y > 0.15);
      teclaXR('KeyS', cmd.andar.y < -0.15);
      teclaXR('KeyD', cmd.andar.x > 0.15);
      teclaXR('KeyA', cmd.andar.x < -0.15);
      teclaXR('Space', cmd.pular);
      // agachar de verdade: baixar a cabeça vale tanto quanto o botão
      teclaXR('ControlLeft', cmd.agachar || XR.corpo.agachado);
      teclaXR('ShiftLeft', cmd.correr);
      /* CICLA a arma pelas destravadas. Sem isto o jogador fica com a arma
         inicial a partida inteira: o Touch não tem fileira de números, e a roda
         do mouse não existe no headset. Escreve o MESMO `justPressed` do teclado,
         então a troca continua sendo o código já testado. */
      if (cmd.trocarArma) {
        /* Cicla o arsenal INTEIRO, chamando a troca direto. Antes isto escrevia
           `Digit1..3` e parava aí: as armas 4 a 8 do BR só existem num listener de
           teclado do br-game.js, e três das oito armas eram tudo o que o headset
           alcançava. */
        const atual = arsenal.indexOf(gun);
        for (let i = 1; i <= arsenal.length; i++) {
          const alvo = (atual + i) % arsenal.length;
          if (!arsenal[alvo].locked) { switchWeapon(alvo); break; }
        }
      }
      teclaXR('KeyR', cmd.recarregar);
      teclaXR('KeyE', cmd.usar);
      /* OS QUATRO VERBOS DO RADIAL (js/xr/xrinput.js). Granada, kit médico,
         comer e trocar acessório de mira não tinham botão nenhum no Touch — o
         controle acabou, e a saída do gênero é um menu radial no analógico.
         A LINHA TEM DE FICAR AQUI, e o motivo é ordem de leitura: `shootUpdate`
         lê `justPressed` mais abaixo e `justPressed.clear()` apaga tudo no fim
         do frame, então `code` escrito depois disto nunca chega a ser visto.
         `confirmou` é um pulso de UM frame, que é exatamente o que `teclaXR`
         traduz em tecla que sobe e desce. */
      for (const c of ['KeyG', 'KeyQ', 'KeyF', 'KeyT']) teclaXR(c, cmd.radial.confirmou === c);
      mouse.shooting = cmd.atirar;
      /* SEMI-AUTOMÁTICA LÊ O CLIQUE, não o segurar (`gun.auto ? mouse.shooting :
         mouse.clicked`, logo abaixo em shootUpdate). Sem esta linha a pistola, a
         sniper e a escopeta ficavam MUDAS em VR — o gatilho acendia `shooting` e
         nada mais, sem erro e sem console. `clicked` é consumido e zerado a cada
         frame, então só a borda de subida pode escrevê-lo. */
      if (cmd.atirarAgora) mouse.clicked = true;
      mouse.aiming = cmd.mirar || XRArma.mirando();   // botão OU arma trazida ao olho
    }
  }

  if (!state.started || state.paused) {
    // menu / pausa: mundo vivo ao fundo, câmera passeando pelo mapa
    menuT += dt;
    if (!state.started) {
      // a arma em primeira pessoa é filha da câmera: no passeio cinematográfico
      // ela ficava plantada no canto de TODOS os planos. O frame de jogo
      // reescreve weaponRoot.visible toda vez (ver shootUpdate), então isto
      // vale só enquanto a partida não começou.
      weaponRoot.visible = false;
      /* EM VR O PASSEIO NÃO RODA. Arrastar a cabeça do jogador é a receita
         de enjoo — em VR a câmera só se move quando o pescoço dele se
         mexe. O mundo continua vivo ao fundo; o que sai é o trilho de
         câmera. O ponto de vista do menu em VR é assunto da Fase 5. */
      if (!xrOn) MenuCam.update(dt);
      // sem isto o rig fica na origem do mundo e o menu em VR vira "de pé no
      // meio do mapa"; plantado no spawn, o jogador olha o mundo do lugar certo
      else XR.place(player.pos.x, player.pos.y, player.pos.z, xrYaw);
      /* HORA E CLIMA FIXOS NO MENU. O passeio é a vitrine do jogo e antes
         pegava o clima que estivesse rolando — a rodada anterior caiu num céu
         fechado e os quatro planos saíram cinzas. Golden hour (halo de Mie
         ~10x, rayleigh 1,15 → 3,75) é o visual assinatura. Só enquanto a
         partida NÃO começou: startGame devolve o relógio e a agenda de clima,
         e o BR sobrescreve os dois pelo relógio da partida (skySync). */
      Env.tod = MENU_TOD;
      Env.weather = 'limpo';
    }
    /* A grade de grama fica ANCORADA no spawn durante o menu. Seguir a câmera
       do passeio (que salta ~800 m a cada corte) enfileiraria os 169 chunks a
       cada troca de plano e o REBUILD_BUDGET (6/frame) pagaria isso por meio
       segundo. Ancorada, o custo é zero e a grama já nasce pronta pro início. */
    Grass.update(state.started ? camera.position : player.pos,
      carPosV.copy(Car.group.position), menuT);
    Env.update(dt, menuT);
    Car.update(dt, menuT);
    Heli.update(dt, menuT);
    Animals.update(dt, menuT);
    FX.update(dt);
    Amb.update(dt, menuT);
    Water.update(menuT);
    Volcano.update(dt, menuT);
    if (sky.material.uniforms.time) sky.material.uniforms.time.value = menuT;
    camera.updateMatrixWorld();
    renderFrame();
    // menu/lobby/pausa: melhor janela que existe pra linkar shader
    if (forceDt === undefined) prewarmIfIdle(now);
    return;
  }

  const t = (state.gameTime += dt);
  menuT = t;

  /* toque: volante binário do carro/heli + posição do analógico na tela.
     Antes da simulação porque js/car.js e js/heli.js leem `keys`. */
  Touch.frame(state.driving || state.flying);

  /* simulação */
  Env.update(dt, t);
  /* `player.dead` entra na MESMA lista de reloadBlocked() e do gate de tiro.
     As três eram quase iguais e não concordavam: sem esta checagem o jogador
     continuava andando, pulando e olhando com "VOCÊ MORREU" na tela. O corpo
     para onde caiu (o tombo da câmera é do applyFpsCamera, que segue rodando). */
  if (!player.dead && !state.driving && !state.flying && !window.__BR_freeze && !state.cinematic) playerUpdate(dt, t);
  /* O QUE A PAREDE COMEU VOLTA PRO RIG. Sem isto o passo físico saía do
     acumulado, a colisão empurrava `player.pos` de volta, e a CABEÇA era
     arrastada junto — medido: 3 m de caminhada real contra um sólido moviam a
     vista 0,82 m e depois nada. O mundo travava enquanto o jogador andava de
     verdade no quarto dele.

     Só a componente NA DIREÇÃO do passo é devolvida: o jogador também se move
     pelo analógico no mesmo frame, e projetar separa o que a parede recusou do
     que ele escolheu não andar. Devolvido, o colisor para na parede e a cabeça
     segue onde o corpo está — adiante do colisor, que é o certo: quem anda
     contra uma parede virtual atravessa, porque ela não existe no quarto. */
  if (_alvoPassoXR.pedido > 1e-6) {
    const perdaX = _alvoPassoXR.x - player.pos.x, perdaZ = _alvoPassoXR.z - player.pos.z;
    const k = _alvoPassoXR.pedido;
    const proj = (perdaX * _alvoPassoXR.dx + perdaZ * _alvoPassoXR.dz) / (k * k);
    if (proj > 0) {
      const f = Math.min(1, proj);
      XR.devolverPasso(_alvoPassoXR.dx * f, _alvoPassoXR.dz * f);
    }
    _alvoPassoXR.pedido = 0;
  }
  shootUpdate(dt, t);
  stepPhysics(dt, intendedDt);
  Car.update(dt, t);
  Heli.update(dt, t);
  if (!window.__BR_active) Enemies.update(dt, t); // BR: sem inimigos comuns
  if (!window.__BR_active || (window.__BR_debug && window.__BR_debug.S.phase === 'PLAY')) Skeletons.update(dt, t);
  Animals.update(dt, t);
  if (!window.__BR_active || window.__BR_zumbis) Night.update(dt, t); // BR: zumbis só se a sala ligar
  Grenades.update(dt, t);
  Rockets.update(dt, t);
  Pickups.update(dt, t);
  if (!window.__BR_active) { Boss.update(dt, t); Missions.update(); }
  // Visitante volta ao BR quando a sala permite (playtest: "o alien sumiu")
  if (!window.__BR_active || window.__BR_alien) Alien.update(dt, t);
  if (xrOn) XRInterage.update({
    maoRaio: XR.mao('left'), maoPunho: XR.punho('left'),
    fontes: (renderer.xr.getSession && renderer.xr.getSession() || {}).inputSources, dt,
    /* `null` diz ao módulo que a PONTE acima é a dona do despacho dos verbos.
       Sem isto os dois emitem, e quem escuta `keydown` recebe o verbo duas
       vezes — usar dois kits médicos com um gesto só. */
    radial: null,
  });
  Interact.update(dt, t);
  if (Cannon) Cannon.update(dt, t);
  if (MapToys) MapToys.update(dt, t);
  if (Secrets) Secrets.update(dt, t);
  FX.update(dt);
  Amb.update(dt, t);
  Water.update(t);
  Volcano.update(dt, t);

  /* áudio: listener na câmera (sai barato — parado não reagenda nada) + clima */
  SFX.updateListener();
  SFX.musicUpdate();

  /* câmera + arma + HUD dinâmico (a cinemática assume a câmera sozinha) */
  if (state.cinematic) {
    /* O ACUMULADOR DE OLHAR NÃO SOBREVIVE À CINEMÁTICA. O dedo não sabe que
       tem evento rolando e continua arrastando; o núcleo do toque acumula sem
       saber de `state.cinematic`. Guardado, esse arrasto (~3000 px em 8 s)
       virava ~9,6 rad de guinada NUM frame assim que endCinematic devolvia a
       câmera. Descartar por frame é o mesmo que recusar acumular, e mantém a
       cinemática dona da câmera sem tocar nela nem nos projéteis. */
    Touch.takeLook();
  } else {
    applyTouchLook(); // ANTES do applyFpsCamera: ele só soma delta de recuo
    applyFpsCamera(dt, t);
    carCameraUpdate(dt);
  }
  /* DEPOIS do applyFpsCamera, e isso é contrato: a pose de desktop (hipV, bob,
     sway do mouse) é escrita lá, e aplicar a mão antes faria o desktop
     sobrescrever a mão de volta. */
  if (xrOn) XRArma.aplicar({
    gun, weaponRoot, punho: XR.punho('right'), raio: XR.mao('right'),
    apoio: XR.punho('left') || XR.mao('left'),
    cabeca: camera.getWorldPosition(_xrCabeca), dt,
    oculto: state.driving || state.flying,
  });
  /* DEPOIS da arma, e isso é contrato: o painel de munição é filho do
     `weaponRoot`, e ler antes deixaria o número um frame atrás da arma. */
  if (xrOn) XRHud.update({
    arma: weaponRoot, pulso: XR.punho('left') || XR.mao('left'),
    cabeca: camera.getWorldPosition(_xrCabeca),
  });
  if (window.__CityDestruction) window.__CityDestruction.tick(dt);

  /* grama reativa: player E carro dobram as lâminas */
  carPosV.copy(Car.group.position);
  Grass.update(state.driving ? carPosV : player.pos, carPosV, t);

  /* LOD das árvores */
  treeAcc += dt;
  if (treeAcc > 0.45) { treeAcc = 0; rebucketTrees(player.pos.x, player.pos.z); }

  miniAcc += dt; // PERF: radar a 15 Hz basta (era todo frame)
  if (miniAcc > 1 / 15) { miniAcc = 0; MiniMap.draw(); ToysRadar.draw(); }

  /* render */
  if (sky.material.uniforms.time) sky.material.uniforms.time.value = t; // nuvens andando
  camera.updateMatrixWorld();
  perf.simMs = performance.now() - now; // CPU do jogo; o resto do frame é render
  renderFrame();

  /* Qualidade adaptativa: o teto continua sendo a escolha do jogador; a
     escala só desce quando quem estoura o frame é o render, nunca quando o
     gargalo é CPU (aí baixar pixel deixaria feio sem acelerar nada). */
  if (forceDt === undefined && +SETTINGS.autores !== 0 &&
      resScaler.push(frameDt * 1000, perf.simMs, now)) {
    applyPixelRatio(resScaler.scale);
    perf.renderScaleChanges++;
  }
  perf.renderScale = resScaler.scale;

  perfHud.endFrame(perf.frameMs, perf.simMs);

  /* contador de FPS (+ ping quando online e habilitado) */
  fpsFrames++; fpsAcc += frameDt;
  if (fpsAcc >= 0.5) {
    fpsVal = Math.round(fpsFrames / fpsAcc);
    const png = (SETTINGS.ping !== 0 && window.__MP_ping != null) ? ' · ' + window.__MP_ping + ' ms' : '';
    ui.fps.textContent = fpsVal + ' FPS' + png;
    fpsFrames = 0; fpsAcc = 0;
  }
  justPressed.clear();
}

/* ================== boot ================== */
window.addEventListener('pointerlockerror', () => {
  state.lockFailed = true;
  // no celular não travar o mouse é o NORMAL, não uma falha: o aviso só faz
  // sentido pra quem esperava o ponteiro capturado
  if (!Touch.enabled) centerMsg('Pointer lock indisponível — rodando sem travar o mouse', 2600);
  setPaused(false);
});

/* som de interface, navegação por teclado e destravamento do AudioContext no
   PRIMEIRO gesto do jogador (antes só o startGame chamava init/resume, então o
   hover nunca tinha som). wireMenuUI é a ÚNICA fonte de som de interface: ele
   delega hover/click/back/toggle no document, então os listeners de botão aqui
   embaixo NÃO devem chamar SFX.ui* de novo — dobraria o som. */
const MenuUI = wireMenuUI({ SFX });

function startGame(trusted) {
  if (state.started) return;
  SFX.init(); SFX.resume(); SFX.musicStart(); SFX.setVolumes();
  // flash de "entrando no jogo": elemento à parte, porque o #overlay some
  // SÍNCRONO no setPaused (contrato coberto por test/gameplay.test.js).
  // launch() também para a trilha do menu.
  MenuUI.launch();
  // devolve o relógio e a agenda de clima que o menu travava no golden hour
  // (o clarão do launch cobre a virada). No BR o skySync assume no frame seguinte.
  Env.tod = GAME_TOD;
  Env.weather = null;
  // ...e devolve o FOV. O passeio do menu escreve camera.fov direto
  // (js/menuscene.js), mas o dono do FOV em jogo é `fovCur`: applyFpsCamera só
  // reescreve a câmera quando o alvo se AFASTA dele, e no spawn os dois valem
  // 75 — a atribuição nunca acontecia e a partida herdava o FOV do último
  // plano do menu (~48°) até o primeiro ADS/sprint. csmDirty porque as
  // cascatas de sombra são dimensionadas pelo frustum.
  camera.fov = fovCur;
  camera.updateProjectionMatrix();
  csmDirty = true;
  state.started = true;
  updateHealthHUD(); updateAmmoHUD(); updateInvHUD(); updateSlotsHUD(); updateArmorHUD();
  // banner de boas-vindas é do modo solo; no BR o lobby já anuncia a partida
  setTimeout(() => { if (!window.__BR_active) showBanner('CALL OF AI<small>siga as missões · cuidado com a noite</small>', 5200); }, 700);
  setPaused(false);
  /* CELULAR NUNCA TRAVA O PONTEIRO: não existe pointer lock em toque, e pedir
     dispara o `pointerlockerror`. `lockFailed = true` entra no modo degradado
     que já existe (game.js:1135-1138 não pausa no unlock, e o handler de erro
     em 2606 é o mesmo caminho) — reuso, não caminho novo. */
  if (trusted && !Touch.enabled) {
    try { controls.lock(); } catch (err) { state.lockFailed = true; }
  } else {
    state.lockFailed = true;
  }
  /* CELULAR: o toque em COMEÇAR é a ÚNICA janela em que o navegador aceita
     fullscreen — e sem fullscreen ele recusa travar a orientação. Travar em
     paisagem aqui é o que impede o aparelho de auto-rotacionar no meio do
     tiroteio. Rejeição é caso NORMAL (iOS Safari não implementa): quem cobre
     esse caso é o botão "JOGAR ASSIM" do #rotateGate. */
  if (trusted && Touch.enabled) Orient.attempt(true);
}
/* ================================================================
   MENU — UMA SUPERFÍCIE SÓ.

   O #overlay é a ÚNICA tela cheia de menu do jogo. Dentro do #panel há
   UM painel por vez: nenhum, 'mp' (lobby do BR) ou 'settings'. O lobby
   deixou de ser uma camada `position: fixed` por cima de tudo, e o
   #settings deixou de ser MOVIDO pra dentro dele — os dois são irmãos
   e ninguém reparenta ninguém, então nenhum innerHTML do lobby pode
   destruir as configurações do jogo (era acidente esperando acontecer,
   protegido só por convenção).

   MENU.mostrar()/esconder() existem porque telas de FIM DE PARTIDA
   (eliminação, resultado) precisam aparecer por cima de um jogo em
   andamento. Menu na tela = PAUSA, sempre: é isso que mantém
   `state.paused`, o #overlay e os controles de toque em sincronia. Em
   BR a pausa não congela nada — o painel avisa (ver paintMenu).
   ================================================================ */
const MENU = {
  painel: null,      // null | 'mp' | 'settings'
  _volta: null,      // pra onde o VOLTAR do painel atual retorna
  _pausaNossa: false, // a pausa em curso foi pedida por MENU.mostrar()
  _pinta() {
    const mp = $('mpPanel'), st = $('settings');
    if (mp) mp.hidden = MENU.painel !== 'mp';
    if (st) st.classList.toggle('open', MENU.painel === 'settings');
    const bm = $('btnMulti'), bs = $('btnSettings');
    if (bm) bm.setAttribute('aria-expanded', String(MENU.painel === 'mp'));
    if (bs) bs.setAttribute('aria-expanded', String(MENU.painel === 'settings'));
    paintMenu();
  },
  open(nome, volta) { MENU.painel = nome; MENU._volta = volta || null; MENU._pinta(); },
  close() { MENU.painel = null; MENU._volta = null; MENU._pinta(); },
  voltar() { const v = MENU._volta; MENU._volta = null; if (v) MENU.open(v); else MENU.close(); },
  mostrar() { // traz o menu pra frente de uma partida em andamento
    if (!state.started || state.paused) return false;
    MENU._pausaNossa = true;
    setPaused(true);
    // a tela de morte do SOLO recusa ceder a frente (ver Morte): sem esta
    // verificação MENU._pausaNossa ficaria mentindo que existe pausa nossa
    if (!state.paused) { MENU._pausaNossa = false; return false; }
    return true;
  },
  esconder() { // ...e devolve a tela — só se a pausa tiver sido NOSSA
    if (!MENU._pausaNossa) return false;
    MENU._pausaNossa = false;
    if (state.started && state.paused) setPaused(false);
    return true;
  },
};

/* ================================================================
   REINÍCIO DE PARTIDA — "JOGAR DE NOVO" reinicia a PARTIDA, não o MUNDO.

   O que o `location.reload()` da morte solo fazia de graça era jogar o
   processo inteiro fora. O preço era baixar de novo ~15 MB de GLB a cada
   morte — no celular, a diferença entre jogar e desistir.

   REGENERAR O MUNDO ESTÁ FORA DE COGITAÇÃO: a ordem de consumo do
   `Math.random` seedado é contrato (CLAUDE.md). O worldgen roda uma vez,
   no carregamento do módulo, e qualquer coisa que consumisse o stream de
   novo mudaria o layout E quebraria a reconstrução que bots/servidor
   fazem a partir da mesma seed. Por isso o reinício é RESTAURAÇÃO DE
   INSTANTÂNEO: `capturarInicio()` guarda, no fim do boot, o estado que um
   reload com a mesma seed reproduziria, e o reinício copia de volta.
   Consumo de `rand` no reinício: ZERO — e há teste medindo
   (test/morte-sem-reload).

   O QUE NÃO VOLTA (não é esquecimento, é escolha — ver o relatório):
   · `state.gameTime` segue correndo. Zerar o relógio jogaria pro futuro
     todos os prazos já agendados em tempo absoluto (nextVolley do boss,
     nextBurst do inimigo, lastShot da arma) e eles nunca venceriam.
   · Armas destrancadas por exploração CONTINUAM destrancadas. Re-trancar
     sem reabrir baús/segredos deixaria a arma inalcançável pra sempre.
   · Baús já abertos, segredos já achados, cidade destruída, partículas de
     FX e a trilha sonora seguem como estão.
   · Esqueletos: os vivos voltam com vida cheia; os mortos voltam pelo
     respawn do próprio módulo (o spawn deles consome o rand seedado).
   ================================================================ */
let __inicio = null;
const _xyz = o => [o.x, o.y, o.z];
// cópia rasa só dos campos escalares: estado de boss/alien é objeto plano
const _planos = o => {
  const c = {};
  for (const k in o) { const v = o[k]; if (v === null || typeof v !== 'object' && typeof v !== 'function') c[k] = v; }
  return c;
};
function capturarInicio() {
  __inicio = {
    player: _planos(player), playerPos: _xyz(player.pos),
    inventory: { ...inventory },
    arsenal: arsenal.map(w => ({ mag: w.mag, reserve: w.reserve })),
    missao: Missions.idx, mflags: { ...MFlags },
    tod: GAME_TOD,
    enemies: Enemies.list.map(e => ({
      alive: e.alive, health: e.health, fsm: e.fsm, yaw: e.yaw, wpIdx: e.wpIdx,
      home: { x: e.home.x, z: e.home.z },
      waypoints: e.waypoints.map(w => ({ x: w.x, z: w.z })),
      pos: _xyz(e.group.position), escala: e.group.scale.y,
    })),
    animals: Animals.list.map(a => ({
      alive: a.alive, enabled: a.enabled, hp: a.hp, yaw: a.yaw, pos: _xyz(a.group.position),
    })),
    boss: _planos(Boss.state), bossPos: _xyz(Boss.pos()),
    alien: _planos(Alien.state), alienPos: _xyz(Alien.pos()),
    // loot inicial das cabanas/ruínas: o spawn é público e não consome rand
    pickups: Pickups.actives().map(p => ({ type: p.type, x: p.root.position.x, z: p.root.position.z })),
    veiculos: Car.vehicles.map(v => ({
      pos: _xyz(v.chassisBody.position),
      quat: [v.chassisBody.quaternion.x, v.chassisBody.quaternion.y, v.chassisBody.quaternion.z, v.chassisBody.quaternion.w],
    })),
    heli: _xyz(Heli.group.position),
  };
}
function resetarPartida() {
  if (!__inicio) return false;
  const I = __inicio;
  /* fora de veículo ANTES de tudo: sair reposiciona o player e mexe no HUD */
  if (state.driving || state.flying) tryToggleCar();

  /* ---- jogador ---- */
  Object.assign(player, I.player);
  player.pos.set(I.playerPos[0], I.playerPos[1], I.playerPos[2]);
  player.vel.set(0, 0, 0);
  player.lastDamageCause = null;
  player.lastDamageT = -99;
  setTimeScale(1);
  recoil.pitch = recoil.pitchVel = recoil.yaw = recoil.yawVel = 0;
  recoil.applied = recoil.appliedYaw = recoil.kickZ = recoil.kickRot = 0;
  flashT = 0; dmgDirT = 0; healAnimT = 0;

  /* ---- entrada (dedo/tecla presos não sobrevivem ao reinício) ---- */
  for (const k in keys) keys[k] = false;
  justPressed.clear();
  mouse.shooting = mouse.aiming = mouse.clicked = false;
  mouse.swayX = mouse.swayY = 0;
  Touch.releaseAll();

  /* ---- pontuação, inventário, arsenal ---- */
  score = 0; kills = 0;
  Object.assign(inventory, I.inventory);
  for (let i = 0; i < arsenal.length; i++) {
    const w = arsenal[i], s = I.arsenal[i];
    if (!s) continue;
    w.mag = s.mag; w.reserve = s.reserve;
    w.reloading = false; w.lastShot = -99;
    // `locked` de propósito FORA daqui: ver o cabeçalho deste bloco
  }
  switchWeapon(0);
  switchAnim = 1;

  /* ---- inimigos e bichos ---- */
  for (let i = 0; i < Enemies.list.length; i++) {
    const e = Enemies.list[i], s = I.enemies[i];
    if (!s) break;
    e.alive = s.alive; e.health = s.health; e.fsm = s.fsm; e.yaw = s.yaw; e.wpIdx = s.wpIdx;
    e.home = { x: s.home.x, z: s.home.z };
    e.waypoints = s.waypoints.map(w => ({ x: w.x, z: w.z }));
    e.deadT = 0; e.respawnT = 0; e.flinchT = 0; e.losT = 0; e.alertT = 0;
    e.burstLeft = 0; e.nextShot = 0; e.flashT = 0;
    e.ragVel.set(0, 0, 0); e.ragSpin = 0;
    e.group.position.set(s.pos[0], s.pos[1], s.pos[2]);
    e.group.rotation.set(0, s.yaw, 0);
    e.group.scale.setScalar(s.escala);
    if (e.mixer) e.mixer.timeScale = 1;
  }
  for (let i = 0; i < Animals.list.length; i++) {
    const a = Animals.list[i], s = I.animals[i];
    if (!s) break;
    a.alive = s.alive; a.enabled = s.enabled; a.hp = s.hp; a.yaw = s.yaw;
    a.group.position.set(s.pos[0], s.pos[1], s.pos[2]);
    a.group.visible = s.alive;
  }
  // criaturas da noite nascem TODAS dormentes: quem as acorda é a noite fechada
  for (const c of Night.list) { c.alive = false; c.hp = 0; c.group.visible = false; c.group.scale.y = 1; }
  /* esqueletos: o HP cheio não é exportado, e o spawn deles sorteia posição
     (consome o rand seedado). Cura quem está de pé — o maior HP vivo É o
     cheio — e deixa o respawn do módulo cuidar dos caídos. */
  const skCheio = Skeletons.list.reduce((m, s) => Math.max(m, s.hp), 0);
  if (skCheio > 0) for (const sk of Skeletons.list) {
    if (!sk.alive) continue;
    sk.hp = skCheio; sk.attacking = false; sk.attackT = 0; sk.attackHit = false; sk.hitT = 0;
  }

  /* ---- bosses ---- */
  Object.assign(Boss.state, I.boss);
  Boss.pos().set(I.bossPos[0], I.bossPos[1], I.bossPos[2]);
  Object.assign(Alien.state, I.alien);
  Alien.pos().set(I.alienPos[0], I.alienPos[1], I.alienPos[2]);
  Object.assign(MFlags, I.mflags);
  Missions.idx = I.missao;

  /* ---- projéteis e loot ---- */
  Grenades.clear();
  Rockets.clear();
  for (const p of Pickups.actives()) { p.live = false; p.root.visible = false; }
  for (const s of I.pickups) Pickups.spawn({ x: s.x, z: s.z }, s.type);

  /* ---- veículos (posição E sono do Cannon) ---- */
  for (let i = 0; i < Car.vehicles.length; i++) {
    const v = Car.vehicles[i], s = I.veiculos[i];
    if (!s) break;
    const b = v.chassisBody;
    b.position.set(s.pos[0], s.pos[1], s.pos[2]);
    b.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.force.set(0, 0, 0);
    b.torque.set(0, 0, 0);
    Car.wake(v);
  }
  Heli.group.position.set(I.heli[0], I.heli[1], I.heli[2]);

  /* ---- relógio e clima: mesma devolução que o startGame faz ---- */
  Env.tod = I.tod;
  Env.weather = null;

  /* ---- HUD ---- */
  updateHealthHUD(); updateArmorHUD(); updateAmmoHUD(); updateInvHUD(); updateSlotsHUD();
  addScore(0); // repinta pontos/abates zerados
  ui.killfeed.innerHTML = '';
  clearTimeout(bannerTimer);
  ui.banner.classList.remove('show');
  clearTimeout(msgTimer);
  ui.centerMsg.style.opacity = '0';
  ui.invPanel.classList.remove('open');
  ui.dmgDir.style.opacity = '0';
  return true;
}
/* JOGAR DE NOVO. Devolve `false` (e não faz NADA) quando a partida é do
   servidor: em BR o estado é autoritativo lá, e um reinício local seria cura,
   reaparecimento e zeragem de cooldown de graça no meio de um tiroteio. Os
   botões nem chegam a aparecer online (index.html, #deathBtns nasce hidden) —
   isto aqui é a segunda tranca, a que vale pra QA, console e caminho novo. */
function restartMatch() {
  if (window.__MP_active || window.__BR_active) {
    console.warn('[morte] JOGAR DE NOVO é do modo solo — em partida online o estado é do servidor');
    return false;
  }
  if (!resetarPartida()) return false;
  Morte.esconder();
  state.started = true;
  setPaused(false);
  return true;
}
function voltarAoMenu() {
  resetarPartida();
  Morte.esconder();
  state.started = false;
  MENU.close();
  setPaused(true);
  try { controls.unlock(); } catch (e) {}
}

/* ---- menu: botões + painéis ---- */
$('btnRetry').addEventListener('click', e => {
  e.stopPropagation();
  if (!restartMatch()) return;
  // celular nunca trava o ponteiro (ver startGame); no desktop o clique é a
  // janela em que o navegador aceita o pedido de lock
  if (e.isTrusted && !Touch.enabled) {
    try { controls.lock(); } catch (err) { state.lockFailed = true; }
  }
});
$('btnDeathMenu').addEventListener('click', e => { e.stopPropagation(); voltarAoMenu(); });
/* ENTER/ESPAÇO nos botões da morte. A navegação por teclado do menu
   (js/menuscene.js) tem escopo no #panel e só vale com o #overlay na tela —
   e aqui o #overlay está FORA, de propósito. Sem isto os botões seriam
   focáveis e mudos pra quem joga no teclado. */
ui.deathScreen.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const b = e.target && e.target.closest ? e.target.closest('.mbtn') : null;
  if (!b) return;
  e.preventDefault();
  b.click();
});
/* ================================================================
   SOLO E SALA ONLINE — UM DE CADA VEZ, E A TROCA É REVERSÍVEL.

   O SOLO ficava travado enquanto a sala estivesse de pé. Em produção o
   servidor está SEMPRE no ar: o botão nunca era clicável e o menu tinha um
   botão morto. Agora SOLO vale sempre — e entrar nele é SAIR DA SALA de
   verdade, fechando o socket.

   POR QUE FECHAR O SOCKET (e não "marcar como não-listado" no servidor):
   · o servidor já tem UM caminho, testado, pra "este jogador foi embora": o
     `disconnect` tira do `players`, libera o posto de anfitrião, devolve os
     carros, recalcula a vitória e reemite o roster. Nada de evento novo,
     nada de identidade nova, nenhuma superfície de autoridade a mais.
   · a alternativa exigiria um evento novo que APAGA alguém do roster
     MANTENDO a conexão — que é exatamente o fantasma: invisível pros
     outros e ainda recebendo `playerUpdate` de todo mundo (wallhack de
     graça). O caminho descartado era o inseguro, não o mais trabalhoso.

   RECUSAR EM PARTIDA é a segunda tranca: sumir do roster no meio de um
   tiroteio não pode ser um botão do menu. Fechar a aba continua possível — e
   o servidor trata os dois casos igual: quem sai PERDE (alive=false +
   checkVictory), não fica invisível.
   ================================================================ */
function entrarEmSolo() {
  // partida em andamento (solo OU do servidor) não é hora de trocar de modo
  if (state.started) return false;
  MenuGate.soloChosen = true;
  window.__MP_soloOnly = true; // multiplayer-client.js lê pra não tomar a tela
  MenuGate.voltando = false;
  clearTimeout(__voltaTimer);
  if (__mpSocket) {
    /* `__MP_active` é do br-game.js e quer dizer "o desfecho da morte é do
       SERVIDOR". Deixá-lo ligado no solo esconderia os botões da tela de
       morte (#deathBtns nasce hidden) e faria o restartMatch recusar: o
       jogador morreria sem saída. Quem religa é a volta pra sala. */
    window.__MP_active = false;
    try { __mpSocket.disconnect(); } catch (e) {}
  }
  paintMenu();
  return true;
}
/* VOLTAR PRA SALA sem recarregar a página. Só é seguro porque o mundo NÃO é
   regenerado: `voltarAoMenu()` restaura o instantâneo do boot (consumo de rand
   ZERO — a ordem do stream seedado é contrato) e o socket reconecta com a
   MESMA seed. Se a seed do servidor tiver mudado (partida nova rodou enquanto
   o jogador estava no solo), quem decide é o caminho que já existe: o handler
   de `init` recarrega a página — e o aviso do menu diz isso ANTES. */
function voltarParaSala() {
  if (!temSala()) return false;
  if (state.started) {
    /* SÓ O SOLO QUE ESTE MENU INICIOU pode ser abandonado daqui. `soloChosen`
       é levantado pelo entrarEmSolo, que já recusa com partida em andamento —
       logo `soloChosen && started` só existe em partida SOLO. Uma bandeira de
       solo vinda de fora (`__MP_soloOnly` por QA/console) com uma partida do
       SERVIDOR rodando viraria, sem isto, um reset local de graça: cura,
       reaparecimento no spawn e inventário cheio (é o mesmo motivo pelo qual
       o restartMatch recusa online). */
    if (!MenuGate.soloChosen) return false;
    voltarAoMenu(); // abandona o solo e devolve o mundo ao instantâneo do boot
  }
  MenuGate.soloChosen = false;
  window.__MP_soloOnly = false;
  /* DERIVADO, não guardado: o dono de `__MP_active` é o br-game.js, que só o
     liga dentro do mesmo `start()` que publica o `__MP_lobby`. Um instantâneo
     guardado no entrarEmSolo apagaria a si mesmo em dois cliques seguidos de
     SOLO e devolveria `false` pra uma sala viva. */
  window.__MP_active = !!window.__MP_lobby;
  MenuGate.voltando = true;
  clearTimeout(__voltaTimer);
  __voltaTimer = setTimeout(() => { // não deu: para de prometer e conta a verdade
    MenuGate.voltando = false;
    MenuGate.dropped = !(__mpSocket && __mpSocket.connected);
    paintMenu();
  }, 15000);
  try { if (!__mpSocket.connected) __mpSocket.connect(); } catch (e) {}
  if (__mpSocket.connected) chegouNaSala(); else paintMenu();
  return true;
}
function chegouNaSala() {
  MenuGate.voltando = false;
  clearTimeout(__voltaTimer);
  /* O lobby só existe depois que br-game.js carrega e boota. Quando o jogador
     escolhe solo ANTES disso, o multiplayer-client.js segue esperando (o poll
     deixou de ser cancelado de vez) e boota assim que __MP_soloOnly cai — e é
     o próprio boot que abre o lobby. Até lá o painel abre vazio, com o rótulo
     do botão contando que a volta está em curso. */
  if (window.__MP_lobby) window.__MP_lobby.show();
  else MENU.open('mp');
  paintMenu();
}
$('btnNew').addEventListener('click', e => {
  e.stopPropagation();
  if (state.started) return; // partida em andamento: SOLO não é saída (ver entrarEmSolo)
  entrarEmSolo();
  MENU.close();
  startGame(e.isTrusted);
});
$('btnMulti').addEventListener('click', e => {
  e.stopPropagation();
  if (emSolo()) { voltarParaSala(); return; }
  if (!salaNoAr()) return;
  /* redesenha o lobby ANTES de abrir: o painel pode estar com a tela de
     resultado da partida anterior. Sem BR carregado o painel abre vazio, e
     por isso o botão só destrava com salaNoAr(). */
  if (window.__MP_lobby) window.__MP_lobby.show();
  else MENU.open('mp');
});
$('btnMpBack').addEventListener('click', e => { e.stopPropagation(); MENU.close(); });
$('btnSettings').addEventListener('click', e => { e.stopPropagation(); MENU.open('settings'); });
$('btnBack').addEventListener('click', e => { e.stopPropagation(); MENU.voltar(); });
$('settings').addEventListener('click', e => e.stopPropagation());
$('mpPanel').addEventListener('click', e => e.stopPropagation());
{ // bindings das configurações (aplicam ao vivo + persistem)
  const sv = $('setVol'), sr = $('setRes'), ss = $('setShadow'), sb = $('setBloom'), sp = $('setPing');
  const sa = $('setAutoRes'), saa = $('setAA');
  sv.value = SETTINGS.vol * 100;
  sr.value = String(SETTINGS.res); ss.value = String(SETTINGS.shadow); sb.value = String(SETTINGS.bloom);
  sp.value = String(SETTINGS.ping === 0 ? 0 : 1);
  sa.value = String(+SETTINGS.autores === 0 ? 0 : 1);
  saa.value = String(+SETTINGS.aa === 0 ? 0 : 1);
  sv.oninput = () => { SETTINGS.vol = sv.value / 100; SFX.setVolumes(); persistSettings(); };
  sr.onchange = () => {
    SETTINGS.res = +sr.value;
    resScaler.setCeiling(pixelRatioCeiling());
    // escolha explícita do jogador vale AGORA: quem clica "Qualidade" quer
    // qualidade neste frame, não daqui a alguns degraus do controlador.
    resScaler.reset();
    applyPixelRatio(resScaler.scale); // renderer E composer: ver applyPixelRatio
    persistSettings();
  };
  sa.onchange = () => {
    SETTINGS.autores = +sa.value;
    if (SETTINGS.autores === 0) { resScaler.reset(); applyPixelRatio(resScaler.scale); }
    persistSettings();
  };
  ss.onchange = () => {
    const shadowsWereEnabled = renderer.shadowMap.enabled;
    SETTINGS.shadow = +ss.value;
    renderer.shadowMap.enabled = SETTINGS.shadow === 1;
    if (!shadowsWereEnabled && renderer.shadowMap.enabled) invalidateCsmShadows();
    csmMaterials.forEach(m => m.needsUpdate = true);
    prewarm.invalidate(); // needsUpdate relinka os programas: reaquecer
    persistSettings();
  };
  sb.onchange = () => { SETTINGS.bloom = +sb.value; bloomPass.enabled = SETTINGS.bloom === 1; persistSettings(); };
  saa.onchange = () => { SETTINGS.aa = +saa.value; smaaPass.enabled = SETTINGS.aa === 1; persistSettings(); };
  sp.onchange = () => { SETTINGS.ping = +sp.value; persistSettings(); };
}
/* DAQUI PRA FRENTE O MENU TEM DONO: os handlers existem, então os botões
   podem destravar. Antes deste ponto eles ficam com o motivo na etiqueta
   (index.html nasce com .disabled) em vez de aceitar clique que não faz nada. */
MenuGate.wired = true;
paintMenu();
/* Cede a vez ao navegador IMEDIATAMENTE depois de destravar o botão: até
   aqui o boot já fez praticamente tudo que pesa (terreno, grama,
   construções, criaturas, missões, câmeras — ver os bootFase() acima); o
   que falta é fiação de UI barata. Sem este `await`, o clique já valeria
   mas ninguém veria o botão destravar antes do módulo inteiro terminar
   (mesmo motivo do bootFase, só que aqui não muda etiqueta — só pinta). */
await new Promise(resolve => setTimeout(resolve, 0));

/* ---- botão de VR ----
   Só nasce se `isSessionSupported('immersive-vr')` disser sim (ou se for um
   headset que não consegue, e aí aparece desabilitado com o motivo). Num
   desktop comum some inteiro: ver a política em js/xr/xrbutton.js. */
{
  let xrSuportado = false;
  const pintarXr = () => xrBtn.apply(xrButtonState({
    env: XR.env, supported: xrSuportado, presenting: XR.presenting,
  }));
  const xrBtn = createXrButton({
    parent: document.getElementById('menuBtns'),
    onClick: async () => {
      if (XR.presenting) await XR.exit();
      else await XR.enter();
      pintarXr();
    },
  });
  // a sessão também termina por fora (headset tirado, botão do sistema):
  // o texto do botão acompanha por este gancho, não por polling
  aoMudarSessaoXr = pintarXr;
  XR.isSupported().then(ok => { xrSuportado = ok; pintarXr(); });
}
ui.overlay.addEventListener('click', (e) => {
  // clique em QUALQUER controle do menu (inclusive o gatilho dos controles
  // recolhidos) é do menu, não "clicar na tela pra voltar ao jogo"
  if (e.target.closest('#menuBtns, #settings, #ctlBox, #mpPanel, .mbtn')) return;
  if (state.started && state.paused) { // clique (ou toque) retoma quando pausado
    SFX.resume();
    setPaused(false);
    // celular: retoma sem pedir pointer lock (ver startGame)
    if (e.isTrusted && !Touch.enabled) {
      try { controls.lock(); } catch (err) { state.lockFailed = true; }
    }
  }
});

window.addEventListener('resize', () => {
  // em sessão XR o tamanho do alvo é da sessão; a janela do navegador atrás
  // pode mudar à vontade que não é com a gente (ver applyPixelRatio)
  if (XR.presenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  // arrastar a janela pra outro monitor muda o devicePixelRatio e, com ele, o
  // teto; depois do setSize pra não realocar os render targets duas vezes
  if (resScaler.setCeiling(pixelRatioCeiling())) applyPixelRatio(resScaler.scale);
  csm.updateFrustums();
  invalidateCsmShadows();
});

/* clareiras de grama sob os veículos: refill no FIM do init — fillChunk
   consome o rand seedado e antes daqui deslocaria o layout do mundo */
Grass.refreshAll();

/* Canhão de Circo: criado DEPOIS de todo o worldgen — a geometria é feita em
   noSeed dentro do módulo, então nunca desloca o rand seedado do mundo. */
Cannon = createCannon({ scene, camera, player, SFX, FX, csmMat, Structures, heightAt, slopeAt, WATER_LEVEL, CITY, centerMsg });

/* 5 atrações do mapa (cama elástica, campo de tiro, fogos, aros, xilofone):
   mesmo padrão do canhão — geometria em noSeed, pontos espalhados via pickSpot
   evitando estruturas e o canhão. */
MapToys = createMapToys({ scene, player, SFX, FX, csmMat, Structures, heightAt, slopeAt, WATER_LEVEL, CITY, centerMsg, showBanner, extraTargets, Car, Heli, state, cannonSpot: Cannon.spot });

/* Segredos: as 3 armas que nasciam trancadas sem fonte nenhuma no solo
   viram prêmio de exploração. Depende de MapToys (xilofone) e das torres
   subíveis, então vem por último; geometria em noSeed, como o resto. */
Secrets = createSecrets({ scene, player, SFX, FX, csmMat, Structures, heightAt, CITY,
  centerMsg, showBanner, extraTargets, arsenal, unlockWeapon, state, MapToys, platforms,
  /* props urbanos criados DEPOIS do laço de corpos do boot precisam do seu
     próprio corpo CANNON — sem ele o jogador e a bala param, mas o CARRO
     ATRAVESSA. updateAABB() é obrigatório: o CANNON calcula o AABB no
     construtor (na origem) e nunca mais. Registrado na cidade pra sumir
     junto no evento de destruição, como qualquer parede urbana. */
  addStaticBox(x, y, z, hx, hy, hz, sourceId) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(x, y, z);
    b.userData = { category: 'rigid', sourceId, hardForVehicle: true };
    b.updateAABB();
    world.addBody(b);
    Structures.city.registerBody(b);
    return b;
  } });

/* PRIMEIRO FRAME ANTECIPADO — daqui pra trás já rodou TODO o worldgen
   sensível à seed (terreno, grama, construções, criaturas, Canhão/atrações/
   segredos, que são noSeed — comentário do Canhão, js/cannon.js:28); daqui
   pra frente só fica o instantâneo da partida zero (só LEITURA) e fiação de
   UI/HUD/menu/VR que o jogador nunca vê atrás do painel do menu.

   Historicamente o primeiro `composer.render()` de verdade só rolava na
   ÚLTIMA linha do módulo (startLoop, lá embaixo) — um atraso puro no
   primeiro pixel (medido: ~2,4 s no desktop, scripts/vr-baseline.js) que
   não protegia coisa nenhuma, já que nada daquele resto é necessário pro
   tick() do MENU (ele só toca XR/MenuCam/Grass/Env/Car/Heli/Animals/FX/
   Amb/Water/Volcano — todos prontos aqui).

   `noSeedRender` é o MESMO truque do Canhão/torre (js/cannon.js:32,
   js/structures.js:247): troca `Math.random` por um gerador PRÓPRIO
   enquanto o frame roda e devolve o original no `finally`. Existe porque
   um `render()` de verdade pode linkar programa de sombra e criar
   `Material`/`Object3D` novo por baixo dos panos (three r185, sob demanda)
   — cada um gasta 4 números do stream. Isolar isso é seguro por
   CONSTRUÇÃO: não importa quantos objetos o three crie aqui dentro, o
   stream seedado sai do outro lado exatamente onde entrou. `rebucketTrees`
   roda ANTES pra esse frame já mostrar as árvores na posição/LOD certos
   (senão a InstancedMesh nasceria com matriz zerada até a chamada antiga
   lá embaixo). `startLoop()`, mais abaixo, só religa o loop CONTÍNUO — ver
   `__primeiroFrameFeito`. */
rebucketTrees(0, 0);
{
  let __bootRng = 0xB0075EED >>> 0;
  const noSeedRender = fn => {
    const R = Math.random;
    Math.random = () => (__bootRng = (__bootRng * 1664525 + 1013904223) >>> 0) / 4294967296;
    try { return fn(); } finally { Math.random = R; }
  };
  noSeedRender(() => tick());
  __primeiroFrameFeito = true;
}
await bootFase('afinando os últimos detalhes');

/* INSTANTÂNEO DA PARTIDA ZERO — aqui, e não antes: é o último ponto do boot
   em que nada foi jogado ainda. É este estado que "JOGAR DE NOVO" restaura, e
   é o mesmo que um reload com a mesma seed reproduziria. Só LÊ (nenhuma
   chamada de rand): a ordem de consumo do stream seedado fica intacta. */
capturarInicio();

/* hooks de depuração (inofensivos em produção) */
const __errors = [];
window.addEventListener('error', e => __errors.push(String(e.message)));
window.__game = {
  state, player, Car, Heli, Enemies, arsenal, Boss, Alien, Bosses, Grenades, Rockets, Pickups, Structures, Grass, Volcano, Skeletons,
  inventory, keys, mouse, camera, Env, Missions, Interact, Animals, Night, MFlags, extraTargets,
  XRArma, XRInterage, XRUI, XRHud, XRTato, XRTaxa, XRAndar,
  MenuGate, // QA: progresso honesto do boot (bootLabel/bootFases) e estado do portão do menu
  // QA: qual arma está na mão. `gun` é `let` de módulo, e sem isto não há como
  // verificar de fora que a troca de arma do headset chegou a trocar alguma coisa.
  get gunIndex() { return arsenal.indexOf(gun); },
  /* O YAW DA VISTA, NO MUNDO — fonte única para quem precisa saber "pra onde o
     jogador está olhando". Em XR `camera.quaternion` é a pose da cabeça
     RELATIVA AO RIG, e o giro artificial mora no rig: lê-lo direto dá erro de
     até 180°. Isso já custou o movimento invertido aqui dentro, e ainda estava
     vivo no br-game.js em três lugares — inclusive no `rotY` ENVIADO AO
     SERVIDOR, ou seja, os outros jogadores viam o avatar virado pro lado
     errado. Fora de XR a câmera é filha da cena e isto é idêntico ao que havia
     antes. */
  yawDaVista() { _eulerVista.setFromQuaternion(vistaMundo(), 'YXZ'); return _eulerVista.y; },
  /* QA: a mira REAL do jogo (a mesma que `fire()` usa). Sem isto não há como
     verificar de fora que o tiro sai da mão e não da cabeça. */
  /* QA: a boca do cano no mundo. Sem isto não há como medir de fora que o tiro
     sai do cano — e a distância entre origem do raio e cano é critério de
     aceite E risco de anti-cheat (o servidor valida alcance a partir dela). */
  canoMundo: () => muzzle.getWorldPosition(new THREE.Vector3()).toArray(),
  /* QA: para ONDE o cano aponta, no mundo. Referência INDEPENDENTE do código
     de mira, e é isso que a torna útil: `miraDoTiro()` devolve o vetor que o
     próprio disparo usou, então comparar o raio com ela é comparar uma reta
     consigo mesma — distância zero por álgebra, e o teste não pode falhar.
     Girando o eixo óptico o `miraNode` gira junto e a conta continua dando
     zero; o CANO não gira, porque ele é o modelo desenhado. Barril aponta
     para −Z (o +Z de `getWorldDirection` seria o coice). */
  direcaoDoCano: () => new THREE.Vector3(0, 0, -1)
    .applyQuaternion(muzzle.getWorldQuaternion(new THREE.Quaternion())).toArray(),
  /* a mesma coisa, congelada no instante do tiro: é esta que vale para medir
     alinhamento, porque a outra já viu o recuo */
  canoDoTiro: () => _canoDirDoTiro.toArray(),
  origemDoTiro: () => _origemDoTiro.toArray(),
  direcaoDoTiro: () => _direcaoDoTiro.toArray(),
  miraDoTiro: () => ({ origem: _miraOrigDoTiro.toArray(), direcao: _miraDirDoTiro.toArray() }),
  mira: () => ({
    origem: miraOrigem(new THREE.Vector3()).toArray(),
    direcao: miraDirecao(new THREE.Vector3()).toArray(),
    naMao: !!(XR.presenting && XR.mao('right')),
  }),
  /* QA: o minimapa. `ultimoYaw` é a única forma de medir, de fora, que ele
     gira com o giro artificial e não só com a cabeça. */
  get MiniMap() { return MiniMap; },
  get Cannon() { return Cannon; },
  get MapToys() { return MapToys; },
  get Secrets() { return Secrets; },
  buildChest, // baú compartilhado (br-game.js usa via G.buildChest)
  WeaponModels, FpBody, WeaponRig, Climate, Cover,
  csmDebug: {
    hasMaterial: material => csmMaterials.includes(material),
    hasShader: material => csm.shaders.has(material),
    get materialCount() { return csmMaterials.length; },
    get shaderCount() { return csm.shaders.size; },
    get autoUpdateMask() { return csmShadowMask('autoUpdate'); },
    get scheduledUpdateMask() { return csmLastUpdateMask; },
    /* QA: o que o preset de sessão XR mexe. Sem isto não há como verificar de
       fora que sair do headset devolve a sombra ao monitor — e essa
       verificação já falhou uma vez por não existir. */
    get castShadow() { return csm.lights.map(l => l.castShadow); },
    get maxFar() { return csm.maxFar; },
    get cfgMaxFar() { return CFG.CSM_MAX_FAR; },
  },
  switchWeapon, unlockWeapon, startGame, tryToggleCar,
  MENU,      // painéis do menu único (multiplayer-client.js e QA)
  Morte,     // tela de morte: dona da frente (z 200) — br-game.js e QA
  restartMatch, voltarAoMenu, // saídas da morte no SOLO (recusam em partida online)
  setPaused, // ÚNICO escritor de state.paused (QA/testes usam este caminho)
  isMobile: __mobile, // br-game.js pula o pointer lock com isto (script clássico)
  Touch,              // QA: núcleo do toque, elementos e estado do analógico
  Orient,             // QA: aviso de orientação (bloqueio, escape em retrato)
  controls,           // QA: pointerSpeed é o multiplicador de ADS do olhar
  MenuCam, // QA/captura: goTo('cidade'|'castelo'|'vulcao'|'carro')
  get gun() { return gun; },
  get fps() { return fpsVal; },
  perf,
  prewarm, // QA/BR: linkagem antecipada de shader (warm/schedule/flush/stats)
  renderQuality: {
    get scale() { return resScaler.scale; },
    get ceiling() { return resScaler.ceiling; },
    get stats() { return resScaler.stats; },
    get pixelRatio() { return renderer.getPixelRatio(); },
    // espelho interno do composer: precisa acompanhar o renderer (ver applyPixelRatio)
    get composerPixelRatio() { return composer._pixelRatio; },
    apply: applyPixelRatio,
    ceilingOf: pixelRatioCeiling,
  },
  perfHud,     // overlay de diagnóstico (F3 / ?perf=1) — hook de QA
  XR,          // porte pro headset: ambiente, sessão e rig (js/xr/)
  gpuTier: __tier, // o que o auto-tier decidiu no primeiro boot
  get errors() { return __errors; },
  tick, // passo manual do loop (testes/depuração): __game.tick(1/60)
  platforms, // hook de QA: plataformas/rampas pisáveis (andares e escada da torre)
  terrainMesh, // hook de QA: superfície visual p/ comparar com o heightfield físico
  heightAt, biomeAt, groundAt, obstaclesNear,
  surfaceAt, slopeDegreesAt, geometricNormalAt, sampleAt, // superfície canônica (QA)
  forceStart() { startGame(false); },
  teleportToCar() {
    player.pos.set(Car.group.position.x + 3, heightAt(Car.group.position.x + 3, Car.group.position.z), Car.group.position.z);
  },
};

/* ?debugTerrain=1 — diagnóstico OPT-IN de superfície e veículo (leitura pura:
   não aceita estado de rede, não concede autoridade, sem log por frame). */
if (/[?&]debugTerrain=1/.test(location.search)) {
  const _dn = new THREE.Vector3();
  window.__terrainDebug = {
    at(x, z) {
      const su = surfaceAt(x, z);
      const from = new CANNON.Vec3(x, 150, z), to = new CANNON.Vec3(x, -40, z);
      const res = new CANNON.RaycastResult();
      world.raycastClosest(from, to, {}, res);
      terrainNormal(x, z, _dn);
      return {
        x, z,
        heightCanonica: su.height,
        heightCannon: res.hasHit ? res.hitPointWorld.y : null,
        cannonBody: res.hasHit && res.body.userData ? res.body.userData : null,
        groundAt: groundAt(x, z, 999),
        normalGeometrica: (() => { const n = geometricNormalAt(x, z, new THREE.Vector3()); return [n.x, n.y, n.z]; })(),
        normalSuave: [_dn.x, _dn.y, _dn.z],
        slopeDegrees: su.slopeDegrees,
        bioma: su.biomeId, pesos: su.biomeWeights,
        surfaceType: su.surfaceType, driveable: su.driveable,
        vegetationFactor: su.vegetationFactor, waterDepth: su.waterDepth,
        obstaculos: obstaclesNear(x, z),
      };
    },
    vehicle() {
      const v = Car.vehicle;
      if (!v) return null;
      const cb = Car.chassisBody;
      let chassisContacts = 0;
      for (const c of world.contacts) if (c.bi === cb || c.bj === cb) chassisContacts++;
      return {
        pos: [cb.position.x, cb.position.y, cb.position.z],
        vel: [cb.velocity.x, cb.velocity.y, cb.velocity.z],
        sleepState: cb.sleepState,
        chassisContacts,
        wheels: v.wheelInfos.map(w => ({
          hasHit: !!(w.raycastResult && w.raycastResult.hasHit),
          body: w.raycastResult && w.raycastResult.body
            ? (w.raycastResult.body.userData ? w.raycastResult.body.userData.sourceId : 'terreno') : null,
          point: w.raycastResult && w.raycastResult.hasHit
            ? [w.raycastResult.hitPointWorld.x, w.raycastResult.hitPointWorld.y, w.raycastResult.hitPointWorld.z] : null,
          suspensionLength: w.suspensionLength,
          force: w.suspensionForce,
          slip: w.sideImpulse,
          engineForce: w.engineForce,
        })),
      };
    },
  };
}

/* Hooks pequenos para playtest automatizado e acessibilidade por estado textual. */
window.advanceTime = ms => {
  const steps = Math.max(1, Math.round(Math.max(0, Number(ms) || 0) / (1000 / 60)));
  const golemDebug = window.__BR_debug && window.__BR_debug.golemDebug;
  const wasGolemManual = !!(golemDebug && golemDebug.manual);
  try {
    for (let i = 0; i < steps; i++) {
      tick(1 / 60);
      if (golemDebug) golemDebug.step(1 / 60);
    }
  } finally {
    if (golemDebug && !wasGolemManual) golemDebug.resume();
  }
};
window.render_game_to_text = () => {
  const br = window.__BR_debug;
  const castle = Structures.castle;
  const brGolem = br && br.boss;
  const golemPos = brGolem ? brGolem.group.position : br ? null : Boss.pos();
  const visibleCrates = br ? br.crates.filter(c => !c.opened)
    .sort((a, b) => Math.hypot(player.pos.x - a.x, player.pos.z - a.z) - Math.hypot(player.pos.x - b.x, player.pos.z - b.z))
    .slice(0, 8).map(c => ({ key: c.key, x: +c.x.toFixed(1), z: +c.z.toFixed(1) })) : [];
  return JSON.stringify({
    coordinates: 'origin=center; +x=east; +y=up; +z=south',
    mode: window.__BR_active ? (br ? br.S.phase : 'BR_LOADING') : (state.started ? (state.paused ? 'PAUSED' : 'SOLO') : 'MENU'),
    player: {
      x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2),
      health: +player.health.toFixed(1), armor: +player.armor.toFixed(1), dead: player.dead,
      driving: state.driving, flying: state.flying,
    },
    vehicles: Car.vehicles.map((v, i) => ({
      id: i, type: v.cfg.name, model: v.modelStatus,
      x: +v.group.position.x.toFixed(1), y: +v.group.position.y.toFixed(1), z: +v.group.position.z.toFixed(1),
    })),
    castle: {
      status: castle.status,
      x: +castle.center.x.toFixed(2),
      y: +castle.originY.toFixed(2),
      z: +castle.center.z.toFixed(2),
      guardRadius: castle.guardRadius,
    },
    golem: {
      actor: br ? 'br-golem' : 'colossus',
      status: br && !brGolem
        ? 'not-spawned'
        : (brGolem ? brGolem.alive : Boss.alive) ? 'active' : 'dead',
      alive: brGolem ? !!brGolem.alive : br ? false : Boss.alive,
      x: golemPos ? +golemPos.x.toFixed(2) : null,
      y: golemPos ? +golemPos.y.toFixed(2) : null,
      z: golemPos ? +golemPos.z.toFixed(2) : null,
      shots: br ? br.golemShots : 0,
    },
    unopenedCrates: visibleCrates,
  });
};

/* MULTIPLAYER: referências pro multiplayer-client.js (aditivo) */
window.__MP = {
  THREE, scene, camera, renderer, composer, player, state, CFG,
  setPaused, // pausa é do menu: escritor único (ver o acessor de state.paused)
  MENU,      // menu único: painéis do #panel (o lobby do BR mora num deles)
  heightAt, groundAt, addKillFeed, showHitmarker, playerDamage,
  updateHealthHUD, updateArmorHUD, updateAmmoHUD, updateInvHUD, updateSlotsHUD,
  setTimeScale,
  // game feel: br-game.js é script clássico e não importa ESM — o núcleo puro
  // e a camada de tela chegam por aqui (ver js/hitfeel-core.js e js/hitfeel.js)
  HitCore, HitFeel,
  FX, DmgNums, SFX, rayBlockedAt, weaponRoot, centerMsg, showBanner,
  WATER_LEVEL, slopeAt, justPressed, world,
  socket: __mpSocket, spawn: __mpSpawn,
};

/* O primeiro frame e o primeiro prewarm já rolaram mais cedo (ver
   "PRIMEIRO FRAME ANTECIPADO", logo depois de Secrets) — hoje o mundo
   inteiro monta bem antes de chegar aqui. startLoop() só falta religar o
   loop CONTÍNUO (setAnimationLoop); o menu segue chamando prewarmIfIdle
   pros GLBs que ainda estão baixando (ver o fim de tick()). */
startLoop();
