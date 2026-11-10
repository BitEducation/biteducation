# Decisões

Registro curto das decisões do projeto. D1 a D12 vêm do plano original; as seguintes
registram desvios do plano e escolhas feitas durante a implementação. "Em aberto (dono)" quer
dizer que só o mantenedor pode fechar.

| # | Tema | Decisão | Estado |
|---|---|---|---|
| D1 | Stack | Vite + TypeScript sem framework; templates `html` com escape por padrão | adotada |
| D2 | Hospedagem | GitHub Pages da organização, repositório `biteducation.github.io`, um build multipágina | adotada |
| D3 | Marca e nomes | "BitEducation" para o projeto e o hub; "BitEdu" como abreviação de marca nos sites: BitEdu Redes, BitEdu SO e BitEdu Arquitetura (em inglês, BitEdu Networks, OS e Architecture). O nome não se traduz. Logos em `public/brand/`; o símbolo do livro de pixels foi redesenhado em SVG para favicon e cabeçalho | adotada |
| D4 | Cores | verde-petróleo (redes), terracota (SO), violeta (arquitetura) | adotada |
| D5 | Tipografia | IBM Plex Sans + Mono, servidas do próprio site (OFL) | adotada |
| D6 | ISA | RISC-V RV32I + M | adotada |
| D7 | URLs por idioma | só pt-BR pré-renderizado; o inglês troca a interface no navegador; `/en/` e `hreflang` ficam para quando houver lições traduzidas | adiada |
| D8 | Imagem Open Graph | `public/brand/og-image.jpg` (1024×572), feita da logo horizontal, em todas as páginas pré-renderizadas com `summary_large_image` | adotada |
| D9 | Métricas de uso | nenhuma | adotada |
| D10 | PR obrigatório em `main` | não: o dono é o único contribuidor; `main` sem proteção e CODEOWNERS comentado | adotada |
| D11 | Pré-visualização de PR | artefato `preview-dist` do CI, aberto com `npm run serve` | adotada |
| D12 | Edições dos livros | CN 6. ed. (2021), SCO 6. ed. (2013), MOS 4. ed. (2016), Maziero (UFPR, 2019); as lições seguem também as ementas de ST568 e TT304 (FT/Unicamp), listadas em `src/ui/books.ts` | adotada |

## Desvios e escolhas de implementação

- **D13. Camadas.** `ui` pode importar `scene` (a lição monta a cena). O hub pode importar os
  três `catalog.ts`, porque lista as lições. Regras em `scripts/check-imports.ts`.
- **D14. Produção mostra só `published`.** Lições em `review` aparecem em `npm run dev`, no
  artefato do PR e em produção apenas com a variável `SHOW_REVIEW=1` do repositório. Enquanto
  nada for publicado, cada site mostra um aviso no lugar da lista.
- **D15. TCP com 5 segmentos.** O rascunho da lição falava em 3, mas a retransmissão rápida
  precisa de 3 ACKs duplicados, ou seja, de 3 segmentos depois do perdido.
- **D16. Texto dos passos com 25 a 110 palavras.** O plano pedia 40 no mínimo; passos de
  transição curtos (por exemplo, "ACKs duplicados") ficam melhores com menos. O máximo continua 110.
- **D17. Biome não formata Markdown.** Evita reescrever os documentos de revisão.
- **D18. Modo rápido nos testes.** `window.__PD_FAST__` (definido só pelos testes E2E) zera as
  durações das animações. Não há outro caminho para ligá-lo.
- **D19. Cast nos testes de acessibilidade.** `@axe-core/playwright` traz uma versão do
  `playwright-core` diferente da do `@playwright/test`; a chamada usa `page as never`. Remover
  quando as versões coincidirem.
- **D20. Servidor dos testes.** `scripts/serve-dist.ts` imita o GitHub Pages (`404.html` com
  status 404, `pasta/` → `index.html`), coisa que o `vite preview` não faz.
- **D21. Dependabot em vez de Renovate.** Já vem no GitHub, sem app extra; agrupa as
  atualizações e espera 7 dias (`cooldown`) antes de propor uma versão nova.
- **D22. Service worker sem `skipWaiting` automático.** A versão nova só assume quando a pessoa
  clica em "Recarregar"; `?passo=` e `?lab=` nunca viram entradas separadas no cache.
- **D23. `.pcap`.** Com quadros Ethernet completos, só eles entram (linktype 1); senão, pacotes
  IP puros (linktype 101). Bytes que a lição não mostra viram zero, com aviso.
- **D24. Sem `frame-ancestors`.** O GitHub Pages não permite cabeçalhos próprios e a CSP em
  `<meta>` não aceita essa diretiva. Embutir o site continua possível (professores usam AVAs);
  dentro de um iframe aparece um link para abrir o site original.
- **D25. Destaque automático.** Passos sem `highlight` explícito destacam o que os eventos do
  passo tocaram (`src/core/focus.ts`); widgets ganham um contorno tracejado. O autor só escreve
  `highlight` quando quer destacar outra coisa.
- **D26. Pré-requisitos curados à mão.** `prerequisites` no catálogo alimenta "Ajuda ter visto
  antes" na visão geral; `check-content` recusa ids inexistentes, autorreferência e ciclos.
  Não bloqueia nada: é sugestão de ordem, não trava.
- **D27. Duas previsões por lição, no mínimo.** Uma só deixava lições longas sem nenhum momento
  de prever. As perguntas novas são conceituais ou usam valores da simulação, para continuarem
  certas com qualquer parâmetro do Laboratório. No fim, o resumo mostra o placar e leva de volta
  ao passo de cada previsão errada.
- **D28. Vários diagramas de Gantt numa cena.** Eventos `gantt` podem dizer a qual widget
  pertencem (`gantt: "<id>"`); sem isso, vão para todo Gantt que tenha a raia.
- **D29. Cores de tópico em escalas OKLCH.** Cada site tem uma escala de 11 tons
  (`--redes-50` a `--redes-950`, idem `so` e `arq`) com o mesmo matiz. O tom 300 é o destaque
  do tema escuro e o 700 o do claro; os tons claros e escuros servem de fundo suave e de texto
  sobre o destaque. `.tone-<site>` aplica a cor de um site a qualquer elemento (hub, trilhas).
  `tokens.test.ts` lê `oklch()` e confere os contrastes.
- **D30. Busca sem botão no topo.** O topo fica com marca, tema, idioma e ajuda; a busca abre com
  `/` ou Ctrl+K, e a página 404 mantém um botão de busca no corpo.
- **D31. Vista Sequência.** Toda lição com mensagens entre dois ou mais nós ganha a alternância
  Rede (Diagrama, fora de redes) / Sequência, gerada do mesmo trace (`src/ui/sequence.ts`). A
  escolha fica salva e vai na URL (`?vista=sequencia`) para que um link compartilhado abra a
  mesma vista.
- **D32. Equipamentos desenhados.** Nós de equipamento (notebook, servidor, roteador, switch,
  nuvem, DNS, firewall, atacante, dispositivo) são desenhos isométricos sem caixa, sobre uma
  grade isométrica; peças internas (CPU, memória, kernel, cache…) mantêm a caixa, porque as
  cenas de SO e arquitetura são densas. Os desenhos saem de caixas 3D projetadas em
  `src/scene/pictograms.ts`, todos com a mesma luz.
- **D33. Trecho real no hub.** O hub mostra os três primeiros passos da lição de TCP na vista
  Sequência, carregados sob demanda, com os números da própria simulação e botão de pausa; com
  movimento reduzido, aparece parado e completo.
