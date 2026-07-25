# Client Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar fluidez local e reduzir travamentos de frame sem alterar protocolo, RNG, regras, controles, física ativa ou resultado visual estável do jogo.

**Architecture:** Manter os dois loops e o passo físico existentes, mas tirar trabalho redundante do caminho crítico: cascatas distantes de sombra serão atualizadas em rodízio; o refill determinístico da grama usará somente as três amostras que consome, sem construir a classificação completa da superfície; veículos estacionados terão apenas o callback de suspensão hibernado e serão reativados no primeiro `wakeup`; modelos skinned usarão bounds conservadores; baús preservarão o culling e o prewarm já iniciados no worktree. Tempo real e tempo simulado serão medidos separadamente para o HUD deixar de esconder slow-motion.

**Tech Stack:** JavaScript ES modules, Three.js r184/r185, cannon-es, Express/Socket.IO, Node test runner, Puppeteer/Chrome headless e Playwright.

## Global Constraints

- Preservar integralmente as mudanças locais preexistentes em `br-game.js`, `js/chestmodel.js` e `scripts/perf-probe.js`.
- Não alterar seed, ordem de RNG, densidade final da grama, geometria autoral, loot, colisões, cadência de rede ou protocolo.
- Não aumentar o clamp temporal nem `maxSubSteps`; a correção segura desta rodada é observabilidade + redução de custo.
- Toda mudança de produção nasce de um teste RED específico e é seguida por teste focado GREEN.
- Medições SwiftShader são comparações relativas; não serão apresentadas como FPS de GPU real.
- Não criar commit: o usuário já mantém um conjunto local não commitado.

---

## Task 1: Congelar linha de base e contratos de desempenho

**Files:**

- Modify: `progress.md`
- Modify: `scripts/perf-probe.js`

- [x] Registrar `git status`, `git diff --check`, `npm run analyze:lines` e o resultado de `npm run lint && npm test`, separando flakes históricos de regressões.
- [x] Registrar no `progress.md` a hipótese comprovada: sombras + grama excedem o frame; refill de grama cria picos; Cannon entra em recuperação; o clamp mascara o FPS abaixo de 20.
- [x] Tornar o probe explícito sobre viewport/SwiftShader/render bruto e medir cenário após o culling de baús, sem mudar a cena de produção.
- [x] Guardar baseline repetido de draw calls, triângulos, render bruto e custo de crossing de chunk.

## Task 2: Separar relógio real, instrumentar física e escalonar CSM

**Files:**

- Modify: `test/gameplay.test.js`
- Modify: `game.js`

- [x] Adicionar teste RED: com `timeScale=0.25`, 240 ticks de `1/60` continuam reportando aproximadamente 60 FPS, não 240.
- [x] Adicionar teste RED: `G.perf` informa substeps reais e tempo descartado num `tick(0.1)`.
- [x] Adicionar teste RED: apenas a cascata próxima tem `shadow.autoUpdate=true`; as três distantes percorrem um rodízio observável.
- [x] Executar `node --test --test-concurrency=1 test/gameplay.test.js` e confirmar as falhas esperadas.
- [x] Separar `frameDt` de `dt` sem mudar nenhum consumidor da simulação nem o comportamento de `tick(forceDt)`.
- [x] Medir `world.stepnumber`/`world.accumulator` num objeto pré-alocado `G.perf`.
- [x] Manter a primeira cascata automática e marcar uma cascata distante por frame; forçar todas na primeira renderização, resize, mudança de frustum e reativação de sombras.
- [x] Executar novamente o teste focado até GREEN.

## Task 3: Remover picos do streaming e trabalho duplicado da grama

**Files:**

- Modify: `test/grass-decor.test.js`
- Modify: `js/grass.js`

- [x] Adicionar teste RED de paridade: `height`, `desertK` e `forestK` do sampler direto são idênticos aos campos usados hoje via `surfaceAt` numa grade ampla.
- [x] Adicionar teste RED vivo: refill/reciclagem da grama não chama `surfaceAt`, que calcula slope, pesos, categoria urbana e aloca objetos não consumidos.
- [x] Adicionar contrato RED do shader: calcular `modelMatrix * instanceMatrix` uma vez e reutilizar a matriz para raiz e vértices.
- [x] Executar `node --test --test-concurrency=1 test/grass-decor.test.js` e confirmar RED.
- [x] Trocar a classificação completa por `heightAt` + `biomeAt` + os mesmos dois `smoothstep`, mantendo matrizes, bytes, RNG, máscaras e bounds idênticos.
- [x] Eliminar o produto de matrizes duplicado no vertex shader sem alterar a matemática.
- [x] Executar o teste focado até GREEN e medir crossing. Só se o pico ainda exceder o orçamento, reduzir o lote para dois chunks/frame com fila coalescida e teste vivo de drenagem.

## Task 4: Hibernar somente a suspensão de veículos estacionados

**Files:**

- Modify: `test/car-settle.test.js`
- Modify: `js/car.js`

- [x] Adicionar teste RED: depois do assentamento, carros não pilotados estão `SLEEPING` e seus callbacks `RaycastVehicle` estão suspensos.
- [x] Adicionar guarda no mesmo teste: `wakeUp()` e `setCur()` reativam imediatamente o callback.
- [x] Executar `node --test --test-concurrency=1 test/car-settle.test.js` e confirmar RED.
- [x] Após estabilidade contínua, três ou mais rodas apoiadas e velocidade baixa, remover somente `vehicle.preStepCallback` e forçar sleep.
- [x] No evento `wakeup`, reinstalar exatamente o mesmo callback antes do próximo passo; manter body/collider no mundo.
- [x] Executar `car-settle`, `car-wheels`, `car-hillstart`, `car-terrain-traversal`, `car-remote-wheels` e `castle-vehicle-surfaces`.

## Task 5: Culling conservador de atores e baús sem pop

**Files:**

- Modify: `test/skeletons.test.js`
- Modify: `js/skeletons.js`
- Modify: `test/br-crates.test.js`
- Modify: `br-game.js`

- [x] Adicionar teste RED: meshes do esqueleto carregado usam frustum culling com bounding sphere conservadora válida.
- [x] Calcular bounds do rig uma vez no load, expandi-los para toda a animação procedural e reativar `frustumCulled`, preservando sombras quando o ator pode contribuir.
- [x] Adicionar teste RED: o culling dos baús pode ser aplicado de forma determinística e já está correto imediatamente após `beginMatch`.
- [x] Extrair a atualização de visibilidade dos baús, chamá-la no boot e manter a cadência de 0,5 s do worktree.
- [x] Executar `skeletons`, `br-crates`, `br-pve-weapons`, `br-bot-visual` e `char-fixes`.

## Task 6: Medir, inspecionar visualmente e fechar regressões

**Files:**

- Modify: `progress.md`
- Modify if needed: `scripts/perf-probe.js`

- [x] Repetir o microbenchmark isolado no mínimo três vezes e comparar mediana de calls/triângulos/ms com a linha de base.
- [x] Rodar uma rota curta a pé e de carro com o cliente oficial de web game; coletar `render_game_to_text`, screenshot e erros de console.
- [x] Inspecionar visualmente screenshots de grama, sombra próxima/distante, esqueleto, carros e baús.
- [x] Executar `npm run lint`, todos os testes focados, `npm test`, `git diff --check` e `npm run analyze:lines` (`npm test` monolítico atingiu o SIGTERM externo de ~10 min; todos os 68 arquivos foram então cobertos explicitamente em blocos seriais).
- [x] Revisar o diff para garantir que nenhuma mudança do usuário foi perdida e nenhum protocolo/RNG foi alterado.
- [x] Atualizar `progress.md` com resultados, limitações e números antes/depois.
