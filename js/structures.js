/* ================================================================
   CONSTRUÇÕES — torres de vigia, cabanas, ruínas, cidade e o forte
   Tudo mesclado em UMA malha com vertex colors (1 draw call) +
   AABBs para bala/visão/colisão e corpos estáticos no cannon.

   O MUNDO SÓLIDO É DADO, E NÃO MORA AQUI. js/paredes.js decide onde fica
   cada construção (sorteio PRÓPRIO, derivado só da semente) e quais caixas
   são parede — é o mesmo código que o servidor e os bots rodam em Node.
   Este módulo DESENHA o que aquele descreve e publica `walls` exatamente
   como ele monta (test/paredes-paridade.test.js compara caixa a caixa com o
   Node). Parede nova se declara lá; aqui só entra o visual.
   ================================================================ */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as CityLayout from './citylayout.js';
import { createCastle } from './castle.js';
import { towerPlatforms, towerSurfaces, towerSteps } from './watchtower.js';
import * as CityInterior from './cityinterior.js';
import * as Paredes from './paredes.js';

// Altura da porta de FACHADA (moldura/vão recuado/marquise, prédio maciço
// sem interior) — decoração, sem relação com CityInterior.INT.DOOR_H (porta
// de INTERIOR, com contrato de traversal próprio). C4 (docs/vr/criterio-aaa.md)
// exige 2,0-2,1 m; ver test/city-facade-door.test.js.
export const FACADE_DOOR_H = 2.05;

/* NEUTRALIZAÇÃO DO RNG: THREE.generateUUID() consome Math.random 4× por
   objeto, e Math.random É o PRNG SEEDADO do worldgen (contrato do
   CLAUDE.md). noSeed() troca Math.random por um PRNG privado enquanto `fn`
   roda. createStructures roda INTEIRO dentro de um — as construções não
   consomem NADA do stream seedado, então o que é gerado depois delas não
   anda por causa do CONSUMO delas (a armadilha de
   test/paredes-paridade.test.js mede isso). Por DADO ainda anda: árvores e
   atrações evitam `sites`. */
function criarNoSeed() {
  let _us = 0x9E3779B9 >>> 0;
  return (fn) => {
    const _R = Math.random;
    Math.random = () => (_us = (_us * 1664525 + 1013904223) >>> 0) / 4294967296;
    try { return fn(); } finally { Math.random = _R; }
  };
}

export function createStructures(deps) {
  const noSeed = criarNoSeed();
  return noSeed(() => criarEstruturas(deps, noSeed));
}

function criarEstruturas(deps, noSeed) {
  const { clamp, TAU, heightAt, slopeAt, platforms, WATER_LEVEL, CITY, scene, csmMat, paintGeometry } = deps;
  /* A semente que MONTOU este mundo: a mesma leitura que o game.js faz para a
     grama e os POIs (`init` do servidor; solo sem servidor cai em 424242). */
  const worldSeed = deps.worldSeed !== undefined ? deps.worldSeed
    : (globalThis.__MP_init && globalThis.__MP_init.worldSeed);
  const mundo = Paredes.construirMundoSolido({ worldSeed, heightAt, slopeAt, WATER_LEVEL, CITY });
  const plano = mundo.plano;
  const sites = plano.sites; // {x, z, r, type} — o game.js acrescenta mercado/refúgio depois
  const fieldRoofs = []; // telhados do CAMPO p/ o clima (js/cover.js) — metadado puro
  /* AABBs sólidas {x0,x1,y0,y1,z0,z1}, na ordem de js/paredes.js. O castelo
     (último da lista) é empurrado pelo próprio createCastle, mais abaixo. */
  const walls = mundo.paredes.filter(w => !w.castle);
  const geos = [];
  const fortGeos = [];   // fallback legado isolado: não entra na malha mundial
  let buildingFort = false;
  const smokeSpots = []; // topos de chaminé (fumaça ambiente)
  const towerClearings = []; // clareiras de grama sob a escada das torres (game.js)
  const cityInteriors = mundo.cidade.interiores; // térreos ocos {lot,bx,bz,gy,d,gfH,plan}
  const poiMarks = [];      // pontos pro radar do minimapa (game.js: ToysRadar)
  const flags = [];      // bandeiras que tremulam
  const flagGeo = new THREE.PlaneGeometry(1.15, 0.55);
  flagGeo.translate(0.6, 0, 0); // articulada no mastro
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xe8562a, side: THREE.DoubleSide, roughness: 0.7 });
  const _sc = new THREE.Color();

  /* caixa vertex-color da malha mundial. SÓ desenho: a parede correspondente
     (quando a peça é sólida) já está em `walls`, vinda de js/paredes.js —
     e o corpo físico o game.js cria a partir dela. */
  function sbox(w, h, d, x, y, z, color) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    paintGeometry(g, _sc.setHex(color));
    (buildingFort ? fortGeos : geos).push(g);
  }
  const desenhar = pecas => { for (const p of pecas) sbox(p.w, p.h, p.d, p.x, p.y, p.z, p.cor); };
  function scone(r, h, x, y, z, color) {
    const g = new THREE.ConeGeometry(r, h, 4);
    g.rotateY(Math.PI / 4);
    g.translate(x, y, z);
    paintGeometry(g, _sc.setHex(color));
    (buildingFort ? fortGeos : geos).push(g);
  }

  /* escada dog-leg externa + tampo pisável.
     O contrato geométrico mora em js/watchtower.js (puro, testável em
     node). Aqui só se materializa: `platforms` são objetos puros e a
     escada é só desenho (nenhuma peça dela é parede). */
  function towerAccess(cx, cz, y) {
    for (const p of towerPlatforms(cx, cz, y)) platforms.push(p);
    const s = towerSurfaces(cx, cz, y);
    towerClearings.push({ x: cx + 2.6, z: cz - 0.6, r: 5.2 }); // grama não brota na escada
    const wood = 0x8a6238, dark = 0x6b4a2e;
    // degraus visuais por cima da rampa lógica (padrão flight() da Nexus)
    for (const st of towerSteps(cx, cz, y))
      sbox(st.w, st.h, st.d, st.x, st.y, st.z, wood);
    // patamares: laje visual com a espessura do degrau
    for (const L of [s.landingN, s.landingT])
      sbox(L.x1 - L.x0, 0.22, L.z1 - L.z0, (L.x0 + L.x1) / 2, L.y - 0.11, (L.z0 + L.z1) / 2, wood);
    // longarinas inclinadas (fecham o vão embaixo dos degraus)
    for (const f of [s.flightA, s.flightB]) {
      const dz = f.z1 - f.z0, dy = f.y1 - f.y0, len = Math.hypot(dz, dy);
      for (const sx of [f.x0 + 0.08, f.x1 - 0.08]) {
        const g = new THREE.BoxGeometry(0.16, 0.42, len);
        g.rotateX(-Math.atan2(dy, dz));
        g.translate(sx, (f.y0 + f.y1) / 2 - 0.34, (f.z0 + f.z1) / 2);
        paintGeometry(g, _sc.setHex(dark)); geos.push(g);
      }
      // corrimão externo acompanhando o lance
      const gh = new THREE.BoxGeometry(0.08, 0.08, len);
      gh.rotateX(-Math.atan2(dy, dz));
      gh.translate(f.x1 - 0.08, (f.y0 + f.y1) / 2 + 0.95, (f.z0 + f.z1) / 2);
      paintGeometry(gh, _sc.setHex(dark)); geos.push(gh);
      for (let i = 0; i <= 3; i++) {
        const t = i / 3, pz = f.z0 + dz * t;
        sbox(0.08, 0.95, 0.08, f.x1 - 0.08, f.y0 + dy * t + 0.48, pz, dark);
      }
    }
    // pés dos patamares apoiados no terreno (nada flutuando)
    for (const [px, pz] of [[s.landingN.x0 + 0.2, s.landingN.z0 + 0.2], [s.landingN.x1 - 0.2, s.landingN.z0 + 0.2]]) {
      const gy2 = heightAt(px, pz);
      const hh = Math.max(0.2, s.midY - gy2); // terreno acidentado não inverte a estaca
      sbox(0.2, hh, 0.2, px, s.midY - hh / 2, pz, dark);
    }
  }

  /* torre de vigia: montantes, tampo e guarda-corpos (js/paredes.js:
     pecasTorre) + telhado cônico, telhado climático e a escada */
  function tower(t, pecas) {
    const cx = t.x, cz = t.z, y = t.y, H = Paredes.TORRE_H;
    desenhar(pecas);
    fieldRoofs.push({ x0: cx - 1.85, x1: cx + 1.85, z0: cz - 1.85, z1: cz + 1.85, roofY: y + H + 0.14 });
    scone(3, 1.7, cx, y + H + 1.8, cz, 0xa84f35);
    towerAccess(cx, cz, y);
  }

  /* cabana: paredes, forro e chaminé (js/paredes.js: pecasCabana) + as duas
     águas do telhado, telhado climático e a fumaça */
  function cabin(c, pecas) {
    const cx = c.x, cz = c.z, y = c.y;
    const { W, D, H } = Paredes.dimensoesCabana(c.flip);
    desenhar(pecas);
    fieldRoofs.push({ x0: cx - (W + 0.8) / 2, x1: cx + (W + 0.8) / 2,
      z0: cz - (D + 0.8) / 2, z1: cz + (D + 0.8) / 2, roofY: y + H + 0.44 });
    const r1 = new THREE.BoxGeometry(W + 1.1, 0.15, D * 0.64);
    r1.rotateX(0.48); r1.translate(cx, y + H + 0.92, cz - D * 0.26);
    paintGeometry(r1, _sc.setHex(0xa84f35)); geos.push(r1);
    const r2 = new THREE.BoxGeometry(W + 1.1, 0.15, D * 0.64);
    r2.rotateX(-0.48); r2.translate(cx, y + H + 0.92, cz + D * 0.26);
    paintGeometry(r2, _sc.setHex(0xa84f35)); geos.push(r2);
    smokeSpots.push({ x: cx + W * 0.28, y: y + H + 1.95, z: cz - D * 0.18 });
  }

  const flames = [];
  /* forte LEGADO: fonte visual oculta (o fallback ativo sai dos colisores do
     castelo). Nenhuma peça dele é parede. */
  function fort(cx, cz) {
    const y = heightAt(cx, cz);
    const S = 17, H = 4.6, T = 0.9;
    sbox(S * 2 + T, H + 2.5, T, cx, y + H / 2 - 0.6, cz - S, 0x9a958c);
    sbox(T, H + 2.5, S * 2, cx - S, y + H / 2 - 0.6, cz, 0x9a958c);
    sbox(T, H + 2.5, S * 2, cx + S, y + H / 2 - 0.6, cz, 0x9a958c);
    const gate = 4.6, seg = (S * 2 - gate) / 2;
    sbox(seg, H + 2.5, T, cx - (gate + seg) / 2, y + H / 2 - 0.6, cz + S, 0x9a958c);
    sbox(seg, H + 2.5, T, cx + (gate + seg) / 2, y + H / 2 - 0.6, cz + S, 0x9a958c);
    sbox(gate + 1.4, 1.1, T + 0.5, cx, y + H + 0.4, cz + S, 0x6e6a63);  // arco do portão
    for (const [ox, oz] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
      sbox(2.8, H + 4, 2.8, cx + ox, y + (H + 4) / 2 - 0.6, cz + oz, 0x6e6a63);
      // telhado pagode em 2 camadas (estilo oriental)
      scone(2.6, 1.3, cx + ox, y + H + 4.1, cz + oz, 0xb8342a);
      sbox(1.5, 0.5, 1.5, cx + ox, y + H + 4.9, cz + oz, 0x6e2620);
      scone(1.6, 1.1, cx + ox, y + H + 5.6, cz + oz, 0xb8342a);
      // mastro + bandeira tremulante
      sbox(0.09, 1.7, 0.09, cx + ox, y + H + 7.0, cz + oz, 0x6b4a2e);
      const fl = new THREE.Mesh(flagGeo, flagMat);
      fl.position.set(cx + ox, y + H + 7.4, cz + oz);
      fl.userData.ry = Math.random() * TAU; // fase do tremular: RNG privado (noSeed)
      scene.add(fl);
      flags.push(fl);
    }
    // portão torii vermelho + lanternas
    sbox(0.7, 7, 0.7, cx - 3.4, y + 3.2, cz + S + 1.6, 0xb8342a);
    sbox(0.7, 7, 0.7, cx + 3.4, y + 3.2, cz + S + 1.6, 0xb8342a);
    sbox(9.5, 0.55, 1.1, cx, y + 6.6, cz + S + 1.6, 0xb8342a);
    sbox(8, 0.45, 0.9, cx, y + 5.7, cz + S + 1.6, 0x6e2620);
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x401505, emissive: 0xff9a40, emissiveIntensity: 2.4, roughness: 0.5 });
    for (const lx of [-3.4, 3.4]) {
      const lt = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lanternMat);
      lt.scale.y = 1.25;
      lt.position.set(cx + lx, y + 5.1, cz + S + 1.6);
      scene.add(lt);
      flames.push(lt);
    }
    // santuário central de teto curvo sobre o estrado
    sbox(0.45, 3.2, 0.45, cx - 2.4, y + 1.7, cz - 2.4, 0xb8342a);
    sbox(0.45, 3.2, 0.45, cx + 2.4, y + 1.7, cz - 2.4, 0xb8342a);
    sbox(0.45, 3.2, 0.45, cx - 2.4, y + 1.7, cz + 2.4, 0xb8342a);
    sbox(0.45, 3.2, 0.45, cx + 2.4, y + 1.7, cz + 2.4, 0xb8342a);
    scone(4.6, 1.6, cx, y + 3.9, cz, 0xb8342a);
    sbox(2.6, 0.5, 2.6, cx, y + 4.8, cz, 0x6e2620);
    scone(2.6, 1.3, cx, y + 5.7, cz, 0xb8342a);
    for (let i = -3; i <= 3; i++) sbox(1, 0.7, 0.5, cx + i * 4.2, y + H + 0.55, cz - S, 0x9a958c);
    sbox(7, 0.34, 7, cx, y + 0.05, cz, 0x6e6a63);                       // estrado central
    // braseiros com chama emissiva (brilham no bloom)
    const flameMat = new THREE.MeshStandardMaterial({ color: 0x331303, emissive: 0xff8a2e, emissiveIntensity: 3.2, roughness: 0.4 });
    for (const [ox, oz] of [[-4, 4], [4, 4], [-4, -4], [4, -4]]) {
      sbox(0.3, 1.3, 0.3, cx + ox, y + 0.75, cz + oz, 0x4b4843);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), flameMat);
      f.position.set(cx + ox, y + 1.6, cz + oz);
      scene.add(f);
      flames.push(f);
    }
  }

  /* ---- posicionamento: js/paredes.js (planejarEstruturas) já decidiu
     onde fica cada construção; aqui cada uma é desenhada no lugar dela ---- */
  const FORT_POS = plano.forte;
  buildingFort = true;
  try { fort(FORT_POS.x, FORT_POS.z); } finally { buildingFort = false; }
  plano.torres.forEach((t, i) => tower(t, mundo.pecas.torres[i]));
  plano.cabanas.forEach((c, i) => cabin(c, mundo.pecas.cabanas[i]));
  for (const pecas of mundo.pecas.ruinas) desenhar(pecas);

  /* ================= CIDADE + TORRE NEXUS ================= */
  const carSpots = [];      // vagas de veículos {x,z,ry,type}
  const enemyCamps = [];    // spawns planejados {x,z,suit,army,floorY}
  const chestSpots = [];    // baús
  let heliSpot, bazookaSpot, towerTopY, NEXUS_INTERIOR;

  // fachada: parede + janelas com moldura/peitoril geradas por canvas. Só o VIDRO
  // vai pro emissiveMap (janelas acendem à noite; a parede fica apagada).
  // Janela acesa/cor saem do Math.random PRIVADO (noSeed): mesma fachada em
  // todos os clientes, sem encostar no stream seedado. Só o lado visual tem
  // canvas — js/paredes.js não sabe o que é fachada.
  function facadeTex() {
    const c1 = document.createElement('canvas'); c1.width = 64; c1.height = 128;
    const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 128;
    const a = c1.getContext('2d'), b = c2.getContext('2d');
    a.fillStyle = '#5b626d'; a.fillRect(0, 0, 64, 128);      // concreto claro
    b.fillStyle = '#000'; b.fillRect(0, 0, 64, 128);
    const warm = ['#ffd27a', '#ffe9b0', '#bcd8ff', '#ffc2a0'];
    for (let wy = 5; wy < 122; wy += 13) {
      a.fillStyle = '#6b727d'; a.fillRect(0, wy - 3, 64, 2); // faixa de laje entre andares
      for (let wx = 5; wx < 58; wx += 13) {
        const lit = Math.random() < 0.4;
        a.fillStyle = '#39404a'; a.fillRect(wx - 1, wy - 1, 11, 10);        // moldura recuada
        a.fillStyle = lit ? '#2f3a48' : '#161b22'; a.fillRect(wx, wy, 9, 8); // vidro
        a.fillStyle = '#7a828d'; a.fillRect(wx - 1, wy + 8, 11, 1.5);       // peitoril
        if (lit) { b.fillStyle = warm[(Math.random() * warm.length) | 0]; b.fillRect(wx, wy, 9, 8); }
      }
    }
    const t1 = new THREE.CanvasTexture(c1); t1.colorSpace = THREE.SRGBColorSpace;
    const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace;
    t1.wrapS = t1.wrapT = t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    t1.anisotropy = 4;
    return [t1, t2];
  }
  const [fMap, fEmis] = facadeTex();
  // vertexColors: tint por prédio multiplica o map (variação de cor, 1 draw call).
  const cityMat = csmMat(new THREE.MeshStandardMaterial({
    map: fMap, emissiveMap: fEmis, emissive: 0xffffff, emissiveIntensity: 0.25,
    roughness: 0.75, metalness: 0.12, vertexColors: true }));
  const cityGeos = [];
  const cityTrimGeos = [];        // detalhes urbanos vertex-color (some no evento)
  const cityInteriorGeos = [];    // INTERIOR da Torre Nexus (lajes/escada/corrimãos/pilares):
  const cityInteriorLampGeos = []; // luminárias emissivas do interior (mesh própria)
  const cityInteriorSignGeos = []; // numeração dos andares (atlas em CanvasTexture)
  let cityInteriorSignTex;         // textura-atlas dos números (setada na geração da torre)
  const cityProps = new THREE.Group(); cityProps.name = 'cityProps';
  // PRNG independente pro detalhe arquitetônico: determinístico em todos os
  // clientes (seed constante). Só desenho — nada daqui vira parede.
  let _bs = 0xB111D5;
  const bp = () => (_bs = (_bs * 1664525 + 1013904223) >>> 0) / 4294967296;
  const brand = (a = 1, b) => (b === undefined ? bp() * a : a + bp() * (b - a));
  const _white = new THREE.Color(1, 1, 1);
  /* caixa texturizada (UV ~ por andar). A parede urbana já está em `walls`
     (js/paredes.js); aqui fica o desenho e o telhado pisável.
     `roof=false`: parede do TÉRREO OCO. `groundAt` varre `platforms`
     inteiro a cada consulta (jogador + todo bicho, por frame), então as
     ~44 paredes internas não podem virar 44 lajes pisáveis — ainda mais
     porque o topo delas fica DENTRO do bloco maciço de cima. */
  function cityBox(b, tint, roof = true) {
    const { w, h, d, x, y, z } = b;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 9, uv.getY(i) * h / 7);
    g.translate(x, y, z);
    paintGeometry(g, tint || _white); // tint por prédio (vertexColors * map)
    cityGeos.push(g);
    // telhado pisável: pousar de paraquedas/pular em prédio da cidade funciona
    if (roof) platforms.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y: y + h / 2, city: true });
  }
  /* miolo dos térreos ocos: vai pro cityInteriorMesh (que some junto no
     evento de destruição). Já houve o bug de o visual da laje vazar pro
     mesh GLOBAL e ficar flutuando depois do destroy() — não repetir. */
  const _icc = new THREE.Color();
  function interiorBox(w, h, d, x, y, z, hex, floor = false) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    paintGeometry(g, _icc.setHex(hex));
    cityInteriorGeos.push(g);
    if (floor) platforms.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y: y + h / 2, city: true });
  }
  function interiorLamp(w, d, x, y, z) { // mesh emissiva própria (luz de teto/placa)
    const g = new THREE.BoxGeometry(w, 0.1, d);
    g.translate(x, y, z);
    cityInteriorLampGeos.push(g);
  }
  // trim urbano vertex-color: some no evento (vai pro cityTrimMesh). Só
  // decorativo — parede urbana nova se declara em js/paredes.js.
  function trimBox(w, h, d, x, y, z, hex) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    paintGeometry(g, _sc.setHex(hex));
    cityTrimGeos.push(g);
  }
  function trimCyl(r, h, x, y, z, hex, seg = 10) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y, z);
    paintGeometry(g, _sc.setHex(hex));
    cityTrimGeos.push(g);
  }
  {
    const { cx, cz, gy } = mundo.cidade; // o sítio 'cidade' já está em `sites` (plano)
    /* ---------- PAVIMENTO: praça, ruas, calçadas, meio-fio, faixas ----------
       Geometria plana vertex-color no cityTrimMesh (some no evento de destruição,
       revelando o solo escurecido das ruínas). Camadas em alturas ligeiramente
       diferentes (0.03→0.10) evitam z-fighting. */
    const SW = CityLayout.CITY_CONST.SIDEWALK_W;
    const paveRect = (lx0, lx1, lz0, lz1, dy, hex) =>
      trimBox(lx1 - lx0, 0.12, lz1 - lz0, cx + (lx0 + lx1) / 2, gy + dy, cz + (lz0 + lz1) / 2, hex);
    { // praça pavimentada (disco) ao redor da torre — acesso desobstruído
      const pg = new THREE.CylinderGeometry(CityLayout.PLAZA.r, CityLayout.PLAZA.r, 0.1, 40);
      pg.translate(cx, gy + 0.03, cz);
      paintGeometry(pg, _sc.setHex(0x565b63));
      cityTrimGeos.push(pg);
    }
    for (const r of CityLayout.ROADS) {
      paveRect(r.x0 - SW, r.x1 + SW, r.z0 - SW, r.z1 + SW, 0.05, 0x6b7079); // calçada
      paveRect(r.x0, r.x1, r.z0, r.z1, 0.08, 0x23252a);                     // asfalto
      // meio-fio (lip decorativo baixo nas bordas longas; sem física)
      if (r.x1 - r.x0 > r.z1 - r.z0) {
        trimBox(r.x1 - r.x0 + SW * 2, 0.18, 0.22, cx + (r.x0 + r.x1) / 2, gy + 0.15, cz + r.z0 - 0.11, 0x585d65);
        trimBox(r.x1 - r.x0 + SW * 2, 0.18, 0.22, cx + (r.x0 + r.x1) / 2, gy + 0.15, cz + r.z1 + 0.11, 0x585d65);
      } else {
        trimBox(0.22, 0.18, r.z1 - r.z0 + SW * 2, cx + r.x0 - 0.11, gy + 0.15, cz + (r.z0 + r.z1) / 2, 0x585d65);
        trimBox(0.22, 0.18, r.z1 - r.z0 + SW * 2, cx + r.x1 + 0.11, gy + 0.15, cz + (r.z0 + r.z1) / 2, 0x585d65);
      }
    }
    const av = CityLayout.ROADS[0], cr = CityLayout.ROADS[1];
    const avz = (av.z0 + av.z1) / 2, crx = (cr.x0 + cr.x1) / 2;
    for (let x = av.x0 + 3; x < av.x1 - 2; x += 6) paveRect(x, x + 2.6, avz - 0.22, avz + 0.22, 0.1, 0xcfd3d8);
    for (let z = cr.z0 + 3; z < cr.z1 - 2; z += 6) paveRect(crx - 0.22, crx + 0.22, z, z + 2.6, 0.1, 0xcfd3d8);
    // faixas de pedestres junto do cruzamento
    for (let i = 0; i < 5; i++) { const x = cr.x0 - 5 + i; paveRect(x, x + 0.55, av.z0 + 0.4, av.z1 - 0.4, 0.1, 0xdfe3e8); }
    for (let i = 0; i < 5; i++) { const z = av.z0 - 5 + i; paveRect(cr.x0 + 0.4, cr.x1 - 0.4, z, z + 0.55, 0.1, 0xdfe3e8); }

    /* ---------- PRÉDIOS: arquétipos com térreo, entrada, cobertura ---------- */
    function faceOffset(face, w, d) {
      if (face === 'S') return { ox: 0, oz: d / 2, nx: 0, nz: 1, axis: 'x' };
      if (face === 'N') return { ox: 0, oz: -d / 2, nx: 0, nz: -1, axis: 'x' };
      if (face === 'E') return { ox: w / 2, oz: 0, nx: 1, nz: 0, axis: 'z' };
      return { ox: -w / 2, oz: 0, nx: -1, nz: 0, axis: 'z' };
    }
    function roofUnits(bx, bz, w, d, py, arch) {
      const mh = brand(1.5, 2.4), mw = w * brand(0.32, 0.44), md = d * brand(0.32, 0.44);
      trimBox(mw, mh, md, bx + brand(-w * 0.12, w * 0.12), py + mh / 2, bz + brand(-d * 0.12, d * 0.12), 0x2e323a); // casa de máquinas
      if (brand() < 0.65) { const tr = brand(0.7, 1.05), th = brand(1.4, 2.1);
        trimCyl(tr, th, bx + brand(-w * 0.22, w * 0.22), py + th / 2, bz + brand(-d * 0.22, d * 0.22), 0x8f9aa2, 12); } // caixa d'água
      for (let i = 0; i < 2; i++) // caixas de ar-condicionado
        trimBox(brand(0.6, 1.1), brand(0.4, 0.8), brand(0.6, 1.1), bx + brand(-w * 0.3, w * 0.3), py + 0.4, bz + brand(-d * 0.3, d * 0.3), 0x474c55);
      if (arch === 'office' || arch === 'corner') { const ah = brand(2.6, 4.2); // antena
        trimBox(0.13, ah, 0.13, bx + brand(-w * 0.2, w * 0.2), py + ah / 2, bz + brand(-d * 0.2, d * 0.2), 0x20242a); }
    }
    /* TÉRREO OCO: 4 lotes viram sala de verdade (js/cityinterior.js; as
       caixas sólidas vêm de js/paredes.js: lote().interior). Paredes vão pro
       cityGeos (fachada texturizada, vista de fora continua prédio); miolo e
       luzes vão pro cityInteriorMesh, que some junto no evento de destruição. */
    function hollowGroundFloor(L, tint) {
      const { bx, bz } = L, { plan, paredes, cobertura } = L.interior;
      for (const s of paredes) cityBox(s, tint, false);
      // SEM laje de piso: o cityInteriorMesh tem auto-iluminação forte
      // (emissive 0x3b4552 @1.5 — é o que impede a Torre Nexus de ficar
      // preta à noite), e uma laje grande dentro dele virava um espelho
      // azul-claro que engolia os caixotes (visto na captura). O chão do
      // footprint urbano já vem pintado e sem grama por CityLayout.
      cobertura.forEach((c, i) => {
        // só o balcão central ganha laje pisável (pular nele pra atirar por
        // cima do peitoril); os caixotes ficam só como cobertura, pra não
        // engordar o `platforms` que groundAt varre por frame
        interiorBox(c.w, c.h, c.d, c.x, c.y, c.z, i === 0 ? 0x4a5561 : 0x7a5c30, i === 0);
      });
      for (const lp of plan.lamps)
        interiorLamp(lp.w, lp.d, bx + lp.x, gy + lp.y, bz + lp.z);
      // FINDABILITY: placa acesa por cima da porta + jambas de neon. Da rua
      // a entrada tem que gritar "dá pra entrar aqui" — porta escura no meio
      // de fachada texturizada some.
      const sg = plan.sign, horiz = sg.face === 'N' || sg.face === 'S';
      const nz = sg.face === 'S' ? 1 : sg.face === 'N' ? -1 : 0;
      const nx = sg.face === 'E' ? 1 : sg.face === 'O' ? -1 : 0;
      const sx = bx + sg.x + nx * 0.35, sz = bz + sg.z + nz * 0.35;
      interiorLamp(horiz ? 3.2 : 0.12, horiz ? 0.12 : 3.2, sx, gy + sg.y, sz);
      for (const k of [-1, 1]) {
        const jx = sx + (horiz ? k * (CityInterior.INT.DOOR_W / 2 + 0.2) : 0);
        const jz = sz + (horiz ? 0 : k * (CityInterior.INT.DOOR_W / 2 + 0.2));
        interiorBox(0.16, CityInterior.INT.DOOR_H, 0.16, jx, gy + CityInterior.INT.DOOR_H / 2, jz, 0x9fe6ff);
      }
      poiMarks.push({ x: bx + sg.x + nx * 1.2, z: bz + sg.z + nz * 1.2, color: 0x9fe6ff, kind: 'interior' });
    }

    function building(L) {
      const { lot, bx, bz, d, oco, gfH } = L;
      const { w, h, arch, face } = lot;
      const hue = arch === 'resid' ? 0.07 : arch === 'commerc' ? 0.55 : 0.6;
      const tint = new THREE.Color().setHSL(hue + brand(-0.02, 0.02), 0.06 + brand(0, 0.05), 0.6 + brand(-0.05, 0.12));
      // o térreo OCO é sala e precisa de pé-direito de sala (ver cityinterior.js):
      // sem isso a cabeça de quem pula entra no bloco maciço e collide() cospe
      // o jogador pela fachada. O telhado NÃO se move (segue em gy + h).
      // `L.volume` já é o bloco maciço certo: no oco começa ACIMA do térreo.
      cityBox(L.volume, tint);                          // volume principal (fachada + telhado)
      if (oco) hollowGroundFloor(L, tint);
      else trimBox(w + 0.5, gfH, d + 0.5, bx, gy + gfH / 2, bz, arch === 'commerc' ? 0x2b2f36 : 0x4a4f58); // térreo/podium
      trimBox(w + 0.7, 0.28, d + 0.7, bx, gy + gfH, bz, 0x6c727b);                                    // cornija do térreo
      const fo = faceOffset(face, w, d);
      const doorW = Math.min(2.8, w * 0.42), doorH = FACADE_DOOR_H;
      const fx = bx + fo.ox, fz = bz + fo.oz;
      if (fo.axis === 'x') {
        if (!oco) {
          trimBox(doorW + 0.7, doorH + 0.4, 0.22, fx, gy + (doorH + 0.4) / 2, fz + fo.nz * 0.02, 0x8a909a);  // moldura
          trimBox(doorW, doorH, 0.16, fx, gy + doorH / 2, fz + fo.nz * 0.1, 0x14161a);                       // vão recuado
        }
        if (arch === 'commerc' || arch === 'corner')
          trimBox(doorW + 1.6, 0.16, 1.2, fx, gy + doorH + 0.35, fz + fo.nz * 0.55, 0x2c3038);             // marquise
      } else {
        if (!oco) {
          trimBox(0.22, doorH + 0.4, doorW + 0.7, fx + fo.nx * 0.02, gy + (doorH + 0.4) / 2, fz, 0x8a909a);
          trimBox(0.16, doorH, doorW, fx + fo.nx * 0.1, gy + doorH / 2, fz, 0x14161a);
        }
        if (arch === 'commerc' || arch === 'corner')
          trimBox(1.2, 0.16, doorW + 1.6, fx + fo.nx * 0.55, gy + doorH + 0.35, fz, 0x2c3038);
      }
      // pilastras de canto (quebram as janelas nos cantos)
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        trimBox(0.5, h - gfH, 0.5, bx + sx * (w / 2 - 0.05), gy + gfH + (h - gfH) / 2, bz + sz * (d / 2 - 0.05), 0x565c66);
      // parapeito: 4 murinhos na borda do telhado (o telhado segue pisável)
      const py = gy + h;
      trimBox(w + 0.4, 0.7, 0.3, bx, py + 0.35, bz - d / 2, 0x3a3f48);
      trimBox(w + 0.4, 0.7, 0.3, bx, py + 0.35, bz + d / 2, 0x3a3f48);
      trimBox(0.3, 0.7, d + 0.4, bx - w / 2, py + 0.35, bz, 0x3a3f48);
      trimBox(0.3, 0.7, d + 0.4, bx + w / 2, py + 0.35, bz, 0x3a3f48);
      roofUnits(bx, bz, w, d, py, arch);
    }
    for (const L of mundo.cidade.lotes) building(L);

    // vagas de carros esportivos na rua
    carSpots.push({ x: cx + 14, z: cz + 26, ry: 0, type: 'sport' });          // de frente pra avenida
    carSpots.push({ x: cx - 8, z: cz + 26, ry: Math.PI, type: 'sport2' });
    carSpots.push({ x: cx + 26, z: cz - 16, ry: -Math.PI / 2, type: 'sport' });
    chestSpots.push({ x: cx + 21.5, z: cz + 18 });

    /* ---------- PROPS urbanos (postes instanciados + mobiliário) ---------- */
    const lampPos = [], eo = SW + 0.5;
    const addLamps = (r) => {
      if (r.x1 - r.x0 > r.z1 - r.z0) {
        for (let x = r.x0 + 4; x < r.x1 - 2; x += 13) {
          lampPos.push({ x, z: r.z0 - eo, hz: 0.7, hx: 0 });
          lampPos.push({ x, z: r.z1 + eo, hz: -0.7, hx: 0 });
        }
      } else {
        for (let z = r.z0 + 4; z < r.z1 - 2; z += 13) {
          lampPos.push({ x: r.x0 - eo, z, hx: 0.7, hz: 0 });
          lampPos.push({ x: r.x1 + eo, z, hx: -0.7, hz: 0 });
        }
      }
    };
    addLamps(av); addLamps(cr);
    const NL = lampPos.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 6),
      csmMat(new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.7, metalness: 0.5 })), NL);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.22, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, emissive: 0xffd98a, emissiveIntensity: 1.0, roughness: 0.5 }), NL);
    const _o = new THREE.Object3D();
    for (let i = 0; i < NL; i++) {
      const L = lampPos[i], wx = cx + L.x, wz = cz + L.z;
      _o.position.set(wx, gy + 2.1, wz); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      poles.setMatrixAt(i, _o.matrix);
      _o.position.set(wx + L.hx, gy + 4.15, wz + L.hz); _o.updateMatrix();
      heads.setMatrixAt(i, _o.matrix);
    }
    poles.castShadow = heads.castShadow = false;
    cityProps.add(poles, heads);
    // mobiliário da praça (trim: some no evento junto com os prédios)
    trimBox(2.4, 0.45, 0.6, cx - 6, gy + 0.32, cz + 12, 0x6b5a3a);   // banco
    trimBox(2.4, 0.45, 0.6, cx + 6, gy + 0.32, cz + 12, 0x6b5a3a);
    trimBox(1.0, 0.5, 1.0, cx - 11, gy + 0.3, cz + 7, 0x2f6b3a);     // floreira (verde)
    trimCyl(0.26, 1.0, cx + 10, gy + 0.5, cz - 8, 0xb23a2a);          // hidrante
    trimBox(0.6, 0.9, 0.6, cx + 14, gy + 0.45, cz + 6, 0x33383f);    // lixeira

    /* ---- TORRE NEXUS: 10 andares + escadaria + heliponto ----
       Casca, pilares, lajes, lances e corrimãos são DADO (js/paredes.js:
       cascaNexus / interiorNexus) — as caixas sólidas já estão em `walls`.
       Aqui: fachada, trim, o desenho do interior, placas e o telhado. */
    const { W, FH: fh, NF } = Paredes.NEXUS;
    const nexus = mundo.cidade.nexus;
    NEXUS_INTERIOR = nexus.info;
    towerTopY = nexus.info.towerTopY;
    for (const b of mundo.cidade.casca) cityBox(b); // casca externa texturizada (porta ao sul)
    // ---- trim externo da torre (decorativo, sem colisão): pilares de canto,
    //      moldura de entrada e marquise. Não bloqueia porta nem navegação. ----
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      trimBox(0.8, NF * fh + 1, 0.8, cx + sx * W / 2, gy + (NF * fh + 1) / 2, cz + sz * W / 2, 0x474d57); // pilar de canto
    trimBox(0.4, 3.4, 0.4, cx - 2, gy + 1.7, cz + W / 2 + 0.05, 0x8a909a);  // jamba esq da porta
    trimBox(0.4, 3.4, 0.4, cx + 2, gy + 1.7, cz + W / 2 + 0.05, 0x8a909a);  // jamba dir
    trimBox(5, 0.4, 0.5, cx, gy + 3.3, cz + W / 2 + 0.05, 0x8a909a);        // verga
    trimBox(6.4, 0.2, 1.8, cx, gy + 3.7, cz + W / 2 + 0.85, 0x2c3038);      // marquise de entrada
    // faixa/cornija do térreo (só o perímetro, não fecha o interior)
    trimBox(W + 0.6, 0.5, 0.4, cx, gy + 3.0, cz - W / 2, 0x5a616b);
    trimBox(0.4, 0.5, W + 0.6, cx - W / 2, gy + 3.0, cz, 0x5a616b);
    trimBox(0.4, 0.5, W + 0.6, cx + W / 2, gy + 3.0, cz, 0x5a616b);
    /* ---------- INTERIOR: escada dog-leg (dois lances em U) + poço + lobby ----------
       O contrato geométrico é `nexus.info` (NEXUS_INTERIOR: test/tower-interior.
       test.js) e `nexus.ops`, a lista ordenada do que existe lá dentro — cada
       op traz a parede/plataforma que gera. Aqui só se DESENHA, e todo o VISUAL
       vai pro cityInteriorMesh (some no evento de destruição, ver cityVisual). */
    const { half: HALF, zMid, zBot, railHeight: RAILH, slabT: SLABT } = nexus.info;
    const _ic = new THREE.Color();
    const iBox = (w, h, d, x, y, z, hex) => { // caixa vertex-color no mesh interior
      const g = new THREE.BoxGeometry(w, h, d); g.translate(cx + x, y, cz + z);
      paintGeometry(g, _ic.setHex(hex)); cityInteriorGeos.push(g);
    };
    const iLamp = (w, d, x, y, z) => { // luminária emissiva (mesh separada)
      const g = new THREE.BoxGeometry(w, 0.1, d); g.translate(cx + x, y, cz + z);
      cityInteriorLampGeos.push(g);
    };
    // laje/patamar: desenho + plataforma pisável (a parede noCollide já está em walls)
    const iSlab = ({ x0, x1, z0, z1, y, plataforma }, hex = 0x9297a0) => {
      iBox(x1 - x0, SLABT, z1 - z0, (x0 + x1) / 2, y - SLABT / 2, (z0 + z1) / 2, hex);
      platforms.push(plataforma);
    };
    // corrimão horizontal (barra sup+méd + prumos); o colisor fino já está em walls
    const railRun = ({ x0, x1, z0, z1, yb }) => {
      const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
      const len = horiz ? (x1 - x0) : (z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hex = 0x9aa1ab;
      if (horiz) { iBox(len, 0.06, 0.06, mx, yb + RAILH, mz, hex); iBox(len, 0.05, 0.05, mx, yb + RAILH * 0.5, mz, hex); }
      else { iBox(0.06, 0.06, len, mx, yb + RAILH, mz, hex); iBox(0.05, 0.05, len, mx, yb + RAILH * 0.5, mz, hex); }
      const n = Math.max(2, Math.round(Math.abs(len) / 1.1));
      for (let i = 0; i <= n; i++) { const f = i / n;
        iBox(0.06, RAILH, 0.06, horiz ? x0 + (x1 - x0) * f : mx, yb + RAILH / 2, horiz ? mz : z0 + (z1 - z0) * f, hex); }
    };
    // corrimão inclinado acompanhando um lance (x fixo; norte->sul: yN->yS)
    const railSlope = ({ x, yN, yS }) => {
      const dz = zBot - zMid, dy = yS - yN, len = Math.hypot(dz, dy), hex = 0x9aa1ab;
      const g = new THREE.BoxGeometry(0.06, 0.06, len);
      g.rotateX(-Math.atan2(dy, dz)); g.translate(cx + x, (yN + yS) / 2 + RAILH, cz + (zMid + zBot) / 2);
      paintGeometry(g, _ic.setHex(hex)); cityInteriorGeos.push(g);
      for (let i = 0; i <= 5; i++) { const t = i / 5; iBox(0.06, RAILH, 0.06, x, yN + dy * t + RAILH / 2, zMid + dz * t, hex); }
    };
    // um lance: a rampa lógica contínua (colisão SUAVE); os degraus vêm a seguir
    const flight = ({ plataforma }) => platforms.push(plataforma);
    // degrau: desenhado com a MESMA caixa que barra a bala (js/paredes.js)
    const degrau = d => iBox(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2, 0x83888f);

    heliSpot = { x: cx, y: towerTopY, z: cz };
    bazookaSpot = { x: cx + 6.5, y: towerTopY, z: cz + 6.5 };
    // painéis internos (escondem a fachada externa vista por dentro) — sem colisão
    const panelH = NF * fh, panelY = gy + panelH / 2, panelC = 0x565b64;
    iBox(2 * HALF, panelH, 0.08, 0, panelY, -HALF + 0.08, panelC);   // norte
    iBox(0.08, panelH, 2 * HALF, -HALF + 0.08, panelY, 0, panelC);   // oeste
    iBox(0.08, panelH, 2 * HALF, HALF - 0.08, panelY, 0, panelC);    // leste
    iBox(HALF - 2.4, panelH, 0.08, -(HALF + 2.4) / 2, panelY, HALF - 0.08, panelC); // sul-esq (evita porta)
    iBox(HALF - 2.4, panelH, 0.08, (HALF + 2.4) / 2, panelY, HALF - 0.08, panelC);  // sul-dir
    // lobby: piso interno diferenciado (decorativo); os 4 pilares vêm das ops
    iBox(2 * HALF, 0.06, 2 * HALF, 0, gy + 0.05, 0, 0x3d434c);       // placa do lobby (leitura visual)
    // numeração dos andares: 1 atlas em CanvasTexture (planos mesclados = 1 draw call)
    const signCv = document.createElement('canvas'); signCv.width = 64 * NF; signCv.height = 64;
    const sctx = signCv.getContext('2d');
    sctx.fillStyle = '#0b0e13'; sctx.fillRect(0, 0, signCv.width, signCv.height);
    sctx.fillStyle = '#8fd8ff'; sctx.font = 'bold 40px sans-serif'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    for (let f = 1; f <= NF; f++) sctx.fillText(String(f), (f - 0.5) * 64, 36);
    cityInteriorSignTex = new THREE.CanvasTexture(signCv); cityInteriorSignTex.colorSpace = THREE.SRGBColorSpace;
    const floorSign = ({ andar: f, x, y, z }) => {                  // placa do andar f, olhando pro leste (+x)
      const g = new THREE.PlaneGeometry(0.9, 0.9);
      const u = g.attributes.uv, c0 = (f - 1) / NF, c1 = f / NF;
      for (let i = 0; i < u.count; i++) u.setX(i, c0 + u.getX(i) * (c1 - c0));
      g.rotateY(Math.PI / 2); g.translate(cx + x, y, cz + z);
      cityInteriorSignGeos.push(g);
    };
    // pilares, andares, escada, luzes e numeração — na ordem de js/paredes.js
    const desenhaOp = {
      pilar: op => iBox(0.5, panelH, 0.5, op.px, panelY, op.pz, 0x6b7079), // pilar visual (full-height)
      laje: op => iSlab(op),
      corrimao: op => railRun(op),
      lance: op => flight(op),
      degrau: op => degrau(op),
      corrimaoInclinado: op => railSlope(op),
      luminaria: op => iLamp(op.w, op.d, op.x, op.y, op.z),
      placa: op => floorSign(op),
    };
    for (const op of nexus.ops) desenhaOp[op.tipo](op);
    // ---- TELHADO: heliponto + parapeitos (o deck e o guarda-corpo do poço são ops) ----
    iBox(W, 0.6, 0.4, 0, towerTopY + 0.3, -W / 2 + 0.2, 0x3a3f48);  // parapeitos
    iBox(W, 0.6, 0.4, 0, towerTopY + 0.3, W / 2 - 0.2, 0x3a3f48);
    iBox(0.4, 0.6, W, -W / 2 + 0.2, towerTopY + 0.3, 0, 0x3a3f48);
    iBox(0.4, 0.6, W, W / 2 - 0.2, towerTopY + 0.3, 0, 0x3a3f48);
    const padGeo = new THREE.CylinderGeometry(5.2, 5.2, 0.1, 24); padGeo.translate(cx, towerTopY + 0.06, cz);
    paintGeometry(padGeo, _ic.setHex(0x32363d)); cityInteriorGeos.push(padGeo);
    iBox(3.4, 0.06, 0.7, 0, towerTopY + 0.12, 0, 0xe8eef4);         // "H"
    iBox(0.7, 0.06, 2.6, -1.35, towerTopY + 0.12, 0, 0xe8eef4);
    iBox(0.7, 0.06, 2.6, 1.35, towerTopY + 0.12, 0, 0xe8eef4);
    trimBox(0.16, 5.5, 0.16, cx - W / 2 + 1.6, towerTopY + 2.75, cz - W / 2 + 1.6, 0x20242a); // antena
    trimBox(1.6, 0.5, 1.6, cx - W / 2 + 1.6, towerTopY + 0.25, cz - W / 2 + 1.6, 0x2e323a);   // casa de máquinas
    iBox(1.2, 0.7, 0.7, 6.5, towerTopY + 0.35, 6.5, 0x4a5240);      // caixa da bazuca
    // inimigos de terno em andares alternados (sorteio das construções: variedade por seed)
    for (const c of plano.campsNexus) enemyCamps.push({ ...c });
  }

  /* ================= BASES MILITARES ================= */
  /* muro, sacos de areia e caixotes vêm de js/paredes.js (pecasBase); guardas
     e o giro do caminhão, do mesmo sorteio (plano). Aqui: tendas e vagas. */
  const baseSites = [];
  function mbase(b, pecas) {
    const cx = b.x, cz = b.z;
    baseSites.push({ x: cx, z: cz, cleared: false });
    desenhar(pecas);
    // tendas militares (prismas) — no chão DELAS, não no do centro da base:
    // a 12 m dali, em encosta, o beiral ficava até 3,19 m no ar (ou a
    // cumeeira 2,76 m enterrada). Só desenho: tenda não é parede.
    for (const [ox, oz] of [[-12, -6], [-12, 4], [12, -5]]) {
      const ty = heightAt(cx + ox, cz + oz);
      const t1 = new THREE.BoxGeometry(5.5, 0.16, 4.4); t1.rotateZ(0.7); t1.translate(cx + ox - 1.25, ty + 1.25, cz + oz);
      paintGeometry(t1, _sc.setHex(0x55603f)); geos.push(t1);
      const t2 = new THREE.BoxGeometry(5.5, 0.16, 4.4); t2.rotateZ(-0.7); t2.translate(cx + ox + 1.25, ty + 1.25, cz + oz);
      paintGeometry(t2, _sc.setHex(0x55603f)); geos.push(t2);
    }
    // guardas + caminhão
    for (const g of b.guardas) enemyCamps.push({ x: g.x, z: g.z, army: true });
    carSpots.push({ x: cx, z: cz - 4, ry: b.caminhaoRy, type: 'truck' });
    chestSpots.push({ x: cx - 5, z: cz - 8 });
  }
  plano.bases.forEach((b, i) => mbase(b, mundo.pecas.bases[i]));
  chestSpots.push({ x: 5, z: 0.5 });

  const merged = BufferGeometryUtils.mergeGeometries(geos);
  const mesh = new THREE.Mesh(merged, csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 })));
  mesh.name = 'estruturas'; // QA: test/predios-desenho.test.js mede o vão nesta malha
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  // O forte antigo continua sendo construído acima, numa fonte separada e
  // sempre oculta (castle.js a recebe como `legacyRoot`). O fallback ativo é
  // gerado dos colliders novos em castle.js.
  const fortFallbackMesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(fortGeos),
    csmMat(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.85, metalness: 0.02,
    })),
  );
  fortFallbackMesh.name = 'bossCastleLegacySource';
  fortFallbackMesh.castShadow = fortFallbackMesh.receiveShadow = true;
  scene.add(fortFallbackMesh);
  const legacyFortY = heightAt(FORT_POS.x, FORT_POS.z);
  const castle = createCastle({
    center: FORT_POS,
    heightAt,
    scene,
    csmMat,
    noSeed,
    legacyRoot: fortFallbackMesh,
    legacyFlags: flags,
    legacyFlames: flames,
    walls,
    platforms,
    fieldRoofs,
  });
  const fortLift = castle.originY - legacyFortY;
  fortFallbackMesh.position.y = fortLift;
  for (const obj of flags) obj.position.y += fortLift;
  for (const obj of flames) obj.position.y += fortLift;
  const cityMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cityGeos), cityMat);
  cityMesh.castShadow = cityMesh.receiveShadow = true;
  scene.add(cityMesh);
  // trim urbano (térreos, entradas, parapeitos, coberturas, mobiliário): mesh
  // vertex-color própria pra sumir junto no evento de destruição.
  const cityTrimMat = csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
  const cityTrimMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cityTrimGeos), cityTrimMat);
  cityTrimMesh.castShadow = cityTrimMesh.receiveShadow = true;
  scene.add(cityTrimMesh);
  scene.add(cityProps);
  // INTERIOR intacto da Torre Nexus (lajes, degraus, patamares, corrimãos, pilares,
  // painéis, heliponto): meshes próprias pra sumir junto no evento de destruição
  // (antes o visual ia pro `mesh` global e ficava FLUTUANDO após city.destroy()).
  // emissive baixo de auto-iluminação: o interior fechado quase não recebe luz à
  // noite; sem isto ficava preto. Sutil de dia, legível à noite.
  const cityInteriorMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cityInteriorGeos),
    csmMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04,
      emissive: 0x3b4552, emissiveIntensity: 1.5 })));
  cityInteriorMesh.name = 'cityInteriorMesh';
  cityInteriorMesh.castShadow = cityInteriorMesh.receiveShadow = true;
  const cityInteriorLampMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cityInteriorLampGeos),
    new THREE.MeshStandardMaterial({ color: 0x0e1218, emissive: 0xcfe9ff, emissiveIntensity: 2.4, roughness: 0.5 }));
  cityInteriorLampMesh.name = 'cityInteriorLampMesh';
  const cityInteriorSignMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cityInteriorSignGeos),
    new THREE.MeshBasicMaterial({ map: cityInteriorSignTex, transparent: false }));
  cityInteriorSignMesh.name = 'cityInteriorSignMesh';
  scene.add(cityInteriorMesh, cityInteriorLampMesh, cityInteriorSignMesh);
  // visuais urbanos escondidos/mostrados atomicamente no evento
  const cityVisual = [cityMesh, cityTrimMesh, cityProps,
    cityInteriorMesh, cityInteriorLampMesh, cityInteriorSignMesh];

  /* ---- caixas empacotadas: MESMA ordem, MESMOS números ----
     `walls` guarda objetos de 5+ formatos diferentes (cru, `city`,
     `noCollide`, `cityRuin`, `castle`+`part`), então `b.x0` é uma leitura
     MEGAMÓRFICA — a pior que existe em V8. E o array é varrido inteiro por
     frame pelo jogador + 12 inimigos + 7 esqueletos + 14 noturnos + 13
     animais + helicóptero, e uma vez por bala em `rayHit`.

     O espelho abaixo é um Float64Array com os 6 limites em sequência: a
     varredura passa a ser leitura de typed array, na mesma ordem e com as
     mesmas contas. Semântica intocada — só o custo por parede.

     Índice espacial NÃO serve aqui: `collide` MUTA `pos` no meio do laço,
     então o conjunto de candidatos depende da posição que ainda vai mudar;
     pré-filtrar por região trocaria o resultado em caso de encaixe.

     Revalidação: o array é EXPORTADO e recebe push/splice em runtime (as
     ruínas no destroy da cidade, o castelo ao carregar o GLB, o QA). Trocou
     o tamanho ou o último elemento, reempacota; `invalidateWallCache()`
     força na mão. */
  let wpack = new Float64Array(0), wnc = new Uint8Array(0), wnb = new Uint8Array(0);
  let wpackLen = -1, wpackLast;
  function packWalls() {
    const n = walls.length;
    if (wpack.length < n * 6) {
      wpack = new Float64Array(n * 6 + 768);
      wnc = new Uint8Array(n + 128);
      wnb = new Uint8Array(n + 128);
    }
    for (let i = 0, o = 0; i < n; i++, o += 6) {
      const b = walls[i];
      wpack[o] = b.x0; wpack[o + 1] = b.x1;
      wpack[o + 2] = b.y0; wpack[o + 3] = b.y1;
      wpack[o + 4] = b.z0; wpack[o + 5] = b.z1;
      wnc[i] = b.noCollide ? 1 : 0;
      wnb[i] = b.noBullet ? 1 : 0;
    }
    wpackLen = n;
    wpackLast = walls[n - 1]; // n = 0 => undefined, e o teste abaixo bate
  }
  function syncWalls() {
    if (wpackLen !== walls.length || wpackLast !== walls[walls.length - 1]) packWalls();
    return wpackLen;
  }
  function invalidateWallCache() { wpackLen = -1; }

  /* ---- raio vs AABBs (slab test, sem alocação) ----
     Guarda-corpo (`noBullet`, js/paredes.js) segura corpo e deixa a bala
     passar: o desenho dele é grade vazada. */
  function rayHit(o, d, maxDist) {
    let best = maxDist;
    const n = syncWalls(), w = wpack;
    for (let i = 0, p = 0; i < n; i++, p += 6) {
      if (wnb[i]) continue;
      let t0 = 0, t1 = best, ta, tb;
      const bx0 = w[p], bx1 = w[p + 1], by0 = w[p + 2], by1 = w[p + 3], bz0 = w[p + 4], bz1 = w[p + 5];
      if (Math.abs(d.x) < 1e-8) { if (o.x < bx0 || o.x > bx1) continue; }
      else { ta = (bx0 - o.x) / d.x; tb = (bx1 - o.x) / d.x; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (Math.abs(d.y) < 1e-8) { if (o.y < by0 || o.y > by1) continue; }
      else { ta = (by0 - o.y) / d.y; tb = (by1 - o.y) / d.y; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (Math.abs(d.z) < 1e-8) { if (o.z < bz0 || o.z > bz1) continue; }
      else { ta = (bz0 - o.z) / d.z; tb = (bz1 - o.z) / d.z; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (t0 > 0 && t0 < best) best = t0;
    }
    return best === maxDist ? Infinity : best;
  }
  const _sd = new THREE.Vector3();
  function segBlocked(from, to) {
    _sd.copy(to).sub(from);
    const len = _sd.length();
    if (len < 1e-4) return false;
    _sd.multiplyScalar(1 / len);
    return rayHit(from, _sd, len) < len;
  }

  /* ---- empurra círculo (player/inimigo) para fora das paredes ---- */
  function collide(pos, radius, height) {
    const n = syncWalls(), w = wpack;
    for (let i = 0, p = 0; i < n; i++, p += 6) {
      if (wnc[i]) continue; // lajes: pisáveis, não empurram
      // pés no nível do topo = está PISANDO no bloco (telhado) — não expulsa
      const by0 = w[p + 2], by1 = w[p + 3];
      if (pos.y + height < by0 || pos.y >= by1 - 0.12) continue;
      const bx0 = w[p], bx1 = w[p + 1], bz0 = w[p + 4], bz1 = w[p + 5];
      const nx = clamp(pos.x, bx0, bx1), nz = clamp(pos.z, bz0, bz1);
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + dx / d * radius;
        pos.z = nz + dz / d * radius;
      } else {
        const px = Math.min(pos.x - bx0, bx1 - pos.x);
        const pz = Math.min(pos.z - bz0, bz1 - pos.z);
        if (px < pz) pos.x = (pos.x - bx0 < bx1 - pos.x) ? bx0 - radius : bx1 + radius;
        else pos.z = (pos.z - bz0 < bz1 - pos.z) ? bz0 - radius : bz1 + radius;
      }
    }
  }

  /* ============ DESTRUIÇÃO DA CIDADE — módulo fundo, interface pequena ============
     Registro de tudo que é urbano (walls/platforms marcados city:true, corpos
     CANNON registrados pelo game.js) + versão destruída construída JÁ NO BOOT
     (invisível). destroy()/restore() trocam visual e colisão do mundo inteiro
     de forma atômica: jogador, bala (rayHit), telhados e física dos veículos. */
  const cityRuins = new THREE.Group();
  cityRuins.name = 'cidadeDestruida';
  cityRuins.visible = false;
  // colisores simplificados dos escombros (poucos): js/paredes.js, porque o
  // servidor/bots precisam deles quando a cidade cai
  const ruinWalls = mundo.escombros;
  {
    // PRNG PRÓPRIO do DESENHO das ruínas (inclinação, vigas, entulho): nada
    // daqui vira parede, e o stream seedado nem está instalado (noSeed)
    let _rs = 0xC1DADE;
    const _rr = () => (_rs = (_rs * 1664525 + 1013904223) >>> 0) / 4294967296;
    const rand = (a = 1, b) => (b === undefined ? _rr() * a : a + _rr() * (b - a));
    const cx = CITY.x, cz = CITY.z, gy = heightAt(cx, cz);
    const mRuina = csmMat(new THREE.MeshStandardMaterial({ color: 0x2e2c2a, roughness: 0.95 }));
    const mQueim = csmMat(new THREE.MeshStandardMaterial({ color: 0x191715, roughness: 1 }));
    const mViga = new THREE.MeshStandardMaterial({ color: 0x4a3f34, roughness: 0.7, metalness: 0.5 });
    const mFogo = new THREE.MeshStandardMaterial({ color: 0x200800, emissive: 0xff7a2e, emissiveIntensity: 3 });
    /* chão urbano escurecido + "rachaduras" (faixas escuras finas).
       TUDO aqui embaixo pousa no terreno LOCAL, não no gy do centro: o disco
       tem 88 m de raio e só os ~62 m centrais são o platô urbano — do 62 pro 88
       o terreno volta ao natural e uma laje plana em gy chegava a FLUTUAR ~5 m
       (medido em 10 seeds). RingGeometry no lugar de CircleGeometry dá os anéis
       intermediários pra malha seguir o relevo. */
    // 160×26: passo radial ~3,4 m e arco ~3,5 m na borda, ambos MENORES que a
    // célula de 5 m do terreno — sem isso a corda entre dois anéis mergulhava
    // abaixo do relevo e o terreno furava o decalque.
    const chaoGeo = new THREE.RingGeometry(0.6, 88, 160, 26);
    const chao = new THREE.Mesh(chaoGeo,
      new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 1, transparent: true, opacity: 0.85 }));
    chao.name = 'chaoRuinas';
    chao.rotation.x = -Math.PI / 2;
    chao.position.set(cx, gy + 0.05, cz);
    { // rotação -90° em X manda (x,y,z) local pra (x, z, -y) no mundo
      const p = chaoGeo.attributes.position;
      for (let i = 0; i < p.count; i++)
        p.setZ(i, heightAt(cx + p.getX(i), cz - p.getY(i)) - gy);
      p.needsUpdate = true;
      chaoGeo.computeVertexNormals();
      chaoGeo.computeBoundingSphere();
    }
    cityRuins.add(chao);
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(rand(14, 40), rand(0.5, 1.2)),
        new THREE.MeshBasicMaterial({ color: 0x050505 }));
      r.rotation.x = -Math.PI / 2;
      r.rotation.z = rand(TAU);
      const rx = cx + rand(-70, 70), rz = cz + rand(-70, 70); // MESMA ordem de rand
      r.position.set(rx, heightAt(rx, rz) + 0.07, rz);
      cityRuins.add(r);
    }
    // stubs dos prédios: metade inferior, inclinados e chamuscados + vigas
    // (os 6 primeiros têm colisor BAIXO, 1,6 m, em js/paredes.js: dá pra pular
    // por cima e bala passa por cima — mesmo `sy` do desenho abaixo)
    let li = 0;
    for (const [ox, oz, w, hOrig] of Paredes.LOTES_ESCOMBROS) {
      const h = hOrig * rand(0.28, 0.45);
      const sy = heightAt(cx + ox, cz + oz); // pé do escombro no terreno do lote
      const stub = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.95), li % 2 ? mRuina : mQueim);
      stub.position.set(cx + ox, sy + h / 2 - 0.4, cz + oz);
      stub.rotation.z = rand(-0.09, 0.09);
      stub.rotation.x = rand(-0.07, 0.07);
      stub.castShadow = true;
      cityRuins.add(stub);
      for (let v = 0; v < 2; v++) {
        const viga = new THREE.Mesh(new THREE.BoxGeometry(0.28, hOrig * rand(0.4, 0.7), 0.28), mViga);
        const vx = cx + ox + rand(-w / 2, w / 2), vz = cz + oz + rand(-w / 2, w / 2); // MESMA ordem
        viga.position.set(vx, heightAt(vx, vz) + viga.geometry.parameters.height / 2 - 0.3, vz);
        viga.rotation.z = rand(-0.35, 0.35);
        cityRuins.add(viga);
      }
      li++;
    }
    // Torre Nexus severamente danificada: toco alto e torto
    const toco = new THREE.Mesh(new THREE.BoxGeometry(13, 14, 13), mQueim);
    toco.position.set(cx, gy + 6.6, cz);
    toco.rotation.z = 0.12;
    cityRuins.add(toco); // o colisor do toco (13 m) também vem de js/paredes.js
    // entulho instanciado (decorativo, sem física — barato)
    const debGeo = new THREE.BoxGeometry(1, 0.7, 1);
    const deb = new THREE.InstancedMesh(debGeo, mRuina, 120);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 120; i++) {
      const a = rand(TAU), r = rand(4, 84);
      const salto = rand(0, 0.5);                 // MESMA ordem: a, r, salto
      const dx = cx + Math.cos(a) * r, dz = cz + Math.sin(a) * r;
      dm.position.set(dx, heightAt(dx, dz) + salto, dz); // r vai até 84: gy fixo voava
      dm.rotation.set(rand(TAU), rand(TAU), rand(TAU));
      dm.scale.setScalar(rand(0.4, 1.8));
      dm.updateMatrix();
      deb.setMatrixAt(i, dm.matrix);
    }
    deb.castShadow = true;
    cityRuins.add(deb);
    // focos de fogo (cones emissive) + 2 luzes dinâmicas SÓ quando visível
    for (const [fx, fz] of [[-30, -24], [18, 30], [40, 6]]) {
      const fogo = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 6), mFogo);
      fogo.position.set(cx + fx, heightAt(cx + fx, cz + fz) + 0.8, cz + fz);
      cityRuins.add(fogo);
    }
    cityRuins.add(new THREE.PointLight(0xff7a2e, 1.6, 40, 1.4)
      .translateX(cx - 30).translateY(heightAt(cx - 30, cz - 24) + 3).translateZ(cz - 24));
    cityRuins.add(new THREE.PointLight(0xff9a4e, 1.2, 34, 1.4)
      .translateX(cx + 40).translateY(heightAt(cx + 40, cz + 6) + 3).translateZ(cz + 6));
    scene.add(cityRuins);
  }

  const city = {
    center: { x: CITY.x, z: CITY.z },
    radius: 95,
    _state: 'intact',
    _bodies: [],          // corpos CANNON das paredes urbanas (registrados pelo game.js)
    _ruinBodies: [],      // corpos CANNON dos ESCOMBROS (idem, mas entram só no destroy)
    _world: null,
    _savedWalls: [], _savedPlatforms: [],
    containsPoint(x, z) { return Math.hypot(x - CITY.x, z - CITY.z) <= this.radius; },
    getState() { return this._state; },
    setState(st) { if (st === 'destroyed') this.destroy(); else if (st === 'intact') this.restore(); },
    registerBody(b) { this._bodies.push(b); },
    /* Visual urbano criado DEPOIS do worldgen — hoje o cofre dos segredos, que
       nasce dentro de um térreo oco. Quem registra parede com `city: true` sem
       registrar o visual perdia o colisor no evento e deixava o mesh de pé:
       objeto atravessável, ainda clicável a bala, no meio dos escombros. É a
       mesma família do bug já registrado ("visual da laje vaza pro mesh
       global") — por isso a porta de entrada existe aqui, e não em cada módulo. */
    registerVisual(obj) {
      if (!obj) return;
      cityVisual.push(obj);
      if (this._state === 'destroyed') obj.visible = false;
    },
    // Escombro é o espelho da parede urbana: a parede sai do mundo no destroy,
    // o escombro entra. Sem isto o entulho barrava jogador e bala (walls[]) mas
    // o CARRO ATRAVESSAVA — o loop de corpos do game.js só roda no boot.
    registerRuinBody(b) { this._ruinBodies.push(b); },
    bindPhysics(world) { this._world = world; },
    destroy() {
      if (this._state === 'destroyed') return;
      this._state = 'destroyed';
      if (this.onStateChange) this.onStateChange('destroyed'); // ex.: cobertura de chuva cai junto
      for (const m of cityVisual) m.visible = false;
      cityRuins.visible = true;
      // colisão: paredes/plataformas urbanas saem dos arrays COMPARTILHADOS
      this._savedWalls = walls.filter(w => w.city);
      this._savedPlatforms = platforms.filter(p => p.city);
      for (let i = walls.length - 1; i >= 0; i--) if (walls[i].city) walls.splice(i, 1);
      for (let i = platforms.length - 1; i >= 0; i--) if (platforms[i].city) platforms.splice(i, 1);
      for (const rw of ruinWalls) walls.push(rw); // escombros: poucos colisores baixos
      invalidateWallCache(); // o espelho empacotado descreve a cidade em pé
      if (this._world) {
        for (const b of this._bodies) this._world.removeBody(b);
        for (const b of this._ruinBodies) this._world.addBody(b);
      }
    },
    restore() {
      if (this._state === 'intact') return;
      this._state = 'intact';
      if (this.onStateChange) this.onStateChange('intact');
      for (const m of cityVisual) m.visible = true;
      cityRuins.visible = false;
      for (let i = walls.length - 1; i >= 0; i--) if (walls[i].cityRuin) walls.splice(i, 1);
      for (const w of this._savedWalls) walls.push(w);
      for (const p of this._savedPlatforms) platforms.push(p);
      this._savedWalls = []; this._savedPlatforms = [];
      invalidateWallCache();
      if (this._world) {
        for (const b of this._ruinBodies) this._world.removeBody(b);
        for (const b of this._bodies) this._world.addBody(b);
      }
    },
  };

  return { sites, walls, ruinWalls, rayHit, segBlocked, collide, invalidateWallCache,
    FORT_POS, castle, flames, smokeSpots, towerClearings, cityInteriors, poiMarks, flags, city,
    cityMat, carSpots, enemyCamps, chestSpots, baseSites, heliSpot, bazookaSpot, towerTopY, NEXUS_INTERIOR,
    fieldRoofs };
}
