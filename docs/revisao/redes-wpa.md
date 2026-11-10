# redes/wpa

Padrão: senha de 8 caracteres, só minúsculas (26 símbolos). Velocidades supostas: 10⁶ palpites/s offline (WPA2),
10 trocas/s online (SAE).

- Combinações: 26⁸ = 208.827.064.576 ≈ 2,1 × 10¹¹.
- Tempo médio offline: metade do espaço / 10⁶ = 104.413,5 s = 1,2 dias (104.413,5 / 86.400 = 1,208).
- Tempo médio SAE: 104.413,5 × 10⁵ s = 1,044 × 10¹⁰ s / 31.536.000 = 331 anos.
- Extremos: 20 caracteres do teclado (95): 95²⁰ ≈ 3,6 × 10³⁹; offline 5,7 × 10²⁵ anos. 12 alfanuméricos: 62¹² ≈ 3,2 × 10²¹;
  offline 5,1 × 10⁷ anos. 9 minúsculas: 31 dias offline, 8.608 anos no SAE.
- CCMP (quiz do passo 4): 1500 + 8 (cabeçalho com número de pacote) + 8 (MIC) = 1516 bytes.
- Chaves (CCMP-128): PMK 256 bits; PTK 384 = KCK 128 + KEK 128 + TK 128; GTK 128.

Enquadramento: lição defensiva. Fala do teste offline de senhas só como conta de tempo, sem ferramentas ou passos.

Para o dono conferir:

- [x] Tanenbaum CN 8.10.3 (segurança 802.11: handshake, CCMP, WPA3/SAE).
