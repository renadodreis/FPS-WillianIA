/* ================================================================
   MENU INICIAL — câmera cinematográfica + vida da tela de título.

   Duas responsabilidades, um só arquivo:

   1) createMenuCamera — passeio por pontos de interesse do mapa
      (cidade, castelo, vulcão, o carro do spawn). Roda DENTRO do
      tick() que já existe: zero setInterval, zero requestAnimationFrame
      próprio. Não aloca nada por frame — alvo e posição são vetores de
      escratch reaproveitados.

      INVARIANTE: nada aqui pode consumir `Math.random`. A ordem de
      consumo do stream seedado é contrato do worldgen (ver CLAUDE.md);
      uma câmera que sorteasse o próximo plano mudaria o mapa inteiro.
      Todo movimento sai de tempo acumulado + Math.sin/cos.

   2) wireMenuUI — som, foco e teclado dos botões, destravamento do
      AudioContext no primeiro gesto do jogador e o flash de "entrando
      no jogo". Os SFX de interface são chamados de forma OPCIONAL
      (`SFX.uiHover?.()`): enquanto js/sfx.js não os implementar, o menu
      simplesmente fica mudo em vez de quebrar.
   ================================================================ */

/* ---------------- câmera do menu ---------------- */

/* Um "plano" (shot) é: um alvo, um arco ao redor dele e um dolly lento.
   `at(v)` PREENCHE o vetor recebido (não devolve um novo) — é o que
   mantém o custo por frame em zero alocação mesmo com alvo móvel.

   ENQUADRAMENTO: `pan`/`tilt` deslocam o PONTO DE MIRA (não a câmera) em
   frações da distância até o alvo — mirar ao lado do assunto joga o assunto
   pro lado oposto da tela. É assim que o castelo/vulcão saem de trás do
   painel do menu (que ocupa a coluna esquerda) sem mexer no arco da câmera.
   pan > 0 mira à direita  → assunto à ESQUERDA;  pan < 0 → assunto à direita.
   tilt > 0 mira pra cima  → assunto mais BAIXO;  tilt < 0 → assunto mais alto. */
export function createMenuCamera(deps) {
  const { THREE, camera, heightAt, shots, cutEl } = deps;
  /* PORTÃO DE CORTE (mayTour): o passeio só troca de plano quando o chamador
     libera — na prática, quando o prewarm linkou os shaders pendentes. Sem
     isto, o primeiro corte pra cidade compila dezenas de programas WebGL
     SINCRONAMENTE em GPU fraca; a main thread trava por segundos, o engine.io
     derruba o socket e o cliente renasce com outro id → em produção o
     multiplayer recarrega a página NO MEIO DO MENU. Checado a CADA corte:
     um lote de GLB tardio (árvores/POIs) volta a segurar o corte seguinte.
     Enquanto segura, o plano atual continua orbitando — ninguém percebe. */
  const mayTour = deps.mayTour || (() => true);
  const _target = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  // corte: escurece rápido, troca de plano no escuro, volta devagar.
  // Sem timer: a régua é o próprio dt do tick.
  const CUT_IN = 0.14, CUT_OUT = 0.34;
  let idx = 0, shotT = 0, cutT = -1, swapped = false, cutShown = -1;

  function paintCut(v) {
    if (!cutEl || v === cutShown) return;
    cutShown = v;
    cutEl.style.opacity = v === 0 ? '' : v.toFixed(3);
  }

  function update(dt) {
    const s = shots[idx];
    shotT += dt;

    if (cutT >= 0) {
      cutT += dt;
      if (!swapped && cutT >= CUT_IN) {
        idx = (idx + 1) % shots.length;
        shotT = 0;
        swapped = true;
      }
      if (cutT >= CUT_IN + CUT_OUT) { cutT = -1; paintCut(0); }
      else paintCut(cutT < CUT_IN ? cutT / CUT_IN : 1 - (cutT - CUT_IN) / CUT_OUT);
    } else if (shotT >= s.dur && mayTour()) {
      cutT = 0; swapped = false;
    }

    const cur = shots[idx];
    const u = shotT < cur.dur ? shotT / cur.dur : 1;
    const e = u * u * (3 - 2 * u);             // dolly desacelera no fim do plano
    cur.at(_target);
    const ang = cur.a0 + cur.spin * shotT;
    const r = cur.r0 + (cur.r1 - cur.r0) * e;
    const h = cur.h0 + (cur.h1 - cur.h0) * e;
    _pos.set(_target.x + Math.sin(ang) * r, _target.y + h, _target.z + Math.cos(ang) * r);
    /* Nunca enterrar a lente. Só nos planos rasantes: acima de ~34 m do alvo
       nenhum relevo do mapa alcança a câmera, e heightAt() é a única coisa
       nesta função que aloca (o objeto de célula do terreno). */
    if (h < 34) {
      const floor = heightAt(_pos.x, _pos.z) + 3;
      if (_pos.y < floor) _pos.y = floor;
    }
    camera.position.copy(_pos);
    /* mira deslocada: tudo em vetores de escratch, zero alocação por frame */
    _aim.subVectors(_target, _pos);
    const dist = _aim.length();
    _right.crossVectors(_aim, _up);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      _aim.copy(_target)
        .addScaledVector(_right, (cur.pan || 0) * dist)
        .addScaledVector(_up, (cur.tilt || 0) * dist);
      camera.lookAt(_aim);
    } else camera.lookAt(_target);
    const fov = cur.fov0 + (cur.fov1 - cur.fov0) * e;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  /* QA / captura: pular direto pra um plano sem esperar o ciclo */
  function goTo(key) {
    const i = shots.findIndex(s => s.key === key);
    if (i < 0) return false;
    idx = i; shotT = 0; cutT = -1; swapped = false; paintCut(0);
    return true;
  }

  return { update, goTo, get shot() { return shots[idx].key; },
    shotIndex: () => idx };
}

/* ---------------- interface do menu ---------------- */

export function wireMenuUI(deps) {
  const { SFX } = deps;
  const $ = id => document.getElementById(id);
  const overlay = $('overlay'), settings = $('settings'), launchFx = $('launchFx');
  let menuGone = false;

  /* --- AudioContext: só destrava com gesto. O fluxo antigo só chamava
     init/resume no startGame, então o hover NUNCA tinha som. Aqui o
     primeiro pointerdown/keydown da página já liga a máquina; se o
     navegador ainda recusar, os SFX.ui* viram no-op silencioso. --- */
  let audioReady = false;
  function unlockAudio() {
    if (audioReady) return;
    audioReady = true;
    try {
      SFX.init?.();
      SFX.resume?.();
      SFX.setVolumes?.();
      if (!menuGone) SFX.menuMusicStart?.();
    } catch (e) {}
  }
  document.addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
  document.addEventListener('keydown', unlockAudio, { capture: true, once: true });

  /* --- hover/click: delegado no DOCUMENT, não no #overlay. O painel
     #settings é fisicamente movido pro lobby do BR (multiplayer-client)
     e voltaria mudo se a escuta morasse no overlay. --- */
  let hovered = null;
  const btnOf = e => (e.target && e.target.closest ? e.target.closest('.mbtn') : null);
  const live = b => b && !b.classList.contains('disabled');

  document.addEventListener('pointerover', e => {
    const b = btnOf(e);
    if (b === hovered) return;
    hovered = b;
    if (live(b)) SFX.uiHover?.();
  });
  document.addEventListener('focusin', e => {
    const b = btnOf(e);
    if (live(b)) SFX.uiHover?.();
  });
  document.addEventListener('click', e => {
    const b = btnOf(e);
    if (!live(b)) return;
    // sem rAF: em máquina lenta o "press" tem que aparecer no MESMO gesto.
    // `animationend` limpa a classe; reclique dentro dos 260 ms não reinicia.
    b.classList.add('hit');
    if (b.id === 'btnBack') SFX.uiBack?.(); else SFX.uiClick?.();
  }, true);
  document.addEventListener('animationend', e => {
    if (e.animationName === 'mbtnHit' && e.target.classList) e.target.classList.remove('hit');
  });

  /* --- configurações: um toque seco por ajuste. O range dispara dezenas
     de eventos por arrasto; um por 110 ms basta pro ouvido. --- */
  let lastToggle = 0;
  const tick = () => {
    const now = performance.now();
    if (now - lastToggle < 110) return;
    lastToggle = now;
    SFX.uiToggle?.();
  };
  document.addEventListener('change', e => {
    if (e.target && e.target.closest && e.target.closest('#settings')) tick();
  });
  document.addEventListener('input', e => {
    if (e.target && e.target.type === 'range' && e.target.closest('#settings')) tick();
  });

  /* --- teclado: setas/Tab/Enter navegam o menu (o Tab é nativo pelos
     tabindex). Só age com o menu na tela — depois do START o handler cai
     fora antes de tocar em qualquer tecla do jogo. --- */
  const visible = () => {
    if (!overlay || overlay.style.display === 'none' || overlay.classList.contains('hidden')) return false;
    /* O lobby do BR já foi uma camada de tela cheia POR CIMA deste menu, e
       aqui o teclado era desligado enquanto ele estivesse visível. Hoje o
       lobby é um painel DENTRO do #panel (index.html, #mpPanel): as setas
       precisam continuar valendo pra que o SOLO ao lado dele siga alcançável
       sem mouse. Quem digita nick/código/chat continua protegido pela linha
       abaixo — campo de texto em foco tem prioridade sobre a navegação. */
    const a = document.activeElement;
    return !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };

  /* Com as configurações abertas a navegação fica presa nelas; fora disso o
     escopo é o painel INTEIRO (botões + o gatilho dos controles recolhidos).
     `offsetParent !== null` já descarta o que estiver escondido, então o
     VOLTAR do #settings fechado nunca entra na lista. */
  function options() {
    const open = settings && settings.classList.contains('open');
    const scope = open ? settings : $('panel');
    if (!scope) return [];
    return Array.prototype.filter.call(scope.querySelectorAll('.mbtn'),
      b => live(b) && b.offsetParent !== null);
  }

  document.addEventListener('keydown', e => {
    if (!visible()) return;
    const list = options();
    if (!list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = list.indexOf(document.activeElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = at < 0 ? (step > 0 ? 0 : list.length - 1)
        : (at + step + list.length) % list.length;
      list[next].focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      const a = document.activeElement;
      if (a && a.classList && a.classList.contains('mbtn')) { e.preventDefault(); a.click(); }
    } else if (e.key === 'Escape') {
      // ESC fecha o painel aberto (configurações têm prioridade: elas podem
      // ter sido abertas DE DENTRO do multijogador e o VOLTAR devolve o lobby)
      const aberto = settings && settings.classList.contains('open') ? 'btnBack'
        : ($('mpPanel') && !$('mpPanel').hidden ? 'btnMpBack' : null);
      const back = aberto && $(aberto);
      if (back) back.click();
    }
  });

  /* --- "entrando no jogo": o overlay some SÍNCRONO (contrato do
     setPaused — teste de gameplay assere display:none no mesmo tick), então
     o feedback mora num elemento à parte, por cima e sem pointer-events. --- */
  function launch() {
    menuGone = true;
    try { SFX.menuMusicStop?.(); } catch (e) {}
    const a = document.activeElement;
    if (a && a.blur && a.classList && a.classList.contains('mbtn')) a.blur();
    if (!launchFx) return;
    // direto, sem rAF: o clarão tem que sair no frame do clique, não no próximo
    launchFx.classList.add('go');
    launchFx.addEventListener('animationend',
      () => launchFx.classList.remove('go'), { once: true });
  }

  return { launch, unlockAudio };
}
