# Revisão: so/conteineres

Padrão: troca de modo = 150 ns; banco tenta usar 300 MiB com limite de 256 MiB.

- Monolítico: 1 chamada = 2 trocas → 2 × 150 = 300 ns.
- Micronúcleo: 4 mensagens (app→arquivos, arquivos→driver, driver→arquivos, arquivos→app) × 2 trocas = 8 → 8 × 150 = 1.200 ns.
- PIDs: nginx 4012 → 1 no web; worker 4013 → 2 no web; postgres 4120 → 1 no banco.
- 300 > 256 → processo do banco encerrado; web não é afetado. 256 exatamente não encerra.

## Para o dono conferir

- [x] MINIX 3, seL4 e QNX como exemplos de micronúcleo.
- [x] Windows e macOS descritos como híbridos.
