# arq/consistencia

Teste "store buffering": núcleo 0 faz x = 1; r1 = y. Núcleo 1 faz y = 1; r2 = x. x = y = 0.

- Sequencial: 4 operações, cada núcleo em ordem → C(4,2) = 6 ordens. As duas escritas antes das
  duas leituras: 2 × 2 = 4 ordens → (1,1). Núcleo 0 inteiro antes do 1 → (0,1); o contrário →
  (1,0). (0,0): 0 (quiz).
- TSO: cada núcleo tem s (entra no buffer), l (leitura) e d (chega à memória), com s antes de l e
  de d; l e d em qualquer ordem → 2 sequências por núcleo. Intercalações de duas sequências de 3:
  C(6,3) = 20. Total 2 × 2 × 20 = 80.
- (0,0) com TSO: r1 = 0 exige l0 antes de d1, r2 = 0 exige l1 antes de d0. Cadeias
  s0 < l0 < d1 e s1 < l1 < d0: 20 intercalações, menos as que põem d0 antes de s0 (cadeia do
  núcleo 1 inteira antes: 1) e d1 antes de s1 (1) → 18. 18 ÷ 80 = 22,5% → 23%.
- Com barreira: s < d < l em cada núcleo, 20 intercalações; (0,0) exigiria
  l1 < d0 < l0 < d1 < l1, um ciclo → 0.
- Quiz s3 (escolha): com buffer, as leituras passam antes de as escritas chegarem à memória; (0,0) em 18 de 80 ordens.

Para o dono conferir:

- [x] SCO 8.3.2 (semântica da memória).
- [x] RVWMO no manual RISC-V, volume I.
