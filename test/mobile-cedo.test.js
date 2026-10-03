/* ================================================================
   A DETECÇÃO DE CELULAR DO <head> É A DO JOGO — C4 (laudo af4eb8f).

   A classe `mobile` precisa existir ANTES da 1ª pintura (senão o celular vê
   a dica de teclado do menu até o módulo do jogo rodar, ~4 s no 4G, e para
   sempre na tela de falha do vigia). O script clássico do index.html é uma
   CÓPIA da regra de js/mobile.js `detectMobile` — e cópia diverge. Este
   arquivo roda a cópia (o texto do index.html, num sandbox) e a regra do
   jogo na MESMA tabela de ambientes, inclusive lixo, e cobra igualdade.
   Node puro.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function scriptCedo() {
  const i = HTML.indexOf('CELULAR ANTES DA 1ª PINTURA');
  assert.ok(i > 0, 'o index.html não tem o script de celular cedo');
  const a = HTML.indexOf('<script>', i), b = HTML.indexOf('</script>', a);
  return HTML.slice(a + '<script>'.length, b);
}
/* roda a cópia num sandbox com o ambiente dado; devolve se pôs a classe */
function rodaCopia(codigo, env) {
  const classes = [];
  const janela = {
    navigator: { userAgent: env.userAgent, maxTouchPoints: env.maxTouchPoints, platform: env.platform },
    screen: { width: env.screenW, height: env.screenH },
    location: { search: env.search || '' },
    matchMedia: env.matchMediaLanca ? () => { throw new Error('x'); } : () => ({ matches: env.matchesCoarse === true }),
  };
  const sandbox = { window: janela, document: { documentElement: { classList: { add: c => classes.push(c) } } } };
  vm.runInNewContext(codigo, sandbox);
  return classes.includes('mobile');
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  semToken: 'Mozilla/5.0 (Linux; U; Fabricante Obscuro) AppleWebKit/537.36',
};
const CASOS = [];
for (const [nome, ua] of Object.entries(UA)) {
  for (const platform of ['MacIntel', 'Win32', 'Linux armv8l', 'iPhone', undefined]) {
    for (const maxTouchPoints of [0, 1, 5, 10, -3, NaN, '5', undefined]) {
      // rentes ao limiar de 900 px (menor lado), dos dois lados
      for (const [screenW, screenH] of [[390, 844], [820, 1180], [1920, 1080], [0, 0], [undefined, undefined], [412, undefined], [2560, 1440], [899, 1600], [900, 1600], [1600, 950], [999, 2000]]) {
        for (const matchesCoarse of [true, false, 'sim']) {
          CASOS.push({ nome, userAgent: ua, platform, maxTouchPoints, screenW, screenH, matchesCoarse });
        }
      }
    }
  }
}
for (const search of ['?mobile=1', '?mobile=0', '?x=1&mobile=1', '?mobile=2', '?mobile=1x']) {
  for (const ua of [UA.iphone, UA.win]) CASOS.push({ nome: 'busca ' + search, userAgent: ua, platform: 'Win32', maxTouchPoints: 0, screenW: 1920, screenH: 1080, matchesCoarse: false, search });
}
CASOS.push({ nome: 'matchMedia explode', userAgent: UA.semToken, platform: 'Linux', maxTouchPoints: 5, screenW: 412, screenH: 900, matchMediaLanca: true });
CASOS.push({ nome: 'UA não-string', userAgent: 42, platform: 'MacIntel', maxTouchPoints: 0, screenW: 1440, screenH: 900, matchesCoarse: false });

describe('detecção de celular cedo (index.html) = js/mobile.js', () => {
  let Mob, codigo;
  before(async () => {
    Mob = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'mobile.js')).href);
    codigo = scriptCedo();
  });

  it(`a cópia do <head> decide igual ao jogo em ${CASOS.length} ambientes`, t => {
    const diverge = [];
    let celulares = 0;
    for (const env of CASOS) {
      const jogo = Mob.detectMobile({ ...env, matchesCoarse: env.matchMediaLanca ? false : env.matchesCoarse }).mobile;
      const copia = rodaCopia(codigo, env);
      if (jogo) celulares++;
      if (jogo !== copia) diverge.push({ ...env, jogo, copia });
    }
    t.diagnostic(`${CASOS.length} ambientes, ${celulares} celulares pelo jogo; divergências: ${diverge.length}${diverge[0] ? ' — ex.: ' + JSON.stringify(diverge[0]) : ''}`);
    assert.ok(celulares > 100 && celulares < CASOS.length - 100, `cenário: ${celulares} celulares em ${CASOS.length}`);
    assert.deepEqual(diverge.slice(0, 3), []);
  });

  it('a cópia roda ANTES do style.css aplicar e do <body> existir (no <head>)', () => {
    const head = HTML.slice(0, HTML.indexOf('</head>'));
    assert.ok(head.includes('CELULAR ANTES DA 1ª PINTURA'), 'o script de celular cedo saiu do <head>');
  });
});
