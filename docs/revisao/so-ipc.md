# Revisão: so/ipc

Valores padrão: 8 blocos de 4 KiB, buffer de 4 blocos, o grep lê a cada 3 ticks.
Em cada tick o ls escreve antes de o grep ler.

## Pipe

| Tick | ls | grep | Buffer |
|---|---|---|---|
| 1 | escreve b1 | | 1 |
| 2 | escreve b2 | | 2 |
| 3 | escreve b3 | lê b1 | 2 |
| 4 | escreve b4 | | 3 |
| 5 | escreve b5 | | 4 |
| 6 | **bloqueia** (cheio) | lê b2 | 3 |
| 7 | escreve b6 | | 4 |
| 8 | bloqueia | | 4 |
| 9 | bloqueia | lê b3 | 3 |
| 10 | escreve b7 | | 4 |
| 11 | bloqueia | | 4 |
| 12 | bloqueia | lê b4 | 3 |
| 13 | escreve b8 e fecha | | 4 |
| 15, 18, 21, 24 | | lê b5, b6, b7, b8 | 3, 2, 1, 0 |
| 27 | | read() = 0: fim | 0 |

- Primeiro bloqueio em t6; ls bloqueado em 6, 8, 9, 11 e 12: 5 ticks.
- Cópias: 8 × 4 KiB = 32 KiB, duas vezes (write e read) = 64 KiB.
- Fim em (8 + 1) × 3 = 27: o leitor é o gargalo.

## Fila de mensagens

log (1), pedido (5), alarme (9) → recebidas por prioridade: alarme, pedido, log.

## Para o dono conferir

- [x] A tabela acima bate com a animação e o contador de cópias.
- [x] Com capacidade 6 e leitura a cada 2 ticks no Lab, o ls não bloqueia e o texto diz isso.
