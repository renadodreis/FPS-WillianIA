/* ================================================================
   CONVERSA COM O APARELHO — adb, socket de depuração e escolha de aba.

   Extraído de scripts/vr-baseline.js quando o segundo script precisou das
   mesmas três coisas. Cada função aqui carrega uma armadilha que já custou
   uma tarde; os comentários são o motivo de ela existir.
   ================================================================ */
'use strict';
const { execFileSync } = require('node:child_process');

function adb(args, { quiet = false } = {}) {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`adb ${args.join(' ')} falhou: ${(e.stderr || e.message || '').toString().trim()}`,
      { cause: e });
  }
}

/* Aparelhos AUTORIZADOS. `adb devices` também lista `unauthorized` e
   `offline`, e tratar esses como presentes leva a sondar um aparelho que não
   responde — o erro sai lá na frente, disfarçado de bug do jogo. */
function aparelhos() {
  try {
    return adb(['devices']).split('\n').slice(1)
      .filter(l => /\tdevice$/.test(l)).map(l => l.split('\t')[0]);
  } catch { return []; }
}

/* O socket de depuração do navegador do Quest não tem nome fixo entre
   versões; ele aparece no /proc/net/unix como `@..._devtools_remote`. Só
   existe com o navegador NO AR, e leva alguns segundos pra subir depois do
   intent — por isso a espera por condição. */
async function findDevtoolsSocket(limiteMs = 30000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const unix = adb(['shell', 'cat', '/proc/net/unix']);
    const nomes = [...new Set(unix.split('\n')
      .map(l => (/@([\w.]*devtools_remote[\w.]*)/.exec(l) || [])[1])
      .filter(Boolean))];
    const escolhido = nomes.find(n => /oculus|browser/i.test(n)) || nomes[0];
    if (escolhido) return escolhido;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('nenhum socket devtools no aparelho — confira se o navegador do Quest ' +
    'abriu e se "Depuração USB" está ligada em Configurações > Sistema > Modo de desenvolvedor');
}

/* Todas as abas que estão no jogo. Devolve LISTA, não a primeira: abas
   duplicadas são um defeito real (as de trás ficam `hidden`, param de
   desenhar e não respondem a clique NUNCA MAIS), e quem chama precisa poder
   avisar em vez de escolher uma no escuro e seguir. */
async function abasDoJogo(browser, port) {
  const abas = await browser.pages();
  return abas.filter(p => p.url().includes(`:${port}/`));
}

module.exports = { adb, aparelhos, findDevtoolsSocket, abasDoJogo };
