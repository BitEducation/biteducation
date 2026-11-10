# redes/arp-spoofing

Lição de ataque: tem passo de sinais (tag `signals`) e de defesa (tag `defense`), como exige o
`check-content`. Só simulação: nenhum comando ou ferramenta de ataque aparece no texto.

- Gateway 10.20.0.1 em 02:00:00:20:00:01; Malu 10.20.0.66 em 02:00:00:20:00:66.
- Resposta forjada: "10.20.0.1 está em 02:00:00:20:00:66", sem pedido anterior.
- O cache da Lia passa a ter dois IPs com o mesmo MAC.
- O IDS gera 2 alertas: resposta não solicitada e troca de MAC para o mesmo IP.
- Com DAI, o ARP da Malu não confere com o vínculo do DHCP snooping e é descartado; o cache
  da Lia fica certo.

Para o dono conferir:

- [x] RFC 826 e RFC 5227 citadas corretamente;
- [x] a descrição de DHCP snooping e DAI é genérica (não depende de fabricante).
