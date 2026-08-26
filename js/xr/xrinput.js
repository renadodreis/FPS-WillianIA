/* ================================================================
   ENTRADA DOS CONTROLES DE VR — módulo PURO (sem DOM, sem three).

   Recebe `session.inputSources` por parâmetro e devolve INTENÇÃO:
   quanto andar, quantos passos girar, o que está pressionado. Quem
   traduz intenção em jogo é o game.js — e ele faz isso escrevendo nas
   MESMAS teclas que o teclado escreveria, para que colisão, rampa,
   veículo e tudo o mais continuem sendo o código já testado. Controle
   novo não pode significar física nova.

   DUAS DECISÕES DE CONFORTO, que aqui são contrato e não gosto:

   1. GIRO EM PASSOS (snap turn), 45° por inclinada. Girar o mundo de
      forma suave debaixo de quem está fisicamente parado é a causa mais
      conhecida de enjoo em VR — o olho vê rotação que o ouvido interno
      não sente. Em passos, o cérebro trata como corte de câmera. E é UM
      passo por inclinada: segurar pro lado não gira em rajada; o
      analógico precisa voltar ao centro pra liberar o próximo.

   2. ZONA MORTA. O analógico do Touch descansa em ±0,1 sozinho. Sem
      zona morta o jogador anda sem querer, e andar sem querer em VR é
      enjoo na veia. A zona morta é DESCONTADA (não cortada): logo
      depois dela o passo é pequeno e cresce liso, sem salto de 0 pra 1.

   MAPA DE EIXOS DO TOUCH: o gamepad expõe 4 eixos e os que valem são os
   índices 2 e 3. O par 0/1 é do touchpad, que o Touch não tem — ler 0/1
   dá analógico morto no aparelho, e isso não se descobre sem um Quest na
   mão. Eixo 3 negativo é "pra frente".

   BOTÕES (perfil xr-standard do Touch): 0 gatilho, 1 empunhadura,
   3 clique do analógico, 4 e 5 os botões A/B (direita) e X/Y (esquerda).
   ================================================================ */

export const DEADZONE = 0.18;      // acima do repouso típico (~0,1) com folga
export const SNAP_RAD = Math.PI / 4;   // 45°: o passo padrão de conforto
const SNAP_ON = 0.7;               // inclinada que dispara o passo
const SNAP_OFF = 0.35;             // e o quanto precisa voltar pra rearmar

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* zona morta DESCONTADA e normalizada: 0 no limiar, 1 no batente */
function semZonaMorta(v) {
  const a = Math.abs(v);
  if (a <= DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

function eixos(fonte) {
  const g = fonte && fonte.gamepad;
  const a = g && Array.isArray(g.axes) ? g.axes : (g && g.axes ? Array.from(g.axes) : null);
  if (!a || a.length < 4) return { x: 0, y: 0 };
  return { x: num(a[2]), y: num(a[3]) };
}

function botao(fonte, i) {
  const g = fonte && fonte.gamepad;
  const b = g && g.buttons && g.buttons[i];
  return !!(b && b.pressed);
}

export function criarEntradaXR() {
  let girarArmado = true;   // rearma quando o analógico volta pro centro

  function ler(fontes) {
    const out = {
      andar: { x: 0, y: 0 },
      girar: 0,
      atirar: false, mirar: false, pular: false, agachar: false, recarregar: false, usar: false,
    };
    const lista = Array.isArray(fontes) ? fontes : [];
    let esquerda = null, direita = null;
    for (const f of lista) {
      if (!f) continue;
      if (f.handedness === 'left') esquerda = f;
      else if (f.handedness === 'right') direita = f;
      // qualquer outra mão ('none', ausente) é ignorada: não dá pra saber
      // se anda ou se gira, e chutar seria mover o jogador sem ele pedir
    }

    if (esquerda) {
      const e = eixos(esquerda);
      const x = semZonaMorta(e.x);
      const y = -semZonaMorta(e.y);   // eixo 3 negativo = frente
      const m = Math.hypot(x, y);
      // diagonal não pode andar mais rápido que reto
      const k = m > 1 ? 1 / m : 1;
      /* `+ 0` normaliza o zero NEGATIVO que `Math.sign` propaga: -0 e 0 são
         iguais em `===` mas diferentes em `Object.is`, e comparação estrita
         de teste (e qualquer `Object.is` no caminho) enxerga a diferença. */
      out.andar.x = x * k + 0;
      out.andar.y = y * k + 0;
      out.agachar = botao(esquerda, 1);
      out.usar = botao(esquerda, 4);
      out.recarregar = botao(esquerda, 5);
    }

    if (direita) {
      const d = eixos(direita);
      const lado = num(d.x);
      if (girarArmado && Math.abs(lado) >= SNAP_ON) {
        out.girar = lado > 0 ? -1 : 1;   // empurrou pra direita = gira pra direita (yaw negativo)
        girarArmado = false;
      } else if (Math.abs(lado) <= SNAP_OFF) {
        girarArmado = true;
      }
      out.atirar = botao(direita, 0);
      out.mirar = botao(direita, 1);
      out.pular = botao(direita, 4);
    } else {
      girarArmado = true;   // controle sumiu: não deixa o giro travado armado errado
    }

    return out;
  }

  return { ler, get girarArmado() { return girarArmado; } };
}
