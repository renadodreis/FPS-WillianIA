/* ================================================================
   SEGREDOS DO MAPA 🗝️ — três recompensas para quem explora.

   FACA "AURORA" (5), SNIPER "AGULHA" (6) e ESCOPETA "RAJADA" (7)
   nasciam `locked: true` sem NENHUMA fonte de desbloqueio no solo
   (js/weapons.js). Aqui cada uma vira prêmio de um segredo:

     🎯 NINHO DO ATIRADOR → SNIPER. Estojo no tampo da torre de vigia
        mais distante do mapa. Pista: feixe vermelho + lanterna acesa.
        Só existe porque a torre virou subível (js/watchtower.js).
     🔒 COFRE LACRADO → ESCOPETA. Caixa de aço no térreo oco mais fundo
        da cidade; o cadeado é ALVO — atire nele e a tampa abre.
        Pista: a porta acesa do prédio + o cadeado brilhando.
     🎼 A MELODIA → FACA. A tábua ao lado do Xilofone Gigante mostra
        cinco quadrados coloridos; pise nas placas nessa ordem.

   REDE: desbloqueio de arma é SOLO. No BR o arsenal vem dos baús, e
   `js/interact.js` já trata o resto assim (a bazuca do heliponto está
   atrás do mesmo `!window.__BR_active`). Nada aqui fala com o servidor,
   nada aqui muda colisão que o outro jogador não veja — o cadeado é
   alvo do CLIENTE, como os alvos do campo de tiro.

   RNG: tudo criado em noSeed (padrão de js/cannon.js) e instanciado no
   FIM do init, depois de Grass.refreshAll() — geometria não pode
   deslocar o Math.random seedado do worldgen.
   ================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MELODY, SECRETS, pickNestTower, pickVaultInterior, createMelodyTracker } from './secrets-core.js';
import { criarFarol } from './farbeacon.js';

const RAINBOW = [0xff5d5d, 0xffa23a, 0xffe14a, 0x8ce65a, 0x53c7ff, 0x7b7bff, 0xff8ad4, 0xffffff];
const _a = new THREE.Vector3();

export function createSecrets(deps) {
  const {
    scene, player, SFX, FX, csmMat, Structures, heightAt, CITY,
    centerMsg, showBanner, extraTargets, arsenal, unlockWeapon, state, MapToys, platforms,
    addStaticBox, // (x,y,z,hx,hy,hz,sourceId) => cria corpo CANNON estático urbano
  } = deps;

  /* todos os props dos segredos moram num grupo só: QA de perf liga/desliga
     tudo de uma vez, e a cena não ganha filho solto (cada mesh continua com
     frustum culling individual — o grupo não soma draw call). */
  const root = new THREE.Group(); root.name = 'secrets';
  scene.add(root);

  let _us = 0x5EC2E7 >>> 0;
  const noSeed = (fn) => {
    const _R = Math.random;
    Math.random = () => (_us = (_us * 1664525 + 1013904223) >>> 0) / 4294967296;
    try { return fn(); } finally { Math.random = _R; }
  };
  const solo = () => !window.__BR_active;
  const mat = (hex, o = {}) => csmMat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, ...o }));
  const glow = (hex, i = 1.4) => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: i, roughness: 0.4 });

  const marks = [];   // {x,z,color} — radar do minimapa (game.js: ToysRadar)
  const taken = { ninho: false, cofre: false, melodia: false };
  const byId = Object.fromEntries(SECRETS.map(s => [s.id, s]));

  function reward(id) {
    if (taken[id] || !solo()) return;
    const sec = byId[id];
    if (!arsenal[sec.weapon] || !arsenal[sec.weapon].locked) { taken[id] = true; return; }
    taken[id] = true;
    unlockWeapon(sec.weapon, `segredo: ${sec.name}`);
    if (SFX.unlock) SFX.unlock();
  }

  /* feixe vertical fino: o padrão de findability da casa (js/maptoys.js).
     fog:false porque a névoa lavava a cor e o feixe sumia de longe — e
     js/farbeacon.js completa o serviço: passe único (aditivo não precisa
     do segundo passe do DoubleSide) e z de clip preso no far, para o
     feixe não sumir se alguém encurtar o `camera.far`. */
  function beam(x, y, z, color, h = 40) {
    root.add(criarFarol([{ x, y, z, cor: color, altura: h, raioTopo: 0.35, raioBase: 0.8 }],
      { opacidade: 0.26, nome: 'farolSegredo' }));
  }

  // ===================================================================== //
  // 🎯 NINHO DO ATIRADOR — tampo da torre mais distante                    //
  // ===================================================================== //
  const nest = { pos: null, box: null };
  noSeed(() => {
    const t = pickNestTower(Structures.sites);
    if (!t) return;
    // o tampo já é plataforma desde js/watchtower.js — pega a altura dela
    const deck = platforms.find(p => p.role === 'deck' &&
      Math.abs((p.x0 + p.x1) / 2 - t.x) < 0.01 && Math.abs((p.z0 + p.z1) / 2 - t.z) < 0.01);
    const y = deck ? deck.y : heightAt(t.x, t.z) + 6.34;
    nest.pos = { x: t.x - 1.0, y, z: t.z - 1.0 };
    const g = new THREE.Group();
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.5), mat(0x2b3038, { metalness: 0.4 }));
    caixa.position.set(0, 0.21, 0); caixa.castShadow = true; g.add(caixa);
    // travas douradas: 2 caixas estáticas do mesmo material → 1 mesh
    const trG = [-0.5, 0.5].map(sx => {
      const t2 = new THREE.BoxGeometry(0.14, 0.12, 0.54); t2.translate(sx, 0.2, 0); return t2;
    });
    g.add(new THREE.Mesh(mergeGeometries(trG), mat(0xf2c14e, { metalness: 0.8, roughness: 0.3 })));
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(0xff3b30, 2.6));
    lant.position.set(0.95, 0.5, 0); g.add(lant);
    nest.box = g;
    g.position.set(nest.pos.x, nest.pos.y, nest.pos.z);
    root.add(g);
    // o feixe começa ACIMA do telhado cônico (topo ~deck+2,5): nascendo no
    // nível do tampo, quem subia ficava DENTRO dele e a varanda inteira
    // virava névoa vermelha — o miradouro perdia justamente a visão
    beam(t.x, y + 3.2, t.z, 0xff3b30, 32);
    marks.push({ x: t.x, z: t.z, color: 0xff3b30, kind: 'segredo' });
  });

  // ===================================================================== //
  // 🔒 COFRE LACRADO — térreo oco mais fundo da cidade                     //
  // ===================================================================== //
  const vault = { pos: null, lid: null, open: false, lock: null, lockMesh: null, hinted: false, room: null };
  noSeed(() => {
    const it = pickVaultInterior(Structures.cityInteriors, { x: CITY.x, z: CITY.z });
    if (!it) return;
    vault.room = it;
    // canto da sala oposto ao balcão central: fica visível da porta, mas
    // exige entrar de verdade (a sala tem cobertura no meio)
    const px = it.bx + (it.lot.w / 2 - 1.6) * (it.lot.ox >= 0 ? -1 : 1);
    const pz = it.bz + (it.d / 2 - 1.6) * (it.lot.oz >= 0 ? -1 : 1);
    vault.pos = { x: px, y: it.gy, z: pz };
    /* O COFRE É URBANO: nasce dentro de um térreo da cidade e o colisor dele
       já vai marcado `city: true`. O visual, porém, morava no grupo `secrets`
       solto na cena — no ataque de mísseis o colisor sumia e a caixa de aço
       continuava de pé no meio dos escombros: atravessável e ainda clicável a
       bala. Grupo próprio registrado em Structures.city faz visual e colisão
       sumirem juntos (e voltarem juntos no restore). */
    const cofre = new THREE.Group(); cofre.name = 'segredo-cofre';
    root.add(cofre);
    if (Structures.city && Structures.city.registerVisual) Structures.city.registerVisual(cofre);
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), mat(0x3c4653, { metalness: 0.55, roughness: 0.4 }));
    corpo.position.set(px, it.gy + 0.45, pz); corpo.castShadow = true; cofre.add(corpo);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.0), mat(0x545f6d, { metalness: 0.55, roughness: 0.4 }));
    lid.position.set(px, it.gy + 0.97, pz); cofre.add(lid);
    vault.lid = lid;
    /* CADEADO virado pro miolo da sala: quem entra pela porta tem que ver o
       alvo. Deitado no topo da caixa (primeira tentativa) ele sumia — na
       captura virava um risquinho amarelo na quina. */
    let nx = it.bx - px, nz = it.bz - pz;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const lock = new THREE.Group();
    // arco + corpo num mesh só (mesmo material): 1 draw call e o cadeado
    // INTEIRO pulsa — antes só o arco pulsava e o corpo ficava apagado
    const arcoG = new THREE.TorusGeometry(0.13, 0.042, 8, 14); arcoG.translate(0, 0.13, 0);
    const arco = new THREE.Mesh(mergeGeometries([arcoG, new THREE.BoxGeometry(0.3, 0.32, 0.12)]),
      glow(0xffd24a, 2.2));
    lock.add(arco);
    lock.position.set(px + nx * 0.62, it.gy + 0.55, pz + nz * 0.62);
    lock.lookAt(lock.position.x + nx, lock.position.y, lock.position.z + nz);
    cofre.add(lock);
    vault.lockMesh = arco;
    vault.lockGroup = lock;
    // colisor da caixa: cobertura de verdade dentro da sala. `city: true` +
    // registro do corpo CANNON = some junto no evento de destruição, igual
    // ao resto do urbano (sem o corpo, o CARRO atravessaria).
    Structures.walls.push({ x0: px - 0.75, x1: px + 0.75, y0: it.gy, y1: it.gy + 1.04,
      z0: pz - 0.5, z1: pz + 0.5, city: true });
    Structures.invalidateWallCache();
    if (addStaticBox) addStaticBox(px, it.gy + 0.52, pz, 0.75, 0.52, 0.5, 'secret-vault');
    // O CADEADO É ALVO — mesmo contrato dos alvos do campo de tiro
    // (js/maptoys.js). Cliente puro: nada disso passa pelo servidor.
    let alvoLigado = true;
    vault.lock = {
      alive: true,
      /* alvo só existe enquanto o cofre existe: com a cidade destruída o
         grupo fica invisível e o cadeado para de aceitar tiro (game.js:1814 e
         br-game.js:474 respeitam `enabled === false`). */
      get enabled() { return alvoLigado && cofre.visible; },
      set enabled(v) { alvoLigado = v; },
      hitSpheres() { return [{ c: lock.position, r: 0.38, part: 'body' }]; },
      pos() { return lock.position; },
      damage() {
        if (!vault.lock.alive) return false;
        vault.lock.alive = false; vault.lock.enabled = false;
        vault.open = true;
        lock.visible = false;
        vault.lockGroup = null;
        lid.rotation.x = -0.95; lid.position.y = it.gy + 1.12; lid.position.z = pz - 0.42;
        _a.set(px, it.gy + 1.1, pz); FX.confetti(_a, 12);
        if (SFX.pop) SFX.pop(_a);
        if (centerMsg) centerMsg('🔓 O cofre abriu — [E] para pegar', 3000);
        return true;
      },
    };
    extraTargets.push(vault.lock);
    marks.push({ x: px, z: pz, color: 0xffd24a, kind: 'segredo' });
  });

  // ===================================================================== //
  // 🎼 A MELODIA — tábua de pistas ao lado do Xilofone Gigante             //
  // ===================================================================== //
  const song = { tracker: createMelodyTracker(), spot: null, dots: [], prevPlate: -1, hinted: false };
  noSeed(() => {
    const xs = MapToys && MapToys.spots && MapToys.spots.xylo;
    if (!xs) return;
    // a tábua fica na cabeceira das placas, encarando quem chega
    const bx = xs.x - 8.2, bz = xs.z + 2.6, by = heightAt(bx, bz);
    song.spot = { x: bx, y: by, z: bz };
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), mat(0x6b5a3a));
    poste.position.set(bx, by + 0.75, bz); poste.castShadow = true; root.add(poste);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.05, 0.16), mat(0x2b2b33, { roughness: 0.8 }));
    tab.position.set(bx, by + 1.75, bz); tab.castShadow = true; root.add(tab);
    // cinco quadrados nas MESMAS cores das placas, na ordem da melodia
    MELODY.forEach((plate, i) => {
      const q = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.06), glow(RAINBOW[plate], 0.9));
      q.position.set(bx - 1.12 + i * 0.56, by + 1.86, bz + 0.11);
      root.add(q);
      song.dots.push(q);
    });
    // numerinhos de ordem: barrinhas embaixo de cada quadrado (1..5).
    // São 15 caixinhas ESTÁTICAS do mesmo material: mescladas num mesh só
    // (padrão do repo) — 15 caixas soltas eram 15 draw calls de graça.
    const barras = [];
    MELODY.forEach((_, i) => {
      for (let k = 0; k <= i; k++) {
        const g2 = new THREE.BoxGeometry(0.05, 0.14, 0.05);
        g2.translate(bx - 1.12 + i * 0.56 - 0.14 + k * 0.07, by + 1.5, bz + 0.11);
        barras.push(g2);
      }
    });
    root.add(new THREE.Mesh(mergeGeometries(barras), glow(0xffffff, 0.5)));
    marks.push({ x: bx, z: bz, color: 0xffe14a, kind: 'segredo' });
  });

  // ===================================================================== //
  // atualização                                                           //
  // ===================================================================== //
  let pulse = 0;
  function update(dt) {
    if (window.__BR_freeze) return;
    pulse += dt;
    if (vault.lockMesh && vault.lock && vault.lock.alive)
      vault.lockMesh.material.emissiveIntensity = 1.6 + Math.sin(pulse * 3) * 0.7;

    // dica ao entrar na sala do cofre pela primeira vez
    if (solo() && vault.room && !vault.hinted && arsenal[7] && arsenal[7].locked) {
      const r = vault.room;
      if (Math.abs(player.pos.x - r.bx) < r.lot.w / 2 && Math.abs(player.pos.z - r.bz) < r.d / 2 &&
          Math.abs(player.pos.y - r.gy) < 4) {
        vault.hinted = true;
        if (centerMsg) centerMsg('🔒 Um cofre lacrado. O cadeado parece frágil…', 3200);
      }
    }

    // melodia: observa a troca de placa do xilofone (js/maptoys.js)
    if (solo() && song.spot && MapToys && arsenal[5] && arsenal[5].locked) {
      const p = MapToys.lastPlate;
      if (p >= 0 && p !== song.prevPlate) {
        const r = song.tracker.step(p);
        for (let i = 0; i < song.dots.length; i++)
          song.dots[i].material.emissiveIntensity = i < song.tracker.progress ? 2.4 : 0.9;
        if (r.solved) {
          _a.set(song.spot.x, song.spot.y + 2.2, song.spot.z);
          FX.confetti(_a, 26);
          if (showBanner) showBanner('🎼 A MELODIA CERTA<small>o santuário se abre</small>', 2600);
          reward('melodia');
          for (const dt2 of song.dots) dt2.material.emissiveIntensity = 2.4;
        } else if (r.hit && SFX.ding) {
          SFX.ding(_a.set(song.spot.x, song.spot.y + 1.8, song.spot.z));
        }
      }
      if (!song.hinted && Math.hypot(player.pos.x - song.spot.x, player.pos.z - song.spot.z) < 14) {
        song.hinted = true;
        if (centerMsg) centerMsg('🎼 Cinco cores na tábua. As placas têm as mesmas.', 3400);
      }
      song.prevPlate = p;
    }
  }

  /* prompt de [E] — roteado por js/interact.js, igual canhão/atrações */
  function prompt(pos) {
    if (!solo() || state.driving || state.flying) return null;
    if (nest.pos && !taken.ninho && arsenal[6] && arsenal[6].locked &&
        Math.hypot(pos.x - nest.pos.x, pos.z - nest.pos.z) < 2.2 && Math.abs(pos.y - nest.pos.y) < 3)
      return { txt: 'ABRIR O ESTOJO 🎯', fn: () => {
        if (nest.box) nest.box.children[0].position.y = 0.1;
        reward('ninho');
      } };
    if (vault.pos && vault.open && !taken.cofre && arsenal[7] && arsenal[7].locked &&
        Math.hypot(pos.x - vault.pos.x, pos.z - vault.pos.z) < 2.4 && Math.abs(pos.y - vault.pos.y) < 3)
      return { txt: 'SAQUEAR O COFRE 🔒', fn: () => reward('cofre') };
    return null;
  }

  return {
    update, prompt,
    get marks() { return marks.slice(); },
    // hooks de QA
    get nest() { return nest.pos; },
    get vault() { return vault.pos ? { ...vault.pos, open: vault.open, alive: !!(vault.lock && vault.lock.alive) } : null; },
    get tablet() { return song.spot; },
    get melody() { return MELODY.slice(); },
    get progress() { return song.tracker.progress; },
    get taken() { return { ...taken }; },
    playNote(i) { // QA: simula pisar numa placa sem depender do passo físico
      const r = song.tracker.step(i);
      if (r.solved) reward('melodia');
      return r;
    },
    breakLock() { return vault.lock ? vault.lock.damage() : false; }, // QA
  };
}
