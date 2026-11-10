# redes/switch-vlan

S1 com A, B, C nas portas 1–3; S2 com D, E, F nas portas 1–3; tronco entre as portas 4. Contamos todos os
cabos que o quadro percorre, o do remetente incluído. Com hubs, todo quadro passa pelos 7 cabos.

- A → D, tabelas vazias: A–S1, S1–B, S1–C, S1–S2, S2–D, S2–E, S2–F = 7. S1 aprende A@1, S2 aprende A@4.
- D → A: S2 aprende D@1 e conhece A@4; S1 conhece A@1. D–S2, S2–S1, S1–A = 3.
- B → A = 2, A → B = 2, E → D = 2, D → E = 2, A → D = 3 (tronco). Quiz do passo 2 (B → A): 2.
- Total dos 7 quadros: 7 + 3 + 2 + 2 + 2 + 2 + 3 = 21. Hubs: 7 × 7 = 49.
- Broadcast de C sem VLANs: 7 cabos, 5 computadores recebem.
- VLANs 112122 (A, B, D na 10; C, E, F na 20): broadcast de C → C–S1, S1–S2 (etiqueta 20), S2–E, S2–F = 4.
- 802.1Q: 4 bytes, VID de 12 bits → 4096 − 2 = 4094 VLANs (0 e 4095 reservados).
- A (10) → C (20) com tabelas já aprendidas: A–S1, S1–R (etiqueta 10), R–S1 (etiqueta 20), S1–C = 4.
  O quadro direto A → C inunda só a VLAN 10 (B, tronco, R, D) e nunca chega a C.

Laboratório:

- 111111: todos na 10, o passo 6 explica que não há o que rotear.
- 111112 com F: broadcast só no cabo de F e no tronco (2), não chega a ninguém; A → F pelo roteador = 5.
- Entrada inválida volta ao padrão.

Para o dono conferir:

- [x] Tanenbaum CN 4.7.2, 4.7.4 e 4.7.5.
