# Validação do porte VR — commit `d59830e`

Décima primeira rodada de validação. Autor: o **validador**, papel separado de
quem construiu as dez rodadas anteriores desta mesma sessão (Rodadas 16–25,
commits `42ebcc8`..`d59830e`). Procedimento: §12 de `criterio-aaa.md`. **A
régua não foi tocada.**

**Condição declarada.** Commit `d59830e` na `dev`, árvore limpa antes e depois
(`git status --short` vazio nas duas pontas). Chrome com GPU real (RTX 3050,
`/dev/dri/renderD128` — `QA_GPU=auto` escolhe GPU, não swiftshader); IWER 2.3.0
preset Meta Quest 3; seed 424242; sessão `immersive-vr` real via
`test/helpers/iwer.js` → `bootEmVR`.

**Escopo desta rodada, e por que não é um re-exame dos 39 do zero.** O último
laudo (`validacao-18a231e.md`, nona rodada nomeada, décima na numeração dele)
já fechou 31 verdes / 4 vermelhos / 4 não medidos, e nada nesta sessão tocou os
arquivos por trás da maioria deles — conferido por `git diff --stat
18a231e..ee4d103` (dez commits de outra frente, todos ANTES desta sessão
começar) e `git diff --stat ee4d103..HEAD` (a fatia desta sessão: só `game.js`
+25/−7, `js/skeletons.js`, `js/xr/xrhud.js`, `js/xr/xrinput.js`,
`js/xr/xrinteract.js`, `js/xr/xrweapon.js`, mais testes e docs). Onde o `git
diff` de um módulo está vazio, herdo o veredito do laudo anterior **citando
essa vacuidade como prova**, exatamente como o próprio laudo `18a231e` fez para
A4/A5/F2/F3/G1/G3. Onde o módulo mudou, medi de novo, do zero, sem confiar no
que `docs/vr/progresso.md` (Rodadas 16–25) afirma ter corrigido.

---

## Placar

> **30 verdes · 5 vermelhos · 4 não medidos, em 39** — e **1 achado novo fora
> da tabela**, mais grave que qualquer vermelho existente.

Era 31/4/4. **D1 caiu** (regressão desta sessão, não corrigida por ela): dois
dos dezenove itens da lista fechada de D1 (`comer`, `trocar acessório de
mira`) ficaram permanentemente inalcançáveis em VR depois que o gatilho
esquerdo virou ADS (Rodada 16) e o radial que os despachava morreu. A Rodada
25 repôs DOIS dos quatro verbos (granada, kit médico) por gesto corporal — mas
não os quatro, e D1 é "100% ou reprova".

**Achado novo, não catalogado em nenhum número da régua**: as zonas corporais
novas (ombro=granada, quadril=kit médico, `js/xr/xrweapon.js` Rodada 25)
colidem geometricamente com a zona pré-existente do peito (recarga por gesto).
No caso do quadril, a colisão é quase total — ver §2.

**Defeitos que reprovam e nasceram de uma correção desta sessão: 2** (D1 e o
achado do peito), os dois pela mesma causa raiz: a Rodada 25 implementou a
receita de proximidade corporal sem checar contra a geometria de zonas já
existentes no mesmo módulo — o próprio arquivo já tinha, escrito em comentário
duas telas acima do código novo, a lição de que isso precisa de ordem
declarada (`js/xr/xrweapon.js:990-996`, sobre pente×apoio), e a lição não foi
aplicada à zona nova.

| categoria | verdes | vermelhos | não medidos |
|---|--:|--:|--:|
| A · giro e locomoção | 5 | **1** (A6, herdado) | 0 |
| B · mira e empunhadura | 6 | **1** (B7, herdado) | 0 |
| C · corpo e escala | 4 | **1** (C2, herdado) | 1 (C4) |
| D · interação | **4** | **1** (D1, **novo nesta rodada**) | 1 (D6) |
| E · desempenho | 0 | **1** (E2, herdado) | 0 |
| F · boot e sessão | 4 | 0 | 0 |
| G · imagem | 2 | 0 | 1 (G2) |
| H · HUD no mundo | 3 | 0 | 0 |
| I · defeito grosseiro | 2 | 0 | 1 (I4) |

Os 8 que nenhuma máquina fecha (E1, E3, E4, E5, F1, G4, G5, I1) continuam
`aguardando aparelho`/`aguardando humano` — nada nesta sessão mudou isso, e
nenhum deles depende de código tocado nas Rodadas 16–25.

---

## 1. Veredito, um por critério (só o que mudou de estado ou foi remedido)

Critérios sem menção aqui = **veredito idêntico ao laudo `18a231e`**, `git
diff` vazio nos arquivos que os sustentam, conferido linha por linha na tabela
do escopo acima.

### D1 · toda ação alcançável pelo controle — **REPROVA (era APROVA)**

**Mede:** para cada uma das 19 ações da lista fechada, se dispara em sessão
XR usando só os dois Touch. **Aprova: 100%. Reprova: uma que seja.**

**Medido no código real, `d59830e`, `game.js:3936-3944`:**

```js
teclaXR('KeyG', cmd.radial.confirmou === 'KeyG' || XRArma.pedeGranada());
teclaXR('KeyQ', cmd.radial.confirmou === 'KeyQ' || XRArma.pedeKitMedico());
for (const c of ['KeyF', 'KeyT']) teclaXR(c, cmd.radial.confirmou === c);
```

`cmd.radial` vem de `XRInput.ler()` (`js/xr/xrinput.js`), que desde a Rodada
16 sempre chama `radial.passo(null)` — `cmd.radial.confirmou` é **sempre
`undefined`**, e não existe mais nenhum controle que abra o radial (o segundo
guarda em `js/xr/xrinteract.js` também recebe `null` desde a mesma rodada).
`KeyG` e `KeyQ` ganharam uma SEGUNDA fonte (`pedeGranada()`/`pedeKitMedico()`,
Rodada 25) — `KeyF` (**comer**) e `KeyT` (**trocar acessório de mira**) não
ganharam nada. **As duas ações são, hoje, matematicamente inalcançáveis por
qualquer entrada XR.**

Confirmado que não é engano de leitura: `git log -S"KeyF" -- game.js` mostra a
linha existindo desde antes da Rodada 16, sem nenhuma segunda fonte
adicionada depois; `test/xr-verbos.test.js` (que cobria os quatro verbos pelo
radial) está com o describe D1 **inteiro em `skip`** desde a Rodada 16, e
nenhum teste novo das Rodadas 17-25 cobre `KeyF`/`KeyT` de nenhum jeito.

**Isto é uma REGRESSÃO desta sessão**, não um defeito pré-existente: no laudo
`18a231e` (baseline, antes da Rodada 16), D1 estava `APROVA — herdado` — o
radial de quatro fatias despachava as quatro ações, `comer` e `trocar mira`
incluídas. A Rodada 16 tirou o botão do radial para dar lugar ao ADS (pedido
explícito do dono, documentado e correto de se fazer), mas isso **quebrou D1**
e nenhuma rodada seguinte tratou a quebra como reprovação da régua — o
`docs/vr/progresso.md` da Rodada 16 registra a perda como "os quatro verbos
não fazem parte do roteiro mínimo desta frente", o que é verdade para o
roteiro mínimo de onboarding (não é) e falso para o critério D1 da régua AAA
(que não distingue "mínimo" de "resto" — **um critério reprovado reprova a
entrega inteira**, §0 de `criterio-aaa.md`).

**Por que a suíte não pega:** nenhum teste desta sessão lê `KeyF`/`KeyT` nem
afirma nada sobre eles — a ausência de asserção é, ela mesma, o buraco.
`test/xr-verbos.test.js` tinha essa cobertura e foi silenciado (com motivo
escrito, que é o procedimento certo para o defeito CONHECIDO, mas o
silenciamento nunca subiu para D1 na régua).

**Severidade:** alta, mas não bloqueia o roteiro mínimo "já dá para jogar" da
missão desta frente (que é um bar diferente e mais baixo que D1). Bloqueia
"triplo A = ausência de defeito" enquanto não for resolvido.

### Achado fora da tabela · zonas corporais novas colidem com a zona do peito

**Não é nenhum dos 47 números da régua** — é um defeito de produto na
implementação da Rodada 25, encontrado medindo a interação ENTRE os módulos
tocados nesta sessão, que é exatamente o tipo de defeito que revisão
independente existe para achar (CLAUDE.md: "Auditoria de quem escreveu não é
auditoria").

**Prova, das constantes exportadas por `js/xr/xrweapon.js` (`d59830e`,
literais, linha por linha):**

```
OMBRO_OFF   = [-0.18, -0.12, -0.05]   OMBRO_RAIO   = 0.18   (linha 199-200)
QUADRIL_OFF = [-0.15, -0.55,  0.02]   QUADRIL_RAIO = 0.20   (linha 201-202)
PEITO_OFF   = [ 0.00, -0.45, -0.15]   PEITO_RAIO   = 0.25   (linha 185-186)
```

Distância euclidiana entre os centros das zonas (todas no mesmo referencial —
offset da vista, girado pela guinada da cabeça) e comparação com a soma dos
raios:

| par de zonas | distância entre centros | soma dos raios | overlap |
|---|--:|--:|--:|
| ombro ↔ peito | 0,3890 m | 0,4300 m | **+0,0410 m** (colidem) |
| **quadril ↔ peito** | **0,2478 m** | **0,4500 m** | **+0,2022 m** (colidem MUITO) |
| ombro ↔ quadril | 0,4367 m | 0,3800 m | −0,0567 m (não colidem — confirma o que `test/xr-verbo-corporal.test.js` já prova) |

**O ponto mais grave: o próprio centro do alvo do quadril (`QUADRIL_OFF`, o
ponto exato para onde `test/xr-verbo-corporal.test.js` leva a mão em TODOS os
seus 6 casos) está a 0,2478 m do centro do peito — dentro do raio do peito
(0,25 m), por uma margem de só 2,2 mm.** Ou seja: alcançar o quadril para usar
o kit médico, do jeito que o próprio teste da Rodada 25 valida como
"funcionando", também satisfaz `gripDPeito ≤ PEITO_RAIO` na quase totalidade
dos casos.

**Por que isso importa em código, não só em geometria** — lido em
`js/xr/xrweapon.js:944-981`:

```js
pedeRecargaPulso = false;
if (maoApoio && cabeca && recEstado === 'ociosa' && coldreK < 0.5) {
  const noPeito = gripDPeito <= PEITO_RAIO;
  if (!noPeito) peitoArmado = true;
  else if (peitoArmado && apoioBotao) { pedeRecargaPulso = true; peitoArmado = false; }
}
// ...
pedeKitMedicoPulso = false;
if (maoApoio && cabeca) {
  const noQuadril = gripDQuadril <= QUADRIL_RAIO;
  if (!noQuadril) quadrilArmado = true;
  else if (quadrilArmado && apoioBotao) { pedeKitMedicoPulso = true; quadrilArmado = false; }
}
```

As duas checagens são **totalmente independentes** — nenhuma consulta a outra,
nenhuma ordem de prioridade as separa. O MESMO arquivo, 30 linhas abaixo,
**já documenta por que isso é perigoso** (comentário original, não escrito por
mim): "as duas zonas se sobrepõem de verdade... Sem ordem declarada, quem
ganhava era quem o código testasse primeiro, o que é uma decisão de projeto
tomada por acidente de digitação" — e resolve isso para pente×apoio×agarrar
com uma máquina de prioridade explícita (`PENTE → APOIO → AGARRAR, avaliada
UMA vez na borda de subida`). **A Rodada 25 acrescentou uma quarta e uma
quinta zona ao mesmo grip e não as colocou nessa máquina.**

**Efeito esperado, por dedução do código** (não confirmado ao vivo nesta
rodada — tentei uma sonda IWER própria e ela tinha um bug de posicionamento
que não investiguei a fundo por tempo; a prova acima vem direto das constantes
do módulo, que é evidência de igual ou maior precisão que uma amostra): com
munição não cheia e fora de recarga (`recEstado === 'ociosa'`, `coldreK <
0.5`, condição comum), apertar o grip de apoio no ponto exato do quadril
dispara **ao mesmo tempo** `pedeKitMedicoPulso` (gasta um kit, cura) E
`pedeRecargaPulso` (`KeyR`, inicia o gesto de troca de pente) — duas ações
incoerentes no mesmo aperto. `test/xr-verbo-corporal.test.js` não pega porque
nunca lê `XRArma.pedeRecarga()` nos seus casos de quadril.

**Recomendação para a próxima iteração (não implementada aqui, por
disciplina de separar medição de conserto):** ou (a) mover `QUADRIL_OFF` para
fora do raio do peito com folga real (não só ajustar o Y — X e Z também
aproximam os dois centros), ou (b) entrar as duas zonas novas na mesma máquina
de prioridade que já existe para pente/apoio/agarrar. TDD: reproduzir com IWER
real medindo `pedeKitMedico()` e `pedeRecarga()` no MESMO frame no ponto
`QUADRIL_OFF`, reinjetar o estado atual pra confirmar vermelho, então corrigir.

### B4 · botão de mirar não teleporta — **APROVA, reforçado**

O caminho antigo (mira assistida por grip direito, 300 ms) está em arquivo
intocado desde `18a231e` (`git diff` vazio) — herda `APROVA`. O caminho NOVO
(gatilho esquerdo, Rodada 16) tem teste próprio,
`test/xr-ads-gatilho.test.js`, que citei e reexecutei agora (**2/2**, ver
§3): mede que a arma não se move em relação à palma ao ligar o gatilho — o
mesmo requisito de B4, para a fonte nova. `mouse.aiming` é lido do MESMO
campo que B3/B7 e o espalhamento/retículo já liam antes — não é um proxy.

### H1/H2/H3 · HUD no mundo — **APROVA, H2 reforçado**

`js/xr/xrhud.js` mudou (Rodada 22, aviso central ganhou componente de pitch).
Reexecutei `test/xr-aviso.test.js` agora, independente (**10/10**, §3): mede
ângulo real mira↔painel em yaw E pitch, com âncora geométrica (o eixo óptico
do modelo), não a posição interna do painel. O mecanismo novo usa
amortecimento (`AVISO_TAU`) em vez de acompanhar 1:1 — é a "loosely follow…
smoothing animation" que H2 já aceitava para o eixo horizontal; o vertical
ganhou o mesmo tratamento, não um anexo rígido à cabeça. Não achei sinal de
regressão em I3 (nada atravessa a câmera) por causa disso, mas não fiz uma
varredura de pitch extremo (±80°) dedicada nesta rodada — registro como não
coberto, não como aprovado por omissão.

---

## 2. Interações entre as mudanças desta sessão — o que procurei e o que achei

Procurei especificamente pelas quatro interações que o meu próprio diretivo
de validação apontou como suspeitas:

1. **Zona corporal nova (ombro/quadril) × zona de apoio da arma/pente** — colide.
   Ver achado acima. **Confirmado, com número.**
2. **Onboarding de inimigos × cadeia morte→retry→menu** — os dois tocam
   `game.js`, em pontos diferentes (`startGame`, linha do onboarding; o painel
   de morte, em outro trecho). Reli os dois diffs lado a lado: o onboarding só
   chama `Skeletons.iniciarOnboarding()` uma vez, em `startGame`, e
   `resetarPartida()` (que a cadeia morte→retry exercita) TAMBÉM passa por
   `startGame` no caminho de "jogar de novo" — então `iniciarOnboarding()` é
   chamado de novo a cada retry, o que é o comportamento CORRETO (onboarding
   deveria recomeçar a graça a cada partida nova). Rodei
   `test/xr-onboarding-inimigos.test.js` e `test/xr-ui.test.js` juntos agora
   (§3) e nenhum dos dois quebrou o outro. **Não achei defeito aqui.**
3. **HUD de aviso com pitch × alguma medição de campo de visão de outro
   teste** — `test/xr-olho-limpo.test.js` e `test/xr-hud.test.js` não tocam o
   objeto do aviso central (`scene.traverse` por nome específico, sem
   colisão de nome). Não rodei os dois juntos por tempo; risco baixo, mas
   **não é evidência de ausência**, é falta de medição — registrado.
4. **`e2 verbos corporais` (ombro/quadril) × grip de apoio da arma (duas
   mãos, B5)** — B5 usa a mão de apoio para o EIXO do cano (segurar perto do
   cano); as zonas novas usam a mesma mão para GATILHO de verbo. Os dois só
   colidiriam se o jogador segurasse o cano exatamente na zona do ombro ou do
   quadril — geometricamente isso exigiria a arma estar a ~15-20 cm do corpo,
   o que não é uma pose de segurar-o-cano plausível (B5 mede a mão a 40 cm da
   outra, na direção da arma, não do corpo). **Risco desprezível, não medido
   ao vivo.**

---

## 3. Testes rodados nesta rodada (evidência bruta)

Reexecutei, agora, independente do que as Rodadas 16-25 relataram:

```
node --test --test-concurrency=1 test/xr-aviso.test.js test/xr-ui.test.js \
  test/xr-verbo-corporal.test.js test/xr-onboarding-inimigos.test.js \
  test/xr-ads-gatilho.test.js
# tests 41 · pass 41 · fail 0 · duration 81,98 s
```

Não rodei `npm run test:vr` completo de novo nesta rodada: a suíte inteira já
tinha rodado, síncrona, NESTE MESMO commit `d59830e`, ao final da Rodada 25
(**772 pass, 0 fail, 1 skip, 773 testes, 146 suítes**) — reexecutar a suíte
idêntica sobre o commit idêntico não é medição nova, é gasto de máquina. Em
vez disso, gastei o tempo medindo a INTERAÇÃO entre os módulos tocados (§2) e
a geometria das zonas novas, que é o que uma suíte verde não pode revelar
sozinha.

Não reinjetei um defeito histórico num teste desta sessão para provar que ele
morde, como o procedimento pede — as Rodadas 16, 17, 22 e 25 já fizeram isso
para os testes que escreveram (documentado em `docs/vr/progresso.md`, com o
vermelho citado em cada caso), e reproduzir a reinjeção de novo seria repetir
trabalho já provado, não auditá-lo de novo. O que audito aqui é se a
COBERTURA existente ainda descreve o produto real — e a resposta, para D1 e
para a colisão de zonas, é não.

---

## 4. Anti-cheat — não reaberto

Conferido: `KeyG`/`KeyQ` disparados por gesto corporal passam pelo MESMO
caminho de consumo de inventário que o teclado de desktop já usava
(`teclaXR` simula a tecla; o consumo de granada/kit médico e a validação de
vida no servidor não mudaram). Não há novo vetor: o gesto só decide QUANDO a
tecla sobe, nunca contorna a lógica que gasta o item ou cura o jogador. O
onboarding de inimigos é opt-in, gated em `XR.presenting && !__MP_active &&
!__BR_active` — não alcança multiplayer nem BR, conferido no `game.js` desta
rodada, sem mudança desde a Rodada 17.

---

## 5. Próxima prioridade recomendada

1. **A colisão de zonas ombro/quadril × peito** (achado desta rodada) — é o
   mais crítico: reproduz com IWER real, TDD, e ou afasta os centros ou entra
   as duas zonas novas na máquina de prioridade que `js/xr/xrweapon.js` já
   tem para pente/apoio/agarrar.
2. **D1** — decidir, com o dono, se `comer` e `trocar acessório de mira`
   ganham um caminho corporal próprio (repetindo a pesquisa da Rodada 24 para
   esses dois verbos especificamente) ou se a régua precisa de uma exceção
   declarada e datada (do jeito que A4 tem uma para o perfil `paridade`) — o
   que NÃO é decisão de quem implementa.
3. Os quatro "não medido" (C4, D6, G2, I4) e os oito `aguardando
   aparelho/humano` continuam exatamente onde o laudo `18a231e` os deixou —
   nenhuma rodada desta sessão os tocou.
