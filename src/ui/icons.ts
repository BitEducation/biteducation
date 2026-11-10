import { raw, type SafeHtml } from "../core/dom.ts";

/** Project-drawn icons: 20px grid, 1.75 stroke, round caps. Trusted strings (no user data). */
const P =
  'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const svg = (body: string, size = 18) =>
  raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${body}</svg>`,
  );

export const icons = {
  play: () =>
    svg(
      '<path d="M6.5 4.5v11l9-5.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    ),
  pause: () => svg(`<path d="M7 4.5v11M13 4.5v11" ${P} stroke-width="2.4"/>`),
  replay: () => svg(`<path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1" ${P}/><path d="M4 3.5v3.2h3.2" ${P}/>`),
  prev: () => svg(`<path d="M12.5 4.5 7 10l5.5 5.5" ${P}/>`),
  next: () => svg(`<path d="M7.5 4.5 13 10l-5.5 5.5" ${P}/>`),
  stepOne: () => svg(`<path d="M5 4.5 11 10l-6 5.5" ${P}/><path d="M15 4.5v11" ${P}/>`),
  stepBack: () => svg(`<path d="M15 4.5 9 10l6 5.5" ${P}/><path d="M5 4.5v11" ${P}/>`),
  search: () => svg(`<circle cx="8.8" cy="8.8" r="5" ${P}/><path d="m12.6 12.6 4 4" ${P}/>`),
  sun: () =>
    svg(
      `<circle cx="10" cy="10" r="3.4" ${P}/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7 6 6M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" ${P}/>`,
    ),
  moon: () => svg(`<path d="M15.8 12.6A6.4 6.4 0 0 1 7.4 4.2a6.4 6.4 0 1 0 8.4 8.4z" ${P}/>`),
  auto: () =>
    svg(
      `<circle cx="10" cy="10" r="6.5" ${P}/><path d="M10 3.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor"/>`,
    ),
  help: () =>
    svg(
      `<circle cx="10" cy="10" r="7" ${P}/><path d="M7.9 7.8a2.2 2.2 0 1 1 3.1 2c-.7.3-1 .8-1 1.5v.4" ${P}/><circle cx="10" cy="14.2" r=".9" fill="currentColor"/>`,
    ),
  close: () => svg(`<path d="m5 5 10 10M15 5 5 15" ${P}/>`),
  menu: () => svg(`<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" ${P}/>`),
  sidebar: () =>
    svg(`<rect x="2.5" y="3.5" width="15" height="13" rx="2" ${P}/><path d="M7.5 3.5v13" ${P}/>`),
  list: () =>
    svg(
      `<path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5" ${P}/><circle cx="3.8" cy="5.5" r=".9" fill="currentColor"/><circle cx="3.8" cy="10" r=".9" fill="currentColor"/><circle cx="3.8" cy="14.5" r=".9" fill="currentColor"/>`,
    ),
  inspect: () =>
    svg(
      `<rect x="3" y="3.5" width="14" height="13" rx="2" ${P}/><path d="M6 8h3M6 11h8M6 14h5M12 8h2" ${P}/>`,
    ),
  present: () =>
    svg(`<rect x="2.5" y="3.5" width="15" height="10" rx="1.5" ${P}/><path d="M10 13.5v3M7 16.5h6" ${P}/>`),
  fullscreen: () => svg(`<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" ${P}/>`),
  copy: () =>
    svg(
      `<rect x="6.5" y="6.5" width="10" height="10" rx="1.5" ${P}/><path d="M13.5 6.5v-2a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" ${P}/>`,
    ),
  link: () =>
    svg(
      `<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" ${P}/>`,
    ),
  chevronDown: () => svg(`<path d="m5.5 8 4.5 4.5L14.5 8" ${P}/>`, 14),
  check: () => svg(`<path d="m4.5 10.5 3.5 3.5 7.5-8" ${P} stroke-width="2"/>`, 14),
  lab: () =>
    svg(
      `<path d="M8 3h4M8.5 3v4.6l-4.2 7.3A1.4 1.4 0 0 0 5.5 17h9a1.4 1.4 0 0 0 1.2-2.1l-4.2-7.3V3" ${P}/><path d="M6.4 12.5h7.2" ${P}/>`,
    ),
  download: () => svg(`<path d="M10 3.5v9M6 8.5l4 4 4-4M4 16.5h12" ${P}/>`),
  upload: () => svg(`<path d="M10 12.5v-9M6 7.5l4-4 4 4M4 16.5h12" ${P}/>`),
  trash: () => svg(`<path d="M4 5.5h12M8 5.5V4h4v1.5M5.5 5.5l.8 11h7.4l.8-11" ${P}/>`),
  layers: () =>
    svg(`<path d="m10 3 7 3.6-7 3.6-7-3.6z" ${P}/><path d="m3 10.2 7 3.6 7-3.6M3 13.8l7 3.6 7-3.6" ${P}/>`),
};

/** Site marks: one simple glyph per site, used in the brand chip and the hub cards. */
export function siteMark(site: "redes" | "so" | "arq" | "hub", size = 18): SafeHtml {
  if (site === "hub") return brandSymbol(size);
  const marks = {
    redes: `<circle cx="10" cy="4.5" r="2" ${P}/><circle cx="4.5" cy="15" r="2" ${P}/><circle cx="15.5" cy="15" r="2" ${P}/><path d="M9 6.3 5.5 13.2M11 6.3l3.5 6.9M6.5 15h7" ${P}/>`,
    so: `<rect x="3" y="3.5" width="14" height="13" rx="2" ${P}/><path d="M3 7.5h14M6.5 11l2 1.6-2 1.6M10.5 14.2h3" ${P}/>`,
    arq: `<rect x="5.5" y="5.5" width="9" height="9" rx="1.2" ${P}/><path d="M8 2.5v3M12 2.5v3M8 14.5v3M12 14.5v3M2.5 8h3M2.5 12h3M14.5 8h3M14.5 12h3" ${P}/>`,
  } as const;
  return svg(marks[site], size);
}

/** BitEducation symbol (pixel book), traced from public/brand/biteducation-simbolo.webp. */
const BRAND_SYMBOL =
  '<defs><linearGradient id="be-g" x1="100" y1="200" x2="900" y2="860" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22E6F2"/><stop offset=".5" stop-color="#2BA4F5"/><stop offset="1" stop-color="#9038F0"/></linearGradient></defs><g fill="url(#be-g)" fill-rule="evenodd"><path d="M160 375H215V270H290V210H400Q475 210 475 290V775Q420 720 350 710V578H290V710H160ZM292 270V325H348V270ZM350 328V382H408V328ZM232 458V512H290V458ZM350 515V572H408V515Z"/><path d="M530 775V290Q530 210 610 210H700V430H850V710H640Q580 720 530 775ZM600 320V373H655V320ZM660 458V512H717V458ZM720 515V572H775V515ZM600 578V632H655V578Z"/><path d="M52 430H107V760H350Q460 760 478 895Q440 820 350 820H52Z"/><path d="M958 430H903V760H640Q550 760 530 895Q570 820 640 820H958Z"/><rect x="750" y="85" width="82" height="80"/><rect x="903" y="33" width="57" height="57"/><rect x="903" y="193" width="82" height="82"/><rect x="750" y="278" width="100" height="99"/></g><rect x="408" y="515" width="67" height="57" fill="#1E5BEA"/>';

export function brandSymbol(size = 18): SafeHtml {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="30 -20 976 976" aria-hidden="true" focusable="false">${BRAND_SYMBOL}</svg>`,
  );
}
