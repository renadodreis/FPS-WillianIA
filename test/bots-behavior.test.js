'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const botsScript = path.join(__dirname, '..', 'scripts', 'bots.js');
const Bots = require(botsScript);

function helper(name) {
  assert.equal(typeof Bots[name], 'function', `${name} deve ser exportado`);
  return Bots[name];
}

describe('Bots gerenciados', () => {
  it('pode ser importado sem iniciar sockets ou timers', () => {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(botsScript)})`], {
      timeout: 1200,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.error ? result.error.message : result.stderr);
  });

  /* Este caso EXIGIA o defeito: "prioriza o humano válido mais próximo antes
     de outros bots". Com isso todo bot num raio de 100 m escolhia o humano, e
     três bots dividiam o TTK por três (docs/mobile/referencia-bots.md, seção
     0). A régua agora é a do CoD — ameaça como soma, sem viés extra para o
     jogador no fácil (`threatbias` easy 100 contra veteran 400). */
  it('não dá prioridade absoluta ao humano: com os dois visíveis, o bot mais próximo vence', () => {
    const selectTarget = helper('selectTarget');
    const self = { id: 'self', x: 0, z: 0 };
    const candidates = [
      { id: 'bot-near', x: 4, z: 0, alive: true, phase: 'PLAY', isBot: true },
      { id: 'human-far', x: 35, z: 0, alive: true, phase: 'PLAY', isBot: false },
      { id: 'human-near', x: 18, z: 0, alive: true, phase: 'PLAY', isBot: false },
    ];

    assert.equal(selectTarget(self, candidates, 80).id, 'bot-near');
  });

  it('desconta a ameaça de quem já está sendo atacado por outros bots (−150 por atacante)', () => {
    const selectTarget = helper('selectTarget');
    const self = { id: 'self', x: 0, z: 0 };
    // 'cercado' está 4 m mais perto, mas três bots já o atacam: 3 × 150 vale 45 m
    const candidates = [
      { id: 'cercado', x: 20, z: 0, alive: true, phase: 'PLAY', isBot: false },
      { id: 'livre', x: 24, z: 0, alive: true, phase: 'PLAY', isBot: false },
    ];
    assert.equal(selectTarget(self, candidates, 80).id, 'cercado', 'sem atacantes, o mais perto vence');
    const engaged = new Map([['cercado', 3]]);
    assert.equal(selectTarget(self, candidates, 80, { t: 10, engaged }).id, 'livre');
  });

  it('quem está ferindo o bot sobe na ameaça, mesmo mais longe', () => {
    const selectTarget = helper('selectTarget');
    const self = { id: 'self', x: 0, z: 0 };
    const candidates = [
      { id: 'perto', x: 20, z: 0, alive: true, phase: 'PLAY', isBot: true },
      { id: 'atirador', x: 60, z: 0, alive: true, phase: 'PLAY', isBot: false, hurtT: 9 },
    ];
    assert.equal(selectTarget(self, candidates, 100, { t: 10 }).id, 'atirador');
    assert.equal(selectTarget(self, candidates, 100, { t: 30 }).id, 'perto', 'ferida velha não pesa mais');
  });

  it('filtra fase, vida, espectador e alcance antes de escolher alvo', () => {
    const selectTarget = helper('selectTarget');
    const self = { id: 'self', x: 0, z: 0 };
    const candidates = [
      { id: 'dead', x: 1, z: 0, alive: false, phase: 'PLAY', isBot: false },
      { id: 'spectator', x: 2, z: 0, alive: true, spectator: true, phase: 'PLAY', isBot: false },
      { id: 'falling', x: 3, z: 0, alive: true, phase: 'FALL', isBot: false },
      { id: 'too-far', x: 81, z: 0, alive: true, phase: 'PLAY', isBot: false },
      { id: 'valid-bot', x: 50, z: 0, alive: true, phase: 'PLAY', isBot: true },
    ];

    assert.equal(selectTarget(self, candidates, 80).id, 'valid-bot');
  });

  it('não escolhe alvo quando nenhum candidato é válido', () => {
    const selectTarget = helper('selectTarget');
    const self = { id: 'self', x: 0, z: 0 };

    assert.equal(selectTarget(self, [
      { id: 'ship', x: 2, z: 0, alive: true, phase: 'SHIP', isBot: false },
      { id: 'far', x: 200, z: 0, alive: true, phase: 'PLAY', isBot: true },
    ], 80), null);
  });

  it('trata zona nula como gás desligado e ainda produz waypoint finito', () => {
    const isPointInGas = helper('isPointInGas');
    const chooseWaypoint = helper('chooseWaypoint');

    assert.equal(isPointInGas(0, 0, null), false);
    assert.ok(chooseWaypoint(null, () => 0.5, 500).every(Number.isFinite));
  });

  it('considera o interior perigoso no gás inverso', () => {
    const isPointInGas = helper('isPointInGas');
    const zone = { x: 0, z: 0, r: 30, inversa: true };

    assert.equal(isPointInGas(10, 0, zone), true);
    assert.equal(isPointInGas(40, 0, zone), false);
  });

  it('escolhe waypoint fora do gás inverso', () => {
    const isPointInGas = helper('isPointInGas');
    const chooseWaypoint = helper('chooseWaypoint');
    const zone = { x: 0, z: 0, r: 60, inversa: true };
    const waypoint = chooseWaypoint(zone, () => 0.5, 100);

    assert.equal(isPointInGas(waypoint[0], waypoint[1], zone), false);
  });

  it('mantém waypoint dentro da área segura no gás clássico', () => {
    const isPointInGas = helper('isPointInGas');
    const chooseWaypoint = helper('chooseWaypoint');
    const zone = { x: 10, z: -5, r: 100, inversa: false };
    const waypoint = chooseWaypoint(zone, () => 0.5, 500);

    assert.equal(isPointInGas(waypoint[0], waypoint[1], zone), false);
  });

  it('alinha a frente -Z do avatar com a direção do movimento', () => {
    const movementYaw = helper('movementYaw');
    const dx = 3, dz = 4, length = Math.hypot(dx, dz);
    const yaw = movementYaw(dx, dz);
    const visualForward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const dot = visualForward.x * dx / length + visualForward.z * dz / length;

    assert.ok(dot > 0.999999, `avatar desalinhado: dot=${dot}`);
  });

  it('durante o disparo vira o corpo para o alvo, não para a patrulha', () => {
    const combatFacingYaw = helper('combatFacingYaw');
    const bot = { x: 0, z: 0 };
    const target = { x: 12, z: 0 };
    const yaw = combatFacingYaw(bot, target, { type: 'shoot' }, 0, 10);
    const visualForward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const dot = visualForward.x;
    assert.ok(dot > 0.999999, `bot atirou de lado: dot com alvo=${dot}`);
  });

  it('transforma playerUpdate humano em candidato selecionável', () => {
    const observePlayerUpdate = helper('observePlayerUpdate');
    const selectTarget = helper('selectTarget');
    const observed = new Map();
    observePlayerUpdate(observed, {
      id: 'human', pos: [24, 4, 0], ship: false, chute: false,
    });

    const target = selectTarget({ id: 'self', x: 0, z: 0 }, [...observed.values()], 80);
    assert.equal(target.id, 'human');
    assert.equal(target.isBot, false);
    assert.equal(target.phase, 'PLAY');
  });

  it('mantém humano observado fora da seleção enquanto está na nave ou queda', () => {
    const observePlayerUpdate = helper('observePlayerUpdate');
    const selectTarget = helper('selectTarget');
    const observed = new Map();
    const self = { id: 'self', x: 0, z: 0 };

    observePlayerUpdate(observed, { id: 'human', pos: [12, 250, 0], ship: true, chute: false });
    assert.equal(selectTarget(self, [...observed.values()], 80), null);
    observePlayerUpdate(observed, { id: 'human', pos: [12, 80, 0], ship: false, chute: true });
    assert.equal(selectTarget(self, [...observed.values()], 80), null);
  });

  it('bot com faca persegue e só ataca dentro do alcance corpo a corpo', () => {
    const chooseCombatAction = helper('chooseCombatAction');
    const bot = { x: 0, z: 0, weapon: 'FACA', ammo: Infinity };
    assert.equal(chooseCombatAction(bot, { x: 12, z: 0 }).type, 'chase');
    assert.equal(chooseCombatAction(bot, { x: 2, z: 0 }).type, 'melee');
  });

  it('bot só dispara arma encontrada enquanto ainda possui munição', () => {
    const chooseCombatAction = helper('chooseCombatAction');
    assert.equal(chooseCombatAction({ x: 0, z: 0, weapon: 'DMR', ammo: 8 }, { x: 40, z: 0 }).type, 'shoot');
    const empty = chooseCombatAction({ x: 0, z: 0, weapon: 'DMR', ammo: 0 }, { x: 2, z: 0 });
    assert.equal(empty.type, 'melee');
    assert.equal(empty.weapon, 'FACA', 'arma vazia tentou aplicar dano de DMR no melee');
  });

  it('coleta de drop equipa arma e munição em vez de criar fuzil infinito', () => {
    const applyLoot = helper('applyLoot');
    const loadout = { weapon: 'FACA', ammo: Infinity };
    applyLoot(loadout, [{ type: 'weapon', weapon: 2, ammo: 36 }, { type: 'ammo', amount: 12 }]);
    assert.deepEqual(loadout, { weapon: 'DMR', ammo: 48 });
  });

  it('drop das armas novas equipa o perfil certo (sniper leve / rajada como escopeta)', () => {
    const applyLoot = helper('applyLoot');
    const sniper = { weapon: 'FACA', ammo: Infinity };
    applyLoot(sniper, [{ type: 'weapon', weapon: 6, ammo: 30 }]);
    assert.deepEqual(sniper, { weapon: 'SNIPER', ammo: 30 });
    const rajada = { weapon: 'FACA', ammo: Infinity };
    applyLoot(rajada, [{ type: 'weapon', weapon: 7, ammo: 27 }]);
    assert.deepEqual(rajada, { weapon: 'ESCOPETA', ammo: 27 });
  });

  it('drop de arma sem munição mantém a faca como fallback de combate', () => {
    const applyLoot = helper('applyLoot');
    const loadout = { weapon: 'FACA', ammo: Infinity };
    applyLoot(loadout, [{ type: 'weapon', weapon: 2, ammo: 0 }]);
    assert.deepEqual(loadout, { weapon: 'FACA', ammo: Infinity });
  });

  it('reconstrói os baús espalhados para procurar armas no mapa', () => {
    const createBotChestSpots = helper('createBotChestSpots');
    const terrain = {
      WATER_LEVEL: -5,
      heightAt: () => 8,
      slopeAt: () => 0,
    };
    const spots = createBotChestSpots(424242, terrain);

    assert.equal(spots.length, 34);
    assert.deepEqual(spots.map(s => s.key), Array.from({ length: 34 }, (_, i) => `c${i}`));
    assert.ok(spots.every(s => Number.isFinite(s.x) && Number.isFinite(s.z)));
    assert.deepEqual(
      spots.slice(0, 2).map(s => [Number(s.x.toFixed(3)), Number(s.z.toFixed(3))]),
      [[255.61, 430.633], [-169.917, 438.013]],
    );
  });

  it('descarta pontos íngremes ou submersos ao reconstruir baús', () => {
    const createBotChestSpots = helper('createBotChestSpots');
    let slopes = 0;
    const terrain = {
      WATER_LEVEL: -5,
      heightAt: (_x, z) => z < 0 ? -10 : 8,
      slopeAt: () => slopes++ < 2 ? 0.8 : 0,
    };
    const spots = createBotChestSpots(99, terrain);

    assert.equal(spots.length, 34);
    assert.ok(spots.every(s => terrain.heightAt(s.x, s.z) >= terrain.WATER_LEVEL + 1.2));
  });

  it('reconstrói altura determinística do terreno para o bot não flutuar', async () => {
    const createBotTerrain = helper('createBotTerrain');
    const a = await createBotTerrain(424242);
    const b = await createBotTerrain(424242);
    for (const [x, z] of [[0, 0], [140, -80], [-330, 120]]) {
      assert.ok(Number.isFinite(a.heightAt(x, z)));
      assert.equal(a.heightAt(x, z), b.heightAt(x, z));
    }
  });

  it('reinicia cadência, rota e equipamento ao começar outra rodada', () => {
    const resetBotForMatch = helper('resetBotForMatch');
    const bot = {
      alive: false, hp: 0, phase: 'LOBBY', diedSent: true,
      weapon: 'DMR', ammo: 3, pendingDrop: 'd1', pendingChest: 'c1',
      lastShot: 812, wp: [100, 100],
    };
    resetBotForMatch(bot);

    assert.equal(bot.alive, true);
    assert.equal(bot.phase, 'SHIP');
    assert.equal(bot.weapon, 'FACA');
    assert.equal(bot.ammo, Infinity);
    assert.equal(bot.lastShot, -Infinity);
    assert.equal(bot.wp, null);
    assert.equal(bot.pendingDrop, null);
    assert.equal(bot.pendingChest, null);
  });

  it('nova rodada esquece o que o bot sabia da anterior (percepção, alvo, janela de erro)', () => {
    const resetBotForMatch = helper('resetBotForMatch');
    const bot = {
      aware: new Map([['h', { perceived: true }]]), targetId: 'h', engageT: 40,
      missUntil: 99, lastShotT: 50, hurtT: 45,
    };
    resetBotForMatch(bot);
    assert.equal(bot.aware.size, 0);
    assert.equal(bot.targetId, null);
    assert.equal(bot.engageT, null);
    assert.equal(bot.missUntil, -Infinity);
    assert.equal(bot.lastShotT, -Infinity);
    assert.equal(bot.hurtT, -Infinity);
  });

  it('não consome a janela de cadência enquanto não existe alvo atacável', () => {
    const canAttemptAttack = helper('canAttemptAttack');
    const bot = { weapon: 'FUZIL', lastShot: 10 };

    assert.equal(canAttemptAttack(bot, null, { type: 'patrol' }, 100, 0), false);
    assert.equal(bot.lastShot, 10, 'consulta de cadência alterou o último disparo');
    assert.equal(canAttemptAttack(bot, { id: 'p1' }, { type: 'shoot' }, 100, 0), true);
  });

  it('solta loot uma única vez por vida, também em morte ambiental (gás/cidade/AFK)', () => {
    const dropLootOnce = helper('dropLootOnce');
    const bot = { x: 1, y: 2, z: 3, weapon: 'DMR', ammo: 7, lootDropped: false };
    const sent = [];
    const emit = (ev, d) => sent.push([ev, d]);

    assert.equal(dropLootOnce(bot, emit), true);
    assert.equal(dropLootOnce(bot, emit), false, 'drop duplicado na mesma vida');
    assert.equal(sent.length, 1);
    const [ev, payload] = sent[0];
    assert.equal(ev, 'deathDrop');
    assert.deepEqual(payload.pos, [1, 2, 3]);
    assert.deepEqual(payload.items[0], { type: 'weapon', weapon: 2, ammo: 7 });
    assert.ok(payload.items.some(i => i.type === 'ammo'));
    assert.ok(payload.items.some(i => i.type === 'armor'));
  });

  it('bot só de faca não solta arma no loot, mas solta munição e colete', () => {
    const dropLootOnce = helper('dropLootOnce');
    const bot = { x: 0, y: 0, z: 0, weapon: 'FACA', ammo: Infinity, lootDropped: false };
    const sent = [];

    dropLootOnce(bot, (ev, d) => sent.push(d));
    assert.ok(sent[0].items.every(i => i.type !== 'weapon'), 'faca virou drop de arma');
  });

  it('nova rodada rearma o drop de loot da próxima vida', () => {
    const resetBotForMatch = helper('resetBotForMatch');
    const bot = { lootDropped: true };
    resetBotForMatch(bot);
    assert.equal(bot.lootDropped, false);
  });

  /* O erro tem de ser VISTO: traçante passando rente ao rosto, não no chão em
     volta do pé (Game AI Pro 3 cap. 33: "whiz tracers right past the player's
     face at eye level"; Lidén: traçante perto da cabeça é tensão e
     recompensa). A convenção do pacote continua: `playerFired` do br-game.js
     desenha até `toPos + 1 m`, então o pacote manda Y já descontado. */
  it('tiro errado passa a 0,5–1,5 m do rosto, na altura dos olhos, e segue além do alvo', () => {
    const buildMissShot = helper('buildMissShot');
    const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));
    const rng = mulberry32(5);
    const cases = [
      [{ x: 1, y: 4, z: 2, weapon: 'FUZIL' }, { x: 10, y: 7, z: 32 }, 320],
      [{ x: 0, y: 0, z: 0, weapon: 'ESCOPETA' }, { x: 3, y: 1, z: 18 }, 120],
      [{ x: 0, y: 0, z: 0, weapon: 'SNIPER' }, { x: -70, y: 12, z: 85 }, 320],
    ];
    for (const [bot, target, maxRange] of cases) {
      for (let i = 0; i < 200; i++) {
        const packet = buildMissShot(bot, target, rng);
        assert.deepEqual(packet.fromPos, [bot.x, bot.y + 1.5, bot.z]);
        const from = packet.fromPos;
        const to = [packet.toPos[0], packet.toPos[1] + 1, packet.toPos[2]]; // como br-game.js desenha
        const sx = to[0] - from[0], sz = to[2] - from[2];
        const k = ((target.x - from[0]) * sx + (target.z - from[2]) * sz) / (sx * sx + sz * sz);
        const px = from[0] + sx * k, pz = from[2] + sz * k;
        const lateral = Math.hypot(target.x - px, target.z - pz);
        const height = from[1] + (to[1] - from[1]) * k;
        assert.ok(lateral >= 0.5 - 1e-9 && lateral <= 1.5 + 1e-9, `passou a ${lateral.toFixed(2)} m do eixo do alvo`);
        assert.ok(Math.abs(height - (target.y + 1.6)) <= 0.3, `passou a ${(height - target.y).toFixed(2)} m do pé (olho: 1,6 m)`);
        assert.ok(k < 0.95, `o traçante terminou no alvo (k=${k.toFixed(2)}), não passou por ele`);
        const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        assert.ok(len <= maxRange, `pacote de ${len.toFixed(1)} m seria recusado pelo servidor (teto ${maxRange} m)`);
      }
    }
  });
});
