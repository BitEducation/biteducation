# Revisão: redes/cifra-simetrica

O AES-128 e o GCM do simulador são conferidos no teste contra vetores oficiais:

- FIPS-197, apêndice B: chave 2b7e1516…, entrada 3243f6a8885a308d313198a2e0370734 → 3925841d02dc09fbdc118597196a0b32.
- FIPS-197, apêndice C.1: chave 00010203…0f, entrada 00112233…ff → 69c4e0d86a7b0430d8cdb78070b4c55a.
- GCM, casos de teste 1 e 2 (chave e IV zerados): etiqueta 58e2fcce…; cifrado 0388dace…, etiqueta ab6e47d4….

Números da lição (saídas do simulador):

- Avalanche: bit 0 → 59 bits mudam; bit 64 → 58; bit 127 → 64 (esperado ≈ 64).
- Imagem de 40 blocos (2 tipos): ECB → 2 cifrados distintos; CBC → 40.
- "pagar R$ 100,00.": no modo contador, XOR de 0x31 ⊕ 0x39 = 0x08 no byte do "1" vira "9" → "pagar R$ 900,00."; com GCM a etiqueta não confere.

## Para o dono conferir

- [x] O texto deixa claro que o AES da lição não deve proteger dados reais.
