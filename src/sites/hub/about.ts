import { html, render } from "../../core/dom.ts";
import { t } from "../../core/i18n.ts";
import { bootCommon, changeLang } from "../../ui/app.ts";
import { BOOKS, COURSES } from "../../ui/books.ts";
import { openHelp } from "../../ui/help.ts";
import { pageShortcuts } from "../../ui/page-shortcuts.ts";
import { bindTopbar, footerHtml, topbarHtml } from "../../ui/topbar.ts";

const REFERENCE_SITE = "https://protocol-explorer-alpha.vercel.app";

let off: () => void = () => {};
function mount() {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  off();
  render(
    root,
    html`<div class="page">${topbarHtml("hub", {})}
      <main class="page-main prose" id="main" tabindex="-1">
        <section class="hero"><div class="accent-bar"></div><h1>${t("about.title")}</h1>
          <p>Três sites irmãos que mostram, passo a passo e com animações, o que acontece dentro do computador: arquitetura, sistema operacional e rede.</p></section>
        <h2>Como funciona</h2>
        <p>Cada lição roda uma simulação de verdade no seu navegador. A mesma execução alimenta a cena animada, a tabela de eventos e o inspetor de bytes e bits. No modo Laboratório você troca os parâmetros e vê o resultado mudar.</p>
        <h2>Privacidade</h2>
        <ul>
          <li>Não há contas, anúncios, cookies nem rastreadores.</li>
          <li>Seu progresso, tema e idioma ficam só neste navegador (armazenamento local). Nada é enviado a servidor algum.</li>
          <li>Você pode exportar, importar ou apagar o progresso na página inicial de cada site.</li>
        </ul>
        <h2>Licenças</h2>
        <ul>
          <li>Código: MIT.</li>
          <li>Texto das lições e diagramas: CC BY-SA 4.0. Pode usar em aula e adaptar, citando a fonte.</li>
          <li>Fontes IBM Plex: SIL Open Font License 1.1.</li>
        </ul>
        <h2>Bibliografia</h2>
        <p>As lições seguem a bibliografia clássica de cada área. As citações indicam capítulo e seção; o texto é escrito do zero, sem reproduzir os livros.</p>
        <ul>${Object.values(BOOKS).map((b) => html`<li>${b.authors}. <i>${b.title}</i>, ${b.edition} ${b.publisher}. ISBN ${b.isbn}.</li>`)}</ul>
        <h2>Disciplinas</h2>
        <p>A ordem e o recorte dos temas acompanham a ementa destas disciplinas. É material de estudo independente, sem vínculo oficial com as disciplinas ou com a universidade.</p>
        <ul>${Object.values(COURSES)
          .flat()
          .map((c) => html`<li><b>${c.code}</b> · ${c.name}. ${c.teacher}, ${c.school}.</li>`)}</ul>
        <p>Nas lições de rede, as RFCs citadas apontam para o rfc-editor.org.</p>
        <h2>Segurança ofensiva</h2>
        <p>As lições sobre ataques mostram o mecanismo e, sempre, como detectar e se defender. Tudo acontece numa rede fictícia simulada no navegador; nenhuma lição envia pacotes de verdade.</p>
        <h2>Créditos</h2>
        <p>Inspirado pelo <a href="${REFERENCE_SITE}" target="_blank" rel="noopener noreferrer">Protocol Explorer</a>. O design, o código e o conteúdo daqui são próprios.</p>
      </main>${footerHtml()}</div>`,
  );
  off = bindTopbar(root, { onHelp: openHelp, onLang: (code) => void changeLang(code, mount) });
  document.title = `${t("about.title")} · ${t("brand.hub")}`;
}

await bootCommon("hub");
mount();
pageShortcuts();
