# Refatoração de personagens — "da água pro vinho"

Data: 2026-07-24 · Branch: `refatoracao`

Pesquisa profunda (55 agentes, 7 subsistemas, **34 bugs confirmados**) do sistema
de personagem: seleção/customização, corpo FP (`js/fpbody.js`), avatar remoto
voxel (`br-game.js`), PvE (`js/enemies.js`, `js/skeletons.js`) e o rig/recarga de
armas (`game.js` + `js/weaponrig.js`). Diagnóstico: customização rasa (só nick +
4 cores, paleta duplicada em 3 lugares, sem validação de hex → avatar branco por
lixo), recarga com um crash de rede, e combate com dano/headshot inconsistentes.

## Lote 1 — ENTREGUE (bugs críticos + fundação de cor)

### Bugs corrigidos

1. **Recarga (crash do rig)** — a sniper "Agulha" (idx6) tem gatilho por nó de
   GLB sem `pos`; quando o GLB falha na rede, `obj.position.fromArray(undefined)`
   (`weaponrig.js:287`) lançava TypeError que subia pelo `for` de
   `attachComplements` (`game.js`) e **derrubava a escopeta "Rajada" (idx7)** — a
   arma ficava sem miras/mecanismos. Fix: só criar o gatilho procedural quando há
   `pos`; `try/catch` por-arma + `.catch` no loop.
2. **Recarga dirigindo/morto** — `startReload`/`finishReload` rodavam ANTES do
   guard de morto/dirigindo/pausado/nave/cinemática. Fix: `reloadBlocked()` no
   início das duas (recarga pendente completa quando desbloqueia — sem soft-lock).
3. **Splash sempre −20%** — o splash passava os pés como `hitPos`, e o teste de
   perna (`hitPos.y < pos.y+0.78`) era sempre verdadeiro → todo explosivo tirava
   80% enquanto o número flutuante mostrava 100%. Fix: `hitPos=null` no splash.
4. **Faca sem headshot em remoto** — o ramo remoto do melee mandava dano cru; só
   as balas multiplicavam. Fix: 1.75× na cabeça também no melee remoto (34→60,
   dentro do cap 95 do anti-cheat).
5. **Cor sem validação → avatar branco** — servidor aceitava hex lixo, virava
   `THREE.Color('garbage')` = branco. Fix: `brcolors.js` + `sanitizeColors`.
6. **Ressurreição deitada** — avatar remoto tombava na morte e `deadT`/`rotation.x`
   nunca resetavam; nova partida reativava `alive` com o boneco DEITADO. Fix:
   reset no roster ao reativar `alive` false→true.

### Fundação de customização (R1 + R3)

- **`brcolors.js` (novo)** — fonte única (padrão dual CJS/global do
  `ship-protocol.js`): `DEFAULT_COLORS` + `sanitizeColors` (allowlist hex por
  papel, fallback por índice). Consumida por cliente (`multiplayer-client.js`),
  avatar remoto (`br-game.js buildVoxelBody`) e servidor (`server.js hello`).
  Servido pelo whitelist (`server.js:54`).
- **Bots coloridos** — `scripts/bots.js` deriva 4 cores por índice (golden-angle
  no matiz, `Math.random` próprio — nunca o rand seedado). Bots deixam de ser
  todos iguais.

### Testes novos

- `test/br-colors.test.js` (6, Node puro) — `sanitizeColors`/`DEFAULT_COLORS`:
  lixo/rgba/nomes CSS caem no default por índice, hex válido normaliza minúsculo,
  saída sempre segura pra atributo HTML.
- `test/char-fixes.test.js` (2, browser, porta 3263) — com o GLB da sniper idx6
  BLOQUEADO (força o fallback): idx7 recebe complementos e não há erro de página;
  recarga não roda dirigindo/morto e completa normal.

## Lote 2 — ENTREGUE (customização visível)

- **R2** — `hello` com debounce (~250ms): antes emitia a cada tecla/arraste e cada
  hello faz `broadcastRoster` O(N). `sendHello()` coalesce o último estado.
- **R4** — flash de dano cobre o visor, com **restauração** do glow base ao fim
  (visor tratado separado dos `mats`, senão perderia o emissivo permanente).
- **R5** — **re-tint ao vivo** do avatar remoto: trocar de cor re-tinge o boneco
  JÁ criado (`buildVoxelBody.retint`), guarda por `colorsKey` no `playerUpdate`
  (alta frequência → sem alocar `Color` por tick). Materiais + visor + canopy.
- **R7** — **preview 3D no lobby + 6 presets + botão aleatório**: canvas com cena
  three mínima reusando `buildVoxelBody` (fonte única, exposto via
  `__BR_debug.buildBody`); auto-descarta quando o lobby fecha (`offsetParent`
  null). Presets/aleatório atualizam inputs + preview (retint) + salvam + hello.
  Verificado por captura (`scripts/capture-lobby.js` → `output/lobby/`).
- Testes: `test/char-lobby.test.js` (4, browser 3264) — buildBody aplica as 4
  cores nos materiais certos, `retint` troca sem recriar (corpo/visor/cVisor/
  canopy), cor inválida cai no default.

## Lote 3 — ENTREGUE (feel de recarga)

- **R8 — recarga coreografada correta:**
  - Sniper: trocar de arma no meio da recarga zerava `gun.reloading` mas os nós
    clip-owned `mag_4`/`bolt_6` congelavam fora do lugar. `js/weaponmodels.js`
    ganhou a **borda de descida** do reload: `action.reset()+mixer.update(0)+
    action.stop()` devolve ao bind (aplica frame 0 mesmo com a arma invisível).
  - Mão esquerda: 3 ramos em vez de 2 — pente PROCEDURAL persegue o pente;
    escopeta vai à porta; **sniper (clip) e bazuca ficam no apoio** (antes a mão
    perseguia um nó dirigido pelo clip / a bazuca fazia gesto de porta indevido).
- **R9 — recarga interrompível + escopeta incremental:**
  - **Cancelável**: atirar com `gun.mag>0` durante a recarga cancela (mantém o
    já carregado) — R acidental não prende mais o `reloadTime` inteiro.
  - **Escopeta cartucho-a-cartucho**: `updateReload` carrega 1 por
    `reloadTime/faltando` (último no `reloadEnd`, bomba percorre o curso inteiro),
    com SFX por cartucho; cancelar mantém o parcial.
- Testes: `test/reload-feel.test.js` (4, browser 3265) — cancel de arma normal
  (mag 5→4), escopeta parcial-no-meio/cheia-no-fim, cancel mantém o parcial;
  `weapon-mechanisms` (8/8) valida o sniper cancel + bind.

## Roadmap — próximos lotes (pesquisados, não implementados)

- **R6** — cores aplicadas ao corpo em 1ª pessoa (`fpbody.js`, clonar material
  por instância — armadilha r185).
- **R10/R11/R12** — morte do remoto com colapso; pitch vertical do remoto
  (netcode, clamp no servidor); corpo FP desacoplado do pitch da câmera.
- **R13/R14** — inimigos legíveis (heavy distinto, marcha, soco sincronizado);
  variedade + morte com peso dos esqueletos (RNG independente do worldgen).
- **R15** — higiene do corpo FP (dedos dt-safe, scratch sem alocação).

Invariantes respeitados em todos: ordem do rand seedado do worldgen,
`authority='clip'` da sniper, contrato de ADS do `weaponrig`, retrocompatibilidade
de netcode por campo opcional.
