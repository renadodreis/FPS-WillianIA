# VR — Progresso

Registro por fase: o que foi feito, o número antes e depois, e o que foi
decidido **não** fazer (com o motivo, para não ser reaberto de graça).

---

## Fase 0 — Baseline e instrumentação · 2026-08-25 · PORTÃO ABERTO

### Feito

- `scripts/vr-baseline.js` (+ `npm run vr:baseline`): medidor repetível com dois
  alvos — `--target=local` (Chrome desta máquina, GPU real) e `--target=quest`
  (navegador do Quest por adb + CDP). Não toca no runtime: liga o
  `js/perfhud.js` que já existe, lê `renderer.info` por frame no mesmo
  `requestAnimationFrame` do jogo e passeia por 4 poses fixas via
  `window.__game`. Zero consumo de `rand`.
- `adb` 34.0.4 instalado + regra udev do fornecedor `2833` (Quest 3) — a máquina
  fica pronta para o aparelho voltar.
- `docs/vr/baseline.md` com os números medidos e a leitura do gargalo.

### Medido (desktop, RTX 3050, tier `alto`, 1280×720, seed 424242)

| | medido | teto VR |
|---|--:|--:|
| draw calls (mediana / pior) | 463 / 740 | 180 |
| triângulos (mediana / pior) | 956 k / 1,26 M | 500 k |
| materiais únicos | 499 | 60 |
| luzes com sombra | 4 | 1 |
| boot até 1º frame | 2,38 s | 4 s |
| payload de boot | 10,57 MB / 146 req | — |

Cena: 1541 meshes · 185 InstancedMesh (174 005 instâncias) · **334 SkinnedMesh**.

Gargalo dominante: **conta de submissão por frame** (draw calls + materiais),
não tempo de GPU. Detalhe e evidência em `docs/vr/baseline.md`.

### Decidido NÃO fazer

- **Multiview.** O plano pedia habilitar `OCULUS_multiview` e medir. No three
  r0.185.1 instalado, multiview só existe no stack do `WebGPURenderer`
  (`src/renderers/common/XRManager.js`); o `WebXRManager.js` do `WebGLRenderer`
  — que é o que o jogo usa — tem **zero** ocorrência. Migrar de renderer
  quebraria CSM, EffectComposer, o addon Sky com uniform próprio e a injeção de
  shader da grama. Ganho típico (20–40 % de submissão) sai mais barato cortando
  463 → 120 draw calls, que ajuda os dois olhos e também o desktop.
- **Medir FPS no desktop.** O Chrome trava em 60 (vsync): mediria o monitor, não
  o jogo. Capacidade de GPU fica com `scripts/perf-probe.js` (4,5 ms/frame em
  800×600 mono).

### Em aberto

O portão da Fase 0 **não fechou**: falta rodar
`npm run vr:baseline -- --target=quest` com o headset plugado. O aparelho foi
desplugado antes da medição; o desenvolvimento segue sem ele por decisão do dono
do projeto, e a tabela do aparelho é preenchida quando o cabo voltar.
