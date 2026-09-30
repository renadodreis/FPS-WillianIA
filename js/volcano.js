/* vulcão: modelo GLB no canto do mapa + poço de lava na cratera que dá
   dano contínuo. O CHÃO continua sendo o terreno (heightmap 2D do modelo
   baked em terrain.js); a BALA e a visada conhecem também a rocha
   DESENHADA (js/vulcao-solido.js), que passa do relevo em quase metade da
   superfície — e a calota de lava cobre o poço da cratera. Os mesmos bytes
   montam o desenho e o sólido: não há dois vulcões. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { montarVulcao, retaNoVulcao, topoDoVulcao, VULCAO_GLB } from './vulcao-solido.js';

export function createVolcano(deps) {
  const { scene, VOLCANO, player, playerDamage, csmMat } = deps;

  const group = new THREE.Group();
  group.name = 'volcano';
  scene.add(group);

  const api = { VOLCANO, group, update, modelReady: false, solido: null, reta, segmento, topo };

  /* a rocha desenhada como sólido: Infinity / false enquanto o modelo não
     chegou (vale o relevo, como sempre valeu) */
  function reta(o, d, max) {
    return api.solido ? retaNoVulcao(api.solido, o.x, o.y, o.z, d.x, d.y, d.z, max) : Infinity;
  }
  const _d = new THREE.Vector3();
  function segmento(a, b) {
    if (!api.solido) return false;
    const len = _d.subVectors(b, a).length();
    if (len < 1e-6) return false;
    _d.multiplyScalar(1 / len);
    return retaNoVulcao(api.solido, a.x, a.y, a.z, _d.x, _d.y, _d.z, len) < len;
  }
  function topo(x, z) { return api.solido ? topoDoVulcao(api.solido, x, z) : -Infinity; }

  fetch(VULCAO_GLB).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(buf => {
    api.solido = montarVulcao(new Uint8Array(buf), VOLCANO);
    new GLTFLoader().parse(buf, '', gltf => {
      const root = gltf.scene;
      // mesma transformação do bake: bbox centrado em (x,z), escala pelo
      // footprint, base (minY) na fração VBASE≈0 acima do nível baseY
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const s = (VOLCANO.r * 2) / Math.max(size.x, size.z);
      root.scale.setScalar(s);
      root.position.x = VOLCANO.x - (box.min.x + size.x / 2) * s;
      root.position.z = VOLCANO.z - (box.min.z + size.z / 2) * s;
      root.position.y = VOLCANO.baseY - 0.006 * size.y * s - box.min.y * s;
      root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = Math.max(o.material.roughness ?? 1, 0.88); // basalto fosco
          if (o.material.emissiveMap) o.material.emissiveIntensity = 1.35; // lava estoura no bloom
          csmMat(o.material);
        }
      });
      group.add(root);
      api.modelReady = true;
    }, e => console.warn('[vulcão] modelo não carregou', e));
  }).catch(e => console.warn('[vulcão] modelo não carregou', e));

  // brasa viva: luz quente pulsando sobre a boca da cratera
  const glow = new THREE.PointLight(0xff6a22, 30, 130, 1.6);
  glow.position.set(VOLCANO.lavaX, VOLCANO.baseY + VOLCANO.h * 0.92, VOLCANO.lavaZ);
  group.add(glow);

  let dmgAcc = 0;
  function update(dt, t) {
    glow.intensity = 30 + Math.sin(t * 2.3) * 6 + Math.sin(t * 7.1) * 3;
    // caiu na garganta da cratera (abaixo do teto do poço): queima por segundo
    const p = player.pos;
    const dv = Math.hypot(p.x - VOLCANO.lavaX, p.z - VOLCANO.lavaZ);
    if (!player.dead && dv < VOLCANO.lavaR && p.y < VOLCANO.lavaY) {
      dmgAcc += 26 * dt;
      if (dmgAcc >= 9) { playerDamage(dmgAcc, null, { type: 'lava' }); dmgAcc = 0; }
    } else dmgAcc = 0; // saiu da lava: nada de dano atrasado
  }

  return api;
}
