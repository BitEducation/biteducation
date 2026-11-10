# Revisão: redes/multicast

Árvore: S–R1; R1–R2, R1–R3; R2–H1, R2–H2; R3–H3, R3–R4; R4–H4, R4–H5.
Caminhos: H1, H2 = 3 links; H3 = 3; H4, H5 = 4. Ordem de entrada: H1, H4, H2, H5, H3.

- Padrão (4 membros: H1, H4, H2, H5): unicast = 3 + 4 + 3 + 4 = 14; cópias saindo da fonte = 4; banda S–R1 = 4 × 5 = 20 Mb/s.
- Multicast: links S–R1, R1–R2, R2–H1, R2–H2, R1–R3, R3–R4, R4–H4, R4–H5 = 8.
- Poda: H4 e H5 saem → ficam S–R1, R1–R2, R2–H1, R2–H2 = 4.
- 5 membros: unicast 17, multicast 9.

## Para o dono conferir

- [x] 224.0.0.0/4 como faixa multicast e 224.0.0.5 do OSPF.
