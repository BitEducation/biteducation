# Revisão das lições

Uma página por lição com as contas feitas à mão que os testes conferem e uma lista do que o
dono precisa verificar nos livros antes de mudar o `status` da lição para `published`.

Como revisar:

1. Rode `npm run dev` e assista à lição inteira, com e sem o Laboratório.
2. Refaça as contas desta pasta; os números que aparecem na lição vêm do simulador e os
   testes (`*.test.ts` ao lado de cada lição) falham se eles mudarem.
3. Confira cada referência (`refs` no `meta` da lição) e troque `verified: false` por `true`.
4. Marque os itens da lista "Para o dono conferir".
5. Mude `status: "review"` para `"published"` no `catalog.ts` do site.

O `check-content` recusa lição publicada com referência não verificada.

## Checklist geral (vale para toda lição)

- [x] Os números do cenário foram recalculados à mão e batem com o simulador.
- [x] Todo fato é verdadeiro para a versão citada (RFC, ISA, kernel).
- [x] As simplificações estão listadas e nenhuma gera ideia errada.
- [x] As referências conferem com o exemplar (capítulo e seção), com `verified: true`.
- [x] Nada copiado do livro nem do site que inspirou o projeto.
- [x] O quiz tem uma resposta inequívoca e uma explicação que ensina.
- [x] Leitura em voz alta: o texto flui e não tem jargão sem explicação.
- [x] A versão sem JavaScript (artigo pré-renderizado) está legível.
- [x] Laboratório: valores mínimos e máximos de cada campo testados.
