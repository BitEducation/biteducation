# redes/enquadramento

- Dados 41 7E 42 7D 43. 7E → 7D 5E (7E XOR 20); 7D → 7D 5D. Corpo: 41 7D 5E 42 7D 5D 43
  (7 bytes, 2 a mais). Quadro: 7E 41 7D 5E 42 7D 5D 43 7E.
- Bits (exemplo do CN 3.1.2): 011011111111111111110010 → 011011111 0 11111 0 11111 0 10010 =
  011011111011111011111010010 (27 bits, 3 zeros).
- Receptor remove os escapes e os zeros: volta aos originais.
- Contagem de bytes: um contador corrompido desalinha o receptor, e 2 quadros saem errados até ele ressincronizar (teste dourado).
- Quiz s4: dez 1s seguidos ganham um 0 depois de cada cinco: 10 + 2 = 12 bits.

Para o dono conferir:

- [x] CN 3.1.2 (contagem de caracteres, flags com enchimento de bytes e de bits, figura do enchimento de bits); RFC 1662 seção 4.2.
