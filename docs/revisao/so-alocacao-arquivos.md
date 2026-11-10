# Revisão: so/alocacao-arquivos

Disco de 24 blocos; livres: 2–3, 7–9, 14–17, 20, 22–23 → 12 livres, buracos de 2, 3, 4, 1, 2. Padrão: F com 5 blocos, ler o bloco 4.

- Contígua: maior buraco 4 < 5 → não cabe (fragmentação externa). Com 3 blocos: primeiro buraco que serve é 7–9; com 4: 14–17.
- Encadeada: primeiros 5 livres = 2, 3, 7, 8, 9. Bloco 4 → 4 + 1 = 5 leituras.
- FAT: mesma cadeia, 4 consultas na RAM + 1 leitura.
- Indexada: índice no bloco 2, dados 3, 7, 8, 9, 14; 2 leituras.
- Extensões da cadeia 2, 3, 7, 8, 9: (2, 2) e (7, 3) → 2 extensões.

## Para o dono conferir

- [x] As contas de leituras de cada método estão certas.
- [x] Citar ext4, NTFS e APFS como sistemas com extensões está correto.
