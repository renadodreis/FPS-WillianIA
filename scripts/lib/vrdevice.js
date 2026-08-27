/* ================================================================
   CONVERSA COM O APARELHO — adb, socket de depuração e escolha de aba.

   Extraído de scripts/vr-baseline.js quando o segundo script precisou das
   mesmas três coisas. Cada função aqui carrega uma armadilha que já custou
   uma tarde; os comentários são o motivo de ela existir.
   ================================================================ */
'use strict';
const fs = require('node:fs');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

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

/* ================================================================
   TELEMETRIA DO RUNTIME (VrApi) — a única fonte de TEMPO que existe.

   O runtime da Meta cospe uma linha por segundo no logcat com FPS real
   contra o modo de tela, tempo de aplicação, ocupação de GPU/CPU, térmica e
   memória. É a mesma fonte que o OVR Metrics Tool mostra, e é o que fecha
   E1, E4 e E5 do critério — nenhum desses três é observável do PC.

     I/VrApi: FPS=58/90,...,App=11.36ms,CPU&GPU=16.88ms,GPU%=0.81,Temp=45.0C

   Origem deste bloco: `scripts/vr-baseline.js`, que ainda carrega a própria
   cópia. Aqui é o lugar canônico (dois consumidores agora); a migração do
   baseline é uma linha de `require` e ficou para uma rodada que possa tocar
   naquele arquivo — esta frente não podia.
   ================================================================ */
const mediana = a => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);

/* `arquivo`: caminho opcional onde as linhas CRUAS são espelhadas. Número
   resumido sem o log bruto ao lado não é auditável — e o resumo é feito por
   este arquivo, que é exatamente quem estaria errado. */
function coletorVrApi({ arquivo = null } = {}) {
  /* LIMPA O BUFFER ANTES DE OUVIR. Sem isto o `logcat` despeja o que já estava
     no anel — minutos ou horas de VrApi de uma sessão ANTERIOR — e as primeiras
     janelas do roteiro somam amostras que não são desta corrida. É a diferença
     entre medir a sessão e medir o histórico do aparelho. */
  spawnSync('adb', ['logcat', '-c'], { stdio: 'ignore' });
  const proc = spawn('adb', ['logcat', '-s', 'VrApi:V', '-v', 'brief'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const bruto = arquivo ? fs.createWriteStream(arquivo, { flags: 'a' }) : null;
  const amostras = [];
  let resto = '';
  const num = (linha, chave, re) => {
    const m = new RegExp(chave + re).exec(linha);
    return m ? +m[1] : null;
  };
  proc.on('error', () => { /* sem adb no PATH: quem chama vê 0 amostras e reporta isso */ });
  proc.stdout.on('data', b => {
    resto += b.toString();
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      if (bruto) bruto.write(l + '\n');
      if (!/FPS=/.test(l)) continue;
      amostras.push({
        t: Date.now(),
        fps: num(l, 'FPS=', '([0-9]+)/'),
        modo: num(l, 'FPS=[0-9]+/', '([0-9]+)'),
        appMs: num(l, 'App=', '([0-9.]+)ms'),
        cpuGpuMs: num(l, 'CPU&GPU=', '([0-9.]+)ms'),
        gpu: num(l, 'GPU%=', '([0-9.]+)'),
        cpu: num(l, 'CPU%=', '([0-9.]+)'),
        stale: num(l, 'Stale=', '([0-9]+)'),
        tear: num(l, 'Tear=', '([0-9]+)'),
        tempC: num(l, 'Temp=', '([0-9.]+)C'),
        livreMB: num(l, 'Free=', '([0-9]+)MB'),
      });
    }
  });
  return {
    amostras,
    parar() {
      try { proc.kill(); } catch { /* já morreu */ }
      try { if (bruto) bruto.end(); } catch { /* já fechado */ }
    },
  };
}

/* Resumo de uma JANELA de tempo de parede. `de`/`ate` vêm de quem sabe o que
   estava acontecendo — sem recorte, a média mistura o menu com o castelo e
   descreve um jogo que ninguém jogou.

   `piorFps`/`abaixoDe60` existem porque o critério E1 não é sobre mediana:
   ele reprova "qualquer janela sustentada abaixo de 60". Mediana boa com vale
   fundo é exatamente o caso que a média esconde. */
function resumirVrApi(amostras, de, ate) {
  const janela = amostras.filter(a => a.t >= de && a.t <= ate && a.fps !== null);
  if (!janela.length) return { amostras: 0 };
  const fps = janela.map(a => a.fps);
  return {
    amostras: janela.length,
    fps: mediana(fps),
    piorFps: Math.min(...fps),
    melhorFps: Math.max(...fps),
    abaixoDe60: fps.filter(f => f < 60).length,
    abaixoDaTaxa: fps.filter((f, i) => janela[i].modo !== null && f < janela[i].modo).length,
    modoTela: mediana(janela.map(a => a.modo)),
    appMs: mediana(janela.map(a => a.appMs)),
    piorAppMs: Math.max(...janela.map(a => a.appMs ?? 0)),
    cpuGpuMs: mediana(janela.map(a => a.cpuGpuMs)),
    gpuPct: mediana(janela.map(a => a.gpu)),
    cpuPct: mediana(janela.map(a => a.cpu)),
    stale: mediana(janela.map(a => a.stale)),
    /* O CRITÉRIO PEDE ZERO, E MEDIANA ESCONDE ZERO. Com 300 amostras e um
       único frame repetido, a mediana é 0 e o veredito sai VERDE sobre um
       dado reprovante. Quem decide E1 é o PIOR e o TOTAL. */
    staleMax: Math.max(0, ...janela.map(a => (typeof a.stale === 'number' ? a.stale : 0))),
    staleSoma: janela.reduce((n, a) => n + (typeof a.stale === 'number' ? a.stale : 0), 0),
    tear: janela.reduce((n, a) => n + (a.tear || 0), 0),
    tempC: mediana(janela.map(a => a.tempC)),
    piorTempC: Math.max(...janela.map(a => a.tempC ?? 0)),
    livreMB: mediana(janela.map(a => a.livreMB)),
  };
}

/* ---------- sensor de presença ----------
   Fora da cabeça a sessão vira `visible-blurred`/`hidden` e o compositor PARA
   de chamar `session.requestAnimationFrame`: a medição sai com zero frame.
   `prox_close` engana o sensor.

   RESTAURAR NÃO É OPCIONAL: deixar ligado é deixar o headset sem dormir,
   gastando bateria até acabar. Por isso as duas metades moram na mesma
   função — quem pega uma leva a outra. */
function automacaoDePresenca() {
  const grito = a => {
    try { adb(['shell', 'am', 'broadcast', '-a', `com.oculus.vrpowermanager.${a}`], { quiet: true }); return true; } catch { return false; }
  };
  let enganado = false;
  return {
    get enganado() { return enganado; },
    /* Só faz sentido com NINGUÉM no aparelho. Numa sessão com humano de
       headset o sensor já está fechado pela testa dele, e mexer nisso só
       deixaria lixo para restaurar. */
    enganar() { enganado = grito('prox_close'); return enganado; },
    restaurar() { const r = grito('automation_disable'); enganado = false; return r; },
  };
}

/* ---------- capturas de tela feitas DE DENTRO do headset ----------
   `Page.captureScreenshot` do CDP trava no navegador do Quest, e mesmo quando
   volta ele fotografa o canvas 2D — não o que o compositor mandou pros olhos.
   A imagem que vale para G4/G5 é a que o próprio sistema grava quando o
   jogador aperta Meta + gatilho: essa passa pelo compositor.

   Daí o desenho: um MARCADOR com a hora de início, e no fim `find -newer`.
   Nada de adivinhar pasta por versão de sistema — procura em todas as
   candidatas e devolve o que achou (ou nada, e quem chama reporta "nada",
   nunca um caminho inventado). */
const PASTAS_DE_CAPTURA = ['/sdcard/Oculus/Screenshots', '/sdcard/Oculus/VideoShots',
  '/sdcard/Pictures', '/sdcard/DCIM', '/sdcard/Movies'];
const MARCADOR = '/sdcard/.vr-sessao-marcador';

function marcarCapturas() {
  try { adb(['shell', 'touch', MARCADOR], { quiet: true }); return true; } catch { return false; }
}

/* Devolve os arquivos criados depois do marcador, já puxados para `destino`.
   Falha de faxina NUNCA derruba medição: tudo em try/catch, e a lista sai
   vazia em vez de explodir. */
function puxarCapturas(destino) {
  const achados = [];
  for (const pasta of PASTAS_DE_CAPTURA) {
    let saida;
    try { saida = adb(['shell', 'find', pasta, '-type', 'f', '-newer', MARCADOR], { quiet: true }); } catch { continue; }
    for (const linha of saida.split('\n')) {
      const remoto = linha.trim();
      if (!remoto || /No such file|Permission denied/i.test(remoto)) continue;
      const nome = remoto.split('/').pop();
      const local = `${destino}/${nome}`;
      try { adb(['pull', remoto, local], { quiet: true }); achados.push({ remoto, local }); } catch { /* segue */ }
    }
  }
  try { adb(['shell', 'rm', '-f', MARCADOR], { quiet: true }); } catch { /* já foi */ }
  return achados;
}

/* ---------- abrir o jogo no aparelho e falar com ele por CDP ----------
   A ordem aqui é toda cicatriz:
     1. `adb reverse` ANTES do intent — o navegador não pode abrir a URL antes
        de existir rota pra ela (e localhost no aparelho é o que dá contexto
        seguro sem HTTPS: sem isso `navigator.xr` nem aparece).
     2. o intent só ACORDA o navegador. A URL vai sem query de propósito: o
        `adb shell` entrega a linha ao shell do aparelho, que come `?` e `&`.
        Quem navega de verdade é o CDP.
     3. o socket de depuração só nasce com o navegador NO AR, e o nome varia
        entre versões — por isso a busca por condição.

   `cdpPort` é parâmetro e não constante porque `vr-controles.js` usa a 9222 e
   remove o encaminhamento dela ao terminar: quem quiser rodar os dois na
   mesma sessão precisa de porta própria, senão o túnel morre no meio. */
async function conectarNavegadorDoQuest({ port, cdpPort = 9222, url = null }) {
  const puppeteer = require('puppeteer-core');
  adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
    '-d', url || `http://localhost:${port}/`], { quiet: true });
  const socket = await findDevtoolsSocket();
  adb(['forward', `tcp:${cdpPort}`, `localabstract:${socket}`]);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`, protocolTimeout: 600000,
  });
  return {
    browser, socket,
    async soltar() {
      try { await browser.disconnect(); } catch { /* já caiu */ }
      try { adb(['forward', '--remove', `tcp:${cdpPort}`], { quiet: true }); } catch { /* já removido */ }
    },
  };
}

module.exports = { adb, aparelhos, findDevtoolsSocket, abasDoJogo,
  coletorVrApi, resumirVrApi, automacaoDePresenca,
  marcarCapturas, puxarCapturas, conectarNavegadorDoQuest };
