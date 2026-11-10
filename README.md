<p align="center"><img src="public/brand/biteducation-horizontal.webp" alt="BitEducation" width="480" /></p>

# BitEducation

Três sites interativos para ver o computador funcionando por dentro, passo a passo, com
simulações de verdade e referência aos livros clássicos:

| Site | Caminho | Lições | Assunto |
|---|---|---|---|
| BitEdu Redes | `/redes/` | 51 | do encapsulamento ao Wi-Fi e ao celular: TCP/IP, roteamento, DNS, TLS, criptografia e ataques simulados com detecção e defesa |
| BitEdu SO | `/so/` | 35 | processos e threads, escalonamento, concorrência, memória virtual, arquivos, SSD e segurança |
| BitEdu Arquitetura | `/arq/` | 26 | bits e texto, lógica digital, RISC-V, pipeline, caches, interrupções e paralelismo |

O conteúdo segue os livros de Tanenbaum e de Maziero e as disciplinas ST568 (Redes de
Comunicação I) e TT304 (Sistemas Operacionais) da FT-Unicamp.

Cada lição é uma cena animada dividida em passos, com explicação, fatos, inspetor de bytes e
bits, quiz e um Laboratório para mudar os parâmetros e rodar a simulação de novo. Tudo roda
no navegador, sem servidor, sem cookies e sem rastreamento. O progresso fica no
`localStorage` e pode ser exportado.

Inspirado pelo Protocol Explorer.

## Rodando localmente

Requer Node 24 (veja `.nvmrc`).

```bash
npm ci                          # dependências (scripts de instalação ficam bloqueados pelo .npmrc)
npx playwright install chromium # uma vez, para os testes de ponta a ponta
npm run dev                     # desenvolvimento, mostra também rascunhos e lições em revisão
```

| Comando | O que faz |
|---|---|
| `npm run check` | Biome, TypeScript, regras de camada, conteúdo, traduções e testes unitários |
| `npm run build` | build de produção em `dist/` (só lições `published`) + pré-render + verificação |
| `npm run build:review` | o mesmo build incluindo as lições em revisão |
| `npm run serve` | serve `dist/` como o GitHub Pages (com `404.html`) em http://127.0.0.1:4173 |
| `npm run preview` | `build` + `serve` |
| `npm run e2e` | testes de ponta a ponta no Chromium (usa o `dist/` atual) |
| `npm run check:all` | tudo acima + `npm audit`: é o que o CI roda |
| `npm run fix` | formata e corrige o que o Biome souber corrigir |
| `npm run new -- so slug "Título"` | cria uma lição nova em rascunho a partir do modelo |
| `npm run strings` | sincroniza `src/locales/en/ui.json` com as chaves de `src/ui/strings.ts` |

Para abrir a pré-visualização de um PR, baixe o artefato `preview-dist` do CI, extraia em
`dist/` e rode `npm run serve`.

Variáveis do build: `BASE_URL` (padrão `/`), `SITE_ORIGIN` (padrão `http://localhost:4173`,
usada em canonical, Open Graph e sitemap) e `VITE_SHOW_REVIEW=1`.

## Estrutura

```text
src/contracts/   tipos compartilhados (lição, cena, trace, frames)
src/sim/         simuladores puros e testados: net/, os/, arch/, shared/
src/core/        estado, player, progresso, busca, i18n, visibilidade (sem DOM pesado)
src/scene/       renderização SVG da cena
src/ui/          páginas, painéis, controles, estilos
src/sites/       um diretório por site: catalog.ts, glossary.ts, lessons/
scripts/         pré-render, verificações de conteúdo, camadas e dist/, gerador de lições
tests/e2e/       Playwright + axe
docs/            decisões, guia de autoria e revisão das lições
```

As dependências entre camadas são verificadas por `scripts/check-imports.ts`. O código de
produção não tem dependências de runtime.

## Publicação

O deploy é feito pelo workflow `Deploy` no GitHub Pages de um repositório `biteducation.github.io`.
Passos únicos para o dono:

1. Criar a organização e o repositório `biteducation.github.io`.
2. Em **Settings → Pages**, escolher a fonte **GitHub Actions**.
3. Opcional: em **Settings → Variables**, criar `SHOW_REVIEW = 1` para publicar também as
   lições em revisão enquanto elas não forem promovidas a `published`.
4. Opcional, só se entrarem outros contribuidores: preencher `.github/CODEOWNERS` e proteger a branch `main` (D10 em `docs/decisoes.md`).

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md), [docs/autoria.md](docs/autoria.md) e
[docs/revisao/](docs/revisao/).

## Licenças

- Código: [MIT](LICENSE).
- Conteúdo das lições (textos, glossários, cenários): [CC BY-SA 4.0](LICENSE-CONTENT).
- Fontes IBM Plex: SIL Open Font License (`public/fonts/OFL.txt`).
- Logo e símbolo do BitEducation (`public/brand/`): marca do projeto, fora das licenças acima; o uso fora do projeto depende de autorização do dono.
