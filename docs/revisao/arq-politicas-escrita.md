# arq/politicas-escrita

Cache direta, 4 linhas × 4 palavras. Bloco = palavra / 4, linha = bloco mod 4.
x = palavra 12 → bloco 3, linha 3. a[i] = palavra 64 + i → bloco 16 + ⌊i/4⌋ → linha ⌊i/4⌋ mod 4.

Laço de 16 voltas (lê a[i], lê x, escreve x):

- a[0], a[4], a[8]: faltas nas linhas 0, 1, 2 (3 faltas). x: falta na volta 0.
- Voltas 12–15: a[i] vai para a linha 3 e expulsa x; lê x falta e expulsa o bloco de a. 2 faltas por volta → 8.
- Total: 3 + 1 + 8 = 12 faltas → 48 palavras lidas nas duas políticas.
- Escrita direta: 16 escritas de 1 palavra = 16.
- Retroativa: x sujo desde a volta 0; despejado sujo nas voltas 12, 13, 14 e 15 (4) + gravação final (1) = 5 blocos × 4 = 20.
- Com 12 voltas: 4 faltas; direta 12 palavras, retroativa 1 bloco = 4.

Zerar 16 palavras (só escritas, todas faltas): com alocação, 4 blocos lidos = 16 palavras (quiz) + 16 gravadas; sem, 16 escritas.

Buffer, rajada de 8 escritas, memória aceita 1 a cada 10 ciclos:

- Sem buffer: cada escrita espera 9 ciclos → 72.
- 4 entradas: escritas 1–4 em 0–3; parada 4–9 (6); escrita 5 em 10, parada 11–19 (9); 6 em 20, parada 21–29 (9); 7 em 30,
  parada 31–39 (9); 8 em 40. Total 33.
- 8 entradas: 0.

Para o dono conferir:

- [x] Tanenbaum SCO 4.5.1 (escrita direta, escrita retroativa, alocação de escrita).
