# Revisão: arq/barramentos

Padrão: memória responde em 2 ciclos, dados de 8 bytes, clock de 100 MHz (10 ns por ciclo).

## Leitura

1 ciclo de endereço + 2 da memória = 3 ciclos = 30 ns para 8 bytes.

## Linha de 64 bytes (8 palavras)

- Separadas: 8 × 3 = 24 ciclos = 240 ns → 64 / 240 ns = 266,7 MB/s.
- Rajada: 3 + 7 = 10 ciclos = 100 ns → 640 MB/s.
- Teto: 8 bytes × 100 MHz = 800 MB/s.

## Arbitragem (cada leitura ocupa 3 ciclos; pedidos: disco 4, rede 2, CPU 2)

- Cadeia: disco 0–12, rede 12–18, CPU 18–24. A CPU começa no ciclo 18.
- Rodízio: disco 0–3, rede 3–6, CPU 6–9, disco 9–12, rede 12–15, CPU 15–18, disco 18–24.
  A CPU começa no ciclo 6. Total 24 ciclos nos dois.

## Para o dono conferir

- [x] O passo 2 descreve bem um ciclo de leitura síncrono, sem copiar o diagrama do livro.
- [x] A explicação do PCIe (links seriais, comutador) está correta.
- [x] Latência 1 no Lab: a tabela de ciclos tem 2 linhas e o texto fica coerente.
