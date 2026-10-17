/* ================================================================
   PREWARM — linkagem antecipada de programas WebGL e upload de textura.

   Por que existe: o three só compila o programa de um material na
   PRIMEIRA vez que ele é renderizado. Com 166 materiais no jogo, a
   primeira granada, o primeiro esqueleto e a primeira explosão da
   cidade linkam shader no meio do frame — 30 a 200 ms de congelamento
   exatamente durante o tiroteio. É o "travamento" que o jogador vê,
   diferente de FPS baixo constante.

   A cura é pagar esse custo em janela segura (boot, lobby, contagem
   regressiva), onde ninguém sente. Este módulo não muda um pixel do
   visual: só antecipa trabalho que aconteceria de qualquer jeito.

   Limite conhecido e honesto: `renderer.compile` não prepara os
   materiais de profundidade do shadow map — ele só chama prepareMaterial
   no material do próprio objeto. Objetos que entram na cena depois ainda
   podem linkar o programa de sombra no primeiro frame em que projetam
   sombra — por isso `schedule`/`flush` existem, pra levar os GLBs
   tardios de volta a uma janela segura.

   POR QUE ISSO NÃO É AQUECIDO AQUI (medido, não suposto). A fusão do
   corpo dos inimigos (js/meshutils.js:fuseBody) criou a permutação
   MeshDepthMaterial+USE_SKINNING, que antes não existia: nenhum rig do
   jogo projetava sombra. Ela É de fato invisível pro compile — um
   `flush()` sozinho não acrescenta nenhum programa de profundidade.
   Só que ela JÁ nasce na janela do menu: em boot cru, sem QA e sem
   nenhum clique, `renderer.info.programs` mostra os 2 programas
   `depth`+skinning por volta do frame 40 (3 de 3 execuções), muito antes
   de o jogador conseguir começar a partida — o menu renderiza a cena do
   mundo com as cascatas do CSM, e os inimigos caem na cascata 0.

   Aquecer explicitamente foi implementado e MEDIDO: sósias dos casters
   na cena real + um `shadowMap.render`, porque a chave do programa
   carrega a contagem de luzes da CENA e uma cena auxiliar linkaria outra
   permutação, inútil. Ganho medido: zero (já estava linkado), ao custo
   de acoplar este módulo a internas do renderer. Recusado por isso.
   O que invalidaria a conta: o menu deixar de renderizar a cena do
   mundo, ou aparecer um caster SKINADO que só entra em cena depois do
   menu (hoje os rigs de GLB nascem com castShadow=false em
   js/meshutils.js:prepRiggedMesh).
   ================================================================ */

/* Texturas moram em props variadas (map, normalMap, emissiveMap,
   uniforms de ShaderMaterial...). Varrer por `isTexture` cobre todas
   sem precisar manter uma lista que envelhece. */
function collectTextures(material, out) {
  for (const key in material) {
    const value = material[key];
    if (value && value.isTexture) out.add(value);
  }
  const uniforms = material.uniforms;
  if (uniforms) {
    for (const key in uniforms) {
      const value = uniforms[key] && uniforms[key].value;
      if (value && value.isTexture) out.add(value);
    }
  }
}

export function createPrewarm({ renderer, scene, camera, alvo = null }) {
  const warmed = new Set();          // uuids já linkados
  const queue = [];                  // raízes que chegaram em hora ruim
  const stats = { runs: 0, materials: 0, textures: 0, errors: 0, lastMs: 0, variantes: 0 };

  function collectNew(root) {
    const materials = [];
    const textures = new Set();
    if (!root || typeof root.traverse !== 'function') return { materials, textures };
    /* GLB meio carregado ou nó já descartado pode explodir no traverse. O
       loop chama isto SEM await: deixar rejeitar viraria unhandledrejection
       no console do jogador por causa de uma otimização. */
    try {
      root.traverse(object => {
        const material = object && object.material;
        if (!material) return;
        const list = Array.isArray(material) ? material : [material];
        for (const m of list) {
          if (!m || warmed.has(m.uuid)) continue;
          warmed.add(m.uuid);
          materials.push(m);
          collectTextures(m, textures);
        }
      });
    } catch (e) {
      stats.errors++;
    }
    return { materials, textures };
  }

  /* O ALVO entra na chave do programa: tone mapping e espaço de cor saem do
     render target em que se desenha. O jogo desenha a cena no buffer do
     pós-processamento (linear, sem tone mapping); compilado contra a TELA, o
     programa saía com outra chave e o quadro de verdade compilava tudo de
     novo — medido: os programas de "Mercado", "eyes", "02_-_Default"
     relinkando na queda da cidade com a variante já "aquecida". `alvo()`
     devolve o target do desenho real (null = tela). O `compile` roda
     síncrono dentro de `compileAsync`, então o target volta antes da espera. */
  function compilarAgora(root) {
    const anterior = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
    try {
      if (alvo && renderer.setRenderTarget) renderer.setRenderTarget(alvo() || null);
      if (typeof renderer.compileAsync === 'function') return renderer.compileAsync(root, camera, scene);
      if (typeof renderer.compile === 'function') renderer.compile(root, camera, scene);
      return null;
    } finally {
      if (alvo && renderer.setRenderTarget) renderer.setRenderTarget(anterior);
    }
  }

  /* Nunca propaga: prewarm é otimização. Se o contexto GL sumiu ou o
     ambiente é headless, o jogo tem que continuar rodando igual. */
  async function compile(root) {
    if (!renderer) return;
    try {
      await compilarAgora(root);
    } catch (e) {
      stats.errors++;
    }
  }

  function uploadTextures(textures) {
    if (!renderer || typeof renderer.initTexture !== 'function') return 0;
    let done = 0;
    for (const texture of textures) {
      try { renderer.initTexture(texture); done++; } catch (e) { stats.errors++; }
    }
    return done;
  }

  async function warmRoot(root) {
    const started = (typeof performance !== 'undefined' ? performance : Date).now();
    const { materials, textures } = collectNew(root);
    if (!materials.length) return { materials: 0, textures: 0, ms: 0, skipped: true };
    await compile(root);
    const uploaded = uploadTextures(textures);
    const ms = (typeof performance !== 'undefined' ? performance : Date).now() - started;
    stats.runs++;
    stats.materials += materials.length;
    stats.textures += uploaded;
    stats.lastMs = ms;
    return { materials: materials.length, textures: uploaded, ms, skipped: false };
  }

  /* VARIANTES DE LUZ (2026-10-17). A chave do programa carrega a CONTAGEM
     de luzes da cena, e o three guarda um programa por material POR contagem
     (`materialProperties.programs` é um Map). Quando a nave aparece (+4) ou
     a cidade cai (+2 ruínas, +1 explosão), todo material relinka no quadro
     seguinte — medido numa partida real (RTX 3050): 14–24 programas e
     188–288 ms por troca; o ANGLE/D3D11 do Windows compila várias vezes mais
     devagar. Aqui cada contagem extra é linkada na janela segura. As luzes de
     aquecimento (intensidade 0) entram e saem DENTRO desta chamada — o
     `compile` é síncrono antes da espera —, então nenhum quadro é desenhado
     com elas. Em FATIAS de 20 ms (objeto a objeto): a cena inteira de uma
     vez travou o lobby por 2,7 s com a máquina carregada — e a cena inteira
     já tinha travado o boot (br-game.js, ao lado do `buildShip`). Material
     que chega depois (GLB tardio) entra na próxima fatia. */
  const porVariante = new Map();      // nº de luzes extras → chaves já linkadas nela
  const FATIA_MS = 20;                // por quadro: o lobby continua fluido em máquina lenta
  const agora = () => (typeof performance !== 'undefined' ? performance : Date).now();
  /* a chave do programa também depende do OBJETO (instanciado, skinado):
     material + tipo de malha */
  const chaveDe = (o, m) => m.uuid + (o.isInstancedMesh ? 'i' : '') + (o.isSkinnedMesh ? 's' : '') + (o.isBatchedMesh ? 'b' : '');
  function pendentesDa(feitos) {
    const fila = [];
    try {
      scene.traverse(object => {
        const material = object && object.material;
        if (!material || !(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return;
        for (const m of Array.isArray(material) ? material : [material])
          if (m && !feitos.has(chaveDe(object, m))) { fila.push(object); return; }
      });
    } catch (e) {
      stats.errors++;
    }
    return fila;
  }
  async function warmLightVariant(extras, luzes, fatiaMs = FATIA_MS) {
    if (!renderer) return false;
    for (const k of extras) {
      let feitos = porVariante.get(k);
      if (!feitos) porVariante.set(k, (feitos = new Set()));
      const fila = pendentesDa(feitos);
      if (!fila.length) continue;
      const usadas = luzes.slice(0, k);
      const prontos = [];
      const t0 = agora();
      for (const l of usadas) scene.add(l);
      try {
        for (const o of fila) {
          prontos.push(compilarAgora(o));
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) feitos.add(chaveDe(o, m));
          if (agora() - t0 > fatiaMs) break;
        }
      } catch (e) {
        stats.errors++;
      } finally {
        for (const l of usadas) scene.remove(l);
      }
      stats.variantes++;
      try { await Promise.all(prontos); } catch (e) { stats.errors++; }
      return true;
    }
    return false;
  }

  return {
    /* Linka uma fatia (≤ 20 ms) do que falta na primeira contagem de luzes
       extras com pendência; true = trabalhou (chame de novo no próximo
       quadro). `luzes`: PointLights de intensidade 0 criadas por quem chama
       (criar Object3D consome o rand seedado). `fatiaMs`: teto por quadro. */
    luzes(extras, luzes, fatiaMs) { return warmLightVariant(extras, luzes, fatiaMs); },

    /* Linka tudo que ainda falta na raiz dada (padrão: a cena toda).
       Chame só em janela segura — boot, lobby, contagem regressiva. */
    warm(root = scene) { return warmRoot(root); },

    /* Um GLB terminou de carregar durante a partida: guarda pra depois
       em vez de travar o frame agora. */
    schedule(root) { if (root) queue.push(root); },

    /* Janela segura chegou: drena a fila e revisa a cena principal. */
    async flush() {
      const totals = { materials: 0, textures: 0, ms: 0, skipped: true };
      const roots = queue.splice(0, queue.length);
      roots.push(scene);
      for (const root of roots) {
        const r = await warmRoot(root);
        totals.materials += r.materials;
        totals.textures += r.textures;
        totals.ms += r.ms;
        if (!r.skipped) totals.skipped = false;
      }
      return totals;
    },

    /* Trocar sombra/qualidade marca os materiais com needsUpdate, o que
       relinka o programa. Esquecer o que foi aquecido força novo warm. */
    invalidate() { warmed.clear(); },

    get stats() { return { ...stats, queued: queue.length, warmed: warmed.size }; },
  };
}
