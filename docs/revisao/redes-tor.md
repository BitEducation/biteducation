# redes/tor

Latências de ida: Lia→Guarda 20, Guarda→Meio 30, Meio→Saída 25, Saída→Site 15; direto 35.

- Montagem: 2 × 20 = 40; 2 × 50 = 100; 2 × 75 = 150 → total 290 ms.
- Ida e volta pelo circuito: 2 × (20 + 30 + 25 + 15) = 180 ms; direto 70 ms.
- Camadas: 3 ao sair de Lia; cada relé tira uma.
- Conhecimento: Guarda (Lia → Meio), Meio (Guarda → Saída), Saída (Meio → Site).
- Quiz s2: 2 × 20 + 2 × (20 + 30) + 2 × (20 + 30 + 25) = 40 + 100 + 150 = 290 ms.
- Laboratório, meio a 130 ms: 40 + 300 + 350 = 690 ms; ida e volta 2 × (20 + 130 + 25 + 15) = 380 ms.

Para o dono conferir:

- [x] CN 8.13.1 (anonimato, roteamento cebola); célula de 512 bytes na especificação do Tor.
