# arq/coerencia-mesi

3 CPUs, uma linha com x, memória começa em 0.

Sem protocolo: CPU 1 e CPU 2 leem 0; CPU 1 escreve 1 só na cache (write-back); CPU 2 lê 0 da própria cache. Valor velho.

MESI, sequência 1R, 1W(1), 2R, 3R, 2W(2), 1R, 3W(3):

| Operação | CPU 1 | CPU 2 | CPU 3 | Memória | Barramento |
| --- | --- | --- | --- | --- | --- |
| 1 lê | E 0 | I | I | 0 | BusRd |
| 1 escreve 1 | M 1 | I | I | 0 | nenhuma (E → M) |
| 2 lê | S 1 | S 1 | I | 1 | BusRd + flush da CPU 1 |
| 3 lê | S 1 | S 1 | S 1 | 1 | BusRd |
| 2 escreve 2 | I | M 2 | I | 1 | BusUpgr, invalida 2 cópias (quiz: 2) |
| 1 lê | S 2 | S 2 | I | 2 | BusRd + flush da CPU 2 |
| 3 escreve 3 | I | I | M 3 | 2 | BusRdX, invalida 2 |

Transações: 6 (só a escrita em E fica fora). Escritas na memória: 2 (os dois flushes).

Compartilhamento falso, 10 escritas alternadas, a e b a 8 bytes (mesma linha de 64): cada escrita é BusRdX → 10.
Em linhas separadas: uma falta por CPU, depois acertos em M → 2. Distância ≥ 64 → linhas separadas.

Para o dono conferir:

- [x] Tanenbaum SCO 8.3.3 (caches de escuta e o protocolo MESI).
