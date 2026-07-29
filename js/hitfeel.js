/* ================================================================
   GAME FEEL DE COMBATE — camada de tela (DOM + FX poolado).
   O QUE decidir mora em js/hitfeel-core.js; aqui só se DESENHA.

   Regra da rodada: `index.html` e `style.css` são de outro agente, então
   todo DOM e todo CSS novo nascem daqui, por JS, num <style> próprio.
   Nada é criado por frame nem por tiro: um <style>, um contador de dano
   recebido e classes ligadas/desligadas. As partículas saem do pool do
   js/fx.js — nenhuma geometria nova, nenhum consumo de Math.random
   seedado (o worldgen depende dessa ordem).
   ================================================================ */
import { hitmarkerDuration } from './hitfeel-core.js';

const CSS = `
/* --- sabores do hitmarker: branco = acerto, âmbar = cabeça, vermelho = kill --- */
#hitmarker.head .l { background:#ffd23f; height:2.5px; width:12px; }
#hitmarker.kill .l { height:2.5px; width:13px; }
#hitmarker.kill::after {
  content:''; position:absolute; left:-11px; top:-11px; width:22px; height:22px;
  border:1.5px solid rgba(255,59,48,.85); border-radius:50%;
  animation: hfKillRing .26s ease-out forwards;
}
@keyframes hfKillRing { from { transform:scale(.35); opacity:1 } to { transform:scale(1.5); opacity:0 } }

/* --- quanto EU tomei: acumula a rajada numa contagem só, no lugar de
       oito números soltos poluindo a tela --- */
#hfTook {
  position:fixed; left:50%; top:50%; z-index:12; pointer-events:none;
  transform:translate(-50%, 58px); font-weight:800; font-size:21px;
  letter-spacing:.5px; text-shadow:0 2px 6px rgba(0,0,0,.95); opacity:0;
  transition:opacity .28s linear, transform .28s ease-out; white-space:nowrap;
}
#hfTook.show { opacity:1; transform:translate(-50%, 50px); }
#hfTook .hp { color:#ff5b4e; }
#hfTook .ar { color:#6fbcff; font-size:15px; margin-left:6px; opacity:.95; }
/* "o próximo tiro igual me mata": o número vira aviso, sem mais um flash na cara */
#hfTook.danger .hp { color:#fff; font-size:27px; -webkit-text-stroke:1px #ff2d20;
  animation: hfDanger .5s ease-out 2; }
@keyframes hfDanger { 0%,100% { opacity:1 } 50% { opacity:.35 } }

/* --- escudo quebrando: a barra estilhaça em vez de sumir caladinha --- */
#armorFill.hfBreak { animation: hfShieldBreak .42s ease-out forwards; }
@keyframes hfShieldBreak {
  0%   { filter:brightness(3); box-shadow:0 0 22px rgba(150,210,255,.95) }
  100% { filter:brightness(1); box-shadow:0 0 8px rgba(90,170,255,.6) }
}
`;

export function createHitFeel(deps) {
  const { ui, SFX, FX, camera, doc = typeof document === 'undefined' ? null : document } = deps;
  if (!doc) return null;

  const style = doc.createElement('style');
  style.id = 'hitfeelCss';
  style.textContent = CSS;
  doc.head.appendChild(style);

  /* ---------------- hitmarker com sabor ---------------- */
  const marker = ui.hitmarker;
  let markerTimer = null;
  function hitmarker(flavor) {
    if (!marker) return;
    marker.classList.remove('head', 'kill');
    if (flavor === 'head' || flavor === 'kill') marker.classList.add(flavor);
    // reinicia a animação do anel de kill mesmo em kills seguidas
    marker.classList.remove('show');
    void marker.offsetWidth;
    marker.classList.add('show');
    clearTimeout(markerTimer);
    markerTimer = setTimeout(() => marker.classList.remove('show'), hitmarkerDuration(flavor));
  }

  /* ---------------- quanto eu tomei ---------------- */
  const took = doc.createElement('div');
  took.id = 'hfTook';
  took.innerHTML = '<span class="hp"></span><span class="ar"></span>';
  doc.body.appendChild(took);
  const tookHp = took.querySelector('.hp'), tookAr = took.querySelector('.ar');
  // janela em que golpes seguidos somam no MESMO número: cobre uma rajada de
  // fuzil inteira, mas separa dois tiroteios distintos
  const BURST_MS = 650;
  let accHp = 0, accAr = 0, accAt = 0, tookTimer = null;

  function tookHit(dmg, absorbed, lethal) {
    const now = Date.now();
    if (now - accAt > BURST_MS) { accHp = 0; accAr = 0; }
    accAt = now;
    accHp += dmg;
    accAr += absorbed;
    tookHp.textContent = '-' + Math.max(1, Math.round(accHp));
    tookAr.textContent = accAr >= 0.5 ? '-' + Math.round(accAr) : '';
    took.classList.toggle('danger', !!lethal);
    took.classList.remove('show');
    void took.offsetWidth;
    took.classList.add('show');
    clearTimeout(tookTimer);
    tookTimer = setTimeout(() => took.classList.remove('show'), lethal ? 1500 : 1000);
  }

  /* ---------------- escudo quebrando ---------------- */
  /* scratch fixo: nada é alocado no momento do dano */
  const _shard = { x: 0, y: 0, z: 0 }, _at = { x: 0, y: 0, z: 0 };
  let breakTimer = null;
  function armorBreak() {
    if (ui.armorFill) {
      ui.armorFill.classList.remove('hfBreak');
      void ui.armorFill.offsetWidth;
      ui.armorFill.classList.add('hfBreak');
      clearTimeout(breakTimer);
      breakTimer = setTimeout(() => ui.armorFill.classList.remove('hfBreak'), 460);
    }
    // estalo seco + clique metálico: composto de sons que já existem
    // (js/sfx.js é de outro agente nesta rodada — só chamamos)
    if (SFX) { SFX.pop(); SFX.empty(); }
    // estilhaços azuis à frente do rosto, no pool do FX (zero alocação e
    // zero geometria nova — o worldgen seedado não pode ser tocado)
    if (FX && camera) {
      const e = camera.matrixWorld.elements;
      _at.x = e[12] - e[8] * 1.15;
      _at.y = e[13] - e[9] * 1.15;
      _at.z = e[14] - e[10] * 1.15;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047;
        _shard.x = Math.cos(a) * 2.4;
        _shard.y = 0.8 + (i % 3) * 0.7;
        _shard.z = Math.sin(a) * 2.4;
        FX.spawnParticle(_at, _shard, i % 2 ? 0x8fd0ff : 0x4da3ff, 0.07, 0.4, 11, true);
      }
    }
  }

  return { hitmarker, tookHit, armorBreak };
}
