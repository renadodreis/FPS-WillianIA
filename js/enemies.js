/* IA dos soldados inimigos (FSM patrulha/persegue/ataca) — extraído de game.js; deps explícitas */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fuseBody } from './meshutils.js';
import { meleeBlocked, noHelicoptero, primeiroObstaculo, linhaLivre } from './aihelpers.js';

export function createEnemies(deps) {
  const { Chars, state = null } = deps;
  const { CFG, clamp, lerp, damp, rand, TAU, _v1, _v2, heightAt, slopeAt, terrainNormal, WATER_LEVEL, obstaclesNear, SFX, FX, scene, csmMat, Structures, addScore, addKillFeed, player, playerDamage, addTrauma, Car, Pickups, knuckleMat, lastShotInfo } = deps;
  // dois esquadrões: padrão (verde-oliva) e pesado (cinza-escuro com detalhe laranja)
  const clothG  = csmMat(new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.75, metalness: 0.05 }));
  const clothH  = csmMat(new THREE.MeshStandardMaterial({ color: 0x363b46, roughness: 0.7, metalness: 0.1 }));
  const armorG  = csmMat(new THREE.MeshStandardMaterial({ color: 0x59626f, roughness: 0.45, metalness: 0.45 }));
  const armorH  = csmMat(new THREE.MeshStandardMaterial({ color: 0x272b34, roughness: 0.4, metalness: 0.55 }));
  const trimH   = csmMat(new THREE.MeshStandardMaterial({ color: 0x9c5018, roughness: 0.5, metalness: 0.3 }));
  const jointMat = csmMat(new THREE.MeshStandardMaterial({ color: 0x22252d, roughness: 0.6, metalness: 0.3 }));
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x200505, emissive: 0xff2417, emissiveIntensity: 2.8, roughness: 0.3 });
  const gunMat   = csmMat(new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.5 }));

  const suitMat  = csmMat(new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.55, metalness: 0.1 }));
  const shirtMat = csmMat(new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.7 }));
  const tieMat   = csmMat(new THREE.MeshStandardMaterial({ color: 0x8a1620, roughness: 0.6 }));
  const skinMat  = csmMat(new THREE.MeshStandardMaterial({ color: 0xc9a182, roughness: 0.75 }));
  /* 28 inimigos, 3 receitas de corpo: a geometria fundida é compartilhada
     (esqueleto e esfera continuam por boneco). Ver fuseBody(). */
  const bodyCache = new Map();
  function buildBody(heavy, suit) {
    const cloth = suit ? suitMat : heavy ? clothH : clothG;
    const armor = suit ? suitMat : heavy ? armorH : armorG;
    const g = new THREE.Group();
    const cast = m => { m.castShadow = true; return m; };
    /* Os membros eram Group e viraram Bone: mesmo Object3D, mesmo consumo de
       UUID (contrato do Math.random seedado intacto) e as MESMAS rotações lidas
       pelo FSM lá embaixo. A diferença é que agora o membro pode ser um osso da
       fusão em vez de um galho da cena — ver fuseBody() em js/meshutils.js. */
    const parts = { armL: new THREE.Bone(), armR: new THREE.Bone(), legL: new THREE.Bone(), legR: new THREE.Bone(), head: new THREE.Bone() };

    // tronco
    const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.52, 6, 14), cloth));
    torso.position.y = 1.12; g.add(torso);
    if (suit) { // paletó aberto: camisa branca + gravata
      const shirt = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.46, 0.1, 1, 0.03), shirtMat);
      shirt.position.set(0, 1.22, 0.26); g.add(shirt);
      const tie = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.34, 0.04, 1, 0.015), tieMat);
      tie.position.set(0, 1.18, 0.31); tie.rotation.x = 0.06; g.add(tie);
    } else {
      const vest = cast(new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.52, 0.42, 2, 0.1), armor));
      vest.position.set(0, 1.22, 0.02); g.add(vest);
      for (let i = 0; i < 3; i++) {
        const pk = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.14, 0.06, 1, 0.02), jointMat);
        pk.position.set(-0.14 + i * 0.14, 1.1, 0.25); g.add(pk);
      }
      const pack = cast(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.46, 0.2, 2, 0.06), heavy ? trimH : jointMat));
      pack.position.set(0, 1.3, -0.3); g.add(pack);
    }
    const belt = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.4, 2, 0.04), jointMat);
    belt.position.set(0, 0.88, 0); g.add(belt);

    // cabeça articulada
    parts.head.position.y = 1.78;
    const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), suit ? skinMat : jointMat));
    parts.head.add(skull);
    if (suit) { // cabelo + óculos escuros
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10, 0, TAU, 0, Math.PI * 0.5), suitMat);
      hair.position.y = 0.05; parts.head.add(hair);
      const shades = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.07, 0.1, 1, 0.02), knuckleMat);
      shades.position.set(0, 0.03, 0.19); parts.head.add(shades);
    } else {
      const helmet = cast(new THREE.Mesh(new THREE.SphereGeometry(0.285, 16, 12, 0, TAU, 0, Math.PI * 0.58), armor));
      helmet.position.y = 0.04; parts.head.add(helmet);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), armor);
      brim.rotation.x = Math.PI / 2; brim.position.y = 0.03; parts.head.add(brim);
      const visor = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.09, 0.12, 1, 0.03), visorMat);
      visor.position.set(0, 0.0, 0.2); parts.head.add(visor);
      if (heavy) {
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), trimH);
        crest.position.y = 0.36; parts.head.add(crest);
      }
    }
    g.add(parts.head);

    // braços: ombreira + braço + cotovelo + antebraço dobrado + mão
    for (const [k, s] of [['armL', -1], ['armR', 1]]) {
      const p = parts[k];
      p.position.set(s * 0.42, 1.5, 0);
      const pad = cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9), armor));
      pad.scale.y = 0.85; p.add(pad);
      const upper = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.26, 5, 10), cloth));
      upper.position.y = -0.22; p.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), jointMat);
      elbow.position.y = -0.4; p.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.24, 5, 10), jointMat);
      fore.position.set(0, -0.56, 0.07); fore.rotation.x = -0.28; p.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), jointMat);
      hand.position.set(0, -0.7, 0.14); p.add(hand);
      g.add(p);
    }
    // pernas: coxa + joelheira + canela + bota
    for (const [k, s] of [['legL', -1], ['legR', 1]]) {
      const p = parts[k];
      p.position.set(s * 0.17, 0.82, 0);
      p.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), jointMat));
      const thigh = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.26, 5, 10), cloth));
      thigh.position.y = -0.2; p.add(thigh);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), armor);
      knee.position.set(0, -0.38, 0.03); p.add(knee);
      const shin = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.24, 5, 10), jointMat));
      shin.position.y = -0.56; p.add(shin);
      const boot = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.12, 0.3, 1, 0.04), jointMat);
      boot.position.set(0, -0.74, 0.06); p.add(boot);
      g.add(p);
    }
    // arma do inimigo: receiver + cano + carregador + coronha
    const w = new THREE.Group();
    w.position.set(0.02, -0.62, 0.22);
    const recv = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, 0.4, 1, 0.02), gunMat); w.add(recv);
    const barr = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), gunMat);
    barr.rotation.x = Math.PI / 2; barr.position.set(0, 0.02, 0.32); w.add(barr);
    const mg = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.14, 0.07, 1, 0.02), gunMat);
    mg.position.set(0, -0.1, 0.05); mg.rotation.x = -0.15; w.add(mg);
    const stk = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.07, 0.16, 1, 0.02), gunMat);
    stk.position.set(0, -0.01, -0.26); w.add(stk);
    parts.armR.add(w);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.set(0.02, -0.62, 0.72); parts.armR.add(flash);
    // opacidade 0 NÃO evita a draw call: o plano só existe nos 60 ms do tiro
    flash.visible = false;

    /* PERF: até aqui o boneco são ~32 (executivo) a 38 (soldado) meshes soltos,
       ou seja, uma draw call cada. Medido no viewport de celular, os 8
       executivos da Torre Nexus custavam 256 das 560 draw calls do frame.
       fuseBody junta tudo em 7–9 malhas — uma por (material, castShadow) —
       usando os membros como ossos rígidos. Material, cor, sombra e pose ficam
       idênticos; o flash fica de fora porque tem material próprio e é ligado/
       desligado no tiro. O corpo tem que estar na origem e em repouso aqui,
       que é onde o esqueleto tira as inversas. */
    const { skeleton } = fuseBody(g, {
      bones: [g, parts.head, parts.armL, parts.armR, parts.legL, parts.legR],
      keep: [flash],
      cache: bodyCache, cacheKey: suit ? 'executivo' : heavy ? 'pesado' : 'padrao',
    });
    return { g, parts, flash, skeleton };
  }

  /* LINHA DE VISÃO e LINHA DE TIRO são a mesma regra da bala do jogador:
     parede, chão e tronco (js/aihelpers.js:primeiroObstaculo). Antes a visão
     só olhava parede + 11 amostras de chão, e o TIRO não olhava nada: saía
     sempre que o soldado "via" — e ele via o OLHO de quem estava em pé (1,5 m)
     mesmo com o jogador agachado atrás de um caixote de 1,4 m, e mandava a
     bala no PEITO agachado (0,95 m), através do caixote (80 de dano medido,
     test/pve-parede.test.js). */
  const mundo = { Structures, heightAt, obstaclesNear };
  const hasLOS = (from, to) => linhaLivre(from, to, mundo);
  // o jogador está ao alcance do PvE? (morto não; no helicóptero não — ver aihelpers)
  const alcancavel = () => !player.dead && !noHelicoptero(state);
  /* onde fica a CABEÇA e o PEITO de verdade: o olho segue a câmera de
     game.js (lerp(1,62; 1,04; agachar)); o peito é o alvo de sempre do tiro */
  const olhoDoJogador = out => { out.copy(player.pos); out.y += lerp(1.62, 1.04, player.crouchT || 0); return out; };
  const peitoDoJogador = out => { out.copy(player.pos); out.y += lerp(1.5, 0.95, player.crouchT || 0); return out; };
  // temporários PRÓPRIOS: o `_v3` de game.js era o olho do jogador E o fim do
  // traçante de um tiro errado — o erro de um soldado virava a "visão" do
  // próximo da lista (o de trás da parede passava a ver o jogador)
  const _pOlho = new THREE.Vector3(), _eOlho = new THREE.Vector3(), _eFim = new THREE.Vector3(),
    _eV = new THREE.Vector3(), _eN = new THREE.Vector3();

  /* raio em que o soldado OUVE o tiro do jogador (sentidos, lá embaixo) — e
     por isso também o raio da briga: posto não renasce dentro dele */
  const OUVIDO = 75;

  /* ================================================================
     O ANDAR DO POSTO É A LAJE DELE (executivos da Torre Nexus).
     O executivo não usa escada: anda no piso `plan.floorY`. Antes a
     altura era `max(terreno, floorY)` e o x/z era livre — perseguindo
     quem estava na escada ele saía da laje e entrava no POÇO, parado no
     ar sobre o lance que desce ou enterrado no que sobe (medido: 844
     quadros fora da laje em 5 sorteios, test/torre-seguranca.test.js), e
     de lá atirava para baixo por entre os degraus. As lajes do andar são
     as caixas `noCollide` de js/paredes.js com topo no piso do posto; sem
     nenhuma (a cidade caiu), vale o terreno.
     ================================================================ */
  function lajesDoPosto(e) {
    if (!e.plan || e.plan.floorY === undefined) return null;
    const walls = Structures.walls;
    if (!walls) return null;
    if (e._lajesN !== walls.length || e._lajesU !== walls[walls.length - 1]) {
      e._lajes = walls.filter(b => b.noCollide && Math.abs(b.y1 - e.plan.floorY) < 1e-3);
      e._lajesN = walls.length; e._lajesU = walls[walls.length - 1];
    }
    return e._lajes;
  }
  const sobre = (lajes, x, z) => {
    for (let i = 0; i < lajes.length; i++) {
      const b = lajes[i];
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    }
    return false;
  };
  /* devolve o corpo à laje se o passo deste quadro o tirou dela (desliza
     no eixo que ainda cabe); `true` = ele está na laje do posto. Quem já
     estava fora dela (a cidade caiu, ou um cenário sem a laje dele) não é
     preso: segue a regra antiga, `pisoDe` abaixo. */
  function prenderNaLaje(e, px, pz) {
    const lajes = lajesDoPosto(e);
    if (!lajes || !lajes.length) return false;
    const p = e.group.position;
    if (sobre(lajes, p.x, p.z)) return true;
    if (!sobre(lajes, px, pz)) return false;
    if (sobre(lajes, px, p.z)) { p.x = px; e.ragVel.x = 0; }
    else if (sobre(lajes, p.x, pz)) { p.z = pz; e.ragVel.z = 0; }
    else { p.x = px; p.z = pz; e.ragVel.x = 0; e.ragVel.z = 0; }
    return true;
  }
  // piso sob o corpo: a laje do posto (se está nela); fora dela, o de sempre
  function pisoDe(e, naLaje) {
    const h = heightAt(e.group.position.x, e.group.position.z);
    if (!e.plan || e.plan.floorY === undefined) return h;
    return naLaje ? e.plan.floorY : Math.max(h, e.plan.floorY);
  }

  /* ================================================================
     POSTO NÃO RENASCE À VISTA. O inimigo de posto (executivo da torre,
     guarda da base) voltava em 7–12 s NO MESMO PONTO — medido no jogo: a
     9,18 m do jogador, com a linha de visada livre. Para quem estava ali
     isso é "ele não morre". A regra é a do diretor do Left 4 Dead
     (Michael Booth, "The AI Systems of Left 4 Dead", Valve, 2009): o
     nascimento procura "a spot near the Survivors, not visible to any of
     them" e os especiais usam "valid area in the AAS not visible by the
     Survivor team". Aqui: o relógio de 7–12 s continua, mas só vale com
     o posto E o corpo fora da vista do jogador e ele fora do raio da briga
     (OUVIDO). Até lá o corpo fica onde caiu. O soldado sem posto nasce
     sorteado a mais de 45 m e segue o ciclo de sempre.
     ================================================================ */
  const _post = new THREE.Vector3(), _corpo = new THREE.Vector3();
  const VISTA = CFG.VIEW_DIST || Infinity; // além da névoa nada é desenhado
  const avista = (olho, p) => olho.distanceTo(p) < VISTA && hasLOS(olho, p);
  function podeRenascer(e) {
    if (!e.plan) return true;
    const olho = olhoDoJogador(_pOlho);
    const py = e.plan.floorY !== undefined ? e.plan.floorY : heightAt(e.plan.x, e.plan.z);
    _post.set(e.plan.x, py + 1.5, e.plan.z);
    if (olho.distanceTo(_post) < OUVIDO) return false;
    if (avista(olho, _post)) return false;
    _corpo.copy(e.group.position); _corpo.y += 0.4;
    return !avista(olho, _corpo);
  }

  const NAMES = ['Sentinela', 'Vigia', 'Caçador', 'Lâmina', 'Falcão', 'Brutamontes'];
  const list = [];

  function randomSpawn() {
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU), r = rand(70, CFG.WORLD_SIZE * 0.42);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - player.pos.x, z - player.pos.z) > 45 && slopeAt(x, z) < 0.5 && heightAt(x, z) > WATER_LEVEL + 0.8) return { x, z };
    }
    return { x: 90, z: 90 };
  }

  /* C4 do critério AAA (docs/vr/criterio-aaa.md): humano ≈1,75 m, tolerância
     5%. O soldado comum/executivo nascia em scale 1, e `hitSpheres()` (mais
     abaixo) publica o topo da cabeça em 1,8+0,3 = 2,10 m nesse scale — 20%
     acima do alvo, sem justificativa de design escrita (diferente do
     `heavy`, que é grande de propósito — "Brutamontes"). `hitSpheres()` já
     multiplica tudo por `group.scale.y`, então corrigir o scale corrige
     malha e hitbox JUNTAS, sem dessincronizar uma da outra. 1,75/2,10 dá
     1,7500 m exato. */
  const HUMAN_SCALE = 1.75 / 2.1;

  function makeEnemy(idx, plan) {
    const heavy = !plan && idx % 4 === 3;
    const suit = !!(plan && plan.suit);
    const { g, parts, flash, skeleton } = buildBody(heavy, suit);
    // escala real fica em respawn() (chamado no fim deste construtor) — ele
    // sobrescreve qualquer scale posto aqui antes de existir `e`
    scene.add(g);
    const e = {
      id: idx,
      heavy, suit, plan: plan || null,
      maxHp: heavy ? 180 : suit ? 120 : 100,
      flinchT: 0,
      name: (suit ? 'Executivo' : plan && plan.army ? 'Soldado' : heavy ? 'Brutamontes' : NAMES[idx % NAMES.length]) + '-' + String(idx + 1).padStart(2, '0'),
      group: g, parts, flash, skeleton, // skeleton: hook de QA do corpo fundido
      alive: true, health: 100,
      fsm: 'PATRULHA',
      home: { x: 0, z: 0 }, waypoints: [], wpIdx: 0,
      yaw: rand(TAU), walkPhase: rand(TAU), speedF: 0,
      lastKnown: new THREE.Vector3(),
      // losT -99: com 0 o soldado "via" o jogador nos 0,25 s iniciais do relógio
      senseAcc: rand(0.15), losT: -99, alertT: 0,
      burstLeft: 0, nextBurst: rand(1, 2), nextShot: 0, flashT: 0,
      ragVel: new THREE.Vector3(), ragSpin: 0, deadT: 0, respawnT: 0,
      sphCache: [{ c: new THREE.Vector3(), r: 0.3, part: 'head' },
                 { c: new THREE.Vector3(), r: 0.43, part: 'body' },
                 { c: new THREE.Vector3(), r: 0.4, part: 'body' },
                 { c: new THREE.Vector3(), r: 0.36, part: 'body' }],
      hitSpheres() {
        const p = this.group.position, s = this.group.scale.y;
        this.sphCache[0].c.set(p.x, p.y + 1.8 * s, p.z);  this.sphCache[0].r = 0.3 * s;
        this.sphCache[1].c.set(p.x, p.y + 1.22 * s, p.z); this.sphCache[1].r = 0.43 * s;
        this.sphCache[2].c.set(p.x, p.y + 0.78 * s, p.z); this.sphCache[2].r = 0.4 * s;
        this.sphCache[3].c.set(p.x, p.y + 0.36 * s, p.z); this.sphCache[3].r = 0.36 * s;
        return this.sphCache;
      },
      damage(dmg, hitPos, dir, head) {
        if (!this.alive) return false;
        this.health -= dmg;
        this.flinchT = 1; // reação de impacto
        // levar tiro acorda o inimigo
        this.lastKnown.copy(player.pos);
        if (this.fsm === 'PATRULHA' || this.fsm === 'ALERTA') this.fsm = 'PERSEGUIR';
        if (this.health <= 0) { this.die(dir, head ? 'na cabeça' : null); return true; }
        return false;
      },
      die(dir, headTag) {
        this.alive = false;
        this.fsm = 'MORTO';
        this.deadT = 0;
        if (this.mixer) this.mixer.timeScale = 0; // congela a pose no tombo
        this.respawnT = rand(7, 12);
        this.ragVel.set(dir.x, 0, dir.z).normalize().multiplyScalar(rand(5, 8));
        this.ragVel.y = rand(3, 4.6);
        this.ragSpin = rand(-1, 1) > 0 ? 1 : -1;
        addKillFeed(`<b>Você</b> ▸ ${this.name}${headTag ? ' <b>· ' + headTag + '</b>' : ''}`);
        addScore(headTag ? 150 : 100, true);
        if (Math.random() < 0.62) Pickups.drop(this.group.position, this.heavy);
      },
      respawn() {
        const s = this.plan ? { x: this.plan.x, z: this.plan.z } : randomSpawn();
        this.home = s;
        this.waypoints = [];
        const wr = this.plan ? [2.5, 5] : [9, 17];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + rand(0.6);
          this.waypoints.push({ x: s.x + Math.cos(a) * rand(wr[0], wr[1]), z: s.z + Math.sin(a) * rand(wr[0], wr[1]) });
        }
        const gy = this.plan && this.plan.floorY !== undefined ? this.plan.floorY : heightAt(s.x, s.z);
        this.group.position.set(s.x, gy, s.z);
        this.group.rotation.set(0, this.yaw, 0);
        this.group.scale.setScalar(this.heavy ? 1.16 : HUMAN_SCALE);
        this.health = this.maxHp;
        this.alive = true;
        this.fsm = 'PATRULHA';
        if (this.mixer) this.mixer.timeScale = 1;
      },
    };
    e.respawn();
    list.push(e);
    return e;
  }
  for (let i = 0; i < CFG.ENEMY_COUNT; i++) makeEnemy(i);
  for (const c of Structures.enemyCamps) makeEnemy(list.length, c); // torre + bases militares

  /* ---- pele nova: GUARDIÃO mutante rigado (Guardiao.glb, anims Punch/Shoot/Walk).
     Troca só o VISUAL: FSM, hitbox e balanceamento continuam idênticos.
     Executivos (suit) mantêm o corpo procedural — são civis, não mutantes. */
  if (Chars) Chars.character('/assets/models/Personagens/Guardiao.glb', { height: 1.92 })
    .then(mold => {
      for (const e of list) {
        if (e.suit) continue;
        const { root, mixer, actions, findNode } = mold.build();
        // esconde o boneco procedural, mas mantém os grupos (o FSM anima
        // parts.* e a lógica de mira/flash usa as âncoras)
        e.group.traverse(o => { if (o.isMesh) o.visible = false; });
        /* NOTA (comportamento PRÉ-EXISTENTE, não mexido nesta rodada): o
           traverse acima também apaga o plano do flash e nada o reacende — o
           inimigo com o GLB do Guardião nunca mostra fogo de cano. Marcar aqui
           impede que a troca de visibilidade nova (update) "conserte" isso por
           acidente e mude o visual sem pedido. */
        e.flashMuted = true;
        e.group.add(root);
        e.hasModel = true;
        e.mixer = mixer;
        e.actions = actions;
        if (actions.Walk) { actions.Walk.play(); actions.Walk.setEffectiveWeight(1); }
        if (actions.Shoot) { actions.Shoot.setLoop(THREE.LoopOnce, 1); actions.Shoot.clampWhenFinished = false; }
        if (actions.Punch) { actions.Punch.setLoop(THREE.LoopOnce, 1); }
        const barrel = findNode('MuzzleFlash') || findNode('GunBarrel');
        if (barrel && e.flash) { barrel.add(e.flash); e.flash.position.set(0, 0, 0); }
        e.nextMelee = 0;
      }
    })
    .catch(err => console.error('Guardião GLB falhou — inimigos seguem procedurais:', err));

  /* tiro do inimigo: hitscan com spread, tracer e chance de errar */
  const _eFrom = new THREE.Vector3(), _eTo = new THREE.Vector3(), _eDir = new THREE.Vector3();
  function enemyFire(e) {
    e.flashT = 0.06;
    if (e.actions && e.actions.Shoot) e.actions.Shoot.reset().play();
    _eFrom.copy(e.group.position); _eFrom.y += 1.45 * e.group.scale.y;
    SFX.enemyShot(_eFrom); // som sai do cano: dá pra achar de onde levou tiro
    // mira no peito; se o peito está coberto e a cabeça não (quem espia por
    // cima da cobertura), mira na cabeça
    peitoDoJogador(_eTo);
    if (!hasLOS(_eFrom, _eTo)) olhoDoJogador(_eTo);
    _eDir.copy(_eTo).sub(_eFrom).normalize();
    _eDir.x += rand(-0.045, 0.045); _eDir.y += rand(-0.03, 0.03); _eDir.z += rand(-0.045, 0.045);
    _eDir.normalize();
    // aproximação mais próxima do raio ao alvo
    _eV.copy(_eTo).sub(_eFrom);
    const proj = Math.max(0, _eV.dot(_eDir));
    _eFim.copy(_eFrom).addScaledVector(_eDir, proj);
    const miss = _eFim.distanceTo(_eTo);
    const range = _eFrom.distanceTo(_eTo);
    const acerta = miss < 0.5 && alcancavel();
    const ate = acerta ? proj : range + rand(2, 8);
    // a bala voa pela reta SORTEADA: parede, chão ou tronco no caminho param ela ali
    let bate = primeiroObstaculo(_eFrom, _eDir, ate, mundo);
    /* ...e o ACERTO vai para o corpo (_eTo), que é por onde o traçante passa
       e onde o dano cai. A reta sorteada só chega a 0,5 m dele: ela pode
       passar ao lado de um obstáculo que a reta até o corpo atravessa —
       medido no jogo real, 6 acertos com o traçante 1,0–1,3 cm dentro de um
       degrau da escada da Torre Nexus. Acerto exige as DUAS livres. */
    if (bate >= ate && acerta) {
      _eV.copy(_eTo).sub(_eFrom).normalize();
      const bateNoCorpo = primeiroObstaculo(_eFrom, _eV, range, mundo);
      if (bateNoCorpo < range) { _eDir.copy(_eV); bate = bateNoCorpo; }
    }
    if (bate < ate || (acerta && bate < range)) {
      _eFim.copy(_eFrom).addScaledVector(_eDir, bate);
      FX.spawnTracer(_eFrom, _eFim, 0xff8866);
      FX.burst(_eFim, _eN.copy(_eDir).negate(), 'spark');
      return;
    }
    if (acerta) {
      FX.spawnTracer(_eFrom, _eTo, 0xff8866);
      playerDamage((e.heavy ? rand(9, 14) : rand(6, 11)) | 0, _eFrom, { type: 'enemy' });
    } else {
      _eFim.copy(_eFrom).addScaledVector(_eDir, ate);
      _eFim.y = Math.max(_eFim.y, heightAt(_eFim.x, _eFim.z));
      FX.spawnTracer(_eFrom, _eFim, 0xff8866);
      if (_eFim.y <= heightAt(_eFim.x, _eFim.z) + 0.1) { terrainNormal(_eFim.x, _eFim.z, _eN); FX.burst(_eFim, _eN, 'dirt'); }
    }
  }

  function update(dt, t) {
    for (const e of list) {
      const g = e.group;

      /* ---------- morto: ragdoll falso ----------
         O corpo cai no chão EM QUE MORREU e bate em parede: antes ele só
         conhecia o terreno — o executivo do 3º andar voava 7,6 m, passava
         pela fachada e caía 6,8 m até a rua. Soldado sem posto encolhe e
         some (renasce sorteado longe); o de posto fica caído até poder
         renascer fora da vista (podeRenascer). */
      if (!e.alive) {
        e.deadT += dt;
        if (e.deadT < 1.5) {
          const px = g.position.x, pz = g.position.z;
          e.ragVel.y -= 18 * dt;
          g.position.addScaledVector(e.ragVel, dt);
          Structures.collide(g.position, 0.3, 0.6);
          const naLaje = prenderNaLaje(e, px, pz);
          const gy = pisoDe(e, naLaje);
          if (g.position.y < gy) { g.position.y = gy; e.ragVel.multiplyScalar(0.6); e.ragVel.y = 0; }
          g.rotation.x = Math.min(Math.PI / 2, g.rotation.x + dt * 5) * 1;
          g.rotation.z += e.ragSpin * dt * 2.4;
          if (!e.plan && e.deadT > 1.1) {
            const k = 1 - (e.deadT - 1.1) / 0.4;
            g.scale.setScalar(Math.max(0.001, k));
          }
        } else {
          if (!e.plan) g.scale.setScalar(0.001);
          e.respawnT -= dt;
          if (e.respawnT <= 0) {
            if (podeRenascer(e)) { g.rotation.set(0, 0, 0); e.respawn(); }
            else e.respawnT = 0.5; // olha de novo daqui a meio segundo
          }
        }
        continue;
      }

      const dPlayer = g.position.distanceTo(player.pos);

      /* ---------- atropelamento ---------- */
      if (Car.speedKmh() > 24 && g.position.distanceTo(Car.group.position) < 2.4) {
        _v1.copy(Car.chassisBody.velocity).normalize();
        e.die(_v1, null);
        addTrauma(0.2);
        continue;
      }

      /* ---------- sentidos (escalonado p/ performance) ---------- */
      e.senseAcc += dt;
      let sees = false;
      if (e.senseAcc > 0.16) {
        e.senseAcc = 0;
        if (dPlayer < 95 && alcancavel()) {
          _eOlho.copy(g.position); _eOlho.y += 1.7 * g.scale.y;
          const inFov = e.fsm !== 'PATRULHA' || (() => {
            _v2.copy(player.pos).sub(g.position); _v2.y = 0; _v2.normalize();
            return _v2.dot(_eDir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw))) > 0.35;
          })();
          // vê a CABEÇA (olho da câmera), não um olho fixo de quem está em pé
          sees = inFov && dPlayer < (e.fsm === 'PATRULHA' ? 55 : 85) && hasLOS(_eOlho, olhoDoJogador(_pOlho));
          if (sees) { e.lastKnown.copy(player.pos); e.losT = t; }
        }
        // ouviu tiro do player por perto
        if (lastShotInfo.t > t - 0.4 && g.position.distanceTo(lastShotInfo.pos) < OUVIDO && e.fsm === 'PATRULHA') {
          e.fsm = 'ALERTA'; e.alertT = t; e.lastKnown.copy(lastShotInfo.pos);
        }
      } else {
        sees = t - e.losT < 0.25;
      }

      /* ---------- FSM ---------- */
      let moveTarget = null, moveSpeed = 0, aiming = false;
      if (e.fsm !== 'PATRULHA') e.wpMelhor = undefined; // volta à patrulha com o relógio zerado
      switch (e.fsm) {
        case 'PATRULHA': {
          const wp = e.waypoints[e.wpIdx];
          const dWp = Math.hypot(wp.x - g.position.x, wp.z - g.position.z);
          /* PRESO: o ponto sorteado pode ficar atrás de uma parede ou no bolso
             entre dois caixotes, e o soldado anda em linha reta — o collide o
             segura ali para sempre (semente 1: guarda da base 103 s parado em
             120 s, no canto entre os dois caixotes — test/pve-predios.test.js).
             Sem chegar 0,5 m mais perto em 4 s, desiste do ponto e vai ao próximo. */
          if (e.wpMelhor === undefined || dWp < e.wpMelhor - 0.5) { e.wpMelhor = dWp; e.wpDesde = t; }
          if (dWp < 1.6 || t - e.wpDesde > 4) {
            e.wpIdx = (e.wpIdx + 1) % e.waypoints.length;
            e.wpMelhor = undefined;
          }
          moveTarget = wp; moveSpeed = 2.1;
          if (sees) { e.fsm = 'PERSEGUIR'; }
          break;
        }
        case 'ALERTA': {
          moveTarget = e.lastKnown; moveSpeed = 3.2;
          if (sees) e.fsm = 'PERSEGUIR';
          else if (t - e.alertT > 7) e.fsm = 'PATRULHA';
          break;
        }
        case 'PERSEGUIR': {
          moveTarget = sees ? player.pos : e.lastKnown; moveSpeed = 4.6;
          if (sees && dPlayer < 24) e.fsm = 'ATACAR';
          else if (!sees && t - e.losT > 5) { e.fsm = 'ALERTA'; e.alertT = t; }
          break;
        }
        case 'ATACAR': {
          aiming = true; moveSpeed = 0;
          if (!sees || dPlayer > 30) { e.fsm = 'PERSEGUIR'; e.burstLeft = 0; }
          break;
        }
      }

      /* ---------- locomoção + separação ---------- */
      moveSpeed *= e.heavy ? 0.78 : 1;
      let vx = 0, vz = 0;
      if (moveTarget && moveSpeed > 0) {
        const dx = moveTarget.x - g.position.x, dz = moveTarget.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) { vx = dx / d * moveSpeed; vz = dz / d * moveSpeed; }
      }
      if (aiming) { // micro-strafe enquanto atira
        const sa = Math.sin(t * 1.3 + e.id * 2.1) * 1.1;
        vx += Math.cos(e.yaw) * sa * 0.4; vz += -Math.sin(e.yaw) * sa * 0.4;
      }
      for (const o of list) { // separação entre inimigos
        if (o === e || !o.alive) continue;
        const dx = g.position.x - o.group.position.x, dz = g.position.z - o.group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.4 * 1.4 && d2 > 1e-4) { const d = Math.sqrt(d2); vx += dx / d * 2.2; vz += dz / d * 2.2; }
      }
      const px = g.position.x, pz = g.position.z;
      g.position.x += vx * dt;
      g.position.z += vz * dt;
      for (const o of obstaclesNear(g.position.x, g.position.z)) {
        if (o.corpo === false) continue;           // fatia de bala não empurra
        const dx = g.position.x - o.x, dz = g.position.z - o.z;
        const d = Math.hypot(dx, dz), min = o.r + 0.4;
        if (d < min && d > 1e-4) { g.position.x = o.x + dx / d * min; g.position.z = o.z + dz / d * min; }
      }
      Structures.collide(g.position, 0.45, 1.9);
      g.position.y = pisoDe(e, prenderNaLaje(e, px, pz));

      /* ---------- orientação + animação procedural ---------- */
      const spd = Math.hypot(vx, vz);
      e.speedF = damp(e.speedF, clamp(spd / 4.6, 0, 1), 8, dt);
      let targetYaw = e.yaw;
      if (aiming || sees) targetYaw = Math.atan2(player.pos.x - g.position.x, player.pos.z - g.position.z);
      else if (spd > 0.2) targetYaw = Math.atan2(vx, vz);
      let dy = targetYaw - e.yaw;
      while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      e.yaw += dy * Math.min(1, 7 * dt);
      g.rotation.y = e.yaw;

      e.walkPhase += dt * (3 + spd * 2.4);
      const swing = Math.sin(e.walkPhase * 2) * 0.6 * e.speedF;
      e.flinchT = Math.max(0, e.flinchT - dt * 3.2);
      g.rotation.x = e.speedF * 0.14 - e.flinchT * 0.3;        // inclina pra frente ao correr, recua no flinch
      g.rotation.z = Math.sin(e.walkPhase) * 0.045 * e.speedF; // gingado lateral
      if (e.hasModel) {
        /* GUARDIÃO rigado: Walk embutida com passo no ritmo da velocidade;
           Punch quando o player cola (dano corpo-a-corpo novo, justo e telegrafado) */
        e.mixer.update(dt * (0.35 + e.speedF * 1.4));
        if (e.actions.Walk) e.actions.Walk.setEffectiveWeight(0.25 + e.speedF * 0.75);
        if (aiming && dPlayer < 2.7 && t >= (e.nextMelee || 0) && e.actions.Punch &&
            alcancavel() && !meleeBlocked(g, player.pos, Structures, obstaclesNear)) {
          e.nextMelee = t + 2.4;
          e.actions.Punch.reset().play();
          /* o soco conecta no meio da animação — e o mundo pode ter mudado em
             380 ms: quem entrou atrás da parede ou no helicóptero não leva. Era
             sem checagem nenhuma: 9 de dano através da parede da cabana. */
          setTimeout(() => {
            if (e.alive && alcancavel() && g.position.distanceTo(player.pos) < 3 &&
                !meleeBlocked(g, player.pos, Structures, obstaclesNear)) {
              playerDamage(9, g.position, { type: 'enemy' });
            }
          }, 380);
        }
      } else {
        e.parts.legL.rotation.x = swing;
        e.parts.legR.rotation.x = -swing;
        // cabeça vasculha no estado de alerta
        if (e.fsm === 'ALERTA') e.parts.head.rotation.y = Math.sin(t * 2.2 + e.id * 1.7) * 0.7;
        else e.parts.head.rotation.y = damp(e.parts.head.rotation.y, 0, 6, dt);
        if (aiming) {
          // as DUAS mãos seguram a arma apontada pro player
          const dyAim = (player.pos.y + 1.4) - (g.position.y + 1.5);
          const pitch = Math.atan2(dyAim, dPlayer);
          const aimX = -Math.PI / 2 + clamp(-pitch, -0.6, 0.6);
          e.parts.armR.rotation.x = damp(e.parts.armR.rotation.x, aimX, 10, dt);
          e.parts.armL.rotation.x = damp(e.parts.armL.rotation.x, aimX + 0.14, 10, dt);
          e.parts.armL.rotation.z = damp(e.parts.armL.rotation.z, 0.6, 10, dt);
        } else {
          e.parts.armR.rotation.x = swing * 0.8;
          e.parts.armL.rotation.x = -swing * 0.8;
          e.parts.armL.rotation.z = damp(e.parts.armL.rotation.z, 0, 8, dt);
        }
      }
      g.position.y += Math.abs(Math.sin(e.walkPhase)) * 0.06 * e.speedF; // quica ao andar

      /* ---------- ataque em rajadas ---------- */
      if (aiming) {
        if (e.burstLeft > 0) {
          if (t >= e.nextShot) { e.burstLeft--; e.nextShot = t + 0.13; enemyFire(e); }
        } else if (t >= e.nextBurst) {
          e.burstLeft = 3;
          e.nextShot = t + rand(0.1);
          e.nextBurst = t + rand(1.0, 1.9);
        }
      }
      e.flashT = Math.max(0, e.flashT - dt);
      e.flash.visible = e.flashT > 0 && !e.flashMuted;
      e.flash.material.opacity = e.flashT > 0 ? 0.95 : 0;
      if (e.flashT > 0) e.flash.rotation.z = rand(TAU);
    }
  }

  return { list, update };
}
