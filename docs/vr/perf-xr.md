# Desempenho em XR — medição e o que ela diz

Medido em sessão `immersive-vr` real (IWER, preset Quest 3), commit `5a52d51`.
Contagem (draw calls, triângulos) o emulado mede igual ao aparelho; **tempo
não** — frame time só vale medido no Quest, via `adb logcat -s VrApi`.

## Onde o quadro é gasto

Atribuição por subtração (`npm run vr:censo`, mono, pose de spawn, sombras
desligadas durante a atribuição — com elas ligadas o agendamento das cascatas
CSM torna os frames incomparáveis):

| dono | draw calls | triângulos | nós |
|---|--:|--:|--:|
| mundo (Mesh anônimo) | 96 | 591 k | 93 |
| Enemies | 56 | 48 k | 8 |
| arma em primeira pessoa | 24 | 11 k | 1 |
| grupos diversos | 19 | 1 k | 5 |
| **frame sem sombra** | **198** | **0,65 M** | |
| custo das 4 cascatas CSM | +42 | +0,16 M | |

Dois números que saltam:

- **Enemies gasta 7 draw calls por inimigo** (56 para 8 visíveis). Com 12
  inimigos no orçamento, é a maior fonte por unidade.
- **A arma custa 24 draw calls sozinha**, e o censo lista **192 aparências
  repetidas** de `MeshStandardMaterial` só nela. É gordura, não conteúdo.

## O preset de sessão: quanto ele paga

`js/xr/xrquality.js` apaga as cascatas de sombra distantes, encurta o alcance
da sombra, ajusta o framebuffer e a foveação — tudo aplicado ao entrar e
desfeito ao sair. Medido em estéreo, com e sem:

| pose | sem preset | com preset | ganho |
|---|--:|--:|--:|
| spawn | 516 calls · 1,74 M tris | 495 · 1,66 M | −4 % |
| cidade | 565 calls · 1,45 M tris | 515 · 1,34 M | −9 % |
| castelo | 808 calls · 2,03 M tris | 775 · 1,88 M | −4 % |

## A conclusão honesta

**O alvo é 180 draw calls e 500 k triângulos por olho. A pose de castelo está
em 808 e 2,03 M. É preciso cortar 78 %, e o preset entrega 4–9 %.**

Configuração não resolve isso, e insistir nela é teatro. O que falta é
estrutural, e cada item tem um risco declarado:

1. **Mesclar a geometria estática do mundo.** 93 nós anônimos pagando 96 draw
   calls é o maior bloco. Merge por material, com atenção ao culling — objeto
   mesclado grande fica sempre visível.
2. **Reduzir meshes por inimigo.** 7 draw calls por inimigo, com 12 inimigos,
   é o pior custo por unidade do jogo.
3. **Compartilhar material na arma.** 192 aparências repetidas num único
   objeto. Cuidado: já houve uma tentativa de consolidação de material nesta
   base que saiu **net-negativa**; refazer sem medir antes e depois é repetir
   o erro.
4. **Atlas de textura** para colapsar os 258 materiais redundantes (59 % das
   434 aparências da cena).

**O risco que governa tudo isso:** os módulos de mundo consomem o `Math.random`
seedado, e a ordem de consumo é contrato — bots e servidor reconstroem o mesmo
mundo a partir da mesma semente. Merge e instancing têm que preservar a ordem
de consumo, ou o headset joga num mundo diferente do dos outros jogadores.

Enquanto esses quatro não forem feitos, **72 fps travados não é uma promessa que
se possa fazer**, e o critério E do `criterio-aaa.md` continua reprovado.
