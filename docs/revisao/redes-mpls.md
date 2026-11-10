# Revisão: redes/mpls

- Cabeçalho: 20 + 3 + 1 + 8 = 32 bits. Rótulos possíveis: 2²⁰ = 1.048.576.
- LSP pelo caminho longo: PE1 empilha 100; P1 100 → 200; P2 200 → 300; PE2 retira.
- Carga (capacidade 1.000 Mb/s), web 600 + vídeo 500 (padrão):
  - só IP: tudo no curto PE1–P3–PE2 = 1.100 > 1.000 → estoura;
  - com rótulos: curto 600, longo 500.
- Vídeo 400: só IP = 1.000, não estoura.

## Para o dono conferir

- [x] Os 16 primeiros rótulos reservados e o "penúltimo salto retira" (PHP) citados corretamente.
