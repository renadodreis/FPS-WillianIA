/* ================================================================
   QA — js/hitfeel-core.js: a lógica pura do GAME FEEL de combate.
   Node puro (sem porta, sem browser, sem THREE, sem DOM).

   O que este arquivo TRAVA:
   - o portão de predição que impede o hitmarker de MENTIR (espelho das
     regras que o server.js aplica no shotHit/explosionHit);
   - o sabor do hitmarker (acerto / headshot / kill);
   - a curva de trauma por arma (automática não pode saturar a tela);
   - a absorção do escudo e o instante EXATO em que ele quebra;
   - o aviso de "o próximo tiro igual me mata".
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let H;
before(async () => { H = await import('../js/hitfeel-core.js'); });

/* ---------------------------------------------------------------- */
describe('constantes = contrato do servidor', () => {
  it('alcance por arma bate com server.js (FACA 4 / ESCOPETA 120 / resto 320)', () => {
    assert.equal(H.shotRange('FACA'), 4);
    assert.equal(H.shotRange('ESCOPETA'), 120);
    assert.equal(H.shotRange('FUZIL'), 320);
    assert.equal(H.shotRange('DMR'), 320);
    assert.equal(H.shotRange('SNIPER'), 320);
    assert.equal(H.shotRange('PLASMA'), 320);
    assert.equal(H.shotRange('BAZUCA'), 320);
  });
  it('tetos de dano e orçamento batem com server.js', () => {
    assert.equal(H.SHOT_DMG_CAP, 95);
    assert.equal(H.BLAST_DMG_CAP, 130);
    assert.equal(H.DMG_BUDGET_PER_S, 520);
    assert.equal(H.HITS_PER_S, 12);
    assert.equal(H.BLAST_REACH.BAZUCA, 340);
    assert.equal(H.BLAST_REACH.GRANADA, 80);
    assert.equal(H.BLAST_VICTIM_RADIUS, 12);
    assert.equal(H.SHOT_ORIGIN_TOLERANCE, 5);
  });
});

/* ---------------------------------------------------------------- */
describe('portão de predição — admitShot', () => {
  const base = {
    weapon: 'FUZIL', dist: 40, dmg: 26,
    playing: true, shooterAlive: true, victimAlive: true,
    shooterImmune: false, victimImmune: false,
  };
  const gate = () => H.createHitGate();

  it('aceita o caso normal e devolve o dano já limitado ao teto', () => {
    const g = gate();
    const r = g.admitShot(1000, { ...base, dmg: 300 });
    assert.equal(r.ok, true);
    assert.equal(r.dmg, 95, 'servidor corta em 95 — o número na tela tem de contar a verdade');
  });

  it('RECUSA escopeta além de 120 m (o servidor descarta em silêncio)', () => {
    const g = gate();
    assert.equal(g.admitShot(1000, { ...base, weapon: 'ESCOPETA', dist: 130 }).ok, false);
    assert.equal(g.admitShot(1000, { ...base, weapon: 'ESCOPETA', dist: 130 }).reason, 'range');
    assert.equal(g.admitShot(1000, { ...base, weapon: 'ESCOPETA', dist: 119 }).ok, true);
  });

  it('RECUSA faca além de 4 m', () => {
    const g = gate();
    assert.equal(g.admitShot(1000, { ...base, weapon: 'FACA', dist: 4.6 }).ok, false);
    assert.equal(g.admitShot(1000, { ...base, weapon: 'FACA', dist: 3.5 }).ok, true);
  });

  it('RECUSA alvo imune (nave / janela de queda) e atirador imune', () => {
    assert.equal(gate().admitShot(1000, { ...base, victimImmune: true }).reason, 'immune');
    assert.equal(gate().admitShot(1000, { ...base, shooterImmune: true }).reason, 'immune');
  });

  it('RECUSA alvo já morto, atirador morto e partida fora de PLAYING', () => {
    assert.equal(gate().admitShot(1000, { ...base, victimAlive: false }).reason, 'victim-dead');
    assert.equal(gate().admitShot(1000, { ...base, shooterAlive: false }).reason, 'shooter-dead');
    assert.equal(gate().admitShot(1000, { ...base, playing: false }).reason, 'phase');
  });

  it('RECUSA arma desconhecida (server.js valida por prefixo)', () => {
    assert.equal(gate().admitShot(1000, { ...base, weapon: 'MARRETA' }).reason, 'weapon');
    assert.equal(gate().admitShot(1000, { ...base, weapon: '' }).reason, 'weapon');
  });

  it('RECUSA origem do tiro longe da posição reportada (limite de 5 m)', () => {
    // acontece de verdade no helicóptero: o servidor guarda a posição da
    // AERONAVE e o cliente reportava a origem do jogador
    assert.equal(gate().admitShot(1000, { ...base, originDist: 9 }).reason, 'origin');
    assert.equal(gate().admitShot(1000, { ...base, originDist: 4.9 }).ok, true);
    assert.equal(gate().admitShot(1000, { ...base }).ok, true, 'sem informação, não inventa recusa');
  });

  it('RECUSA dano zero/negativo', () => {
    assert.equal(gate().admitShot(1000, { ...base, dmg: 0 }).reason, 'dmg');
    assert.equal(gate().admitShot(1000, { ...base, dmg: -5 }).reason, 'dmg');
  });

  it('anti-flood: 12 acertos por segundo, o 13º é recusado', () => {
    const g = gate();
    for (let i = 0; i < 12; i++) assert.equal(g.admitShot(1000 + i, { ...base, dmg: 1 }).ok, true, `acerto ${i}`);
    assert.equal(g.admitShot(1012, { ...base, dmg: 1 }).reason, 'flood');
    // a janela é deslizante: 1 s depois do primeiro, volta a caber
    assert.equal(g.admitShot(2001, { ...base, dmg: 1 }).ok, true);
  });

  it('orçamento de dano: 520/s por atirador', () => {
    const g = gate();
    for (let i = 0; i < 5; i++) assert.equal(g.admitShot(1000 + i, { ...base, dmg: 95 }).ok, true);
    // 475 gastos; 95 estouraria (570 > 520)
    assert.equal(g.admitShot(1006, { ...base, dmg: 95 }).reason, 'budget');
    assert.equal(g.admitShot(1006, { ...base, dmg: 40 }).ok, true, '515 cabe');
  });

  it('recusa NÃO consome as janelas (senão o cliente dessincroniza do servidor)', () => {
    const g = gate();
    for (let i = 0; i < 30; i++) g.admitShot(1000, { ...base, dist: 999, dmg: 95 }); // todos fora de alcance
    assert.deepEqual(g.stats(1000), { hits: 0, dmg: 0 });
    assert.equal(g.admitShot(1000, base).ok, true);
    assert.deepEqual(g.stats(1000), { hits: 1, dmg: 26 });
  });
});

/* ---------------------------------------------------------------- */
describe('portão de predição — admitBlast (granada/bazuca)', () => {
  const base = {
    kind: 'GRANADA', dmg: 90, distShooterToImpact: 30, distImpactToVictim: 4,
    playing: true, shooterAlive: true, victimAlive: true,
    shooterImmune: false, victimImmune: false,
  };
  const gate = () => H.createHitGate();

  it('aceita o caso normal e corta o dano em 130', () => {
    const r = gate().admitBlast(1000, { ...base, dmg: 400 });
    assert.equal(r.ok, true);
    assert.equal(r.dmg, 130);
  });
  it('RECUSA tipo fora de GRANADA/BAZUCA (mísseis da cidade são do servidor)', () => {
    assert.equal(gate().admitBlast(1000, { ...base, kind: 'MISSIL' }).reason, 'kind');
  });
  it('RECUSA granada arremessada além de 80 m e bazuca além de 340 m', () => {
    assert.equal(gate().admitBlast(1000, { ...base, distShooterToImpact: 90 }).reason, 'reach');
    assert.equal(gate().admitBlast(1000, { ...base, kind: 'BAZUCA', distShooterToImpact: 300 }).ok, true);
    assert.equal(gate().admitBlast(1000, { ...base, kind: 'BAZUCA', distShooterToImpact: 350 }).reason, 'reach');
  });
  it('RECUSA vítima a mais de 12 m do impacto', () => {
    assert.equal(gate().admitBlast(1000, { ...base, distImpactToVictim: 13 }).reason, 'radius');
  });
  it('divide as MESMAS janelas do tiro (é o mesmo orçamento no servidor)', () => {
    const g = H.createHitGate();
    for (let i = 0; i < 12; i++) g.admitShot(1000 + i, {
      weapon: 'FUZIL', dist: 10, dmg: 1, playing: true,
      shooterAlive: true, victimAlive: true, shooterImmune: false, victimImmune: false,
    });
    assert.equal(g.admitBlast(1012, base).reason, 'flood');
  });
});

/* ---------------------------------------------------------------- */
describe('sabor do hitmarker', () => {
  it('kill > headshot > acerto simples', () => {
    assert.equal(H.hitmarkerFlavor({ kill: true, head: true }), 'kill');
    assert.equal(H.hitmarkerFlavor({ kill: true, head: false }), 'kill');
    assert.equal(H.hitmarkerFlavor({ kill: false, head: true }), 'head');
    assert.equal(H.hitmarkerFlavor({ kill: false, head: false }), 'hit');
    assert.equal(H.hitmarkerFlavor({}), 'hit');
  });
  it('cada sabor tem duração própria e a kill é a mais longa', () => {
    assert.ok(H.hitmarkerDuration('kill') > H.hitmarkerDuration('head'));
    assert.ok(H.hitmarkerDuration('head') > H.hitmarkerDuration('hit'));
  });
});

/* ---------------------------------------------------------------- */
describe('trauma por arma', () => {
  const A = {
    FUZIL:    { rpm: 690, kick: 0.055, pellets: 1 },
    ESCOPETA: { rpm: 78,  kick: 0.15,  pellets: 8 },
    DMR:      { rpm: 150, kick: 0.11,  pellets: 1 },
    BAZUCA:   { rpm: 30,  kick: 0.3,   pellets: 1, rocket: true },
    PLASMA:   { rpm: 430, kick: 0.04,  pellets: 1 },
    SNIPER:   { rpm: 235, kick: 0.09,  pellets: 1 },
    RAJADA:   { rpm: 175, kick: 0.11,  pellets: 7 },
  };

  it('arma pesada de tiro único treme mais que automática rápida', () => {
    assert.ok(H.shotTrauma(A.ESCOPETA) > H.shotTrauma(A.FUZIL));
    assert.ok(H.shotTrauma(A.BAZUCA) > H.shotTrauma(A.ESCOPETA));
    assert.ok(H.shotTrauma(A.DMR) > H.shotTrauma(A.PLASMA));
  });

  it('fogo automático sustentado NÃO satura a tela (o antigo 0.08+kick*1.1 saturava)', () => {
    // trauma acumulado no regime permanente = (por tiro * tiros/s) / decaimento
    for (const name of ['FUZIL', 'PLASMA', 'RAJADA']) {
      const g = A[name];
      const steady = H.shotTrauma(g) * (g.rpm / 60) / H.TRAUMA_DECAY;
      assert.ok(steady <= H.SUSTAIN_CEIL + 1e-9,
        `${name} satura em ${steady.toFixed(2)} (teto ${H.SUSTAIN_CEIL})`);
    }
    // e a fórmula ANTIGA de fato estourava — prova de que a mudança tem motivo
    const old = 0.08 + A.FUZIL.kick * 1.1;
    assert.ok(old * (690 / 60) / H.TRAUMA_DECAY > 0.9, 'fuzil antigo pinava o shake no talo');
  });

  it('tiro único de arma lenta guarda o peso (não é cortado pelo teto)', () => {
    assert.ok(H.shotTrauma(A.ESCOPETA) > 0.2);
    assert.ok(H.shotTrauma(A.BAZUCA) > 0.35);
  });

  it('respeita override explícito de feel e nunca sai de faixa segura', () => {
    assert.equal(H.shotTrauma({ rpm: 600, kick: 0.05, trauma: 0.42 }), 0.42);
    for (const g of Object.values(A)) {
      const t = H.shotTrauma(g);
      assert.ok(t >= 0.03 && t <= 0.6, `fora de faixa: ${t}`);
    }
    assert.ok(H.shotTrauma({}) > 0, 'arma sem stats não pode virar NaN');
    assert.ok(Number.isFinite(H.shotTrauma({ rpm: 0, kick: NaN })));
  });
});

/* ---------------------------------------------------------------- */
describe('escudo — armorAbsorb', () => {
  it('absorve 70% do dano enquanto durar', () => {
    const r = H.armorAbsorb(50, 40);
    assert.equal(r.absorbed, 28);
    assert.equal(r.dmg, 12);
    assert.equal(r.armor, 22);
    assert.equal(r.broke, false);
  });
  it('marca o instante EXATO em que o escudo quebra (e só uma vez)', () => {
    const r = H.armorAbsorb(10, 40);
    assert.equal(r.absorbed, 10, 'só sobra o que ainda tinha');
    assert.equal(r.armor, 0);
    assert.equal(r.dmg, 30);
    assert.equal(r.broke, true, 'este é o frame do "meu escudo acabou"');
    assert.equal(H.armorAbsorb(0, 40).broke, false, 'sem escudo não há quebra');
  });
  it('sem escudo o dano passa inteiro', () => {
    const r = H.armorAbsorb(0, 33);
    assert.equal(r.dmg, 33);
    assert.equal(r.armor, 0);
    assert.equal(r.absorbed, 0);
  });
});

/* ---------------------------------------------------------------- */
describe('aviso de morte — lethalThreat', () => {
  it('acusa quando outro golpe igual mata', () => {
    assert.equal(H.lethalThreat(20, 26), true);
    assert.equal(H.lethalThreat(26, 26), true);
    assert.equal(H.lethalThreat(27, 26), false);
  });
  it('não acusa quem já morreu (a morte tem encenação própria)', () => {
    assert.equal(H.lethalThreat(0, 26), false);
    assert.equal(H.lethalThreat(-3, 26), false);
  });
});
