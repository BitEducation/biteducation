# Revisão: redes/rsa

Contas feitas à mão para os valores padrão (primos 5 × 11, mensagem 9).

## Chaves

- n = 5 × 11 = 55; φ = 4 × 10 = 40.
- e = 3 (mdc(3, 40) = 1).
- d: 3 × d ≡ 1 (mod 40) → d = 27, porque 3 × 27 = 81 = 2 × 40 + 1.

## Cifrar e decifrar

- c = 9³ mod 55 = 729 mod 55 = 729 − 13 × 55 = 14.
- 14²⁷ mod 55 = 9 (por partes: 14² = 196 ≡ 31; 14⁴ ≡ 31² = 961 ≡ 26; 14⁸ ≡ 26² = 676 ≡ 16;
  14¹⁶ ≡ 16² = 256 ≡ 36; 27 = 16 + 8 + 2 + 1 → 36 × 16 × 31 × 14 mod 55 = 9).

## Assinatura

- Hash de brinquedo = soma dos códigos das letras mod n.
  "PAGAR 10": 80 + 65 + 71 + 65 + 82 + 32 + 49 + 48 = 492; 492 mod 55 = 52.
  "PAGAR 90": troca 49 por 57 → 500; 500 mod 55 = 5.
- Assinatura = 52²⁷ mod 55 = 13. Conferência: 13³ = 2197; 2197 − 39 × 55 = 52 ✓.

## Fatorar

- 55 ÷ 2, ÷ 3, ÷ 4, ÷ 5 → 4 divisões até achar o fator 5.

## Para o dono conferir

- [x] As contas acima batem com o teste dourado (`rsa.test.ts`).
- [x] A analogia do cadeado e o aviso sobre padding e SHA-256 estão claros.
- [x] Os quatro pares do Lab (5 × 11, 7 × 13, 11 × 17, 17 × 19) decifram e conferem.
