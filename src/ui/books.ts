import type { BookId, SiteId } from "../contracts/types.ts";

/** Bibliography: the books the lessons follow. Chapters cited by lessons are checked against these editions. */
export const BOOKS: Record<
  BookId,
  { authors: string; title: string; edition: string; publisher: string; isbn: string }
> = {
  "tanenbaum-mos": {
    authors: "Tanenbaum e Bos",
    title: "Sistemas Operacionais Modernos",
    edition: "4. ed.",
    publisher: "Pearson, 2016",
    isbn: "978-85-4301-818-8",
  },
  "tanenbaum-sco": {
    authors: "Tanenbaum e Austin",
    title: "Organização Estruturada de Computadores",
    edition: "6. ed.",
    publisher: "Pearson, 2013",
    isbn: "978-85-4301-379-4",
  },
  "tanenbaum-cn": {
    authors: "Tanenbaum, Feamster e Wetherall",
    title: "Redes de Computadores",
    edition: "6. ed.",
    publisher: "Bookman, 2021",
    isbn: "978-85-8260-561-5",
  },
  "maziero-so": {
    authors: "Maziero",
    title: "Sistemas Operacionais: Conceitos e Mecanismos",
    edition: "e-book",
    publisher: "Editora da UFPR, 2019",
    isbn: "978-85-7335-340-2",
  },
};

/** Books each site follows, in the order they are cited most. */
export const SITE_BOOKS: Record<SiteId, BookId[]> = {
  redes: ["tanenbaum-cn"],
  so: ["tanenbaum-mos", "maziero-so"],
  arq: ["tanenbaum-sco"],
};

/** Courses whose syllabus the sites follow. Study material only: no official link with the course. */
export const COURSES: Record<SiteId, { code: string; name: string; teacher: string; school: string }[]> = {
  redes: [
    {
      code: "ST568",
      name: "Redes de Comunicação I",
      teacher: "Prof. Dr. André Leon Sampaio Gradvohl",
      school: "Faculdade de Tecnologia da Unicamp (FT)",
    },
  ],
  so: [
    {
      code: "TT304",
      name: "Sistemas Operacionais",
      teacher: "Prof. Dr. André Leon Sampaio Gradvohl",
      school: "Faculdade de Tecnologia da Unicamp (FT)",
    },
  ],
  arq: [],
};
