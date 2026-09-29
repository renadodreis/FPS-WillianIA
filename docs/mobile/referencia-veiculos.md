# Veículo como cobertura, com vida — o que PUBG, Warzone, Fortnite e Apex fazem

Pesquisa feita antes de mexer em veículo, a partir da decisão do dono
(2026-09-28): *"carro pode segurar tiro, mas não... pra sempre!!"*.

**O ponto de partida.** Veículo não era cobertura para ninguém: o
`rayBlockedAt` do cliente (game.js) só conhecia terreno, paredes e troncos, a
vítima (`youWereHit`, br-game.js) aceitava dano através do carro, e os bots
também não o viam — medido pelo orquestrador: 15 de 48 humanos atrás de veículo
parado levaram tiro de bot. O foguete (js/rockets.js) atravessava o carro,
porque colide por `Structures.segBlocked`, que também não o conhece.

**Formato.** Afirmação → FONTE (URL) → CITAÇÃO LITERAL. No fim, o que **não**
foi encontrado e a decisão para este jogo, com cada item marcado:

- **[LASTRO]** — a fonte diz isso (e está citada acima);
- **[INFERÊNCIA]** — conta minha, adaptação ou número deste jogo.

---

## 1. Vida por tipo de veículo

**PUBG (PC).** FONTE: <https://pubg.wiki.gg/wiki/Vehicles> (tabela de dados):
> "Buggy" — "~ 1540"; "UAZ (Open Top)" e "UAZ (Closed Top)" — "~ 1820";
> "Dacia 1300" — "~ 1820"; "Motorcycle" — "~ 1025"; "PG-117" — "~ 1520".

Em tiros: PUBG Mobile, FONTE: <https://gurugamer.com/mobile-games/pubg-mobile-bgmi-vehicle-comparison-17840>
(resumo do buscador, não citação literal — a página não foi lida inteira):
Dacia com 45 tiros de M416, UAZ com 49, Buggy com 30.

**Fortnite.** FONTE: <https://fortnite.fandom.com/wiki/Cars> (wikitext pela API
do wiki), tabela "Hitpoints":
> Islander Prevalent `800` · Victory Motors Whiplash `800` · OG Bear `1,000` ·
> Titano Mudflap `1,200` · Armored Battle Bus `2,250` · Octane `450` ·
> Nitro Fang `1,500`

FONTE: <https://fortnite.fandom.com/wiki/Choppa>:
> "It has 1500 health and no weaponry"

**Warzone.** FONTE: <https://www.pcgamesn.com/call-of-duty-warzone/vehicles-best>:
> "All vehicles have a health meter - when it runs out, your vehicle will
> explode spectacularly, killing any passengers and bystanders in the vicinity."

Proteção por tipo, mesma fonte:
> Cargo Truck: "provides excellent protection from enemy fire" · Tactical
> Rover: "provides only minimal protection" · ATV: "doesn't offer much in the
> way of protection"

**Apex Legends (Trident).** FONTE: <https://apexlegends.fandom.com/wiki/Trident>
(wikitext pela API):
> "The Trident can only be destroyed by having it falls off the map [...]
> When it is destroyed, it will eject all players on it to safety."

## 2. Dano de bala e de explosivo no veículo

**PUBG — zonas.** FONTE: <https://pubg.wiki.gg/wiki/Vehicles>:
> "Most vehicles now have multiple damage zones which apply different damage
> multipliers" — Engine 100 %, Body 75 %, Roof 50 %.

**PUBG — explosivo.** FONTE: <https://www.pcgamesn.com/playerunknowns-battlegrounds/pubg-update-73-patch-notes>:
> "Vehicles can still explode instantly if taking large radial damage, like
> from Red Zones, C4 etc."

Panzerfaust: FONTE: <https://en.namu.wiki/w/판처파우스트(PUBG: BATTLEGROUNDS)> —
a página recusou a leitura (403); o que segue é o **resumo do buscador**, não
citação literal: veículos fracos (scooter, moto, buggy) são destruídos num
acerto direto, e os demais perdem mais de 80 % da vida; o BRDM, cerca de 70 %.

**Warzone — C4.** FONTE: <https://mein-mmo.de/en/destroying-vehicles-in-cod-warzone-best-weapons-and-tactics,500864/>
(em alemão, no original):
> "C4 – 1 Treffer" (SUV) · "C4 – 2 Pakete" (caminhão)

**Fortnite — dano diferenciado por arma.** FONTE: <https://fortnite.fandom.com/wiki/Cars>:
> "some snipers deal heavily increased damage to cars, such as the Heavy
> Impact Sniper."

## 3. O que acontece com a vida em zero

**PUBG (desde 7.3): motor morto, fogo, 5 s, explosão.** FONTE:
<https://www.pcgamesn.com/playerunknowns-battlegrounds/pubg-update-73-patch-notes>
e <https://pubg.wiki.gg/wiki/Vehicles>:
> "Vehicles no longer explode instantly upon reaching 0 HP. Instead, engines
> are now disabled and set on fire, causing the vehicle to explode after 5
> seconds."

**PUBG Mobile — quem está dentro e em volta.** FONTE:
<https://pubgmobile.helpshift.com/hc/en/3-pubg-mobile/faq/63-what-happens-if-a-vehicle-explodes/>:
> "When a vehicle loses all it's HP, it will explode. At the same time, all
> people inside and around the vehicle can get killed."

**Fortnite — estado de morte e remoção.** FONTE: <https://fortnite.fandom.com/wiki/Vehicles>:
> "Vehicles have their own health bar. When said health bar is emptied, the
> vehicle will enter a "death-state" and be removed as a result."
> "Some of the Fortnite vehicles aren't instantly defeated once they reach
> 0HP, instead they stay operative for a few additional seconds in order to
> allow the crew to get out in time."

FONTE: <https://fortnite.fandom.com/wiki/Cars>:
> "Cars have varying pools of health, and will explode into a flaming chassis
> on destruction, which causes fire to spread."

Helicóptero, FONTE: <https://fortnite.fandom.com/wiki/Choppa>:
> "When the Choppa is shot down to 0 HP or runs out of fuel, the Choppa falls
> towards the ground, sounds a siren and explodes, ejecting players inside.
> The pilot can still move in any horizontal direction when the Choppa is
> falling."

**Carcaça que ainda cobre (PUBG).** FONTE secundária (guia, não wiki nem nota
de patch): <https://critfeed.com/pubg-vehicles/>:
> "A ruined vehicle still blocks bullets — use the wreck."

## 4. Quem está dentro, pneus e bala que atravessa

**Ocupante exposto.** PUBG, FONTE <https://pubg.wiki.gg/wiki/UAZ>:
> "Despite the extra armor, persons inside may still be shot at if a bullet
> manages to go between the baffles on the windows."

Fortnite, FONTE <https://fortnite.fandom.com/wiki/Vehicles>:
> "Glass panels are also common on many vehicles. They are weak spots that can
> be destroyed to expose the passengers to direct damage"

Choppa, FONTE <https://fortnite.fandom.com/wiki/Choppa>:
> "the driver can be shot through the glass as the front of the vehicle."

Apex, FONTE <https://apexlegends.fandom.com/wiki/Trident>:
> "If the Trident gets hit, 20% of the damage is transferred to all players
> inside the vehicle. Enemies can still hit players directly for full damage."

**Bala contra a lataria.** PUBG, FONTE <https://pubg.wiki.gg/wiki/UAZ>:
> "The cloth top stops all bullets and covers more area than the hard top."

**Explosivo e cobertura.** PUBG, FONTE <https://pubg.wiki.gg/wiki/Vehicles>:
> "Vehicles now block players from receiving grenade damage with a similar
> mechanism used for other objects." "Although, depending on grenade position
> and trajectory, damage can still be dealt to players hiding behind vehicles."

**Pneus.** PUBG, FONTE <https://pubg.wiki.gg/wiki/Vehicles>:
> "All drivable vehicles have poppable tires."

Fortnite, FONTE <https://fortnite.fandom.com/wiki/Vehicles>:
> "cars and motorbikes feature physical tires that have a separate health pool
> than the one of the actual body of the vehicle they are part of. For this
> reason they can be popped, which causes the vehicle to progressively get
> worse and worse handling as more tires are blown off."

## 5. O que NÃO foi encontrado

- Número publicado do **raio e do dano** da explosão de veículo em qualquer um
  dos quatro jogos. As fontes dizem só "serious player damage or death" (PUBG
  wiki), "killing any passengers and bystanders in the vicinity" (Warzone).
- Por quanto tempo a **carcaça** fica no mapa no PUBG, e se ela segura bala —
  a única fonte (critfeed) é um guia, não uma nota de patch ou wiki.
- A **vida** dos veículos do Warzone em números: as fontes falam em "health
  meter" e em quantos C4, nunca no número.
- A citação literal da Panzerfaust (namu.wiki recusou a leitura).
- Apex não tem veículo destrutível por dano (o Trident só se perde caindo do
  mapa) — serve só como contraexemplo.

## 6. Decisão para este jogo

| Assunto | Decisão | Marca |
|---|---|---|
| Veículo segura bala | Sim, enquanto tem vida: carro, caminhão e helicóptero, nos três caminhos do tiro, na vítima, no foguete, na granada (quica) e na visada de bots e da IA | [LASTRO] PUBG UAZ, PUBG granada; decisão do dono |
| Vida | Em tiros de fuzil (26): buggy 30 (780), esportivo 45 (1 170), caminhão 68 (1 760), helicóptero 84 (2 180) | [LASTRO] escala PUBG/Fortnite; [INFERÊNCIA] os números |
| Explosivo | Bazuca ×7,5 (975 no epicentro: buggy 1 foguete, esportivo/caminhão 2, heli 3); granada ×3 | [LASTRO] Panzerfaust/C4; [INFERÊNCIA] o multiplicador |
| Faca | Não fere veículo | [INFERÊNCIA] |
| Vida em zero | Para de proteger NA HORA; motor morto; 5 s em chamas; explode | [LASTRO] PUBG 7.3 (5 s); "não protege" é decisão do dono ("não pra sempre") |
| Depois da explosão | O veículo SOME (sem carcaça) | [LASTRO] Fortnite "be removed"; a carcaça que cobre do PUBG contraria "não pra sempre" |
| Quem está dentro na explosão | Morre, com a eliminação creditada a quem destruiu | [LASTRO] PUBG Mobile, Warzone; [INFERÊNCIA] o crédito |
| Quem está perto | Dano pela distância, raio 8 m, 120 → 10 | [LASTRO] qualitativo; [INFERÊNCIA] os números |
| Ocupante | Continua exposto onde o corpo sai da lataria (buggy, esportivo); no caminhão e no helicóptero fica dentro da caixa, e o tiro para no veículo | [LASTRO] PUBG/Fortnite/Apex expõem por janela; [INFERÊNCIA] a caixa |
| Helicóptero em zero | Perde a sustentação e desce, o piloto ainda manobra na horizontal, explode aos 5 s | [LASTRO] Choppa |
| Pneus | Fora desta entrega | — |
| Autoridade | Vida no SERVIDOR; o cliente reporta o acerto (`vehicleHit`/`vehicleBlast`) com alcance, cadência e orçamento compartilhados com o tiro em jogador | modelo do jogo |
