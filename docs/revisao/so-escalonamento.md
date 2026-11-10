# so/escalonamento

Processos (chegada, CPU, prioridade; 0 = mais alta): backup (0, 9, 3), editor (1, 2, 2),
compilador (2, 6, 1), player (4, 3, 0). Sem custo de troca; empates por ordem de chegada.
Espera = término − chegada − CPU. Resposta = primeira vez na CPU − chegada.

| Algoritmo | Linha do tempo | Esperas (b, e, c, p) | Média |
|---|---|---|---|
| FCFS | b 0–9, e 9–11, c 11–17, p 17–20 | 0, 8, 9, 13 | 7,5 |
| SJF | b 0–9, e 9–11, p 11–14, c 14–20 | 0, 8, 12, 7 | 6,75 |
| SRTF | b 0–1, e 1–3, c 3–4, p 4–7, c 7–12, b 12–20 | 11, 0, 4, 0 | 3,75 |
| Prioridade | b 0–1, e 1–2, c 2–4, p 4–7, c 7–11, e 11–12, b 12–20 | 11, 9, 3, 0 | 5,75 |
| RR (q = 2) | b 0–2, e 2–4, c 4–6, b 6–8, p 8–10, c 10–12, b 12–14, p 14–15, c 15–17, b 17–20 | 11, 1, 9, 8 | 7,25 |

SJF: no tick 0 só existe o backup, que roda inteiro (não preemptivo); depois editor (2),
player (3), compilador (6). SRTF no tick 3: compilador (6) contra player ainda não chegou e
backup (8 restantes), então roda o compilador até o player chegar no tick 4 (3 < 5).

Respostas no RR: 0, 1, 2, 4 → média 1,75. No SRTF: 0, 0, 1, 0 → 0,25. O último a terminar no
SRTF é o backup, no tick 20 (quiz do passo 3: 9 + 2 + 6 + 3 = 20 de trabalho, sem ociosidade).

Para o dono conferir:

- [x] MOS 2.4.2 e 2.4.3; Maziero 6.4;
- [x] a convenção de prioridade (0 = mais alta) está explícita na lição e no Laboratório.
