#!/usr/bin/env node
/* ================================================================
   FAIXA DE TESTE DO VR — o ciclo curto.

   A suíte completa leva ~16 minutos. Iterar em VR com esse ciclo é
   inviável, e ciclo inviável vira gente pulando teste. Este script roda
   só o que a mudança de VR pode quebrar:

     - tudo de `test/xr-*.test.js` (a frente inteira, inclusive o que
       agentes novos acrescentarem — o casamento é por padrão, não por
       lista, justamente pra não esquecer arquivo novo);
     - os testes de PC que a mudança de VR alcança, porque toda correção
       de VR mexe em mira, arma e movimento, que são compartilhados;
     - a regressão de segurança, que é invariante do projeto.

   NÃO SUBSTITUI `npm test`. O ciclo declarado pelo dono é: deploy, suíte
   COMPLETA, redeploy. Isto é a peneira de antes, para o erro barato
   aparecer em 2 minutos em vez de 16.

   Sequencial por obrigação: testes de browser usam portas fixas por
   arquivo e colidem em paralelo.
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');

/* Alcançados por qualquer mexida em mira/arma/movimento — a fonte da mira e o
   cálculo de direção são os MESMOS do PC, então quebrar VR quebra PC. */
const VIZINHOS = [
  'weapon-aim.test.js', 'weapon-ads.test.js', 'weapon-rig.test.js',
  'weapon-mechanisms.test.js', 'hitfeel-core.test.js', 'br-pve-weapons.test.js',
  'security-regression.test.js', 'touch-controls.test.js',
];

const xr = fs.readdirSync(TEST_DIR).filter(f => /^xr-.*\.test\.js$/.test(f)).sort();
const vizinhos = VIZINHOS.filter(f => fs.existsSync(path.join(TEST_DIR, f)));
const alvos = [...xr, ...vizinhos].map(f => path.join('test', f));

if (!xr.length) {
  console.error('nenhum test/xr-*.test.js encontrado — faixa de VR vazia é sinal de erro, não de sucesso');
  process.exit(1);
}

console.log(`faixa de VR: ${xr.length} arquivo(s) xr-* + ${vizinhos.length} vizinho(s) alcançado(s)\n`);
for (const a of alvos) console.log('  ' + a);
console.log('');

/* ---------- GUARDA DE ÓRFÃO ----------
   Testes de browser sobem `server.js` em porta FIXA por arquivo. Suíte
   interrompida (Ctrl+C, kill, task cancelada) deixa esse servidor vivo,
   reparentado para o init — e a próxima execução do MESMO arquivo falha com
   "test did not finish before its parent and was cancelled", que lê como
   regressão e não é. Já custou uma investigação inteira.

   Só encerra o que é PROVADAMENTE órfão: processo do `server.js` DESTE repo
   cujo pai já morreu. A porta 3000 é do servidor ao vivo do dev e nunca é
   tocada — o CLAUDE.md é explícito. */
function limparOrfaos() {
  let saida;
  try { saida = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }).stdout || ''; }
  catch { return; }
  const alvo = path.join(ROOT, 'server.js');
  const pais = new Map();
  const linhas = saida.split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean);
  for (const m of linhas) pais.set(+m[1], m[3]);
  const mortos = [];
  for (const m of linhas) {
    if (!m[3].includes(alvo)) continue;
    const pid = +m[1], ppid = +m[2];
    /* Pai vivo E que não é o init/systemd = teste em andamento: não encoste.
       Reparentado para init (1) ou para o systemd do usuário é órfão de fato. */
    const argsDoPai = pais.get(ppid) || '';
    if (ppid > 1 && argsDoPai && !/systemd/.test(argsDoPai)) continue;
    try { process.kill(pid); mortos.push(pid); } catch { /* já morreu */ }
  }
  if (mortos.length) console.log(`(limpeza: ${mortos.length} servidor(es) órfão(s) de execução anterior encerrado(s))\n`);
}

limparOrfaos();

const t0 = Date.now();
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...alvos],
  { cwd: ROOT, stdio: 'inherit' });
const seg = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\nfaixa de VR terminou em ${seg}s — lembrete: isto NÃO substitui \`npm test\``);
process.exit(r.status === null ? 1 : r.status);
