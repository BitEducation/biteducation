# so/inversao-prioridade

L (prioridade 1) chega em 0: 1 tick, seção crítica de 4, 1 tick. H (3) chega em 2: 1 tick, seção de 2, 1 tick.
M (2) chega em 3: 8 ticks, sem trava. Prioridades iguais não se preemptam.

Sem protocolo: 0 L, 1 L* (pega a trava), 2 H, 3 H pede a trava → bloqueia. M roda 3–10. L* 11–13 solta no fim do 13.
H obtém no tick 14: espera 14 − 3 = 11 (= 8 de M + 3 do resto de L; quiz: 11). H* 14–15, H 16 → termina em 17.
Resposta de H: 17 − 2 = 15.

Espera ocupada: H gira a partir do tick 3; L (1) nunca roda, M (2) também não. H não termina.

Herança: em 3 H bloqueia, L herda 3. L* 3–5, solta; H obtém em 6: espera 3. H* 6–7, H 8 → termina em 9. Resposta 7.
M roda 9–16, L 17.

Teto (imediato, teto 3): L pega a trava em 1 e sobe a 3. H chega em 2 com 3: empate, L continua.
L* 1–4, volta a 1. H 5, pede em 6 e obtém em 6 (espera 0), H* 6–7, H 8 → termina em 9. Resposta 7.

Em geral: sem protocolo espera = duração de M + seção − 1; com herança = seção − 1 (teste cobre 9 combinações).

Para o dono conferir:

- [x] Maziero 7.1 e Tanenbaum MOS 2.3.4.
