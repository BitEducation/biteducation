<p align="center"><img src="public/brand/biteducation-horizontal.webp" alt="BitEducation" width="480" /></p>

# BitEducation

Three interactive sites that show how a computer works on the inside, step by step, driven by
real simulations and tied to the classic textbooks:

| Site | Path | Lessons | Topics |
|---|---|---|---|
| BitEdu Redes (networks) | `/redes/` | 51 | from encapsulation to Wi-Fi and cellular: TCP/IP, routing, DNS, TLS, cryptography, and simulated attacks with detection and defense |
| BitEdu SO (operating systems) | `/so/` | 35 | processes and threads, scheduling, concurrency, virtual memory, file systems, SSDs, and security |
| BitEdu Arquitetura (architecture) | `/arq/` | 26 | bits and text, digital logic, RISC-V, pipelining, caches, interrupts, and parallelism |

The content follows the Tanenbaum and Maziero textbooks and the courses ST568 (Communication
Networks I) and TT304 (Operating Systems) at FT-Unicamp. Lessons are written in Brazilian
Portuguese; the interface is also available in English.

Each lesson is an animated scene split into steps, with an explanation, key facts, a byte and
bit inspector, a quiz, and a Lab where you change the parameters and run the simulation again.
Everything runs in the browser: no server, no cookies, no tracking. Progress is kept in
`localStorage` and can be exported.

Inspired by Protocol Explorer.

## Running locally

Requires Node 24 (see `.nvmrc`).

```bash
npm ci                          # dependencies (install scripts are blocked by .npmrc)
npx playwright install chromium # once, for the end-to-end tests
npm run dev                     # development server; also shows drafts and lessons in review
```

| Command | What it does |
|---|---|
| `npm run check` | Biome, TypeScript, layer rules, content rules, translations, and unit tests |
| `npm run build` | production build in `dist/` (`published` lessons only) + prerender + checks |
| `npm run build:review` | the same build, including lessons in review |
| `npm run serve` | serves `dist/` the way GitHub Pages does (with `404.html`) at http://127.0.0.1:4173 |
| `npm run preview` | `build` + `serve` |
| `npm run e2e` | end-to-end tests in Chromium (uses the current `dist/`) |
| `npm run check:all` | everything above + `npm audit`; this is what CI runs |
| `npm run fix` | formats and applies every fix Biome knows how to make |
| `npm run new -- so slug "Título"` | creates a new draft lesson from the template |
| `npm run strings` | syncs `src/locales/en/ui.json` with the keys in `src/ui/strings.ts` |

To open a pull request preview, download the `preview-dist` artifact from CI, extract it into
`dist/`, and run `npm run serve`.

Build variables: `BASE_URL` (default `/`), `SITE_ORIGIN` (default `http://localhost:4173`, used
for canonical URLs, Open Graph, and the sitemap), and `VITE_SHOW_REVIEW=1`.

## Layout

```text
src/contracts/   shared types (lesson, scene, trace, frames)
src/sim/         pure, tested simulators: net/, os/, arch/, shared/
src/core/        state, player, progress, search, i18n, visibility (no heavy DOM)
src/scene/       SVG scene rendering
src/ui/          pages, panels, controls, styles
src/sites/       one folder per site: catalog.ts, glossary.ts, lessons/
scripts/         prerender, content/layer/dist checks, lesson generator
tests/e2e/       Playwright + axe
docs/            decisions, authoring guide, and lesson reviews (in Portuguese)
```

Dependencies between layers are enforced by `scripts/check-imports.ts`. Production code has no
runtime dependencies.

## Deployment

The `Deploy` workflow publishes to GitHub Pages from the `biteducation.github.io` repository.
One-time steps for the owner:

1. Create the organization and the `biteducation.github.io` repository.
2. Under **Settings → Pages**, choose **GitHub Actions** as the source.
3. Optional: under **Settings → Variables**, create `SHOW_REVIEW = 1` to also publish lessons
   in review until they are promoted to `published`.
4. Optional, only if other contributors join: fill in `.github/CODEOWNERS` and protect the
   `main` branch (D10 in `docs/decisoes.md`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/autoria.md](docs/autoria.md), and
[docs/revisao/](docs/revisao/).

## Licenses

- Code: [MIT](LICENSE).
- Lesson content (text, glossaries, scenarios): [CC BY-SA 4.0](LICENSE-CONTENT).
- IBM Plex fonts: SIL Open Font License (`public/fonts/OFL.txt`).
- BitEducation logo and symbol (`public/brand/`): the project's trademark, not covered by the
  licenses above; use outside the project requires the owner's permission.
