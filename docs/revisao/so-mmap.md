# Revisão: so/mmap

Padrão: arquivo de 4 páginas de 4 KiB (16 KiB), A lê 3 páginas, MAP_SHARED.

- Faltas maiores: páginas 0, 1, 2 → 3 leituras de disco, 3 × 4 = 12 KiB lidos.
- Releitura da página 0 por A: acerto, sem falta.
- B lê a página 0: falta menor (já está no quadro 0). Total de faltas: 3 + 1 = 4.
- Escrita de A na página 0: MAP_SHARED → quadro 0 sujo, B vê; quadros no fim = 3.
  MAP_PRIVATE → cópia no quadro 3; quadros no fim = 4; B não vê.
- read() das mesmas 3 páginas copia 3 × 4 = 12 KiB da cache para o buffer.
- Quiz do passo 6: 2 × 3 = 6 páginas → 24 KiB.

## Para o dono conferir

- [x] A distinção entre falta maior e menor está correta.
- [x] A afirmação de que read() costuma ganhar em leituras pequenas e sequenciais é razoável.
