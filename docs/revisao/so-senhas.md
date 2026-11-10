# Revisão: so/senhas

Usuários: ana (sol2024), bia (123456), caio (123456), duda (lagarto-azul-mesa-9). Lista comum: 123456, senha, qwerty, sol2024, admin.

- SHA-1("123456") começa com 7c4a8d09 (valor público conhecido). bia e caio têm o mesmo hash.
- Sem sal, a lista pronta acha ana, bia, caio → 3 de 4.
- Com sal (4 bytes sorteados com semente fixa): lista pronta acha 0; refazendo por usuário, 5 × 4 = 20 cálculos, acha as mesmas 3.
- Tempo para 10⁷ palpites × 4 usuários a 10⁹/s: 4 × 10⁷ ÷ 10⁹ = 0,04 s.
  - Custo 14 (16.384×): 655 s ≈ 11 min. Custo 20 (1.048.576×): 41.943 s ≈ 12 h. Custo 24: ≈ 7,8 dias.

## Para o dono conferir

- [x] A ordem de grandeza de 10⁹ hashes rápidos por segundo numa GPU é razoável.
- [x] Lição sem comandos nem ferramentas; tem passo de sinais e de defesa.
