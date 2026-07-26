/* ================================================================
   SOAK / MONKEY — o jogo se joga sozinho, por horas, e para no
   instante em que uma invariante quebra.

   Diferença pro resto do tooling do repo:
     - `stress.js`  mede REDE e servidor (30 bots, RTT, matchEnd).
     - `bots.js`    joga via socket, sem cliente de verdade.
     - `soak.js`    dirige o CLIENTE REAL com input aleatório e checa,
                    a cada passo, invariantes que nenhum teste escrito
                    à mão cobre em volume.

   O sorteio é SEEDADO: a mesma seed reproduz a mesma sequência de
   ações. Quando algo quebra, o relatório traz a seed, o passo exato e
   as últimas ações — e `--replay` refaz o caminho.

   Uso:
     node scripts/soak.js                        # 20 mil passos, seed aleatória
     node scripts/soak.js --passos=200000        # rodada longa
     node scripts/soak.js --seed=12345           # reproduz uma rodada
     node scripts/soak.js --replay=output/soak-12345.json
     node scripts/soak.js --perfil=meu.json      # outros pesos de ação

   Parametrização fica em scripts/soak-profile.json — não neste arquivo.
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('../test/helpers/harness.js');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const replayFile = args.replay ? path.resolve(String(args.replay)) : null;
const replay = replayFile ? JSON.parse(fs.readFileSync(replayFile, 'utf8')) : null;

const PORT = +(args.porta || args.port || 3285);
const PASSOS = +(args.passos || args.steps || (replay ? replay.passo + 50 : 20000));
// seed de 32 bits: cabe no mulberry32 e é curta o bastante pra copiar na mão
const SEED = +(args.seed ?? (replay ? replay.seed : (Date.now() ^ (process.pid * 2654435761)) >>> 0)) >>> 0;
const LOTE = +(args.lote || 500); // passos por evaluate: progresso sem estourar o protocolo

const perfilPath = path.resolve(String(args.perfil || args.profile ||
  path.join(__dirname, 'soak-profile.json')));
const perfil = JSON.parse(fs.readFileSync(perfilPath, 'utf8'));

if (!CHROME) {
  console.error('Chrome não encontrado — o soak dirige o cliente real, não dá pra pular.');
  process.exit(2);
}

/* ---------------------------------------------------------------
   O laço roda DENTRO da página: uma ação por round-trip do
   puppeteer daria ~2 passos/s. Aqui dá milhares.
   --------------------------------------------------------------- */
function driverNaPagina(cfg) {
  const G = window.QA.G, MP = window.QA.MP, QA = window.QA;
  const R = MP.renderer;

  /* Estado do driver sobrevive entre lotes. */
  if (!window.__soak) {
    window.__soak = {
      rngState: cfg.seed >>> 0,
      passo: 0,
      trilha: [],           // últimas ações, pra reproduzir o caminho
      contagem: {},         // quantas vezes cada ação rodou
      historico: [],        // amostras periódicas: distingue leak de load
      baseEstavel: null,    // baseline só após o platô de carregamento
      amostraDoBaseline: -1,
      picoSimMs: 0,
    };
  }
  const S = window.__soak;

  // mulberry32: mesma família usada pelo worldgen do jogo
  function rnd() {
    S.rngState = (S.rngState + 0x6D2B79F5) >>> 0;
    let t = S.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const entre = (a, b) => a + rnd() * (b - a);
  const escolher = lista => lista[Math.floor(rnd() * lista.length) % lista.length];

  const pesos = cfg.acoes;
  const nomes = Object.keys(pesos).filter(k => pesos[k] > 0);
  const somaPesos = nomes.reduce((s, k) => s + pesos[k], 0);
  function sortearAcao() {
    let r = rnd() * somaPesos;
    for (const nome of nomes) { r -= pesos[nome]; if (r <= 0) return nome; }
    return nomes[nomes.length - 1];
  }

  const $ = id => document.getElementById(id);
  function mexerSelect(id, valores) {
    const sel = $(id);
    if (!sel) return null;
    const v = escolher(valores);
    sel.value = v;
    sel.dispatchEvent(new Event('change'));
    return v;
  }

  const ACOES = {
    olhar() {
      MP.camera.rotation.y += entre(-1.2, 1.2);
      MP.camera.rotation.x = Math.max(-1.5, Math.min(1.5, MP.camera.rotation.x + entre(-0.5, 0.5)));
    },
    andar() {
      QA.clearInput();
      for (const k of ['w', 'a', 's', 'd']) if (rnd() < 0.4) G.keys[k] = true;
    },
    correr() { G.keys.shift = !G.keys.shift; },
    pular() { G.keys[' '] = true; MP.justPressed.add('Space'); },
    agachar() { G.keys.control = !G.keys.control; },
    atirar() { G.mouse.shooting = rnd() < 0.7; G.mouse.clicked = true; },
    mirar() { G.mouse.aiming = !G.mouse.aiming; },
    recarregar() { MP.justPressed.add('KeyR'); },
    trocarArma() { G.switchWeapon(Math.floor(entre(0, 8))); },
    granada() { MP.justPressed.add('KeyG'); },
    kitMedico() { MP.justPressed.add('KeyQ'); },
    comerCarne() { MP.justPressed.add('KeyF'); },
    interagir() { MP.justPressed.add('KeyE'); },
    veiculo() { G.tryToggleCar(); },
    teleportar() {
      const lim = MP.CFG.WORLD_SIZE / 2 - 20;
      QA.reset(entre(-lim, lim), entre(-lim, lim));
    },
    pausar() { G.state.paused = !G.state.paused; },
    redimensionar() {
      const w = Math.round(entre(320, 2560)), h = Math.round(entre(240, 1440));
      MP.camera.aspect = w / h;
      MP.camera.updateProjectionMatrix();
      R.setSize(w, h);
      MP.composer.setSize(w, h);
      window.dispatchEvent(new Event('resize'));
    },
    configResolucao() { mexerSelect('setRes', ['1', '1.5', '2']); },
    configSombra() { mexerSelect('setShadow', ['0', '1']); },
    configBloom() { mexerSelect('setBloom', ['0', '1']); },
    configAutoRes() { mexerSelect('setAutoRes', ['0', '1']); },
  };

  /* ---- invariantes: o que NUNCA pode acontecer ---- */
  const L = cfg.limites;
  const fin = v => Number.isFinite(v);
  /* `info.memory.textures` conta o que está na GPU — inclui render target,
     que não vive no grafo de cena. Contar também as texturas ALCANÇÁVEIS
     pela cena separa os dois casos: cena crescendo = material/objeto
     vazando; cena estável com GPU crescendo = render target realocado. */
  function texturasNaCena() {
    const vistas = new Set();
    MP.scene.traverse(o => {
      const mat = o.material;
      if (!mat) return;
      for (const m of (Array.isArray(mat) ? mat : [mat])) {
        if (!m) continue;
        for (const k in m) { const v = m[k]; if (v && v.isTexture) vistas.add(v.uuid); }
      }
    });
    return vistas.size;
  }
  /* ANTI-TRAPAÇA sob jogo aleatório: o LOD de lâmina troca de anel toda vez
     que o jogador atravessa uma célula. Se alguma dessas trocas TIRAR lâmina
     do mapa, vira wallhack contra quem está deitado no mato. Aqui a contagem
     total é vigiada a cada amostra, ao longo de milhares de travessias. */
  function totalDeLaminas() {
    try {
      const lods = G.Grass && G.Grass.debugLod ? G.Grass.debugLod() : null;
      return lods ? lods.reduce((s, l) => s + l.laminas, 0) : -1;
    } catch (e) { return -1; }
  }
  function medir() {
    return {
      corpos: MP.world.bodies.length,
      programas: R.info.programs ? R.info.programs.length : 0,
      geometrias: R.info.memory.geometries,
      texturas: R.info.memory.textures,
      texturasCena: texturasNaCena(),
      filhos: MP.scene.children.length,
      laminas: totalDeLaminas(),
      t: Date.now(), // load é limitado por relógio, não por passo
    };
  }
  function checar() {
    const P = MP.player;
    const lim = MP.CFG.WORLD_SIZE / 2 + L.margemForaDoMundo;

    if (!fin(P.pos.x) || !fin(P.pos.y) || !fin(P.pos.z))
      return `posição do jogador não-finita (${P.pos.x}, ${P.pos.y}, ${P.pos.z})`;
    if (Math.abs(P.pos.x) > lim || Math.abs(P.pos.z) > lim)
      return `jogador fora do mundo (${P.pos.x.toFixed(1)}, ${P.pos.z.toFixed(1)}), limite ${lim}`;
    if (P.pos.y < L.alturaMin || P.pos.y > L.alturaMax)
      return `altura absurda y=${P.pos.y.toFixed(1)}`;
    if (!fin(P.vel.x) || !fin(P.vel.y) || !fin(P.vel.z))
      return 'velocidade do jogador não-finita';
    if (Math.hypot(P.vel.x, P.vel.y, P.vel.z) > L.velocidadeMax)
      return `velocidade estourada ${Math.hypot(P.vel.x, P.vel.y, P.vel.z).toFixed(1)}`;
    if (!fin(P.health) || P.health < 0 || P.health > P.maxHealth + 0.001)
      return `vida fora da faixa: ${P.health}/${P.maxHealth}`;
    if (P.armor < -0.001) return `armadura negativa: ${P.armor}`;

    const g = G.gun;
    if (g && g.ammo !== undefined && (!fin(g.ammo) || g.ammo < 0))
      return `munição inválida: ${g.ammo}`;

    if (!fin(G.perf.simMs)) return 'perf.simMs não-finito';
    const pr = R.getPixelRatio();
    if (!fin(pr) || pr < L.pixelRatioMin) return `pixelRatio inválido: ${pr}`;
    const teto = G.renderQuality.ceiling;
    if (pr > teto + 1e-6) return `pixelRatio ${pr} acima do teto ${teto}`;

    return null;
  }

  /* Vazamento ≠ carregamento.

     GLB, textura e material chegam por load ASSÍNCRONO: o contador sobe em
     rampa e depois ESTABILIZA. Vazamento nunca estabiliza. Um baseline fixo
     confunde os dois — foi o que aconteceu aqui duas vezes ("textura 15->48",
     "15->20->75"), e nas duas o histórico mostrou platô em 90 logo depois.

     Critério honesto: o baseline só existe DEPOIS que os recursos param de
     subir por 3 amostras seguidas. Antes disso não há veredito nenhum. Isso
     se auto-calibra: máquina lenta demora mais a carregar, o platô demora
     mais a chegar, e nada é acusado no meio da rampa. */
  const CAMPOS = [
    ['corpos', 'corpos físicos'], ['geometrias', 'geometria'],
    ['texturas', 'textura na GPU'], ['texturasCena', 'textura na cena'],
    ['filhos', 'nós na cena'], ['programas', 'programa WebGL'],
  ];
  /* Duas condições, e as duas são necessárias:

     (a) TEMPO DE PAREDE. `QA.tick` roda solto, então "passos" andam com a CPU
         enquanto o download do GLB anda com o relógio. Numa máquina rápida
         3 mil passos passam antes do primeiro asset chegar.
     (b) PLATÔ LONGO. Assets chegam em rajadas com buracos no meio; 3 amostras
         planas caem dentro de um buraco e fixavam baseline no meio da rampa
         (foi assim que "platô 3 -> 8 -> 63" foi acusado sem vazamento nenhum). */
  function tentarFixarBaseline() {
    if (S.baseEstavel) return;
    const h = S.historico;
    const N = cfg.amostrasDePlato;
    if (h.length < N + 1) return;
    if (h[h.length - 1].t - h[0].t < cfg.assentarMs) return;
    const ult = h.slice(-N);
    const estabilizou = CAMPOS.every(([c]) => ult.every(s => s[c] <= ult[0][c]));
    if (estabilizou) { S.baseEstavel = ult[0]; S.amostraDoBaseline = h.length - N; }
  }
  function checarVazamento() {
    tentarFixarBaseline();
    if (!S.baseEstavel) return null; // ainda carregando: sem veredito
    const h = S.historico;
    const b = S.baseEstavel, ultimo = h[h.length - 1], antes = h[h.length - 3];
    if (!antes || h.length - S.amostraDoBaseline < 4) return null;
    for (const [campo, rotulo] of CAMPOS) {
      if (campo === 'programas') continue; // critério próprio, absoluto
      const cresceuNoTotal = ultimo[campo] > b[campo] * L.fatorVazamento;
      const aindaCresce = ultimo[campo] > antes[campo] * 1.15;
      if (cresceuNoTotal && aindaCresce)
        return `vazamento de ${rotulo}: platô ${b[campo]} -> ${antes[campo]} -> ${ultimo[campo]} (ainda subindo)`;
    }
    // programa WebGL não vem de asset: crescer depois do platô é recompilação
    if (ultimo.programas > b.programas + L.programasExtras)
      return `recompilação de shader em loop: platô ${b.programas} -> ${ultimo.programas}`;
    // grama nunca pode RALEAR: menos lâmina = adversário deitado fica visível
    if (ultimo.laminas >= 0 && b.laminas >= 0 && ultimo.laminas !== b.laminas)
      return `contagem de lâminas de grama mudou: ${b.laminas} -> ${ultimo.laminas} (vetor de wallhack)`;
    return null;
  }

  /* ---- laço do lote ---- */
  const forcadas = cfg.forcadas || null; // replay: sequência exata de ações
  let feitos = 0;
  while (feitos < cfg.lote && S.passo < cfg.passos) {
    const nome = forcadas ? forcadas[S.passo] : sortearAcao();
    const acao = ACOES[nome];
    let erroAcao = null;
    if (acao) {
      try { acao(); } catch (e) { erroAcao = `${nome} lançou: ${e && e.message}`; }
    }
    S.contagem[nome] = (S.contagem[nome] || 0) + 1;
    S.trilha.push(nome);
    if (S.trilha.length > 40) S.trilha.shift();

    try { QA.tick(cfg.ticksPorAcao, 1 / 60); }
    catch (e) { erroAcao = erroAcao || `tick lançou após ${nome}: ${e && e.message}`; }

    if (G.perf.simMs > S.picoSimMs) S.picoSimMs = G.perf.simMs;

    S.passo++;
    feitos++;
    // amostra periódica depois do warmup: alimenta o detector de vazamento
    if (S.passo > cfg.warmup && S.passo % cfg.intervaloAmostra === 0) {
      S.historico.push(medir());
    }
    const violacao = erroAcao || checar() || checarVazamento();
    if (violacao) {
      return {
        ok: false, passo: S.passo, acao: nome, violacao,
        trilha: S.trilha.slice(), contagem: S.contagem,
        medida: medir(), base: S.baseEstavel, historico: S.historico, picoSimMs: S.picoSimMs,
      };
    }
  }

  return {
    ok: true, passo: S.passo, contagem: S.contagem,
    medida: medir(), base: S.baseEstavel, historico: S.historico, picoSimMs: S.picoSimMs,
  };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const relatorio = path.join(OUT_DIR, `soak-${SEED}.json`);
  console.log(`soak: seed=${SEED} passos=${PASSOS} perfil=${path.basename(perfilPath)}` +
    (replay ? ` (REPLAY de ${path.basename(replayFile)})` : ''));

  const h = await bootGame({ port: PORT, protocolTimeout: 600000 });
  const t0 = Date.now();
  let ultimo;
  try {
    const cfgBase = {
      seed: SEED,
      passos: PASSOS,
      lote: LOTE,
      warmup: Math.min(400, Math.floor(PASSOS / 5)),
      intervaloAmostra: +(args.amostra || 250),
      assentarMs: +(args.assentar || 45000),
      amostrasDePlato: +(args.plato || 6),
      ticksPorAcao: perfil.ticksPorAcao || 12,
      acoes: perfil.acoes,
      limites: perfil.limites,
      forcadas: replay && replay.forcadas ? replay.forcadas : null,
    };

    while (true) {
      const r = await h.play(driverNaPagina, cfgBase);
      ultimo = r;
      if (!r.ok) {
        const segundos = ((Date.now() - t0) / 1000).toFixed(0);
        console.error(`\n❌ INVARIANTE QUEBRADA no passo ${r.passo} (${segundos}s)`);
        console.error(`   ação: ${r.acao}`);
        console.error(`   problema: ${r.violacao}`);
        console.error(`   últimas ações: ${r.trilha.join(' > ')}`);
        fs.writeFileSync(relatorio, JSON.stringify({
          seed: SEED, passo: r.passo, acao: r.acao, violacao: r.violacao,
          trilha: r.trilha, contagem: r.contagem, base: r.base, medida: r.medida,
          perfil: perfilPath, comoReproduzir: `node scripts/soak.js --seed=${SEED} --passos=${r.passo + 10}`,
        }, null, 2));
        console.error(`\n   relatório: ${relatorio}`);
        console.error(`   reproduzir: node scripts/soak.js --seed=${SEED} --passos=${r.passo + 10}\n`);
        break;
      }
      const pct = ((r.passo / PASSOS) * 100).toFixed(0);
      const taxa = (r.passo / Math.max(1, (Date.now() - t0) / 1000)).toFixed(0);
      const simulado = ((r.passo * cfgBase.ticksPorAcao) / 60 / 60).toFixed(1);
      process.stdout.write(`\r  ${pct}% — passo ${r.passo}/${PASSOS} · ${taxa} passos/s · ${simulado} min de jogo simulados   `);
      if (r.passo >= PASSOS) { console.log(''); break; }
    }

    // erros de console/página valem tanto quanto invariante quebrada
    const errosPagina = h.pageErrors.concat(h.consoleErrors);
    if (errosPagina.length) {
      console.error(`\n❌ ${errosPagina.length} erro(s) de console/página durante o soak:`);
      for (const e of errosPagina.slice(0, 10)) console.error(`   ${e}`);
      if (ultimo && ultimo.ok) process.exitCode = 1;
    }

    if (ultimo && ultimo.ok && !errosPagina.length) {
      const segundos = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`\n✅ ${ultimo.passo} passos sem violação em ${segundos}s.`);
      console.log(`   pico de simMs: ${ultimo.picoSimMs.toFixed(1)} ms`);
      console.log(`   platô de recursos:`, ultimo.base ? JSON.stringify(ultimo.base) : 'NUNCA ESTABILIZOU (rodada curta demais ou vazamento real)');
      console.log(`   final:`, JSON.stringify(ultimo.medida));
      if (!ultimo.base) console.log('   ⚠ recursos NUNCA estabilizaram — rodada curta ou vazamento real');
      if (ultimo.historico && ultimo.historico.length) {
        console.log('   histórico texturas (GPU/cena):',
          ultimo.historico.map(h => `${h.texturas}/${h.texturasCena}`).join(' '));
        console.log('   histórico geometrias:', ultimo.historico.map(h => h.geometrias).join(' '));
      }
      const top = Object.entries(ultimo.contagem).sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log(`   ações mais sorteadas: ${top.map(([k, v]) => `${k}=${v}`).join(' ')}`);
    } else if (ultimo && !ultimo.ok) {
      process.exitCode = 1;
    }
  } finally {
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
