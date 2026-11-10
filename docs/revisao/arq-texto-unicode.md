# Revisão: arq/texto-unicode

Texto padrão "Olá €😀": O U+004F, l U+006C, á U+00E1, espaço U+0020, € U+20AC, 😀 U+1F600 → 6 pontos de código.

- UTF-8: 4F | 6C | C3 A1 | 20 | E2 82 AC | F0 9F 98 80 → 1 + 1 + 2 + 1 + 3 + 4 = 12 bytes.
- á: 0xE1 = 000 1110 0001 (11 bits) → 110 00011, 10 100001 → C3 A1.
- UTF-16: 1 unidade cada, exceto 😀 = D83D DE00 → 7 unidades (o length do JavaScript).
- Windows-1252: C3 → Ã, A1 → ¡; E2 82 AC → â ‚ ¬; F0 9F 98 80 → ð Ÿ ˜ € → "OlÃ¡ â‚¬ðŸ˜€".
- O teste confere os bytes contra o TextEncoder da plataforma.

## Para o dono conferir

- [x] E1 é "á" no Latin-1 e "А" (cirílico) no KOI8-R.
