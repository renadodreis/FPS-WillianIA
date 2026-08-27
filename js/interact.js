/* interação (tecla E): baús, bazuca, veículos — extraído de game.js; deps explícitas */
import { buildChest } from './chestmodel.js';

/* ================================================================
   DE ONDE SE MEDE O ALCANCE — a régua, e por que ela tem desconto.

   Fora de VR isto não é pergunta: a câmera está em cima do jogador e medir do
   corpo é medir da cabeça. Em VR passou a ser, e por uma mudança de física que
   não se discute: a parede AGORA SEGURA O COLISOR (js/xr/xrrig.js). Antes o
   passo recusado voltava para o colisor e ele atravessava 10,9623 m num pedido
   de 10 m — vetor de trapaça, não desconforto. Com a parede segurando, o corpo
   para e a cabeça segue, porque nada pode arrastar a vista de quem está de
   headset.

   A IDENTIDADE QUE DECIDE TUDO. Lendo `place()` do rig, a pose de mundo da
   cabeça é, literalmente:

       cabeça = player.pos + passoPendente + fora

   `passoPendente` é o passo físico que o jogo ainda não absorveu (drenado todo
   frame ANTES da física, com teto de 0,15 m — a 72 Hz uma caminhada rápida
   gasta ~2 cm por frame). E `fora` é EXATAMENTE o que o mundo recusou: ele só
   cresce em `devolverPasso()`, que só é chamado com a componente do passo que
   a colisão do jogo desfez.

   Ou seja: a diferença entre "medir da cabeça" e "medir do corpo" É, ponto por
   ponto, o que a parede negou ao corpo do jogador. Medido em sessão real:
   caminhada livre de 1,2 m separa **0,0000 m**; 1,8 m contra uma estrutura
   separam **1,1200 m**. Medir da cabeça crua devolveria 1,12 m de alcance
   sobre um raio de baú de 2,4 m — e o servidor NÃO valida distância de baú
   (`openChest` valida vivo, fase, repetição e 300 ms entre baús; distância,
   nenhuma). A régua daqui é a única trava desse caminho.

   ENTÃO A RÉGUA É A CABEÇA, DESCONTADO O QUE O MUNDO RECUSOU. Em jogo normal
   o desconto é zero e a régua É a cabeça, que é o que o critério D2 cobra. Na
   parede o desconto é tudo, e a régua volta a ser o corpo — que é onde o
   jogador realmente está.

   TRÊS DETALHES QUE SÃO CONTRATO:

   · **Só X/Z.** `fora` só existe no plano horizontal (o rig só recusa passo
     horizontal). Levar o Y da cabeça para a conta mudaria em ~1,6 m a esfera
     de 5 m do helicóptero e a banda de 3,5 m da bazuca — retoque de gameplay
     disfarçado de correção de VR.
   · **Teto absoluto.** Fica acima do pico de encosto de parede medido
     (0,133 m). `FORA_MAX` era 0,50 m quando era limiar de CONFORTO, e este
     texto dizia que o teto ficava ABAIXO do ponto de tela preta; desde que os
     limiares da cortina passaram a sair da geometria (colisor r = 0,42 +
     near 0,08 → o outro lado aparece em 0,34 m de separação), `FORA_MAX` é
     **0,32** e o teto de alcance ficou 1 cm ACIMA dele. Isso é mais
     restritivo, não menos: no alcance máximo a tela já fechou. É a trava que
     sobrevive se um dia aparecer separação que o `fora` não explique.
   · **Sem saber a recusa, assume que foi TUDO.** Quem não fia `foraXR` fica
     com a régua no corpo, que é o comportamento de sempre. Errar para o lado
     permissivo aqui seria abrir alcance por parede em silêncio.

   Fontes e a conta do custo em docs/vr/referencia-interacao.md §8.
   ================================================================ */
export const TETO_FORA = 0.35;

export function pontoDeAlcance(out, corpo, cabeca, foraM) {
  out.copy(corpo);
  if (!cabeca) return out;
  const dx = cabeca.x - corpo.x, dz = cabeca.z - corpo.z;
  const m = Math.hypot(dx, dz);
  if (!(m > 1e-9)) return out;
  /* `foraM` não numérico = "não sei quanto o mundo recusou" → assume tudo */
  const f = Number.isFinite(foraM) ? Math.max(0, foraM) : m;
  const usa = Math.min(Math.max(0, m - f), TETO_FORA);
  out.x = corpo.x + (dx / m) * usa;
  out.z = corpo.z + (dz / m) * usa;
  return out;   // `out.y` continua sendo o do corpo, de propósito
}

export function createInteract(deps) {
  const { heightAt, SFX, scene, csmMat, Structures, ui, centerMsg, arsenal, unlockWeapon, updateInvHUD, state, justPressed, player, inventory, Car, Heli, tryToggleCar, getCannon, getMapToys, getSecrets, isMobile,
    /* Pose de MUNDO da cabeça (preenche e devolve o alvo), ou null fora de XR;
       e quanto o mundo recusou, em metros. Sem os dois a régua é `player.pos`,
       que é o que sempre foi. */
    cabecaXR = null, foraXR = null } = deps;
  /* COMO O HUD CHAMA CADA AÇÃO. No celular não existe tecla nenhuma: anunciar
     "[F] comer" num aparelho sem teclado é prometer ação inalcançável — era
     literalmente o caso da carne, que entrava no inventário e nunca saía. Aqui
     o HUD passa a citar o BOTÃO do cluster de toque, no mesmo tom do
     "USAR PARA SAIR" do velocímetro. Fora do celular nada muda. */
  const NAMES = isMobile
    ? { med: 'botão ✚', nade: 'botão ●', eat: 'botão 🍖', sight: 'botão 🔭', use: 'USAR' }
    : { med: '[Q] usar', nade: '[G] lançar', eat: '[F] comer', sight: '[T] troca mira', use: 'E' };
  for (const s of Structures.chestSpots) {
    // não nasce dentro de parede: empurra o spot pra fora de qualquer estrutura
    // (collide não consome rand — seguro na fase seedada). Mantém proximidade e
    // mesh coerentes mutando o próprio spot.
    const p = { x: s.x, y: heightAt(s.x, s.z) + 0.3, z: s.z };
    for (let i = 0; i < 4; i++) Structures.collide(p, 0.5, 0.6);
    s.x = p.x; s.z = p.z;
    const { group } = buildChest(csmMat);
    group.position.set(s.x, heightAt(s.x, s.z), s.z);
    scene.add(group);
    /* O mesh fica guardado no próprio spot: em VR o alvo de interação é
       destacado no MUNDO (não há centro de tela onde pendurar dica), e sem a
       referência só dava pra marcar o ponto no chão, não o baú. */
    s.mesh = group;
  }
  const chest = { medkits: 0, nades: 0, meat: 0 };

  function chestSwap() {
    const stored = chest.medkits + chest.nades + chest.meat;
    if (stored > 0) {
      const tm = Math.min(inventory.medkitsMax - inventory.medkits, chest.medkits);
      inventory.medkits += tm; chest.medkits -= tm;
      const tn = Math.min(inventory.nadesMax - inventory.nades, chest.nades);
      inventory.nades += tn; chest.nades -= tn;
      const tc = Math.min(inventory.meatMax - inventory.meat, chest.meat);
      inventory.meat += tc; chest.meat -= tc;
      centerMsg('Baú: itens retirados', 1300);
    } else {
      const dm = Math.max(0, inventory.medkits - 1); chest.medkits += dm; inventory.medkits -= dm;
      const dn = Math.max(0, inventory.nades - 1); chest.nades += dn; inventory.nades -= dn;
      chest.meat += inventory.meat; inventory.meat = 0;
      centerMsg('Baú: excedente guardado (mantém 1 de cada)', 1600);
    }
    SFX.pickup();
    updateInvHUD();
  }
  /* `Vector3` não é `Object3D` nem `BufferGeometry`: clonar aqui não gasta
     número do `Math.random` seedado, e a ordem de consumo do worldgen fica
     intacta. */
  const _ref = player.pos.clone(), _cab = player.pos.clone();
  function alcanceDe() {
    const c = cabecaXR ? cabecaXR(_cab) : null;
    return pontoDeAlcance(_ref, player.pos, c, foraXR ? foraXR() : undefined);
  }

  function current() {
    if (state.flying) return { txt: 'SAIR DO HELICÓPTERO', fn: () => Heli.exit() };
    if (state.driving) return { txt: 'SAIR DO VEÍCULO', fn: tryToggleCar };
    /* UMA leitura da régua por frame, e ela vale para TODOS os alvos: dois
       pontos de medida diferentes fariam o aviso citar um alvo e a ação
       resolver outro. */
    const P = alcanceDe();
    // Canhão de Circo: vale no solo E no BR (a pé, longe de veículo/baú)
    const cannon = getCannon && getCannon();
    if (cannon) { const cp = cannon.prompt(P); if (cp) return cp; }
    const toys = getMapToys && getMapToys();
    if (toys) { const tp = toys.prompt(P); if (tp) return tp; }
    // Segredos (estojo do ninho, cofre lacrado): o próprio módulo já se
    // fecha no BR — desbloqueio de arma é SOLO, igual à bazuca abaixo.
    const secrets = getSecrets && getSecrets();
    if (secrets) { const sp = secrets.prompt(P); if (sp) return sp; }
    if (!window.__BR_active) { // BR: sem baú de guardar, sem bazuca grátis (loot vem dos baús BR)
      const bz = Structures.bazookaSpot;
      if (arsenal[3].locked && Math.hypot(P.x - bz.x, P.z - bz.z) < 2.8 && Math.abs(P.y - bz.y) < 3.5)
        return { txt: 'PEGAR BAZUCA', fn: () => unlockWeapon(3, 'tecla 4 para equipar') };
      for (const s of Structures.chestSpots)
        if (Math.hypot(P.x - s.x, P.z - s.z) < 2.4) return { txt: 'USAR BAÚ', fn: chestSwap };
    }
    if (P.distanceTo(Heli.group.position) < 5) return { txt: 'PILOTAR HELICÓPTERO', fn: tryToggleCar };
    const near = Car.nearest(P);
    if (near.d < 4.5) return { txt: 'ENTRAR — ' + near.v.cfg.name, fn: tryToggleCar };
    return null;
  }
  /* o texto do prompt muda quando o jogador troca de alvo, não a 60 Hz —
     reescrever innerHTML todo frame era um parse de HTML por frame */
  let promptTxt = null, promptOpacity = null;
  function setPrompt(txt) {
    if (txt !== null && txt !== promptTxt) {
      ui.prompt.innerHTML = `<b>${NAMES.use}</b> &nbsp;${txt}`;
      promptTxt = txt;
    }
    const op = txt === null ? '0' : '1';
    if (op !== promptOpacity) { ui.prompt.style.opacity = op; promptOpacity = op; }
  }
  function update(dt, t) {
    // BR: na nave/queda/espectador (freeze) não existe interação com o mundo
    if (window.__BR_freeze) { setPrompt(null); return; }
    const c = current();
    setPrompt(c ? c.txt : null);
    if (c && justPressed.has('KeyE') && !player.dead) c.fn();
  }
  function renderInv() {
    ui.invList.innerHTML =
      `<div class="invRow"><span>✚ Kit médico × ${inventory.medkits}</span><span class="k">${NAMES.med}</span></div>
       <div class="invRow"><span>● Granada × ${inventory.nades}</span><span class="k">${NAMES.nade}</span></div>
       <div class="invRow"><span>🍖 Carne × ${inventory.meat}</span><span class="k">${NAMES.eat}</span></div>
       <div class="invRow"><span>🛡 Armadura ${Math.round(player.armor)}/${player.armorMax}</span><span class="k">do COLOSSO</span></div>
       <div class="invRow"><span>Arsenal ${arsenal.filter(w => !w.locked).length}/5</span><span class="k">${NAMES.sight}</span></div>
       <div class="invRow"><span>Baú: ${chest.medkits}✚ ${chest.nades}● ${chest.meat}🍖</span><span class="k">guarde em baús</span></div>`;
  }
  /* leitura pura para QA: DE ONDE este módulo mediu neste instante. Sem isto
     não há como verificar de fora que a fiação de VR chegou — e "o teste mede
     o dublê" foi o defeito mais caro desta base. */
  const alcance = () => alcanceDe().toArray();

  return { update, renderInv, chest, alcance };
}
