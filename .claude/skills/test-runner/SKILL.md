---
name: test-runner
description: Rodar a suíte do FPS e classificar cada falha como FLAKE ou REGRESSÃO REAL antes de declarar verde ou apontar bug. Use ao rodar testes, investigar uma falha ou validar uma mudança.
---

# Rodar testes do FPS + triagem de flake

Regras completas em `CLAUDE.md`. Esta skill é o procedimento operacional.

## Comandos

- Suíte completa: `npm test` (já sequencial, ~10 min). Prefira rodar em background.
- Um arquivo: `node --test test/<arquivo>.test.js`.
- Vários à mão: `node --test --test-concurrency=1 test/a.test.js test/b.test.js`
  (SEM o `--test-concurrency=1` as portas fixas 3164–3196 colidem).
- Não matar a porta 3000 (servidor ao vivo do dev).

## Ler o resultado

Rodapé do `node --test`: `# tests`, `# pass`, `# fail`. Se `# fail` = 0 → verde.
Se > 0 → NÃO conclua nada ainda: cada arquivo que falhou passa pela triagem.

## Triagem: flake vs regressão real (obrigatória antes de apontar bug)

Testes de browser (puppeteer + Chrome) têm portas fixas e boot que pode estourar
60 s sob carga → falham por flake, não por bug. Para cada ARQUIVO que falhou:

1. Re-rode SÓ ele, isolado: `node --test test/<arquivo>.test.js`.
2. Repita até 3×.
3. **Passou em qualquer re-run isolado → FLAKE** (não é bug; foi carga/porta).
4. **Falhou nas 3 vezes isolado → REGRESSÃO REAL.**

Só o que sobrar como REAL vira candidato a bug. Nunca reporte flake como regressão.

## Reportar

`# pass`/`# fail` do full run, lista de REGRESSÕES REAIS (arquivo + trecho do erro)
e lista de FLAKES descartados. Diagnóstico de causa, classificação de severidade e
correção NÃO são desta skill — são do operador/modelo forte.
