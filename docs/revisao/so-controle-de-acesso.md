# Revisão: so/controle-de-acesso

## Matriz

| Sujeito | notas.txt | prova.pdf | impressora |
| --- | --- | --- | --- |
| ana | rw | rw | w |
| bruno | r | – | w |
| carla | – | – | w |
| backup | r | r | – |

12 células, 8 com direito, 4 vazias.

- ACL de notas.txt (coluna): ana rw, bruno r, backup r.
- Capacidades de carla (linha): impressora w. De backup: notas.txt r, prova.pdf r.

## UNIX, modo padrão 640 (rw-r-----), dono ana, grupo prof

| Pedido | Classe | Bits | Resultado |
| --- | --- | --- | --- |
| ana escreve | dono | rw- | permitido |
| bruno lê | grupo | r-- | permitido |
| bruno escreve | grupo | r-- | negado |
| carla lê | outros | --- | negado |

2 de 4 permitidos.

## Dono com menos (044, ---r--r--)

- ana lê: classe dono, bits ---: negado. carla lê: outros, r--: permitido.

## Descritor

- 640: ana abre para leitura, aceito (fd 3). chmod 000. read(3) funciona; open() novo: dono ---, negado.

## Para o dono conferir

- [x] A regra "uma classe só" está clara no passo 4 e no 5.
- [x] A afirmação sobre descritores abertos sobreviverem ao chmod está correta (Linux e BSD).
- [x] No Lab, 777 e 000 dão textos coerentes.
