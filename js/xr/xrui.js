/* ================================================================
   PAINEL DE SESSÃO EM VR — pausar, ajustar conforto, recentrar, sair.

   POR QUE ISTO EXISTE. O menu, as opções e a tela de morte deste jogo são
   DOM, e **DOM não é renderizado dentro de uma sessão `immersive-vr`** (sem
   `dom-overlay` ele nem chega ao compositor). Com o headset na cara o jogador
   não tinha como pausar, não tinha como escolher o giro e não tinha como sair
   da partida — por isso entrar em VR começava a partida à força: era o único
   estado alcançável. É o critério F5 e o I4 do docs/vr/criterio-aaa.md
   ("nenhum estado sem saída"), e a VRC.Quest.Functional.2 da Meta
   (obrigatória): "Single player apps must pause when the Horizon OS requests
   the app to pause" — ou seja, a pausa tem que ser acionável por evento
   EXTERNO (o `onVisibility` de js/xr/xrsession.js), não só pelo botão.

   TRÊS DECISÕES QUE SÃO CONTRATO, NÃO GOSTO
   -----------------------------------------

   1. O PAINEL NÃO É FILHO DA CÂMERA. A vinheta de conforto é filha da câmera
      DE PROPÓSITO (js/xr/xrcomfort.js) porque tem que acompanhar a cabeça sem
      um frame de atraso. Menu é o contrário: a Meta escreve literalmente
      "Avoid locking HUD style content to the user's head movements", e a
      VRC.Quest.Functional.10 (recomendado) é ainda mais direta — "Headlocked
      menus and UI elements are generally uncomfortable for the user and should
      be avoided". Painel colado na cara não pode ser olhado — o olho persegue
      e nunca alcança — e é a receita clássica de desconforto.

      Aqui o painel é ANCORADO NO MUNDO (filho da `scene`) e nasce à frente do
      jogador. Só que "world-locked" puro cria beco: bastava girar 180° para o
      menu ficar às costas e não haver saída. Então ele é **ancorado no mundo
      com amortecimento**, que é a terceira ancoragem que o critério H2
      autoriza: enquanto a cabeça fica dentro de um cone de 35° o painel NÃO SE
      MEXE (é possível olhar em volta, e o teste mede isso em metros); passando
      de 35°, ele reposiciona-se suavemente à frente e para de novo quando o
      erro cai abaixo de 8°. Histerese, não perseguição.

      A ROTAÇÃO segue a POSIÇÃO do olho, nunca a orientação: `lookAt` no ponto
      onde o olho está. Girar a cabeça não move o olho, então girar a cabeça
      não gira o painel — o painel continua sendo um objeto do mundo.

   2. A DISTÂNCIA É 1,0 m, E O NÚMERO TEM DONO. A diretriz de UI da Meta dá
      três distâncias: ~0,45 m para manipulação direta com a mão, ~0,70 m para
      mão + controle, ~1,0 m para tela grande com interação indireta (raio) —
      e recomenda, em geral, "placing objects at a roughly 1 meter distance
      slightly below the user's line of sight". Este é o terceiro caso. O
      Oculus Best Practices fecha por baixo ("minimum comfortable distance,
      75 cm"), e a página atual da Meta fecha por cima do assunto: "Many have
      found that 1 meter is a comfortable distance for menus and GUIs that
      users may focus on for extended periods of time". Ver
      docs/vr/referencia-ui.md.

   3. O TAMANHO ANGULAR É PROJETADO, NÃO CHUTADO. A 1,0 m o painel de
      0,62 × 0,465 m ocupa **34,3° × 26,1°**. O Oculus BP manda a UI caber "no
      terço central da área de visão" — com os 110° horizontais do Quest 3 isso
      é ~36,7°, e o painel entra nele; o Android XR dá o mesmo número por outro
      caminho ("center 41° of a user's field of view"). Ficar dentro disso é o
      que evita o que o BP proíbe logo depois: obrigar o jogador a deslocar o
      olhar mais de 15–20°, que é quando o pescoço entra e a fadiga começa.

      A textura é 1024 × 768: a 25 pixels por grau (o número publicado do Quest
      3), 34,3° pedem ~858 px para 1:1 com o display — 1024 fica logo acima, e
      mais que isso é fill rate jogado fora. Cada linha tem ~88 px (≈ 3,8°) e a
      maiúscula do texto mede ≈ 1,3° de altura angular, contra o alvo de 0,7°
      em que Microsoft (tipografia em MR) e Android XR convergem, e contra o
      piso absoluto de 0,35–0,4°.

   CUSTO: **duas draw calls por olho, e só com o painel ABERTO** — uma malha
   para o painel (uma textura de canvas só: fundo, título, linhas e destaque
   são pintados no mesmo canvas) e uma linha para o raio da mão. Fechado, os
   dois ficam `visible = false` e o three nem os visita. O orçamento de XR
   deste jogo é apertado (docs/vr/perf-xr.md: 775 draw calls contra teto de
   180) e menu não é lugar de gastar.

   O CANVAS SÓ É REPINTADO QUANDO MUDA. Repintar 1024 × 768 a 90 Hz num
   Snapdragon é queimar o frame por nada — mesma disciplina do rótulo de
   js/xr/xrinteract.js e do `setPrompt` de js/interact.js.

   COMO CONVIVE COM js/xr/xrinteract.js. Os dois "apontam com a mão", e a
   divisão é limpa:

     · xrinteract é do GATILHO DA MÃO DE APOIO (esquerda, botão 0) e só roda
       dentro do frame de JOGO — o `tick` do game.js retorna antes dele quando
       `state.paused` é verdadeiro. Abrir este painel PAUSA, então os dois
       nunca disputam o mesmo frame.
     · este módulo é dono do CLIQUE DO ANALÓGICO DIREITO (botão 3), que é o
       único botão livre do mapa de js/xr/xrinput.js, e do gatilho da mão que
       estiver apontando PARA O PAINEL — e só enquanto o painel está aberto.
     · enquanto aberto, `capturando` é verdadeiro e o wiring NÃO traduz a
       entrada de VR em teclas: o gatilho que escolhe "SAIR DA PARTIDA" não
       pode disparar um tiro no mesmo frame.

   NADA É CRIADO NO BOOT. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID e a ordem de consumo é contrato do worldgen: o painel nasce
   na PRIMEIRA ABERTURA, dentro da sessão, muito depois do mundo pronto.
   ================================================================ */
import { CHAVE } from './xrturn.js';

/* Distância e tamanho: ver o cabeçalho (Meta MR design guidelines + Oculus BP).
   ALT sai de LARG pelo aspecto do canvas — esticar textura é borrão de graça. */
export const DIST = 1.0;
export const LARG = 0.62;
export const CANVAS_W = 1024, CANVAS_H = 768;
export const ALT = LARG * CANVAS_H / CANVAS_W;      // 0,465 m
/* Um pouco ABAIXO da linha do horizonte, porque o repouso natural do olhar fica
   para baixo. A Meta escreve "placing objects at a roughly 1 meter distance
   slightly below the user's line of sight" sem dar o ângulo; quem dá é o
   Android XR: "place the panel's vertical center 5° below a user's eye level".
   5° a 1,0 m = 8,7 cm. */
export const QUEDA = 0.09;
/* Histerese do reposicionamento: começa a voltar aos 35°, para aos 8°. */
export const CONE_SOLTA = 35 * Math.PI / 180;
export const CONE_PARA = 8 * Math.PI / 180;
const TAU = 0.22;              // constante de tempo do amortecimento, em s

const BOTAO_MENU = 3;          // clique do analógico DIREITO: o único livre
const BOTAO_SELECIONA = 0;     // gatilho da mão que aponta (o `select` da plataforma)
const MENU_EIXO_MAX = 0.5;     // clicar o analógico girado não abre menu

const TITULO_PX = 104;         // faixa do título, no canvas
const GRAU = Math.PI / 180;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const trava = (v, a, b) => Math.min(b, Math.max(a, v));

/* `session.inputSources` NÃO é Array (é `XRInputSourceArray`, e `Array.isArray`
   devolve false nele — guardar assim descarta os dois controles todo frame).
   Aceite iterável ou coisa com `length`. */
function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}
function fonteDe(fontes, qual) {
  for (const f of comoLista(fontes)) if (f && f.handedness === qual) return f;
  return null;
}
function botao(fonte, i) {
  const b = fonte && fonte.gamepad && fonte.gamepad.buttons && fonte.gamepad.buttons[i];
  return !!(b && b.pressed);
}
function eixo(fonte, i) {
  const g = fonte && fonte.gamepad;
  if (!g || !g.axes) return 0;
  const a = Array.isArray(g.axes) ? g.axes : Array.from(g.axes);
  return num(a[i]);
}

/* Preferências que NÃO são do giro (a vinheta) moram na MESMA chave que
   js/xr/xrturn.js usa, e o `preferir()` de lá grava com spread do que já
   existe — então as duas convivem sem uma pisar na outra. */
function lerExtra(armazem) {
  if (!armazem || typeof armazem.getItem !== 'function') return {};
  try {
    const o = JSON.parse(armazem.getItem(CHAVE) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch { return {}; }
}
function gravarExtra(armazem, campos) {
  if (!armazem || typeof armazem.setItem !== 'function') return;
  try {
    armazem.setItem(CHAVE, JSON.stringify({ ...lerExtra(armazem), ...campos }));
  } catch { /* modo privado / cota: vale só nesta sessão */ }
}

export function createXrUi({
  THREE, scene, camera, giro = null, acoes = {},
  win = typeof window === 'undefined' ? null : window,
  armazem = null,
} = {}) {
  const _olho = new THREE.Vector3(), _fwd = new THREE.Vector3(), _v = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _alvo = new THREE.Vector3();
  const _maoPos = new THREE.Vector3(), _maoDir = new THREE.Vector3();
  const _local = new THREE.Vector3(), _mInv = new THREE.Matrix4();
  const _pontas = new Float32Array(6);

  let painel = null, raioLinha = null, ctx = null, textura = null;
  let aberto = false, modo = 'pausa';
  let reposicionando = true;
  let hoverLinha = -1, hoverZona = 'linha';
  let pintado = '';                    // assinatura do último desenho
  let menuAntes = false, selAntes = false, pausamos = false;
  let maoAtiva = null;                 // 'left' | 'right' | null
  let ultimoAcionado = null;

  const extra = { vinheta: true, ...lerExtra(armazem) };
  extra.vinheta = extra.vinheta !== false;

  /* ---------------------------------------------------------------- */
  /* LINHAS. Montadas a cada leitura porque o slider que aparece depende do
     modo de giro escolhido — mostrar "velocidade" no modo em passos seria um
     controle que não faz nada. */
  const prefsGiro = () => (giro && giro.prefs) || { modo: 'suave', velocidade: 180, passo: 45 };

  function linhas() {
    if (modo === 'morte') {
      /* "JOGAR DE NOVO" só existe no SOLO. Em partida online o jogador morto
         fica morto até a rodada acabar: o menu de DOM esconde o botão, e
         oferecê-lo aqui dava um botão MORTO — a ação recusava com um aviso no
         console e o painel se reabria sozinho. Botão que não faz nada é pior
         que botão ausente. */
      const l = [];
      if (!acoes.podeReaparecer || acoes.podeReaparecer()) {
        l.push({ id: 'reaparecer', tipo: 'botao', txt: 'JOGAR DE NOVO' });
      }
      l.push({ id: 'sair', tipo: 'botao', txt: 'VOLTAR AO MENU' });
      return l;
    }
    const p = prefsGiro();
    const l = [
      { id: 'retomar', tipo: 'botao', txt: 'RETOMAR' },
      { id: 'giroModo', tipo: 'escolha', txt: 'GIRO', val: p.modo === 'passos' ? 'EM PASSOS' : 'SUAVE' },
    ];
    if (p.modo === 'passos') {
      l.push({ id: 'passo', tipo: 'valor', txt: 'ÂNGULO DO PASSO', val: Math.round(p.passo) + '°' });
    } else {
      l.push({ id: 'velocidade', tipo: 'valor', txt: 'VELOCIDADE DO GIRO', val: Math.round(p.velocidade) + '°/s' });
    }
    l.push({ id: 'vinheta', tipo: 'escolha', txt: 'VINHETA DE CONFORTO', val: extra.vinheta ? 'LIGADA' : 'DESLIGADA' });
    l.push({ id: 'recentrar', tipo: 'botao', txt: 'RECENTRAR A VISTA' });
    l.push({ id: 'sair', tipo: 'botao', txt: 'SAIR DA PARTIDA' });
    return l;
  }

  /* ---------------------------------------------------------------- */
  /* MALHA. Uma só, criada na primeira abertura (ver o cabeçalho). */
  function montar() {
    if (painel) return;
    const doc = win && win.document;
    const cv = doc ? doc.createElement('canvas') : null;
    if (cv) { cv.width = CANVAS_W; cv.height = CANVAS_H; ctx = cv.getContext('2d'); }
    textura = cv ? new THREE.CanvasTexture(cv) : null;
    if (textura) textura.colorSpace = THREE.SRGBColorSpace;
    painel = new THREE.Mesh(
      new THREE.PlaneGeometry(LARG, ALT),
      new THREE.MeshBasicMaterial({
        map: textura, transparent: true, depthWrite: false,
        toneMapped: false, side: THREE.FrontSide,
      }));
      /* FrontSide, e isto vale um comentário: no three r0.185, material
         `transparent` com `side: DoubleSide` e `forceSinglePass` falso é
         desenhado em DOIS passes (BackSide e depois FrontSide), com
         `needsUpdate = true` entre eles — ou seja, DOBRA a draw call e ainda
         força uma verificação de programa por frame. Medido aqui: o custo caiu
         de 8 para 4 em estéreo só trocando o lado. O painel sempre encara o
         olho, então a face de trás nunca seria vista de qualquer forma. */
    painel.name = 'xrUiPainel';
    painel.renderOrder = 9990;        // informação não fica atrás de parede
    painel.material.depthTest = false;
    painel.frustumCulled = false;
    scene.add(painel);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_pontas, 3));
    raioLinha = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x9dd8ff, transparent: true, opacity: 0.75, depthTest: false,
    }));
    raioLinha.name = 'xrUiRaio';
    raioLinha.renderOrder = 9991;
    raioLinha.frustumCulled = false;
    scene.add(raioLinha);
  }

  /* ---------------------------------------------------------------- */
  /* PINTURA. Só quando a assinatura muda — repintar 1024×768 a 90 Hz num
     Snapdragon é queimar o frame por nada. */
  function pintar() {
    if (!ctx) return;
    const ls = linhas();
    const assin = modo + '|' + hoverLinha + '|' + hoverZona + '|' +
      ls.map(l => l.id + ':' + (l.val || '')).join(',');
    if (assin === pintado) return;
    pintado = assin;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = 'rgba(8,12,18,0.90)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = 'rgba(157,216,255,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9dd8ff';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(modo === 'morte' ? 'VOCÊ MORREU' : 'PAUSA', 44, TITULO_PX / 2 + 6);

    const alturaLinha = (CANVAS_H - TITULO_PX) / Math.max(1, ls.length);
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const y = TITULO_PX + i * alturaLinha;
      const meio = y + alturaLinha / 2;
      if (i === hoverLinha) {
        ctx.fillStyle = 'rgba(92,226,122,0.16)';
        ctx.fillRect(16, y + 6, CANVAS_W - 32, alturaLinha - 12);
      }
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = i === hoverLinha ? '#9dffb8' : '#e6eef7';
      ctx.fillText(l.txt, 44, meio, 560);
      if (l.tipo === 'valor') {
        ctx.textAlign = 'center';
        ctx.fillStyle = hoverZona === 'menos' && i === hoverLinha ? '#9dffb8' : '#8fa3b8';
        ctx.fillText('−', CANVAS_W * 0.665, meio);
        ctx.fillStyle = hoverZona === 'mais' && i === hoverLinha ? '#9dffb8' : '#8fa3b8';
        ctx.fillText('+', CANVAS_W * 0.945, meio);
      }
      if (l.val) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd7a0';
        ctx.font = 'bold 50px system-ui, sans-serif';
        ctx.fillText(l.val, CANVAS_W * 0.805, meio, 230);
      }
    }
    if (textura) textura.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */
  /* POSE. Ancorada no mundo com amortecimento (ver o cabeçalho). */
  function pousar(forcar) {
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(_olho);
    camera.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q); _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1); else _fwd.normalize();
    _alvo.copy(_fwd).multiplyScalar(DIST).add(_olho);
    _alvo.y = _olho.y - QUEDA;
    if (forcar) { painel.position.copy(_alvo); reposicionando = false; }
    return _alvo;
  }

  function erroDeVista() {
    _v.copy(painel.position).sub(_olho); _v.y = 0;
    if (_v.lengthSq() < 1e-6) return Math.PI;
    _v.normalize();
    return Math.acos(trava(_v.dot(_fwd), -1, 1));
  }

  function seguir(dt) {
    const alvo = pousar(false);
    const erro = erroDeVista();
    if (!reposicionando && erro > CONE_SOLTA) reposicionando = true;
    if (reposicionando) {
      const k = 1 - Math.exp(-Math.max(0, num(dt)) / TAU);
      painel.position.lerp(alvo, k);
      /* A interpolação linear é uma CORDA: sem reprojetar, o painel corta
         caminho por dentro do arco e PARA mais perto que a distância de
         leitura (medido: chegava a 0,70 m, abaixo do piso de 0,75 m do
         Oculus BP). O reposicionamento tem que andar sobre o arco. */
      _v.copy(painel.position).sub(_olho); _v.y = 0;
      const raio = _v.length();
      if (raio > 1e-4) {
        _v.multiplyScalar(DIST / raio).add(_olho);
        painel.position.x = _v.x; painel.position.z = _v.z;
      }
      if (erroDeVista() < CONE_PARA) reposicionando = false;
    }
    /* Encara a POSIÇÃO do olho, não a orientação: girar a cabeça não move o
       olho, então girar a cabeça não mexe no painel. É a diferença entre
       objeto do mundo e objeto colado na cara. */
    painel.lookAt(_olho);
  }

  /* ---------------------------------------------------------------- */
  /* APONTAR. Interseção raio↔plano do painel, em coordenada LOCAL dele. */
  function pontaDaMao(fonte3d) {
    fonte3d.updateWorldMatrix(true, false);
    fonte3d.getWorldPosition(_maoPos);
    fonte3d.getWorldQuaternion(_q);
    /* `getWorldDirection` devolve o +Z do objeto (só `Camera` devolve -Z):
       usado direto aqui, o raio sairia para trás da mão. */
    _maoDir.set(0, 0, -1).applyQuaternion(_q);
  }

  function bater() {
    painel.updateWorldMatrix(true, false);
    _mInv.copy(painel.matrixWorld).invert();
    _local.copy(_maoPos).applyMatrix4(_mInv);
    _v.copy(_maoPos).add(_maoDir).applyMatrix4(_mInv);
    const dz = _v.z - _local.z;
    if (Math.abs(dz) < 1e-6) return null;
    const t = -_local.z / dz;
    if (t <= 0) return null;
    const x = _local.x + (_v.x - _local.x) * t;
    const y = _local.y + (_v.y - _local.y) * t;
    if (Math.abs(x) > LARG / 2 || Math.abs(y) > ALT / 2) return null;
    return { x, y, t, u: x / LARG + 0.5, v: 0.5 - y / ALT };
  }

  function zonaDe(l, u) {
    if (l.tipo !== 'valor') return 'linha';
    if (u > 0.60 && u < 0.73) return 'menos';
    if (u > 0.88) return 'mais';
    return 'linha';
  }

  /* ---------------------------------------------------------------- */
  /* AÇÕES. Nada de gameplay mora aqui: quem sabe pausar, recentrar e sair é
     o game.js, e chega por `acoes`. Este módulo só sabe de painel. */
  function chamar(nome) {
    const f = acoes && acoes[nome];
    if (typeof f !== 'function') return false;
    try { f(); } catch { return false; }
    return true;
  }

  function acionar(l, zona) {
    ultimoAcionado = l.id;
    if (l.id === 'retomar') { fechar(); return true; }
    if (l.id === 'sair') { fechar(); return chamar('sair'); }
    if (l.id === 'reaparecer') { fechar(); return chamar('reaparecer'); }
    if (l.id === 'recentrar') return chamar('recentrar');
    if (l.id === 'giroModo') {
      const p = prefsGiro();
      if (giro && giro.preferir) giro.preferir({ modo: p.modo === 'passos' ? 'suave' : 'passos' });
      return true;
    }
    if (l.id === 'vinheta') {
      extra.vinheta = !extra.vinheta;
      gravarExtra(armazem, { vinheta: extra.vinheta });
      return true;
    }
    if (l.id === 'velocidade' || l.id === 'passo') {
      const sinal = zona === 'menos' ? -1 : zona === 'mais' ? 1 : 0;
      if (!sinal || !giro || !giro.preferir) return false;
      const p = prefsGiro();
      if (l.id === 'velocidade') giro.preferir({ velocidade: p.velocidade + sinal * 15 });
      else giro.preferir({ passo: p.passo + sinal * 5 });
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  function abrir(qual = 'pausa') {
    modo = qual === 'morte' ? 'morte' : 'pausa';
    montar();
    if (!aberto) {
      aberto = true;
      painel.visible = true;
      if (raioLinha) raioLinha.visible = true;
      hoverLinha = -1; hoverZona = 'linha'; pintado = '';
      pousar(true);
      painel.lookAt(_olho);
      /* a tela de morte já vem com o jogo parado por outro dono: pausar de
         novo faria o `retomar` do fechamento despausar algo que não era nosso */
      pausamos = modo === 'pausa' && chamar('pausar');
    }
    pintar();
    return true;
  }

  function fechar() {
    if (!aberto) return false;
    aberto = false;
    if (painel) painel.visible = false;
    if (raioLinha) raioLinha.visible = false;
    hoverLinha = -1; maoAtiva = null;
    if (pausamos) { pausamos = false; chamar('retomar'); }
    return true;
  }

  /* `maos` traz os RAIOS DE MIRA (`targetRaySpace`) das duas mãos — é o espaço
     de apontar, não o de segurar: js/xr/xrhands.js entrega `mao(qual)` para
     isto e `punho(qual)` para pendurar objeto. */
  function update({ dt = 0, maos = null, fontes = null, permitirAbrir = true } = {}) {
    const dir = fonteDe(fontes, 'right');

    /* MENU: clique do analógico direito, e só com o analógico perto do centro
       — clicar enquanto se gira é acidente, não intenção. */
    const menuAgora = botao(dir, BOTAO_MENU) &&
      Math.abs(eixo(dir, 2)) < MENU_EIXO_MAX && Math.abs(eixo(dir, 3)) < MENU_EIXO_MAX;
    const bordaMenu = menuAgora && !menuAntes;
    menuAntes = menuAgora;
    if (bordaMenu) {
      if (aberto) fechar();
      else if (permitirAbrir) abrir('pausa');
    }

    if (!aberto || !painel) {
      return { aberto: false, capturando: false, item: null, acionou: null, mao: null };
    }

    seguir(dt);

    /* Aponta com a mão que ACERTAR o painel. A direita tem preferência (é a
       mão que já aponta neste jogo); a esquerda serve quando o jogador troca
       ou quando só um controle está na sessão. */
    let alvo = null, maoHit = null;
    for (const qual of ['right', 'left']) {
      const n = maos && maos[qual];
      if (!n) continue;
      pontaDaMao(n);
      const h = bater();
      if (h) { alvo = h; maoHit = qual; break; }
    }
    if (maoHit) maoAtiva = maoHit;
    else {
      /* ninguém acertou: o raio sai da mão preferida que EXISTE, e a pose
         precisa ser relida (o laço acima terminou na última consultada) */
      maoAtiva = (maos && maos.right) ? 'right' : (maos && maos.left) ? 'left' : null;
      if (maoAtiva) pontaDaMao(maos[maoAtiva]);
    }
    if (raioLinha) {
      const temMao = !!(maos && (maos.right || maos.left));
      raioLinha.visible = temMao;
      if (temMao) {
        const comp = alvo ? alvo.t : 1.4;
        _v.copy(_maoDir).multiplyScalar(comp).add(_maoPos);
        _pontas[0] = _maoPos.x; _pontas[1] = _maoPos.y; _pontas[2] = _maoPos.z;
        _pontas[3] = _v.x; _pontas[4] = _v.y; _pontas[5] = _v.z;
        raioLinha.geometry.attributes.position.needsUpdate = true;
        raioLinha.geometry.computeBoundingSphere();
      }
    }

    const ls = linhas();
    let novaLinha = -1, novaZona = 'linha';
    if (alvo) {
      const iy = (0.5 - alvo.y / ALT) * CANVAS_H;
      if (iy >= TITULO_PX) {
        const idx = Math.floor((iy - TITULO_PX) / ((CANVAS_H - TITULO_PX) / ls.length));
        if (idx >= 0 && idx < ls.length) { novaLinha = idx; novaZona = zonaDe(ls[idx], alvo.u); }
      }
    }
    hoverLinha = novaLinha; hoverZona = novaZona;

    const fonteMao = fonteDe(fontes, maoAtiva || 'right');
    const selAgora = botao(fonteMao, BOTAO_SELECIONA);
    const bordaSel = selAgora && !selAntes;
    selAntes = selAgora;

    let acionou = null;
    if (bordaSel && hoverLinha >= 0) {
      const l = ls[hoverLinha];
      if (acionar(l, hoverZona)) acionou = l.id;
      pintado = '';   // valor mudou: força repintar
    }
    pintar();

    return {
      aberto, capturando: true, mao: maoAtiva,
      item: hoverLinha >= 0 ? { id: ls[hoverLinha].id, zona: hoverZona } : null,
      acionou,
    };
  }

  function exit() {
    aberto = false;
    if (painel) { painel.visible = false; if (painel.parent) painel.parent.remove(painel); }
    if (raioLinha) { raioLinha.visible = false; if (raioLinha.parent) raioLinha.parent.remove(raioLinha); }
    painel = null; raioLinha = null; ctx = null; textura = null;
    hoverLinha = -1; menuAntes = false; selAntes = false; pintado = '';
  }

  return {
    abrir, fechar, update, exit,
    get aberto() { return aberto; },
    get modo() { return modo; },
    get painel() { return painel; },
    /* preferências que não são do giro; o wiring lê `vinheta` para zerar a
       entrada da vinheta de js/xr/xrcomfort.js quando o jogador desliga */
    get prefs() { return { ...extra }; },
    /* leitura para QA: o que o painel É, medido em metros e graus. Nada aqui
       ACIONA nada — sonda que aciona mede a si mesma. */
    estado() {
      if (!painel) return { montado: false, aberto: false };
      camera.updateWorldMatrix(true, false);
      camera.getWorldPosition(_olho);
      painel.updateWorldMatrix(true, false);
      const pos = painel.getWorldPosition(new THREE.Vector3());
      const d = pos.distanceTo(_olho);
      const ls = linhas();
      const alturaLinha = (CANVAS_H - TITULO_PX) / ls.length;
      return {
        montado: true, aberto, modo,
        visivel: !!painel.visible,
        pos: pos.toArray(),
        distancia: d,
        /* ângulo que o painel OCUPA na vista, em graus — a medida que o
           critério H2 cobra, e não a largura em metros */
        grausH: 2 * Math.atan((LARG / 2) / Math.max(1e-6, d)) / GRAU,
        grausV: 2 * Math.atan((ALT / 2) / Math.max(1e-6, d)) / GRAU,
        /* altura angular da MAIÚSCULA de uma linha: o número que decide se dá
           pra ler (ver docs/vr/referencia-ui.md) */
        grausTexto: 2 * Math.atan((ALT * (52 * 0.72 / CANVAS_H) / 2) / Math.max(1e-6, d)) / GRAU,
        grausLinha: 2 * Math.atan((ALT * (alturaLinha / CANVAS_H) / 2) / Math.max(1e-6, d)) / GRAU,
        reposicionando,
        linhas: ls.map((l, i) => {
          const y = ALT / 2 - (TITULO_PX + (i + 0.5) * alturaLinha) / CANVAS_H * ALT;
          const centro = new THREE.Vector3(0, y, 0).applyMatrix4(painel.matrixWorld);
          const menos = new THREE.Vector3((0.665 - 0.5) * LARG, y, 0).applyMatrix4(painel.matrixWorld);
          const mais = new THREE.Vector3((0.945 - 0.5) * LARG, y, 0).applyMatrix4(painel.matrixWorld);
          return {
            id: l.id, tipo: l.tipo, txt: l.txt, val: l.val || null,
            centro: centro.toArray(), menos: menos.toArray(), mais: mais.toArray(),
          };
        }),
        item: hoverLinha >= 0 ? { id: ls[hoverLinha].id, zona: hoverZona } : null,
        mao: maoAtiva,
        ultimoAcionado,
      };
    },
  };
}
