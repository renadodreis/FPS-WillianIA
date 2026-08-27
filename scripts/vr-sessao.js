#!/usr/bin/env node
/* ================================================================
   SESSÃO HUMANA DE VR — o kit que transforma "eu joguei e achei ruim"
   em medição arquivada.

   POR QUE ESTE ARQUIVO EXISTE. Oito critérios de `docs/vr/criterio-aaa.md`
   NÃO são certificáveis do PC, em nenhuma rodada, por nenhum teste:

     E1  fps travado no aparelho        ─┐
     E3  escala de render                │ só o APARELHO mede tempo
     E4  tempo de lógica por frame       │ (`adb logcat -s VrApi`)
     E5  térmica em 30 min               │
     F1  4 s até gráfico rastreado      ─┘
     I1  vinte minutos, vinte caixas    ─┐
     G4  texto e mira legíveis           │ só um HUMANO de headset responde
     G5  uma captura por entrega        ─┘

   O validador repete há cinco rodadas: **sem as caixas marcadas por um
   humano, a rodada não está validada** — por mais verde que a suíte esteja.
   O que faltava não era disposição do dono do projeto: era um kit que
   fizesse o tempo dele render. Hoje ele põe o headset, joga, e volta com
   uma impressão; daqui em diante ele põe o headset, segue um roteiro de
   20 minutos, e o computador escreve o resto.

   A DIVISÃO DE TRABALHO, QUE É O PROJETO INTEIRO DESTE SCRIPT:

     o COMPUTADOR colhe o que ninguém consegue anotar de dentro do
     headset — FPS real por item do roteiro, tempo de app, GPU%, térmica,
     memória, folga cabeça↔chão, separação cabeça↔colisor, vinheta,
     quais armas a mão alcançou, erros de console, marcos de boot;

     o HUMANO responde o que nenhum número alcança — se a arma está na
     mão dele, se dá para ver pelo buraco da alça, se o texto é legível,
     se enjoou, se travou.

   A REGRA QUE GOVERNA O ARQUIVO INTEIRO: **nada é inventado.** Item sem
   resposta do humano sai no relatório como `aguardando humano`; janela sem
   amostra de VrApi sai como `aguardando aparelho`. Sem aparelho conectado
   ele PARA na primeira camada e diz o que fazer — é a mesma regra que
   `vr-controles.js` já implementa, e é o motivo de este kit poder ser
   levado a sério: uma sonda que devolve número quando não mediu nada é
   pior que sonda nenhuma (já custou cinco rodadas nesta frente).

   O FLUXO REAL, QUE É O QUE FEZ O ROTEIRO SER ASSIM: quem está de headset
   NÃO VÊ O TERMINAL. Então o roteiro é (a) locucionável — um item por vez,
   em bloco grande, para outra pessoa ler em voz alta — e (b) falado pelo
   próprio PC quando há `spd-say` na máquina (o Quest 3 tem alto-falante
   aberto: quem está de headset ouve a sala). Mostrar o item DENTRO do
   painel de VR seria melhor, e o custo disso está avaliado no fim de
   `docs/vr/roteiro-humano.md` — mas o painel é de outra frente e não se
   mexe nele sem medir.

   Uso:
     npm run vr:sessao                  # sessão completa de 20 min
     npm run vr:sessao -- --minutos=30  # fecha E5 (que pede 30)
     npm run vr:sessao -- --frio        # limpa o cache: é o que F1 exige
     npm run vr:sessao -- --ensaio      # SEM aparelho: só imprime e arquiva
     npm run vr:sessao -- --roteiro     # regera docs/vr/roteiro-humano.md
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { aparelhos, coletorVrApi, resumirVrApi, automacaoDePresenca,
  marcarCapturas, puxarCapturas, conectarNavegadorDoQuest, abasDoJogo } = require('./lib/vrdevice.js');

const ROOT = path.join(__dirname, '..');

/* ---------- linha de comando ---------- */
const cfg = { porta: 3530, cdp: 9223, minutos: 20, seed: '424242', voz: 1,
  ensaio: false, roteiro: false, frio: false, entrar: false, controles: 10, presenca: 0 };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (!(k in cfg)) continue;
  cfg[k] = v === undefined ? true : (isNaN(+v) ? v : +v);
}

/* ================================================================
   O ROTEIRO — fonte única.

   Este vetor é o que o terminal imprime, o que a voz fala, o que o
   relatório cobra e o que `docs/vr/roteiro-humano.md` publica. Uma fonte
   só porque roteiro em dois lugares diverge no terceiro dia, e aí o
   humano executa uma versão e o relatório cobra outra.

   A ORDEM É PROJETO, NÃO GOSTO. Ela minimiza tirar e pôr o headset: o
   aparelho sai da cabeça UMA vez, no penúltimo item, que é justamente o
   teste de perder o foco (F2). A numeração do critério (`I1#n`) aparece
   em cada item porque a folha de I1 é cobrada por número, não por ordem.

   Cada item tem FAÇA (uma frase), OBSERVE, APROVA e REPROVA — sem margem
   de interpretação, porque interpretação de quem está enjoado não é dado.
   ================================================================ */
const ROTEIRO = [
  {
    /* ESTE ITEM PERGUNTA SOBRE O QUE JÁ ACONTECEU, e isso é de propósito.
       Ele roda DEPOIS do portão que exige `XR.presenting === true` — ou seja,
       depois de a pessoa já ter entrado em VR. Escrito como "toque em entrar
       agora" ele era INEXECUTÁVEL: mandava fazer uma coisa que já tinha sido
       feita, e a resposta viria de memória sem ninguém avisar. Por isso o
       portão agora ANUNCIA o que observar antes de pedir o toque, e este item
       só colhe a resposta. */
    cod: 'BOOT', i1: 1, crit: ['I1#1', 'F1'], s: 10,
    faca: 'Responda sobre a entrada em VR que você acabou de fazer (o aviso veio antes do toque).',
    observe: 'quanto tempo passou até o mundo se mexer junto com a sua cabeça.',
    aprova: 'o mundo apareceu e acompanhou a cabeça em até 4 s, OU apareceu um indicador de carregamento DENTRO do VR desde o primeiro segundo.',
    reprova: 'tela preta, splash 2D, ou mais de 4 s sem nada em VR.',
    fala: 'Item um. Sobre a entrada que você acabou de fazer: o mundo acompanhou sua cabeça em até quatro segundos?',
  },
  {
    cod: 'DE PÉ', i1: 2, crit: ['I1#2', 'C3', 'C5'], s: 30,
    faca: 'Fique parado e olhe para baixo, para os próprios pés.',
    observe: 'a altura do olho e se alguma parte de corpo entra na sua cabeça.',
    aprova: 'você está de pé com os pés no chão, na sua altura real, e nada de corpo atravessa o seu olho.',
    reprova: 'você está enterrado, flutuando, na altura errada, ou vê o interior de uma cabeça/ombro.',
    fala: 'Item dois. Fique parado e olhe para os seus pés.',
  },
  {
    cod: 'PASSO FÍSICO', i1: 3, crit: ['I1#3', 'C2', 'C1'], s: 60,
    faca: 'Ande FISICAMENTE 1,5 m para frente, para trás e para os dois lados (sem analógico).',
    observe: 'se o corpo do jogo veio junto com você.',
    aprova: 'o mundo se move na medida do seu passo e a arma continua no lugar em relação a você.',
    reprova: 'você anda e o mundo fica parado, ou o corpo fica para trás e a arma some do campo de visão.',
    fala: 'Item três. Ande fisicamente um metro e meio para cada lado, sem usar o analógico.',
  },
  {
    cod: 'PAREDE', i1: 4, crit: ['I1#4', 'C2'], s: 40,
    faca: 'Ande FISICAMENTE contra uma parede, uma pedra ou o carro.',
    observe: 'se o jogo te para.',
    aprova: 'a parede te barra e você não atravessa.',
    reprova: 'você atravessa a parede andando fisicamente.',
    fala: 'Item quatro. Ande fisicamente contra uma parede e veja se ela te para.',
  },
  {
    cod: 'GIRO', i1: 5, crit: ['I1#5', 'A1', 'A2'], s: 45,
    faca: 'Dê quatro passos de giro para a direita e quatro para a esquerda com o analógico direito.',
    observe: 'se a cabeça SÓ GIRA, ou se o mundo também desliza de lado.',
    aprova: 'a cada passo o mundo gira em torno de você e nada desliza; a piscada é curta e não incomoda.',
    reprova: 'sensação de ser puxado de lado a cada passo, ou giro contínuo em rajada segurando o analógico.',
    fala: 'Item cinco. Dê quatro passos de giro para cada lado e veja se a cabeça só gira, sem deslizar.',
  },
  {
    cod: 'VINHETA', i1: 6, crit: ['I1#6', 'A5', 'A3'], s: 45,
    faca: 'Ande com o analógico esquerdo por 10 s e PARE de vez.',
    observe: 'o escurecimento da periferia enquanto anda, e o que sobra ao parar.',
    aprova: 'a periferia fecha ao andar e ABRE POR COMPLETO ao parar; a velocidade parece de gente, não de carro.',
    reprova: 'sobra escuro na periferia depois de parar, ou a velocidade é claramente sobre-humana.',
    fala: 'Item seis. Ande dez segundos com o analógico e pare. Veja se a periferia abre por completo.',
  },
  {
    cod: 'ARMA NA MÃO', i1: 7, crit: ['I1#7', 'B1', 'B2'], s: 35,
    faca: 'Levante a arma e gire o punho devagar, olhando para ela.',
    observe: 'onde a arma está em relação à sua mão real e se ela acompanha 1:1.',
    aprova: 'a arma está NA sua mão, no ângulo da sua mão, e acompanha sem atraso, sem balanço e sem respiração.',
    reprova: 'a arma flutua à frente da mão, está torta, treme sozinha ou balança quando você anda.',
    fala: 'Item sete. Levante a arma e gire o punho. Ela está na sua mão, no ângulo da sua mão?',
  },
  {
    cod: 'PELO BURACO DA ALÇA', i1: 8, crit: ['I1#8', 'B3', 'B4', 'G4'], s: 50,
    faca: 'Traga a arma até o olho como se fosse mirar de verdade (aperte a empunhadura direita).',
    observe: 'se dá para ver PELA alça e se a massa de mira fica no meio dela.',
    aprova: 'você olha pelo buraco da alça, a massa fica centrada, e a arma não deu salto nenhum ao apertar o botão.',
    reprova: 'a arma teleporta ao apertar, some na sua cara, ou não existe alinhamento possível.',
    fala: 'Item oito. Traga a arma até o olho e veja se dá para ver pelo buraco da alça, com a massa no meio.',
  },
  {
    cod: 'TIRO E TATO', i1: 9, crit: ['I1#9', 'B6', 'B7'], s: 35,
    faca: 'Atire cinco vezes com o gatilho direito.',
    observe: 'de onde sai o tiro e o que a mão sente.',
    aprova: 'o tiro sai do CANO e você sente o háptico na mão que atirou.',
    reprova: 'tiro saindo do vazio à frente da mão, ou mão sem retorno nenhum.',
    fala: 'Item nove. Atire cinco vezes. O tiro sai do cano? A mão sente?',
  },
  {
    cod: 'ACERTO', i1: 10, crit: ['I1#10', 'B3'], s: 40,
    faca: 'Alinhe a mira num inimigo, num barril ou numa parede próxima e atire.',
    observe: 'se acerta o que estava alinhado.',
    aprova: 'o tiro acerta onde a mira da arma estava apontando.',
    reprova: 'o tiro vai para outro lugar, ou você precisa apontar o ROSTO para acertar.',
    fala: 'Item dez. Mire em alguma coisa pela mira da arma e atire. Acertou o que estava alinhado?',
  },
  {
    cod: 'RECARGA E AS 8 ARMAS', i1: 11, crit: ['I1#11', 'D1'], s: 60,
    faca: 'Recarregue (botão de cima da esquerda) e troque de arma (botão de cima da direita) até dar a volta inteira.',
    observe: 'quantas armas diferentes a sua mão alcança.',
    aprova: 'a recarga acontece e você chega nas 8 armas.',
    reprova: 'a recarga não sai, ou a troca fica presa nas primeiras armas.',
    fala: 'Item onze. Recarregue e troque de arma até dar a volta inteira. Chegou nas oito?',
  },
  {
    cod: 'HUD NO MUNDO', i1: 12, crit: ['I1#12', 'H1', 'H2', 'G4'], s: 45,
    faca: 'Procure vida, munição, arma atual e o resto do HUD.',
    observe: 'se a informação existe DENTRO do mundo e se dá para ler sem aproximar a cabeça.',
    aprova: 'você vê vida, munição e arma atual em espaço de mundo, legíveis, sem nada colado na cara.',
    reprova: 'falta informação essencial, o texto é ilegível, ou o painel acompanha a sua cabeça.',
    fala: 'Item doze. Procure vida e munição. Dá para ler tudo, dentro do mundo?',
  },
  {
    cod: 'BAÚ', i1: 13, crit: ['I1#13', 'D3', 'D4'], s: 50,
    faca: 'Chegue perto de um baú e abra (botão de baixo da esquerda).',
    observe: 'se o baú avisa que dá para abrir ANTES de você tentar.',
    aprova: 'o baú tem destaque visível no headset quando você chega perto, e abre.',
    reprova: 'nenhum destaque, ou não abre, ou só abre de longe demais/perto demais.',
    fala: 'Item treze. Chegue num baú. Ele se destaca? Abre?',
  },
  {
    cod: 'CARRO', i1: 14, crit: ['I1#14', 'D5', 'C1'], s: 70,
    faca: 'Entre no carro (botão de baixo da esquerda), dirija um pouco e saia.',
    observe: 'se a cabeça continua livre dentro do carro e onde você aparece ao sair.',
    aprova: 'você entra, a cabeça continua rastreando dentro da cabine, nada gira a vista sozinho, e você sai DE PÉ no chão.',
    reprova: 'câmera colada no banco sem rastreio, vista girando sozinha, ou saída enterrada/voando.',
    fala: 'Item quatorze. Entre no carro, dirija um pouco e saia. A cabeça continua livre? Você sai de pé?',
  },
  {
    cod: 'CAPTURA', i1: 0, crit: ['G5', 'G4'], s: 30,
    faca: 'Segure o botão Meta do controle direito e aperte o gatilho — duas vezes: uma olhando o HUD, outra olhando a paisagem.',
    observe: 'nada: é só a foto. Ela sai do compositor, que é a imagem que os seus olhos receberam.',
    aprova: 'você ouviu o clique da captura duas vezes.',
    reprova: 'não conseguiu capturar.',
    fala: 'Item quinze. Segure o botão Meta e aperte o gatilho para capturar a tela. Duas vezes: uma no HUD, outra na paisagem.',
  },
  {
    cod: 'NAVE E PARAQUEDAS', i1: 15, crit: ['I1#15', 'D1', 'A6'], s: 90,
    faca: 'Abra o menu (clique do analógico direito), entre numa partida de BR, pule da nave (botão de baixo da direita) e abra o paraquedas.',
    observe: 'se o pulo e o paraquedas saem pelo controle, e se a vista fica livre na queda.',
    aprova: 'você pula, abre o paraquedas, e a queda é dirigida sem que nada empurre a sua vista.',
    reprova: 'pulo ou paraquedas que não saem pelo controle, ou vista arrastada/pilotada pelo rosto.',
    fala: 'Item dezesseis. Entre numa partida de bê érre, pule da nave e abra o paraquedas.',
  },
  {
    cod: 'BAÚ DO BR', i1: 16, crit: ['I1#16', 'D1'], s: 45,
    faca: 'No chão da partida de BR, abra um baú.',
    observe: 'se ele abre pelo controle.',
    aprova: 'o baú do BR abre e você pega o que tem dentro.',
    reprova: 'não abre pelo controle.',
    fala: 'Item dezessete. Abra um baú do bê érre.',
  },
  {
    cod: 'MORTE', i1: 17, crit: ['I1#17', 'I4', 'H1'], s: 50,
    faca: 'Morra (deixe um inimigo te acertar, ou pule de bem alto) e leia a tela de morte.',
    observe: 'se a tela de morte existe dentro do mundo e se dá para sair dela pelo controle.',
    aprova: 'a tela de morte aparece em espaço de mundo e você sai dela apontando o raio e apertando o gatilho.',
    reprova: 'tela de morte invisível no headset, ou beco sem saída.',
    fala: 'Item dezoito. Morra e leia a tela de morte. Dá para sair dela pelo controle?',
  },
  {
    cod: 'PAUSA, MENU E SAÍDA', i1: 18, crit: ['I1#18', 'F5', 'I4'], s: 60,
    faca: 'Clique o analógico direito para pausar, volte ao jogo, pause de novo, abra o menu e saia da partida.',
    observe: 'se o ciclo inteiro acontece sem tirar o aparelho.',
    aprova: 'pausar, voltar, abrir o menu e sair da partida — tudo pelo controle, sem tirar o headset.',
    reprova: 'qualquer passo que só o mouse resolveria.',
    fala: 'Item dezenove. Pause, volte, abra o menu e saia da partida. Tudo sem tirar o aparelho.',
  },
  {
    /* O bloco que existe para o APARELHO, não para o humano: E1 pede 20 min
       contínuos, E5 pede curva térmica, E3 e E4 pedem regime. Nada disso se
       mede em pose parada — daí "jogue normalmente". */
    cod: 'JOGO CONTÍNUO', i1: 0, crit: ['E1', 'E3', 'E4', 'E5', 'I3', 'I2'], s: 0, soak: true,
    faca: 'Volte para uma partida e JOGUE NORMALMENTE até eu avisar.',
    observe: 'qualquer coisa que atravesse o seu olho, engasgo, ou desconforto crescente.',
    aprova: 'nada atravessa o olho, a imagem não engasga e o desconforto não cresce.',
    reprova: 'geometria entrando no olho, travadas, ou enjoo aumentando com o tempo.',
    fala: 'Agora jogue normalmente. Eu aviso quando terminar. Preste atenção em qualquer coisa que atravesse o seu olho.',
  },
  {
    cod: 'DEPOIS DE TUDO', i1: 20, crit: ['I1#20', 'E1', 'E5'], s: 40,
    faca: 'Pare um instante e avalie a imagem agora, no fim da sessão.',
    observe: 'se a fluidez é a mesma do começo e se o aparelho esquentou.',
    aprova: 'continua tão fluido quanto no primeiro minuto e nada indica queda por calor.',
    reprova: 'ficou mais travado, mais borrado, ou o aparelho está quente a ponto de avisar.',
    fala: 'Último bloco. A imagem continua tão fluida quanto no começo?',
  },
  {
    /* `pausa` marca o ÚNICO bloco em que o aparelho sai da cabeça. Ele fica no
       fim de propósito, e a janela dele é EXCLUÍDA da conta de E1/E5: durante
       ele a sessão está `visible-blurred` e o compositor para — contar esses
       segundos como queda de fps reprovaria o jogo por fazer certo o que o
       critério F2 mandou fazer. */
    cod: 'TIRAR O APARELHO', i1: 19, crit: ['I1#19', 'F2'], s: 60, pausa: true,
    faca: 'Tire o aparelho da cabeça, conte até dez, e ponha de volta.',
    observe: 'o que o jogo fez enquanto você estava fora e ao voltar.',
    aprova: 'o jogo pausou sozinho e voltou inteiro, sem perder a partida e sem entrada fantasma.',
    reprova: 'a partida continuou correndo sem você, travou, ou voltou quebrada.',
    fala: 'Último item. Tire o aparelho, conte até dez, e ponha de volta.',
  },
];

/* Itens que fecham as caixas de I1 — a folha é cobrada por número. */
const CAIXAS_I1 = ROTEIRO.filter(r => r.i1).sort((a, b) => a.i1 - b.i1);

/* ================================================================
   VOZ — o único jeito de o roteiro chegar em quem está de headset
   quando não há ninguém para ler em voz alta. O Quest 3 tem
   alto-falante ABERTO: quem está com o aparelho ouve a sala.
   `spd-say` é o que existe nesta máquina; sem ele, silêncio, e o
   roteiro volta a depender de um locutor humano.
   ================================================================ */
const TEM_VOZ = (() => {
  if (!cfg.voz) return false;
  try { return spawnSync('sh', ['-c', 'command -v spd-say'], { encoding: 'utf8' }).stdout.trim() !== ''; } catch { return false; }
})();

function falar(texto) {
  if (!TEM_VOZ || !texto) return;
  try {
    spawn('spd-say', ['-C'], { stdio: 'ignore' }).on('error', () => {});
    spawn('spd-say', ['-l', 'pt-BR', '-r', '-10', texto], { stdio: 'ignore' }).on('error', () => {});
  } catch { /* voz é conforto, nunca requisito */ }
}

/* ================================================================
   TERMINAL — um item por vez, em bloco grande, para quem acompanha
   de fora ler em voz alta.
   ================================================================ */
const LARG = 78;
const risca = c => c.repeat(LARG);
const bloco = txt => {
  const linhas = [];
  for (const p of String(txt).split('\n')) {
    let atual = '';
    for (const w of p.split(' ')) {
      if ((atual + ' ' + w).trim().length > LARG - 12) { linhas.push(atual); atual = w; } else atual = (atual + ' ' + w).trim();
    }
    linhas.push(atual);
  }
  return linhas;
};
function imprimirItem(item, n, total, segundos) {
  console.log('\n' + risca('━'));
  console.log(`  ITEM ${n}/${total} · ${item.cod}${item.i1 ? `  ·  fecha a caixa I1#${item.i1}` : ''}`);
  console.log(`  critérios: ${item.crit.join(', ')}${segundos ? `  ·  ${segundos}s` : ''}`);
  console.log(risca('─'));
  const campo = (rot, txt) => bloco(txt).forEach((l, i) => console.log(`  ${i ? '        ' : rot.padEnd(8)}${l}`));
  campo('FAÇA:', item.faca);
  campo('OLHE:', item.observe);
  console.log('');
  campo('APROVA', item.aprova);
  campo('REPROVA', item.reprova);
  console.log(risca('━'));
}

/* ---------- controle por teclado ----------
   Modo cru para uma tecla bastar: quem está ao lado do jogador não pode
   estar procurando o Enter. Fora de TTY (log redirecionado, CI) o kit não
   trava esperando tecla — ele anda pelo relógio e marca tudo como
   `aguardando humano`, que é a verdade. */
function criarControle() {
  const tty = !!process.stdin.isTTY;
  let ouvinte = null, nota = null, buffer = '';
  if (tty) {
    readline.emitKeypressEvents(process.stdin);
    try { process.stdin.setRawMode(true); } catch { /* terminal sem raw: segue pelo relógio */ }
    process.stdin.resume();
    process.stdin.on('keypress', (str, key) => {
      if (key && key.ctrl && key.name === 'c') { process.emit('SIGINT'); return; }
      if (nota) {                       // digitando o motivo da reprovação
        if (key && key.name === 'return') { const t = buffer; buffer = ''; const f = nota; nota = null; process.stdout.write('\n'); f(t); return; }
        if (key && key.name === 'backspace') { buffer = buffer.slice(0, -1); process.stdout.write('\b \b'); return; }
        if (str) { buffer += str; process.stdout.write(str); }
        return;
      }
      if (ouvinte) ouvinte(str, key);
    });
  }
  return {
    tty,
    /* Devolve `{ veredito, motivo }`. `veredito` só é 'aprova'/'reprova'
       quando um humano apertou a tecla — o relógio devolve `null`, que o
       relatório imprime como "aguardando humano". */
    esperar(segundos) {
      return new Promise(resolve => {
        let fim = false;
        const acabar = (veredito, motivo) => {
          if (fim) return; fim = true;
          clearInterval(relogio); clearTimeout(prazo); ouvinte = null;
          process.stdout.write('\r' + ' '.repeat(LARG) + '\r');
          resolve({ veredito, motivo: motivo || null });
        };
        let t0 = Date.now();
        const dica = '  [a]=aprova  [r]=reprova  [enter]=próximo  [+]=mais tempo  [q]=encerrar';
        /* A contagem regressiva só existe em terminal de verdade: escrita com
           `\r` em log redirecionado vira um paredão ilegível. */
        const relogio = this.tty ? setInterval(() => {
          const resta = Math.max(0, segundos - Math.round((Date.now() - t0) / 1000));
          if (!nota) process.stdout.write(`\r${dica}   ${String(resta).padStart(3)}s `);
        }, 250) : null;
        let prazo = segundos > 0 ? setTimeout(() => acabar(null), segundos * 1000) : null;
        if (!this.tty) return;          // sem teclado: só o relógio manda
        ouvinte = (str, key) => {
          const n = (key && key.name) || str;
          if (n === 'a') return acabar('aprova');
          if (n === 'q') return acabar('encerrar');
          if (n === 'return' || n === 'space' || n === 'n') return acabar(null);
          /* Mais 30 s: o relógio é sugestão, não juiz. Item cortado no meio
             produz resposta chutada, que é pior que resposta nenhuma. */
          if (n === '+' || n === '=') {
            clearTimeout(prazo); segundos = 30; t0 = Date.now();
            prazo = setTimeout(() => acabar(null), 30000);
            return;
          }
          if (n === 'r') {
            process.stdout.write('\r' + ' '.repeat(LARG) + '\r  motivo (enter para terminar): ');
            nota = motivo => acabar('reprova', motivo);
          }
        };
      });
    },
    fechar() {
      if (!tty) return;
      try { process.stdin.setRawMode(false); } catch { /* já estava */ }
      process.stdin.pause();
    },
  };
}

/* ================================================================
   SONDA NA PÁGINA — o que o humano não consegue anotar.

   Instalada UMA vez, dentro da própria página do jogo, e estritamente
   de LEITURA: ela não chama nada do jogo que mude estado, não conduz
   frame nenhum e não cria instância própria de módulo. É a regra que a
   skill `vr-quest` chama de "andaime que vira produto" — seis defeitos
   desta frente nasceram de sonda que MEXIA.

   Por que a amostragem anda em `session.requestAnimationFrame` e não só
   num `setInterval`: dentro de sessão imersiva o painel 2D pode ser
   considerado escondido, e temporizador de aba escondida é estrangulado
   pelo navegador. O relógio fica como batimento de segurança (e é o que
   sobra quando a sessão termina); a cadência de verdade vem da sessão.
   ================================================================ */
function instalarSonda() {
  if (window.__vrsessao) return 'já estava';
  const G = window.__game, MP = window.__MP;
  if (!G || !MP) return 'sem __game/__MP';
  const T = MP.THREE;
  const buf = [];
  const tiros = [];
  const armas = new Set();
  const cabeca = new T.Vector3();
  let ultFrame = MP.renderer.info.render.frame, ultT = performance.now(), ultReg = 0, viva = false;
  let ultLastShot = null, ultOrigem = null;

  /* B7 SE MEDE NO FRAME DO TIRO, E DA ORIGEM CERTA.
     Duas armadilhas, as duas descobertas conferindo esta sonda contra o teste
     que já existe (`test/xr-weapon.test.js`):
     1. a origem do critério é `origemDoTiro()` — de onde o raio partiu de
        fato. `mira().origem` é a OCULAR da arma, que fica meio metro atrás do
        cano por projeto: medir com ela reprovaria B7 sempre, com número
        bonito e errado.
     2. `origemDoTiro` só é escrita quando um tiro sai. Lida por amostragem de
        1 Hz ela descreve a distância entre um tiro velho e o cano de agora —
        que não é grandeza nenhuma.
     Daí o porteiro: `gun.lastShot` (sem alocar nada, por frame) diz que algo
     aconteceu; a origem só é lida quando ele mudou, e clique seco — que também
     mexe em `lastShot` — cai fora porque a origem não muda. */
  const conferirTiro = () => {
    const arma = G.arsenal && G.arsenal[G.gunIndex];
    if (!arma || arma.lastShot === ultLastShot) return;
    ultLastShot = arma.lastShot;
    const org = G.origemDoTiro ? G.origemDoTiro() : null;
    if (!org || (!org[0] && !org[1] && !org[2])) return;      // ainda não houve tiro nenhum
    const chave = org.join(',');
    if (chave === ultOrigem) return;                          // clique seco: não foi tiro
    ultOrigem = chave;
    const cano = G.canoMundo ? G.canoMundo() : null;
    if (!cano) return;
    tiros.push({ t: Date.now(), arma: G.gunIndex,
      b7: +Math.hypot(org[0] - cano[0], org[1] - cano[1], org[2] - cano[2]).toFixed(4) });
  };

  const amostrar = () => {
    const agora = Date.now();
    if (agora - ultReg < 900) return;                  // um registro por segundo, venha de onde vier
    ultReg = agora;
    try {
      const R = MP.renderer;
      const XR = G.XR;
      const s = R.xr.getSession ? R.xr.getSession() : null;
      const presenting = !!(XR && XR.presenting);
      let folga = null, separacao = null;
      if (presenting && XR.headWorldPosition) {
        XR.headWorldPosition(cabeca);
        folga = cabeca.y - G.groundAt(cabeca.x, cabeca.z, 999);
        separacao = Math.hypot(cabeca.x - G.player.pos.x, cabeca.z - G.player.pos.z);
      }
      const frame = R.info.render.frame, ms = performance.now();
      const fps = (frame - ultFrame) / Math.max(0.001, (ms - ultT) / 1000);
      ultFrame = frame; ultT = ms;
      if (typeof G.gunIndex === 'number' && G.gunIndex >= 0) armas.add(G.gunIndex);
      let naMao = null;
      try { naMao = G.mira ? !!G.mira().naMao : null; } catch { /* fora de partida a arma pode não existir */ }
      buf.push({
        t: agora, presenting,
        vis: s ? s.visibilityState : (XR ? XR.visibility : null),
        taxa: G.XRTaxa ? G.XRTaxa.taxa : null,
        fovea: R.xr.getFoveation ? R.xr.getFoveation() : null,
        calls: R.info.render.calls, tris: R.info.render.triangles,
        fpsPagina: +fps.toFixed(1), frames: frame,
        folga: folga === null ? null : +folga.toFixed(4),
        separacao: separacao === null ? null : +separacao.toFixed(4),
        tunel: XR && XR.conforto ? +XR.conforto.tunel.toFixed(4) : null,
        painel: G.XRUI ? (G.XRUI.aberto ? String(G.XRUI.modo) : '') : null,
        jogando: !!(G.state && G.state.started), pausado: !!(G.state && G.state.paused),
        morto: !!(G.player && G.player.dead), arma: G.gunIndex, naMao,
        erros: G.errors ? G.errors.length : -1,
      });
    } catch (e) { buf.push({ t: agora, erroDaSonda: String((e && e.message) || e) }); }
  };

  /* A corrente de rAF da SESSÃO: quem chama é o compositor, na cadência do
     aparelho. Só observa — não desenha, não avança o jogo. */
  const passo = () => {
    const s = MP.renderer.xr.getSession ? MP.renderer.xr.getSession() : null;
    if (!s) { viva = false; return; }
    try { conferirTiro(); } catch { /* sem arsenal (menu): não é tiro */ }
    amostrar();
    try { s.requestAnimationFrame(passo); } catch { viva = false; }
  };
  const manter = () => {
    amostrar();
    const s = MP.renderer.xr.getSession ? MP.renderer.xr.getSession() : null;
    if (s && !viva) { viva = true; try { s.requestAnimationFrame(passo); } catch { viva = false; } }
  };
  const id = setInterval(manter, 1000);
  manter();
  window.__vrsessao = {
    drenar() {
      return {
        amostras: buf.splice(0, buf.length),
        tiros: tiros.splice(0, tiros.length),
        armasVistas: [...armas].sort((a, b) => a - b),
      };
    },
    parar() { clearInterval(id); delete window.__vrsessao; },
  };
  return 'instalada';
}

/* ---------- estatística das amostras da página ---------- */
const nums = (a, k) => a.map(x => x[k]).filter(v => typeof v === 'number' && isFinite(v));
const med = a => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
function resumirPagina(amostras) {
  if (!amostras.length) return { amostras: 0 };
  const folga = nums(amostras, 'folga'), sep = nums(amostras, 'separacao');
  const tunel = nums(amostras, 'tunel');
  const r = {
    amostras: amostras.length,
    presenting: amostras.filter(a => a.presenting).length,
    visibilidades: [...new Set(amostras.map(a => a.vis).filter(Boolean))],
    taxa: med(nums(amostras, 'taxa')),
    fovea: med(nums(amostras, 'fovea')),
    calls: med(nums(amostras, 'calls')), tris: med(nums(amostras, 'tris')),
    fpsPagina: med(nums(amostras, 'fpsPagina')),
    paineis: [...new Set(amostras.map(a => a.painel).filter(Boolean))],
    pausou: amostras.some(a => a.pausado), morreu: amostras.some(a => a.morto),
    errosMax: Math.max(-1, ...nums(amostras, 'erros')),
  };
  if (folga.length) r.folga = { min: Math.min(...folga), max: Math.max(...folga), med: med(folga) };
  if (sep.length) r.separacao = { max: Math.max(...sep), med: med(sep) };
  if (tunel.length) r.tunel = { min: Math.min(...tunel), max: Math.max(...tunel), fim: tunel[tunel.length - 1] };
  return r;
}
/* Um registro por TIRO, não por segundo — ver `conferirTiro`. */
function resumirTiros(tiros) {
  if (!tiros.length) return null;
  const b7 = tiros.map(t => t.b7);
  return { tiros: tiros.length, min: Math.min(...b7), max: Math.max(...b7), med: med(b7),
    armas: [...new Set(tiros.map(t => t.arma))].sort((a, b) => a - b) };
}

/* ---------- servidor local com seed fixa ---------- */
async function subirServidor(porta, seed) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(porta), WORLD_SEED: seed, GAS_DEFAULT: 'classica' },
    stdio: 'ignore',
  });
  const prazo = Date.now() + 25000;
  while (Date.now() < prazo) {
    if (srv.exitCode !== null) throw new Error(`o servidor saiu antes de subir (exit ${srv.exitCode}) — a porta ${porta} pode estar ocupada`);
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/`);
      if (r.status === 200 && (await r.text()).includes('<canvas id="game"></canvas>')) return srv;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 150));
  }
  srv.kill();
  throw new Error(`o servidor não respondeu na porta ${porta}`);
}

/* ---------- boot: os três marcos que F1 cobra ---------- */
async function abrirEMedirBoot(page, url, frio) {
  const rede = { requisicoes: 0, bytes: 0 };
  let cdp = null;
  try {
    cdp = await page.createCDPSession();
    await cdp.send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'local_storage' });
    /* CACHE FRIO NÃO SE DECLARA, SE FAZ. F1 é cobrado com cache frio; medir
       com cache quente e escrever "frio" no relatório é a mentira que este
       kit inteiro existe para não cometer. */
    if (frio) { await cdp.send('Network.clearBrowserCache'); await cdp.send('Network.clearBrowserCookies'); }
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', e => { rede.requisicoes++; rede.bytes += e.encodedDataLength || 0; });
  } catch { /* sem CDP: segue sem contagem de rede */ }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const htmlMs = Date.now() - t0;
  await page.waitForFunction('!!window.__game && !!window.__MP', { timeout: 180000, polling: 100 });
  const gameMs = Date.now() - t0;
  await page.waitForFunction('window.__MP.renderer.info.render.frame > 0', { timeout: 180000, polling: 50 });
  const primeiroFrameMs = Date.now() - t0;
  if (cdp) { try { await cdp.send('Network.disable'); await cdp.detach(); } catch { /* já fechado */ } }
  return { htmlMs, gameMs, primeiroFrameMs, cache: frio ? 'frio' : 'quente',
    rede: { ...rede, mb: +(rede.bytes / 1048576).toFixed(2) } };
}

/* ================================================================
   RELATÓRIO
   ================================================================ */
const AGUARDA_HUMANO = '`aguardando humano`';
const AGUARDA_APARELHO = '`aguardando aparelho`';
const n2 = v => (typeof v === 'number' && isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—');

/* E1, e por que cada linha desta função existe.
   Validação independente encontrou este veredito imprimindo VERDE sobre dado
   reprovante, em três frentes ao mesmo tempo: `abaixoDaTaxa` era calculado e
   nunca lido, `stale` era comparado pela MEDIANA (que esconde zero: com 300
   amostras e um frame repetido a mediana é 0), e o intervalo de swap nunca era
   colhido. Kit que mente é pior que kit nenhum — ele fecha um critério que
   ninguém mediu. */
function vereditoE1(vrapi, taxaDeclarada) {
  if (!vrapi || !vrapi.amostras) return { txt: AGUARDA_APARELHO, verde: null };
  const falhas = [];
  if (taxaDeclarada !== 72) falhas.push(`taxa declarada = ${taxaDeclarada ?? '—'} (critério: 72)`);
  if (vrapi.fps !== 72) falhas.push(`mediana ${vrapi.fps} (critério: 72)`);
  if (vrapi.abaixoDe60 > 0) falhas.push(`${vrapi.abaixoDe60} amostra(s) abaixo de 60`);
  /* abaixo da taxa DECLARADA pelo modo de tela daquele instante: 71 fps num
     modo de 72 não cai abaixo de 60 e mesmo assim é frame perdido */
  if (vrapi.abaixoDaTaxa > 0) falhas.push(`${vrapi.abaixoDaTaxa} amostra(s) abaixo da taxa do modo de tela`);
  if (vrapi.staleMax > 0) falhas.push(`stale: pior ${vrapi.staleMax}, total ${vrapi.staleSoma} (critério: 0)`);
  const naoMedido = ' Não medido por este kit: intervalo de swap (a linha do VrApi deste runtime não o traz).';
  return falhas.length
    ? { txt: `**VERMELHO** — ${falhas.join(' · ')}.` + naoMedido, verde: false }
    : { txt: `**VERDE** — mediana ${vrapi.fps}, pior ${vrapi.piorFps}, stale total ${vrapi.staleSoma}, ` +
        `abaixo da taxa ${vrapi.abaixoDaTaxa}.` + naoMedido, verde: true };
}

/* O VrApi publica `GPU%=0.81` — FRAÇÃO, não porcentagem. O veredito de E5
   comparava esse número com 90 e por isso NUNCA disparava: 0,81 > 90 é falso
   mesmo com a GPU a 81 %. Aceita as duas convenções por segurança. */
const gpuEmPct = v => (typeof v === 'number' && isFinite(v) ? (v <= 1.5 ? v * 100 : v) : null);

function relatorio(est) {
  const L = [];
  const p = s => L.push(s);
  /* A duração que vale para E1/E5 é a da JANELA CONTÍNUA (roteiro até o bloco
     em que o headset sai da cabeça), não a do processo. */
  const j = est.janelaContinua || [est.inicio, est.fim];
  const dur = Math.round((j[1] - j[0]) / 60000);
  p(`# Sessão humana de VR — ${est.quando}`);
  p('');
  p('Gerado por `npm run vr:sessao`. **Nada aqui é estimado:** número sem amostra sai como');
  p('`aguardando aparelho`, e caixa sem tecla apertada por um humano sai como `aguardando humano`.');
  p('');
  p('## Condição da medição (sem isto não é medida)');
  p('');
  p('| | |');
  p('|---|---|');
  p(`| commit | \`${est.commit}\` |`);
  p(`| data | ${est.quando} |`);
  p(`| aparelho | ${est.aparelho || AGUARDA_APARELHO} |`);
  p(`| duração contínua medida | ${dur} min (roteiro pedia ${cfg.minutos}) — o bloco de tirar o aparelho fica FORA desta janela |`);
  p(`| porta / seed | ${cfg.porta} / ${cfg.seed} |`);
  p(`| cache no boot | ${est.boot ? est.boot.cache : '—'} |`);
  p(`| voz do roteiro | ${TEM_VOZ ? 'spd-say presente — o kit fala cada item em voz alta' : 'sem TTS na máquina — o roteiro depende de um locutor humano'} |`);
  p(`| teclado do operador | ${est.tty ? 'sim (havia alguém no terminal)' : 'NÃO — sem TTY, nenhuma caixa pôde ser marcada'} |`);
  p(`| amostras de VrApi | ${est.vrapiTotal} |`);
  p(`| erros de console | ${est.errosConsole.length} |`);
  p('');

  p('## 1. As caixas de I1 — a folha que valida a rodada');
  p('');
  p('O validador é literal: *"sem as 20 caixas marcadas por um humano, a rodada não está');
  p('validada"*. Esta é a folha desta sessão.');
  p('');
  p('| # | item | resposta | motivo, quando reprovou |');
  p('|--:|---|---|---|');
  for (const c of CAIXAS_I1) {
    const r = est.respostas[c.cod];
    const marca = !r || !r.veredito ? `☐ ${AGUARDA_HUMANO}`
      : r.veredito === 'aprova' ? '☑ APROVA' : '☒ **REPROVA**';
    p(`| ${c.i1} | ${c.cod} | ${marca} | ${(r && r.motivo) || ''} |`);
  }
  const marcadas = CAIXAS_I1.filter(c => est.respostas[c.cod] && est.respostas[c.cod].veredito).length;
  const reprovadas = CAIXAS_I1.filter(c => est.respostas[c.cod] && est.respostas[c.cod].veredito === 'reprova').length;
  p('');
  p(`**${marcadas} de ${CAIXAS_I1.length} caixas respondidas · ${reprovadas} reprovada(s).** ` +
    (marcadas < CAIXAS_I1.length
      ? 'I1 continua **aguardando humano** — o critério aprova só com 20 de 20.'
      : reprovadas ? 'I1 **REPROVA** (aprova exige 20 de 20).' : 'I1 **APROVA**.'));
  p('');

  p('## 2. O que o aparelho disse, item a item (VrApi)');
  p('');
  p('Uma linha por item do roteiro, recortada pela janela de tempo em que o jogador estava');
  p('naquele item. Recorte importa: média de sessão inteira mistura o menu com o castelo e');
  p('descreve um jogo que ninguém jogou.');
  p('');
  /* A COLUNA `em sessão` EXISTE PORQUE ELA É O QUE VALIDA A LINHA INTEIRA.
     Este projeto já afirmou cinco vezes, com confiança, uma coisa falsa por ter
     lido a página FORA de sessão imersiva. O kit contava `presenting` por item
     e não imprimia em lugar nenhum: quem lesse o relatório não tinha como
     saber se aqueles fps foram medidos dentro do headset ou no painel 2D (que
     é travado em 30 Hz e mediria o navegador, não o jogo). */
  p('| item | em sessão | fps (med/pior) | modo | app ms | cpu+gpu | gpu% | °C | livre MB | <60 |');
  p('|---|---|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const it of est.itens) {
    const v = it.vrapi || {};
    if (!v.amostras) { p(`| ${it.cod} | — | ${AGUARDA_APARELHO} | — | — | — | — | — | — | — |`); continue; }
    const pg = it.pagina;
    const emSessao = !pg || !pg.amostras ? '—'
      : pg.presenting === pg.amostras ? `sim (${pg.amostras}/${pg.amostras})`
        : `**${pg.presenting}/${pg.amostras}**`;
    p(`| ${it.cod} | ${emSessao} | ${v.fps}/${v.piorFps} | ${v.modoTela} | ${n2(v.appMs)} | ${n2(v.cpuGpuMs)} | ${n2(gpuEmPct(v.gpuPct))} | ${n2(v.tempC)} | ${v.livreMB} | ${v.abaixoDe60} |`);
  }
  if (!est.itens.length) p(`| — | — | ${AGUARDA_APARELHO} — nenhum item do roteiro chegou a ser executado | — | — | — | — | — | — | — |`);
  p('');

  p('## 3. Os cinco critérios que só o aparelho fecha');
  p('');
  const e1 = vereditoE1(est.vrapiTudo, est.taxaDeclarada);
  p(`- **E1 · 72 fps travado** — ${e1.txt}` + (est.vrapiTudo.amostras
    ? `. Janela: ${dur} min contínuos, ${est.vrapiTudo.amostras} amostras.` +
      (dur < 20 ? ` **Parcial: E1 pede 20 minutos contínuos e a janela teve ${dur}.**` : '') : ''));
  p('- **E3 · escala de render ≥ 85 %** — ' + (est.chavesExtras.some(k => /scale/i.test(k))
    ? `chaves de escala vistas no VrApi: ${est.chavesExtras.filter(k => /scale/i.test(k)).join(', ')}`
    : `${AGUARDA_APARELHO}: a linha do VrApi deste runtime **não traz** "Render Scale Percent". ` +
      'Só o OVR Metrics Tool (overlay dentro do headset) publica esse campo — ele não é derivável do que está aqui, e este kit não inventa.'));
  p('- **E4 · lógica de app ≤ 2 ms** — ' + (est.vrapiTudo.amostras
    ? `\`App=\` mediana **${n2(est.vrapiTudo.appMs)} ms**, pior ${n2(est.vrapiTudo.piorAppMs)} ms. ` +
      /* `null <= 2` é TRUE em JavaScript, e sem amostra de `App=` o veredito
         saía VERDE por comparação com nada. */
      (typeof est.vrapiTudo.appMs === 'number' && isFinite(est.vrapiTudo.appMs) && est.vrapiTudo.appMs <= 2
        ? '**VERDE por inferência sólida:** `App` é o frame de CPU do aplicativo INTEIRO (JS + three + submissão), ' +
          'logo a lógica de app é necessariamente menor que ele. Abaixo do teto, o teto está fechado.'
        : (typeof est.vrapiTudo.appMs === 'number' && isFinite(est.vrapiTudo.appMs)
          ? '**NÃO conclui.** `App` é um superconjunto da lógica de app: acima do teto ele não prova que a LÓGICA passou de 2 ms. ' +
            'Fechar E4 exige o recorte só-JS, que este kit não mede.'
          : `${AGUARDA_APARELHO}: houve amostra de VrApi, mas nenhuma trouxe o campo \`App=\`.`))
    : AGUARDA_APARELHO));
  const caiu = est.terco.length === 3 && est.terco[2].fps < est.terco[0].fps;
  const gpuMedPct = gpuEmPct(est.vrapiTudo.gpuPct);
  const gpuAlta = est.vrapiTudo.amostras && gpuMedPct !== null && gpuMedPct > 90;
  p('- **E5 · 30 min sem degradar** — ' + (est.terco.length === 3
    ? `curva por terços: fps ${est.terco.map(t => t.fps).join(' → ')} · °C ${est.terco.map(t => n2(t.tempC)).join(' → ')} · ` +
      `gpu% ${est.terco.map(t => n2(gpuEmPct(t.gpuPct))).join(' → ')} (mediana ${n2(gpuMedPct)}, teto 90). ` +
      (dur >= 30
        ? (caiu || gpuAlta
          ? `**VERMELHO** — ${[caiu && 'o fps do último terço é menor que o do primeiro', gpuAlta && 'GPU% mediano acima de 90'].filter(Boolean).join(' e ')}.`
          : '**VERDE** — sem curva descendente e GPU% dentro do teto.')
        : `**PARCIAL** — E5 pede 30 min e a janela contínua teve ${dur}. Rode \`--minutos=30\` para fechar.`)
    : AGUARDA_APARELHO));
  p('- **F1 · 4 s até gráfico rastreado** — ' + (est.boot
    ? `boot da página: html ${est.boot.htmlMs} ms · \`__game\` ${est.boot.gameMs} ms · 1º frame ${est.boot.primeiroFrameMs} ms ` +
      `(cache **${est.boot.cache}**, ${est.boot.rede.mb} MB). O que F1 cobra de verdade é o primeiro frame **rastreado pela cabeça**, ` +
      `que só o humano viu — resposta dele no item BOOT. **Uma execução não fecha F1: o critério pede N ≥ 7 com cache frio.**`
    : AGUARDA_APARELHO));
  p('');

  p('## 4. Os três que só o humano fecha');
  p('');
  const rG = est.respostas;
  p(`- **I1** — ${marcadas}/${CAIXAS_I1.length} caixas (tabela do §1).`);
  p('- **G4 · texto e mira legíveis** — respostas humanas: ' +
    `alça/massa = ${vereditoTxt(rG['PELO BURACO DA ALÇA'])}, HUD legível = ${vereditoTxt(rG['HUD NO MUNDO'])}.` +
    ' O número angular publicado pela Meta (22 mm/12 mm ≡ 3° a 0,42 m) é de ALVO INTERATIVO, não de texto: por isso o critério tem parte humana obrigatória.');
  p('- **G5 · uma captura por entrega** — ' + (est.capturas.length
    ? `${est.capturas.length} arquivo(s) puxados do aparelho:\n${est.capturas.map(c => `  - \`${c.local}\` (de \`${c.remoto}\`)`).join('\n')}\n` +
      '  Estas saem do COMPOSITOR — é a imagem que foi para os olhos, não um print do canvas 2D.'
    : `${AGUARDA_HUMANO}: nenhuma captura nova no aparelho. Ela nasce de Meta + gatilho DENTRO do headset (item CAPTURA do roteiro).`));
  p('');

  p('## 5. Bônus: os mesmos critérios, medidos NO APARELHO com um humano dentro');
  p('');
  p('Nada aqui substitui o `vr:emulado` nem a suíte — todos estes critérios já são medidos');
  p('lá, e a régua é a mesma. O que muda é a CONDIÇÃO: aqui a cabeça e as mãos são de uma');
  p('pessoa andando numa sala de verdade, no Snapdragon, e não poses escritas por um teste.');
  p('É o estado que a suíte inteira não visita — o buraco de cobertura de ESTADO que este');
  p('repositório já pagou caro duas vezes.');
  p('');
  p('| grandeza | teto do critério | medido na sessão |');
  p('|---|---|---|');
  const g = est.paginaTudo;
  p(`| C1 · folga cabeça↔chão | 1,20–2,10 m em 100 % dos frames | ${g.folga ? `${n2(g.folga.min)} – ${n2(g.folga.max)} m (mediana ${n2(g.folga.med)})` : AGUARDA_APARELHO} |`);
  p(`| C2 · separação cabeça↔colisor | ≤ 0,10 m | ${g.separacao ? `pior ${n2(g.separacao.max)} m` : AGUARDA_APARELHO} |`);
  p(`| A5 · vinheta parado | ≤ 0,01 | ${g.tunel ? `min ${n2(g.tunel.min)} · max ${n2(g.tunel.max)}` : AGUARDA_APARELHO} |`);
  const t7 = resumirTiros(est.tiros);
  p(`| B7 · origem do tiro ↔ cano | ≤ 0,05 m | ${t7 ? `${n2(t7.min)} – ${n2(t7.max)} m em ${t7.tiros} tiro(s), armas ${t7.armas.join('/')}` : `${AGUARDA_HUMANO}: nenhum tiro saiu na sessão`} |`);
  p(`| D1 · as 8 armas | 8 | ${est.armasVistas.length ? `${est.armasVistas.length} alcançadas: índices ${est.armasVistas.join(', ')}` : AGUARDA_APARELHO} |`);
  p(`| G1 · foveação declarada | ≤ 0,5 | ${g.amostras ? n2(g.fovea) : AGUARDA_APARELHO} |`);
  p(`| E2 · draw calls / triângulos (estéreo, leitura bruta) | 180 / 500 k **por olho** | ${g.amostras ? `${g.calls} / ${g.tris} — dividir por 2 antes de comparar` : AGUARDA_APARELHO} |`);
  p(`| I2 · erros de console | 0 | ${g.amostras ? `${est.errosConsole.length} do navegador + ${g.errosMax >= 0 ? g.errosMax : '—'} em \`__game.errors\`` : AGUARDA_APARELHO} |`);
  p(`| F2 · pausou ao perder foco | pausa | ${g.amostras ? `visibilidades vistas: ${(g.visibilidades || []).join(', ') || '—'} · pausou: ${g.pausou ? 'sim' : 'não'} · painéis abertos: ${(g.paineis || []).join(', ') || '—'}` : AGUARDA_APARELHO} |`);
  p('');
  if (est.errosConsole.length) {
    p('### Erros de console capturados');
    p('');
    for (const e of est.errosConsole.slice(0, 20)) p(`- \`${e.replace(/\n/g, ' ').slice(0, 240)}\``);
    p('');
  }

  p('## 6. O que esta sessão NÃO fecha');
  p('');
  p('- **E3** exige o OVR Metrics Tool ligado no headset — campo que o VrApi não emite.');
  p(`- **F1** exige N ≥ 7 execuções com cache frio; esta sessão contribui **${est.boot && est.boot.cache === 'frio' ? 'uma' : 'nenhuma (o cache estava quente — rode com `--frio`)'}**.`);
  if (dur < 30) p(`- **E5** exige 30 min; esta durou ${dur}.`);
  if (dur < 20) p(`- **E1** exige 20 min contínuos; esta durou ${dur}.`);
  if (marcadas < CAIXAS_I1.length) p(`- **I1** tem ${CAIXAS_I1.length - marcadas} caixa(s) sem resposta humana.`);
  p('- Tudo o que o critério marca como automatizável continua sendo do `vr:emulado` / suíte — este kit não substitui nenhum deles.');
  p('');
  p('---');
  p('');
  p('Roteiro completo, com o que fazer e o que observa cada item: `docs/vr/roteiro-humano.md`.');
  p(`Amostras cruas desta sessão: \`${path.relative(ROOT, est.pastaSaida)}\`.`);
  return L.join('\n') + '\n';
}
const vereditoTxt = r => (!r || !r.veredito ? AGUARDA_HUMANO : r.veredito === 'aprova' ? '**APROVA**' : `**REPROVA** (${r.motivo || 'sem motivo anotado'})`);

/* ---------- o roteiro publicado como documento ---------- */
function docRoteiro() {
  const L = [];
  const p = s => L.push(s);
  const total = ROTEIRO.reduce((n, r) => n + r.s, 0);
  p('# Roteiro humano de VR — 20 minutos que valem uma rodada');
  p('');
  p('> **Este arquivo é gerado.** A fonte é o vetor `ROTEIRO` em `scripts/vr-sessao.js`;');
  p('> regere com `npm run vr:sessao -- --roteiro`. Editar aqui à mão faz o roteiro que o');
  p('> humano executa divergir do que o relatório cobra — que é o defeito que ele veio fechar.');
  p('');
  p('## Por que existe');
  p('');
  p('Oito critérios de `criterio-aaa.md` não são certificáveis do PC em nenhuma rodada:');
  p('**E1, E3, E4, E5 e F1** exigem o aparelho (só ele mede tempo) e **I1, G4 e G5** exigem');
  p('um humano de headset. O validador repete há cinco rodadas que sem as caixas de I1');
  p('marcadas por um humano a rodada não está validada, por mais verde que a suíte esteja.');
  p('');
  p('O que faltava não era disposição de quem tem o Quest 3 — era um kit que fizesse o tempo');
  p(`dele render. Este roteiro é esse kit: ele põe o headset uma vez, segue ${ROTEIRO.length} blocos, e o`);
  p('computador escreve o resto.');
  p('');
  p('## O comando');
  p('');
  p('```');
  p('npm run vr:sessao                  # 20 min, o padrão');
  p('npm run vr:sessao -- --minutos=30  # fecha E5, que pede 30');
  p('npm run vr:sessao -- --frio        # limpa o cache do navegador: é o que F1 exige');
  p('npm run vr:sessao -- --entrar       # o kit clica em ENTRAR EM VR por você');
  p('npm run vr:sessao -- --ensaio      # SEM aparelho: imprime o roteiro e arquiva a folha em branco');
  p('```');
  p('');
  p('Sem aparelho conectado ele **para na primeira camada** e diz o que fazer. Ele nunca');
  p('devolve número de medição que não fez.');
  p('');
  p('## A divisão de trabalho');
  p('');
  p('| o computador colhe sozinho | só o humano responde |');
  p('|---|---|');
  p('| FPS real e modo de tela por item (`adb logcat -s VrApi`) | a arma está NA sua mão? |');
  p('| tempo de app, CPU+GPU, GPU%, temperatura, memória livre | dá para ver pelo buraco da alça? |');
  p('| folga cabeça↔chão e separação cabeça↔colisor, por segundo | o texto do HUD é legível? |');
  p('| vinheta de conforto, foveação, taxa declarada da sessão | você sentiu enjoo? travou? |');
  p('| quais índices de arma a mão alcançou | a parede te parou? |');
  p('| marcos de boot (html, `__game`, primeiro frame) e MB baixados | o mundo apareceu em 4 s? |');
  p('| erros de console e de `__game.errors` | alguma coisa atravessou o seu olho? |');
  p('| as capturas que você tirou dentro do headset (`adb pull`) | — |');
  p('');
  p('## Como usar, na prática');
  p('');
  p('1. **Uma pessoa no terminal** (ou a voz do PC: se houver `spd-say` na máquina, o kit');
  p('   fala cada item em voz alta — o Quest 3 tem alto-falante aberto e quem está de headset');
  p('   ouve a sala).');
  p('2. O terminal mostra **um item por vez**, com o tempo sugerido. Teclas do operador:');
  p('   `a` aprova · `r` reprova (pede o motivo) · `enter` passa sem resposta · `+` dá mais');
  p('   30 s · `q` encerra e escreve o relatório com o que já tem.');
  p('3. **Item sem tecla apertada vira `aguardando humano` no relatório.** Não existe');
  p('   preenchimento automático de caixa — é a regra que dá valor às marcadas.');
  p('');
  p(`## Os ${ROTEIRO.length} blocos (≈ ${Math.round(total / 60)} min de blocos + jogo contínuo até fechar os 20 min)`);
  p('');
  p('A ordem minimiza tirar e pôr o aparelho: **o headset sai da cabeça uma vez só**, no');
  p('penúltimo bloco, que é justamente o teste de perder o foco (F2). Por isso a numeração');
  p('das caixas de I1 não é sequencial aqui — a folha é cobrada por número, não por ordem.');
  p('');
  for (let i = 0; i < ROTEIRO.length; i++) {
    const r = ROTEIRO[i];
    p(`### ${i + 1}. ${r.cod}${r.i1 ? ` — caixa I1#${r.i1}` : ''}`);
    p('');
    p(`*${r.crit.join(' · ')}${r.soak ? '' : ` · ${r.s}s`}*`);
    p('');
    p(`- **Faça:** ${r.faca}`);
    p(`- **Observe:** ${r.observe}`);
    p(`- **APROVA:** ${r.aprova}`);
    p(`- **REPROVA:** ${r.reprova}`);
    p('');
  }
  p('## Folha de I1 para imprimir');
  p('');
  p('| # | item | ☐ |');
  p('|--:|---|---|');
  for (const c of CAIXAS_I1) p(`| ${c.i1} | ${c.cod} — ${c.aprova} | ☐ |`);
  p('');
  p('**Aprova: 20 de 20. Reprova: 19.**');
  p('');
  p('## O que este roteiro deliberadamente NÃO faz');
  p('');
  p('- **Não avisa o que já está vermelho.** Dizer ao observador o que ele deve encontrar é a');
  p('  forma mais barata de contaminar a observação. O estado conhecido de cada critério está');
  p('  na validação da rodada, para ser lido DEPOIS.');
  p('- **Não mede o que o PC já mede.** Draw calls, triângulos e as sondas de defeito são do');
  p('  `vr:emulado` e da suíte; repetir aqui só gastaria o tempo do humano.');
  p('- **Não mostra o item dentro do painel de VR.** Seria melhor — o jogador leria sozinho e');
  p('  não dependeria de locutor nem de alto-falante. O custo, medido antes de propor: o');
  p('  painel (`js/xr/xrui.js`) repinta um canvas de 1024×768 a cada mudança de assinatura, e');
  p('  uma linha de roteiro por bloco mudaria a assinatura 22 vezes na sessão — barato. O que');
  p('  NÃO é barato é o risco: o painel é de outra frente, ele já pausa o jogo ao abrir, e uma');
  p('  aba de roteiro dentro dele mudaria o que o item 19 (pausa) está medindo. **Fica como');
  p('  proposta para a frente do painel, com o custo acima, não como implementação desta.**');
  return L.join('\n') + '\n';
}

/* ================================================================
   FLUXO
   ================================================================ */
function agoraISO() {
  const d = new Date();
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
const commitCurto = () => {
  try { return spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || '?'; } catch { return '?'; }
};

/* Camada 1, e a razão de este kit poder ser levado a sério: SEM APARELHO NÃO
   EXISTE MEDIÇÃO. Ele para aqui e diz o que fazer, em vez de seguir e
   devolver um relatório com colunas vazias que alguém leria como zero. */
function exigirAparelho() {
  const devs = aparelhos();
  if (devs.length) return devs;
  console.error('\n  PAROU na camada 1: nenhum aparelho autorizado no adb.\n');
  console.error('  o que fazer:');
  console.error('    1. plugue o cabo (ou `adb connect <ip>` depois de `adb tcpip 5555`);');
  console.error('    2. ponha o headset e aceite "Permitir depuração USB?";');
  console.error('    3. confira com `adb devices` — "unauthorized" explica tudo.');
  console.error('');
  console.error('  SEM APARELHO NÃO EXISTE MEDIÇÃO: este kit não adivinha nada a partir daqui.');
  console.error('  Para ver o roteiro e arquivar a folha em branco sem aparelho nenhum:');
  console.error('    npm run vr:sessao -- --ensaio\n');
  return null;
}

async function main() {
  /* --roteiro: só regera o documento. Não toca em aparelho nenhum. */
  if (cfg.roteiro) {
    const destino = path.join(ROOT, 'docs', 'vr', 'roteiro-humano.md');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, docRoteiro());
    console.log(`roteiro escrito em ${path.relative(ROOT, destino)}`);
    return;
  }

  /* Camada 1 ANTES de qualquer efeito colateral: sem aparelho não se sobe
     servidor, não se cria pasta de saída e não se escreve relatório nenhum. */
  const devs = cfg.ensaio ? [] : exigirAparelho();
  if (!cfg.ensaio && !devs) { process.exitCode = 1; return; }

  const inicio = Date.now();
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const pastaSaida = path.join(ROOT, 'output', 'vr', `sessao-${carimbo}`);
  fs.mkdirSync(pastaSaida, { recursive: true });

  const est = {
    quando: agoraISO(), commit: commitCurto(), inicio, fim: inicio,
    aparelho: null, boot: null, itens: [], respostas: {}, capturas: [], tiros: [],
    errosConsole: [], vrapiTotal: 0, vrapiTudo: { amostras: 0 }, paginaTudo: { amostras: 0 },
    armasVistas: [], taxaDeclarada: null, terco: [], chavesExtras: [], pastaSaida,
    tty: !!process.stdin.isTTY,
  };

  est.aparelho = devs && devs.length ? devs.join(', ') : null;

  const ctl = criarControle();
  const totalItens = ROTEIRO.length;
  let srv = null, conexao = null, page = null, vrapi = null, presenca = null;

  const encerrar = async () => {
    try { if (vrapi) vrapi.parar(); } catch { /* já parou */ }
    /* RESTAURAR O SENSOR NÃO É OPCIONAL — deixar ligado é deixar o headset
       sem dormir até a bateria acabar. Vem antes de tudo na faxina. */
    try { if (presenca && presenca.enganado) presenca.restaurar(); } catch { /* já restaurado */ }
    try { if (page) await page.evaluate(() => { if (window.__vrsessao) window.__vrsessao.parar(); }); } catch { /* aba já foi */ }
    try { if (conexao) await conexao.soltar(); } catch { /* já solto */ }
    try { if (srv) srv.kill(); } catch { /* já morreu */ }
    ctl.fechar();
  };
  /* O relatório sai SEMPRE — inclusive de sessão interrompida ou que falhou no
     meio. Meia sessão com a condição escrita vale; sessão perdida por um erro
     no fim não vale nada, e foi assim que este projeto já perdeu três corridas
     de medição no aparelho. */
  let escrito = false;
  const arquivar = () => {
    if (escrito) return;
    escrito = true;
    est.fim = Date.now();
    escrever(est);
  };
  process.on('SIGINT', async () => {
    console.log('\n\n  interrompido — restaurando o aparelho e escrevendo o que já foi colhido.');
    await encerrar();
    resumirTudo(est, vrapi);
    arquivar();
    process.exit(130);
  });

  try {
    if (cfg.ensaio) {
      console.log('\n' + risca('═'));
      console.log('  ENSAIO — NENHUMA MEDIÇÃO FOI FEITA. Sem aparelho, sem jogo, sem números.');
      console.log('  Serve para ler o roteiro e arquivar a folha em branco.');
      console.log(risca('═'));
      for (let i = 0; i < ROTEIRO.length; i++) imprimirItem(ROTEIRO[i], i + 1, totalItens, 0);
      return;
    }

    console.log('\n' + risca('═'));
    console.log('  SESSÃO HUMANA DE VR — o computador colhe, você responde');
    console.log(risca('═'));
    console.log(`  aparelho: ${est.aparelho}`);
    console.log(`  voz: ${TEM_VOZ ? 'spd-say (o jogador ouve os itens)' : 'sem TTS — alguém precisa ler os itens em voz alta'}`);
    console.log(`  teclado: ${ctl.tty ? 'a=aprova · r=reprova · enter=passa · +=mais 30s · q=encerra' : 'SEM TTY — nenhuma caixa poderá ser marcada'}`);

    console.log('\n  subindo o servidor local...');
    srv = await subirServidor(cfg.porta, cfg.seed);
    console.log(`  ok   servidor na porta ${cfg.porta}, seed ${cfg.seed}`);

    console.log('  abrindo o jogo no navegador do headset...');
    conexao = await conectarNavegadorDoQuest({ port: cfg.porta, cdpPort: cfg.cdp });
    /* A aba do navegador do Quest não nasce pronta: o intent acorda o
       navegador e a aba aparece alguns segundos depois, em
       `chrome://panel-app-nav/ntp`. Perguntar cedo demais devolve lista vazia
       e o kit morreria dizendo "nenhuma aba" com o navegador subindo na frente
       do dono do projeto. */
    const prazoAba = Date.now() + 30000;
    let todas = [];
    while (Date.now() < prazoAba) {
      const abas = await abasDoJogo(conexao.browser, cfg.porta);
      todas = (await conexao.browser.pages()).filter(p => !/^devtools:/.test(p.url()));
      if (abas.length > 1) {
        console.log(`  !    ${abas.length} abas com o jogo. As de trás PARAM de desenhar e não respondem a`);
        console.log('       clique nunca mais — feche as extras antes de continuar.');
      }
      page = abas[abas.length - 1] || todas[0];
      if (page) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!page) throw new Error('o navegador do Quest não expôs nenhuma aba para medir em 30 s');
    page.on('pageerror', e => est.errosConsole.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') est.errosConsole.push(`console: ${m.text()}`); });

    est.boot = await abrirEMedirBoot(page, `http://localhost:${cfg.porta}/`, !!cfg.frio);
    console.log(`  ok   boot: html ${est.boot.htmlMs} ms · __game ${est.boot.gameMs} ms · ` +
      `1º frame ${est.boot.primeiroFrameMs} ms (cache ${est.boot.cache}, ${est.boot.rede.mb} MB)`);

    /* O PORTÃO. Nada daqui pra baixo vale sem `XR.presenting === true` — foi
       lendo página fora de sessão que este projeto já afirmou cinco vezes,
       com confiança, uma coisa falsa. */
    console.log('\n' + risca('─'));
    console.log('  PONHA O HEADSET AGORA e toque em ENTRAR EM VR.');
    /* O item 1 do roteiro (I1 #1) mede a ENTRADA, e a entrada acontece aqui —
       não lá embaixo, onde o roteiro roda. Sem este aviso a pessoa entrava sem
       saber o que observar e respondia de memória. */
    console.log('  ANTES DE TOCAR: conte os segundos até o mundo acompanhar a sua cabeça.');
    console.log('  (é o item 1 do roteiro; a pergunta vem depois, a resposta é sobre AGORA)');
    console.log(risca('─'));
    falar('Antes de tocar, prepare-se para contar os segundos até o mundo acompanhar sua cabeça. Agora ponha o headset e toque em entrar em vê érre.');
    if (cfg.entrar) {
      await page.waitForFunction("!!document.getElementById('btnVR')", { timeout: 120000, polling: 250 });
      await page.click('#btnVR');
    }
    const entrou = await page.waitForFunction('window.__game && window.__game.XR && window.__game.XR.presenting === true',
      { timeout: 180000, polling: 250 }).then(() => true).catch(() => false);
    if (!entrou) throw new Error('a página NÃO entrou em sessão imersiva em 3 min — sem isso não há o que medir');
    console.log('  ok   SESSÃO IMERSIVA CONFIRMADA na página');

    /* Nove camadas, sem duplicar uma linha: quem já sabe fazer isso é o
       `vr-controles.js`, e ele roda na 9222 (a nossa é outra, de propósito —
       ele remove o encaminhamento dele ao terminar). Serve de aquecimento:
       o jogador mexe os dois analógicos e a gente confirma que a entrada
       chega ANTES de gastar vinte minutos dele. */
    if (cfg.controles) {
      console.log('\n  conferindo os controles (vr-controles.js, nove camadas):');
      falar('Mexa os dois analógicos e aperte os dois gatilhos.');
      const r = spawnSync(process.execPath, [path.join(__dirname, 'vr-controles.js'),
        `--port=${cfg.porta}`, `--segundos=${cfg.controles}`], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('o diagnóstico de controles reprovou — resolva o que ele apontou e repita');
    }

    /* Telemetria. O sensor de presença fica QUIETO por padrão: há gente com o
       aparelho na cabeça (o sensor já está fechado), e enganá-lo mudaria o que
       o item TIRAR O APARELHO mede — que é justamente perder o foco. `--presenca=1`
       existe para quem vai deixar o headset na mesa parte do tempo, e a
       restauração é obrigatória (fica na faxina, não na boa vontade). */
    presenca = automacaoDePresenca();
    if (cfg.presenca) {
      const okPres = presenca.enganar();
      console.log(`  !    sensor de presença enganado (${okPres ? 'ok' : 'o aparelho recusou'}) — F2 fica sem valor nesta sessão`);
    }
    vrapi = coletorVrApi({ arquivo: path.join(pastaSaida, 'vrapi.log') });
    const sonda = await page.evaluate(instalarSonda);
    /* Sonda que não instalou é sessão inteira medindo o vazio — e o relatório
       sairia cheio de `aguardando aparelho` sem ninguém saber por quê. */
    if (!/instalada|já estava/.test(sonda)) throw new Error(`a sonda não instalou na página (${sonda}) — sem ela não há telemetria nenhuma`);
    /* O marcador vem ANTES do roteiro: `find -newer` só acha captura feita
       DEPOIS dele, e a do item CAPTURA acontece lá no meio. */
    marcarCapturas();
    console.log(`  ok   sonda na página: ${sonda} · telemetria VrApi: ligada`);

    const somaItens = ROTEIRO.reduce((n, r) => n + r.s, 0);
    const depoisDoSoak = ROTEIRO.slice(ROTEIRO.findIndex(r => r.soak) + 1)
      .filter(r => !r.pausa).reduce((n, r) => n + r.s, 0);
    est.inicioRoteiro = Date.now();
    console.log(`\n  plano: ${totalItens} itens (~${Math.round(somaItens / 60)} min) + jogo contínuo até fechar os ${cfg.minutos} min`);

    for (let i = 0; i < ROTEIRO.length; i++) {
      const item = ROTEIRO[i];
      /* O JOGO CONTÍNUO É ELÁSTICO, e por um motivo de critério: E1 cobra
         20 minutos CONTÍNUOS e I1#20 pergunta como está a imagem "vinte
         minutos depois". Se o bloco fosse fixo, um operador rápido fecharia a
         sessão aos 12 min e o relatório afirmaria 20. Aqui ele estica ou
         encolhe para que o item DEPOIS DE TUDO caia exatamente na marca
         pedida, seja qual for o ritmo de quem responde. */
      const segundos = item.soak
        ? Math.max(30, Math.round(cfg.minutos * 60 - depoisDoSoak - (Date.now() - est.inicioRoteiro) / 1000))
        : item.s;
      imprimirItem(item, i + 1, totalItens, segundos);
      falar(item.fala);
      const t0 = Date.now();
      const resposta = await ctl.esperar(segundos);
      const t1 = Date.now();
      const vazio = { amostras: [], tiros: [], armasVistas: [] };
      let drenado = vazio;
      try { drenado = await page.evaluate(() => (window.__vrsessao ? window.__vrsessao.drenar() : { amostras: [], tiros: [], armasVistas: [] })); } catch { /* aba caiu */ }
      if (drenado.armasVistas && drenado.armasVistas.length) est.armasVistas = drenado.armasVistas;
      est.tiros.push(...(drenado.tiros || []));
      const registro = {
        cod: item.cod, i1: item.i1, crit: item.crit, de: t0, ate: t1,
        pausa: !!item.pausa, soak: !!item.soak,
        vrapi: resumirVrApi(vrapi.amostras, t0, t1),
        pagina: resumirPagina(drenado.amostras),
        amostrasCruas: drenado.amostras,
      };
      est.itens.push(registro);
      if (resposta.veredito && resposta.veredito !== 'encerrar') est.respostas[item.cod] = resposta;
      const v = registro.vrapi;
      console.log(`  → ${v.amostras ? `VrApi: fps ${v.fps} (pior ${v.piorFps}) · app ${n2(v.appMs)} ms · gpu ${n2(v.gpuPct)} · ${n2(v.tempC)} °C` : 'VrApi: 0 amostra nesta janela'}` +
        `  |  humano: ${resposta.veredito ? resposta.veredito.toUpperCase() : 'aguardando'}`);
      /* A SESSÃO CAI POR FORA — headset tirado, menu do sistema, botão do
         sistema, SAIR DO VR do próprio painel. Sem este aviso o roteiro
         seguiria bonito no terminal enquanto o resto da sessão mede o vazio,
         e o dono do projeto descobriria no fim. */
      if (registro.pagina.amostras && !registro.pagina.presenting && !item.pausa) {
        console.log('  !!   A SESSÃO IMERSIVA TERMINOU. Daqui pra frente nada é medido:');
        console.log('       peça para tocar em ENTRAR EM VR de novo antes de continuar.');
        falar('Atenção. A sessão de vê érre terminou. Toque em entrar em vê érre de novo.');
      }
      if (resposta.veredito === 'encerrar') { console.log('\n  encerrado pelo operador.'); break; }
    }

    falar('Sessão encerrada. Pode tirar o aparelho.');
    console.log('\n  puxando as capturas feitas dentro do headset...');
    est.capturas = puxarCapturas(pastaSaida).map(c => ({ remoto: c.remoto, local: path.relative(ROOT, c.local) }));
    console.log(`  ok   ${est.capturas.length} captura(s)`);
  } finally {
    resumirTudo(est, vrapi);
    await encerrar();
    arquivar();
  }
}

/* Fecha as contas da sessão inteira. Separado do fluxo porque a interrupção
   por Ctrl-C precisa das MESMAS contas — e resumo que só existe no caminho
   feliz é resumo que some justo quando alguém precisa dele. */
function resumirTudo(est, vrapi) {
  est.fim = Date.now();
  /* A JANELA CONTÍNUA — que é a que E1 e E5 cobram — vai do começo do roteiro
     até o bloco em que o aparelho sai da cabeça, e não até o fim do processo.
     Sem este recorte toda sessão reprovaria E1 pelos 60 s em que o jogador,
     obedecendo ao item 19, estava com o headset na mão. */
  const pausa = est.itens.find(i => i.pausa);
  est.janelaContinua = [est.inicioRoteiro || est.inicio, pausa ? pausa.de : est.fim];
  if (vrapi) {
    est.vrapiTotal = vrapi.amostras.length;
    est.vrapiTudo = resumirVrApi(vrapi.amostras, est.janelaContinua[0], est.janelaContinua[1]);
    const t = vrapi.amostras.filter(a => a.fps !== null &&
      a.t >= est.janelaContinua[0] && a.t <= est.janelaContinua[1]);
    if (t.length >= 3) {
      const corte = Math.floor(t.length / 3);
      est.terco = [[0, corte], [corte, 2 * corte], [2 * corte, t.length]]
        .map(([a, b]) => resumirVrApi(t.slice(a, b), 0, Infinity));
    }
    const log = path.join(est.pastaSaida, 'vrapi.log');
    if (fs.existsSync(log)) {
      const cru = fs.readFileSync(log, 'utf8');
      est.chavesExtras = [...new Set([...cru.matchAll(/([A-Za-z][A-Za-z%&]*)=/g)].map(m => m[1]))];
    }
  }
  est.paginaTudo = resumirPagina(est.itens.flatMap(i => i.amostrasCruas || []));
  est.taxaDeclarada = est.paginaTudo.taxa;
}

function escrever(est) {
  try {
    fs.writeFileSync(path.join(est.pastaSaida, 'sessao.json'), JSON.stringify(est, null, 2));
  } catch { /* o relatório é o que importa */ }
  /* O ensaio NÃO entra em `docs/vr/`: lá moram os artefatos de rodada, e uma
     folha em branco parada entre eles é exatamente o tipo de arquivo que
     alguém lê como "a rodada foi validada e deu tudo vazio". */
  const nome = `sessao-humana-${est.quando.replace(/[ :]/g, '-')}-${est.commit}.md`;
  const destino = cfg.ensaio
    ? path.join(est.pastaSaida, `ENSAIO-${nome}`)
    : path.join(ROOT, 'docs', 'vr', nome);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  let txt = relatorio(est);
  if (cfg.ensaio) {
    txt = txt.replace(/^# .*$/m, m => `${m}\n\n> **ENSAIO — NENHUMA MEDIÇÃO FOI FEITA.** Nenhum aparelho foi consultado,` +
      '\n> nenhum humano respondeu. Este arquivo existe só para mostrar a forma do relatório\n> e a folha em branco.');
  }
  fs.writeFileSync(destino, txt);
  console.log(`\n  relatório: ${path.relative(ROOT, destino)}`);
  console.log(`  cru:       ${path.relative(ROOT, est.pastaSaida)}\n`);
}

/* Exportado para poder ser CONFERIDO sem aparelho: `instalarSonda` só vale se
   os campos que ela lê existirem de verdade no jogo, e sonda que devolve
   `null` calado gastaria vinte minutos do dono do projeto para produzir um
   relatório vazio. Uma sessão emulada (IWER) prova a leitura sem headset. */
/* `vereditoE1` e `gpuEmPct` saem daqui para PODEREM SER TESTADOS. Validação
   independente encontrou quatro vereditos deste arquivo imprimindo VERDE sobre
   dado reprovante, e nenhum teste existia porque nada era exportado. Julgador
   que não dá para testar é julgador em que não dá para confiar — e este decide
   os únicos critérios que dependem do aparelho. */
module.exports = { ROTEIRO, CAIXAS_I1, instalarSonda, resumirPagina, docRoteiro, vereditoE1, gpuEmPct };

if (require.main === module) {
  main().catch(e => {
    console.error(`\n  falhou: ${e.message}\n`);
    process.exitCode = 1;
  });
}
