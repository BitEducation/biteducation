# Revisão: so/threads

Valores padrão: 3 pedidos; cada um usa a CPU 2 ticks, espera 6 de E/S e usa a CPU mais 2. Um núcleo.

## Uma thread (e threads de usuário)

| Pedido | CPU | E/S | CPU | Termina |
| --- | --- | --- | --- | --- |
| r1 | 0–2 | 2–8 | 8–10 | 10 |
| r2 | 10–12 | 12–18 | 18–20 | 20 |
| r3 | 20–22 | 22–28 | 28–30 | 30 |

CPU ocupada 3 × 4 = 12 ticks; parada 30 − 12 = 18. Com threads de usuário, a leitura bloqueante
para o processo inteiro, então a linha do tempo é a mesma.

## Uma thread do kernel por pedido

- r1 0–2 (E/S até 8), r2 2–4 (até 10), r3 4–6 (até 12).
- CPU parada de 6 a 8.
- r1 8–10, r2 10–12, r3 12–14. Último termina no tick 14; CPU parada 14 − 12 = 2.

## Sem E/S

3 × (2 + 2) = 12 ticks nos dois modelos: sem espera, não há o que sobrepor.

## Para o dono conferir

- [x] A tabela de compartilhado × por thread está correta (código, globais, arquivos; PC, registradores, pilha).
- [x] O passo das threads de usuário deixa claro que é a syscall bloqueante que trava todas.
- [x] No Lab, E/S 0 deixa os três modelos iguais.
