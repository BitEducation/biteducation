# Contribuindo

Obrigado pelo interesse. Correções de conteúdo (um número errado, uma frase confusa, uma
referência imprecisa) são as contribuições mais valiosas: abra uma issue citando a lição, o
passo (o link copiado pelo botão "Copiar link deste passo" serve) e, se possível, o livro ou a
RFC que mostra o certo.

## Antes de abrir um PR

1. `npm ci` e `npm run check` precisam passar.
2. Mudou interface? Rode também `npm run check:all` (inclui os testes de ponta a ponta).
3. Um assunto por PR, com commits pequenos no estilo Conventional Commits
   (`fix(redes): corrige o TTL na chegada`, `feat(so): lição de substituição de páginas`).

## Lição nova

1. `npm run new -- <redes|so|arq> <slug> "Título"` cria o esqueleto em `draft`.
2. Siga [docs/autoria.md](docs/autoria.md): estrutura, estilo e personagens.
3. Escreva o teste dourado com as contas feitas à mão e registre as contas em
   `docs/revisao/<site>-<slug>.md`.
4. Lições de ataque (site de redes) são simulações para entender, detectar e defender: nada de
   comandos, ferramentas ou receitas utilizáveis fora da lição.

Lições só passam a `published` depois da revisão técnica do mantenedor.

## Dependências

O código que vai para o navegador não tem dependências. Ferramentas de desenvolvimento novas
precisam de justificativa no PR (o que fazem que as atuais não fazem, tamanho, manutenção).

## Licença das contribuições

Ao contribuir você concorda que o código entra sob a licença MIT e o conteúdo didático sob a
CC BY-SA 4.0 (veja `LICENSE` e `LICENSE-CONTENT`). Não copie trechos de livros nem de outros
sites: escreva com as suas palavras e cite a fonte em `refs`.

Veja também o [código de conduta](CODE_OF_CONDUCT.md) e a [política de segurança](SECURITY.md).
