# Revisão: so/tempo-real

T1 = (C 2, P 5), T2 = (C 4, P 7); padrão. U = 2/5 + 4/7 = 0,4 + 0,571 = 0,971 (97,1%).
Limite de Liu e Layland para n = 2: 2(√2 − 1) = 0,828 (82,8%).

## RMS (T1 sempre primeiro)

0–2 T1; 2–5 T2 (3 de 4); 5–7 T1; tick 7: T2 deve 1 → perde o prazo. Uma perda no ciclo de 35.

## EDF

0–2 T1; 2: T2 (prazo 7) é a única; 5: T1 novo (prazo 10) vs T2 (prazo 7) → T2 até 6; 6–8 T1 (prazo 10). Nenhuma perda.

## Variantes

- C2 = 1, 2, 3 (U = 54,3%, 68,6%, 82,9%): nenhuma perda nas duas.
- C2 = 5 (U = 111,4%): as duas perdem prazos; a EDF derruba também T1 (tick 15).

## Para o dono conferir

- [x] A afirmação sobre SCHED_DEADLINE (baseada em EDF) está correta.
- [x] O limite assintótico de ~69% (ln 2) está citado corretamente.
