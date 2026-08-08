/* Modelos 3D reais das armas em primeira pessoa.
   Segue o padrão de js/car.js: cache por URL, normalização por bounding box,
   fallback no modelo procedural se a rede falhar. Além da troca visual:
   - religa parts.mag/parts.bolt nos nós do GLB quando o modelo os tem
     (a coreografia de recarga existente passa a mover geometria real);
   - toca animações embutidas do GLB ("reload"/"bolt_slide" da sniper leve),
     encaixadas na duração de recarga/ciclo da arma;
   - reposiciona o muzzleAnchor pra boca real do cano. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createWeaponModels(deps) {
  const { arsenal } = deps;
  const loader = new GLTFLoader();
  const cache = new Map();
  const live = []; // { gun, mixer?, actions?, prevReloading, prevCycle }

  function cached(url) {
    if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
    return cache.get(url);
  }

  /* calibração por arma: rotação de fábrica, comprimento alvo (m), offset fino,
     posição da boca do cano e (opcional) nós do GLB pra religar nas âncoras */
  const DEFS = [
    { idx: 0, url: '/assets/models/Armas/low_poly_m4_rifle.glb',
      len: 0.98, pos: [0, -0.012, 0.02], muzzle: [0, 0.033, -0.47] },
    { idx: 1, url: '/assets/models/Armas/shotgun_Shotgun_lenta_forte.glb',
      len: 1.06, pos: [0, 0.01, 0.04], muzzle: [0, 0.045, -0.5],
      strip: /^(Light|Camera)$/ },
    // ("Magazine_2" deste GLB é na verdade a mira frontal — fica onde está;
    //  o pente visível da recarga é complemento do weaponrig na âncora mag)
    { idx: 2, url: '/assets/models/Armas/low-poly_Sniper_lenta_forte.glb',
      len: 1.28, pos: [0, -0.005, 0.06], muzzle: [0, 0.03, -0.6] },
    { idx: 3, url: '/assets/models/Armas/bazooka.optimized.glb',
      len: 1.3, pos: [0, 0.02, 0.05], muzzle: [-0.058, 0.06, -0.6],
      sightGlass: /glass/i }, // vidro do scope lateral: a mira olha ATRAVÉS dele
    { idx: 4, url: '/assets/models/Armas/low-poly_Arma_do_Alien.glb',
      len: 0.92, pos: [0, -0.01, 0.02], muzzle: [0, 0.01, -0.44],
      glow: 0x2ee6c8 },
    // armas NOVAS (índices 6/7 do arsenal): sniper leve com animações embutidas
    // e escopeta de rajada — os modelos "rápida fraca" da pasta de assets.
    // Sniper: mag_4/bolt_6 são controlados pelos CLIPS ("reload"/"bolt_slide");
    // reparentar quebraria o PropertyBinding do mixer (raiz = root do GLB) e a
    // pose dos tracks — clipOwned marca as âncoras procedurais como cedidas.
    { idx: 6, url: '/assets/models/Armas/low-poly_sniper_Rápida_Fraca.glb',
      len: 1.16, pos: [0, -0.005, 0.04], muzzle: [0, 0.028, -0.55],
      clipOwned: ['mag', 'bolt'], anims: true },
    { idx: 7, url: '/assets/models/Armas/low-poly_Shotgun_rápida_fraca.glb',
      len: 0.96, pos: [0, 0.005, 0.03], muzzle: [0, 0.03, -0.45],
      strip: /^Lamp/, bind: { pump: /^Cube010$/ } }, // guarda-mão REAL vira a bomba
  ];

  function tuneMaterials(root, def) {
    root.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false; // arma na câmera: culling erra com bounding do modelo
      obj.userData.importedWeaponModel = true;
      if (def.sightGlass) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (mats.some(m => m && def.sightGlass.test(m.name || ''))) {
          obj.userData.sightGlass = true;
          // a mira olha ATRAVÉS deste vidro: opaco viraria um buraco preto no ADS
          for (const m of mats) {
            m.transparent = true;
            m.opacity = 0.25;
            m.depthWrite = false;
          }
        }
      }
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (!m || !m.isMeshStandardMaterial) continue;
        if (!m.map) {
          m.roughness = Math.max(m.roughness, 0.55);
          const l = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
          if (l > 0.72) m.color.multiplyScalar(0.72 / l); // evita clarão no bloom
        }
        if (def.glow && m.emissive && m.emissive.getHex() === 0)
          m.emissiveIntensity = 0;
      }
    });
  }

  function normalized(gltf, def) {
    const imported = gltf.scene.clone(true);
    const doomed = [];
    imported.traverse(o => {
      if (o.isLight || o.isCamera || (def.strip && def.strip.test(o.name))) doomed.push(o);
    });
    for (const o of doomed) o.parent && o.parent.remove(o);
    tuneMaterials(imported, def);

    // auto-orientação: deita o eixo mais COMPRIDO do modelo em Z (cano no eixo
    // da mira); def.flip resolve o 180° (modelos que nascem de costas)
    const rawBox = new THREE.Box3().setFromObject(imported);
    const rs = rawBox.getSize(new THREE.Vector3());
    const pre = rs.x >= rs.z ? Math.PI / 2 : 0;
    const oriented = new THREE.Group();
    oriented.rotation.y = pre + (def.flip ? Math.PI : 0) + (def.yaw || 0);
    if (def.pitch) oriented.rotation.x = def.pitch;
    oriented.add(imported);
    oriented.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(oriented);
    const size = raw.getSize(new THREE.Vector3());
    if (size.z < 1e-4) throw new Error('modelo de arma sem volume: ' + def.url);
    const s = def.len / size.z;
    const scaled = new THREE.Group();
    scaled.scale.setScalar(s);
    scaled.add(oriented);
    scaled.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scaled);
    // centraliza X/Y na empunhadura e recua o corpo: a origem do grupo da arma
    // é onde a mão direita segura (mesma convenção dos modelos procedurais)
    scaled.position.set(
      -(box.min.x + box.max.x) * 0.5 + (def.pos ? def.pos[0] : 0),
      -(box.min.y + box.max.y) * 0.5 + (def.pos ? def.pos[1] : 0),
      -(box.min.z + box.max.z) * 0.5 + (def.pos ? def.pos[2] : 0),
    );
    return scaled;
  }

  function findNode(root, re) {
    let hit = null;
    root.traverse(o => { if (!hit && re.test(o.name)) hit = o; });
    return hit;
  }

  async function attach(def) {
    const gun = arsenal[def.idx];
    if (!gun) return;
    try {
      const gltf = await cached(def.url);
      const root = normalized(gltf, def);

      // esconde só a geometria procedural da ARMA — âncoras (mag/pump/bolt) e
      // mãos continuam existindo e animando (viram alvos invisíveis do rig FP)
      const keep = new Set();
      for (const k of ['handL', 'handR']) if (gun.parts[k]) gun.parts[k].traverse(o => keep.add(o));
      gun.group.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; });

      gun.group.add(root);
      gun.modelRoot = root;
      gun.modelStatus = 'ready';

      // religa nós reais do GLB nas âncoras animadas (pente sai de verdade) —
      // SÓ em modelos sem clips; nós de clip ficam sob a raiz do mixer
      if (def.bind) {
        for (const [part, re] of Object.entries(def.bind)) {
          const anchor = gun.parts[part];
          const node = findNode(root, re);
          if (anchor && node) {
            anchor.attach(node); // preserva a pose mundial
            node.visible = true;
          }
        }
      }
      if (def.clipOwned) {
        for (const part of def.clipOwned) {
          if (gun.parts[part]) gun.parts[part].userData.authority = 'clip';
        }
      }
      // boca do cano na ponta real do modelo
      if (def.muzzle) gun.muzzleAnchor.position.set(...def.muzzle);

      // animações embutidas (sniper leve): recarga e ferrolho do próprio GLB
      if (def.anims && gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(root);
        const actions = {};
        for (const clip of gltf.animations) {
          const a = mixer.clipAction(clip);
          a.setLoop(THREE.LoopOnce);
          a.clampWhenFinished = false;
          actions[clip.name] = { action: a, dur: clip.duration };
        }
        live.push({ gun, mixer, actions, prevReloading: false, prevCycle: 0 });
      }
    } catch (err) {
      gun.modelStatus = 'fallback';
      gun.modelError = err instanceof Error ? err.message : String(err);
      console.error('Arma GLB falhou, mantendo procedural:', def.url, err);
    }
  }

  /* ---- carregamento priorizado ---------------------------------------
     Antes: `Promise.all(DEFS.map(attach))` disparava as 7 armas de uma vez no
     boot. Os bytes são os mesmos, mas a ORDEM não: num celular em 4G o modelo
     da arma que está NA MÃO disputava banda com a bazuca que o jogador talvez
     nunca destranque, e o decode das 7 caía junto no mesmo instante.

     Agora é uma fila ordenada (arma equipada → destrancadas → trancadas) com
     duas em voo. `request(idx)` fura a fila, e `update()` — que roda todo
     frame — chama sozinho quando uma arma destranca ou entra na mão. Ou seja:
     trocar de arma promove o download na hora, sem gancho novo no game.js.

     `ready` continua sendo "todas resolvidas". Não dá pra antecipá-la: o
     game.js só chama WeaponRig.attachComplements depois dela, e o perfil de
     mira/mecanismo que o rig escolhe depende do GLB já estar no lugar —
     resolver antes deixaria a arma inicial sem mira. Trocar isso exige um
     gancho por arma no game.js (ver PEDIDO no relatório). */
  const IN_FLIGHT = 2;

  function rankOf(def) {
    const gun = arsenal[def.idx];
    if (!gun) return 3;
    if (gun.group && gun.group.visible) return 0; // a que já está na mão
    return gun.locked ? 2 : 1;
  }

  const pendingQueue = DEFS.slice().sort((a, b) => rankOf(a) - rankOf(b));
  const inFlight = new Set();
  let remaining = DEFS.length;
  let finishAll;
  const ready = new Promise(resolve => { finishAll = resolve; });

  function start(def) {
    inFlight.add(def.idx);
    Promise.resolve(attach(def)).catch(() => {}).then(() => {
      inFlight.delete(def.idx);
      if (--remaining <= 0) finishAll();
      else pump();
    });
  }

  function pump() {
    while (inFlight.size < IN_FLIGHT && pendingQueue.length) start(pendingQueue.shift());
  }

  /* Fura a fila. Estoura o limite de voo de propósito: modelo atrasado na mão
     do jogador é pior que um download simultâneo a mais. */
  function request(idx) {
    const at = pendingQueue.findIndex(d => d.idx === idx);
    if (at >= 0) start(pendingQueue.splice(at, 1)[0]);
  }

  pump();

  function update(dt) {
    // destrancou ou entrou na mão: sobe pro topo da fila neste mesmo frame
    for (let i = pendingQueue.length - 1; i >= 0; i--) {
      const def = pendingQueue[i];
      const gun = arsenal[def.idx];
      if (!gun) continue;
      if (gun.locked && !(gun.group && gun.group.visible)) continue;
      pendingQueue.splice(i, 1);
      start(def);
    }
    for (const w of live) {
      const { gun, mixer, actions } = w;
      // recarga: encaixa o clipe "reload" na duração real da arma
      if (gun.reloading && !w.prevReloading && actions.reload) {
        const { action, dur } = actions.reload;
        action.reset();
        action.timeScale = dur / Math.max(gun.reloadTime, 0.1);
        action.play();
      }
      // fim/CANCELAMENTO da recarga: devolve mag_4/bolt_6 ao bind. Sem isto, trocar
      // de arma no meio da recarga só zera gun.reloading (game.js) e os nós clip-owned
      // congelavam fora do lugar. reset()+update(0) aplica o frame 0 (bind) mesmo com
      // a arma invisível; stop() desliga sem replay-fantasma.
      if (!gun.reloading && w.prevReloading && actions.reload) {
        const { action } = actions.reload;
        action.reset(); mixer.update(0); action.stop();
      }
      // pós-tiro: ferrolho
      if (gun.cycleT > w.prevCycle && actions.bolt_slide) {
        const { action, dur } = actions.bolt_slide;
        action.reset();
        action.timeScale = dur / 0.32;
        action.play();
      }
      w.prevReloading = gun.reloading;
      w.prevCycle = gun.cycleT;
      if (gun.group.visible) mixer.update(dt);
    }
  }

  function status() {
    return DEFS.map(d => ({
      idx: d.idx,
      url: d.url,
      status: arsenal[d.idx]
        ? arsenal[d.idx].modelStatus || (pendingQueue.includes(d) ? 'fila' : 'loading')
        : 'sem-arma',
    }));
  }

  return { ready, update, status, request, get queued() { return pendingQueue.length; } };
}
