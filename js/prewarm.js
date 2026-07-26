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
   materiais de profundidade do shadow map. Objetos que entram na cena
   depois ainda podem linkar o programa de sombra no primeiro frame em
   que projetam sombra — por isso `schedule`/`flush` existem, pra levar
   os GLBs tardios de volta a uma janela segura.
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

export function createPrewarm({ renderer, scene, camera }) {
  const warmed = new Set();          // uuids já linkados
  const queue = [];                  // raízes que chegaram em hora ruim
  const stats = { runs: 0, materials: 0, textures: 0, errors: 0, lastMs: 0 };

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

  /* Nunca propaga: prewarm é otimização. Se o contexto GL sumiu ou o
     ambiente é headless, o jogo tem que continuar rodando igual. */
  async function compile(root) {
    if (!renderer) return;
    try {
      if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(root, camera, scene);
      else if (typeof renderer.compile === 'function') renderer.compile(root, camera, scene);
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

  return {
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
