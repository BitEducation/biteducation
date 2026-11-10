# redes/bgp-hijack

Relações: AS100 é cliente do AS300 e par do AS200; AS200 é provedor do AS250, que é provedor do AS400; o AS300 é
provedor do AS400 e do AS666. Preferência local: cliente 200, par 150, provedor 100.

Anúncio de 203.0.113.0/24 pelo AS400:

- AS300 recebe [400] (cliente) e repassa a todos: AS100 recebe [300 400] (do provedor, LP 100).
- AS250 recebe [400] (cliente), repassa [250 400]; AS200 recebe de cliente e repassa ao par AS100: [200 250 400]
  (LP 150).
- Regras de exportação: o AS100 não repassa rotas de provedor nem de par para outro provedor ou par.

Escolha do AS100: com política, LP 150 > 100 → [200 250 400], apesar de 3 saltos. Sem política, LP igual →
AS_PATH mais curto [300 400]. Quiz do passo 3: 200 250 400 (padrão).

Laços: o AS400 recebe [300 400] e [250 400] de volta e o AS250 recebe [200 250 400]; os três contêm o próprio AS e
são descartados (3).

Sequestro (simulado): AS666 anuncia 203.0.113.0/25 e 203.0.113.128/25. O AS300 recebe de cliente e repassa ao
AS100 como [300 666]. Para 203.0.113.10, o /25 é mais longo que o /24: o pacote vai para o AS666.

Defesa: ROA 203.0.113.0/24, máximo /24, AS400. Os /25 do AS666 são inválidos (origem e tamanho). Com validação no
AS300, eles não chegam ao AS100, que volta a [200 250 400]. Sem validação, continua [300 666].

O teste confere os estados da validação de origem (válido, inválido, desconhecido) como na RFC 6811.

Para o dono conferir:

- [x] CN 5.7.7; RFC 4271 (seleção) e RFC 6811;
- [x] se a lição deve citar ASPA e BGPsec como passos seguintes.
