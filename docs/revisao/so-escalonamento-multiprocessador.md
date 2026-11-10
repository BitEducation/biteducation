# Revisão: so/escalonamento-multiprocessador

Padrão: quantum 2, migrar custa 2 ticks. A, B, C (6 ticks cada) nascem no N0; D (2) no N1.
Trabalho total 20 ticks; ideal com 2 núcleos: tick 10.

## Fila única (ordem inicial A, B, C, D)

| Núcleo | Linha do tempo |
| --- | --- |
| N0 | A 0–2, C 2–4, A 4–6, C 6–8, B~ 8–10, B 10–12 |
| N1 | B 0–2, D 2–4, B 4–6, A~ 6–8, A 8–10, C~ 10–12, C 12–14 |

Migrações: A (N0→N1), B (N1→N0), C (N0→N1) = 3. Termina no tick 14. Parado: 2 × 14 − 20 − 6 = 2.

## Fila por núcleo, sem mover

N0 faz A, B, C em round robin: 18 ticks. N1 faz D (0–2) e fica parado 16 ticks. Termina no 18.

## Com roubo

| Núcleo | Linha do tempo |
| --- | --- |
| N0 | A 0–2, B 2–4, C 4–6, B 6–8, C 8–12 |
| N1 | D 0–2, A~ 2–4 (roubada do fim da fila), A 4–8, B~ 8–10, B 10–12 |

2 migrações, termina no tick 12, parado 2 × 12 − 20 − 4 = 0.

## Sem custo de migrar

Fila única com custo 0: tick 10, o ideal.

## Para o dono conferir

- [x] As linhas do tempo acima batem com o diagrama de Gantt.
- [x] A descrição do balanceamento do Linux (domínios de escalonamento) está correta.
- [x] Quantum 6 no Lab: textos sem migração fazem sentido.
