# redes/sdn

Pacotes: Lia 443, Lia 443, Malu 23, Lia 443, Malu 23, Malu 443.

- 1: falta → packet-in → regra (Lia, 443) → porta 3. 2: casa (2 pacotes).
- 3: falta → regra (Malu, 23) → descartar. 4: casa regra de Lia (3). 5: casa descarte (2).
- 6: falta → regra (Malu, 443) → porta 3.
- Ao controlador: 3 de 6; regras: 3.
- Tabela pequena (2 regras, LRU) com os fluxos Lia, Malu, Caio, Caio: cada fluxo novo expulsa uma regra que volta a ser pedida; 6 faltas no total (quiz s4). Com 3 regras, 3 faltas.

Para o dono conferir:

- [x] CN 5.6 (redes definidas por software, OpenFlow).
