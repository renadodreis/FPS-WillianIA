/* ================================================================
   Modelo de BAÚ compartilhado — solo (js/interact.js) e BR (br-game.js).
   Corpo OCO de verdade (4 paredes + fundo): aberto, mostra a CAVIDADE e
   uma pilha de tesouro dourada — saqueado, a pilha some e o brilho apaga.
   Tampa abaulada (meio-cilindro) com painel interno fechando o vão da
   corda — sem face aberta/see-through quando a tampa levanta.

   Perf: geometrias MESCLADAS por material e CACHEADAS (compartilhadas por
   todos os baús) — 8 draw calls por baú oco, contra 11 da versão sólida.
   Criação inteira (geometria E meshes) roda em noSeed: nunca consome o
   rand seedado do worldgen (interact.js constrói baús na fase seedada).

   buildChest(matFn) → { group, lid, glow, loot }:
     - group: baú inteiro, origem no chão (assenta em y=0 local)
     - lid  : grupo da tampa (pivô na dobradiça; rotation.x negativo = abre)
     - glow : material emissivo da faixa/fechadura (achável ↔ apagado)
     - loot : pilha dourada dentro da cavidade (esconder = saqueado)
   ================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let _us = 0xBEEF12 >>> 0;
function noSeed(fn) {
  const R = Math.random;
  Math.random = () => (_us = (_us * 1664525 + 1013904223) >>> 0) / 4294967296;
  try { return fn(); } finally { Math.random = R; }
}

let CACHE = null;
function geos() {
  if (CACHE) return CACHE;
  CACHE = noSeed(() => {
    const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const merged = list => { const g = mergeGeometries(list); for (const x of list) x.dispose(); return g; };
    const W = 0.9, H = 0.44, D = 0.6, T = 0.055, Y = 0.02; // corpo externo y 0.02..0.46; parede T
    // tampa em coords locais ao pivô da dobradiça (grupo em (0, 0.46, -0.3))
    // comprimento 0.9 = FLUSH com as paredes: domo maior deixava fresta de ar
    // sob a aba nas pontas (fundo claro vazava como friso branco)
    const dome = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16, 1, false, 0, Math.PI);
    dome.rotateZ(-Math.PI / 2);  // eixo do cilindro ao longo de X (a largura)
    dome.rotateX(Math.PI);       // curva pra CIMA, corda embaixo
    dome.translate(0, 0, 0.3);
    return {
      woodStatic: merged([ // 4 paredes → cavidade REAL (aberto mostra o oco)
        box(W, H, T, 0, Y + H / 2, (D - T) / 2),
        box(W, H, T, 0, Y + H / 2, -(D - T) / 2),
        box(T, H, D - 2 * T, -(W - T) / 2, Y + H / 2, 0),
        box(T, H, D - 2 * T, (W - T) / 2, Y + H / 2, 0),
      ]),
      wood2Static: merged([ // fundo interno escuro + pés
        box(W - 2 * T, T, D - 2 * T, 0, Y + T / 2, 0),
        box(0.13, 0.14, 0.13, -0.34, 0.05, -0.22), box(0.13, 0.14, 0.13, 0.34, 0.05, -0.22),
        box(0.13, 0.14, 0.13, -0.34, 0.05, 0.22), box(0.13, 0.14, 0.13, 0.34, 0.05, 0.22),
      ]),
      ironStatic: merged([ // ferragens laterais embutidas; altura 0.44 = termina NA borda (nada fura a tampa)
        box(0.06, 0.44, 0.64, -0.455, 0.24, 0), box(0.06, 0.44, 0.64, 0.455, 0.24, 0),
      ]),
      glowStatic: merged([ // faixa dourada em MOLDURA (por fora das paredes) + fechadura
        box(0.94, 0.1, 0.02, 0, 0.24, 0.31), box(0.94, 0.1, 0.02, 0, 0.24, -0.31),
        box(0.02, 0.1, 0.64, -0.46, 0.24, 0), box(0.02, 0.1, 0.64, 0.46, 0.24, 0),
        box(0.17, 0.2, 0.05, 0, 0.3, 0.33),
      ]),
      lidWood: dome,
      // painel interno: fecha o vão do meio-cilindro E cobre a borda das paredes
      // quando fechado (sem friso claro entre tampa e corpo)
      // painel: fechado, cobre o TOPO das paredes (y 0.435..0.485 > borda 0.46) —
      // sem friso ensolarado vazando; recuado (0.88×0.66) pra não z-fightar
      lidWood2: box(0.88, 0.05, 0.66, 0, -0.005, 0.3),
      lidIron: box(0.86, 0.07, 0.66, 0, 0.12, 0.3), // aro de ferro recuado (sem face coplanar com as tampas do domo)
      loot: merged([ // pilha de tesouro ALTA o bastante pra aparecer sobre a borda
        box(0.62, 0.2, 0.36, 0, Y + T + 0.1, 0), box(0.34, 0.14, 0.24, 0, Y + T + 0.24, 0),
      ]),
    };
  });
  return CACHE;
}

let SHARED = null; // wood/wood2/iron IGUAIS em todos os baús → compartilhados.
export function buildChest(matFn) {
  return noSeed(() => {
    const g = geos();
    // PERF (medido): 65 baús × 4 materiais únicos = 260 materiais pagavam
    // compilação/setup na PRIMEIRA entrada no frustum — hitch de ~0,5 s "ao
    // entrar no mapa". Sem matFn (BR), wood/wood2/iron são de módulo (criados
    // 1×); só o glow é por baú (markOpened/boss mexem em emissiveIntensity).
    // Com matFn (solo usa csmMat), mantém materiais próprios — são 3 baús.
    let wood, wood2, iron;
    if (!matFn && SHARED) ({ wood, wood2, iron } = SHARED);
    else {
      const f = matFn || ((m) => m);
      wood  = f(new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.72 }));
      wood2 = f(new THREE.MeshStandardMaterial({ color: 0x3f2a17, roughness: 0.85 }));
      // ferro FORJADO fosco: metalness alto espelhava o céu em ângulo rasante e
      // vazava um risco branco na ponta da tampa (parecia defeito de mesh)
      iron  = f(new THREE.MeshStandardMaterial({ color: 0x2e2b26, metalness: 0.3, roughness: 0.7 }));
      if (!matFn) SHARED = { wood, wood2, iron };
    }
    const glow = (matFn || ((m) => m))(new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3, emissive: 0xf7b93c, emissiveIntensity: 1.0 }));

    const group = new THREE.Group();
    const add = (geo, m, shadow) => {
      const mesh = new THREE.Mesh(geo, m);
      if (shadow) mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    add(g.woodStatic, wood, true);
    add(g.wood2Static, wood2, false);
    add(g.ironStatic, iron, false);
    add(g.glowStatic, glow, false);

    const lid = new THREE.Group();
    lid.position.set(0, 0.46, -0.3);
    const dm = new THREE.Mesh(g.lidWood, wood); dm.castShadow = true; lid.add(dm);
    lid.add(new THREE.Mesh(g.lidWood2, wood2));
    lid.add(new THREE.Mesh(g.lidIron, iron));
    group.add(lid);

    const loot = new THREE.Mesh(g.loot, glow);
    group.add(loot);

    return { group, lid, glow, loot };
  });
}
