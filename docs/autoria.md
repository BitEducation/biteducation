# Guia de autoria

Regras de escrita das lições. O `npm run check` (via `scripts/check-content.ts`)
verifica o que está marcado com ✔.

## Estrutura de toda lição

1. **Introdução:** o problema que o conceito resolve, na vida real (até ~90 palavras).
2. **Passos** (4 a 8), cada um com **uma ideia só**:
   - título com até 5 palavras ✔, no estilo "O quantum acaba";
   - subtítulo com até 8 palavras;
   - texto de 25 a 110 palavras ✔, seguindo **o que acontece → por que → consequência**;
   - 2 a 4 fatos; id no formato `s<n>-texto` e único ✔.
3. **Quiz:** pelo menos um por lição, no passo de maior surpresa, com explicação ✔ e resposta
   entre as opções ✔.
4. **Fechamento:** resumo em 2 frases, fatos calculados da simulação e "próximas lições".
5. **Para aprofundar:** referências (`refs`) ✔; `verified: true` só depois de conferir no exemplar.
6. **Simplificações:** lista explícita do que foi omitido.

O número de passos do `catalog.ts` precisa bater com o da lição ✔.

## Estilo

- Português do Brasil, frases diretas, voz ativa e segunda pessoa ocasional ("repare que…").
- Termo técnico na primeira vez com `[[id-do-termo]]` ou `[[id|texto]]` ✔ (o id precisa existir
  no `glossary.ts` do site), e o termo em inglês entre parênteses quando for o usado na prática.
- Números com unidade. Todo número que depende da simulação vem de interpolação, nunca digitado.
- Nada de "simplesmente", "obviamente" ou "é fácil" ✔ (lista em `scripts/banned-phrases.txt`).
- No máximo uma analogia por lição, marcada como analogia.
- Glossário: definição de até 280 caracteres ✔.

## Cenários e personagens

| Site | Cenário | Personagens |
|---|---|---|
| redes | campus universitário e a biblioteca online | Lia (estudante), servidor da biblioteca, Malu (atacante) |
| so | o notebook da Lia: editor, compilador, player, planilha | processos com nomes genéricos de aplicativos |
| arq | um processador RISC-V didático e programas curtos | — |

Endereços só das faixas de documentação (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) ou
privadas (10.0.0.0/8), domínios `.example`, MACs localmente administrados (`02:…`).

## Lições de ataque (site de redes)

- São simulações para entender o mecanismo, **detectar** e **defender**: um passo com a tag
  `signals` e outro com a tag `defense` são obrigatórios ✔.
- Nada de comandos, nomes de ferramentas de ataque, parâmetros ou passo a passo utilizável
  fora da lição.
- Sempre citar a defesa padrão (DAI, SYN cookies, BCP 38…) e a RFC correspondente.

## Ciclo de vida

```
draft   → aparece só em npm run dev, com o selo "rascunho"
review  → dev, artefato do PR e produção com SHOW_REVIEW=1
published → produção, sitemap e busca
```

Comece com `npm run new -- <site> <slug> "Título"`. Para revisar, siga `docs/revisao/README.md`.
