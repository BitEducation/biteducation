# Contributing

Thanks for your interest. Content fixes (a wrong number, a confusing sentence, an inaccurate
reference) are the most valuable contributions: open an issue naming the lesson, the step (the
link from the "Copiar link deste passo" button works), and, if possible, the book or RFC that
shows the correct version.

Lessons are written in Brazilian Portuguese, so content changes should be too. Issues and pull
requests can be in English or Portuguese.

## Before opening a pull request

1. `npm ci` and `npm run check` must pass.
2. Changed the interface? Also run `npm run check:all` (it includes the end-to-end tests).
3. One topic per pull request, with small commits in the Conventional Commits style
   (`fix(redes): correct the TTL on arrival`, `feat(so): page replacement lesson`).

## New lesson

1. `npm run new -- <redes|so|arq> <slug> "Título"` creates the skeleton as a `draft`.
2. Follow [docs/autoria.md](docs/autoria.md) (in Portuguese): structure, style, and characters.
3. Write the golden test with the math worked out by hand, and record that math in
   `docs/revisao/<site>-<slug>.md`.
4. Attack lessons (networks site) are simulations for understanding, detecting, and defending:
   no commands, tools, or recipes usable outside the lesson.

Lessons only become `published` after the maintainer's technical review.

## Dependencies

The code shipped to the browser has no dependencies. New development tools need a
justification in the pull request: what they do that the current ones don't, their size, and
how well maintained they are.

## License of contributions

By contributing, you agree that code is licensed under MIT and teaching content under
CC BY-SA 4.0 (see `LICENSE` and `LICENSE-CONTENT`). Don't copy passages from books or other
sites: write in your own words and cite the source in `refs`.

See also the [code of conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md).
