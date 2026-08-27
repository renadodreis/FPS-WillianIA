# Roteiro humano de VR — 20 minutos que valem uma rodada

> **Este arquivo é gerado.** A fonte é o vetor `ROTEIRO` em `scripts/vr-sessao.js`;
> regere com `npm run vr:sessao -- --roteiro`. Editar aqui à mão faz o roteiro que o
> humano executa divergir do que o relatório cobra — que é o defeito que ele veio fechar.

## Por que existe

Oito critérios de `criterio-aaa.md` não são certificáveis do PC em nenhuma rodada:
**E1, E3, E4, E5 e F1** exigem o aparelho (só ele mede tempo) e **I1, G4 e G5** exigem
um humano de headset. O validador repete há cinco rodadas que sem as caixas de I1
marcadas por um humano a rodada não está validada, por mais verde que a suíte esteja.

O que faltava não era disposição de quem tem o Quest 3 — era um kit que fizesse o tempo
dele render. Este roteiro é esse kit: ele põe o headset uma vez, segue 22 blocos, e o
computador escreve o resto.

## O comando

```
npm run vr:sessao                  # 20 min, o padrão
npm run vr:sessao -- --minutos=30  # fecha E5, que pede 30
npm run vr:sessao -- --frio        # limpa o cache do navegador: é o que F1 exige
npm run vr:sessao -- --entrar       # o kit clica em ENTRAR EM VR por você
npm run vr:sessao -- --ensaio      # SEM aparelho: imprime o roteiro e arquiva a folha em branco
```

Sem aparelho conectado ele **para na primeira camada** e diz o que fazer. Ele nunca
devolve número de medição que não fez.

## A divisão de trabalho

| o computador colhe sozinho | só o humano responde |
|---|---|
| FPS real e modo de tela por item (`adb logcat -s VrApi`) | a arma está NA sua mão? |
| tempo de app, CPU+GPU, GPU%, temperatura, memória livre | dá para ver pelo buraco da alça? |
| folga cabeça↔chão e separação cabeça↔colisor, por segundo | o texto do HUD é legível? |
| vinheta de conforto, foveação, taxa declarada da sessão | você sentiu enjoo? travou? |
| quais índices de arma a mão alcançou | a parede te parou? |
| marcos de boot (html, `__game`, primeiro frame) e MB baixados | o mundo apareceu em 4 s? |
| erros de console e de `__game.errors` | alguma coisa atravessou o seu olho? |
| as capturas que você tirou dentro do headset (`adb pull`) | — |

## Como usar, na prática

1. **Uma pessoa no terminal** (ou a voz do PC: se houver `spd-say` na máquina, o kit
   fala cada item em voz alta — o Quest 3 tem alto-falante aberto e quem está de headset
   ouve a sala).
2. O terminal mostra **um item por vez**, com o tempo sugerido. Teclas do operador:
   `a` aprova · `r` reprova (pede o motivo) · `enter` passa sem resposta · `+` dá mais
   30 s · `q` encerra e escreve o relatório com o que já tem.
3. **Item sem tecla apertada vira `aguardando humano` no relatório.** Não existe
   preenchimento automático de caixa — é a regra que dá valor às marcadas.

## Os 22 blocos (≈ 17 min de blocos + jogo contínuo até fechar os 20 min)

A ordem minimiza tirar e pôr o aparelho: **o headset sai da cabeça uma vez só**, no
penúltimo bloco, que é justamente o teste de perder o foco (F2). Por isso a numeração
das caixas de I1 não é sequencial aqui — a folha é cobrada por número, não por ordem.

### 1. BOOT — caixa I1#1

*I1#1 · F1 · 40s*

- **Faça:** Já de headset, toque em ENTRAR EM VR e comece a contar.
- **Observe:** quanto tempo passa até o mundo se mexer junto com a sua cabeça.
- **APROVA:** o mundo aparece e acompanha a cabeça em até 4 s, OU aparece um indicador de carregamento DENTRO do VR desde o primeiro segundo.
- **REPROVA:** tela preta, splash 2D, ou mais de 4 s sem nada em VR.

### 2. DE PÉ — caixa I1#2

*I1#2 · C3 · C5 · 30s*

- **Faça:** Fique parado e olhe para baixo, para os próprios pés.
- **Observe:** a altura do olho e se alguma parte de corpo entra na sua cabeça.
- **APROVA:** você está de pé com os pés no chão, na sua altura real, e nada de corpo atravessa o seu olho.
- **REPROVA:** você está enterrado, flutuando, na altura errada, ou vê o interior de uma cabeça/ombro.

### 3. PASSO FÍSICO — caixa I1#3

*I1#3 · C2 · C1 · 60s*

- **Faça:** Ande FISICAMENTE 1,5 m para frente, para trás e para os dois lados (sem analógico).
- **Observe:** se o corpo do jogo veio junto com você.
- **APROVA:** o mundo se move na medida do seu passo e a arma continua no lugar em relação a você.
- **REPROVA:** você anda e o mundo fica parado, ou o corpo fica para trás e a arma some do campo de visão.

### 4. PAREDE — caixa I1#4

*I1#4 · C2 · 40s*

- **Faça:** Ande FISICAMENTE contra uma parede, uma pedra ou o carro.
- **Observe:** se o jogo te para.
- **APROVA:** a parede te barra e você não atravessa.
- **REPROVA:** você atravessa a parede andando fisicamente.

### 5. GIRO — caixa I1#5

*I1#5 · A1 · A2 · 45s*

- **Faça:** Dê quatro passos de giro para a direita e quatro para a esquerda com o analógico direito.
- **Observe:** se a cabeça SÓ GIRA, ou se o mundo também desliza de lado.
- **APROVA:** a cada passo o mundo gira em torno de você e nada desliza; a piscada é curta e não incomoda.
- **REPROVA:** sensação de ser puxado de lado a cada passo, ou giro contínuo em rajada segurando o analógico.

### 6. VINHETA — caixa I1#6

*I1#6 · A5 · A3 · 45s*

- **Faça:** Ande com o analógico esquerdo por 10 s e PARE de vez.
- **Observe:** o escurecimento da periferia enquanto anda, e o que sobra ao parar.
- **APROVA:** a periferia fecha ao andar e ABRE POR COMPLETO ao parar; a velocidade parece de gente, não de carro.
- **REPROVA:** sobra escuro na periferia depois de parar, ou a velocidade é claramente sobre-humana.

### 7. ARMA NA MÃO — caixa I1#7

*I1#7 · B1 · B2 · 35s*

- **Faça:** Levante a arma e gire o punho devagar, olhando para ela.
- **Observe:** onde a arma está em relação à sua mão real e se ela acompanha 1:1.
- **APROVA:** a arma está NA sua mão, no ângulo da sua mão, e acompanha sem atraso, sem balanço e sem respiração.
- **REPROVA:** a arma flutua à frente da mão, está torta, treme sozinha ou balança quando você anda.

### 8. PELO BURACO DA ALÇA — caixa I1#8

*I1#8 · B3 · B4 · G4 · 50s*

- **Faça:** Traga a arma até o olho como se fosse mirar de verdade (aperte a empunhadura direita).
- **Observe:** se dá para ver PELA alça e se a massa de mira fica no meio dela.
- **APROVA:** você olha pelo buraco da alça, a massa fica centrada, e a arma não deu salto nenhum ao apertar o botão.
- **REPROVA:** a arma teleporta ao apertar, some na sua cara, ou não existe alinhamento possível.

### 9. TIRO E TATO — caixa I1#9

*I1#9 · B6 · B7 · 35s*

- **Faça:** Atire cinco vezes com o gatilho direito.
- **Observe:** de onde sai o tiro e o que a mão sente.
- **APROVA:** o tiro sai do CANO e você sente o háptico na mão que atirou.
- **REPROVA:** tiro saindo do vazio à frente da mão, ou mão sem retorno nenhum.

### 10. ACERTO — caixa I1#10

*I1#10 · B3 · 40s*

- **Faça:** Alinhe a mira num inimigo, num barril ou numa parede próxima e atire.
- **Observe:** se acerta o que estava alinhado.
- **APROVA:** o tiro acerta onde a mira da arma estava apontando.
- **REPROVA:** o tiro vai para outro lugar, ou você precisa apontar o ROSTO para acertar.

### 11. RECARGA E AS 8 ARMAS — caixa I1#11

*I1#11 · D1 · 60s*

- **Faça:** Recarregue (botão de cima da esquerda) e troque de arma (botão de cima da direita) até dar a volta inteira.
- **Observe:** quantas armas diferentes a sua mão alcança.
- **APROVA:** a recarga acontece e você chega nas 8 armas.
- **REPROVA:** a recarga não sai, ou a troca fica presa nas primeiras armas.

### 12. HUD NO MUNDO — caixa I1#12

*I1#12 · H1 · H2 · G4 · 45s*

- **Faça:** Procure vida, munição, arma atual e o resto do HUD.
- **Observe:** se a informação existe DENTRO do mundo e se dá para ler sem aproximar a cabeça.
- **APROVA:** você vê vida, munição e arma atual em espaço de mundo, legíveis, sem nada colado na cara.
- **REPROVA:** falta informação essencial, o texto é ilegível, ou o painel acompanha a sua cabeça.

### 13. BAÚ — caixa I1#13

*I1#13 · D3 · D4 · 50s*

- **Faça:** Chegue perto de um baú e abra (botão de baixo da esquerda).
- **Observe:** se o baú avisa que dá para abrir ANTES de você tentar.
- **APROVA:** o baú tem destaque visível no headset quando você chega perto, e abre.
- **REPROVA:** nenhum destaque, ou não abre, ou só abre de longe demais/perto demais.

### 14. CARRO — caixa I1#14

*I1#14 · D5 · C1 · 70s*

- **Faça:** Entre no carro (botão de baixo da esquerda), dirija um pouco e saia.
- **Observe:** se a cabeça continua livre dentro do carro e onde você aparece ao sair.
- **APROVA:** você entra, a cabeça continua rastreando dentro da cabine, nada gira a vista sozinho, e você sai DE PÉ no chão.
- **REPROVA:** câmera colada no banco sem rastreio, vista girando sozinha, ou saída enterrada/voando.

### 15. CAPTURA

*G5 · G4 · 30s*

- **Faça:** Segure o botão Meta do controle direito e aperte o gatilho — duas vezes: uma olhando o HUD, outra olhando a paisagem.
- **Observe:** nada: é só a foto. Ela sai do compositor, que é a imagem que os seus olhos receberam.
- **APROVA:** você ouviu o clique da captura duas vezes.
- **REPROVA:** não conseguiu capturar.

### 16. NAVE E PARAQUEDAS — caixa I1#15

*I1#15 · D1 · A6 · 90s*

- **Faça:** Abra o menu (clique do analógico direito), entre numa partida de BR, pule da nave (botão de baixo da direita) e abra o paraquedas.
- **Observe:** se o pulo e o paraquedas saem pelo controle, e se a vista fica livre na queda.
- **APROVA:** você pula, abre o paraquedas, e a queda é dirigida sem que nada empurre a sua vista.
- **REPROVA:** pulo ou paraquedas que não saem pelo controle, ou vista arrastada/pilotada pelo rosto.

### 17. BAÚ DO BR — caixa I1#16

*I1#16 · D1 · 45s*

- **Faça:** No chão da partida de BR, abra um baú.
- **Observe:** se ele abre pelo controle.
- **APROVA:** o baú do BR abre e você pega o que tem dentro.
- **REPROVA:** não abre pelo controle.

### 18. MORTE — caixa I1#17

*I1#17 · I4 · H1 · 50s*

- **Faça:** Morra (deixe um inimigo te acertar, ou pule de bem alto) e leia a tela de morte.
- **Observe:** se a tela de morte existe dentro do mundo e se dá para sair dela pelo controle.
- **APROVA:** a tela de morte aparece em espaço de mundo e você sai dela apontando o raio e apertando o gatilho.
- **REPROVA:** tela de morte invisível no headset, ou beco sem saída.

### 19. PAUSA, MENU E SAÍDA — caixa I1#18

*I1#18 · F5 · I4 · 60s*

- **Faça:** Clique o analógico direito para pausar, volte ao jogo, pause de novo, abra o menu e saia da partida.
- **Observe:** se o ciclo inteiro acontece sem tirar o aparelho.
- **APROVA:** pausar, voltar, abrir o menu e sair da partida — tudo pelo controle, sem tirar o headset.
- **REPROVA:** qualquer passo que só o mouse resolveria.

### 20. JOGO CONTÍNUO

*E1 · E3 · E4 · E5 · I3 · I2*

- **Faça:** Volte para uma partida e JOGUE NORMALMENTE até eu avisar.
- **Observe:** qualquer coisa que atravesse o seu olho, engasgo, ou desconforto crescente.
- **APROVA:** nada atravessa o olho, a imagem não engasga e o desconforto não cresce.
- **REPROVA:** geometria entrando no olho, travadas, ou enjoo aumentando com o tempo.

### 21. DEPOIS DE TUDO — caixa I1#20

*I1#20 · E1 · E5 · 40s*

- **Faça:** Pare um instante e avalie a imagem agora, no fim da sessão.
- **Observe:** se a fluidez é a mesma do começo e se o aparelho esquentou.
- **APROVA:** continua tão fluido quanto no primeiro minuto e nada indica queda por calor.
- **REPROVA:** ficou mais travado, mais borrado, ou o aparelho está quente a ponto de avisar.

### 22. TIRAR O APARELHO — caixa I1#19

*I1#19 · F2 · 60s*

- **Faça:** Tire o aparelho da cabeça, conte até dez, e ponha de volta.
- **Observe:** o que o jogo fez enquanto você estava fora e ao voltar.
- **APROVA:** o jogo pausou sozinho e voltou inteiro, sem perder a partida e sem entrada fantasma.
- **REPROVA:** a partida continuou correndo sem você, travou, ou voltou quebrada.

## Folha de I1 para imprimir

| # | item | ☐ |
|--:|---|---|
| 1 | BOOT — o mundo aparece e acompanha a cabeça em até 4 s, OU aparece um indicador de carregamento DENTRO do VR desde o primeiro segundo. | ☐ |
| 2 | DE PÉ — você está de pé com os pés no chão, na sua altura real, e nada de corpo atravessa o seu olho. | ☐ |
| 3 | PASSO FÍSICO — o mundo se move na medida do seu passo e a arma continua no lugar em relação a você. | ☐ |
| 4 | PAREDE — a parede te barra e você não atravessa. | ☐ |
| 5 | GIRO — a cada passo o mundo gira em torno de você e nada desliza; a piscada é curta e não incomoda. | ☐ |
| 6 | VINHETA — a periferia fecha ao andar e ABRE POR COMPLETO ao parar; a velocidade parece de gente, não de carro. | ☐ |
| 7 | ARMA NA MÃO — a arma está NA sua mão, no ângulo da sua mão, e acompanha sem atraso, sem balanço e sem respiração. | ☐ |
| 8 | PELO BURACO DA ALÇA — você olha pelo buraco da alça, a massa fica centrada, e a arma não deu salto nenhum ao apertar o botão. | ☐ |
| 9 | TIRO E TATO — o tiro sai do CANO e você sente o háptico na mão que atirou. | ☐ |
| 10 | ACERTO — o tiro acerta onde a mira da arma estava apontando. | ☐ |
| 11 | RECARGA E AS 8 ARMAS — a recarga acontece e você chega nas 8 armas. | ☐ |
| 12 | HUD NO MUNDO — você vê vida, munição e arma atual em espaço de mundo, legíveis, sem nada colado na cara. | ☐ |
| 13 | BAÚ — o baú tem destaque visível no headset quando você chega perto, e abre. | ☐ |
| 14 | CARRO — você entra, a cabeça continua rastreando dentro da cabine, nada gira a vista sozinho, e você sai DE PÉ no chão. | ☐ |
| 15 | NAVE E PARAQUEDAS — você pula, abre o paraquedas, e a queda é dirigida sem que nada empurre a sua vista. | ☐ |
| 16 | BAÚ DO BR — o baú do BR abre e você pega o que tem dentro. | ☐ |
| 17 | MORTE — a tela de morte aparece em espaço de mundo e você sai dela apontando o raio e apertando o gatilho. | ☐ |
| 18 | PAUSA, MENU E SAÍDA — pausar, voltar, abrir o menu e sair da partida — tudo pelo controle, sem tirar o headset. | ☐ |
| 19 | TIRAR O APARELHO — o jogo pausou sozinho e voltou inteiro, sem perder a partida e sem entrada fantasma. | ☐ |
| 20 | DEPOIS DE TUDO — continua tão fluido quanto no primeiro minuto e nada indica queda por calor. | ☐ |

**Aprova: 20 de 20. Reprova: 19.**

## O que este roteiro deliberadamente NÃO faz

- **Não avisa o que já está vermelho.** Dizer ao observador o que ele deve encontrar é a
  forma mais barata de contaminar a observação. O estado conhecido de cada critério está
  na validação da rodada, para ser lido DEPOIS.
- **Não mede o que o PC já mede.** Draw calls, triângulos e as sondas de defeito são do
  `vr:emulado` e da suíte; repetir aqui só gastaria o tempo do humano.
- **Não mostra o item dentro do painel de VR.** Seria melhor — o jogador leria sozinho e
  não dependeria de locutor nem de alto-falante. O custo, medido antes de propor: o
  painel (`js/xr/xrui.js`) repinta um canvas de 1024×768 a cada mudança de assinatura, e
  uma linha de roteiro por bloco mudaria a assinatura 22 vezes na sessão — barato. O que
  NÃO é barato é o risco: o painel é de outra frente, ele já pausa o jogo ao abrir, e uma
  aba de roteiro dentro dele mudaria o que o item 19 (pausa) está medindo. **Fica como
  proposta para a frente do painel, com o custo acima, não como implementação desta.**
