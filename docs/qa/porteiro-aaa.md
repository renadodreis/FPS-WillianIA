# Porteiro AAA — critério de entrega

Existe porque "está triplo A" não pode ser opinião. Aqui cada item é
verificável por comando ou por imagem, e o porteiro **reprova por item
objetivo**, não por gosto.

O que "AAA" significa neste projeto (do briefing do dono): **AAA não é
quantidade de polígono, é AUSÊNCIA DE DEFEITO**. Um jogo que abre, joga e não
quebra vale mais que um bonito que engasga.

## Regra do porteiro

- **Reprova** se qualquer item BLOQUEANTE falhar.
- Não aceita afirmação sem evidência: cada verde precisa de comando com saída,
  número medido ou imagem que ele mesmo olhou.
- "Deve estar funcionando" não é resultado. Não mediu, está reprovado.

## Bloqueantes — jogar

| # | Item | Como verificar |
|---|---|---|
| J1 | O jogo abre e chega a jogo pelo menu, sem console de erro | `node scripts/capture-menu.js` + `critic-play.js`; a linha "sem erros de página" tem que aparecer |
| J2 | Controles funcionam E são configuráveis | remapear uma tecla, ela passa a valer, sobrevive a recarregar |
| J3 | Nenhum painel de UI cortado em 1366x768, 1920x1080 e 2560x1080 | capturas nas três resoluções |
| J4 | Andar, mirar, atirar, recarregar, trocar de arma, entrar em veículo | `critic-play.js` cobre; olhar as imagens |
| J5 | Veículo apoiado no chão — no menu E em jogo | `test/car-menu-rodas.test.js` + imagem |
| J6 | Suíte completa verde | `npm test` — falha só vale como flake com 2 passes isolados consecutivos |
| J7 | `npm run lint` limpo | saída vazia |

## Bloqueantes — carregamento

| # | Item | Alvo |
|---|---|---|
| C1 | Boot até o primeiro frame, desktop | medido, e menor que o baseline de 2,38 s |
| C2 | O jogador vê progresso honesto enquanto carrega | imagem do menu durante o carregamento |
| C3 | Nada de tela morta sem sinal por mais de 2 s | imagem |

## Bloqueantes — invariantes do repo (CLAUDE.md)

| # | Item | Como verificar |
|---|---|---|
| I1 | Ordem de consumo do `Math.random` seedado intacta — o mundo não mudou | comparar worldgen antes/depois com o mesmo seed |
| I2 | Destruição da cidade continua funcionando (é mecânica, não bug) | `test/city-destruction-*.test.js` |
| I3 | Anti-cheat do servidor intacto | `test/security-regression.test.js` |
| I4 | Versão desktop não regrediu | suíte completa + capturas |

## Não-bloqueantes (registrar, não reprovar)

- Draw calls e triângulos acima do orçamento de VR — é a Fase 2 do porte, não
  desta entrega.
- Ausência da nave no modo solo — é recurso não existente, não defeito, e está
  pendente de decisão do dono.

## Formato do veredito

Uma tabela item a item com **APROVADO / REPROVADO / NÃO VERIFICADO**, a
evidência de cada um, e no fim uma frase só: entrega aprovada ou não. Item que
o porteiro não conseguiu verificar conta como NÃO VERIFICADO — nunca como
aprovado.
