// History 1800–1945 from the historical-basemaps snapshots + yearly events.
// Writes <OUT>/hist/s<year>.bin (border segments between the snapshot's units) and returns the eras.
import fs from "fs";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";
import { feature } from "topojson-client";
import { geoArea, geoInterpolate, geoDistance } from "d3-geo";
import polylabel from "polylabel";
import { translate, flagFor, ownerFor } from "./hist-names.mjs";
// fusão repetida ano a ano (evento de um ano só vence as fusões anteriores), com a bandeira do ano
const perYear = (y0, y1, e) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ y: y0 + i, y1: y0 + i, ...e })); // vence fusões de anos anteriores
const yearly = (y0, y1, name, key, members) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ y: y0 + i, y1: y0 + i, m: [name, flagFor(key, "", y0 + i), members] }));
import { triangulate, polysOf } from "./tri.mjs";
import { ISLES } from "./hist-isles.mjs";

// units the old maps lack, made of today's provinces (same list and order as hist_overlay.py)
const OVR = JSON.parse(fs.readFileSync(new URL("./hist-overrides.json", import.meta.url), "utf8"));
const inRing = (pt, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inPoly = (pt, poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h));

const NORTH1866 = ["Anhalt", "Duchy of Brunswick", "Duchy of Holstein", "Duchy of Nassau", "Duchy of Schleswig", "Electorate of Hesse", "Free City of Bremen", "Free City of Hamburg", "Free City of Lübeck", "Grand Duchy of Oldenburg", "Kingdom of Hanover", "Kingdom of Saxony", "Lippe", "Mecklenburg-Schwerin", "Mecklenburg-Strelitz", "Schaumburg-Lippe", "Thuringian states", "Waldeck"];
export const SNAPS = [
  [1600, 1600, 1649], [1650, 1650, 1699], [1700, 1700, 1714], [1715, 1715, 1782], [1783, 1783, 1787],
  [1900, 1788, 1912], [1914, 1913, 1919],
  [1920, 1920, 1929], [1930, 1930, 1937], [1938, 1938, 1944], [1945, 1945, 1945],
];

const GERMAN_NORTH = ["Prussia", "Hanover", "Saxony", "Mecklenburg-Schwerin", "Mecklenburg-Strelitz", "Oldenburg", "Brunswick", "Thuringia", "Holstein", "Schleswig", "Nassau",
  "Electoral Hesse", "Anhalt", "Lippe-Detmold", "Waldeck", "Schaumburg-Lippe", "Hamburg", "Bremen", "Lübeck", "Cuxhaven", "Wetzlar", "Hohenzollern"];
const GERMAN_SOUTH = ["Bavaria", "Württemberg", "Baden", "Grand Duchy of Hesse", "Palatinate"];
const ITALY = ["Kingdom of Sardinia", "Tuscany", "Kingdom of the Two Sicilies", "Parma", "Modena", "Lucca", "Massa", "Pontremoli", "Fivizzano", "Lombardy"];

// Events: applied to every year >= y inside the snapshot's period. Situation on 31 December.
// r: rename {key: name}, f: flag {key: flag}, m: merge [newName, flag, [keys]] (keys may be earlier merges' first key),
// o: owner text {key: text or null}; y1: last year the event applies (default: to the end of the snapshot)
const KONGO = { "Congo": "Reino do Congo" };
const RU14 = ["Russian Empire", "Congress Poland", "Vilnius region", "Lithuania (RU)", "Latvia (RU)", "Estonia (RU)", "West Belarus", "Ukraine (RU)", "Bessarabia",
  "Georgia", "Armenia", "Azerbaijan", "Sakhalin (RU)"];
const AH14 = ["Austro-Hungarian Empire", "Littoral", "Trentino", "West Galicia", "East Galicia", "Bukovina", "Carpathian Ruthenia", "Bohemia", "Slovakia", "Austria",
  "Hungary", "Transylvania", "South Slav lands"];
export const EVENTS = {
  1600: [
    { y: 1600, r: { ...KONGO, "Portugal": "Portugal (União Ibérica)" } },
    { y: 1640, r: { "Portugal": "Portugal" } },
  ],
  1650: [{ y: 1650, r: KONGO }],
  1700: [
    { y: 1700, r: KONGO },
    { y: 1707, m: ["Reino da Grã-Bretanha", "h:gb1707", ["England and Ireland", "Scotland"]] },
  ],
  1715: [
    { y: 1715, r: KONGO },
    { y: 1721, r: { "Tsardom of Muscovy": "Império Russo" } },
    { y: 1776, r: { "British American colonies": "Estados Unidos" }, f: { "British American colonies": "x:us" } },
  ],
  1783: [{ y: 1783, r: KONGO }],
  1800: [
    { y: 1800, r: { "Paraguay": "Intendência do Paraguai" } },
  ],
  1815: [
    { y: 1815, r: { "Canada": "América do Norte Britânica", "Viceroyalty of Brazil": "Reino do Brasil (unido a Portugal)", "Paraguay": "Paraguai" }, f: { "Canada": "x:gb", "Paraguay": "x:py" } },
    { y: 1816, r: { "United Provinces of the Río de la Plata": "Províncias Unidas do Rio da Prata" }, f: { "United Provinces of the Río de la Plata": "x:ar" } },
    { y: 1819, r: { "Viceroyalty of New Granada": "Grã-Colômbia" }, f: { "Viceroyalty of New Granada": "x:co" } },
    { y: 1821, r: { "Viceroyalty of New Spain": "Império Mexicano", "Viceroyalty of Peru": "Peru" }, f: { "Viceroyalty of New Spain": "x:mx", "Viceroyalty of Peru": "x:pe" } },
    { y: 1822, r: { "Viceroyalty of Brazil": "Império do Brasil" }, f: { "Viceroyalty of Brazil": "h:br_emp" } },
    { y: 1824, r: { "Viceroyalty of New Spain": "México" } },
    { y: 1831, r: { "Viceroyalty of New Granada": "Nova Granada, Venezuela e Equador" }, f: { "Viceroyalty of New Granada": "blank" } },
    { y: 1846, m: ["Império Austríaco", "h:at_hab", ["Austrian Empire", "Republic of Kraków"]] },
    { y: 1861, m: ["Reino da Itália", "h:it_sav", ITALY] },
    { y: 1866, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Sardinia", "Venetia"]] },
    { y: 1867, r: { "Austrian Empire": "Áustria-Hungria", "Canada": "Canadá" }, f: { "Canada": "h:ca_red" } },
    { y: 1867, m: ["Confederação da Alemanha do Norte", "h:de_emp", GERMAN_NORTH] },
    { y: 1870, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Sardinia", "Papal States"]] },
    { y: 1871, m: ["Império Alemão", "h:de_emp", ["Prussia", ...GERMAN_SOUTH]] },
    { y: 1818, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Maratha Confederacy"]] },
    { y: 1826, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Assam"]] },
    { y: 1856, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Oudh"]] },
    { y: 1858, r: { "British East India Company": "Índia Britânica" } },
  ],
  1900: [
    ...ISLES[1900],
    // revisão 1846–1912 (situação em 31/dez); 1846–1899 usam o mapa de 1900 com os eventos abaixo; 1913 usa o mapa de 1914. Unidades novas vêm de hist-overrides.json.
    { y: 1801, m: ["Reino Unido", "x:gb", ["United Kingdom of Great Britain and Ireland", "Ireland"]] }, // Atos de União em vigor em 1/jan/1801
    { y: 1821, m: ["Estados Confederados da América", "blank", ["Confederate States", "Florida"]] }, // Flórida espanhola até 1820
    ...yearly(1820, 1848, "Haiti", "Haiti", ["Haiti", "Kingdom of Haiti"]),
    ...yearly(1849, 1858, "Império do Haiti", "Haiti", ["Haiti", "Kingdom of Haiti"]),
    ...yearly(1859, 1912, "Haiti", "Haiti", ["Haiti", "Kingdom of Haiti"]), // Reino do Haiti termina com a morte de Henrique I, 8/out/1820
    { y: 1815, m: ["Reino da Prússia", "blank", ["Germany", "Posen"]] }, // Grão-Ducado de Posen (Congresso de Viena, 9/jun/1815)
    { y: 1815, m: ["Ceilão", "x:gb", ["Ceylon", "Kandy"]] }, // Convenção de Kandy, 2/mar/1815
    { y: 1813, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Gorizia"]] }, // Gorízia austríaca até 1918 (o mapa de 1900 a põe na Itália)
    { y: 1814, m: ["Reino da Prússia", "blank", ["Germany", "Rhine Left"]] }, // margem esquerda do Reno deixa a França em 1814
    { y: 1814, m: ["Reino da Baviera", "blank", ["Kingdom of Bavaria", "Palatinate"]] }, // Palatinado sob administração austro-bávara até 1816
    { y: 1814, m: ["Reino da Sardenha", "blank", ["Italy", "Piedmont", "Liguria", "Novara"]] },
    { y: 1814, m: ["Marcas e Úmbria", "blank", ["Marche and Umbria", "Umbria"]] },
    { y: 1814, m: ["Espanha", "x:es", ["Spain", "Catalonia"]] }, // Catalunha anexada à França em 1812
    { y: 1814, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Tyrol", "Trentino"]] }, // Tirol devolvido à Áustria em 1814
    { y: 1816, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Salzburg"]] }, // Salzburgo devolvido em 1816
    { y: 1813, m: ["Reino da Prússia", "blank", ["Germany", "NRW", "Altmark"]] }, // Berg e Vestfália dissolvidos em 1813
    { y: 1813, m: ["Suíça", "x:ch", ["Switzerland", "Valais", "Geneva"]] }, // Valais ocupado pelos austríacos e Genebra restaurada em dez/1813
    { y: 1813, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Illyria", "Dalmatia", "Dubrovnik"]] }, // Províncias Ilírias reocupadas em 1813–jan/1814
    { y: 1815, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Tarnopol"]] }, // Tarnopol russo de 1809 ao Congresso de Viena
    // fusões permanentes da revisão 1856–1860 (antes dos outros eventos, para que os nomes de cada ano prevaleçam)
    { y: 1859, y1: 1860, m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Lombardy"]] }, // Lombardia cedida pelo Tratado de Zurique, 10/nov/1859
    { y: 1860, y1: 1860, m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Lombardy", "Tuscany", "Duchy of Parma", "Duchy of Modena", "Romagna", "Marche and Umbria", "Two Sicilies"]] }, // plebiscitos de 11/mar (Itália Central), 21/out (Duas Sicílias) e nov/1860 (Marcas e Úmbria)
    { y: 1861, m: ["Reino da Itália", "h:it_sav", ["Italy", "Lombardy", "Tuscany", "Duchy of Parma", "Duchy of Modena", "Romagna", "Marche and Umbria", "Two Sicilies"]] }, // Reino da Itália proclamado em 17/mar/1861
    { y: 1859, y1: 1861, m: ["Principados Unidos da Moldávia e Valáquia", "blank", ["Romania", "Wallachia"]] }, // Cuza eleito nos dois principados em fev/1859; bandeira não descrita antes de 1862
    { y: 1862, y1: 1865, m: ["Principados Unidos (Romênia)", "h:ro_up", ["Romania", "Wallachia"]] }, // união formal em fev/1862
    { y: 1866, y1: 1866, m: ["Romênia", "h:ro_up", ["Romania", "Wallachia"]] },
    { y: 1867, m: ["Romênia", "x:ro", ["Romania", "Wallachia"]] },
    { y: 1860, m: ["França", "x:fr", ["France", "Savoy and Nice"]] }, // Tratado de Turim, 24/mar/1860; posse em 12/jun/1860
    { y: 1861, m: ["Argentina", "x:ar", ["Argentina", "State of Buenos Aires", "Liga Federal"]] }, // Pavón (17/set/1861); reunificação em 12/dez/1861
    { y: 1858, m: ["Império Russo", "x:ru", ["Russian Empire", "Amur"]] }, // Tratado de Aigun, 28/mai/1858
    { y: 1860, m: ["Império Russo", "x:ru", ["Russian Empire", "Ussuri"]] }, // Convenção de Pequim, 14/nov/1860
    { y: 1875, m: ["Império Russo", "x:ru", ["Russian Empire", "Sakhalin"]] }, // Tratado de São Petersburgo (1875): Sacalina russa, Curilas japonesas
    { y: 1788, y1: 1874, m: ["Império Russo", "x:ru", ["Russian Empire", "North Kurils"]] }, // Tratado de Shimoda (1855): Urup e ao norte russas
    { y: 1875, m: ["Império do Japão", "x:jp", ["Imperial Japan", "North Kurils"]] },
    { y: 1849, y1: 1852, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Punjab", "Peshawar", "Sind", "Kashmir"]] }, // Império Sikh anexado em 2/abr/1849
    { y: 1853, y1: 1855, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Pegu", "Punjab", "Peshawar", "Sind", "Kashmir"]] }, // anexação de Pegu proclamada em 20/jan/1853
    { y: 1856, y1: 1857, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Pegu", "Oudh", "Punjab", "Peshawar", "Sind", "Kashmir"]] }, // Awadh anexado em 1856
    { y: 1858, m: ["Índia Britânica", "x:gb", ["British Raj", "Pegu", "Oudh", "Punjab", "Peshawar", "Sind", "Kashmir"]] }, // Coroa desde 1/nov/1858
    { y: 1788, y1: 1847, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Hungary"]] },
    { y: 1849, y1: 1866, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Hungary"]] }, // Világos, ago/1849
    { y: 1867, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "Hungary"]] },
    { y: 1815, y1: 1847, m: ["Reino das Duas Sicílias", "blank", ["Two Sicilies", "Sicily"]] },
    { y: 1849, m: ["Reino das Duas Sicílias", "blank", ["Two Sicilies", "Sicily"]] }, // Palermo retomada em 15/mai/1849
    { y: 1847, m: ["Grão-Ducado da Toscana", "blank", ["Tuscany", "Lucca"]] }, // Lucca unida à Toscana em 1847
    { y: 1848, m: ["México", "x:mx", ["Mexico", "Yucatan"]] }, // Yucatán volta ao México em 17/ago/1848
    // Américas e Pacífico
    { y: 1788, r: { "Kingdom of Brazil": "Brasil", "Kingdom of Hawaii": "Havaí (EUA)", "Puerto Rico": "Porto Rico (EUA)", "Guam": "Guam", "American Samoa": "Samoa Americana",
      "Philippines": "Filipinas (EUA)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas", "Samoa": "Samoa Alemã", "Micronesia": "Micronésia Alemã",
      "Papua New Guinea": "Nova Guiné Alemã", "Tonga": "Tonga (protetorado britânico)", "Wallis and Futuna Islands": "Wallis e Futuna", "Rapa Nui": "Rapa Nui (Chile)",
      "Guadeloupe": "Guadalupe", "Netherlands Antilles": "Curaçao e dependências", "Canada": "Canadá", "United States of America": "Estados Unidos" },
      f: { "Kingdom of Brazil": "h:br21", "United States Virgin Islands": "x:dk", "Samoa": "h:de_emp", "Micronesia": "h:de_emp", "Papua New Guinea": "h:de_emp", "Tonga": "x:to",
      "Wallis and Futuna Islands": "x:fr", "Rapa Nui": "x:cl", "Guadeloupe": "x:fr", "Martinique": "x:fr", "Netherlands Antilles": "x:nl", "Dominica": "x:gb",
      "Antigua and Barbuda": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb",
      "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" },
      o: { "Kingdom of Brazil": null, "Kingdom of Hawaii": "Estados Unidos", "Puerto Rico": "Estados Unidos", "Guam": "Estados Unidos", "American Samoa": "Estados Unidos",
      "United States Virgin Islands": "Dinamarca", "Samoa": "Império Alemão", "Micronesia": "Império Alemão", "Papua New Guinea": "Império Alemão" } },
    { y: 1788, y1: 1907, f: { "Kingdom of Hawaii": "h:us45", "Puerto Rico": "h:us45", "Guam": "h:us45", "American Samoa": "h:us45", "Philippines": "h:us45" } }, // 45 estrelas até 4/jul/1908
    { y: 1908, y1: 1911, f: { "Kingdom of Hawaii": "h:us46", "Puerto Rico": "h:us46", "Guam": "h:us46", "American Samoa": "h:us46", "Philippines": "h:us46" } },
    { y: 1912, f: { "Kingdom of Hawaii": "h:us48", "Puerto Rico": "h:us48", "Guam": "h:us48", "American Samoa": "h:us48", "Philippines": "h:us48" } },
    { y: 1788, r: { "Cuba": "Cuba", "British West Indies": "Índias Ocidentais Britânicas", "Martinique": "Martinica" }, f: { "Cuba": "x:cu", "British West Indies": "x:gb", "Martinique": "x:fr" },
      o: { "Cuba": null, "British West Indies": "Reino Unido", "Martinique": "França" } },
    { y: 1788, y1: 1901, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us45" }, o: { "Cuba": null } }, // até 20/mai/1902
    { y: 1906, y1: 1907, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us45" }, o: { "Cuba": null } }, // set/1906 a jan/1909
    { y: 1908, y1: 1908, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us46" }, o: { "Cuba": null } },
    { y: 1821, y1: 1902, m: ["Colômbia", "x:co", ["Colombia", "Panama"]] },
    { y: 1903, r: { "Panama": "Panamá" }, f: { "Panama": "x:pa" }, o: { "Panama": null } }, // 3/nov/1903
    { y: 1788, y1: 1906, r: { "Newfoundland": "Terra Nova" }, f: { "Newfoundland": "x:gb" }, o: { "Newfoundland": "Reino Unido" } },
    { y: 1907, r: { "Newfoundland": "Domínio da Terra Nova" }, f: { "Newfoundland": "x:gb" }, o: { "Newfoundland": null } }, // 26/set/1907
    { y: 1788, y1: 1900, f: { "Niue": "x:gb" }, o: { "Niue": "Reino Unido" } },
    { y: 1901, f: { "Niue": "x:nz" }, o: { "Niue": "Nova Zelândia" } }, // anexada pela Nova Zelândia em 1901
    // Austrália, Nova Zelândia e Papua
    { y: 1788, y1: 1862, m: ["Nova Gales do Sul (britânica)", "x:gb", ["New South Wales (UK)", "Northern Territory (UK)"]] }, // Território do Norte anexado à Austrália Meridional em jul/1863
    { y: 1863, y1: 1900, m: ["Austrália Meridional (britânica)", "x:gb", ["South Australia (UK)", "Northern Territory (UK)"]] },
    { y: 1856, y1: 1900, r: { "_null_150": "Tasmânia (britânica)" }, f: { "_null_150": "x:gb" }, o: { "_null_150": "Reino Unido" } },
    { y: 1901, m: ["Austrália", "x:au", ["Western Australia (UK)", "Queensland (UK)", "Northern Territory (UK)", "South Australia (UK)", "New South Wales (UK)", "Victoria (UK)", "_null_150"]], o: { "Western Australia (UK)": null } }, // federação em 1/jan/1901
    { y: 1788, y1: 1901, r: { "New Zealand": "Nova Zelândia" }, f: { "New Zealand": "x:gb" }, o: { "New Zealand": "Reino Unido" } },
    { y: 1902, y1: 1906, r: { "New Zealand": "Nova Zelândia" }, f: { "New Zealand": "x:nz" }, o: { "New Zealand": "Reino Unido" } }, // bandeira de 1902
    { y: 1907, r: { "New Zealand": "Domínio da Nova Zelândia" }, f: { "New Zealand": "x:nz" }, o: { "New Zealand": null } }, // 26/set/1907
    { y: 1788, y1: 1905, r: { "Papua": "Nova Guiné Britânica" }, f: { "Papua": "x:gb" }, o: { "Papua": "Reino Unido" } },
    { y: 1906, r: { "Papua": "Território de Papua (Austrália)" }, f: { "Papua": "x:au" }, o: { "Papua": "Austrália" } }, // 1/set/1906
    // Ásia
    { y: 1788, m: ["Império do Japão", "x:jp", ["Imperial Japan", "_null_185", "_null_186", "_null_187", "_null_188", "_null_189", "_null_190", "_null_191", "_null_192", "_null_193", "_null_194", "_null_195", "_null_196", "_null_197", "_null_198", "_null_199", "_null_200", "_null_201"]] },
    { y: 1788, r: { "Taiwan": "Taiwan (Japão)", "Bhutan": "Butão", "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português",
      "Macau": "Macau", "Maldives": "Maldivas (protetorado britânico)", "Rattanakosin Kingdom": "Sião" },
      f: { "Taiwan": "x:jp", "Bhutan": "blank", "Afghanistan": "h:af_black", "French India": "x:fr", "Maldives": "x:gb" }, o: { "Taiwan": "Japão" } },
    { y: 1788, m: ["Índia Britânica", "x:gb", ["British Raj", "India"]] },
    { y: 1788, y1: 1905, f: { "Brunei": "h:bn_y" } }, // amarela lisa até 1906
    { y: 1906, f: { "Brunei": "h:bn06" } },
    { y: 1788, y1: 1904, r: { "Korea": "Império Coreano" }, f: { "Korea": "x:kr" }, o: { "Korea": null } },
    { y: 1905, y1: 1909, r: { "Korea": "Império Coreano (protetorado japonês)" }, f: { "Korea": "x:kr" }, o: { "Korea": null } }, // nov/1905
    { y: 1910, r: { "Korea": "Coreia (Japão)" }, f: { "Korea": "x:jp" }, o: { "Korea": "Japão" } }, // 29/ago/1910
    { y: 1788, y1: 1910, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Mongolia", "Tibet", "Tuva"]] },
    { y: 1911, y1: 1911, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Tibet", "Tuva"]] },
    { y: 1911, r: { "Mongolia": "Mongólia (Canato de Bogd)" }, f: { "Mongolia": "h:mn_bogd" }, o: { "Mongolia": null } }, // dez/1911
    { y: 1912, r: { "Manchu Empire": "República da China", "Tibet": "Tibete", "Tuva": null }, f: { "Manchu Empire": "h:cn_5", "Tibet": "blank" }, o: { "Manchu Empire": null, "Tibet": null } },
    { y: 1788, m: ["Império Russo", "x:ru", ["Russian Empire", "central Asian khanates"]] },
    // Oriente Médio
    { y: 1821, y1: 1831, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "Hasa", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir"]] },
    { y: 1818, y1: 1820, m: ["Império Otomano", "blank", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "Hasa", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir", "Greece"]] }, // Hasa tomada por Ibrahim Paxá após a queda de Diriyah (1818)
    { y: 1788, y1: 1817, m: ["Império Otomano", "blank", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir", "Greece"]] }, // Síria, Hejaz e Creta com o Egito até 1840
    { y: 1832, y1: 1834, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Hasa", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir"]] }, // Síria, Hejaz e Creta com o Egito até 1840
    { y: 1835, y1: 1839, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Hasa", "North Yemen", "Libya", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir"]] }, // Síria, Hejaz e Creta com o Egito até 1840
    { y: 1840, y1: 1910, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Libya", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir"]] },
    { y: 1911, y1: 1911, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159"]] },
    { y: 1912, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Egyptian Syria", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Epirus"]] }, // Janina cercada até mar/1913
    { y: 1911, r: { "Asir": "Emirado Idríssida de Asir" }, f: { "Asir": "h:asir09" }, o: { "Asir": null } },
    { y: 1891, y1: 1901, m: ["Emirado de Jabal Shammar", "blank", ["Hail", "Riyadh", "Qassim"]] }, // Batalha de Mulayda, 21/jan/1891
    { y: 1902, y1: 1903, m: ["Emirado de Jabal Shammar", "blank", ["Hail", "Qassim"]] }, // Riad tomada por Ibn Saud em jan/1902
    { y: 1902, y1: 1903, r: { "Riyadh": "Emirado de Riad" }, f: { "Riyadh": "x:sa" } },
    { y: 1904, r: { "Hail": "Emirado de Jabal Shammar" }, f: { "Hail": "blank" } },
    { y: 1904, m: ["Emirado de Riad", "x:sa", ["Riyadh", "Qassim"]] }, // Qassim em 1904–1906
    { y: 1788, r: { "Arabia": null, "Kuwait": "Kuwait", "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar", "Trucial Oman": "Estados da Trégua (protetorado britânico)",
      "Oman": "Mascate e Omã", "Aden": "Áden e protetorados (britânicos)", "Cyprus": "Chipre (administração britânica)", "Malta": "Malta", "Gibraltar": "Gibraltar" },
      f: { "Kuwait": "x:tr", "Bahrain": "x:gb", "Qatar": "blank", "Trucial Oman": "h:trucial", "Oman": "h:om_red", "Aden": "x:gb", "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb" },
      o: { "Kuwait": null, "Qatar": null, "Trucial Oman": null, "Oman": null, "Cyprus": null } },
    // Europa
    { y: 1788, r: { "Germany": "Império Alemão", "Italy": "Reino da Itália", "Austria Hungary": "Áustria-Hungria", "Faroe Islands": "Ilhas Faroé", "Channel Islands": "Ilhas do Canal",
      "Finland": "Grão-Ducado da Finlândia" },
      f: { "Faroe Islands": "x:dk", "Channel Islands": "x:gb", "Finland": "x:ru" }, o: { "Finland": "Império Russo" } },
    { y: 1788, m: ["Reino Unido", "x:gb", ["United Kingdom of Great Britain and Ireland", "_null_164", "_null_165", "_null_166", "_null_167", "_null_168", "_null_169", "_null_170", "_null_171", "_null_172", "_null_173", "_null_174", "_null_175", "_null_176", "_null_177", "_null_178", "_null_179", "_null_180", "_null_181", "_null_182", "_null_184"]] },
    { y: 1788, m: ["Suécia", "x:se", ["Sweden–Norway", "_null_149"]] },
    { y: 1788, y1: 1904, r: { "Sweden–Norway": "Suécia (em união com a Noruega)", "Norway": "Noruega (em união com a Suécia)" }, f: { "Sweden–Norway": "h:se_union", "Norway": "x:no" }, o: { "Norway": null } }, // Noruega tirou a marca da união da bandeira em 1899; a Suécia manteve até 1905
    { y: 1905, r: { "Sweden–Norway": "Suécia", "Norway": "Noruega" }, f: { "Sweden–Norway": "x:se", "Norway": "x:no" }, o: { "Norway": null } }, // jun–out/1905
    { y: 1808, y1: 1909, r: { "Portugal": "Reino de Portugal" } },
    { y: 1788, y1: 1909, f: { "Portuguese East Africa": "h:pt_mon", "Portuguese Guinea": "h:pt_mon", "Cape Verde": "h:pt_mon", "Sao Tome": "h:pt_mon", "Goa": "h:pt_mon", "Macau": "h:pt_mon", "Portuguese Timor": "h:pt_mon", "Angola": "h:pt_mon" } },
    { y: 1910, f: { "Portuguese East Africa": "x:pt", "Portuguese Guinea": "x:pt", "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Goa": "x:pt", "Macau": "x:pt", "Portuguese Timor": "x:pt", "Angola": "x:pt" } }, // república em 5/out/1910
    { y: 1878, y1: 1907, r: { "Bosnia-Herzegovina": "Bósnia e Herzegovina (ocupação austro-húngara)" }, f: { "Bosnia-Herzegovina": "h:at_hab" }, o: { "Bosnia-Herzegovina": null } },
    { y: 1908, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "Bosnia-Herzegovina", "_null_154"]] }, // anexada em out/1908
    { y: 1788, y1: 1907, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "_null_154"]] },
    { y: 1878, y1: 1907, r: { "Bulgaria": "Principado da Bulgária" }, f: { "Bulgaria": "x:bg" } },
    { y: 1908, r: { "Bulgaria": "Bulgária" }, f: { "Bulgaria": "x:bg" } }, // independência em 5/out/1908
    { y: 1788, y1: 1909, r: { "Montenegro": "Principado de Montenegro" } },
    { y: 1910, r: { "Montenegro": "Reino de Montenegro" } }, // 28/ago/1910
    { y: 1788, y1: 1911, r: { "Crete": "Estado de Creta" }, f: { "Crete": "h:cretan" }, o: { "Crete": null } },
    // Guerra dos Bálcãs (31/dez/1912)
    { y: 1912, m: ["Grécia", "h:gr_cross", ["Greece", "Crete", "Aegean Islands", "Ottoman Macedonia"]] },
    { y: 1912, m: ["Sérvia", "h:rs_old", ["Serbia", "Kosovo and Macedonia"]] },
    { y: 1912, m: ["Reino de Montenegro", "h:rs_old", ["Montenegro", "Ottoman Sandzak"]] },
    { y: 1912, m: ["Bulgária", "x:bg", ["Bulgaria", "Western Thrace"]] },
    { y: 1912, r: { "East Thrace": "Trácia Oriental (ocupação búlgara)", "Albania": "Albânia (ocupada na Guerra dos Bálcãs)", "_null_159": "Dodecaneso (ocupação italiana)" },
      f: { "East Thrace": "x:bg", "Albania": "blank", "_null_159": "h:it_sav" }, o: { "East Thrace": null, "Albania": null, "_null_159": null } }, // Albânia declarada em 28/nov/1912
    // África
    { y: 1911, y1: 1911, r: { "Libya": "Líbia (guerra ítalo-turca)" }, f: { "Libya": "blank" }, o: { "Libya": null } },
    { y: 1912, r: { "Libya": "Líbia Italiana" }, f: { "Libya": "h:it_sav" }, o: { "Libya": "Itália" } }, // Tratado de Ouchy, out/1912
    { y: 1788, r: { "Egypt": "Quedivato do Egito", "Darfur": "Sultanato de Darfur", "Anglo-Egyptian Sudan": "Sudão Anglo-Egípcio", "Algeria": "Argélia", "Tunisia": "Tunísia",
      "Rio de Oro": "Rio de Oro (Espanha)", "French West Africa": "África Ocidental Francesa", "Gambia": "Gâmbia", "Sierra Leone": "Serra Leoa", "Portuguese Guinea": "Guiné Portuguesa",
      "Liberia": "Libéria", "Gold Coast": "Costa do Ouro", "Togoland": "Togolândia", "Nigeria": "Nigéria", "Kamerun": "Camarões Alemão", "Spanish Guinea": "Guiné Espanhola",
      "Angola": "Angola", "German South-West Africa": "Sudoeste Africano Alemão", "Cape Colony": "Colônia do Cabo", "Natal": "Colônia de Natal", "Basutoland": "Basutolândia",
      "Bechuanaland": "Bechuanalândia", "Rhodesia": "Rodésia", "Portuguese East Africa": "Moçambique", "German East Africa": "África Oriental Alemã",
      "British East Africa": "África Oriental Britânica", "Uganda": "Uganda", "Zanzibar": "Zanzibar (protetorado britânico)", "Ethiopia": "Abissínia", "Eritrea": "Eritreia",
      "French Somaliland": "Somalilândia Francesa", "British Somaliland": "Somalilândia Britânica", "Italian Somaliland": "Somália Italiana", "Madagascar": "Madagascar (França)",
      "Comoros": "Comores", "Reunion": "Reunião", "Mauritius": "Maurício", "Seychelles": "Seicheles", "Cape Verde": "Cabo Verde", "Sao Tome": "São Tomé e Príncipe" },
      f: { "Egypt": "h:eg_khed", "Darfur": "blank", "Anglo-Egyptian Sudan": "x:gb", "Algeria": "x:fr", "Tunisia": "x:fr", "Rio de Oro": "x:es", "French West Africa": "x:fr",
      "Gambia": "x:gb", "Sierra Leone": "x:gb", "Liberia": "x:lr", "Gold Coast": "x:gb", "Togoland": "h:de_emp", "Nigeria": "x:gb", "Kamerun": "h:de_emp", "Spanish Guinea": "x:es",
      "German South-West Africa": "h:de_emp", "Cape Colony": "x:gb", "Natal": "x:gb", "Basutoland": "x:gb", "Bechuanaland": "x:gb", "Rhodesia": "x:gb",
      "German East Africa": "h:de_emp", "British East Africa": "x:gb", "Uganda": "x:gb", "Zanzibar": "x:gb", "Ethiopia": "h:eth97", "Eritrea": "h:it_sav",
      "French Somaliland": "x:fr", "British Somaliland": "x:gb", "Italian Somaliland": "h:it_sav", "Madagascar": "x:fr", "Comoros": "x:fr", "Reunion": "x:fr",
      "Mauritius": "x:gb", "Seychelles": "x:gb" },
      o: { "Egypt": "ocupação britânica", "Darfur": null, "Anglo-Egyptian Sudan": "Reino Unido", "Algeria": "França", "Tunisia": "França", "Rio de Oro": "Espanha",
      "French West Africa": "França", "Gambia": "Reino Unido", "Sierra Leone": "Reino Unido", "Portuguese Guinea": "Portugal", "Liberia": null, "Gold Coast": "Reino Unido",
      "Togoland": "Império Alemão", "Nigeria": "Reino Unido", "Kamerun": "Império Alemão", "Spanish Guinea": "Espanha", "Angola": "Portugal",
      "German South-West Africa": "Império Alemão", "Cape Colony": "Reino Unido", "Natal": "Reino Unido", "Basutoland": "Reino Unido", "Bechuanaland": "Reino Unido",
      "Rhodesia": "Reino Unido", "Portuguese East Africa": "Portugal", "German East Africa": "Império Alemão", "British East Africa": "Reino Unido", "Uganda": "Reino Unido",
      "Zanzibar": "Reino Unido", "Ethiopia": null, "Eritrea": "Itália", "French Somaliland": "França", "British Somaliland": "Reino Unido", "Italian Somaliland": "Itália",
      "Madagascar": "França", "Comoros": "França", "Reunion": "França", "Mauritius": "Reino Unido", "Seychelles": "Reino Unido", "Cape Verde": "Portugal", "Sao Tome": "Portugal" } },
    { y: 1788, y1: 1911, r: { "Morocco": "Marrocos" }, f: { "Morocco": "h:ma_red" }, o: { "Morocco": null } },
    { y: 1912, r: { "Morocco": "Marrocos (protetorado francês)" }, f: { "Morocco": "x:fr" }, o: { "Morocco": "França" } }, // 30/mar/1912
    { y: 1788, y1: 1902, r: { "Mauritania": null } }, // emirados mouros (pendente)
    { y: 1903, m: ["África Ocidental Francesa", "x:fr", ["French West Africa", "Mauritania"]] }, // protetorado em 1903
    { y: 1788, y1: 1909, r: { "French Congo": "Congo Francês" }, f: { "French Congo": "x:fr" }, o: { "French Congo": "França" } },
    { y: 1910, r: { "French Congo": "África Equatorial Francesa" }, f: { "French Congo": "x:fr" }, o: { "French Congo": "França" } }, // jan/1910
    { y: 1788, y1: 1907, r: { "Congo Free State": "Estado Livre do Congo" }, f: { "Congo Free State": "h:cfs" }, o: { "Congo Free State": null } },
    { y: 1908, r: { "Congo Free State": "Congo Belga" }, f: { "Congo Free State": "x:be" }, o: { "Congo Free State": "Bélgica" } }, // 15/nov/1908
    { y: 1788, y1: 1901, r: { "Transvaal": "Transvaal (Guerra dos Bôeres)", "Orange Free State": "Estado Livre de Orange (Guerra dos Bôeres)" },
      f: { "Transvaal": "blank", "Orange Free State": "blank" }, o: { "Transvaal": null, "Orange Free State": null } }, // anexados em 1900; guerra até 31/mai/1902
    { y: 1902, y1: 1909, r: { "Transvaal": "Colônia do Transvaal", "Orange Free State": "Colônia do Rio Orange" }, f: { "Transvaal": "x:gb", "Orange Free State": "x:gb" },
      o: { "Transvaal": "Reino Unido", "Orange Free State": "Reino Unido" } },
    { y: 1910, m: ["União Sul-Africana", "h:za_red", ["Cape Colony", "Natal", "Zululand", "Transvaal", "Orange Free State"]], o: { "Cape Colony": null } }, // 31/mai/1910
    { y: 1788, y1: 1902, r: { "Swaziland": "Suazilândia" }, f: { "Swaziland": "blank" }, o: { "Swaziland": null } },
    { y: 1903, r: { "Swaziland": "Suazilândia (protetorado britânico)" }, f: { "Swaziland": "x:gb" }, o: { "Swaziland": null } },
    { y: 1788, y1: 1906, r: { "British Central Africa": "África Central Britânica" }, f: { "British Central Africa": "x:gb" }, o: { "British Central Africa": "Reino Unido" } },
    { y: 1907, r: { "British Central Africa": "Niassalândia" }, f: { "British Central Africa": "x:gb" }, o: { "British Central Africa": "Reino Unido" } },
    // revisão 1885–1899 (situação em 31/dez; fontes: Wikipedia)
    { y: 1894, y1: 1897, r: { "Kingdom of Hawaii": "República do Havaí" }, f: { "Kingdom of Hawaii": "h:hawaii" }, o: { "Kingdom of Hawaii": null } }, // 4/jul/1894 a 12/ago/1898; manteve a bandeira do reino
    { y: 1788, y1: 1897, r: { "Guam": "Guam (Espanha)", "Puerto Rico": "Porto Rico (Espanha)", "Cuba": "Cuba (Espanha)", "Philippines": "Filipinas (Espanha)" },
      f: { "Guam": "x:es", "Puerto Rico": "x:es", "Cuba": "x:es", "Philippines": "x:es" }, o: { "Guam": "Espanha", "Puerto Rico": "Espanha", "Cuba": "Espanha", "Philippines": "Espanha" } },
    { y: 1898, y1: 1898, r: { "Puerto Rico": "Porto Rico (ocupação americana)", "Cuba": "Cuba (Guerra Hispano-Americana)", "Philippines": "Filipinas (Revolução Filipina)" },
      f: { "Puerto Rico": "h:us45", "Cuba": "blank", "Philippines": "blank" }, o: { "Puerto Rico": null, "Cuba": null, "Philippines": null } }, // Tratado de Paris assinado em 10/dez/1898, em vigor em 11/abr/1899
    { y: 1898, y1: 1898, r: { "Guam": "Guam (ocupação americana)" }, o: { "Guam": null } }, // rendeu-se em 20/jun/1898
    { y: 1788, y1: 1898, r: { "Micronesia": "Carolinas e Marianas (Espanha)" }, f: { "Micronesia": "x:es" }, o: { "Micronesia": "Espanha" } }, // vendidas à Alemanha pelo tratado de 12/fev/1899
    { y: 1788, y1: 1899, m: ["Samoa", "blank", ["Samoa", "American Samoa"]], o: { "Samoa": null } }, // partilha só em 1900
    { y: 1788, y1: 1899, r: { "Niue": "Niue", "Tonga": "Reino de Tonga" }, f: { "Niue": "blank", "Tonga": "x:to" }, o: { "Niue": null, "Tonga": null } }, // protetorados britânicos em 1900
    { y: 1788, y1: 1896, r: { "Korea": "Reino de Joseon" }, f: { "Korea": "x:kr" }, o: { "Korea": null } }, // Império Coreano em 13/out/1897; taegukgi oficial desde 1883
    { y: 1788, y1: 1897, f: { "Norway": "h:no_union", "Sweden–Norway": "h:se_union" } },
    { y: 1898, y1: 1898, f: { "Norway": "h:no_union" } }, // lei de 10/dez/1898; a bandeira "pura" foi hasteada a partir de 1899
    { y: 1840, y1: 1896, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Crete"]] },
    { y: 1897, y1: 1897, r: { "Crete": "Creta (ocupação das Grandes Potências)" }, f: { "Crete": "blank" }, o: { "Crete": null } }, // revolta e ocupação em mar–abr/1897; Estado de Creta proclamado em 9/dez/1898
    { y: 1883, y1: 1897, m: ["Estado Mahdista", "blank", ["Anglo-Egyptian Sudan", "Darfur"]], o: { "Anglo-Egyptian Sudan": null } },
    { y: 1898, y1: 1898, r: { "Anglo-Egyptian Sudan": "Sudão (ocupação anglo-egípcia)" }, f: { "Anglo-Egyptian Sudan": "x:gb" }, o: { "Anglo-Egyptian Sudan": null } }, // Omdurman 2/set/1898; convenção de 18/jan/1899
    { y: 1788, y1: 1896, f: { "Ethiopia": "blank" } }, // primeira bandeira oficial em 11/out/1897
    { y: 1895, y1: 1895, r: { "Madagascar": "Reino Merina (invasão francesa)" }, f: { "Madagascar": "blank" }, o: { "Madagascar": null } },
    { y: 1896, y1: 1896, r: { "Madagascar": "Madagascar (protetorado francês)" } }, // anexada em 1897
    { y: 1788, y1: 1899, r: { "Nigeria": "Costa do Níger, Lagos e Cia. Real do Níger (britânicos)" } }, // protetorados da Nigéria em 1/jan/1900
    { y: 1788, y1: 1899, r: { "Transvaal": "Transvaal (República Sul-Africana)", "Orange Free State": "Estado Livre de Orange" },
      f: { "Transvaal": "h:transvaal", "Orange Free State": "h:ofs" }, o: { "Transvaal": null, "Orange Free State": null } }, // Guerra dos Bôeres desde 11/out/1899; anexados em 1900
    { y: 1894, y1: 1898, r: { "Swaziland": "Suazilândia (protetorado do Transvaal)" }, f: { "Swaziland": "blank" }, o: { "Swaziland": "Transvaal (República Sul-Africana)" } }, // convenção de 1894 até out/1899
    { y: 1788, y1: 1892, r: { "Kingdom of Hawaii": "Reino do Havaí" }, f: { "Kingdom of Hawaii": "h:hawaii" }, o: { "Kingdom of Hawaii": null } },
    { y: 1893, y1: 1893, r: { "Kingdom of Hawaii": "Havaí (Governo Provisório)" }, f: { "Kingdom of Hawaii": "h:hawaii" }, o: { "Kingdom of Hawaii": null } }, // monarquia derrubada em 17/jan/1893
    { y: 1788, y1: 1894, r: { "Madagascar": "Reino Merina (protetorado reivindicado pela França)" }, f: { "Madagascar": "blank" }, o: { "Madagascar": null } }, // protetorado desde 1882 (Wikipedia); monarquia até 1897
    { y: 1788, y1: 1893, r: { "Swaziland": "Suazilândia" }, f: { "Swaziland": "blank" }, o: { "Swaziland": null } }, // convenção de dez/1894 a pôs sob o Transvaal
    { y: 1788, y1: 1894, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Taiwan"]] }, // Tratado de Shimonoseki, 17/abr/1895
    { y: 1891, y1: 1892, r: { "Uganda": "Uganda (Cia. Imperial Britânica da África Oriental)" } }, // tratado de 1891 // a companhia saiu em 31/mar/1893; protetorado em 18/jun/1894
    { y: 1788, y1: 1894, r: { "British East Africa": "África Oriental Britânica (Cia. Imperial Britânica da África Oriental)" } }, // protetorado em 1/jul/1895
    { y: 1788, y1: 1894, r: { "French West Africa": "Colônias francesas da África Ocidental" } }, // federação criada em 27/out/1895
    { y: 1788, y1: 1894, r: { "Rhodesia": "Territórios da Companhia Britânica da África do Sul" } }, // nome Rodésia adotado em 1895
    { y: 1788, y1: 1898, r: { "Marshall Islands": "Ilhas Marshall (protetorado alemão)" }, f: { "Marshall Islands": "h:de_emp" }, o: { "Marshall Islands": "Império Alemão" } }, // 1885
    { y: 1899, m: ["Micronésia Alemã", "h:de_emp", ["Micronesia", "Marshall Islands"]] },
    // Axanti: império até a ocupação britânica de jan/1896, protetorado em 1897, colônia anexada à Costa do Ouro em 1/jan/1902
    { y: 1788, y1: 1895, r: { "Ashanti": "Império Axanti" }, f: { "Ashanti": "blank" }, o: { "Ashanti": null } },
    { y: 1896, y1: 1901, r: { "Ashanti": "Axanti (protetorado britânico)" }, f: { "Ashanti": "x:gb" }, o: { "Ashanti": "Reino Unido" } },
    { y: 1902, m: ["Costa do Ouro", "x:gb", ["Gold Coast", "Gold Coast GB", "Ashanti"]] },
    // 1885–1889
    { y: 1788, y1: 1890, r: { "Hail": "Emirado de Jabal Shammar", "Riyadh": "Emirado de Négede", "Qassim": null }, f: { "Hail": "blank", "Riyadh": "blank" }, o: { "Hail": null, "Riyadh": null } },
    { y: 1788, y1: 1888, r: { "Kingdom of Brazil": "Império do Brasil" }, f: { "Kingdom of Brazil": "h:br_emp" }, o: { "Kingdom of Brazil": null } }, // república em 15/nov/1889, bandeira em 19/nov/1889
    { y: 1861, y1: 1885, r: { "Colombia": "Estados Unidos da Colômbia" } }, // República da Colômbia em 1886
    { y: 1788, y1: 1886, r: { "French Indochina": "Cochinchina, Aname, Tonquim e Camboja (França)" } }, // União Indochinesa em 17/out/1887
    { y: 1788, y1: 1886, r: { "Wallis and Futuna Islands": "Wallis e Futuna" }, f: { "Wallis and Futuna Islands": "blank" }, o: { "Wallis and Futuna Islands": null } }, // protetorado em 5/abr/1887
    { y: 1788, y1: 1889, r: { "Zanzibar": "Sultanato de Zanzibar" }, f: { "Zanzibar": "h:zanzibar" }, o: { "Zanzibar": null } }, // protetorado britânico em 1890
    { y: 1788, y1: 1889, r: { "Eritrea": "Possessões italianas do Mar Vermelho" } }, // colônia da Eritreia em 1/jan/1890
    { y: 1788, y1: 1888, r: { "Italian Somaliland": null } }, // protetorados de 1889
    { y: 1788, y1: 1888, r: { "Rhodesia": null, "British Central Africa": null } }, // carta da BSAC em 20/dez/1889; protetorado proclamado em 1889
    { y: 1788, y1: 1887, r: { "British East Africa": null } }, // carta da IBEAC em 6/set/1888
    { y: 1788, y1: 1890, r: { "Uganda": null } },
    { y: 1788, y1: 1892, r: { "Nigeria": "Rios do Petróleo, Lagos e Cia. do Níger (britânicos)" } }, // Costa do Níger desde 12/mai/1893
    // revisão 1880–1884 (mapa de 1900; situação em 31/dez; fontes: Wikipedia). Unidades novas em hist-overrides.json.
    // Bálcãs
    { y: 1878, y1: 1884, r: { "Eastern Rumelia": "Rumélia Oriental (província autônoma otomana)" }, f: { "Eastern Rumelia": "blank" }, o: { "Eastern Rumelia": "Império Otomano" } }, // Tratado de Berlim, 13/jul/1878
    { y: 1885, y1: 1907, m: ["Principado da Bulgária", "x:bg", ["Bulgaria", "Eastern Rumelia"]] }, // união de fato em 6/set/1885
    { y: 1908, m: ["Bulgária", "x:bg", ["Bulgaria", "Eastern Rumelia"]] },
    { y: 1788, y1: 1880, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Thessaly"]] }, // Convenção de Constantinopla, 2/jul/1881
    { y: 1881, m: ["Grécia", "h:gr_cross", ["Greece", "Thessaly"]] },
    // Birmânia
    { y: 1788, y1: 1884, r: { "Upper Burma": "Reino da Birmânia", "Shan States": "Estados Shan" }, f: { "Upper Burma": "blank", "Shan States": "blank" }, o: { "Upper Burma": null, "Shan States": null } }, // anexado em 29/nov/1885
    { y: 1885, m: ["Índia Britânica", "x:gb", ["British Raj", "Upper Burma", "Shan States"]] },
    { y: 1788, y1: 1891, r: { "Karenni": "Estados Karenni" }, f: { "Karenni": "blank" }, o: { "Karenni": null } }, // independência garantida em 1875; tributários da Birmânia Britânica em 1892
    { y: 1892, m: ["Índia Britânica", "x:gb", ["British Raj", "Karenni"]] },
    // Indochina e Sião
    { y: 1788, y1: 1882, r: { "French Indochina": "Đại Nam (Vietnã)" }, f: { "French Indochina": "blank" }, o: { "French Indochina": null } },
    { y: 1883, y1: 1884, r: { "French Indochina": "Aname e Tonquim (protetorado francês)" }, f: { "French Indochina": "x:fr" }, o: { "French Indochina": "França" } }, // Tratado Harmand, 25/ago/1883; Patenôtre, 6/jun/1884
    { y: 1788, y1: 1884, r: { "Cochinchina": "Cochinchina Francesa", "Cambodia": "Camboja (protetorado francês)" }, f: { "Cochinchina": "x:fr", "Cambodia": "x:fr" }, o: { "Cochinchina": "França", "Cambodia": "França" } },
    { y: 1885, y1: 1886, m: ["Cochinchina, Aname, Tonquim e Camboja (França)", "x:fr", ["French Indochina", "Cochinchina", "Western Cochinchina", "Cambodia"]], o: { "French Indochina": "França" } },
    { y: 1887, m: ["Indochina Francesa", "x:fr", ["French Indochina", "Cochinchina", "Western Cochinchina", "Cambodia"]], o: { "French Indochina": "França" } },
    { y: 1788, y1: 1892, m: ["Sião", "h:th_el", ["Rattanakosin Kingdom", "Siamese Laos", "Sainyabuli", "Inner Cambodia"]] }, // margem leste do Mekong cedida em 3/out/1893
    { y: 1893, m: ["Indochina Francesa", "x:fr", ["French Indochina", "Siamese Laos"]] },
    { y: 1893, y1: 1903, m: ["Sião", "h:th_el", ["Rattanakosin Kingdom", "Sainyabuli", "Inner Cambodia"]] }, // margem direita cedida pelo tratado de 13/fev/1904
    { y: 1904, m: ["Indochina Francesa", "x:fr", ["French Indochina", "Sainyabuli"]] },
    { y: 1904, y1: 1906, m: ["Sião", "h:th_el", ["Rattanakosin Kingdom", "Inner Cambodia"]] }, // Battambang, Siem Reap e Sisophon cedidas em 23/mar/1907
    { y: 1907, m: ["Indochina Francesa", "x:fr", ["French Indochina", "Inner Cambodia"]] },
    // Malásia e Bornéu
    { y: 1788, y1: 1908, r: { "Siamese Malay States": "Kedah, Perlis, Kelantan e Terengganu (tributários do Sião)" }, f: { "Siamese Malay States": "blank" }, o: { "Siamese Malay States": null } }, // Tratado Anglo-Siamês, 10/mar/1909
    { y: 1909, m: ["Malaia", "x:gb", ["Malaya", "Siamese Malay States"]] },
    { y: 1788, y1: 1887, r: { "Sarawak": "Raj de Sarawak" }, f: { "Sarawak": "blank" }, o: { "Sarawak": null } },
    { y: 1888, r: { "Sarawak": "Sarawak (protetorado britânico)" }, f: { "Sarawak": "blank" }, o: { "Sarawak": null } }, // 14/jun/1888
    { y: 1788, y1: 1880, r: { "North Borneo": null } }, // carta régia de 1/nov/1881
    { y: 1881, y1: 1887, r: { "North Borneo": "Bornéu do Norte (Cia. Britânica de Bornéu do Norte)" }, f: { "North Borneo": "blank" }, o: { "North Borneo": null } },
    { y: 1888, r: { "North Borneo": "Bornéu do Norte (protetorado britânico)" }, f: { "North Borneo": "blank" }, o: { "North Borneo": null } }, // 12/mai/1888
    // Ásia Central
    { y: 1788, y1: 1880, r: { "Ahal": null } }, // Geok Tepe tomada em 1881
    { y: 1881, m: ["Império Russo", "x:ru", ["Russian Empire", "Ahal"]] },
    { y: 1788, y1: 1883, r: { "Merv": null } }, // oásis ocupado em 1884
    { y: 1884, m: ["Império Russo", "x:ru", ["Russian Empire", "Merv"]] },
    { y: 1788, y1: 1882, f: { "Korea": "blank" } }, // taegukgi promulgada em 27/jan/1883
    // Guerra do Pacífico
    { y: 1788, y1: 1883, r: { "Tacna and Arica": "Tacna e Arica (ocupadas pelo Chile)", "Tarapaca": "Tarapacá (ocupada pelo Chile)" }, f: { "Tacna and Arica": "x:cl", "Tarapaca": "x:cl" }, o: { "Tacna and Arica": null, "Tarapaca": null } },
    { y: 1884, r: { "Tacna and Arica": "Tacna e Arica (administração chilena)" }, f: { "Tacna and Arica": "x:cl" }, o: { "Tacna and Arica": null } }, // Tratado de Ancón (20/out/1883, ratificado em 1884); Tacna voltou ao Peru em 1929
    { y: 1884, m: ["Chile", "x:cl", ["Chile", "Tarapaca"]] },
    { y: 1788, y1: 1883, r: { "Bolivian Litoral": "Litoral boliviano (ocupado pelo Chile)" }, f: { "Bolivian Litoral": "x:cl" }, o: { "Bolivian Litoral": null } },
    { y: 1884, y1: 1904, r: { "Bolivian Litoral": "Litoral boliviano (administração chilena)" }, f: { "Bolivian Litoral": "x:cl" }, o: { "Bolivian Litoral": null } }, // trégua de Valparaíso, 4/abr/1884; tratado de 20/out/1904, ratificado em 10/mar/1905
    { y: 1905, m: ["Chile", "x:cl", ["Chile", "Bolivian Litoral"]] },
    { y: 1881, y1: 1882, r: { "Lima": "Lima (ocupada pelo Chile)" }, f: { "Lima": "x:cl" }, o: { "Lima": null } }, // 17/jan/1881 a 23/out/1883
    { y: 1788, y1: 1880, m: ["Peru", "x:pe", ["Peru", "Lima"]] },
    { y: 1883, m: ["Peru", "x:pe", ["Peru", "Lima"]] },
    // África
    { y: 1788, y1: 1881, o: { "Egypt": null } }, // ocupação britânica em set/1882
    { y: 1874, y1: 1882, m: ["Sudão Egípcio", "h:eg_khed", ["Anglo-Egyptian Sudan", "Darfur"]], o: { "Anglo-Egyptian Sudan": "Quedivato do Egito" } },
    { y: 1883, y1: 1884, m: ["Sudão (Guerra Mahdista)", "blank", ["Anglo-Egyptian Sudan", "Darfur"]], o: { "Anglo-Egyptian Sudan": null } }, // Hicks destruído em nov/1883; Cartum caiu em 26/jan/1885
    { y: 1788, y1: 1880, r: { "Tunisia": "Beilhique de Túnis" }, f: { "Tunisia": "x:tn" }, o: { "Tunisia": null } }, // Tratado do Bardo, 12/mai/1881
    { y: 1788, y1: 1880, r: { "Transvaal": "Transvaal (Primeira Guerra dos Bôeres)" }, f: { "Transvaal": "blank" }, o: { "Transvaal": null } }, // anexado em 1877; guerra desde 16/dez/1880
    { y: 1881, y1: 1883, r: { "Transvaal": "Transvaal (República Sul-Africana, suserania britânica)" }, f: { "Transvaal": "h:transvaal" }, o: { "Transvaal": null } }, // Convenção de Pretória, 3/ago/1881; de Londres, 1884
    { y: 1788, y1: 1867, r: { "Basutoland": "Reino Basoto" }, f: { "Basutoland": "blank" }, o: { "Basutoland": null } },
    { y: 1868, y1: 1870, r: { "Basutoland": "Basutolândia (protetorado britânico)" }, f: { "Basutoland": "x:gb" }, o: { "Basutoland": "Reino Unido" } }, // proclamação de 12/mar/1868
    { y: 1871, y1: 1883, r: { "Basutoland": "Basutolândia (Colônia do Cabo)" }, f: { "Basutoland": "x:gb" }, o: { "Basutoland": "Colônia do Cabo" } }, // colônia da coroa em 18/mar/1884
    { y: 1788, y1: 1884, r: { "Bechuanaland": null } }, // protetorado em 31/mar/1885
    { y: 1788, y1: 1882, r: { "Madagascar": "Reino Merina" }, f: { "Madagascar": "blank" }, o: { "Madagascar": null } },
    { y: 1883, y1: 1884, r: { "Madagascar": "Reino Merina (Guerra Franco-Hova)" }, f: { "Madagascar": "blank" }, o: { "Madagascar": null } }, // dez/1883 a 17/dez/1885
    { y: 1788, y1: 1883, r: { "Togoland": null, "Kamerun": null, "German South-West Africa": null, "Papua New Guinea": null, "Papua": null, "British Somaliland": null, "Rio de Oro": null, "Nigeria": null, "Congo Free State": null } }, // protetorados de 1884
    { y: 1884, y1: 1884, r: { "Congo Free State": "Associação Internacional do Congo" }, f: { "Congo Free State": "blank" }, o: { "Congo Free State": null } }, // reconhecida pela Alemanha em 8/nov/1884; Estado Livre em 1885
    { y: 1788, y1: 1884, r: { "German East Africa": null, "Marshall Islands": null, "Eritrea": null } }, // 1885 (Assab italiana e Massaua egípcia até 1885)
    { y: 1788, y1: 1861, r: { "French Somaliland": null } },
    { y: 1862, y1: 1883, r: { "French Somaliland": "Obock (França)" } }, // colônia estabelecida em 20/mai/1884
    // revisão 1878–1879 (após o Congresso de Berlim, 13/jul/1878)
    { y: 1788, y1: 1878, r: { "Bulgaria": "Principado da Bulgária (administração provisória russa)", "Eastern Rumelia": "Rumélia Oriental (administração provisória russa)" },
      f: { "Bulgaria": "blank", "Eastern Rumelia": "blank" }, o: { "Bulgaria": null, "Eastern Rumelia": null } }, // até jun/1879; bandeira de 1879
    { y: 1877, y1: 1879, r: { "Transvaal": "Transvaal (anexado pelo Reino Unido)" }, f: { "Transvaal": "x:gb" }, o: { "Transvaal": "Reino Unido" } }, // 12/abr/1877; Vierkleur suspensa até ago/1881
    { y: 1872, y1: 1878, r: { "Ryukyu": "Domínio de Ryukyu" }, f: { "Ryukyu": "blank" }, o: { "Ryukyu": "Império do Japão" } }, // domínio desde 1872; Prefeitura de Okinawa em 1879
    { y: 1879, m: ["Império do Japão", "x:jp", ["Imperial Japan", "Ryukyu"]] },
    { y: 1788, y1: 1879, r: { "French Polynesia": "Reino do Taiti (protetorado francês)" }, f: { "French Polynesia": "blank" }, o: { "French Polynesia": "França" } }, // anexado em 29/jun/1880
    { y: 1880, r: { "French Polynesia": "Estabelecimentos Franceses da Oceania" }, f: { "French Polynesia": "x:fr" }, o: { "French Polynesia": "França" } },
    { y: 1878, y1: 1879, r: { "Afghanistan": "Afeganistão (Segunda Guerra Anglo-Afegã)" }, o: { "Afghanistan": null } }, // nov/1878 a 1881; Cabul ocupada em out/1879
    { y: 1788, y1: 1896, f: { "Afghanistan": "blank" } }, // bandeira negra com emblema introduzida em 1897
    { y: 1788, y1: 1879, m: ["Peru", "x:pe", ["Peru", "Tacna and Arica"]] },
    { y: 1788, y1: 1878, m: ["Peru", "x:pe", ["Peru", "Tarapaca"]] }, // campanha de Tarapacá, nov–dez/1879
    ...yearly(1825, 1835, "Bolívia", "Bolivia", ["Bolivia", "Bolivian Litoral"]),
    ...yearly(1839, 1878, "Bolívia", "Bolivia", ["Bolivia", "Bolivian Litoral"]), // independência em 6/ago/1825; bandeira só em 1851
    { y: 1811, y1: 1824, m: ["Alto Peru (realistas)", "x:es", ["Bolivia", "Bolivian Litoral"]], o: { "Bolivia": "Espanha" } }, // Olañeta até abr/1825 // Antofagasta ocupada em 14/fev/1879
    // revisão 1871–1877 (antes do Congresso de Berlim; fontes: Wikipedia)
    { y: 1788, y1: 1876, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Bulgaria", "Eastern Rumelia", "Bosnia-Herzegovina", "Cyprus", "Serbia 1878 gains", "Montenegro 1878 gains", "Niksic", "Northern Dobruja", "Kars Oblast", "Adjara"]] },
    { y: 1877, y1: 1877, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Bosnia-Herzegovina", "Cyprus", "Serbia 1878 gains", "Montenegro 1878 gains", "Northern Dobruja", "Adjara"]] }, // Guerra Russo-Turca desde 24/abr/1877
    { y: 1877, y1: 1877, m: ["Bulgária (Guerra Russo-Turca)", "blank", ["Bulgaria", "Eastern Rumelia"]], o: { "Bulgaria": null } }, // Plevna caiu em 10/dez/1877
    { y: 1877, y1: 1877, r: { "Kars Oblast": "Kars e Ardahan (ocupados pela Rússia)" }, f: { "Kars Oblast": "x:ru" }, o: { "Kars Oblast": null } }, // Kars caiu em 18/nov/1877
    { y: 1877, y1: 1877, m: ["Principado de Montenegro", "blank", ["Montenegro", "Niksic"]] }, // Nikšić tomada em 24/set/1877
    { y: 1878, m: ["Principado de Montenegro", "blank", ["Montenegro", "Niksic", "Montenegro 1878 gains"]] }, // Nikšić, Kolašin, Podgorica, Bar etc.
    { y: 1788, y1: 1879, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Ulcinj"]] }, // Ulcinj entregue a Montenegro em nov/1880
    { y: 1880, m: ["Principado de Montenegro", "blank", ["Montenegro", "Ulcinj"]] },
    { y: 1878, m: ["Sérvia", "h:rs_old", ["Serbia", "Serbia 1878 gains"]] }, // distritos de Niš, Pirot, Toplica e Vranje
    { y: 1788, y1: 1877, f: { "Serbia": "blank" } }, // tricolor com brasão e quatro estrelas (suserania otomana) até 1878
    { y: 1878, m: ["Romênia", "x:ro", ["Romania", "Northern Dobruja"]] },
    { y: 1856, y1: 1877, m: ["Romênia", "x:ro", ["Romania", "Southern Bessarabia"]] }, // sul da Bessarábia moldava/romena de 1856 a 1878
    { y: 1878, m: ["Império Russo", "x:ru", ["Russian Empire", "Adjara"]] },
    { y: 1788, y1: 1876, r: { "Transvaal": "Transvaal (República Sul-Africana)" }, f: { "Transvaal": "h:transvaal" }, o: { "Transvaal": null } },
    { y: 1874, y1: 1874, f: { "Transvaal": "blank" } }, // bandeira de Burgers, 24/out/1874 a 10/mai/1875
    { y: 1788, y1: 1871, r: { "Ryukyu": "Reino de Ryukyu" }, f: { "Ryukyu": "blank" }, o: { "Ryukyu": null } }, // tributário da China e vassalo de Satsuma; domínio em 16/out/1872
    { y: 1788, y1: 1870, r: { "Fiji": null } },
    { y: 1871, y1: 1873, r: { "Fiji": "Reino de Fiji" }, f: { "Fiji": "blank" }, o: { "Fiji": null } }, // 5/jun/1871 a 10/out/1874
    { y: 1788, y1: 1872, r: { "Prince Edward Island": "Ilha do Príncipe Eduardo" }, f: { "Prince Edward Island": "x:gb" }, o: { "Prince Edward Island": "Reino Unido" } }, // Confederação em 1/jul/1873
    { y: 1873, m: ["Canadá", "h:ca_red", ["Canada", "Prince Edward Island"]] },
    { y: 1864, y1: 1876, r: { "Xinjiang": "Yettishar (Emirado de Kashgar)" }, f: { "Xinjiang": "blank" }, o: { "Xinjiang": null } }, // Kashgar retomada pelos Qing em 18/dez/1877
    { y: 1877, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Xinjiang"]] },
    { y: 1788, y1: 1875, r: { "Kokand": "Canato de Kokand" }, f: { "Kokand": "blank" }, o: { "Kokand": null } }, // abolido pela Rússia em 1876
    { y: 1876, m: ["Império Russo", "x:ru", ["Russian Empire", "Kokand"]] },
    { y: 1788, y1: 1872, r: { "Khiva": "Canato de Khiva" }, f: { "Khiva": "blank" }, o: { "Khiva": null } }, // protetorado russo em 12/ago/1873
    { y: 1873, r: { "Khiva": "Canato de Khiva (protetorado russo)" }, f: { "Khiva": "blank" }, o: { "Khiva": null } },
    { y: 1788, y1: 1873, r: { "Aceh": "Sultanato de Aceh" }, f: { "Aceh": "blank" }, o: { "Aceh": null } }, // Banda Aceh tomada em jan/1874
    { y: 1874, m: ["Índias Orientais Holandesas", "x:nl", ["Netherlands Indies", "Aceh"]] },
    { y: 1788, y1: 1866, r: { "Anglo-Egyptian Sudan": "Sudão Egípcio" }, f: { "Anglo-Egyptian Sudan": "h:eg_khed" }, o: { "Anglo-Egyptian Sudan": "Egito (eialete otomano)" } },
    { y: 1867, y1: 1873, r: { "Anglo-Egyptian Sudan": "Sudão Egípcio" }, f: { "Anglo-Egyptian Sudan": "h:eg_khed" }, o: { "Anglo-Egyptian Sudan": "Quedivato do Egito" } }, // Darfur conquistado em 1874
    { y: 1788, y1: 1879, r: { "French Congo": null, "Gabon": "Gabão (França)" }, f: { "Gabon": "x:fr" }, o: { "Gabon": "França" } }, // protetorado do Congo em 10/set/1880
    { y: 1880, m: ["Congo Francês", "x:fr", ["French Congo", "Gabon", "Gabon FR"]] },
    // revisão 1867–1870
    { y: 1867, y1: 1870, r: { "Germany": "Confederação da Alemanha do Norte" }, f: { "Germany": "blank" }, o: { "Germany": null } }, // 1/jul/1867 a 31/dez/1870
    { y: 1867, y1: 1870, r: { "Kingdom of Bavaria": "Reino da Baviera", "Kingdom of Württemberg": "Reino de Württemberg", "Grand Duchy of Baden": "Grão-Ducado de Baden", "Grand Duchy of Hesse": "Grão-Ducado de Hesse" },
      f: { "Kingdom of Bavaria": "blank", "Kingdom of Württemberg": "blank", "Grand Duchy of Baden": "blank", "Grand Duchy of Hesse": "blank" },
      o: { "Kingdom of Bavaria": null, "Kingdom of Württemberg": null, "Grand Duchy of Baden": null, "Grand Duchy of Hesse": null } }, // Tratados de Novembro de 1870, em vigor em 1/jan/1871; o Alto Hesse já era da Confederação
    { y: 1867, y1: 1870, m: ["Confederação da Alemanha do Norte", "blank", ["Germany", ...NORTH1866]] },
    { y: 1871, m: ["Império Alemão", "h:de_emp", ["Germany", ...NORTH1866, "Kingdom of Bavaria", "Kingdom of Württemberg", "Grand Duchy of Baden", "Grand Duchy of Hesse", "Alsace-Lorraine"]] }, // Tratado de Frankfurt, 10/mai/1871
    { y: 1788, y1: 1869, m: ["França", "x:fr", ["France", "Alsace-Lorraine"]] },
    { y: 1870, y1: 1870, r: { "Alsace-Lorraine": "Alsácia-Lorena (Guerra Franco-Prussiana)" }, f: { "Alsace-Lorraine": "blank" }, o: { "Alsace-Lorraine": null } },
    { y: 1788, y1: 1869, r: { "Papal States": "Estados Papais" }, f: { "Papal States": "blank" }, o: { "Papal States": null } }, // Roma tomada em 20/set/1870
    { y: 1870, m: ["Reino da Itália", "h:it_sav", ["Italy", "Papal States"]] },
    { y: 1867, y1: 1869, r: { "Rupert's Land": "Terra de Rupert (Cia. da Baía de Hudson)" }, f: { "Rupert's Land": "x:gb" }, o: { "Rupert's Land": "Reino Unido" } }, // transferida ao Canadá em 15/jul/1870
    { y: 1870, m: ["Canadá", "h:ca_red", ["Canada", "Rupert's Land"]] },
    { y: 1788, y1: 1870, r: { "British Columbia": "Colônia da Colúmbia Britânica" }, f: { "British Columbia": "x:gb" }, o: { "British Columbia": "Reino Unido" } }, // província em 20/jul/1871
    { y: 1871, m: ["Canadá", "h:ca_red", ["Canada", "British Columbia"]] },
    { y: 1864, y1: 1868, r: { "Paraguay": "Paraguai (Guerra do Paraguai)" } },
    { y: 1869, y1: 1869, r: { "Paraguay": "Paraguai (Guerra do Paraguai, Assunção ocupada)" } }, // Assunção ocupada em 1/jan/1869; López morto em 1/mar/1870
    { y: 1867, y1: 1867, m: ["Império do Japão", "x:jp", ["Imperial Japan", "Ezo"]] },
    { y: 1868, y1: 1868, r: { "Ezo": "Ezo (forças do antigo xogunato)" }, f: { "Ezo": "blank" }, o: { "Ezo": null } }, // Hakodate tomada em dez/1868; República de Ezo de jan a jun/1869
    { y: 1869, m: ["Império do Japão", "x:jp", ["Imperial Japan", "Ezo"]] },
    { y: 1788, y1: 1872, r: { "Bukhara": "Emirado de Bukhara" }, f: { "Bukhara": "blank" }, o: { "Bukhara": null } },
    { y: 1873, r: { "Bukhara": "Emirado de Bukhara (protetorado russo)" }, f: { "Bukhara": "blank" }, o: { "Bukhara": null } }, // 1873
    { y: 1788, y1: 1867, m: ["Emirado de Bukhara", "blank", ["Bukhara", "Samarkand"]] },
    { y: 1868, m: ["Império Russo", "x:ru", ["Russian Empire", "Samarkand"]] }, // Samarcanda anexada em 1868
    // revisão 1861–1866 (fontes: Wikipedia)
    { y: 1788, y1: 1865, r: { "Germany": "Reino da Prússia" }, f: { "Germany": "blank" }, o: { "Germany": null } },
    { y: 1788, y1: 1866, r: { "Kingdom of Bavaria": "Reino da Baviera", "Kingdom of Württemberg": "Reino de Württemberg", "Grand Duchy of Baden": "Grão-Ducado de Baden", "Grand Duchy of Hesse": "Grão-Ducado de Hesse",
      "Kingdom of Saxony": "Reino da Saxônia", "Mecklenburg-Schwerin": "Grão-Ducado de Mecklemburgo-Schwerin", "Mecklenburg-Strelitz": "Grão-Ducado de Mecklemburgo-Strelitz", "Grand Duchy of Oldenburg": "Grão-Ducado de Oldemburgo",
      "Duchy of Brunswick": "Ducado de Brunsvique", "Thuringian states": "Estados da Turíngia", "Anhalt": "Anhalt", "Lippe": "Principado de Lippe", "Schaumburg-Lippe": "Principado de Schaumburg-Lippe", "Waldeck": "Principado de Waldeck",
      "Free City of Hamburg": "Cidade Livre de Hamburgo", "Free City of Bremen": "Cidade Livre de Bremen", "Free City of Lübeck": "Cidade Livre de Lübeck" },
      f: { "Kingdom of Bavaria": "blank", "Kingdom of Württemberg": "blank", "Grand Duchy of Baden": "blank", "Grand Duchy of Hesse": "blank", "Kingdom of Saxony": "blank", "Mecklenburg-Schwerin": "blank", "Mecklenburg-Strelitz": "blank",
      "Grand Duchy of Oldenburg": "blank", "Duchy of Brunswick": "blank", "Thuringian states": "blank", "Anhalt": "blank", "Lippe": "blank", "Schaumburg-Lippe": "blank", "Waldeck": "blank", "Free City of Hamburg": "blank", "Free City of Bremen": "blank", "Free City of Lübeck": "blank" },
      o: { "Kingdom of Bavaria": null, "Kingdom of Württemberg": null, "Grand Duchy of Baden": null, "Grand Duchy of Hesse": null, "Kingdom of Saxony": null, "Mecklenburg-Schwerin": null, "Mecklenburg-Strelitz": null, "Grand Duchy of Oldenburg": null,
      "Duchy of Brunswick": null, "Thuringian states": null, "Anhalt": null, "Lippe": null, "Schaumburg-Lippe": null, "Waldeck": null, "Free City of Hamburg": null, "Free City of Bremen": null, "Free City of Lübeck": null } }, // Confederação Germânica até 1866
    { y: 1788, y1: 1865, r: { "Kingdom of Hanover": "Reino de Hanôver", "Electorate of Hesse": "Eleitorado de Hesse", "Duchy of Nassau": "Ducado de Nassau" }, f: { "Kingdom of Hanover": "blank", "Electorate of Hesse": "blank", "Duchy of Nassau": "blank" },
      o: { "Kingdom of Hanover": null, "Electorate of Hesse": null, "Duchy of Nassau": null } }, // anexados pela Prússia em 1866
    { y: 1866, y1: 1866, m: ["Reino da Prússia", "blank", ["Germany", "Kingdom of Hanover", "Electorate of Hesse", "Duchy of Nassau", "Duchy of Schleswig", "Duchy of Holstein"]], o: { "Germany": null } }, // Guerra Austro-Prussiana, 14/jun a 22/jul/1866; Paz de Praga, 23/ago/1866
    { y: 1788, y1: 1863, r: { "Duchy of Schleswig": "Ducado de Schleswig (Dinamarca)", "Duchy of Holstein": "Ducado de Holstein (Dinamarca)" }, f: { "Duchy of Schleswig": "x:dk", "Duchy of Holstein": "x:dk" },
      o: { "Duchy of Schleswig": "Dinamarca", "Duchy of Holstein": "Dinamarca" } }, // Segunda Guerra do Schleswig, 1/fev a 30/out/1864
    { y: 1864, y1: 1864, m: ["Schleswig-Holstein (condomínio austro-prussiano)", "blank", ["Duchy of Schleswig", "Duchy of Holstein"]], o: { "Duchy of Schleswig": null } }, // Tratado de Viena, 30/out/1864
    { y: 1865, y1: 1865, r: { "Duchy of Schleswig": "Schleswig (administração prussiana)", "Duchy of Holstein": "Holstein (administração austríaca)" }, f: { "Duchy of Schleswig": "blank", "Duchy of Holstein": "blank" },
      o: { "Duchy of Schleswig": null, "Duchy of Holstein": null } }, // Convenção de Gastein, 14/ago/1865
    { y: 1813, y1: 1845, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "_null_154", "Bay of Kotor"]] },
    { y: 1846, y1: 1866, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "_null_154", "Bay of Kotor", "Kraków"]] }, // Compromisso de 1867
    { y: 1814, y1: 1847, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Venetia", "Venice"]] },
    { y: 1848, y1: 1848, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Venetia"]] }, // Veneza (República de San Marco) até 22/ago/1849
    { y: 1849, y1: 1865, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Venetia", "Venice"]] }, // Vêneto e Mântua entregues à Itália em 19/out/1866
    { y: 1866, m: ["Reino da Itália", "h:it_sav", ["Italy", "Venetia", "Venice"]] },
    { y: 1815, y1: 1863, r: { "Ionian Islands": "Estados Unidos das Ilhas Jônicas (protetorado britânico)" }, f: { "Ionian Islands": "x:gb" }, o: { "Ionian Islands": null } }, // unidas à Grécia em mai–jun/1864
    { y: 1864, m: ["Grécia", "h:gr_cross", ["Greece", "Ionian Islands"]] },
    { y: 1788, y1: 1861, r: { "Romania": "Principados Unidos da Moldávia e Valáquia" }, f: { "Romania": "h:ro_up" } }, // união pessoal em fev/1859; formal em fev/1862
    { y: 1862, y1: 1865, r: { "Romania": "Principados Unidos (Romênia)" }, f: { "Romania": "h:ro_up" } }, // nome Romênia pela constituição de jul/1866
    { y: 1866, y1: 1866, f: { "Romania": "h:ro_up" } }, // faixas verticais desde 26/mar/1867
    { y: 1788, y1: 1866, r: { "Egypt": "Egito (eialete otomano)" }, o: { "Egypt": null } }, // título de quediva em 8/jun/1867
    { y: 1788, y1: 1864, r: { "Confederate States": "Estados Confederados da América" }, f: { "Confederate States": "blank" }, o: { "Confederate States": null } }, // 8/fev/1861 a mai/1865
    { y: 1865, y1: 1866, m: ["Estados Unidos", "h:us36", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1867, y1: 1876, m: ["Estados Unidos", "h:us37", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1877, y1: 1889, m: ["Estados Unidos", "h:us38", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1890, y1: 1890, m: ["Estados Unidos", "h:us43", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1891, y1: 1895, m: ["Estados Unidos", "h:us44", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1896, y1: 1907, m: ["Estados Unidos", "h:us45", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1908, y1: 1911, m: ["Estados Unidos", "h:us46", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1912, y1: 1912, m: ["Estados Unidos", "h:us48", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1788, y1: 1866, r: { "Russian America": "América Russa" }, f: { "Russian America": "x:ru" }, o: { "Russian America": "Império Russo" } }, // transferida aos EUA em 18/out/1867
    { y: 1867, y1: 1876, m: ["Estados Unidos", "h:us37", ["United States of America", "Russian America"]] },
    { y: 1877, y1: 1889, m: ["Estados Unidos", "h:us38", ["United States of America", "Russian America"]] },
    { y: 1890, y1: 1890, m: ["Estados Unidos", "h:us43", ["United States of America", "Russian America"]] },
    { y: 1891, y1: 1895, m: ["Estados Unidos", "h:us44", ["United States of America", "Russian America"]] },
    { y: 1896, y1: 1907, m: ["Estados Unidos", "h:us45", ["United States of America", "Russian America"]] },
    { y: 1908, y1: 1911, m: ["Estados Unidos", "h:us46", ["United States of America", "Russian America"]] },
    { y: 1912, y1: 1912, m: ["Estados Unidos", "h:us48", ["United States of America", "Russian America"]] },
    { y: 1788, y1: 1866, r: { "Canada": "Província do Canadá", "Nova Scotia": "Nova Escócia", "New Brunswick": "Nova Brunswick" }, f: { "Canada": "x:gb", "Nova Scotia": "x:gb", "New Brunswick": "x:gb" },
      o: { "Canada": "Reino Unido", "Nova Scotia": "Reino Unido", "New Brunswick": "Reino Unido" } }, // Confederação em 1/jul/1867
    { y: 1867, m: ["Canadá", "h:ca_red", ["Canada", "Nova Scotia", "New Brunswick"]] },
    { y: 1867, y1: 1867, f: { "Canada": "x:gb" } },
    { y: 1788, y1: 1865, r: { "British Columbia": "Colônias da Colúmbia Britânica e da Ilha de Vancouver" }, f: { "British Columbia": "x:gb" }, o: { "British Columbia": "Reino Unido" } }, // unidas em 1866
    { y: 1788, y1: 1861, r: { "Mexico": "México" } },
    { y: 1862, y1: 1862, r: { "Mexico": "México (intervenção francesa)" } }, // tropas francesas desde dez/1861
    { y: 1863, y1: 1863, r: { "Mexico": "México (intervenção francesa; Regência do Império)" }, f: { "Mexico": "blank" } }, // Cidade do México tomada em jun/1863; regência em 11/jul/1863
    { y: 1864, y1: 1866, r: { "Mexico": "Segundo Império Mexicano" }, f: { "Mexico": "blank" }, o: { "Mexico": null } }, // Maximiliano aceitou a coroa em 10/abr/1864; fuzilado em 19/jun/1867
    { y: 1788, y1: 1862, r: { "Dominican Republic": "São Domingos (Espanha)" }, f: { "Dominican Republic": "x:es" }, o: { "Dominican Republic": "Espanha" } }, // anexação anunciada em 18/mar/1861
    { y: 1863, y1: 1864, r: { "Dominican Republic": "São Domingos (Guerra da Restauração)" }, f: { "Dominican Republic": "blank" }, o: { "Dominican Republic": null } }, // 16/ago/1863 a 15/jul/1865
    { y: 1788, y1: 1866, m: ["Japão (xogunato Tokugawa)", "x:jp", ["Imperial Japan", "Ezo"]] },
    { y: 1867, y1: 1867, r: { "Imperial Japan": "Japão (xogunato Tokugawa)" } }, // Restauração Meiji em 3/jan/1868
    { y: 1788, y1: 1866, m: ["Đại Nam (Vietnã)", "blank", ["French Indochina", "Western Cochinchina"]] }, // províncias ocidentais anexadas pela França em 1867
    { y: 1788, y1: 1861, r: { "Cochinchina": "Cochinchina (ocupação francesa)" }, o: { "Cochinchina": null } }, // Tratado de Saigon, 5/jun/1862
    { y: 1867, y1: 1884, m: ["Cochinchina Francesa", "x:fr", ["Cochinchina", "Western Cochinchina"]] },
    { y: 1788, y1: 1862, r: { "Cambodia": "Camboja (vassalo do Sião)" }, f: { "Cambodia": "blank" }, o: { "Cambodia": null } }, // protetorado francês em 11/ago/1863
    { y: 1788, y1: 1862, r: { "Herat": "Emirado de Herat" }, f: { "Herat": "blank" }, o: { "Herat": null } }, // tomado pelos Barakzai em 27/mai/1863
    { y: 1863, m: ["Afeganistão", "blank", ["Afghanistan", "Herat"]] },
    { y: 1788, y1: 1863, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Xinjiang"]] }, // Yettishar desde 12/nov/1864
    // erros do mapa de 1900 corrigidos para 1878–1912
    { y: 1815, y1: 1827, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Bessarabia", "Congress Poland"]] },
    { y: 1828, y1: 1829, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Bessarabia", "Erivan", "Congress Poland"]] }, // Turkmenchay, 2/fev/1828
    { y: 1830, y1: 1830, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Bessarabia", "Erivan"]] }, // Revolta de Novembro, 29/nov/1830
    { y: 1831, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Bessarabia", "Erivan", "Congress Poland"]] },
    { y: 1878, m: ["Império Russo", "x:ru", ["Russian Empire", "Kars Oblast", "Southern Bessarabia"]] }, // Cáucaso russo desde Gulistão (1813) e Turkmenchay (1828); Kars e Ardahan pelo Tratado de Berlim; Bessarábia desde 1812
    { y: 1867, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "Bay of Kotor", "Kraków"]] }, // Boca de Kotor na Dalmácia austríaca até 1918
    // revisão 1856–1860 (situação em 31/dez)
    // Itália
    { y: 1788, y1: 1860, r: { "Italy": "Reino da Sardenha" }, f: { "Italy": "h:it_sav" }, o: { "Italy": null } },
    { y: 1814, y1: 1859, m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Savoy and Nice"]] },
    { y: 1814, y1: 1858, m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Lombardy"]] }, // Reino Lombardo-Vêneto
    { y: 1788, y1: 1858, r: { "Duchy of Parma": "Ducado de Parma", "Duchy of Modena": "Ducado de Módena", "Tuscany": "Grão-Ducado da Toscana" }, f: { "Duchy of Parma": "blank", "Duchy of Modena": "blank", "Tuscany": "blank" }, o: { "Duchy of Parma": null, "Duchy of Modena": null, "Tuscany": null } },
    { y: 1814, y1: 1858, m: ["Estados Papais", "blank", ["Papal States", "Romagna", "Marche and Umbria"]] },
    { y: 1859, y1: 1859, m: ["Estados Papais", "blank", ["Papal States", "Marche and Umbria"]] },
    { y: 1859, y1: 1859, m: ["Províncias Unidas da Itália Central", "blank", ["Tuscany", "Duchy of Parma", "Duchy of Modena", "Romagna"]], o: { "Tuscany": null } }, // Toscana, Parma, Módena e Legações papais, dez/1859
    { y: 1788, y1: 1859, r: { "Two Sicilies": "Reino das Duas Sicílias" }, f: { "Two Sicilies": "blank" }, o: { "Two Sicilies": null } }, // Gaeta resistiu até fev/1861 (não mostrado)
    // Moldávia e Valáquia (vassalos otomanos); sul da Bessarábia moldavo pelo Tratado de Paris (1856)
    { y: 1788, y1: 1858, r: { "Romania": "Principado da Moldávia", "Wallachia": "Principado da Valáquia" }, f: { "Romania": "blank", "Wallachia": "blank" }, o: { "Romania": null, "Wallachia": null } },
    // Extremo Oriente
    { y: 1788, y1: 1857, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Amur", "Ussuri"]] },
    { y: 1858, y1: 1859, r: { "Ussuri": "Região do Ussuri (condomínio russo-chinês)" }, f: { "Ussuri": "blank" }, o: { "Ussuri": null } }, // Aigun: administração conjunta até a Convenção de Pequim
    { y: 1788, y1: 1874, r: { "Sakhalin": "Sacalina (indivisa entre Rússia e Japão)" }, f: { "Sakhalin": "blank" }, o: { "Sakhalin": null } }, // Shimoda (1855) não definiu Sacalina
    // Estados Unidos (bandeira de 31, 32 e 33 estrelas)
    { y: 1851, y1: 1857, m: ["Estados Unidos", "h:us31", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1858, y1: 1858, m: ["Estados Unidos", "h:us32", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] },
    { y: 1859, y1: 1860, m: ["Estados Unidos", "h:us33", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]] }, // Carolina do Sul declarou secessão em 20/dez/1860 (Confederação só em fev/1861)
    { y: 1788, y1: 1857, r: { "British Columbia": "Ilha de Vancouver e Nova Caledônia (britânicas)" }, f: { "British Columbia": "x:gb" }, o: { "British Columbia": "Reino Unido" } }, // colônia da Colúmbia Britânica em ago/1858
    { y: 1858, y1: 1859, r: { "Mexico": "México (Guerra da Reforma)" } }, // liberais vencem em Calpulalpan, 22/dez/1860
    { y: 1788, y1: 1860, r: { "Dominican Republic": "República Dominicana" }, f: { "Dominican Republic": "blank" }, o: { "Dominican Republic": null } },
    { y: 1849, y1: 1858, r: { "Haiti": "Império do Haiti" } }, // Faustin I abdicou em 15/jan/1859
    { y: 1831, y1: 1857, r: { "Colombia": "República de Nova Granada" }, f: { "Colombia": "blank" } },
    { y: 1858, y1: 1860, r: { "Colombia": "Confederação Granadina" }, f: { "Colombia": "blank" } }, // constituição de 22/mai/1858; bandeira atual em 26/nov/1861
    { y: 1831, y1: 1860, r: { "Argentina": "Confederação Argentina", "State of Buenos Aires": "Estado de Buenos Aires" }, f: { "State of Buenos Aires": "blank" }, o: { "State of Buenos Aires": null } }, // separado desde 11/set/1852
    // Ásia
    { y: 1788, y1: 1857, r: { "British Raj": "Índia (Companhia Britânica das Índias Orientais)" }, f: { "British Raj": "blank" }, o: { "British Raj": "Reino Unido" } }, // Coroa assume em 1/nov/1858
    { y: 1856, y1: 1856, r: { "Herat": "Herat (ocupação persa)" }, f: { "Herat": "h:ir_old" }, o: { "Herat": "Pérsia" } }, // tomada em out/1856; devolvida pelo Tratado de Paris (mar/1857)
    { y: 1788, y1: 1860, m: ["Đại Nam (Vietnã)", "blank", ["French Indochina", "Western Cochinchina", "Cochinchina"]] }, // franceses só em Saigon (1859–1860)
    // Oceania
    { y: 1788, y1: 1858, m: ["Nova Gales do Sul (britânica)", "x:gb", ["New South Wales (UK)", "Northern Territory (UK)", "Queensland (UK)"]] }, // Queensland separada em 10/dez/1859
    { y: 1788, y1: 1874, f: { "Tonga": "blank" } }, // bandeira adotada em 4/nov/1875
    { y: 1788, y1: 1856, f: { "Transvaal": "blank", "Orange Free State": "blank" } }, // Vierkleur hasteada em 6/jan/1857; bandeira do Estado Livre em 23/fev/1857
    // revisão 1841–1845 (situação em 31/dez)
    ...yearly(1821, 1844, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]), // Flórida transferida pelo Tratado Adams–Onís (em vigor em 22/fev/1821)
    ...yearly(1803, 1820, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S"]),
    ...yearly(1788, 1802, "Estados Unidos", "United States of America", ["United States of America", "Confederate States"]),
    ...yearly(1845, 1845, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S", "Texas"]), // Texas anexado em 29/dez/1845
    ...yearly(1846, 1847, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S", "Texas", "Oregon"]), // Tratado do Oregon, 15/jun/1846
    { y: 1836, y1: 1844, r: { "Texas": "República do Texas" }, f: { "Texas": "h:texas" }, o: { "Texas": null } }, // Lone Star Flag de 1839
    { y: 1788, y1: 1845, r: { "Oregon": "Oregon (ocupação conjunta EUA–Reino Unido)" }, f: { "Oregon": "blank" }, o: { "Oregon": null } }, // convenção de 1818
    { y: 1823, y1: 1834, m: ["México", "x:mx", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan", "Texas"]] }, // Iturbide abdica em 19/mar/1823
    { y: 1821, y1: 1821, m: ["Império Mexicano", "blank", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan", "Texas"]] }, // independência em 27/set/1821
    { y: 1822, y1: 1822, m: ["Império Mexicano", "blank", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan", "Texas", "Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica"]] }, // América Central anexada em jan/1822
    { y: 1835, y1: 1839, m: ["México", "x:mx", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan"]] },
    { y: 1840, y1: 1842, m: ["México", "x:mx", ["Mexico", "Mexican Cession", "Alta California", "New Mexico"]] },
    { y: 1843, y1: 1845, m: ["México", "x:mx", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan"]] }, // convênios de dez/1843
    { y: 1841, y1: 1842, r: { "Yucatan": "República de Yucatán" }, f: { "Yucatan": "blank" }, o: { "Yucatan": null } }, // independência em 16/mar e 1/out/1841
    { y: 1822, y1: 1843, m: ["Haiti", "x:ht", ["Haiti", "Dominican Republic"]] }, // independência dominicana em 27/fev/1844
    { y: 1788, y1: 1842, r: { "Natal": "República de Natália" }, f: { "Natal": "blank" }, o: { "Natal": null } }, // anexada pelos britânicos em 12/mai/1843
    { y: 1788, y1: 1842, r: { "Sind": "Amirados do Sind (Talpur)" }, f: { "Sind": "blank" }, o: { "Sind": null } }, // Miani e Hyderabad, fev–mar/1843
    { y: 1843, y1: 1845, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Sind"]] },
    { y: 1846, y1: 1848, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Sind", "Kashmir"]] }, // Caxemira a Gulab Singh, 16/mar/1846
    { y: 1819, y1: 1833, m: ["Império Sikh", "blank", ["Punjab", "Kashmir"]] }, // Shopian, 3/jul/1819
    { y: 1788, y1: 1818, m: ["Império Sikh", "blank", ["Punjab"]] },
    { y: 1834, y1: 1845, m: ["Império Sikh", "blank", ["Punjab", "Kashmir", "Peshawar"]] }, // Peshawar anexada em 6/mai/1834
    { y: 1841, y1: 1841, r: { "Afghanistan": "Afeganistão (Primeira Guerra Anglo-Afegã)" }, o: { "Afghanistan": null } },
    { y: 1841, y1: 1841, r: { "Hong Kong": "Hong Kong (Primeira Guerra do Ópio)" }, f: { "Hong Kong": "blank" }, o: { "Hong Kong": null } }, // cedida pelo Tratado de Nanquim, 29/ago/1842
    { y: 1835, y1: 1844, r: { "Rio Grande do Sul": "Rio Grande do Sul (Guerra dos Farrapos)" }, f: { "Rio Grande do Sul": "blank" }, o: { "Rio Grande do Sul": null } }, // Tratado de Ponche Verde, 1/mar/1845
    ...yearly(1845, 1888, "Império do Brasil", "Kingdom of Brazil", ["Kingdom of Brazil", "Rio Grande do Sul"]),
    ...yearly(1889, 1912, "Brasil", "Kingdom of Brazil", ["Kingdom of Brazil", "Rio Grande do Sul"]),
    { y: 1815, y1: 1845, r: { "Kraków": "Cidade Livre de Cracóvia" }, f: { "Kraków": "blank" }, o: { "Kraków": null } }, // anexada à Áustria em nov/1846
    { y: 1834, y1: 1853, r: { "Maryland": "Maryland na Libéria (colônia)" }, f: { "Maryland": "blank" }, o: { "Maryland": null } }, // colônia desde 12/fev/1834
    { y: 1854, y1: 1856, r: { "Maryland": "República de Maryland" }, f: { "Maryland": "blank" }, o: { "Maryland": null } }, // independência em 29/mai/1854
    { y: 1857, m: ["Libéria", "x:lr", ["Liberia", "Maryland"]] }, // anexada pela Libéria em 1857
    { y: 1788, y1: 1844, f: { "Kingdom of Hawaii": "blank" } },
    { y: 1788, y1: 1843, f: { "Ottoman Empire": "blank", "Kuwait": "blank" } }, // bandeira de crescente e estrela de cinco pontas adotada em 1844 // bandeira de 8 listras oficializada em 25/mai/1845
    // revisão 1806 (situação em 31/dez; fontes: Wikipedia)
    { y: 1806, y1: 1806, r: { "Ionian Islands": "República Septinsular (protetorado russo)", "Dominican Republic": "Santo Domingo (França)", "Senegal FR": "Senegal (França)", "Portugal": "Reino de Portugal",
      "Dubrovnik": "República de Ragusa (ocupação francesa)", "Bay of Kotor": "Boca de Kotor (ocupação russa)", "Tuscany": "Reino da Etrúria", "Electorate of Hesse": "Eleitorado de Hesse (ocupação francesa)", "Duchy of Brunswick": "Principado de Brunsvique-Wolfenbüttel",
      "Netherlands Antilles": "Curaçao (Holanda)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas" },
      f: { "Ionian Islands": "blank", "Dominican Republic": "x:fr", "Senegal FR": "x:fr", "Portugal": "blank", "Dubrovnik": "x:fr", "Bay of Kotor": "x:ru", "Tuscany": "blank", "Electorate of Hesse": "x:fr", "Duchy of Brunswick": "blank",
        "Netherlands Antilles": "blank", "United States Virgin Islands": "x:dk" },
      o: { "Ionian Islands": null, "Dominican Republic": "França", "Senegal FR": "França", "Portugal": null, "Dubrovnik": null, "Bay of Kotor": null, "Tuscany": null, "Electorate of Hesse": null, "Duchy of Brunswick": null,
        "Netherlands Antilles": "Reino da Holanda", "United States Virgin Islands": "Dinamarca" } }, // Ragusa ocupada em 26/mai/1806; Kotor francesa só após Tilsit (1807); Etrúria até 10/dez/1807; Hesse ocupado após Jena; Brunsvique em interregno até 1807; ilhas dinamarquesas tomadas em 22–25/dez/1807
    // revisão 1807 (situação em 31/dez; fontes: Wikipedia)
    { y: 1807, y1: 1807, r: { "Ionian Islands": "Ilhas Jônicas (França)", "Dominican Republic": "Santo Domingo (França)", "Senegal FR": "Senegal (França)", "Portugal": "Portugal (ocupação francesa)",
      "Dubrovnik": "República de Ragusa (ocupação francesa)" },
      f: { "Ionian Islands": "x:fr", "Dominican Republic": "x:fr", "Senegal FR": "x:fr", "Portugal": "x:fr", "Dubrovnik": "x:fr" },
      o: { "Ionian Islands": "França", "Dominican Republic": "França", "Senegal FR": "França", "Portugal": null, "Dubrovnik": null } }, // Junot em Lisboa em 30/nov/1807; Ragusa ocupada em 26/mai/1806 e anexada à Itália em 31/jan/1808; colônia da Coroa em 1/jan/1808
    { y: 1788, y1: 1807, m: ["Estado do Brasil (Portugal)", "blank", ["Kingdom of Brazil", "Rio Grande do Sul"]], o: { "Kingdom of Brazil": "Portugal" } }, // a corte partiu de Lisboa em nov/1807 e chegou em 1808
    // revisão 1808 (situação em 31/dez; fontes: Wikipedia)
    { y: 1788, y1: 1808, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus"]] }, // Tarnopol austríaco até Schönbrunn (14/out/1809)
    { y: 1808, y1: 1808, r: { "Finland": "Finlândia (ocupação russa)", "Ionian Islands": "Ilhas Jônicas (França)", "Dominican Republic": "Santo Domingo (França)", "Senegal FR": "Senegal (França)" },
      f: { "Finland": "x:ru", "Ionian Islands": "x:fr", "Dominican Republic": "x:fr", "Senegal FR": "x:fr" }, o: { "Finland": null, "Ionian Islands": "França", "Dominican Republic": "França", "Senegal FR": "França" } }, // Rússia ocupou a Finlândia até nov/1808 (Olkijoki, 19/nov); cessão em 17/set/1809; Jônicas cedidas à França em 1807; Ferrand voltou à cidade após Palo Hincado (7/nov/1808)
    // revisão 1809 (situação em 31/dez; fontes: Wikipedia)
    { y: 1788, y1: 1809, r: { "Serbia": "Sérvia (Primeira Revolta Sérvia)", "Spain": "Espanha (Guerra Peninsular)", "Venezuela": "Capitania-Geral da Venezuela (Espanha)", "Chile": "Capitania-Geral do Chile (Espanha)",
      "Netherlands": "Reino da Holanda", "Netherlands Indies": "Índias Orientais Holandesas", "Valais": "República do Valais", "Grand Duchy of Oldenburg": "Ducado de Oldemburgo", "Kingdom of Hanover": "Hanôver (ocupação francesa)",
      "Kingdom of Haiti": "Estado do Haiti (Christophe)", "Haiti": "República do Haiti", "Guadeloupe": "Guadalupe", "Reunion": "Reunião", "Mauritius": "Maurício (Ilha de França)", "Malta": "Malta (protetorado britânico)" },
      f: { "Serbia": "blank", "Venezuela": "x:es", "Chile": "x:es", "Netherlands": "blank", "Netherlands Indies": "blank", "Valais": "blank", "Grand Duchy of Oldenburg": "blank", "Kingdom of Hanover": "x:fr", "Kingdom of Haiti": "blank",
        "Guadeloupe": "x:fr", "Reunion": "x:fr", "Mauritius": "x:fr", "Malta": "x:gb" },
      o: { "Serbia": null, "Venezuela": "Espanha", "Chile": "Espanha", "Netherlands": null, "Netherlands Indies": "Reino da Holanda", "Valais": null, "Grand Duchy of Oldenburg": null, "Kingdom of Hanover": null, "Kingdom of Haiti": null,
        "Guadeloupe": "França", "Reunion": "França", "Mauritius": "França", "Malta": null } }, // Holanda anexada em 9/jul/1810; Valais em 12/nov/1810; Hanôver na Vestfália no início de 1810; Guadalupe rendeu-se em 5/fev/1810; Reunião em jul/1810; Maurício em dez/1810; governador García Carrasco no Chile até 1810
    { y: 1807, y1: 1809, m: ["Reino da Vestfália", "blank", ["Electorate of Hesse", "Duchy of Brunswick", "Altmark"]], o: { "Electorate of Hesse": null } },
    // revisão 1810 (situação em 31/dez; fontes: Wikipedia)
    { y: 1810, y1: 1810, r: { "Serbia": "Sérvia (Primeira Revolta Sérvia)", "Spain": "Espanha (Guerra Peninsular)", "Venezuela": "Junta Suprema de Caracas", "Uruguay": "Banda Oriental (Espanha)", "Paraguay": "Paraguai (Espanha; governador Velasco)",
      "Colombia": "Nova Granada (juntas autônomas)", "Netherlands Indies": "Índias Orientais Holandesas", "Kingdom of Haiti": "Estado do Haiti (Christophe)", "Haiti": "República do Haiti" },
      f: { "Serbia": "blank", "Venezuela": "blank", "Uruguay": "x:es", "Paraguay": "x:es", "Colombia": "blank", "Netherlands Indies": "blank", "Kingdom of Haiti": "blank" },
      o: { "Serbia": null, "Venezuela": null, "Uruguay": "Espanha", "Paraguay": "Espanha", "Colombia": null, "Netherlands Indies": null, "Kingdom of Haiti": null } }, // Junta de Caracas 19/abr/1810; junta paraguaia só em 14/mai/1811; Estado do Haiti 1806–28/mar/1811; Holanda anexada à França em 9/jul/1810
    // revisão 1811 (situação em 31/dez; fontes: Wikipedia)
    { y: 1809, y1: 1811, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Tarnopol"]] }, // Bessarabia cedida em 28/mai/1812
    { y: 1811, y1: 1811, r: { "Serbia": "Sérvia (Primeira Revolta Sérvia)", "Spain": "Espanha (Guerra Peninsular)", "Venezuela": "Primeira República da Venezuela", "Uruguay": "Banda Oriental (Espanha; vice-rei Elío)" },
      f: { "Serbia": "blank", "Venezuela": "blank", "Uruguay": "x:es" }, o: { "Serbia": null, "Venezuela": null, "Uruguay": "Espanha" } }, // república venezuelana desde 5/jul/1811; trégua de Buenos Aires com Elío em 1811
    // revisão 1812 (situação em 31/dez; fontes: Wikipedia)
    { y: 1807, y1: 1808, m: ["Ducado de Varsóvia", "blank", ["Congress Poland", "Posen"]], o: { "Congress Poland": null } }, // Galícia Ocidental (Cracóvia) só em 1809
    { y: 1809, y1: 1812, m: ["Ducado de Varsóvia", "blank", ["Congress Poland", "Kraków", "Posen"]], o: { "Congress Poland": null } }, // ocupado pela Rússia em jan/1813
    { y: 1810, y1: 1812, m: ["Reino da Vestfália", "blank", ["Electorate of Hesse", "Duchy of Brunswick", "Kingdom of Hanover", "Altmark"]], o: { "Electorate of Hesse": null } }, // 1807–1813 (aprox.: o norte de Hanôver era francês desde dez/1810)
    { y: 1812, y1: 1812, r: { "Serbia": "Sérvia (Primeira Revolta Sérvia)", "Spain": "Espanha (Guerra Peninsular)", "Venezuela": "Capitania-Geral da Venezuela (Espanha)" }, f: { "Serbia": "blank", "Venezuela": "x:es" }, o: { "Serbia": null, "Venezuela": "Espanha" } }, // autonomia sérvia no Tratado de Bucareste (28/mai/1812); Primeira República venezuelana até 25/jul/1812
    // revisão 1813 (situação em 31/dez; fontes: Wikipedia)
    { y: 1809, y1: 1813, m: ["Reino da Baviera", "blank", ["Kingdom of Bavaria", "Tyrol", "Salzburg"]] }, // Tirol bávaro de 1805 a 1814; Salzburgo de 1810 a 1816
    { y: 1814, y1: 1815, m: ["Reino da Baviera", "blank", ["Kingdom of Bavaria", "Salzburg"]] },
    { y: 1813, y1: 1813, r: { "Spain": "Espanha (Guerra Peninsular)", "Kingdom of Hanover": "Eleitorado de Hanôver (restaurado)", "Free City of Hamburg": "Hamburgo (guarnição francesa sitiada)" }, f: { "Free City of Hamburg": "x:fr" }, o: { "Free City of Hamburg": null } }, // cerco até mai/1814
    { y: 1810, y1: 1813, m: ["Províncias Unidas do Rio da Prata", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal"]] },
    { y: 1812, y1: 1813, r: { "Uruguay": "Banda Oriental (Montevidéu realista sitiada)" }, f: { "Uruguay": "blank" }, o: { "Uruguay": null } }, // rendição em jun/1814
    { y: 1810, y1: 1813, r: { "Chile": "Chile (Pátria Velha)" }, f: { "Chile": "blank" }, o: { "Chile": null } }, // Rancagua, 1–2/out/1814
    { y: 1813, y1: 1813, r: { "Venezuela": "Segunda República da Venezuela" }, f: { "Venezuela": "blank" }, o: { "Venezuela": null } }, // Caracas em 6/ago/1813; retomada pelos realistas em 16/jul/1814
    // revisão 1814 (situação em 31/dez; fontes: Wikipedia)
    { y: 1814, y1: 1814, m: ["Províncias Unidas do Rio da Prata", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal", "Uruguay"]] }, // Montevidéu rende-se em jun/1814
    { y: 1808, y1: 1814, m: ["Estado do Brasil (Portugal; sede da corte)", "blank", ["Kingdom of Brazil", "Rio Grande do Sul"]], o: { "Kingdom of Brazil": "Portugal" } }, // reino em 16/dez/1815
    { y: 1808, y1: 1814, r: { "Portugal": "Reino de Portugal" } },
    { y: 1813, y1: 1814, r: { "Netherlands": "Principado Soberano dos Países Baixos Unidos", "Belgium": "Bélgica (governo-geral provisório)" }, f: { "Belgium": "blank" }, o: { "Belgium": null } }, // reunião em 16/mar/1815
    { y: 1813, y1: 1814, m: ["Ducado de Varsóvia (ocupação russa)", "x:ru", ["Congress Poland", "Kraków", "Posen"]], o: { "Congress Poland": null } }, // ocupado desde jan/1813; dividido em 9/jun/1815
    { y: 1812, y1: 1814, m: ["Império Russo", "x:ru", ["Russian Empire", "Russian Caucasus", "Bessarabia", "Tarnopol"]] }, // Tratado de Gulistão, 24/out/1813
    { y: 1813, y1: 1814, r: { "Kingdom of Saxony": "Reino da Saxônia (administração prussiana)" }, o: { "Kingdom of Saxony": null } }, // perde 60% do território em 1815
    { y: 1788, y1: 1814, r: { "Two Sicilies": "Reino de Nápoles (Joaquim Murat)", "Sicily": "Reino da Sicília (Bourbon)" }, f: { "Two Sicilies": "blank", "Sicily": "blank" }, o: { "Two Sicilies": null, "Sicily": null } }, // Tolentino, 3/mai/1815
    { y: 1809, y1: 1814, r: { "Ionian Islands": "Ilhas Jônicas (ocupação britânica)" }, f: { "Ionian Islands": "x:gb" }, o: { "Ionian Islands": null } }, // protetorado em 5–9/nov/1815
    { y: 1813, y1: 1814, m: ["Império Otomano", "blank", ["Ottoman Empire", "Serbia"]] }, // Sérvia reconquistada em out/1813; segunda revolta em abr/1815
    { y: 1788, y1: 1814, f: { "Ceylon": "x:gb" }, o: { "Ceylon": "Reino Unido" } },
    { y: 1788, y1: 1814, r: { "Kandy": "Reino de Kandy" }, f: { "Kandy": "blank" }, o: { "Kandy": null } }, // Kandy tomada em 14/fev/1815
    // revisão 1815 (situação em 31/dez; fontes: Wikipedia)
    { y: 1814, y1: 1815, r: { "Venezuela": "Capitania-Geral da Venezuela (Espanha)" }, f: { "Venezuela": "x:es" }, o: { "Venezuela": "Espanha" } }, // Caracas retomada pelos realistas em 16/jul/1814
    { y: 1788, y1: 1815, m: ["Vice-Reino de Nova Granada (Espanha)", "x:es", ["Panama", "Ecuador"]], o: { "Panama": "Espanha" } },
    { y: 1811, y1: 1815, r: { "Colombia": "Províncias Unidas de Nova Granada" }, f: { "Colombia": "blank" }, o: { "Colombia": null } }, // 1810–1816; Cartagena cai em 6/dez/1815
    { y: 1788, y1: 1815, f: { "Argentina": "blank" } }, // bandeira adotada pelo Congresso de Tucumán em 1816
    { y: 1815, y1: 1815, m: ["Liga Federal (Artigas)", "blank", ["Liga Federal", "Uruguay"]], o: { "Liga Federal": null } }, // Artigas controla Montevidéu desde 1815
    { y: 1816, y1: 1819, r: { "Liga Federal": "Liga Federal (Artigas)" }, f: { "Liga Federal": "blank" }, o: { "Liga Federal": null } }, // 1815–1820
    { y: 1814, y1: 1815, r: { "Nepal": "Nepal (Guerra Anglo-Nepalesa)" } }, // 1/nov/1814 a 4/mar/1816 (Tratado de Sugauli ratificado)
    { y: 1811, y1: 1815, r: { "Netherlands Indies": "Índias Orientais Holandesas (ocupação britânica)" }, f: { "Netherlands Indies": "x:gb" }, o: { "Netherlands Indies": null } }, // Java devolvida aos holandeses em 1816
    // revisão 1816–1820 (situação em 31/dez; fontes: Wikipedia)
    { y: 1788, y1: 1843, f: { "Ottoman Empire": "blank" } }, // bandeira atual em 1844
    { y: 1821, y1: 1843, f: { "Ottoman Empire": "blank" } },
    { y: 1788, y1: 1820, r: { "Florida": "Flórida (Espanha)" }, f: { "Florida": "x:es" }, o: { "Florida": "Espanha" } }, // Tratado Adams–Onís, 22/fev/1819, em vigor em 22/fev/1821
    { y: 1788, y1: 1817, r: { "Oregon": "País do Oregon (disputado)" }, f: { "Oregon": "blank" }, o: { "Oregon": null } }, // Tratado de 1818 (20/out/1818): ocupação conjunta
    { y: 1788, y1: 1820, m: ["Vice-Reino da Nova Espanha (Espanha)", "x:es", ["Mexico", "Mexican Cession", "Alta California", "New Mexico", "Yucatan", "Texas"]], o: { "Mexico": "Espanha" } },
    { y: 1788, y1: 1820, m: ["Capitania-Geral da Guatemala (Espanha)", "x:es", ["Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica"]], o: { "Guatemala": "Espanha" } },
    { y: 1809, y1: 1820, r: { "Dominican Republic": "Santo Domingo (Espanha)" }, f: { "Dominican Republic": "x:es" }, o: { "Dominican Republic": "Espanha" } },
    { y: 1811, y1: 1819, r: { "Kingdom of Haiti": "Reino do Haiti (Henrique I)", "Haiti": "República do Haiti" }, f: { "Kingdom of Haiti": "blank" }, o: { "Kingdom of Haiti": null } }, // reino proclamado em 28/mar/1811, no norte
    { y: 1816, y1: 1818, m: ["Vice-Reino de Nova Granada (Espanha)", "x:es", ["Colombia", "Panama", "Ecuador"]], o: { "Colombia": "Espanha" } }, // Bogotá retomada em 6/mai/1816
    { y: 1819, y1: 1820, m: ["Real Audiência de Quito e Panamá (Espanha)", "x:es", ["Ecuador", "Panama"]], o: { "Ecuador": "Espanha" } },
    { y: 1819, y1: 1820, r: { "Colombia": "República da Colômbia (Nova Granada)" }, f: { "Colombia": "blank" }, o: { "Colombia": null } }, // Boyacá, 7/ago/1819; Congresso de Angostura
    { y: 1816, y1: 1820, r: { "Venezuela": "Venezuela (Guerra de Independência)" }, f: { "Venezuela": "blank" }, o: { "Venezuela": null } }, // Carabobo só em 24/jun/1821
    { y: 1788, y1: 1820, r: { "Peru": "Vice-Reino do Peru (Espanha)" }, f: { "Peru": "x:es" }, o: { "Peru": "Espanha" } }, // San Martín desembarca em set/1820
    { y: 1814, y1: 1816, r: { "Chile": "Capitania-Geral do Chile (Espanha)" }, f: { "Chile": "x:es" }, o: { "Chile": "Espanha" } }, // Reconquista 1814–1817; Chacabuco em 12/fev/1817
    { y: 1817, y1: 1817, r: { "Chile": "Chile (governo patriota)" }, o: { "Chile": null } }, // independência em 12/fev/1818; bandeira atual em 18/out/1817
    { y: 1816, y1: 1817, f: { "Argentina": "h:ar_ns" } }, // Congresso de Tucumán (9/jul/1816); sol de maio em 1818
    { y: 1818, y1: 1819, f: { "Argentina": "x:ar" } },
    { y: 1820, y1: 1820, r: { "Argentina": "Províncias Unidas do Rio da Prata (sem governo central)" } }, // Cepeda, 1/fev/1820
    { y: 1815, y1: 1820, m: ["Reino do Brasil (Reino Unido de Portugal, Brasil e Algarves)", "blank", ["Kingdom of Brazil", "Rio Grande do Sul"]] },
    { y: 1816, y1: 1816, r: { "Uruguay": "Banda Oriental (Artigas; invasão luso-brasileira)" }, f: { "Uruguay": "blank" }, o: { "Uruguay": null } },
    { y: 1817, y1: 1820, r: { "Uruguay": "Banda Oriental (ocupação luso-brasileira)" }, f: { "Uruguay": "blank" }, o: { "Uruguay": null } }, // anexada como Cisplatina em 1821
    { y: 1788, y1: 1820, r: { "Anglo-Egyptian Sudan": null } }, // invasão egípcia a partir de jul/1820; Sennar em 14/jun/1821
    { y: 1809, y1: 1816, r: { "Senegal FR": "Senegal (britânico)" }, f: { "Senegal FR": "x:gb" }, o: { "Senegal FR": "Reino Unido" } }, // devolvido à França em 1817
    { y: 1788, y1: 1819, r: { "Zululand": null } }, // Shaka desde 1816; Mhlatuze em 1820
    { y: 1788, y1: 1817, m: ["Emirado de Diriyah (Primeiro Estado Saudita)", "blank", ["Riyadh", "Qassim", "Hail", "Hasa"]], o: { "Riyadh": null } }, // Diriyah rende-se em 1818
    { y: 1818, y1: 1819, m: ["Négede (ocupação egípcia)", "h:eg_khed", ["Riyadh", "Qassim"]], o: { "Riyadh": null } }, // Ibrahim Paxá volta ao Egito em dez/1819
    { y: 1788, y1: 1818, r: { "Kashmir": "Caxemira (Império Durrani)" }, f: { "Kashmir": "blank" }, o: { "Kashmir": null } },
    { y: 1788, y1: 1816, r: { "Maratha": "Confederação Maratha" }, f: { "Maratha": "blank" }, o: { "Maratha": null } },
    { y: 1817, y1: 1817, r: { "Maratha": "Confederação Maratha (Terceira Guerra Anglo-Maratha)" }, f: { "Maratha": "blank" }, o: { "Maratha": null } }, // 5/nov/1817 a 9/abr/1819
    { y: 1818, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Maratha"]] }, // Baji Rao II rende-se em 3/jun/1818
    { y: 1788, y1: 1818, m: ["Reino da Birmânia", "blank", ["Upper Burma", "Pegu", "Arakan", "Tenasserim"]] },
    { y: 1819, y1: 1820, m: ["Reino da Birmânia", "blank", ["Upper Burma", "Pegu", "Arakan", "Tenasserim", "Manipur"]] }, // Manipur conquistado em 1819
    { y: 1788, y1: 1818, r: { "Manipur": "Reino de Manipur" }, f: { "Manipur": "blank" }, o: { "Manipur": null } },
    { y: 1788, y1: 1820, r: { "Assam": "Reino Ahom (Assam)" }, f: { "Assam": "blank" }, o: { "Assam": null } }, // invasões birmanesas em 1817 e 1819; controle birmanês de 1821 a 1825
    // revisão 1821–1825 (situação em 31/dez)
    { y: 1788, y1: 1887, r: { "Rapa Nui": null } },
    { y: 1824, y1: 1824, f: { "Peru": "blank" } }, // bandeira atual em 25/fev/1825 // anexada pelo Chile em 9/set/1888
    { y: 1825, y1: 1855, r: { "_null_150": "Terra de Van Diemen (britânica)" }, f: { "_null_150": "x:gb" }, o: { "_null_150": "Reino Unido" } }, // colônia em 3/dez/1825; Tasmânia em 1/jan/1856
    { y: 1788, y1: 1824, m: ["Nova Gales do Sul (britânica)", "x:gb", ["New South Wales (UK)", "_null_150"]] },
    { y: 1821, y1: 1823, r: { "Peru": "Peru (Guerra de Independência)" }, f: { "Peru": "blank" }, o: { "Peru": null } }, // realistas na serra; Ayacucho em 9/dez/1824
    { y: 1821, y1: 1821, r: { "Dominican Republic": "Haiti Espanhol (independência efêmera)" }, f: { "Dominican Republic": "blank" }, o: { "Dominican Republic": null } }, // 1/dez/1821 a 9/fev/1822
    { y: 1815, y1: 1821, r: { "Portugal": "Reino Unido de Portugal, Brasil e Algarves" } },
    { y: 1788, y1: 1821, r: { "Liberia": null } }, // Cabo Mesurado adquirido em dez/1821
    { y: 1821, y1: 1821, f: { "Greece": "blank" } },
    { y: 1821, y1: 1824, m: ["Reino da Birmânia", "blank", ["Upper Burma", "Pegu", "Assam", "Manipur", "Arakan", "Tenasserim"]] }, // Assam sob a Birmânia de 1821 a 1825
    { y: 1824, y1: 1824, r: { "Upper Burma": "Reino da Birmânia (Primeira Guerra Anglo-Birmanesa)" } },
    { y: 1825, y1: 1825, m: ["Reino da Birmânia (Primeira Guerra Anglo-Birmanesa)", "blank", ["Upper Burma", "Pegu"]] },
    { y: 1825, y1: 1825, r: { "Assam": "Assam (ocupação britânica)", "Arakan": "Arracão (ocupação britânica)", "Tenasserim": "Tenasserim (ocupação britânica)", "Manipur": "Manipur" },
      f: { "Assam": "x:gb", "Arakan": "x:gb", "Tenasserim": "x:gb", "Manipur": "blank" }, o: { "Assam": null, "Arakan": null, "Tenasserim": null, "Manipur": null } }, // Tratado de Yandabo em 1826
    { y: 1826, m: ["Índia (Companhia Britânica das Índias Orientais)", "blank", ["British Raj", "Assam", "Manipur", "Arakan", "Tenasserim"]] },
    // revisão 1826–1830 (situação em 31/dez)
    { y: 1788, y1: 1829, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Crete"]] }, // Creta entregue a Muhammad Ali em 1830
    { y: 1788, y1: 1843, f: { "Ottoman Empire": "blank", "Kuwait": "blank" } },
    { y: 1822, y1: 1829, m: ["Grã-Colômbia", "blank", ["Colombia", "Panama", "Venezuela", "Ecuador"]] }, // Quito e Guayaquil em 1822
    { y: 1821, y1: 1821, m: ["Grã-Colômbia", "blank", ["Colombia", "Panama", "Venezuela"]] }, // Panamá adere em 28/nov/1821
    { y: 1821, y1: 1821, r: { "Ecuador": "Real Audiência de Quito (Espanha)" }, f: { "Ecuador": "x:es" }, o: { "Ecuador": "Espanha" } }, // Pichincha em 24/mai/1822
    { y: 1830, y1: 1830, r: { "Colombia": "Colômbia (Grã-Colômbia em dissolução)" }, f: { "Colombia": "blank" } }, // dissolução formal em 19/nov/1831
    { y: 1825, y1: 1827, r: { "Uruguay": "Banda Oriental (Guerra da Cisplatina)" }, f: { "Uruguay": "blank" }, o: { "Uruguay": null } }, // paz preliminar em 27/ago/1828
    { y: 1828, y1: 1829, r: { "Uruguay": "Estado Oriental do Uruguai" }, f: { "Uruguay": "blank" } }, // bandeira atual em 11/jul/1830
    { y: 1810, y1: 1819, m: ["Províncias Unidas do Rio da Prata", "blank", ["Argentina", "State of Buenos Aires"]] },
    { y: 1821, y1: 1830, m: ["Províncias Unidas do Rio da Prata", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal"]] },
    { y: 1820, y1: 1820, m: ["Províncias Unidas do Rio da Prata (sem governo central)", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal"]] }, // Tratado do Pilar (fev/1820); fim da Liga Federal // Pacto Federal em jan/1831
    { y: 1815, y1: 1829, m: ["Reino Unido dos Países Baixos", "x:nl", ["Netherlands", "Belgium"]] },
    { y: 1830, y1: 1830, r: { "Belgium": "Bélgica (Revolução Belga)" }, f: { "Belgium": "blank" }, o: { "Belgium": null } }, // independência em 4/out/1830
    { y: 1821, y1: 1828, r: { "Greece": "Grécia (Guerra de Independência)" }, o: { "Greece": null } }, // guerra até 12/set/1829; Protocolo de Londres em 3/fev/1830
    { y: 1788, y1: 1829, m: ["Regência de Argel", "blank", ["Algeria", "Algeria FR"]], o: { "Algeria": null } },
    { y: 1830, y1: 1830, r: { "Algeria FR": "Argel (conquista francesa)" }, f: { "Algeria FR": "x:fr" }, o: { "Algeria FR": "França" } }, // Argel tomada em 5/jul/1830
    { y: 1831, y1: 1899, r: { "Algeria FR": "Argélia (França)" }, f: { "Algeria FR": "x:fr" }, o: { "Algeria FR": "França" } }, // forma do mapa de 1880; Saara conquistado depois
    { y: 1830, y1: 1899, r: { "Algeria": null } },
    { y: 1900, m: ["Argélia", "x:fr", ["Algeria", "Algeria FR"]] },
    // África antes da partilha: colônias com a forma do mapa de 1880, interior sem dono no mapa
    { y: 1817, r: { "Senegal FR": "Senegal (França)" }, f: { "Senegal FR": "x:fr" }, o: { "Senegal FR": "França" } },
    { y: 1788, y1: 1894, r: { "French West Africa": null } }, // federação em 27/out/1895
    { y: 1895, m: ["África Ocidental Francesa", "x:fr", ["French West Africa", "Senegal FR"]] },
    { y: 1788, r: { "Angola PT": "Angola (Portugal)", "Mozambique PT": "Moçambique (Portugal)", "Portuguese Guinea PT": "Guiné Portuguesa" }, f: { "Angola PT": "h:pt_mon", "Mozambique PT": "h:pt_mon", "Portuguese Guinea PT": "h:pt_mon" },
      o: { "Angola PT": "Portugal", "Mozambique PT": "Portugal", "Portuguese Guinea PT": "Portugal" } },
    { y: 1788, y1: 1890, r: { "Angola": null, "Portuguese East Africa": null } }, // tratado anglo-português de 11/jun/1891
    { y: 1891, m: ["Angola", "h:pt_mon", ["Angola", "Angola PT"]] },
    { y: 1891, m: ["Moçambique", "h:pt_mon", ["Portuguese East Africa", "Mozambique PT"]] },
    { y: 1788, y1: 1885, r: { "Portuguese Guinea": null } }, // convenção franco-portuguesa de 1886
    { y: 1886, m: ["Guiné Portuguesa", "h:pt_mon", ["Portuguese Guinea", "Portuguese Guinea PT"]] },
    { y: 1788, y1: 1833, f: { "Angola PT": "blank", "Mozambique PT": "blank", "Portuguese Guinea PT": "blank", "Cape Verde": "blank", "Sao Tome": "blank", "Goa": "blank", "Macau": "blank", "Portuguese Timor": "blank" } }, // bandeira azul e branca só em 1834
    { y: 1788, y1: 1842, r: { "Gabon FR": null } }, // posto francês de Fort d'Aumale em 1843
    { y: 1843, y1: 1879, r: { "Gabon FR": "Gabão (França)" }, f: { "Gabon FR": "x:fr" }, o: { "Gabon FR": "França" } },
    { y: 1788, y1: 1879, r: { "Gabon": null } },
    { y: 1788, r: { "Gold Coast GB": "Costa do Ouro", "Sierra Leone GB": "Serra Leoa" }, f: { "Gold Coast GB": "x:gb", "Sierra Leone GB": "x:gb" }, o: { "Gold Coast GB": "Reino Unido", "Sierra Leone GB": "Reino Unido" } },
    { y: 1788, y1: 1900, r: { "Gold Coast": null } }, // Territórios do Norte em 1901
    { y: 1901, y1: 1901, m: ["Costa do Ouro", "x:gb", ["Gold Coast", "Gold Coast GB"]] },
    { y: 1788, y1: 1895, r: { "Sierra Leone": null } }, // protetorado em 1896
    { y: 1896, m: ["Serra Leoa", "x:gb", ["Sierra Leone", "Sierra Leone GB"]] },
    { y: 1788, y1: 1826, r: { "Erivan": "Canatos de Erivã e Nakhchivan (Pérsia)" }, f: { "Erivan": "blank" }, o: { "Erivan": "Pérsia" } },
    { y: 1827, y1: 1827, r: { "Erivan": "Canatos de Erivã e Nakhchivan (ocupação russa)" }, f: { "Erivan": "x:ru" }, o: { "Erivan": null } }, // Erivã tomada em set/1827
    { y: 1830, y1: 1830, r: { "Congress Poland": "Reino da Polônia (Revolta de Novembro)" }, f: { "Congress Poland": "blank" }, o: { "Congress Poland": null } }, // governo nacional em Varsóvia; ofensiva russa em fev/1831
    { y: 1828, y1: 1830, r: { "Romania": "Principado da Moldávia (ocupação russa)", "Wallachia": "Principado da Valáquia (ocupação russa)" }, f: { "Romania": "x:ru", "Wallachia": "x:ru" } }, // guerra russo-turca de 1828–29; Tratado de Adrianópolis
    { y: 1788, y1: 1828, r: { "Western Australia (UK)": null } }, // Fremantle reivindica a costa oeste em 2/mai/1829; colônia em 17/jun/1829
    // revisão 1831–1835 (situação em 31/dez)
    ...yearly(1825, 1834, "Império do Brasil", "Kingdom of Brazil", ["Kingdom of Brazil", "Rio Grande do Sul"]),
    ...yearly(1822, 1824, "Império do Brasil", "Kingdom of Brazil", ["Kingdom of Brazil", "Rio Grande do Sul", "Uruguay"]), // independência em 7/set/1822; Cisplatina
    { y: 1821, y1: 1821, m: ["Reino do Brasil (Reino Unido de Portugal, Brasil e Algarves)", "blank", ["Kingdom of Brazil", "Rio Grande do Sul", "Uruguay"]] }, // Cisplatina incorporada em 18/jul/1821 // Farrapos tomam Porto Alegre em 20/set/1835
    { y: 1835, y1: 1835, r: { "Texas": "Texas (Revolução do Texas)" }, f: { "Texas": "blank" }, o: { "Texas": null } }, // sem guarnição mexicana desde dez/1835
    { y: 1788, y1: 1833, r: { "Peshawar": "Peshawar (sardares barakzais)" }, f: { "Peshawar": "blank" }, o: { "Peshawar": null } },
    { y: 1846, y1: 1848, m: ["Império Sikh", "blank", ["Punjab", "Peshawar"]] },
    { y: 1788, y1: 1833, r: { "Maryland": null } }, // colônia fundada em 12/fev/1834
    { y: 1788, y1: 1833, r: { "Cambodia": "Reino do Camboja" }, f: { "Cambodia": "blank" }, o: { "Cambodia": null } }, // rebaixado a província vietnamita em 1834
    { y: 1788, y1: 1834, r: { "Libya": "Paxalato de Trípoli (dinastia Caramanli)" }, f: { "Libya": "blank" }, o: { "Libya": null } }, // Ali II deposto em 26/mai/1835
    { y: 1832, y1: 1843, f: { "Ottoman Empire": "blank", "Kuwait": "blank" } }, // as fusões otomanas de 1832 e 1835 repõem a bandeira
    { y: 1835, y1: 1843, f: { "Ottoman Empire": "blank", "Kuwait": "blank" } },
    { y: 1829, y1: 1831, r: { "Greece": "Estado Helênico" } }, // Reino da Grécia em 7/mai/1832
    { y: 1828, y1: 1831, r: { "Portugal": "Portugal (reinado de D. Miguel)" }, f: { "Portugal": "blank" } }, // D. Miguel mantinha a bandeira branca de D. João VI
    { y: 1832, y1: 1833, r: { "Portugal": "Portugal (Guerras Liberais)" }, f: { "Portugal": "blank" } }, // Lisboa tomada em 24/jul/1833; Évora-Monte em 26/mai/1834
    { y: 1788, y1: 1835, m: ["Nova Gales do Sul (britânica)", "x:gb", ["New South Wales (UK)", "South Australia (UK)"]] }, // província da Austrália Meridional proclamada em 28/dez/1836
    // revisão 1836–1840 (situação em 31/dez)
    { y: 1836, y1: 1838, f: { "Texas": "blank" } }, // independência em 2/mar/1836; Lone Star Flag em 1839
    { y: 1840, y1: 1840, r: { "Yucatan": "Yucatán (rebelião federalista)" }, f: { "Yucatan": "blank" }, o: { "Yucatan": null } }, // independência formal em 1841
    { y: 1823, y1: 1828, m: ["República Federal da América Central", "blank", ["Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica"]] }, // 1/jul/1823
    { y: 1829, y1: 1830, m: ["República Federal da América Central", "blank", ["Guatemala", "El Salvador", "Honduras", "Nicaragua"]] }, // Costa Rica fora de 1/abr/1829 a fev/1831
    { y: 1829, y1: 1830, r: { "Costa Rica": "Costa Rica (fora da Federação)" } },
    { y: 1831, y1: 1837, m: ["República Federal da América Central", "blank", ["Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica"]] },
    { y: 1821, y1: 1821, m: ["América Central (independente da Espanha)", "blank", ["Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica"]] }, // 15/set/1821
    { y: 1838, y1: 1838, m: ["República Federal da América Central (em dissolução)", "blank", ["Guatemala", "El Salvador"]] }, // saídas: Nicarágua 30/abr, Honduras 26/out, Costa Rica 15/nov/1838
    { y: 1839, y1: 1840, r: { "El Salvador": "El Salvador (último Estado da Federação)" } }, // Federação dissolvida em 17/abr/1839; El Salvador independente em 30/jan/1841
    { y: 1836, y1: 1837, m: ["Confederação Peru-Boliviana", "blank", ["Peru", "Bolivia", "Bolivian Litoral"]] }, // decreto de 28/out/1836
    { y: 1838, y1: 1838, m: ["Confederação Peru-Boliviana (Guerra da Confederação)", "blank", ["Peru", "Bolivia", "Bolivian Litoral"]] }, // dissolvida em 25/ago/1839
    { y: 1833, y1: 1839, r: { "Spain": "Espanha (Primeira Guerra Carlista)" } }, // desde 29/set/1833; Convenção de Vergara em 31/ago/1839; fim em jul/1840
    { y: 1840, y1: 1843, f: { "Ottoman Empire": "blank", "Kuwait": "blank" } }, // a fusão otomana de 1840 repõe a bandeira
    { y: 1788, y1: 1840, r: { "Canada": "Alto e Baixo Canadá (britânicos)" } }, // Província do Canadá em 10/fev/1841
    { y: 1788, y1: 1839, r: { "New Zealand": "Nova Zelândia (maoris)" }, f: { "New Zealand": "blank" }, o: { "New Zealand": null } }, // soberania britânica em 21/mai/1840
    { y: 1840, y1: 1840, r: { "New Zealand": "Nova Zelândia (parte de Nova Gales do Sul)" }, f: { "New Zealand": "x:gb" }, o: { "New Zealand": "Reino Unido" } }, // colônia separada em 3/mai/1841
    { y: 1788, y1: 1838, r: { "Natal": null } }, // República de Natália em 12/out/1839
    { y: 1788, y1: 1837, r: { "Transvaal": null } }, // ndebeles de Mzilikazi expulsos pelos voortrekkers em nov/1837
    { y: 1820, y1: 1878, r: { "Zululand": "Reino Zulu" }, f: { "Zululand": "blank" }, o: { "Zululand": null } },
    { y: 1879, y1: 1886, r: { "Zululand": "Zululândia (chefaturas após a Guerra Anglo-Zulu)" }, f: { "Zululand": "blank" }, o: { "Zululand": null } }, // rei deposto em 28/ago/1879
    { y: 1887, y1: 1896, r: { "Zululand": "Zululândia (britânica)" }, f: { "Zululand": "x:gb" }, o: { "Zululand": "Reino Unido" } }, // anexada em 1887
    { y: 1897, y1: 1909, m: ["Colônia de Natal", "x:gb", ["Natal", "Zululand"]] }, // unida a Natal em 1897
    { y: 1822, y1: 1838, r: { "Liberia": "Libéria (colônia da Sociedade Americana de Colonização)" }, f: { "Liberia": "blank" }, o: { "Liberia": null } }, // Commonwealth em 1839
    { y: 1839, y1: 1840, r: { "Afghanistan": "Afeganistão (Primeira Guerra Anglo-Afegã)" }, o: { "Afghanistan": null } }, // Cabul ocupada em ago/1839
    { y: 1788, y1: 1840, m: ["Império Qing", "blank", ["Manchu Empire", "Hong Kong"]] },
    { y: 1788, y1: 1840, m: ["Brunei", "h:bn_y", ["Brunei", "Sarawak"]] }, // Sarawak a James Brooke em 24/set/1841
    { y: 1834, y1: 1840, r: { "Cambodia": "Camboja (província vietnamita de Trấn Tây)" }, f: { "Cambodia": "blank" }, o: { "Cambodia": "Đại Nam" } }, // 1835; retirada vietnamita em 1841
    { y: 1832, y1: 1839, m: ["Egito (eialete otomano)", "h:eg_khed", ["Egypt", "Egyptian Syria", "Lebanon", "Hejaz", "Crete"]] }, // Acre tomada em mai/1832
    { y: 1830, y1: 1831, m: ["Egito (eialete otomano)", "h:eg_khed", ["Egypt", "Hejaz", "Crete"]] },
    { y: 1813, y1: 1829, m: ["Egito (eialete otomano)", "h:eg_khed", ["Egypt", "Hejaz"]] }, // Medina retomada no fim de 1812; Meca em jan/1813 // guerra com o sultão desde 10/out/1831 // Muhammad Ali aceita a retirada em 27/nov/1840
    { y: 1788, y1: 1838, m: ["Sultanatos do Sul da Arábia", "blank", ["South Arabia", "Aden"]] }, // Áden tomada pelos britânicos em jan/1839
    { y: 1788, y1: 1885, r: { "South Arabia": "Sultanatos do Sul da Arábia" }, f: { "South Arabia": "blank" }, o: { "South Arabia": null } },
    { y: 1839, y1: 1885, r: { "Aden": "Áden (britânica)" }, f: { "Aden": "x:gb" }, o: { "Aden": "Reino Unido" } }, // primeiro tratado formal de proteção em 1886
    { y: 1886, m: ["Áden e protetorados (britânicos)", "x:gb", ["Aden", "South Arabia"]] },
    // revisão 1846–1850 (situação em 31/dez)
    ...yearly(1848, 1860, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S", "Texas", "Oregon", "Alta California", "New Mexico", "Mexican Cession"]),
    ...yearly(1861, 1864, "Estados Unidos", "United States of America", ["United States of America", "Louisiana N", "Oregon", "Alta California", "New Mexico", "Mexican Cession"]),
    { y: 1861, y1: 1864, m: ["Estados Confederados da América", "blank", ["Confederate States", "Louisiana S", "Texas"]] },
    ...yearly(1865, 1912, "Estados Unidos", "United States of America", ["United States of America", "Confederate States", "Louisiana N", "Louisiana S", "Texas", "Oregon", "Alta California", "New Mexico", "Mexican Cession"]), // Tratado de Guadalupe Hidalgo, em vigor em 30/mai/1848
    ...yearly(1860, 1912, "Nicarágua", "Nicaragua", ["Nicaragua", "Mosquito Coast"]), // Tratado de Manágua, 28/jan/1860 (Reserva Mosquito autônoma até 1894)
    { y: 1846, y1: 1846, r: { "Alta California": "Alta Califórnia (guerra mexicano-americana)", "New Mexico": "Novo México (ocupação americana)" }, f: { "Alta California": "blank", "New Mexico": "h:us28" }, o: { "Alta California": null, "New Mexico": null } }, // Los Angeles retomada pelos californios em set/1846
    { y: 1847, y1: 1847, r: { "Alta California": "Alta Califórnia (ocupação americana)", "New Mexico": "Novo México (ocupação americana)" }, f: { "Alta California": "h:us29", "New Mexico": "h:us29" }, o: { "Alta California": null, "New Mexico": null } }, // Tratado de Cahuenga, 13/jan/1847
    { y: 1846, y1: 1847, m: ["México", "x:mx", ["Mexico", "Mexican Cession"]] },
    { y: 1847, y1: 1847, r: { "Mexico": "México (capital ocupada pelos EUA)" } }, // Cidade do México tomada em set/1847
    { y: 1846, y1: 1847, r: { "Yucatan": "República de Yucatán" }, f: { "Yucatan": "blank" }, o: { "Yucatan": null } }, // independente desde 1/jan/1846
    { y: 1788, y1: 1859, r: { "Mosquito Coast": "Costa dos Mosquitos (protetorado britânico)" }, f: { "Mosquito Coast": "blank" }, o: { "Mosquito Coast": "Reino Unido" } }, // protetorado de 1844 a 1860
    { y: 1788, y1: 1848, r: { "Punjab": "Império Sikh" }, f: { "Punjab": "blank" }, o: { "Punjab": null } }, // sob regência britânica desde 1846 (Tratado de Lahore)
    { y: 1848, y1: 1848, r: { "Hungary": "Reino da Hungria (revolução de 1848)", "Sicily": "Reino da Sicília (revolução de 1848)", "Venice": "República de San Marco" }, f: { "Hungary": "blank", "Sicily": "blank", "Venice": "blank" }, o: { "Hungary": null, "Sicily": null, "Venice": null } }, // Pest tomada em 5/jan/1849
    { y: 1848, y1: 1848, r: { "Papal States": "Estados Papais (papa refugiado em Gaeta)" } },
    { y: 1788, y1: 1846, r: { "Lucca": "Ducado de Lucca" }, f: { "Lucca": "blank" }, o: { "Lucca": null } },
    { y: 1848, y1: 1850, r: { "Romania": "Principado da Moldávia (ocupação russa)", "Wallachia": "Principado da Valáquia (ocupação russa e otomana)" }, f: { "Romania": "x:ru", "Wallachia": "blank" } }, // abr/1848 e set/1848 até 1851
    { y: 1848, y1: 1848, r: { "Duchy of Schleswig": "Schleswig (Primeira Guerra do Schleswig)", "Duchy of Holstein": "Holstein (governo provisório de Schleswig-Holstein)" }, f: { "Duchy of Schleswig": "blank", "Duchy of Holstein": "blank" }, o: { "Duchy of Schleswig": null, "Duchy of Holstein": null } },
    { y: 1849, y1: 1849, r: { "Duchy of Schleswig": "Schleswig (comissão mista do armistício)", "Duchy of Holstein": "Holstein (lugar-tenência alemã)" }, f: { "Duchy of Schleswig": "blank", "Duchy of Holstein": "blank" }, o: { "Duchy of Schleswig": null, "Duchy of Holstein": null } }, // armistício de 10/jul/1849
    { y: 1850, y1: 1850, r: { "Duchy of Holstein": "Holstein (governo de Schleswig-Holstein)" }, f: { "Duchy of Holstein": "blank" }, o: { "Duchy of Holstein": null } }, // exército dissolvido em 1/abr/1851
    { y: 1839, y1: 1846, r: { "Liberia": "Commonwealth da Libéria (Sociedade Americana de Colonização)" }, f: { "Liberia": "blank" } }, // independência em 26/jul/1847, bandeira em 24/ago/1847
    { y: 1788, y1: 1850, m: ["Nova Gales do Sul (britânica)", "x:gb", ["New South Wales (UK)", "Victoria (UK)"]] }, // Vitória separada em 1/jul/1851
    { y: 1836, y1: 1847, r: { "Orange Free State": "Transorângia (bôeres e griquas)" }, f: { "Orange Free State": "blank" }, o: { "Orange Free State": null } }, // Grande Jornada desde 1835–1836
    { y: 1788, y1: 1835, r: { "Orange Free State": "Transorângia (griquas)" }, f: { "Orange Free State": "blank" }, o: { "Orange Free State": null } }, // Soberania do Rio Orange em 3/fev/1848
    { y: 1831, y1: 1850, m: ["Confederação Argentina", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal"]] }, // Rosas
    { y: 1839, y1: 1850, r: { "Uruguay": "Uruguai (Guerra Grande)" } },
    { y: 1820, y1: 1848, r: { "Haiti": "Haiti" } }, // Faustin I imperador em ago/1849
    { y: 1788, y1: 1848, r: { "British Columbia": "Nova Caledônia e Colúmbia (Cia. da Baía de Hudson)" }, f: { "British Columbia": "x:gb" }, o: { "British Columbia": "Reino Unido" } }, // colônia da Ilha de Vancouver em 1849
    // revisão 1851–1855 (situação em 31/dez)
    { y: 1812, y1: 1855, m: ["Império Russo", "x:ru", ["Russian Empire", "Southern Bessarabia"]] }, // sul da Bessarábia devolvido à Moldávia pelo Tratado de Paris (1856)
    { y: 1853, y1: 1853, r: { "Romania": "Principado da Moldávia (ocupação russa)", "Wallachia": "Principado da Valáquia (ocupação russa)" }, f: { "Romania": "x:ru", "Wallachia": "x:ru" } }, // jul/1853 a jul/1854
    { y: 1854, y1: 1855, r: { "Romania": "Principado da Moldávia (ocupação austríaca)", "Wallachia": "Principado da Valáquia (ocupação austríaca)" }, f: { "Romania": "h:at_hab", "Wallachia": "h:at_hab" } }, // administração austríaca neutra (1854–1856)
    { y: 1788, y1: 1851, r: { "Montenegro": "Príncipe-Bispado de Montenegro" } }, // principado secular em 13/mar/1852
    { y: 1848, y1: 1853, r: { "Orange Free State": "Soberania do Rio Orange (britânica)" }, f: { "Orange Free State": "x:gb" }, o: { "Orange Free State": "Reino Unido" } }, // Estado Livre em 23/fev/1854
    { y: 1838, y1: 1851, r: { "Transvaal": "Transvaal (bôeres, independência não reconhecida)" }, f: { "Transvaal": "blank" }, o: { "Transvaal": null } }, // Convenção do Rio Sand, 17/jan/1852
    { y: 1851, y1: 1851, m: ["Confederação Argentina (guerra civil)", "blank", ["Argentina", "State of Buenos Aires", "Liga Federal"]] },
    { y: 1852, y1: 1860, m: ["Confederação Argentina", "x:ar", ["Argentina", "Liga Federal"]] }, // Entre Ríos e Corrientes contra Rosas; Caseros em 3/fev/1852
    { y: 1788, y1: 1851, m: ["Reino da Birmânia", "blank", ["Upper Burma", "Pegu"]] },
    { y: 1852, y1: 1852, r: { "Pegu": "Pegu (ocupação britânica)" }, f: { "Pegu": "x:gb" }, o: { "Pegu": null } }, // tomada em 3/jun/1852
    { y: 1788, y1: 1855, r: { "Oudh": "Reino de Awadh" }, f: { "Oudh": "blank" }, o: { "Oudh": null } },
    // bandeiras e situações fixas do mapa de 1900 corrigidas para 1816–1899 (fontes: Wikipedia)
    ...perYear(1813, 1829, { f: { "France": "h:fr_bourbon", "Martinique": "h:fr_bourbon", "Guadeloupe": "h:fr_bourbon", "French India": "h:fr_bourbon", "Senegal FR": "h:fr_bourbon", "Reunion": "h:fr_bourbon", "Saint Martin": "h:fr_bourbon", "Saint Pierre and Miquelon": "h:fr_bourbon", "French Guiana": "h:fr_bourbon" } }), // bandeira branca da Restauração até jul/1830
    ...perYear(1788, 1840, { f: { "Switzerland": "blank" } }), // bandeira federal das tropas a partir de 1841
    ...perYear(1788, 1844, { f: { "Luxembourg": "blank" } }), // tricolor fixada em 12/jun/1845
    ...perYear(1788, 1830, { f: { "Tunisia": "blank" } }), // aprovada em 1831
    ...perYear(1788, 1853, { f: { "Imperial Japan": "blank" } }), // navios japoneses com o Hinomaru a partir de 1854
    ...perYear(1788, 1854, { f: { "Rattanakosin Kingdom": "blank" } }), // bandeira do elefante oficial em 1855
    ...perYear(1788, 1843, { f: { "Sweden–Norway": "blank" } }),
    ...perYear(1814, 1843, { f: { "Norway": "blank" } }), // marca da união em 20/jun/1844
    ...perYear(1788, 1847, { f: { "Italy": "blank" } }), // tricolor com o escudo de Saboia em mar/1848
    ...perYear(1788, 1855, { m: ["Mascate e Omã", "h:om_red", ["Oman", "Sultanate of Zanzibar", "Zanzibar"]] }), // Zanzibar e Omã separados em 19/out/1856
    ...perYear(1788, 1840, { r: { "Comoros": "Sultanatos das Comores" }, f: { "Comoros": "blank" }, o: { "Comoros": null } }),
    ...perYear(1841, 1885, { r: { "Comoros": "Sultanatos das Comores (Mayotte francesa desde 1841)" }, f: { "Comoros": "blank" }, o: { "Comoros": null } }), // protetorado em 1886–1887
    ...perYear(1788, 1843, { r: { "Saint Barthelemy": "São Bartolomeu (Suécia)" }, f: { "Saint Barthelemy": "blank" }, o: { "Saint Barthelemy": "Suécia" } }), // sueca de 1784 a 16/mar/1878
    ...perYear(1844, 1877, { r: { "Saint Barthelemy": "São Bartolomeu (Suécia)" }, f: { "Saint Barthelemy": "h:se_union" }, o: { "Saint Barthelemy": "Suécia" } }),
    ...perYear(1788, 1841, { r: { "French Polynesia": "Reino do Taiti" }, f: { "French Polynesia": "blank" }, o: { "French Polynesia": null } }), // protetorado francês em 1842
    ...perYear(1788, 1819, { r: { "Trucial Oman": "Xeicados da costa do Golfo Pérsico" }, f: { "Trucial Oman": "blank" }, o: { "Trucial Oman": null } }), // Tratado Marítimo Geral, 8/jan/1820
    ...perYear(1820, 1891, { r: { "Trucial Oman": "Estados da Trégua (tratados com o Reino Unido)" }, f: { "Trucial Oman": "blank" }, o: { "Trucial Oman": null } }), // Acordo Exclusivo em mar/1892
    ...perYear(1788, 1879, { r: { "Bahrain": "Bahrein" }, f: { "Bahrain": "blank" }, o: { "Bahrain": null } }), // acordos de 1880 e 1892 selam o protetorado
    ...perYear(1788, 1886, { r: { "Maldives": "Sultanato das Maldivas" }, f: { "Maldives": "blank" }, o: { "Maldives": null } }), // protetorado em 1887
    ...perYear(1788, 1843, { r: { "Mosquito Coast": "Reino Mosquito" }, f: { "Mosquito Coast": "blank" }, o: { "Mosquito Coast": null } }), // protetorado britânico de 1844 a 1860
    ...perYear(1809, 1816, { r: { "French Guiana": "Guiana Francesa (ocupação luso-brasileira)" }, f: { "French Guiana": "blank" }, o: { "French Guiana": null } }), // jan/1809 a 8/nov/1817
    ...perYear(1813, 1813, { r: { "Reunion": "Reunião (ocupação britânica)", "Guadeloupe": "Guadalupe (ocupação britânica)" }, f: { "Reunion": "x:gb", "Guadeloupe": "x:gb" }, o: { "Reunion": null, "Guadeloupe": null } }), // devolvidas pelo Tratado de Paris de 1814
    ...perYear(1809, 1814, { r: { "Martinique": "Martinica (ocupação britânica)", "Netherlands Antilles": "Curaçao (ocupação britânica)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas (ocupação britânica)" }, f: { "Martinique": "x:gb", "Netherlands Antilles": "x:gb", "United States Virgin Islands": "x:gb" }, o: { "Martinique": null, "Netherlands Antilles": null, "United States Virgin Islands": null } }), // Martinica até 1815; Curaçao até 1815; Índias dinamarquesas até 20/nov/1815
    ...perYear(1804, 1815, { r: { "Dutch Guiana": "Suriname (ocupação britânica)" }, f: { "Dutch Guiana": "x:gb" }, o: { "Dutch Guiana": null } }), // 1804–1816
    ...perYear(1813, 1813, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "Lucca", "Papal States", "Umbria", "Catalonia"]], o: { "France": null } }), // Império até 6/abr/1814
    ...perYear(1813, 1813, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Marche and Umbria", "Trentino", "Novara"]], o: { "Lombardy": null } }), // Eugênio; armistício em fev/1814
    ...perYear(1788, 1813, { m: ["Dinamarca-Noruega", "x:dk", ["Denmark", "Norway"]] }), // Tratado de Kiel, 14/jan/1814
    ...perYear(1812, 1814, { r: { "United States of America": "Estados Unidos (Guerra de 1812)" } }), // 18/jun/1812 a 17/fev/1815
    ...perYear(1788, 1813, { r: { "Sweden–Norway": "Suécia" } }), // união com a Noruega em 4/nov/1814
    ...perYear(1812, 1812, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "Lucca", "Papal States", "Umbria", "Catalonia", "Netherlands", "NRW", "Grand Duchy of Oldenburg", "Free City of Bremen", "Free City of Hamburg", "Free City of Lübeck", "Illyria", "Dalmatia", "Gorizia", "Dubrovnik", "Bay of Kotor", "Valais", "Geneva"]], o: { "France": null } }), // Holanda (9/jul/1810), departamentos hanseáticos (13/dez/1810), Valais (dez/1810), Províncias Ilírias (1809); NRW aprox. (Roer e Lippe franceses, Berg satélite)
    ...perYear(1812, 1812, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Marche and Umbria", "Trentino", "Novara"]], o: { "Lombardy": null } }),
    ...perYear(1811, 1811, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "Lucca", "Papal States", "Umbria", "Netherlands", "NRW", "Grand Duchy of Oldenburg", "Free City of Bremen", "Free City of Hamburg", "Free City of Lübeck", "Illyria", "Dalmatia", "Gorizia", "Dubrovnik", "Bay of Kotor", "Valais", "Geneva"]], o: { "France": null } }), // Catalunha anexada em 1812
    ...perYear(1810, 1810, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "Lucca", "Papal States", "Umbria", "Netherlands", "NRW", "Grand Duchy of Oldenburg", "Illyria", "Dalmatia", "Gorizia", "Dubrovnik", "Bay of Kotor", "Valais", "Geneva"]], o: { "France": null } }), // Valais em 12/nov/1810; Holanda em 9/jul/1810; departamento das Bocas do Elba só em 1811
    ...perYear(1809, 1809, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "Lucca", "Papal States", "Umbria", "NRW", "Illyria", "Dalmatia", "Gorizia", "Dubrovnik", "Bay of Kotor", "Geneva"]], o: { "France": null } }), // Estados Papais anexados em 17/mai/1809; Províncias Ilírias por Schönbrunn (14/out/1809)
    ...perYear(1810, 1810, { m: ["Províncias Unidas do Rio da Prata", "blank", ["Argentina", "Bolivia", "Bolivian Litoral"]] }), // Alto Peru sob os patriotas após Suipacha (7/nov/1810) até Huaqui (20/jun/1811)
    ...perYear(1810, 1811, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Marche and Umbria", "Trentino", "Novara"]], o: { "Lombardy": null } }),
    ...perYear(1809, 1809, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Marche and Umbria", "Novara"]], o: { "Lombardy": null } }),
    ...perYear(1808, 1808, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "NRW", "Geneva"]], o: { "France": null } }), // Roma anexada em 17/mai/1809; Províncias Ilírias por Schönbrunn
    ...perYear(1807, 1807, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Tuscany", "NRW", "Geneva"]], o: { "France": null } }), // Etrúria dissolvida em 10/dez/1807; Parma cedida à França em 1801
    ...perYear(1808, 1808, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Marche and Umbria", "Novara", "Dalmatia", "Dubrovnik", "Bay of Kotor"]], o: { "Lombardy": null } }),
    ...perYear(1807, 1807, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Novara", "Dalmatia", "Bay of Kotor"]], o: { "Lombardy": null } }),
    ...perYear(1806, 1806, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "NRW", "Geneva"]], o: { "France": null } }), // Parma cedida à França em 1801
    ...perYear(1806, 1806, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Novara", "Dalmatia"]], o: { "Lombardy": null } }),
    ...perYear(1805, 1805, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Liguria", "Savoy and Nice", "Duchy of Parma", "Geneva"]], o: { "France": null } }), // Ligúria anexada em 1805
    ...perYear(1805, 1805, { m: ["Reino da Itália (napoleônico)", "blank", ["Lombardy", "Venetia", "Venice", "Duchy of Modena", "Romagna", "Novara", "Dalmatia", "Bay of Kotor"]], o: { "Lombardy": null } }), // Vêneto, Ístria e Dalmácia pela Paz de Pressburgo (26/dez/1805)
    // revisão 1805 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1795, 1805, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "Posen", "Congress Poland", "NRW"]], o: { "Germany": null } }), // aprox.: o NRW era quase todo prussiano (Berg bávaro até 15/mar/1806)
    ...perYear(1788, 1805, { m: ["Reinos de Nápoles e Sicília (Fernando IV)", "blank", ["Two Sicilies", "Sicily"]], o: { "Two Sicilies": null } }), // José Bonaparte rei em 30/mar/1806
    ...perYear(1804, 1805, { m: ["Império do Haiti (Jacques I)", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // Dessalines morto em 17/out/1806
    ...perYear(1788, 1805, { m: ["Principado da Moldávia", "blank", ["Romania", "Bessarabia", "Southern Bessarabia"]], o: { "Romania": null } }), // tropas russas só com a guerra de 1806
    ...perYear(1788, 1805, { r: { "Ionian Islands": "República Septinsular (protetorado russo)", "Dominican Republic": "Santo Domingo (França)", "Senegal FR": "Senegal (França)", "Portugal": "Reino de Portugal",
      "Tuscany": "Reino da Etrúria", "Duchy of Brunswick": "Principado de Brunsvique-Wolfenbüttel", "Netherlands Antilles": "Curaçao (República Batava)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas" },
      f: { "Ionian Islands": "blank", "Dominican Republic": "x:fr", "Senegal FR": "x:fr", "Portugal": "blank", "Tuscany": "blank", "Duchy of Brunswick": "blank", "Netherlands Antilles": "blank", "United States Virgin Islands": "x:dk" },
      o: { "Ionian Islands": null, "Dominican Republic": "França", "Senegal FR": "França", "Portugal": null, "Tuscany": null, "Duchy of Brunswick": null, "United States Virgin Islands": "Dinamarca" } }),
    ...perYear(1788, 1805, { r: { "Romania": "Principado da Moldávia", "Wallachia": "Principado da Valáquia", "Netherlands": "República Batava", "Kingdom of Bavaria": "Eleitorado da Baviera", "Kingdom of Württemberg": "Eleitorado de Württemberg",
      "Grand Duchy of Baden": "Eleitorado de Baden", "Kingdom of Saxony": "Eleitorado da Saxônia", "Grand Duchy of Hesse": "Landgraviato de Hesse-Darmstadt", "Duchy of Nassau": "Principados de Nassau", "Electorate of Hesse": "Eleitorado de Hesse",
      "Kingdom of Hanover": "Eleitorado de Hanôver", "Dubrovnik": "República de Ragusa", "Cape Colony": "Colônia do Cabo (República Batava)" },
      f: { "Romania": "blank", "Wallachia": "blank", "Netherlands": "blank", "Electorate of Hesse": "blank", "Kingdom of Hanover": "blank", "Dubrovnik": "blank", "Cape Colony": "blank" },
      o: { "Romania": null, "Wallachia": null, "Netherlands": null, "Electorate of Hesse": null, "Kingdom of Hanover": null, "Dubrovnik": null, "Cape Colony": "República Batava", "Netherlands Indies": "República Batava", "Netherlands Antilles": "República Batava" } }), // reis da Baviera e de Württemberg em 1/jan/1806; Reino da Holanda em 5/jun/1806; Cabo britânico em 8/jan/1806; Hanôver cedido à Prússia em dez/1805, ocupado no início de 1806
    ...perYear(1806, 1806, { m: ["Reino da Prússia (invasão francesa)", "blank", ["Germany", "Altmark", "Posen", "Congress Poland"]], o: { "Germany": null } }), // Berlim ocupada em 27/out/1806; o rei refugiado na Prússia Oriental; franceses na Polônia no fim de 1806
    ...perYear(1805, 1808, { r: { "Lucca": "Principado de Lucca e Piombino" }, f: { "Lucca": "blank" }, o: { "Lucca": null } }), // Estado-cliente de 1805; parte da Toscana (francesa) desde 3/mar/1809
    ...perYear(1788, 1807, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria"]], o: { "Papal States": null } }), // bandeira amarela e vermelha sem descrição exata
    ...perYear(1788, 1807, { m: ["Espanha", "x:es", ["Spain", "Catalonia"]] }), // aliada da França até 1808
    ...perYear(1788, 1807, { r: { "Sierra Leone GB": "Serra Leoa (assentamento de Freetown)" }, f: { "Sierra Leone GB": "blank" }, o: { "Sierra Leone GB": null } }), // colônia da Coroa em 1/jan/1808
    // nomes anacrônicos corrigidos (fontes: Wikipedia)
    ...perYear(1788, 1844, { r: { "Tonga": "Tonga (guerra civil)" } }), // guerra civil desde 1799; reino unificado em 1845
    ...perYear(1788, 1821, { r: { "Basutoland": null } }), // Moshoeshoe rei em 1822
    ...perYear(1788, 1817, { r: { "Peshawar": "Peshawar" } }), // sardares barakzais só depois de 1818 (pendente)
    ...perYear(1805, 1820, { r: { "British Columbia": "Nova Caledônia (postos de peles britânicos)" } }), // postos de Simon Fraser desde 1805; fusão com a Cia. da Baía de Hudson em 1821
    ...perYear(1806, 1807, { r: { "Two Sicilies": "Reino de Nápoles (José Bonaparte)" } }), // 30/mar/1806 a 6/jun/1808; Murat desde 1/ago/1808
    ...perYear(1788, 1809, { r: { "Seychelles": "Seicheles (França)" }, f: { "Seychelles": "x:fr" }, o: { "Seychelles": "França" } }), // britânicas desde dez/1810
    ...perYear(1803, 1813, { r: { "British Guiana": "Demerara-Essequibo e Berbice (ocupação britânica)" }, f: { "British Guiana": "x:gb" }, o: { "British Guiana": null } }), // colônias holandesas tomadas em 1803; cedidas em 1814
    ...perYear(1814, 1830, { r: { "British Guiana": "Demerara-Essequibo e Berbice (britânicas)" } }), // Guiana Britânica em 21/jul/1831
    ...perYear(1803, 1813, { r: { "Saint Pierre and Miquelon": "Saint-Pierre e Miquelon (ocupação britânica)" }, f: { "Saint Pierre and Miquelon": "x:gb" }, o: { "Saint Pierre and Miquelon": null } }), // retomadas em 1803; devolvidas pelo Tratado de Paris de 1814
    ...perYear(1803, 1815, { r: { "French India": "Índia Francesa (ocupação britânica)" }, f: { "French India": "x:gb" }, o: { "French India": null } }), // ago/1803 a 26/set/1816
    ...perYear(1788, 1814, { r: { "Gambia": null } }), // presença britânica desde 1815–1816
    ...perYear(1788, 1861, { r: { "Belize": "Assentamento de Belize (britânico)" } }), // colônia de Honduras Britânica em 12/mai/1862
    ...perYear(1788, 1814, { r: { "Mecklenburg-Schwerin": "Ducado de Mecklemburgo-Schwerin", "Mecklenburg-Strelitz": "Ducado de Mecklemburgo-Strelitz" } }), // grão-ducados no Congresso de Viena (1815)
    ...perYear(1788, 1838, { r: { "French Indochina": "Vietnã (dinastia Nguyễn)" } }), // nome Việt Nam desde 1804; Đại Nam em 1839
    ...perYear(1788, 1841, { r: { "Siamese Malay States": "Kedah, Kelantan e Terengganu (tributários do Sião)" } }), // Perlis separado de Kedah em 1842
    ...perYear(1818, 1835, { r: { "Hail": "Ha'il" } }), // Emirado de Jabal Shammar fundado em 1836
    ...perYear(1820, 1823, { r: { "Riyadh": "Négede (ocupação egípcia)" }, f: { "Riyadh": "h:eg_khed" } }), // Turki retoma Riad das forças otomano-egípcias em 1824
    ...perYear(1838, 1840, { r: { "Riyadh": "Négede (ocupação egípcia; Khalid bin Saud)" }, f: { "Riyadh": "h:eg_khed" } }), // Faisal preso em 1838; retirada após a Convenção de Londres (1840)
    ...perYear(1829, 1831, { r: { "Western Australia (UK)": "Colônia do Rio Swan (britânica)" } }), // 17/jun/1829; Austrália Ocidental em 6/fev/1832
    ...perYear(1788, 1807, { m: ["Suécia", "blank", ["Sweden–Norway", "Finland"]] }), // Guerra Finlandesa a partir de fev/1808
    ...perYear(1805, 1808, { m: ["Reino da Baviera", "blank", ["Kingdom of Bavaria", "Tyrol", "Trentino"]] }),
    ...perYear(1805, 1808, { m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Hungary", "Salzburg", "Tarnopol", "Illyria", "Gorizia", "Kraków"]] }), // aprox.: a Ístria veneziana era do Reino da Itália
    ...perYear(1808, 1808, { m: ["Estados Papais (ocupação francesa)", "x:fr", ["Papal States", "Umbria"]], o: { "Papal States": null } }), // Marcas anexadas ao Reino da Itália em 2/abr/1808
    ...perYear(1807, 1808, { r: { "Netherlands Antilles": "Curaçao (ocupação britânica)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas (ocupação britânica)" }, f: { "Netherlands Antilles": "x:gb", "United States Virgin Islands": "x:gb" }, o: { "Netherlands Antilles": null, "United States Virgin Islands": null } }), // Martinica britânica em 24/fev/1809; Caiena portuguesa em 14/jan/1809
    ...perYear(1809, 1809, { m: ["Reino da Baviera", "blank", ["Kingdom of Bavaria", "Tyrol", "Salzburg", "Trentino"]] }), // Salzburgo cedido à Baviera por Schönbrunn; Trentino passa à Itália em 1810
    ...perYear(1788, 1809, { m: ["Vice-Reino do Rio da Prata (Espanha)", "x:es", ["Argentina", "State of Buenos Aires", "Liga Federal", "Uruguay", "Paraguay", "Bolivia", "Bolivian Litoral"]], o: { "Argentina": "Espanha" } }), // vice-rei Cisneros (jul/1809 a 25/mai/1810); juntas de La Paz e Chuquisaca esmagadas em 1809
    ...perYear(1788, 1809, { m: ["Vice-Reino de Nova Granada (Espanha)", "x:es", ["Panama", "Ecuador", "Colombia"]], o: { "Panama": "Espanha" } }),
    ...perYear(1806, 1811, { m: ["Principado da Moldávia (ocupação russa)", "x:ru", ["Romania", "Bessarabia", "Southern Bessarabia"]], o: { "Romania": null } }), // Guerra Russo-Turca (1806–1812); Bessarábia cedida em 28/mai/1812
    ...perYear(1808, 1811, { m: ["Espanha (Guerra Peninsular)", "x:es", ["Spain", "Catalonia"]] }), // Catalunha anexada à França só em 1812
    ...perYear(1806, 1811, { r: { "Wallachia": "Principado da Valáquia (ocupação russa)" }, f: { "Wallachia": "x:ru" }, o: { "Wallachia": null } }),
    ...perYear(1810, 1812, { r: { "Reunion": "Reunião (ocupação britânica)", "Guadeloupe": "Guadalupe (ocupação britânica)", "Malta": "Malta (protetorado britânico)" }, f: { "Reunion": "x:gb", "Guadeloupe": "x:gb", "Malta": "x:gb" }, o: { "Reunion": null, "Guadeloupe": null, "Malta": null } }), // Malta colônia em 1813
    ...perYear(1788, 1812, { r: { "Austria Hungary": "Império Austríaco" } }),
    ...perYear(1788, 1805, { r: { "Kingdom of Bavaria": "Eleitorado da Baviera" } }), // rei em 1/jan/1806
    ...perYear(1802, 1804, { m: ["Império Francês", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Piedmont", "Savoy and Nice", "Duchy of Parma", "Geneva"]], o: { "France": null } }), // Império proclamado em 18/mai/1804; Piemonte anexado em 1802
    // revisão 1804 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1802, 1804, { m: ["República Italiana", "blank", ["Lombardy", "Duchy of Modena", "Romagna", "Novara"]], o: { "Lombardy": null } }), // 1802–1805; reino proclamado em 17/mar/1805
    ...perYear(1798, 1804, { m: ["Império Austríaco", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Kraków", "Tyrol", "Trentino", "Venetia", "Venice", "Dalmatia", "Bay of Kotor"]] }), // proclamado em 11/ago/1804; Trento secularizado para o Tirol em 1803; cessões só em Pressburgo (26/dez/1805)
    ...perYear(1797, 1804, { r: { "Liguria": "República Lígure", "Lucca": "República de Lucca", "Salzburg": "Eleitorado de Salzburgo", "Kingdom of Hanover": "Eleitorado de Hanôver (ocupação francesa)", "British Columbia": null },
      f: { "Liguria": "h:genoa", "Lucca": "blank", "Salzburg": "blank", "Kingdom of Hanover": "x:fr" }, o: { "Liguria": null, "Lucca": null, "Salzburg": null, "Kingdom of Hanover": null } }), // Lígure anexada em 4/jun/1805 (cruz vermelha em branco); Lucca até 23/jun/1805; eleitorado de Salzburgo 1803–1805; Hanôver ocupado desde 26/mai/1803
    // revisão 1803 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1803, 1803, { m: ["Saint-Domingue (exército de Dessalines)", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // Vertières (18/nov/1803); franceses evacuam o Cabo em 30/nov/1803; independência em 1/jan/1804
    ...perYear(1791, 1803, { m: ["Império Otomano", "blank", ["Ottoman Empire", "Serbia"]] }), // Primeira Revolta Sérvia em 14/fev/1804
    ...perYear(1788, 1803, { r: { "France": "República Francesa (Consulado)", "Austria Hungary": "Monarquia de Habsburgo", "Dutch Guiana": "Suriname (República Batava)" },
      f: { "Dutch Guiana": "blank" }, o: { "Dutch Guiana": "República Batava" } }), // Império Francês em 18/mai/1804; Império Austríaco em 11/ago/1804; Suriname britânico de 1804 a 1816
    ...perYear(1788, 1817, { r: { "Oudh": "Awadh (nababos)" } }), // Ghazi-ud-Din Haidar rei (badshah) em out/1818–1819
    // revisão 1802 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1788, 1802, { m: ["Luisiana (Espanha)", "x:es", ["Louisiana N", "Louisiana S"]], o: { "Louisiana N": "Espanha" } }), // entregue à França em 30/nov/1803 e aos EUA em 20/dez/1803
    ...perYear(1802, 1802, { m: ["Saint-Domingue (guerra de independência)", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // expedição de Leclerc (morto em 1/nov/1802); Pétion, Christophe e Dessalines desertam em out/1802
    ...perYear(1788, 1802, { r: { "Switzerland": "República Helvética", "Salzburg": "Principado-Arcebispado de Salzburgo", "Kingdom of Hanover": "Eleitorado de Hanôver", "Kingdom of Württemberg": "Ducado de Württemberg",
      "Grand Duchy of Baden": "Margraviato de Baden", "Electorate of Hesse": "Landgraviato de Hesse-Kassel", "Cape Colony": "Colônia do Cabo (ocupação britânica)", "British Guiana": "Demerara-Essequibo e Berbice (República Batava)" },
      f: { "Switzerland": "blank", "Kingdom of Hanover": "blank", "Cape Colony": "x:gb", "British Guiana": "blank" }, o: { "Kingdom of Hanover": null, "Cape Colony": null, "British Guiana": "República Batava" } }), // Ato de Mediação em 19/fev/1803; eleitorados de Baden, Württemberg, Hesse e Salzburgo em 1803; Hanôver invadido em 26/mai/1803; Cabo devolvido em 1803; Paz de Amiens (25/mar/1802)
    // revisão 1801 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1801, 1801, { m: ["República Francesa (Consulado)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice", "Duchy of Parma", "Geneva"]], o: { "France": null } }), // margem esquerda do Reno cedida em Lunéville (9/fev/1801)
    ...perYear(1800, 1801, { m: ["República Subalpina (ocupação francesa)", "x:fr", ["Piedmont", "Novara"]], o: { "Piedmont": null } }), // 20/jun/1800 a 11/set/1802, sob ocupação militar francesa
    ...perYear(1800, 1801, { m: ["República Cisalpina", "blank", ["Lombardy", "Duchy of Modena", "Romagna"]], o: { "Lombardy": null } }), // República Italiana em 26/jan/1802
    ...perYear(1801, 1801, { m: ["Saint-Domingue (governo de Toussaint Louverture)", "blank", ["Haiti", "Kingdom of Haiti", "Dominican Republic"]], o: { "Haiti": null } }), // tomou Santo Domingo em jan/1801; constituição de 1801 (governador-geral vitalício)
    ...perYear(1798, 1801, { m: ["República Helvética", "blank", ["Switzerland", "Valais"]] }), // Valais separado em ago/1802
    ...perYear(1801, 1801, { r: { "Martinique": "Martinica (ocupação britânica)", "Dutch Guiana": "Suriname (ocupação britânica)", "British Guiana": "Demerara-Essequibo e Berbice (ocupação britânica)", "French India": "Índia Francesa (ocupação britânica)",
      "United States Virgin Islands": "Índias Ocidentais Dinamarquesas (ocupação britânica)", "Saint Barthelemy": "São Bartolomeu (ocupação britânica)" },
      f: { "Martinique": "x:gb", "Dutch Guiana": "x:gb", "British Guiana": "x:gb", "French India": "x:gb", "United States Virgin Islands": "x:gb", "Saint Barthelemy": "x:gb" },
      o: { "Martinique": null, "Dutch Guiana": null, "British Guiana": null, "French India": null, "United States Virgin Islands": null, "Saint Barthelemy": null } }), // devolvidos pela Paz de Amiens (1802); Índias dinamarquesas e São Bartolomeu ocupadas em mar/1801
    // revisão 1800 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1798, 1800, { m: ["República Francesa (Consulado)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice", "Geneva"]], o: { "France": null } }), // Parma cedida em 21/mar/1801
    ...perYear(1800, 1800, { m: ["Saint-Domingue (governo de Toussaint Louverture)", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // Santo Domingo tomado em jan/1801
    ...perYear(1788, 1800, { r: { "Martinique": "Martinica (ocupação britânica)", "Dutch Guiana": "Suriname (ocupação britânica)", "British Guiana": "Demerara-Essequibo e Berbice (ocupação britânica)", "French India": "Índia Francesa (ocupação britânica)",
      "United Kingdom of Great Britain and Ireland": "Reino da Grã-Bretanha", "Ireland": "Reino da Irlanda", "Dominican Republic": "Santo Domingo (Espanha)", "Egypt": "Egito (ocupação francesa)",
      "Tuscany": "Grão-Ducado da Toscana", "Lucca": "Lucca (ocupação francesa)", "Duchy of Parma": "Ducado de Parma" },
      f: { "Martinique": "x:gb", "Dutch Guiana": "x:gb", "British Guiana": "x:gb", "French India": "x:gb", "United Kingdom of Great Britain and Ireland": "h:gb1707", "Ireland": "blank", "Dominican Republic": "x:es", "Egypt": "x:fr",
        "Tuscany": "blank", "Lucca": "x:fr", "Duchy of Parma": "blank" },
      o: { "Martinique": null, "Dutch Guiana": null, "British Guiana": null, "French India": null, "Ireland": null, "Dominican Republic": "Espanha", "Egypt": null, "Tuscany": null, "Lucca": null, "Duchy of Parma": null } }), // União com a Irlanda em 1/jan/1801; franceses no Egito até set/1801; Lucca ocupada em 9/jul/1800; Etrúria em 21/mar/1801
    // revisão 1799 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1799, 1799, { m: ["República Cisalpina (ocupação austríaca)", "h:at_hab", ["Lombardy", "Duchy of Modena", "Romagna"]], o: { "Lombardy": null } }), // ocupada pela Áustria em 27/abr/1799; restaurada em jun/1800
    ...perYear(1799, 1799, { m: ["Piemonte (ocupação austro-russa)", "blank", ["Piedmont", "Novara"]], o: { "Piedmont": null } }), // República Piemontesa (1798–1799); República Subalpina em jun/1800
    ...perYear(1799, 1799, { m: ["Saint-Domingue (Guerra do Sul)", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // Toussaint contra Rigaud, jun/1799 a jul/1800
    ...perYear(1799, 1799, { r: { "Papal States": "Estados Papais (ocupação napolitana)", "Malta": "Malta (cerco de Valletta)", "Ionian Islands": "Ilhas Jônicas (ocupação russo-otomana)", "Lucca": "Lucca (ocupação austríaca)", "Tuscany": "Grão-Ducado da Toscana" },
      f: { "Papal States": "blank", "Malta": "blank", "Ionian Islands": "blank", "Lucca": "h:at_hab", "Tuscany": "blank" },
      o: { "Papal States": null, "Malta": null, "Ionian Islands": null, "Lucca": null, "Tuscany": null } }), // invasão napolitana em 30/set/1799; Valletta francesa sitiada (2/set/1798 a 4/set/1800); Corfu tomada em 4/mar/1799, República Septinsular em 2/abr/1800; Lucca ocupada em 17/jul/1799
    // revisão Cáucaso (fontes: Wikipedia — Kingdom of Kartli-Kakheti, Kingdom of Imereti, Principality of Mingrelia, Principality of Guria, Principality of Abkhazia, Treaty of Gulistan, Treaty of Turkmenchay, Treaty of Adrianople, canatos)
    ...perYear(1788, 1800, { r: { "Kartli-Kakheti": "Reino de Kartli-Kakheti" }, f: { "Kartli-Kakheti": "blank" }, o: { "Kartli-Kakheti": null } }),
    ...perYear(1801, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Kartli-Kakheti"]] }), // decreto de anexação em 18/dez/1800, confirmado em 12/set/1801
    ...perYear(1788, 1803, { r: { "Imereti": "Reino de Imereti" }, f: { "Imereti": "blank" }, o: { "Imereti": null } }),
    ...perYear(1804, 1809, { r: { "Imereti": "Reino de Imereti (vassalo russo)" }, f: { "Imereti": "blank" }, o: { "Imereti": null } }),
    ...perYear(1810, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Imereti"]] }), // vassalo em 25/abr/1804; anexado em 20/fev/1810
    ...perYear(1788, 1802, { r: { "Mingrelia": "Principado da Mingrélia" }, f: { "Mingrelia": "blank" }, o: { "Mingrelia": null } }),
    ...perYear(1803, 1866, { r: { "Mingrelia": "Principado da Mingrélia (vassalo russo)" }, f: { "Mingrelia": "blank" }, o: { "Mingrelia": null } }),
    ...perYear(1867, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Mingrelia"]] }), // vassalo em 1803; anexado em 4/jan/1867
    ...perYear(1788, 1809, { r: { "Guria": "Principado da Gúria" }, f: { "Guria": "blank" }, o: { "Guria": null } }),
    ...perYear(1810, 1828, { r: { "Guria": "Principado da Gúria (vassalo russo)" }, f: { "Guria": "blank" }, o: { "Guria": null } }),
    ...perYear(1829, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Guria"]] }), // suserania russa em 19/jun/1810; anexado em 2/set/1829
    ...perYear(1788, 1809, { r: { "Abkhazia": "Principado da Abecásia" }, f: { "Abkhazia": "blank" }, o: { "Abkhazia": null } }),
    ...perYear(1810, 1863, { r: { "Abkhazia": "Principado da Abecásia (vassalo russo)" }, f: { "Abkhazia": "blank" }, o: { "Abkhazia": null } }),
    ...perYear(1864, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Abkhazia"]] }), // Sukhum tomada em 2/jul/1810; absorvido em 1864
    ...perYear(1788, 1828, { m: ["Império Otomano", "blank", ["Ottoman Empire", "Samtskhe"]] }),
    ...perYear(1829, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Samtskhe"]] }), // Akhaltsikhe e Akhalkalaki cedidas em Adrianópolis (14/set/1829)
    ...perYear(1788, 1803, { r: { "Azerbaijani khanates": "Canatos do Azerbaijão" }, f: { "Azerbaijani khanates": "blank" }, o: { "Azerbaijani khanates": null } }),
    ...perYear(1804, 1805, { r: { "Azerbaijani khanates": "Canatos do Azerbaijão (guerra russo-persa)" }, f: { "Azerbaijani khanates": "blank" }, o: { "Azerbaijani khanates": null } }),
    ...perYear(1806, 1812, { r: { "Azerbaijani khanates": "Canatos do Azerbaijão (disputados, controlados pela Rússia)" }, f: { "Azerbaijani khanates": "blank" }, o: { "Azerbaijani khanates": null } }),
    ...perYear(1813, 1912, { m: ["Império Russo", "x:ru", ["Russian Empire", "Azerbaijani khanates"]] }), // Ganja tomada em jan/1804; Karabakh (1805), Shirvan, Quba e Baku (1806); Gulistão em 24/out/1813
    // revisão 1798 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1798, 1798, { m: ["República Francesa (Diretório)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice", "Geneva"]], o: { "France": null } }), // Consulado em nov/1799
    ...perYear(1798, 1798, { m: ["República Cisalpina", "blank", ["Lombardy", "Duchy of Modena", "Romagna"]], o: { "Lombardy": null } }),
    ...perYear(1798, 1798, { m: ["República Piemontesa (ocupação francesa)", "x:fr", ["Piedmont", "Novara"]], o: { "Piedmont": null } }), // Turim ocupada em 6/dez/1798; abdicação em 8/dez; república em 9/dez/1798
    ...perYear(1798, 1798, { m: ["República Romana", "blank", ["Papal States", "Umbria", "Marche and Umbria"]], o: { "Papal States": null } }), // proclamada em 15/fev/1798; franceses de volta a Roma em 14/dez/1798
    ...perYear(1798, 1798, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }), // pendente: controle de Toussaint e Rigaud em 1798
    ...perYear(1798, 1798, { r: { "Malta": "Malta (cerco de Valletta)", "Ionian Islands": "Ilhas Jônicas (domínio francês)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana",
      "Dutch Guiana": "Suriname (República Batava)", "Punjab": "Confederação Sikh", "Tonga": "Tonga" },
      f: { "Malta": "blank", "Ionian Islands": "x:fr", "Lucca": "blank", "Tuscany": "blank", "Dutch Guiana": "blank", "Punjab": "blank" },
      o: { "Malta": null, "Ionian Islands": "França", "Lucca": null, "Tuscany": null, "Dutch Guiana": "República Batava", "Punjab": null } }), // cerco desde 2/set/1798; domínio francês nas Jônicas de jun/1797 a mar/1799; franceses em Lucca em 22/jan/1799; Suriname britânico em ago/1799; Império Sikh em 1799
    ...perYear(1788, 1817, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir"]], o: { "Afghanistan": null } }), // Peshawar capital durrani (1776–1823)
    ...perYear(1818, 1818, { m: ["Império Durrani", "blank", ["Afghanistan", "Kashmir"]], o: { "Afghanistan": null } }), // Caxemira perdida para os sikhs em Shopian (1819)
    ...perYear(1819, 1822, { r: { "Afghanistan": "Império Durrani" } }), // queda de Cabul em mar/1823
    ...perYear(1788, 1801, { r: { "French Indochina": "Vietnã (guerra entre Tây Sơn e Nguyễn)" } }), // Nguyễn Ánh toma Đông Kinh em 18/jun/1802
    // revisão 1797 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1797, 1797, { m: ["República Francesa (Diretório)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice"]], o: { "France": null } }), // Genebra anexada em 15/abr/1798
    ...perYear(1797, 1797, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Kraków", "Tyrol", "Trentino", "Dalmatia", "Bay of Kotor"]] }), // Campo Formio, 17/out/1797
    ...perYear(1797, 1797, { m: ["Veneza (ocupação francesa)", "x:fr", ["Venetia", "Venice"]], o: { "Venetia": null } }), // república abdicou em 12/mai/1797; austríacos em Veneza em 18/jan/1798
    ...perYear(1797, 1797, { m: ["República Cisalpina", "blank", ["Lombardy", "Duchy of Modena", "Romagna"]], o: { "Lombardy": null } }), // fundada em 29/jun/1797
    ...perYear(1797, 1797, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }), // Turim ocupada em 6/dez/1798
    ...perYear(1797, 1797, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }), // invasão francesa em 5/mar/1798
    ...perYear(1797, 1797, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1797, 1797, { r: { "Malta": "Malta (Ordem de São João)", "Ionian Islands": "Ilhas Jônicas (domínio francês)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana",
      "Dutch Guiana": "Suriname (República Batava)", "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)" },
      f: { "Malta": "blank", "Ionian Islands": "x:fr", "Lucca": "blank", "Tuscany": "blank", "Dutch Guiana": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank" },
      o: { "Malta": null, "Ionian Islands": "França", "Lucca": null, "Tuscany": null, "Dutch Guiana": "República Batava", "Punjab": null, "Geneva": null, "Egypt": "Império Otomano" } }), // Malta tomada por Napoleão em jun/1798; Jônicas francesas desde jun/1797; Egito invadido em jul/1798
    ...perYear(1788, 1802, { r: { "Hejaz": "Xerifado de Meca (Império Otomano)" }, f: { "Hejaz": "blank" }, o: { "Hejaz": "Império Otomano" } }),
    ...perYear(1803, 1811, { r: { "Hejaz": "Xerifado de Meca (vassalo saudita)" }, f: { "Hejaz": "blank" }, o: { "Hejaz": null } }), // Meca tomada em 1803; Meca e Medina sob controle saudita em 1805
    ...perYear(1812, 1812, { r: { "Hejaz": "Hejaz (disputado: Medina retomada pelo Egito)" }, f: { "Hejaz": "blank" }, o: { "Hejaz": null } }), // Meca retomada em jan/1813
    ...perYear(1788, 1825, { f: { "Anglo-Egyptian Sudan": "blank", "Riyadh": "blank" } }),
    ...perYear(1802, 1825, { f: { "Egypt": "blank" } }), // bandeira vermelha de Muhammad Ali datada de 1826 na Wikipedia
    // revisão 1796 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1796, 1796, { m: ["República Francesa (Diretório)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice"]], o: { "France": null } }), // margem esquerda do Reno ocupada desde o fim de 1794; Córsega retomada em 19/out/1796
    ...perYear(1796, 1796, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Kraków", "Tyrol", "Trentino"]] }),
    ...perYear(1796, 1796, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }), // caiu em 12/mai/1797; franceses em Corfu em 28/jun/1797
    ...perYear(1796, 1796, { m: ["Lombardia (ocupação francesa)", "x:fr", ["Lombardy"]], o: { "Lombardy": null } }), // Lodi, 10/mai/1796; República Transpadana até jun/1797
    ...perYear(1796, 1796, { m: ["República Cispadana", "blank", ["Duchy of Modena", "Romagna"]], o: { "Duchy of Modena": null } }), // congresso de Módena em 16/out/1796; aprox.: Ravena e Forlì papais até 1797
    ...perYear(1796, 1796, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }),
    ...perYear(1796, 1796, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1796, 1796, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1796, 1796, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana",
      "Dutch Guiana": "Suriname (República Batava)", "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Dutch Guiana": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Dutch Guiana": "República Batava", "Punjab": null, "Geneva": null, "Egypt": "Império Otomano" } }),
    // revisão 1795 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1795, 1795, { m: ["República Francesa (Diretório)", "x:fr", ["France", "Belgium", "Luxembourg", "Rhine Left", "Palatinate", "Savoy and Nice"]], o: { "France": null } }), // Diretório desde 2/nov/1795
    ...perYear(1795, 1795, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Kraków", "Tyrol", "Trentino", "Lombardy"]] }), // Lombardia ocupada pelos franceses após Lodi (10/mai/1796)
    ...perYear(1795, 1795, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1795, 1795, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }), // Legações ocupadas pelos franceses em 1796
    ...perYear(1795, 1795, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }),
    ...perYear(1795, 1795, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1795, 1795, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1795, 1795, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Dutch Guiana": "Suriname (República Batava)", "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)",
      "British Guiana": "Demerara-Essequibo e Berbice (República Batava)", "Ceylon": "Ceilão Holandês", "Corsica": "Reino Anglo-Corso", "Trinidad": "Trinidad (Espanha)", "Saint Lucia": "Santa Lúcia (França)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Dutch Guiana": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank",
        "British Guiana": "blank", "Ceylon": "blank", "Corsica": "blank", "Trinidad": "x:es", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Dutch Guiana": "República Batava", "Punjab": null, "Geneva": null, "Egypt": "Império Otomano",
        "British Guiana": "República Batava", "Ceylon": null, "Corsica": null, "Trinidad": "Espanha", "Saint Lucia": "França" } }), // holandeses rendem-se no Ceilão em 14/fev/1796; Córsega retomada em 19/out/1796; Trinidad britânica em 1797; Santa Lúcia francesa em jun/1795, britânica em 1796
    // chaves separadas do mapa de 1900 (junta sem trocar nome nem bandeira da raiz)
    ...perYear(1796, 1912, { m: [null, null, ["France", "Corsica"]] }),
    ...perYear(1795, 1808, { m: [null, null, ["Austria Hungary", "West Galicia"]] }), // Galícia Ocidental austríaca de 1795 a Schönbrunn (15/dez/1809)
    ...perYear(1809, 1912, { m: [null, null, ["Congress Poland", "West Galicia"]] }),
    ...perYear(1796, 1796, { r: { "Trinidad": "Trinidad (Espanha)" }, f: { "Trinidad": "x:es" }, o: { "Trinidad": "Espanha" } }),
    ...perYear(1797, 1912, { m: [null, null, ["British West Indies", "Trinidad"]] }), // Trinidad rendida aos britânicos em 1797
    ...perYear(1796, 1801, { m: [null, null, ["British West Indies", "Saint Lucia"]] }),
    ...perYear(1802, 1802, { r: { "Saint Lucia": "Santa Lúcia (França)" }, f: { "Saint Lucia": "x:fr" }, o: { "Saint Lucia": "França" } }), // devolvida em Amiens (1802); retomada em 1803
    ...perYear(1803, 1912, { m: [null, null, ["British West Indies", "Saint Lucia"]] }),
    ...perYear(1788, 1796, { r: { "Liguria": "República de Gênova", "Lucca": "República de Lucca", "Salzburg": "Principado-Arcebispado de Salzburgo", "Kingdom of Hanover": "Eleitorado de Hanôver", "British Columbia": null }, f: { "Liguria": "h:genoa", "Lucca": "blank", "Salzburg": "blank", "Kingdom of Hanover": "blank" }, o: { "Liguria": null, "Lucca": null, "Salzburg": null, "Kingdom of Hanover": null } }), // República Lígure em 14/jun/1797
    // revisão 1794 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1794, 1794, { m: ["República Francesa (Convenção Nacional)", "x:fr", ["France", "Rhine Left", "Palatinate", "Savoy and Nice"]], o: { "France": null } }), // Diretório em 3/nov/1795; margem esquerda do Reno ocupada no fim do outono de 1794
    ...perYear(1794, 1794, { m: ["Países Baixos Austríacos (ocupação francesa)", "x:fr", ["Belgium"]], o: { "Belgium": null } }), // tomados após Fleurus (1794); anexados em 1/out/1795
    ...perYear(1794, 1794, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg"]] }),
    ...perYear(1794, 1794, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "Posen", "NRW"]], o: { "Germany": null } }),
    ...perYear(1794, 1794, { m: ["República das Duas Nações (ocupação estrangeira)", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD"]], o: { "Congress Poland": null } }), // Revolta de Kościuszko termina em 16/nov/1794; Praga, 4/nov/1794
    ...perYear(1794, 1794, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1794, 1794, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1794, 1794, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }),
    ...perYear(1794, 1794, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1794, 1794, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1794, 1794, { m: [null, null, ["British West Indies", "Saint Lucia"]] }), // britânica em 1/abr/1794; francesa em jun/1795
    ...perYear(1794, 1794, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Corsica": "Reino Anglo-Corso", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Corsica": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Corsica": null, "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null } }), // Revolução Batava em 19/jan/1795; Cabo britânico em 15/set/1795; Kamehameha só unificara a ilha do Havaí antes de 1795; Curlândia anexada em 1795
    ...perYear(1795, 1912, { m: [null, null, ["Russian Empire", "Lithuania GD", "Courland", "West Volhynia"]] }), // Terceira Partição (24/out/1795); aprox.: Brest e Grodno inteiras
    // revisão 1793 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1793, 1793, { m: ["República Francesa (Convenção Nacional)", "x:fr", ["France", "Savoy and Nice"]], o: { "France": null } }),
    ...perYear(1793, 1793, { m: ["Renânia e Palatinado (estados do Sacro Império)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }), // Mainz capitula em 23/jul/1793; margem esquerda ocupada pela França no outono de 1794
    ...perYear(1793, 1793, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg", "Belgium"]] }), // Países Baixos Austríacos tomados pelos franceses em 1794
    ...perYear(1793, 1793, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "Posen", "NRW"]], o: { "Germany": null } }), // Segunda Partição (23/jan/1793)
    ...perYear(1793, 1793, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD"]], o: { "Congress Poland": null } }), // Sejm de Grodno ratifica a partição em 1793
    ...perYear(1793, 1793, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1793, 1793, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1793, 1793, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }),
    ...perYear(1793, 1793, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1793, 1793, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1793, 1793, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Corsica": "Córsega (secessão de Paoli)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Corsica": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Corsica": null, "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França" } }), // Paoli rompe com a Convenção em 1793; Martinica britânica a partir de 1794; Santa Lúcia tomada em 1/abr/1794
    // revisão 1792 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1793, 1912, { m: [null, null, ["Russian Empire", "Right-bank Ukraine", "Minsk region"]] }), // Segunda Partição: voivodias de Kiev, Bracław, Podólia e Minsk
    ...perYear(1793, 1794, { m: [null, null, ["Congress Poland", "West Volhynia"]] }), // aprox.: Volínia ocidental polonesa até 1795
    ...perYear(1792, 1792, { m: ["República Francesa (Convenção Nacional)", "x:fr", ["France", "Savoy and Nice", "Corsica"]], o: { "France": null } }), // república em 21/set/1792; Nice ocupada em 29/set/1792; Saboia anexada em 1792
    ...perYear(1792, 1792, { m: ["Países Baixos Austríacos (ocupação francesa)", "x:fr", ["Belgium"]], o: { "Belgium": null } }), // Jemappes, 6/nov/1792; Neerwinden, 18/mar/1793
    ...perYear(1792, 1792, { m: ["Renânia e Palatinado (estados do Sacro Império; Mainz ocupada pela França)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }), // Mainz ocupada em 21/out/1792
    ...perYear(1792, 1792, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg"]] }),
    ...perYear(1792, 1792, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "NRW"]], o: { "Germany": null } }),
    ...perYear(1792, 1792, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD", "Posen", "Right-bank Ukraine", "Minsk region", "West Volhynia"]], o: { "Congress Poland": null } }), // tratado da Segunda Partição em 23/jan/1793; aprox.: Bydgoszcz (distrito do Netze, prussiano desde 1772) dentro
    ...perYear(1792, 1792, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir", "Herat"]], o: { "Afghanistan": null } }), // Herat separado em 1793, com a morte de Timur Shah
    ...perYear(1792, 1792, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1792, 1792, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1792, 1792, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara"]], o: { "Italy": null } }),
    ...perYear(1792, 1792, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1792, 1792, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1792, 1792, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França" } }),
    // revisão 1791 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1792, 1912, { m: [null, null, ["Russian Empire", "Yedisan"]] }), // Tratado de Jassy, 9/jan/1792: Yedisan entre o Dniester e o Bug
    ...perYear(1791, 1791, { r: { "Yedisan": "Yedisan (guerra russo-turca)" }, f: { "Yedisan": "blank" }, o: { "Yedisan": null } }),
    ...perYear(1791, 1791, { m: ["Reino da França", "x:fr", ["France", "Corsica"]], o: { "France": null } }), // monarquia constitucional; república em 21/set/1792; Comtat Venaissin anexado em 14/set/1791
    ...perYear(1791, 1791, { m: ["Renânia e Palatinado (estados do Sacro Império)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }),
    ...perYear(1791, 1791, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg", "Belgium"]] }),
    ...perYear(1791, 1791, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "NRW"]], o: { "Germany": null } }),
    ...perYear(1791, 1791, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD", "Posen", "Right-bank Ukraine", "Minsk region", "West Volhynia"]], o: { "Congress Poland": null } }), // Constituição de 3/mai/1791
    ...perYear(1791, 1791, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir", "Herat"]], o: { "Afghanistan": null } }),
    ...perYear(1791, 1791, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1791, 1791, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1791, 1791, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara", "Savoy and Nice"]], o: { "Italy": null } }), // Saboia e Nice tomadas pela França em 1792
    ...perYear(1791, 1791, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1791, 1791, { m: ["Saint-Domingue", "blank", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": null } }),
    ...perYear(1791, 1791, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)", "Sierra Leone GB": "Serra Leoa (Granville Town)" },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr", "Sierra Leone GB": "blank" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França", "Sierra Leone GB": null } }), // Granville Town reconstruída em 1791; Freetown em 11/mar/1792
    // revisão 1790 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1788, 1791, { r: { "Yedisan": "Yedisan (ocupação russa)" }, f: { "Yedisan": "x:ru" }, o: { "Yedisan": null } }), // Ochakov tomada em 6/dez/1788; trégua em 31/jul/1791
    ...perYear(1790, 1790, { m: ["Reino da França", "x:fr", ["France", "Corsica"]], o: { "France": null } }), // tricolor aprovada em 24/out/1790
    ...perYear(1790, 1790, { m: ["Renânia e Palatinado (estados do Sacro Império)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }),
    ...perYear(1790, 1790, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg", "Belgium"]] }),
    ...perYear(1790, 1790, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "NRW"]], o: { "Germany": null } }),
    ...perYear(1790, 1790, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD", "Posen", "Right-bank Ukraine", "Minsk region", "West Volhynia"]], o: { "Congress Poland": null } }), 
    ...perYear(1790, 1790, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir", "Herat"]], o: { "Afghanistan": null } }),
    ...perYear(1790, 1790, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1790, 1790, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1790, 1790, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara", "Savoy and Nice"]], o: { "Italy": null } }), // Saboia e Nice tomadas pela França em 1792
    ...perYear(1790, 1790, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1790, 1790, { m: ["Saint-Domingue", "x:fr", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": "França" } }), // revolta de escravos em ago/1791
    ...perYear(1790, 1790, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)", "Sierra Leone GB": null },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França" } }), // Granville Town destruída em 1789 e reconstruída em 1791
    ...perYear(1790, 1790, { r: { "Serbia": "Sérvia (ocupação austríaca)", "Canada": "Província de Quebec (britânica)" }, f: { "Serbia": "h:at_hab", "Canada": "x:gb" }, o: { "Serbia": null, "Canada": "Reino Unido" } }), // Sérvia ocupada pelos Habsburgo (1788–1791), devolvida em Sistova (4/ago/1791); Alto e Baixo Canadá em 26/dez/1791
    ...perYear(1788, 1798, { r: { "Prince Edward Island": "Ilha de São João (britânica)" } }), // renomeada Ilha do Príncipe Eduardo em 29/nov/1798
    // revisão 1789 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1790, 1791, { r: { "Yedisan": "Yedisan (ocupação russa)" }, f: { "Yedisan": "x:ru" }, o: { "Yedisan": null } }), // Ochakov tomada em 6/dez/1788; trégua em 31/jul/1791
    ...perYear(1789, 1789, { m: ["Reino da França", "x:fr", ["France", "Corsica"]], o: { "France": null } }), // bandeira real não única antes da tricolor de 24/out/1790
    ...perYear(1789, 1789, { m: ["Renânia e Palatinado (estados do Sacro Império)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }),
    ...perYear(1789, 1789, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg"]] }), // austríacos recuam para Luxemburgo em dez/1789
    ...perYear(1789, 1789, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "NRW"]], o: { "Germany": null } }),
    ...perYear(1789, 1789, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD", "Posen", "Right-bank Ukraine", "Minsk region", "West Volhynia"]], o: { "Congress Poland": null } }), 
    ...perYear(1789, 1789, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir", "Herat"]], o: { "Afghanistan": null } }),
    ...perYear(1789, 1789, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1789, 1789, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1789, 1789, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara", "Savoy and Nice"]], o: { "Italy": null } }), // Saboia e Nice tomadas pela França em 1792
    ...perYear(1789, 1789, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1789, 1789, { m: ["Saint-Domingue", "x:fr", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": "França" } }), // revolta de escravos em ago/1791
    ...perYear(1789, 1789, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)", "Sierra Leone GB": null },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França" } }), // Granville Town destruída em 1789 e reconstruída em 1791
    ...perYear(1789, 1789, { r: { "Serbia": "Sérvia (ocupação austríaca)", "Canada": "Província de Quebec (britânica)" }, f: { "Serbia": "h:at_hab", "Canada": "x:gb" }, o: { "Serbia": null, "Canada": "Reino Unido" } }), // Sérvia ocupada pelos Habsburgo (1788–1791), devolvida em Sistova (4/ago/1791); Alto e Baixo Canadá em 26/dez/1791
    ...perYear(1790, 1798, { r: { "Prince Edward Island": "Ilha de São João (britânica)" } }), // renomeada Ilha do Príncipe Eduardo em 29/nov/1798
    ...perYear(1788, 1792, { r: { "French India": "Índia Francesa" }, f: { "French India": "x:fr" }, o: { "French India": "França" } }), // terceira ocupação britânica de 23/ago/1793 a 18/jun/1802
    ...perYear(1789, 1789, { m: ["Estados Belgas (Revolução de Brabante)", "blank", ["Belgium"]], o: { "Belgium": null } }), // Bruxelas tomada pelos rebeldes em 18/dez/1789; independência em 20/dez/1789; Áustria de volta em dez/1790
    // revisão 1788 (situação em 31/dez; fontes: Wikipedia)
    ...perYear(1790, 1791, { r: { "Yedisan": "Yedisan (ocupação russa)" }, f: { "Yedisan": "x:ru" }, o: { "Yedisan": null } }), // Ochakov tomada em 6/dez/1788; trégua em 31/jul/1791
    ...perYear(1788, 1788, { m: ["Reino da França", "x:fr", ["France", "Corsica"]], o: { "France": null } }), 
    ...perYear(1788, 1788, { m: ["Renânia e Palatinado (estados do Sacro Império)", "blank", ["Rhine Left", "Palatinate"]], o: { "Rhine Left": null } }),
    ...perYear(1788, 1788, { m: ["Monarquia de Habsburgo", "h:at_hab", ["Austria Hungary", "Hungary", "Tarnopol", "Illyria", "Gorizia", "Tyrol", "Trentino", "Lombardy", "Luxembourg", "Belgium"]] }), // Revolução de Brabante em 1789
    ...perYear(1788, 1788, { m: ["Reino da Prússia", "blank", ["Germany", "Altmark", "NRW"]], o: { "Germany": null } }),
    ...perYear(1788, 1788, { m: ["República das Duas Nações", "blank", ["Congress Poland", "West Galicia", "Kraków", "Lithuania GD", "Posen", "Right-bank Ukraine", "Minsk region", "West Volhynia"]], o: { "Congress Poland": null } }), 
    ...perYear(1788, 1788, { m: ["Império Durrani", "blank", ["Afghanistan", "Peshawar", "Kashmir", "Herat"]], o: { "Afghanistan": null } }),
    ...perYear(1788, 1788, { m: ["República de Veneza", "blank", ["Venetia", "Venice", "Dalmatia", "Bay of Kotor", "Ionian Islands"]], o: { "Venetia": null } }),
    ...perYear(1788, 1788, { m: ["Estados Papais", "blank", ["Papal States", "Umbria", "Marche and Umbria", "Romagna"]], o: { "Papal States": null } }),
    ...perYear(1788, 1788, { m: ["Reino da Sardenha", "h:it_sav", ["Italy", "Piedmont", "Novara", "Savoy and Nice"]], o: { "Italy": null } }), // Saboia e Nice tomadas pela França em 1792
    ...perYear(1788, 1788, { m: ["Antiga Confederação Suíça", "blank", ["Switzerland", "Valais"]], o: { "Switzerland": null } }),
    ...perYear(1788, 1788, { m: ["Saint-Domingue", "x:fr", ["Haiti", "Kingdom of Haiti"]], o: { "Haiti": "França" } }), // revolta de escravos em ago/1791
    ...perYear(1788, 1788, { r: { "Malta": "Malta (Ordem de São João)", "Lucca": "República de Lucca", "Tuscany": "Grão-Ducado da Toscana", "Duchy of Modena": "Ducado de Módena",
      "Netherlands": "República das Sete Províncias Unidas", "Dutch Guiana": "Suriname (Holanda)", "British Guiana": "Demerara-Essequibo e Berbice (Holanda)", "Netherlands Antilles": "Curaçao (Holanda)",
      "Cape Colony": "Colônia do Cabo (Holanda)", "Ceylon": "Ceilão Holandês", "Netherlands Indies": "Índias Orientais Holandesas",
      "Punjab": "Confederação Sikh", "Tonga": "Tonga", "Geneva": "República de Genebra", "Egypt": "Egito (eialete otomano)", "Trinidad": "Trinidad (Espanha)",
      "Courland": "Ducado da Curlândia e Semigália", "Kingdom of Hawaii": "Ilhas Havaianas (chefias rivais)", "Martinique": "Martinica", "Saint Lucia": "Santa Lúcia (França)", "Sierra Leone GB": null },
      f: { "Malta": "blank", "Lucca": "blank", "Tuscany": "blank", "Duchy of Modena": "blank", "Netherlands": "blank", "Dutch Guiana": "blank", "British Guiana": "blank", "Netherlands Antilles": "blank",
        "Cape Colony": "blank", "Ceylon": "blank", "Netherlands Indies": "blank", "Punjab": "blank", "Geneva": "blank", "Egypt": "blank", "Trinidad": "x:es", "Courland": "blank", "Kingdom of Hawaii": "blank",
        "Martinique": "x:fr", "Saint Lucia": "x:fr" },
      o: { "Malta": null, "Lucca": null, "Tuscany": null, "Duchy of Modena": null, "Netherlands": null, "Dutch Guiana": "República das Sete Províncias Unidas", "British Guiana": "República das Sete Províncias Unidas",
        "Netherlands Antilles": "República das Sete Províncias Unidas", "Cape Colony": "República das Sete Províncias Unidas", "Ceylon": "República das Sete Províncias Unidas", "Netherlands Indies": "República das Sete Províncias Unidas",
        "Punjab": null, "Geneva": null, "Egypt": "Império Otomano", "Trinidad": "Espanha", "Courland": "República das Duas Nações", "Kingdom of Hawaii": null, "Martinique": "França", "Saint Lucia": "França" } }), // Granville Town destruída em 1789 e reconstruída em 1791
    ...perYear(1788, 1788, { r: { "Canada": "Província de Quebec (britânica)" }, f: { "Canada": "x:gb" }, o: { "Canada": "Reino Unido" } }), // Belgrado tomada pelos Habsburgo em 1789; Alto e Baixo Canadá em 26/dez/1791
    ...perYear(1790, 1798, { r: { "Prince Edward Island": "Ilha de São João (britânica)" } }), // renomeada Ilha do Príncipe Eduardo em 29/nov/1798
    ...perYear(1789, 1792, { r: { "French India": "Índia Francesa" }, f: { "French India": "x:fr" }, o: { "French India": "França" } }), // terceira ocupação britânica de 23/ago/1793 a 18/jun/1802
    ...perYear(1788, 1788, { m: ["Império Otomano", "blank", ["Ottoman Empire", "Serbia"]] }),
    ...perYear(1788, 1788, { r: { "Sierra Leone GB": "Serra Leoa (Granville Town)" }, f: { "Sierra Leone GB": "blank" }, o: { "Sierra Leone GB": null } }), // fundada em 1787, destruída em 1789
    // Qing: sem bandeira oficial antes de 1862; a triangular (1862) não é descrita em detalhe; retangular promulgada em 1888 (um evento por ano para vencer as fusões)
    ...Array.from({ length: 100 }, (_, i) => ({ y: 1788 + i, y1: 1788 + i, f: { "Manchu Empire": "blank" } })),
  ],
  1914: [
    ...ISLES[1914],
    // revisão 1914–1919 (situação em 31/dez). Unidades novas vêm de hist-overrides.json.
    // Rússia
    { y: 1913, y1: 1914, m: ["Império Russo", "x:ru", RU14] },
    { y: 1915, y1: 1916, m: ["Império Russo", "x:ru", ["Russian Empire", "West Belarus", "Estonia (RU)", "Ukraine (RU)", "Bessarabia", "Georgia", "Armenia", "Azerbaijan", "Sakhalin (RU)"]] },
    { y: 1915, y1: 1917, m: ["Polônia russa (ocupação alemã e austro-húngara)", "blank", ["Congress Poland"]] }, // ago/1915
    { y: 1915, y1: 1917, m: ["Lituânia (ocupação alemã)", "h:de_emp", ["Lithuania (RU)", "Vilnius region"]], o: { "Lithuania (RU)": null } }, // set/1915
    { y: 1915, y1: 1916, r: { "Latvia (RU)": "Letônia (parcialmente ocupada pela Alemanha)" }, f: { "Latvia (RU)": "x:ru" }, o: { "Latvia (RU)": null } }, // Curlândia em 1915
    { y: 1917, y1: 1917, r: { "Latvia (RU)": "Letônia (parcialmente ocupada pela Alemanha)" }, f: { "Latvia (RU)": "blank" }, o: { "Latvia (RU)": null } }, // Riga em set/1917
    { y: 1917, y1: 1917, m: ["Rússia Soviética", "blank", ["Russian Empire", "West Belarus", "Estonia (RU)", "Sakhalin (RU)"]] }, // revolução de out/1917
    { y: 1917, y1: 1917, r: { "Ukraine (RU)": "República Popular Ucraniana", "Bessarabia": "República Democrática Moldava" },
      f: { "Ukraine (RU)": "blank", "Bessarabia": "h:md17" }, o: { "Ukraine (RU)": null, "Bessarabia": null } }, // nov/1917 e dez/1917
    { y: 1917, y1: 1917, m: ["Transcaucásia (Comissariado Transcaucasiano)", "blank", ["Georgia", "Armenia", "Azerbaijan"]] }, // nov/1917
    { y: 1913, y1: 1916, r: { "Grand Duchy of Finland": "Grão-Ducado da Finlândia" } },
    { y: 1917, y1: 1917, r: { "Grand Duchy of Finland": "Finlândia" }, f: { "Grand Duchy of Finland": "h:fi_lion" }, o: { "Grand Duchy of Finland": null } }, // 6/dez/1917; vermelha com leão desde 28/dez/1917 (leão simplificado)
    { y: 1918, r: { "Grand Duchy of Finland": "Finlândia" }, f: { "Grand Duchy of Finland": "x:fi" }, o: { "Grand Duchy of Finland": null } },
    { y: 1918, y1: 1918, m: ["Rússia (guerra civil)", "blank", ["Russian Empire", "West Belarus", "Sakhalin (RU)"]] },
    { y: 1919, m: ["Rússia (guerra civil)", "blank", ["Russian Empire", "Sakhalin (RU)"]] },
    { y: 1919, r: { "West Belarus": "Bielorrússia ocidental (ocupação polonesa)" }, f: { "West Belarus": "x:pl" }, o: { "West Belarus": null } }, // Minsk em ago/1919
    { y: 1918, m: ["Polônia", "x:pl", ["Congress Poland", "West Galicia"]] }, // 11/nov/1918
    { y: 1919, m: ["Polônia", "x:pl", ["Congress Poland", "West Galicia", "East Galicia", "Posen", "Vilnius region"]] }, // Galícia Oriental até jul/1919; Vilnius em abr/1919
    { y: 1918, y1: 1918, m: ["Lituânia", "x:lt", ["Lithuania (RU)", "Vilnius region"]] },
    { y: 1919, r: { "Lithuania (RU)": "Lituânia" }, f: { "Lithuania (RU)": "x:lt" }, o: { "Lithuania (RU)": null } },
    { y: 1918, r: { "Latvia (RU)": "Letônia", "Estonia (RU)": "Estônia" }, f: { "Latvia (RU)": "x:lv", "Estonia (RU)": "x:ee" }, o: { "Latvia (RU)": null, "Estonia (RU)": null } },
    { y: 1918, y1: 1918, r: { "Ukraine (RU)": "República Popular Ucraniana", "East Galicia": "República Popular da Ucrânia Ocidental" },
      f: { "Ukraine (RU)": "x:ua", "East Galicia": "x:ua" }, o: { "Ukraine (RU)": null, "East Galicia": null } },
    { y: 1919, r: { "Ukraine (RU)": "Ucrânia (guerra civil)" }, f: { "Ukraine (RU)": "blank" }, o: { "Ukraine (RU)": null } },
    { y: 1918, r: { "Georgia": "Geórgia", "Armenia": "Armênia", "Azerbaijan": "Azerbaijão" }, f: { "Georgia": "h:ge90", "Armenia": "x:am", "Azerbaijan": "x:az" },
      o: { "Georgia": null, "Armenia": null, "Azerbaijan": null } }, // mai/1918
    { y: 1914, y1: 1917, r: { "Tuva": "Uriankhai (protetorado russo)" }, f: { "Tuva": "x:ru" }, o: { "Tuva": null } }, // abr/1914
    { y: 1918, r: { "Tuva": null } }, // 1918–1919: guerra civil (pendente)
    // Áustria-Hungria
    { y: 1913, y1: 1917, m: ["Áustria-Hungria", "h:at_hab", AH14] },
    { y: 1917, y1: 1917, r: { "Friuli": "Friul e Vêneto (ocupação austro-húngara)" }, f: { "Friuli": "h:at_hab" }, o: { "Friuli": null } }, // Caporetto, nov/1917
    { y: 1913, y1: 1916, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Italy", "Friuli"]] },
    { y: 1918, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Italy", "Friuli"]] },
    { y: 1918, m: ["Trentino e Litoral Austríaco (ocupação italiana)", "h:it_sav", ["Trentino", "Littoral"]], o: { "Trentino": null } }, // nov/1918; anexados em 1920
    { y: 1918, y1: 1918, r: { "Austria": "Áustria Alemã", "Transylvania": "Transilvânia (em disputa)" }, f: { "Austria": "x:at", "Transylvania": "blank" }, o: { "Austria": null, "Transylvania": null } },
    { y: 1919, r: { "Austria": "Áustria" }, f: { "Austria": "x:at" }, o: { "Austria": null } }, // República da Áustria em out/1919
    { y: 1918, y1: 1918, m: ["Hungria", "x:hu", ["Hungary", "Carpathian Ruthenia"]] },
    { y: 1919, r: { "Hungary": "Hungria" }, f: { "Hungary": "x:hu" }, o: { "Hungary": null } },
    { y: 1918, y1: 1918, m: ["Tchecoslováquia", "h:cz18", ["Bohemia", "Slovakia"]] }, // 28/out/1918
    { y: 1919, m: ["Tchecoslováquia", "h:cz18", ["Bohemia", "Slovakia", "Carpathian Ruthenia"]] },
    { y: 1918, y1: 1918, m: ["Romênia", "x:ro", ["Romania", "Bessarabia", "Bukovina"]] },
    { y: 1919, m: ["Romênia", "x:ro", ["Romania", "Bessarabia", "Bukovina", "Transylvania"]] },
    { y: 1918, m: ["Reino dos Sérvios, Croatas e Eslovenos", "h:yu_fr", ["Serbia", "Montenegro", "South Slav lands", "Austro-Hungarian Empire"]] }, // 1/dez/1918
    // Alemanha, França e Bélgica
    { y: 1913, y1: 1917, m: ["Império Alemão", "h:de_emp", ["German Empire", "Posen", "Alsace-Lorraine"]] },
    { y: 1918, y1: 1918, m: ["Alemanha", "h:de_emp", ["German Empire", "Posen"]] }, // república em 9/nov/1918; bandeira nova em ago/1919
    { y: 1919, r: { "German Empire": "Alemanha (República de Weimar)" }, f: { "German Empire": "x:de" } },
    { y: 1914, y1: 1917, r: { "Occupied France": "Norte da França (ocupação alemã)", "Belgium": "Bélgica (ocupação alemã)", "Luxembourg": "Luxemburgo (ocupação alemã)" },
      f: { "Occupied France": "h:de_emp", "Belgium": "h:de_emp", "Luxembourg": "h:de_emp" }, o: { "Occupied France": null, "Belgium": null, "Luxembourg": null } },
    { y: 1918, m: ["França", "x:fr", ["France", "Occupied France", "Alsace-Lorraine"]] },
    // Bálcãs
    { y: 1915, y1: 1917, r: { "Serbia": "Sérvia (ocupação austro-húngara e búlgara)" }, f: { "Serbia": "blank" }, o: { "Serbia": null } }, // fim de 1915
    { y: 1916, y1: 1917, r: { "Montenegro": "Montenegro (ocupação austro-húngara)" }, f: { "Montenegro": "blank" }, o: { "Montenegro": null } }, // jan/1916
    { y: 1916, y1: 1917, r: { "Romania": "Romênia (parcialmente ocupada)" } }, // Bucareste em dez/1916
    { y: 1914, y1: 1914, r: { "Albania": "Principado da Albânia" }, f: { "Albania": "x:al" } }, // vermelha com a águia negra de duas cabeças
    { y: 1915, y1: 1917, r: { "Albania": "Albânia (ocupação estrangeira)" }, f: { "Albania": "blank" }, o: { "Albania": null } },
    { y: 1918, r: { "Albania": "Albânia (ocupação italiana)" }, f: { "Albania": "h:it_sav" }, o: { "Albania": null } },
    { y: 1913, m: ["Grécia", "h:gr_cross", ["Greece", "_null_158", "_null_159", "_null_160", "_null_161", "_null_162", "_null_163", "_null_164", "_null_165", "_null_166", "_null_167"]] }, // Creta grega desde 1913; ilhas do Egeu desde 1912
    { y: 1913, m: ["Reino Unido", "x:gb", ["United Kingdom of Great Britain and Ireland", "_null_133", "_null_134", "_null_135", "_null_136", "_null_137", "_null_138", "_null_139", "_null_140", "_null_141", "_null_142", "_null_143", "_null_144", "_null_145", "_null_146", "_null_147", "_null_148", "_null_149", "_null_150", "_null_151"]] },
    { y: 1913, r: { "_null_153": "Ilha de Man" }, f: { "_null_153": "x:gb" }, o: { "_null_153": "Reino Unido" } },
    { y: 1913, r: { "_null_130": "Dodecaneso (ocupação italiana)" }, f: { "_null_130": "h:it_sav" }, o: { "_null_130": null } }, // desde 1912
    // Império Otomano e Arábia
    { y: 1914, y1: 1915, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Syria", "Lebanon", "Palestine", "Jordan", "Hejaz", "North Yemen"]] },
    { y: 1916, y1: 1916, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Syria", "Lebanon", "Palestine", "Jordan", "North Yemen"]] },
    { y: 1917, y1: 1917, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Syria", "Lebanon", "Jordan", "North Yemen"]] },
    { y: 1917, y1: 1917, r: { "Palestine": "Palestina (parcialmente ocupada pelos britânicos)" }, f: { "Palestine": "blank" }, o: { "Palestine": null } }, // Jerusalém em dez/1917
    { y: 1914, y1: 1916, r: { "Mesopotamia": "Mesopotâmia (parcialmente ocupada pelos britânicos)" }, f: { "Mesopotamia": "x:tr" }, o: { "Mesopotamia": null } }, // Baçorá em nov/1914
    { y: 1917, y1: 1917, r: { "Mesopotamia": "Mesopotâmia (parcialmente ocupada pelos britânicos)" }, f: { "Mesopotamia": "blank" }, o: { "Mesopotamia": null } }, // Bagdá em mar/1917
    { y: 1913, y1: 1918, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Smyrna"]] },
    { y: 1919, r: { "Smyrna": "Esmirna (ocupação grega)" }, f: { "Smyrna": "h:gr_cross" }, o: { "Smyrna": null } }, // desembarque grego em mai/1919
    { y: 1918, r: { "Ottoman Empire": "Império Otomano", "Mesopotamia": "Mesopotâmia (ocupação britânica)", "Palestine": "Palestina (ocupação britânica)", "Lebanon": "Líbano (ocupação francesa)" },
      f: { "Mesopotamia": "x:gb", "Palestine": "x:gb", "Lebanon": "x:fr" }, o: { "Mesopotamia": null, "Palestine": null, "Lebanon": null } },
    { y: 1918, m: ["Síria (governo árabe de Faiçal)", "h:hejaz", ["Syria", "Jordan"]] }, // Damasco em out/1918
    { y: 1916, r: { "Hejaz": "Reino de Hejaz" }, f: { "Hejaz": "h:hejaz" }, o: { "Hejaz": null } }, // jun/1916
    { y: 1918, r: { "North Yemen": "Reino Mutawakkilita do Iêmen" }, f: { "North Yemen": "h:yem_k" }, o: { "North Yemen": null } }, // 30/out/1918
    { y: 1913, r: { "Asir": "Emirado Idríssida de Asir", "Hail": "Emirado de Jabal Shammar", "Arabia (Nejd)": "Emirado de Négede e Hasa", "Kuwait": "Kuwait (protetorado britânico)",
      "Bahrain": "Bahrein (protetorado britânico)", "Trucial States": "Estados da Trégua (protetorado britânico)", "Aden": "Áden e protetorados (britânicos)", "Muscat and Oman": "Mascate e Omã",
      "Cyprus": "Chipre", "Malta": "Malta", "Gibraltar": "Gibraltar" },
      f: { "Asir": "h:asir09", "Hail": "blank", "Arabia (Nejd)": "x:sa", "Kuwait": "h:kw14", "Bahrain": "x:gb", "Trucial States": "h:trucial", "Aden": "x:gb", "Muscat and Oman": "h:om_red",
      "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb" },
      o: { "Asir": null, "Hail": null, "Arabia (Nejd)": null, "Muscat and Oman": null, "Trucial States": null } },
    { y: 1913, r: { "British Protectorate": null } }, // sobra no Rub al-Khali, sem fronteira definida
    { y: 1913, y1: 1915, r: { "Qatar": "Catar" }, f: { "Qatar": "blank" }, o: { "Qatar": null } }, // guarnição otomana até 1915
    { y: 1916, r: { "Qatar": "Catar (protetorado britânico)" }, f: { "Qatar": "blank" }, o: { "Qatar": null } }, // tratado de 1916
    // África
    { y: 1914, r: { "Egypt": "Sultanato do Egito" }, f: { "Egypt": "h:eg_khed" }, o: { "Egypt": "protetorado britânico" } }, // dez/1914
    { y: 1914, r: { "Togoland": "Togolândia (ocupação francesa e britânica)" }, f: { "Togoland": "blank" }, o: { "Togoland": null } }, // ago/1914
    { y: 1916, r: { "Kamerun": "Camarões (ocupação francesa e britânica)" }, f: { "Kamerun": "blank" }, o: { "Kamerun": null } }, // fev/1916
    { y: 1915, r: { "German South-West Africa": "Sudoeste Africano (ocupação sul-africana)" }, f: { "German South-West Africa": "h:za_red" }, o: { "German South-West Africa": null } }, // jul/1915
    { y: 1913, y1: 1915, m: ["África Oriental Alemã", "h:de_emp", ["German E. Africa (Tanganyika)", "Rwanda", "Burundi"]] },
    { y: 1916, y1: 1916, r: { "German E. Africa (Tanganyika)": "África Oriental Alemã (parcialmente ocupada)" }, f: { "German E. Africa (Tanganyika)": "blank" }, o: { "German E. Africa (Tanganyika)": null } },
    { y: 1917, r: { "German E. Africa (Tanganyika)": "África Oriental Alemã (ocupação britânica)" }, f: { "German E. Africa (Tanganyika)": "x:gb" }, o: { "German E. Africa (Tanganyika)": null } }, // nov/1917
    { y: 1916, m: ["Ruanda-Urundi (ocupação belga)", "x:be", ["Rwanda", "Burundi"]] },
    { y: 1913, r: { "South Africa": "União Sul-Africana", "Cape Verde": "Cabo Verde", "Sao Tome": "São Tomé e Príncipe", "Mauritius": "Maurício", "Seychelles": "Seicheles",
      "Reunion": "Reunião", "Comoros": "Comores", "Zanzibar": "Zanzibar (protetorado britânico)" },
      f: { "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Mauritius": "x:gb", "Seychelles": "x:gb", "Reunion": "x:fr", "Comoros": "x:fr", "Zanzibar": "x:gb" }, o: { "South Africa": null } },
    // Ásia e Pacífico
    { y: 1913, r: { "Manchu Empire": "República da China" }, f: { "Manchu Empire": "h:cn_5" }, o: { "Manchu Empire": null } }, // desde 1912
    { y: 1913, y1: 1918, r: { "Mongolia": "Mongólia (Canato de Bogd)" }, f: { "Mongolia": "h:mn_bogd" } },
    { y: 1919, r: { "Mongolia": "Mongólia (ocupação chinesa)" }, f: { "Mongolia": "h:cn_5" }, o: { "Mongolia": null } }, // out/1919
    { y: 1913, y1: 1915, f: { "Tibet": "blank" } }, // bandeira tibetana desde 1916
    { y: 1913, f: { "Afghanistan": "h:af_black" } },
    { y: 1913, r: { "Korea": "Coreia (Japão)", "Taiwan": "Taiwan (Japão)", "Bhutan": "Butão", "Philippines": "Filipinas (EUA)", "Micronesia": "Micronésia (ocupação japonesa)", "Guam": "Guam",
      "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "Samoa": "Samoa (ocupação neozelandesa)", "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa",
      "Portuguese Timor": "Timor Português", "Macau": "Macau", "Maldives": "Maldivas (protetorado britânico)" },
      f: { "Korea": "x:jp", "Taiwan": "x:jp", "Bhutan": "blank", "Brunei": "h:bn06", "Micronesia": "x:jp", "Guam": "h:us48", "Papua New Guinea": "x:au", "Samoa": "x:nz",
      "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Macau": "x:pt", "Maldives": "x:gb" },
      o: { "Taiwan": "Japão", "Micronesia": null, "Samoa": null } }, // Nova Guiné Alemã, Samoa e Micronésia tomadas em 1914
    // Europa do Norte
    { y: 1918, r: { "Iceland": "Reino da Islândia" }, f: { "Iceland": "x:is" }, o: { "Iceland": null } }, // 1/dez/1918
    { y: 1913, r: { "Greenland": "Groenlândia", "Faroe Islands": "Ilhas Faroé", "Channel Islands": "Ilhas do Canal" }, f: { "Greenland": "x:dk", "Faroe Islands": "x:dk", "Channel Islands": "x:gb" } },
    // Américas
    { y: 1913, r: { "Newfoundland": "Domínio da Terra Nova" }, f: { "Newfoundland": "x:gb" }, o: { "Newfoundland": null } },
    { y: 1913, y1: 1916, r: { "Danish West Indies": "Índias Ocidentais Dinamarquesas" }, f: { "Danish West Indies": "x:dk" }, o: { "Danish West Indies": "Dinamarca" } },
    { y: 1917, r: { "Danish West Indies": "Ilhas Virgens Americanas" }, f: { "Danish West Indies": "h:us48" }, o: { "Danish West Indies": "Estados Unidos" } }, // 31/mar/1917
    { y: 1915, r: { "Haiti": "Haiti (ocupação americana)" } }, // jul/1915
    { y: 1916, r: { "Dominican Republic": "República Dominicana (ocupação americana)" }, f: { "Dominican Republic": "h:us48" }, o: { "Dominican Republic": null } }, // mai/1916
    { y: 1913, r: { "Guadeloupe": "Guadalupe", "Martinique": "Martinica", "Netherlands Antilles": "Curaçao e dependências", "Tonga": "Tonga (protetorado britânico)",
      "American Samoa": "Samoa Americana", "Wallis and Futuna Islands": "Wallis e Futuna", "United States Virgin Islands": null, "Rapa Nui": "Rapa Nui (Chile)" },
      f: { "Guadeloupe": "x:fr", "Martinique": "x:fr", "Netherlands Antilles": "x:nl", "Tonga": "x:to", "American Samoa": "h:us48", "Niue": "x:nz",
      "Wallis and Futuna Islands": "x:fr", "Rapa Nui": "x:cl", "Dominica": "x:gb", "Saint Lucia": "x:gb", "Antigua and Barbuda": "x:gb",
      "Saint Vincent and the Grenadines": "x:gb", "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb", "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" } },
    // 1913 (mapa de 1914, antes da guerra)
    { y: 1913, y1: 1913, r: { "Tuva": null, "Albania": "Albânia", "Kuwait": "Kuwait", "Cyprus": "Chipre (administração britânica)", "Egypt": "Quedivato do Egito",
      "Micronesia": "Micronésia Alemã", "Samoa": "Samoa Alemã", "Papua New Guinea": "Nova Guiné Alemã", "Abyssinia": "Abissínia" },
      f: { "Albania": "blank", "Kuwait": "blank", "Egypt": "h:eg_khed", "Micronesia": "h:de_emp", "Samoa": "h:de_emp", "Papua New Guinea": "h:de_emp", "Abyssinia": "h:eth97" },
      o: { "Albania": null, "Kuwait": null, "Cyprus": null, "Egypt": "ocupação britânica", "Micronesia": "Império Alemão", "Samoa": "Império Alemão", "Papua New Guinea": "Império Alemão" } },
    { y: 1913, y1: 1913, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Syria", "Lebanon", "Palestine", "Jordan", "Hejaz", "North Yemen", "Mesopotamia"]] },
    { y: 1913, y1: 1913, r: { "Papua": "Território de Papua (Austrália)" }, f: { "Papua": "x:au" }, o: { "Papua": "Austrália" } },
    { y: 1913, y1: 1913, m: ["França", "x:fr", ["France", "Occupied France"]] },
    { y: 1914, m: ["Papua e Nova Guiné (Austrália)", "x:au", ["Papua New Guinea", "Papua"]], o: { "Papua New Guinea": "Austrália" } },
    { y: 1913, y1: 1915, r: { "Darfur": "Sultanato de Darfur" }, f: { "Darfur": "blank" }, o: { "Darfur": null } },
    { y: 1916, m: ["Sudão Anglo-Egípcio", "x:gb", ["Anglo-Egyptian Sudan", "Darfur"]] }, // anexado em 1916
  ],
  1920: [
    ...ISLES[1920],
    { y: 1920, r: { "Danzig": "Cidade Livre de Danzig (Liga das Nações)" }, f: { "Danzig": "h:danzig" }, o: { "Danzig": null } }, // 15/nov/1920 (forma do mapa de 1930)
    // revisão 1920–1929 (situação em 31/dez). Unidades novas vêm de hist-overrides.json.
    { y: 1920, f: { "Mandatory Palestine (GB)": "x:gb" } },
    { y: 1920, m: ["Índia Britânica", "x:gb", ["British Raj", "Burma"]] }, // Birmânia separada só em 1937
    // Rússia e vizinhos: União Soviética formada em 30/dez/1922; bandeira da foice e martelo desde 12/nov/1923
    { y: 1920, y1: 1921, m: ["Rússia Soviética", "h:rsfsr", ["USSR", "White Russia", "South Russia", "Crimea"]] },
    { y: 1920, y1: 1921, r: { "Far Eastern SSR": "República do Extremo Oriente", "Ukraine": "Ucrânia soviética", "Belarus": "Bielorrússia soviética",
      "Armenia": "Armênia soviética", "Azerbaijan": "Azerbaijão soviético" },
      f: { "Far Eastern SSR": "blank", "Ukraine": "blank", "Belarus": "blank", "Armenia": "blank", "Azerbaijan": "blank" },
      o: { "Far Eastern SSR": null, "Ukraine": null, "Belarus": null, "Armenia": null, "Azerbaijan": null } },
    { y: 1920, y1: 1920, r: { "Georgia": "Geórgia" }, f: { "Georgia": "h:ge90" }, o: { "Georgia": null } }, // ocupação soviética em fev/1921
    { y: 1921, y1: 1921, r: { "Georgia": "Geórgia soviética" }, f: { "Georgia": "blank" }, o: { "Georgia": null } },
    { y: 1922, y1: 1922, m: ["União Soviética", "blank", ["USSR", "White Russia", "South Russia", "Crimea", "Far Eastern SSR", "Ukraine", "Belarus", "Georgia", "Armenia", "Azerbaijan"]] },
    { y: 1923, m: ["União Soviética", "h:su", ["USSR", "White Russia", "South Russia", "Crimea", "Far Eastern SSR", "Ukraine", "Belarus", "Georgia", "Armenia", "Azerbaijan"]] },
    { y: 1920, y1: 1924, r: { "North Sakhalin": "Sacalina do Norte (ocupação japonesa)" }, f: { "North Sakhalin": "x:jp" }, o: { "North Sakhalin": null } },
    { y: 1925, m: ["União Soviética", "h:su", ["USSR", "North Sakhalin"]] },
    { y: 1920, y1: 1920, r: { "Tuva": null } }, // 1920: disputada (pendente)
    { y: 1921, r: { "Tuva": "República Popular de Tuva" }, f: { "Tuva": "blank" } }, // 14/ago/1921
    { y: 1926, f: { "Tuva": "h:tuva_arms" } }, // constituição de 24/nov/1926: vermelha com brasão (simplificado)
    { y: 1920, y1: 1920, r: { "Mongolia": "Mongólia (ocupação chinesa)" }, f: { "Mongolia": "h:cn_5" }, o: { "Mongolia": null } },
    { y: 1921, f: { "Kuwait": "h:kw21" } }, // shahada acrescentada em 1921
    { y: 1921, y1: 1923, r: { "Mongolia": "Mongólia (Canato de Bogd)" }, f: { "Mongolia": "h:mn_bogd" } },
    { y: 1924, r: { "Mongolia": "República Popular da Mongólia" }, f: { "Mongolia": "h:mn24" } }, // 26/nov/1924
    // China
    { y: 1920, y1: 1927, m: ["República da China (governo de Beiyang)", "h:cn_5", ["Chinese Warlords", "Manchuria"]] },
    { y: 1928, m: ["República da China", "x:tw", ["Chinese Warlords", "Manchuria"]] }, // a Manchúria aderiu em 29/dez/1928
    { y: 1928, f: { "Xinjiang": "x:tw" } },
    { y: 1920, r: { "Korea": "Coreia (Japão)", "Taiwan": "Taiwan (Japão)", "Rattanakosin Kingdom": "Sião", "Bhutan": "Butão", "Philippines": "Filipinas (EUA)",
      "South Seas Mandate": "Mandato do Pacífico Sul (Japão)", "Guam": "Guam", "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "Iran": "Pérsia", "Italy": "Reino da Itália",
      "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português", "Macau": "Macau", "Maldives": "Maldivas (protetorado britânico)" },
      f: { "Korea": "x:jp", "Taiwan": "x:jp", "Bhutan": "blank", "Brunei": "h:bn06", "South Seas Mandate": "x:jp", "Guam": "h:us48", "Papua New Guinea": "x:au", "Hungary": "h:hu_k",
      "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Macau": "x:pt", "Maldives": "x:gb" },
      o: { "Taiwan": "Japão" } },
    { y: 1920, y1: 1927, f: { "Afghanistan": "h:af_black" } },
    { y: 1928, f: { "Afghanistan": "blank" } }, // 1928–1929: várias bandeiras em poucos meses (pendente)
    // Oriente Médio
    { y: 1920, r: { "Lebanon": "Líbano (mandato francês)", "Jordan": "Transjordânia (mandato britânico)", "Kuwait": "Kuwait (protetorado britânico)",
      "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar (protetorado britânico)", "Aden": "Áden e protetorados (britânicos)", "Muscat and Oman": "Mascate e Omã",
      "Cyprus": "Chipre", "Malta": "Malta", "Gibraltar": "Gibraltar" },
      f: { "Lebanon": "x:fr", "Jordan": "x:gb", "Kuwait": "h:kw14", "Bahrain": "x:gb", "Aden": "x:gb", "Muscat and Oman": "h:om_red", "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb" },
      o: { "Muscat and Oman": null } },
    { y: 1920, y1: 1920, r: { "Mesopotamia (GB)": "Mesopotâmia (mandato britânico)" } },
    { y: 1921, r: { "Mesopotamia (GB)": "Reino do Iraque (mandato britânico)" } }, // Faiçal coroado em 23/ago/1921
    { y: 1920, m: ["Reino Mutawakkilita do Iêmen", "h:yem_k", ["North Yemen", "Yemen"]] }, // independente desde 30/out/1918
    { y: 1920, y1: 1929, r: { "Asir": "Emirado Idríssida de Asir" }, f: { "Asir": "h:asir09" } }, { y: 1927, y1: 1929, f: { "Asir": "h:asir27" } },
    { y: 1920, y1: 1924, r: { "Hejaz": "Reino de Hejaz" }, f: { "Hejaz": "h:hejaz" } },
    { y: 1920, y1: 1920, r: { "Hail": "Emirado de Jabal Shammar", "Emirate of Bin Shal'an": "Emirado de Négede e Hasa" }, f: { "Hail": "blank", "Emirate of Bin Shal'an": "x:sa" } },
    { y: 1920, y1: 1920, m: ["Emirado de Jabal Shammar", "blank", ["Hail", "_null_153"]] },
    { y: 1921, y1: 1924, m: ["Sultanato de Négede", "x:sa", ["Emirate of Bin Shal'an", "Hail", "_null_153"]] }, // Hail tomado em 2/nov/1921
    { y: 1925, y1: 1925, m: ["Sultanato de Négede", "x:sa", ["Emirate of Bin Shal'an", "Hail", "_null_153", "Hejaz"]] }, // Hejaz conquistado em dez/1925
    { y: 1926, m: ["Reino de Hejaz e Négede", "x:sa", ["Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_153"]] }, // 8/jan/1926
    // Turquia
    { y: 1920, y1: 1922, r: { "Ottoman Sultanate": "Turquia (governo de Ancara)", "_null_152": "Constantinopla (ocupação aliada)" }, f: { "_null_152": "blank" } },
    { y: 1920, y1: 1921, r: { "Smyrna zone": "Esmirna e Trácia Oriental (ocupação grega)" }, f: { "Smyrna zone": "h:gr_cross" }, o: { "Smyrna zone": null } },
    { y: 1920, y1: 1921, m: ["Turquia (governo de Ancara)", "x:tr", ["Ottoman Sultanate", "Italian Anatolia"]] },
    { y: 1922, y1: 1922, m: ["Turquia (governo de Ancara)", "x:tr", ["Ottoman Sultanate", "Italian Anatolia", "Smyrna zone"]] }, // Esmirna retomada em set/1922
    { y: 1923, m: ["Turquia", "x:tr", ["Ottoman Sultanate", "Italian Anatolia", "Smyrna zone", "_null_152"]] }, // república em 29/out/1923
    // África
    { y: 1920, y1: 1921, r: { "Egypt": "Sultanato do Egito" }, f: { "Egypt": "h:eg_khed" }, o: { "Egypt": "protetorado britânico" } },
    { y: 1922, r: { "Egypt": "Reino do Egito" }, f: { "Egypt": "h:eg_k" }, o: { "Egypt": null } }, // 28/fev/1922
    { y: 1920, r: { "South West Africa": "Sudoeste Africano", "Cape Verde": "Cabo Verde", "Sao Tome": "São Tomé e Príncipe", "Mauritius": "Maurício", "Seychelles": "Seicheles",
      "Reunion": "Reunião", "Comoros": "Comores", "Zanzibar": "Zanzibar (protetorado britânico)" },
      f: { "South West Africa": "h:za_red", "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Mauritius": "x:gb", "Seychelles": "x:gb", "Reunion": "x:fr", "Comoros": "x:fr", "Zanzibar": "x:gb" } },
    { y: 1928, f: { "South West Africa": "h:za_old" } }, // bandeira sul-africana nova em 31/mai/1928
    { y: 1920, m: ["Ruanda-Urundi", "x:be", ["Rwanda (Belgium)", "Burundi"]] },
    // Europa
    { y: 1920, m: ["França", "x:fr", ["France", "Alsace-Moselle"]] },
    { y: 1920, m: ["Alemanha", "x:de", ["Germany", "East Prussia"]] },
    { y: 1920, r: { "Saar": "Território da Bacia do Sarre (Liga das Nações)" }, f: { "Saar": "blank" } },
    { y: 1920, y1: 1922, r: { "Memel": "Território de Memel (Liga das Nações)" }, f: { "Memel": "blank" } },
    { y: 1923, m: ["Lituânia", "x:lt", ["Lithuania", "Memel"]] }, // jan/1923
    { y: 1920, y1: 1921, r: { "Central Lithuania": "Lituânia Central" }, f: { "Central Lithuania": "blank" } }, // 12/out/1920
    { y: 1922, m: ["Polônia", "x:pl", ["Poland", "Central Lithuania"]] }, // anexada em 1922
    { y: 1920, y1: 1921, m: ["Reino Unido", "x:gb", ["United Kingdom of Great Britain and Ireland", "Ireland"]] },
    { y: 1922, r: { "Ireland": "Estado Livre Irlandês" }, f: { "Ireland": "x:ie" }, o: { "Ireland": null } }, // 6/dez/1922
    { y: 1920, y1: 1928, r: { "Yugoslavia": "Reino dos Sérvios, Croatas e Eslovenos" } },
    { y: 1929, r: { "Yugoslavia": "Iugoslávia" } }, // 3/out/1929
    { y: 1920, r: { "Iceland": "Reino da Islândia", "Greenland": "Groenlândia", "Faroe Islands": "Ilhas Faroé", "Channel Islands": "Ilhas do Canal" },
      f: { "Iceland": "x:is", "Greenland": "x:dk", "Faroe Islands": "x:dk", "Channel Islands": "x:gb" } },
    // Américas e Pacífico
    { y: 1920, y1: 1923, r: { "Dominican Republic": "República Dominicana (ocupação americana)" }, f: { "Dominican Republic": "h:us48" }, o: { "Dominican Republic": null } }, // até 27/dez/1924... governo militar até jul/1924
    { y: 1920, r: { "Haiti": "Haiti (ocupação americana)" } }, // 1915–1934
    { y: 1920, r: { "Guadeloupe": "Guadalupe", "Martinique": "Martinica", "Netherlands Antilles": "Curaçao e dependências", "Samoa": "Samoa Ocidental (mandato da Nova Zelândia)",
      "Tonga": "Tonga (protetorado britânico)", "American Samoa": "Samoa Americana", "Wallis and Futuna Islands": "Wallis e Futuna", "United States Virgin Islands": "Ilhas Virgens Americanas",
      "Rapa Nui": "Rapa Nui (Chile)" },
      f: { "Guadeloupe": "x:fr", "Martinique": "x:fr", "Netherlands Antilles": "x:nl", "Samoa": "x:nz", "Tonga": "x:to", "American Samoa": "h:us48", "Niue": "x:nz",
      "Wallis and Futuna Islands": "x:fr", "United States Virgin Islands": "h:us48", "Rapa Nui": "x:cl", "Dominica": "x:gb", "Saint Lucia": "x:gb", "Antigua and Barbuda": "x:gb",
      "Saint Vincent and the Grenadines": "x:gb", "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb", "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" } },
  ],
  1930: [
    ...ISLES[1930],
    // revisão 1935–1937 (situação em 31/dez); vale também para 1930–1934, ainda não revisados. Unidades novas vêm de hist-overrides.json.
    { y: 1930, m: ["União Soviética", "h:su", ["White Russia", "Azerbaijan", "Armenia", "Georgia", "Far Eastern SSR"]] }, // a República do Extremo Oriente entrou na Rússia soviética em 15/nov/1922
    { y: 1930, m: ["Turquia", "x:tr", ["Republic of Turkey", "Turkey"]] },
    { y: 1930, m: ["Alemanha", "x:de", ["Germany", "East Prussia"]] },
    { y: 1935, m: ["Alemanha", "h:de_nazi", ["Germany", "East Prussia", "Saar"]] }, // Sarre: plebiscito, volta em 1/mar/1935; bandeira nazista única desde 15/set/1935
    { y: 1933, y1: 1934, f: { "Germany": "h:de_emp" } },
    { y: 1930, y1: 1934, r: { "Saar": "Território da Bacia do Sarre (Liga das Nações)" }, f: { "Saar": "blank" } },
    { y: 1930, r: { "Chinese Warlords": "República da China", "Korea": "Coreia (Japão)", "Taiwan": "Taiwan (Japão)",
      "Lebanon": "Líbano (mandato francês)", "Tuva": "República Popular de Tuva", "Iceland": "Reino da Islândia", "Egypt": "Reino do Egito", "Jordan": "Transjordânia (mandato britânico)",
      "Mesopotamia (GB)": "Reino do Iraque (mandato britânico)", "Kuwait": "Kuwait (protetorado britânico)", "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar (protetorado britânico)",
      "Aden": "Áden e protetorados (britânicos)", "Muscat and Oman": "Mascate e Omã", "Cyprus": "Chipre", "Malta": "Malta", "Gibraltar": "Gibraltar", "Macau": "Macau",
      "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português", "Maldives": "Maldivas (protetorado britânico)",
      "Rattanakosin Kingdom": "Sião", "Bhutan": "Butão", "Philippines": "Filipinas (EUA)", "South Seas Mandate": "Mandato do Pacífico Sul (Japão)", "Guam": "Guam",
      "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "Dodecanese Islands": "Dodecaneso (Itália)" },
      f: { "Chinese Warlords": "x:tw", "Xinjiang": "x:tw", "Mongolia": "h:mn24", "Korea": "x:jp", "Taiwan": "x:jp", "Lebanon": "x:fr", "Tuva": "blank", "Iceland": "x:is",
      "Egypt": "h:eg_k", "Jordan": "x:gb", "Kuwait": "h:kw21", "Bahrain": "x:gb", "Aden": "x:gb", "Muscat and Oman": "h:om_red", "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb",
      "Macau": "x:pt", "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Maldives": "x:gb", "Rattanakosin Kingdom": "x:th", "Bhutan": "blank", "Brunei": "h:bn06",
      "South Seas Mandate": "x:jp", "Guam": "h:us48", "Papua New Guinea": "x:au" },
      o: { "Taiwan": "Japão", "Egypt": null, "Muscat and Oman": null } },
    { y: 1930, y1: 1930, m: ["República da China", "x:tw", ["Chinese Warlords", "Manchuria"]] }, // Manchúria sob a República da China desde 1928
    { y: 1931, y1: 1931, r: { "Manchuria": "Manchúria (ocupação japonesa)" }, f: { "Manchuria": "x:jp" }, o: { "Manchuria": null } }, // invasão de set/1931
    { y: 1932, r: { "Manchuria": "Manchukuo (Estado fantoche do Japão)" }, f: { "Manchuria": "h:manchukuo" } }, // 1/mar/1932
    { y: 1930, y1: 1936, m: ["Índia Britânica", "x:gb", ["British Raj", "Burma"]] },
    { y: 1937, r: { "Burma": "Birmânia (britânica)" }, f: { "Burma": "x:gb" } }, // separada da Índia em 1/abr/1937
    { y: 1936, f: { "Qatar": "h:qa36" } },
    { y: 1930, y1: 1934, f: { "Tuva": "h:tuva30" } }, { y: 1935, f: { "Tuva": "h:tuva_arms" } }, // 1930: "TAR" e lema; 1935: brasão (simplificados)
    { y: 1932, r: { "Mesopotamia (GB)": "Reino do Iraque" }, f: { "Mesopotamia (GB)": "h:iq_k" }, o: { "Mesopotamia (GB)": null } }, // 3/out/1932
    { y: 1930, y1: 1931, m: ["Reino de Hejaz e Négede", "x:sa", ["Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_44"]] },
    { y: 1932, m: ["Arábia Saudita", "x:sa", ["Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_44"]] }, // 23/set/1932
    { y: 1930, y1: 1934, r: { "Iran": "Pérsia" } },
    { y: 1930, y1: 1933, r: { "Haiti": "Haiti (ocupação americana)" } }, // até 1/ago/1934
    { y: 1935, r: { "Iran": "Irã" } }, // 21/mar/1935
    { y: 1935, r: { "Philippines": "Filipinas (Commonwealth, EUA)" } }, // 15/nov/1935
    { y: 1936, r: { "Ethiopia": "Etiópia (ocupada pela Itália)" }, f: { "Ethiopia": "h:it_sav" } },
    { y: 1936, y1: 1937, r: { "Spain": "Espanha (guerra civil)" }, f: { "Spain": "blank" } }, // 17/jul/1936 a 1/abr/1939
    // África e ilhas
    { y: 1930, r: { "South West Africa": "Sudoeste Africano", "Cape Verde": "Cabo Verde", "Sao Tome": "São Tomé e Príncipe", "Mauritius": "Maurício", "Seychelles": "Seicheles",
      "Reunion": "Reunião", "Comoros": "Comores", "Zanzibar": "Zanzibar (protetorado britânico)", "Greenland": "Groenlândia", "Faroe Islands": "Ilhas Faroé",
      "Channel Islands": "Ilhas do Canal", "Guadeloupe": "Guadalupe", "Martinique": "Martinica", "Netherlands Antilles": "Curaçao e dependências",
      "Samoa": "Samoa Ocidental (mandato da Nova Zelândia)", "Tonga": "Tonga (protetorado britânico)", "American Samoa": "Samoa Americana", "Wallis and Futuna Islands": "Wallis e Futuna",
      "United States Virgin Islands": "Ilhas Virgens Americanas", "Rapa Nui": "Rapa Nui (Chile)" },
      f: { "South West Africa": "h:za_old", "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Mauritius": "x:gb", "Seychelles": "x:gb", "Reunion": "x:fr", "Comoros": "x:fr", "Zanzibar": "x:gb",
      "Greenland": "x:dk", "Faroe Islands": "x:dk", "Channel Islands": "x:gb", "Guadeloupe": "x:fr", "Martinique": "x:fr", "Netherlands Antilles": "x:nl", "Samoa": "x:nz", "Tonga": "x:to",
      "American Samoa": "h:us48", "Niue": "x:nz", "Wallis and Futuna Islands": "x:fr", "United States Virgin Islands": "h:us48", "Rapa Nui": "x:cl", "Dominica": "x:gb", "Saint Lucia": "x:gb",
      "Antigua and Barbuda": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb",
      "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" } },
    { y: 1930, m: ["Ruanda-Urundi", "x:be", ["Rwanda (Belgium)", "Burundi"]] },
    { y: 1930, r: { "Mongolia": "República Popular da Mongólia" } },
    { y: 1930, r: { "Danzig": "Cidade Livre de Danzig (Liga das Nações)" }, f: { "Danzig": "h:danzig" }, o: { "Danzig": null } }, // forma do mapa de 1930
    { y: 1930, r: { "Ireland": "Estado Livre Irlandês", "Italy": "Reino da Itália" }, f: { "Ireland": "x:ie", "Hungary": "h:hu_k" }, o: { "Ireland": null } },
    { y: 1937, r: { "Ireland": "Irlanda" } }, // constituição de 29/dez/1937
  ],
  1938: [
    ...ISLES[1938],
    // revisão 1938–1944 (situação em 31/dez de cada ano). Unidades novas vêm de hist-overrides.json.
    { y: 1938, f: { "Cambodia": "x:fr", "Cochin China": "x:fr" } },
    { y: 1938, m: ["Índia Britânica", "x:gb", ["British Raj", "India"]] },
    { y: 1938, m: ["União Soviética", "h:su", ["USSR", "Armenia"]] },
    // Ásia e Oriente Médio
    { y: 1938, r: { "Mesopotamia (GB)": "Reino do Iraque", "Egypt": "Reino do Egito", "Chinese warlords": "República da China", "Korea": "Coreia (Japão)", "Taiwan": "Taiwan (Japão)",
      "Manchukuo": "Manchukuo (Estado fantoche do Japão)", "Tuva": "República Popular de Tuva", "Iceland": "Reino da Islândia", "Lebanon": "Líbano (mandato francês)",
      "Jordan": "Transjordânia (mandato britânico)", "Yemen (UK)": "Áden e protetorados (britânicos)", "Kuwait": "Kuwait (protetorado britânico)",
      "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar (protetorado britânico)", "Cyprus": "Chipre", "Malta": "Malta", "Gibraltar": "Gibraltar", "Macau": "Macau",
      "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português", "Maldives": "Maldivas (protetorado britânico)",
      "Andaman and Nicobar": "Ilhas Andamão e Nicobar", "Burma": "Birmânia (britânica)", "Siam": "Sião", "Bhutan": "Butão", "Philippines": "Filipinas (Commonwealth, EUA)",
      "Hong Kong": "Hong Kong", "Guam": "Guam", "Malaysia": "Malásia Britânica" },
      o: { "Taiwan": "Japão" },
      f: { "Mesopotamia (GB)": "h:iq_k", "Egypt": "h:eg_k", "Chinese warlords": "x:tw", "Xinjiang": "x:tw", "Mongolia": "h:mn24", "Korea": "x:jp", "Taiwan": "x:jp",
      "Manchukuo": "h:manchukuo", "Tuva": "blank", "Iceland": "x:is", "Lebanon": "x:fr", "Jordan": "x:gb", "Kuwait": "h:kw21", "Bahrain": "x:gb", "Cyprus": "x:gb", "Malta": "x:gb",
      "Gibraltar": "x:gb", "Macau": "x:pt", "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Maldives": "x:gb", "Andaman and Nicobar": "x:gb", "Burma": "x:gb",
      "Bhutan": "blank", "Brunei": "h:bn06" } },
    { y: 1938, y1: 1944, r: { "Mongolia": "República Popular da Mongólia" } },
    { y: 1940, y1: 1944, f: { "Mongolia": "h:mn40" } }, { y: 1945, f: { "Mongolia": "h:mn_old" } }, // 1940: vermelha com emblema (simplificado); nova em 10/jul/1945
    { y: 1938, y1: 1938, r: { "Hatay": "Estado de Hatay" }, f: { "Hatay": "h:hatay" } }, // 2/set/1938 a jun/1939
    { y: 1939, m: ["Turquia", "x:tr", ["Turkey", "Hatay"]] },
    { y: 1938, m: ["Palestina (mandato britânico)", "x:gb", ["Mandatory Palestine (GB)", "Israel"]] },
    { y: 1938, m: ["Arábia Saudita", "x:sa", ["Saudi Arabia", "Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_154"]] }, // Hail conquistado em 1921, reino unificado em 1932
    { y: 1938, m: ["Mascate e Omã", "h:om_red", ["Muscat and Oman", "Oman (British Raj)"]] },
    { y: 1939, r: { "Siam": "Tailândia" } }, // 24/jun/1939
    { y: 1938, y1: 1942, r: { "Syria (France)": "Síria (mandato francês)" } },
    { y: 1943, r: { "Syria (France)": "Síria (mandato francês)", "Lebanon": "Líbano" }, f: { "Lebanon": "x:lb" } }, // independência 22/nov/1943, bandeira 7/dez/1943
    { y: 1944, r: { "Syria (France)": "Síria" }, f: { "Syria (France)": "x:sy" }, o: { "Syria (France)": null } }, // reconhecida independente em 1/jan/1944
    { y: 1944, r: { "Iceland": "Islândia" } }, // república em 17/jun/1944
    { y: 1944, m: ["União Soviética", "h:su", ["USSR", "Tuva"]] }, // 11/out/1944
    { y: 1938, f: { "Qatar": "h:qa36" } }, // grená com faixa branca serrilhada (1936–1949)
    { y: 1938, y1: 1940, f: { "Tuva": "h:tuva_arms" } }, { y: 1941, y1: 1942, f: { "Tuva": "h:tuva41" } }, { y: 1943, y1: 1943, f: { "Tuva": "h:tuva43" } },
    // guerra no Pacífico (Japão)
    { y: 1941, y1: 1943, r: { "Guam": "Guam (ocupação japonesa)" }, f: { "Guam": "x:jp" }, o: { "Guam": null } }, // 10/dez/1941 a ago/1944
    { y: 1941, r: { "Hong Kong": "Hong Kong (ocupação japonesa)", "Brunei": "Brunei (ocupação japonesa)" }, f: { "Hong Kong": "x:jp", "Brunei": "x:jp" }, o: { "Hong Kong": null, "Brunei": null } },
    { y: 1938, y1: 1943, m: ["Mandato do Pacífico Sul (Japão)", "x:jp", ["_null_238", "Saipan"]] },
    { y: 1944, r: { "_null_238": "Mandato do Pacífico Sul (Japão)", "Saipan": "Saipan (ocupação americana)" }, f: { "_null_238": "x:jp", "Saipan": "h:us48" }, o: { "Saipan": null } }, // jul/1944
    { y: 1942, r: { "Malaysia": "Malásia e Bornéu (ocupação japonesa)", "Dutch East Indies": "Índias Orientais Holandesas (ocupação japonesa)",
      "Portuguese Timor": "Timor Português (ocupação japonesa)", "Andaman and Nicobar": "Ilhas Andamão e Nicobar (ocupação japonesa)" },
      f: { "Malaysia": "x:jp", "Dutch East Indies": "x:jp", "Portuguese Timor": "x:jp", "Andaman and Nicobar": "x:jp" },
      o: { "Malaysia": null, "Dutch East Indies": null, "Portuguese Timor": null, "Andaman and Nicobar": null } },
    { y: 1942, y1: 1942, r: { "Philippines": "Filipinas (ocupação japonesa)", "Burma": "Birmânia (ocupação japonesa)" }, f: { "Philippines": "x:jp", "Burma": "x:jp" }, o: { "Philippines": null, "Burma": null } },
    { y: 1943, r: { "Philippines": "Segunda República das Filipinas (Estado fantoche do Japão)", "Burma": "Estado da Birmânia (Estado fantoche do Japão)" },
      f: { "Philippines": "blank", "Burma": "h:mm43" }, o: { "Philippines": null, "Burma": null } }, // 14/out/1943 e 1/ago/1943; bandeiras não descritas
    // África
    { y: 1938, r: { "South West Africa": "Sudoeste Africano", "Cape Verde": "Cabo Verde", "Sao Tome": "São Tomé e Príncipe", "Mauritius": "Maurício", "Seychelles": "Seicheles",
      "Reunion": "Reunião", "Comoros": "Comores", "Zanzibar": "Zanzibar (protetorado britânico)", "New Hebrides": "Novas Hébridas" },
      f: { "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Mauritius": "x:gb", "Seychelles": "x:gb", "Reunion": "x:fr", "Comoros": "x:fr", "Zanzibar": "x:gb", "New Hebrides": "h:nh" },
      o: { "New Hebrides": "condomínio franco-britânico" } },
    { y: 1938, m: ["Sudoeste Africano", "h:za_old", ["South West Africa", "Walbis Bay"]] },
    { y: 1938, m: ["Ruanda-Urundi", "x:be", ["Rwanda (Belgium)", "Burundi"]] },
    { y: 1940, y1: 1940, r: { "British Somaliland": "Somalilândia Britânica (ocupação italiana)" }, f: { "British Somaliland": "h:it_sav" }, o: { "British Somaliland": null } }, // ago/1940 a mar/1941
    { y: 1941, r: { "Ethiopia (Italy)": "Império da Etiópia", "Eritrea (Italy)": "Eritreia (adm. britânica)", "Italian Somaliland": "Somália (adm. britânica)" },
      f: { "Ethiopia (Italy)": "h:eth_emp", "Eritrea (Italy)": "x:gb", "Italian Somaliland": "x:gb" }, o: { "Ethiopia (Italy)": null } },
    { y: 1942, y1: 1942, r: { "Madagascar (France)": "Madagascar (ocupação britânica)" }, f: { "Madagascar (France)": "x:gb" }, o: { "Madagascar (France)": null } },
    { y: 1943, r: { "Libya": "Líbia (adm. britânica e francesa)" }, f: { "Libya": "x:gb" }, o: { "Libya": null } },
    // ilhas
    { y: 1938, r: { "Greenland": "Groenlândia", "Faroe Islands": "Ilhas Faroé", "Channel Islands": "Ilhas do Canal", "Guadeloupe": "Guadalupe", "Martinique": "Martinica",
      "Netherlands Antilles": "Curaçao e dependências", "Samoa": "Samoa Ocidental (mandato da Nova Zelândia)", "Tonga": "Tonga (protetorado britânico)" },
      f: { "Greenland": "x:dk", "Faroe Islands": "x:dk", "Channel Islands": "x:gb", "Guadeloupe": "x:fr", "Martinique": "x:fr", "Dominica": "x:gb", "Saint Lucia": "x:gb",
      "Netherlands Antilles": "x:nl", "Samoa": "x:nz", "Tonga": "x:to" } },
    { y: 1940, r: { "Channel Islands": "Ilhas do Canal (ocupação alemã)" }, f: { "Channel Islands": "h:de_nazi" }, o: { "Channel Islands": null } },
    { y: 1938, r: { "American Samoa": "Samoa Americana", "Wallis and Futuna Islands": "Wallis e Futuna", "Turks and Caicos Islands": "Ilhas Turks e Caicos",
      "United States Virgin Islands": "Ilhas Virgens Americanas", "Rapa Nui": "Rapa Nui (Chile)", "Gilbert and Ellice Islands": "Ilhas Gilbert e Ellice" },
      f: { "American Samoa": "h:us48", "Niue": "x:nz", "Wallis and Futuna Islands": "x:fr", "Turks and Caicos Islands": "x:gb", "Antigua and Barbuda": "x:gb",
      "Saint Vincent and the Grenadines": "x:gb", "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb", "Saint Martin": "x:fr",
      "Saint Barthelemy": "x:fr", "Rapa Nui": "x:cl", "United States Virgin Islands": "h:us48" } },
    // Europa
    { y: 1938, y1: 1938, r: { "Spain": "Espanha (guerra civil)" }, f: { "Spain": "blank" } }, // a guerra acabou em 1/abr/1939
    { y: 1938, f: { "Hungary": "h:hu_k" } },
    { y: 1938, y1: 1938, m: ["Tchecoslováquia", "x:cz", ["Czechoslovakia", "Slovakia", "Carpathian Ruthenia"]] }, // Sudetos (out/1938) e sul da Eslováquia (nov/1938) já fora
    { y: 1939, r: { "Czechoslovakia": "Protetorado da Boêmia e Morávia", "Slovakia": "Eslováquia (Estado cliente da Alemanha)" }, f: { "Czechoslovakia": "h:de_nazi", "Slovakia": "h:sk39" } }, // 14–15/mar/1939
    { y: 1939, m: ["Hungria", "h:hu_k", ["Hungary", "Carpathian Ruthenia"]] }, // mar/1939
    { y: 1938, y1: 1938, m: ["Lituânia", "x:lt", ["Lithuania", "Memel"]] },
    // China ocupada: províncias atribuídas aos governos fantoches (Provisório de Pequim: Hebei, Shandong, Shanxi, Henan, Jiangsu; Reformado de Nanquim: Jiangsu, Zhejiang, Anhui, Nanquim, Xangai)
    { y: 1938, y1: 1939, r: { "Occupied China": "China ocupada pelo Japão (governos fantoches)" }, f: { "Occupied China": "h:cn_5" }, o: { "Occupied China": null } }, // ambos usavam a bandeira de cinco cores
    { y: 1940, y1: 1944, r: { "Occupied China": "China ocupada pelo Japão (governo de Wang Jingwei, Estado fantoche)" }, f: { "Occupied China": "x:tw" }, o: { "Occupied China": null } }, // 30/mar/1940; bandeira da República da China (flâmula amarela só ao ar livre, retirada em fev/1943)
    { y: 1938, y1: 1938, r: { "Danzig": "Cidade Livre de Danzig (Liga das Nações)" }, f: { "Danzig": "h:danzig" }, o: { "Danzig": null } }, // anexada em 1/set/1939
    { y: 1939, m: ["Alemanha", "h:de_nazi", ["Germany", "Memel", "Danzig"]] }, // 23/mar/1939
    { y: 1938, y1: 1938, m: ["Polônia", "x:pl", ["Poland", "Vilnius region", "Eastern Poland", "Eastern Poland 1944"]] },
    { y: 1939, y1: 1943, m: ["Polônia (ocupada pela Alemanha)", "h:de_nazi", ["Poland", "Eastern Poland 1944"]] },
    { y: 1939, o: { "Poland": null } },
    { y: 1939, y1: 1939, m: ["Lituânia", "x:lt", ["Lithuania", "Vilnius region"]] }, // out/1939
    { y: 1939, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Eastern Poland"]] },
    { y: 1944, r: { "Poland": "Polônia (ocupada pela Alemanha)", "Eastern Poland 1944": "Polônia (Governo Provisório)" }, f: { "Poland": "h:de_nazi", "Eastern Poland 1944": "x:pl" } },
    { y: 1941, y1: 1943, r: { "Eastern Poland": "Leste da Polônia de 1939 (ocupado pela Alemanha)" }, f: { "Eastern Poland": "h:de_nazi" }, o: { "Eastern Poland": null } },
    { y: 1940, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Estonia", "Latvia", "Courland", "Lithuania", "Vilnius region", "Bessarabia", "Finnish Karelia"]] },
    { y: 1941, y1: 1943, r: { "Estonia": "Estônia (ocupada pela Alemanha)", "Latvia": "Letônia (ocupada pela Alemanha)", "Lithuania": "Lituânia (ocupada pela Alemanha)",
      "Belarusian SSR": "Bielorrússia soviética (ocupada pela Alemanha)" },
      f: { "Estonia": "h:de_nazi", "Latvia": "h:de_nazi", "Lithuania": "h:de_nazi", "Belarusian SSR": "h:de_nazi" },
      o: { "Estonia": null, "Latvia": null, "Lithuania": null, "Belarusian SSR": null } },
    { y: 1941, y1: 1943, m: ["Lituânia (ocupada pela Alemanha)", "h:de_nazi", ["Lithuania", "Vilnius region"]] },
    { y: 1941, y1: 1942, m: ["Ucrânia soviética (ocupada pela Alemanha)", "h:de_nazi", ["Ukrainian SSR", "Ukrainian SSR east", "Crimea"]] },
    { y: 1943, y1: 1943, m: ["Ucrânia soviética (ocupada pela Alemanha)", "h:de_nazi", ["Ukrainian SSR", "Crimea"]] }, // margem esquerda do Dnieper e Kiev retomadas em 1943
    { y: 1941, y1: 1943, o: { "Ukrainian SSR": null } },
    { y: 1938, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Belarusian SSR", "Ukrainian SSR", "Ukrainian SSR east", "Crimea", "Transnistria"]] },
    { y: 1941, y1: 1942, m: ["União Soviética", "h:su", ["USSR"]] },
    { y: 1943, y1: 1943, m: ["União Soviética", "h:su", ["USSR", "Ukrainian SSR east"]] },
    { y: 1944, m: ["União Soviética", "h:su", ["USSR", "Estonia", "Latvia", "Lithuania", "Vilnius region", "Eastern Poland", "Belarusian SSR", "Ukrainian SSR", "Ukrainian SSR east", "Crimea", "Bessarabia", "Finnish Karelia", "Transnistria"]] },
    { y: 1938, y1: 1939, m: ["Letônia", "x:lv", ["Latvia", "Courland"]] },
    { y: 1941, y1: 1943, m: ["Letônia (ocupada pela Alemanha)", "h:de_nazi", ["Latvia", "Courland"]] },
    { y: 1944, r: { "Courland": "Bolsão da Curlândia (ocupado pela Alemanha)" }, f: { "Courland": "h:de_nazi" }, o: { "Courland": null } }, // out/1944 a mai/1945; aproximado pela região de Kurzeme
    { y: 1941, y1: 1943, r: { "Transnistria": "Transnístria (ocupada pela Romênia)" }, f: { "Transnistria": "x:ro" }, o: { "Transnistria": null } }, // 19/ago/1941 a abr/1944 (Odessa retomada em 10/abr/1944); aproximada pela região de Odessa e margem esquerda do Dniestre
    { y: 1938, y1: 1939, m: ["Romênia", "x:ro", ["Romania", "Bessarabia", "Southern Dobruja", "Northern Transylvania"]] },
    { y: 1940, y1: 1940, m: ["Romênia", "x:ro", ["Romania"]] },
    { y: 1941, y1: 1943, m: ["Romênia", "x:ro", ["Romania", "Bessarabia"]] }, // jul/1941
    { y: 1944, m: ["Romênia", "x:ro", ["Romania", "Northern Transylvania"]] }, // out/1944
    { y: 1940, m: ["Bulgária", "x:bg", ["Bulgaria", "Southern Dobruja"]] }, // 7/set/1940
    { y: 1940, y1: 1943, m: ["Hungria", "h:hu_k", ["Hungary", "Northern Transylvania"]] }, // 30/ago/1940
    { y: 1938, y1: 1939, m: ["Finlândia", "x:fi", ["Finland", "Finnish Karelia"]] },
    { y: 1941, y1: 1943, m: ["Finlândia", "x:fi", ["Finland", "Finnish Karelia"]] },
    { y: 1938, y1: 1939, m: ["França", "x:fr", ["France", "Alsace-Moselle"]] },
    { y: 1940, y1: 1943, r: { "Alsace-Moselle": "Alsácia-Mosela (anexada pela Alemanha)" }, f: { "Alsace-Moselle": "h:de_nazi" }, o: { "Alsace-Moselle": null } },
    { y: 1940, y1: 1941, r: { "France": "França de Vichy (norte ocupado pela Alemanha)" } },
    { y: 1942, y1: 1943, r: { "France": "França de Vichy (ocupada pela Alemanha e Itália)" } }, // nov/1942
    { y: 1944, m: ["França (Governo Provisório)", "x:fr", ["France", "Alsace-Moselle"]] },
    { y: 1940, r: { "Netherlands": "Países Baixos (ocupados pela Alemanha)", "Norway": "Noruega (ocupada pela Alemanha)", "Denmark": "Dinamarca (ocupada pela Alemanha)" },
      f: { "Netherlands": "h:de_nazi", "Norway": "h:de_nazi" }, o: { "Netherlands": null, "Norway": null } },
    { y: 1940, y1: 1943, r: { "Belgium": "Bélgica (ocupada pela Alemanha)", "Luxembourg": "Luxemburgo (anexado pela Alemanha)" },
      f: { "Belgium": "h:de_nazi", "Luxembourg": "h:de_nazi" }, o: { "Belgium": null, "Luxembourg": null } }, // libertados em set/1944
    { y: 1938, y1: 1942, m: ["Reino da Itália", "h:it_sav", ["Italy", "Southern Italy", "Central Italy"]] },
    { y: 1943, y1: 1943, m: ["República Social Italiana (Estado fantoche da Alemanha)", "x:it", ["Italy", "Central Italy"]] }, // 23/set/1943; bandeira nacional = tricolor lisa
    { y: 1944, r: { "Italy": "República Social Italiana (Estado fantoche da Alemanha)" }, f: { "Italy": "x:it" } },
    { y: 1943, r: { "Southern Italy": "Reino da Itália" }, f: { "Southern Italy": "h:it_sav" } },
    { y: 1944, m: ["Reino da Itália", "h:it_sav", ["Southern Italy", "Central Italy"]] }, // Roma 4/jun/1944
    { y: 1938, y1: 1942, r: { "Dodecanese": "Dodecaneso (Itália)" }, f: { "Dodecanese": "h:it_sav" } },
    { y: 1943, r: { "Dodecanese": "Dodecaneso (ocupação alemã)" }, f: { "Dodecanese": "h:de_nazi" }, o: { "Dodecanese": null } },
    { y: 1943, r: { "Albania": "Albânia (ocupada pela Alemanha)" }, f: { "Albania": "h:de_nazi" }, o: { "Albania": null } },
    { y: 1944, r: { "Albania": "Albânia" }, f: { "Albania": "x:al" } }, // libertada em nov/1944; desenho da bandeira de 1944 não descrito (pendente)
    { y: 1938, y1: 1940, m: ["Iugoslávia", "h:yu_fr", ["Yugoslavia", "Croatia", "Slovenia", "Montenegro", "Vardar Macedonia", "Kosovo"]] },
    { y: 1938, y1: 1943, m: ["Grécia", "h:gr_cross", ["Greece", "Crete"]] },
    { y: 1938, y1: 1940, m: ["Grécia", "h:gr_cross", ["Greece", "Western Thrace"]] },
    { y: 1944, r: { "Crete": "Creta (ocupação alemã)" }, f: { "Crete": "h:de_nazi" }, o: { "Crete": null } }, // até mai/1945
    { y: 1938, y1: 1943, m: ["Países Baixos", "x:nl", ["Netherlands", "South Netherlands"]] },
    { y: 1944, r: { "South Netherlands": "Sul dos Países Baixos (libertado)" }, f: { "South Netherlands": "x:nl" }, o: { "South Netherlands": null } }, // set–nov/1944
    { y: 1940, y1: 1944, r: { "Faroe Islands": "Ilhas Faroé (ocupação britânica)" }, f: { "Faroe Islands": "x:gb" }, o: { "Faroe Islands": null } }, // abr/1940 a set/1945
    { y: 1941, y1: 1943, r: { "Yugoslavia": "Sérvia (ocupação alemã)", "Montenegro": "Montenegro (ocupação italiana)", "Vardar Macedonia": "Macedônia (ocupação búlgara)", "Greece": "Grécia (ocupada pelo Eixo)", "Western Thrace": "Trácia Ocidental (ocupação búlgara)" },
      f: { "Yugoslavia": "h:de_nazi", "Montenegro": "h:it_sav", "Vardar Macedonia": "x:bg", "Greece": "blank", "Western Thrace": "x:bg" },
      o: { "Yugoslavia": null, "Montenegro": null, "Vardar Macedonia": null, "Greece": null, "Western Thrace": null } }, // abr/1941
    { y: 1941, r: { "Croatia": "Estado Independente da Croácia (fantoche do Eixo)", "Slovenia": "Eslovênia (dividida entre Alemanha e Itália)" },
      f: { "Croatia": "h:hr41", "Slovenia": "blank" }, o: { "Croatia": null, "Slovenia": null } }, // 10/abr/1941; bandeira da Croácia não descrita
    { y: 1941, y1: 1942, m: ["Albânia (ocupada pela Itália)", "h:it_sav", ["Albania", "Kosovo"]] },
    { y: 1943, y1: 1943, m: ["Albânia (ocupada pela Alemanha)", "h:de_nazi", ["Albania", "Kosovo"]] },
    { y: 1943, r: { "Montenegro": "Montenegro (ocupação alemã)", "Slovenia": "Eslovênia (ocupada pela Alemanha)" }, f: { "Montenegro": "h:de_nazi", "Slovenia": "h:de_nazi" } }, // set/1943
    { y: 1944, m: ["Iugoslávia (governo dos partisans)", "h:yu_sfr", ["Yugoslavia", "Montenegro", "Vardar Macedonia", "Kosovo"]] }, // Belgrado 20/out/1944
    { y: 1944, m: ["Grécia", "h:gr_cross", ["Greece", "Western Thrace"]] }, // out/1944
    { y: 1939, r: { "Albania": "Albânia (ocupada pela Itália)" }, f: { "Albania": "h:it_sav" }, o: { "Albania": null } },
  ],
  1945: [
    ...ISLES[1945],
    { y: 1945, f: { "Israel": "x:gb" }, r: { "Burma": "Birmânia (britânica)" } },
    { y: 1945, f: { "Burma": "x:gb" } },
    { y: 1945, m: ["Índia Britânica", "x:gb", ["India", "Pakistan", "Bangladesh"]] },
    // revisão 1945 (situação em 31/dez/1945)
    { y: 1945, r: { "Mongolia": "República Popular da Mongólia", "Egypt": "Reino do Egito", "Ethiopia": "Império da Etiópia", "Manchuria": "Manchúria (ocupação soviética)", "Somalia": "Somália (adm. britânica)",
      "Saar Protectorate": "Sarre (ocupação francesa)", "Rhodesia": "Rodésia do Sul", "Guyana": "Guiana Britânica", "Dutch Guinea": "Nova Guiné Holandesa",
      "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "American Samoa": "Samoa Americana", "Samoa": "Samoa Ocidental (tutela da Nova Zelândia)",
      "Tonga": "Tonga (protetorado britânico)", "Wallis and Futuna Islands": "Wallis e Futuna", "Turks and Caicos Islands": "Ilhas Turks e Caicos",
      "United States Virgin Islands": "Ilhas Virgens Americanas", "Netherlands Antilles": "Curaçao e dependências", "Rapa Nui": "Rapa Nui (Chile)", "Bhutan": "Butão" },
      f: { "Egypt": "h:eg_k", "Ethiopia": "h:eth_emp", "Manchuria": "h:su", "Somalia": "x:gb", "Yugoslavia": "h:yu_sfr", "Japan (USA)": "x:jp", "Xinjiang": "x:tw",
      "Papua New Guinea": "x:au", "American Samoa": "h:us48", "Samoa": "x:nz", "Niue": "x:nz", "Tonga": "x:to", "Wallis and Futuna Islands": "x:fr",
      "Turks and Caicos Islands": "x:gb", "Dominica": "x:gb", "Saint Lucia": "x:gb", "Antigua and Barbuda": "x:gb", "Saint Vincent and the Grenadines": "x:gb",
      "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb", "Netherlands Antilles": "x:nl", "Saint Martin": "x:fr",
      "Saint Barthelemy": "x:fr", "Rapa Nui": "x:cl", "Bhutan": "blank", "Brunei": "h:bn06" } },
    { y: 1945, m: ["China", "x:tw", ["China", "Taiwan"]] }, // Taiwan entregue à República da China em 25/out/1945
    { y: 1945, m: ["Nigéria", "x:gb", ["Nigeria", "Benin"]] }, // o Reino do Benim foi anexado em 1897
  ],
};

const R2D = 180 / Math.PI;
const toXYZ = ([lon, lat]) => {
  const l = lon / R2D, p = lat / R2D;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
};
function unwrapRing(ring) {
  const out = []; let shift = 0, prev = null;
  for (const [x0, y] of ring) { let x = x0 + shift; if (prev !== null) { if (x - prev > 180) { shift -= 360; x -= 360; } else if (x - prev < -180) { shift += 360; x += 360; } } out.push([x, y]); prev = x; }
  return out;
}
const sphArea = (poly) => { let a = geoArea({ type: "Polygon", coordinates: poly }); return a > 2 * Math.PI ? 4 * Math.PI - a : a; };

export function buildSnapshots(OUT) {
  fs.mkdirSync(OUT + "/hist", { recursive: true });
  const out = [];
  for (const [sy, p0, p1] of SNAPS) {
    const g = JSON.parse(fs.readFileSync(`dl/hb/world_${sy}.geojson`, "utf8"));
    const keys = [], keyIndex = new Map(), subj = [], polys = [];
    g.features.forEach((f, i) => {
      const raw = f.properties.NAME;
      const key = raw && raw.trim() ? raw : (raw && sy === 1815 ? "__UKNL" : "_null_" + i);
      if (!keyIndex.has(key)) { keyIndex.set(key, keys.length); keys.push(key); subj.push(f.properties.SUBJECTO || ""); polys.push([]); }
      f.id = i; f.properties._u = keyIndex.get(key);
      const geom = f.geometry;
      const ps = !geom ? [] : geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
      for (const p of ps) polys[f.properties._u].push(p);
    });
    // unit facts: area and a label point inside the largest polygon
    const units = keys.map((k, u) => {
      let sr = 0, best = null, bestA = -1;
      for (const p of polys[u]) { const a = sphArea(p); sr += a; if (a > bestA) { bestA = a; best = p; } }
      let ll = [0, 0];
      if (best) {
        const rings = best.map(unwrapRing);
        const pt = polylabel(rings, 0.05);
        ll = [((pt[0] + 540) % 360) - 180, pt[1]];
      }
      return { key: k, subj: subj[u], sr, ll };
    });
    const ovr = OVR[sy] || [];
    for (const o of ovr) {
      if (keyIndex.has(o.key)) continue; // a key the map already has just gets more provinces
      keyIndex.set(o.key, keys.length); keys.push(o.key); units.push({ key: o.key, subj: "", sr: 0, ll: null });
    }
    // border segments between different units, from the map rebuilt on today's provinces (hist_overlay.py)
    const frag = JSON.parse(fs.readFileSync(`data/android/frag_${sy}.geojson`, "utf8"));
    if (frag.keys.length === keys.length + 1 && frag.keys[keys.length] === "_none") {
      keys.push("_none"); units.push({ key: "_none", subj: "", sr: 0, ll: [0, 0] });
    }
    if (frag.keys.length !== keys.length || frag.keys.some((k, i) => k !== keys[i])) throw new Error("unit order differs in " + sy);
    const landSr = new Array(keys.length).fill(0);
    // area per polygon: a multipolygon whose parts wind differently would otherwise come out wrong
    for (const f of frag.features) {
      const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of ps) { const a = geoArea({ type: "Polygon", coordinates: p }); landSr[f.properties.u] += Math.min(a, 4 * Math.PI - a); }
    }
    units.forEach((u, i) => { u.sr = landSr[i]; });
    if (ovr.length) {
      // a label point left on land given to another unit moves into the unit's biggest piece
      const fr = frag.features.map((f) => {
        const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        return { u: f.properties.u, ps, a: ps.map((p) => sphArea(p)) };
      });
      units.forEach((un, i) => {
        if (un.key === "_none") return;
        const own = fr.filter((x) => x.u === i);
        if (!own.length) return;
        if (un.ll && !fr.some((x) => x.u !== i && x.ps.some((p) => inPoly(un.ll, p)))) return;
        let best = null, bestA = -1;
        for (const x of own) x.ps.forEach((p, k) => { if (x.a[k] > bestA) { bestA = x.a[k]; best = p; } });
        const pt = polylabel(best.map(unwrapRing), 0.05);
        un.ll = [((pt[0] + 540) % 360) - 180, pt[1]];
      });
      for (const [k, ll] of Object.entries((OVR.labels || {})[sy] || {})) units[keyIndex.get(k)].ll = ll;
    }
    let t = topology({ c: frag }, 1e6);
    t = presimplify(t);
    t = simplify(t, quantile(t, 0.2));
    const geoms = t.objects.c.geometries;
    const use = new Map();
    geoms.forEach((gm) => {
      const u = gm.properties.u;
      const walk = (a) => { if (Array.isArray(a)) a.forEach(walk); else { const k = a < 0 ? ~a : a; if (!use.has(k)) use.set(k, new Set()); use.get(k).add(u); } };
      walk(gm.arcs || []);
    });
    const seg = [];
    for (const [k, us] of use) {
      if (us.size !== 2) continue;
      const [ua, ub] = [...us];
      const line = feature(t, { type: "LineString", arcs: [k] }).geometry.coordinates;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const d = geoDistance(a, b);
        if (d > 0.5) continue; // skip broken long jumps
        const n = Math.max(1, Math.ceil((d * R2D) / 1.0));
        const it = geoInterpolate(a, b);
        let prev = a;
        for (let s = 1; s <= n; s++) { const cur = s === n ? b : it(s / n); seg.push(...toXYZ(prev), ...toXYZ(cur), ua, ub); prev = cur; }
      }
    }
    // fill shapes (fill_overlay.py) for highlighting a tapped unit and finding what was tapped.
    // Vertices are lon/lat in 1/100 degree (int16); triangles come in chunks of one unit with 16-bit indices.
    {
      const fill = JSON.parse(fs.readFileSync(`data/android/fill_${sy}.geojson`, "utf8"));
      const V = [], I = [], chunks = [];
      for (const f of fill.features) {
        let ch = null, vm = null;
        const open = () => { ch = { u: f.properties.u, vb: V.length / 2, ib: I.length, n: 0, nv: 0 }; chunks.push(ch); vm = new Map(); };
        open();
        const v = (p) => {
          const x = Math.round(p[0] * 100), y = Math.round(p[1] * 100), k = x * 100000 + y;
          let i = vm.get(k);
          if (i === undefined) { i = ch.nv++; V.push(x, y); vm.set(k, i); }
          return i;
        };
        triangulate(polysOf(f.geometry), (a, b, c) => {
          if (ch.nv > 65000) open();
          const t = [v(a), v(b), v(c)];
          if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) return;
          I.push(...t); ch.n += 3;
        }, 8);
      }
      const nv = V.length / 2, ni = I.length, nc = chunks.length;
      for (const x of V) if (Math.abs(x) > 32767) throw new Error("fill coordinate out of range");
      const fb = Buffer.alloc(16 + nc * 16 + nv * 4 + ni * 2);
      fb.write("FIL2", 0); fb.writeUInt32LE(nv, 4); fb.writeUInt32LE(ni, 8); fb.writeUInt32LE(nc, 12);
      let q = 16;
      for (const c of chunks) { fb.writeUInt32LE(c.u, q); fb.writeUInt32LE(c.vb, q + 4); fb.writeUInt32LE(c.ib, q + 8); fb.writeUInt32LE(c.n, q + 12); q += 16; }
      for (const x of V) { fb.writeInt16LE(x, q); q += 2; }
      for (const x of I) { fb.writeUInt16LE(x, q); q += 2; }
      fs.writeFileSync(`${OUT}/hist/f${sy}.bin`, fb);
      console.log("  fill", sy, "vertices", nv, "triangles", ni / 3, "chunks", nc, (fb.length / 1048576).toFixed(2), "MB");
    }
    const S = seg.length / 8;
    const buf = Buffer.alloc(8 + S * 28);
    buf.write("SEG1", 0); buf.writeUInt32LE(S, 4);
    let o = 8;
    for (let s = 0; s < S; s++) {
      for (let j = 0; j < 6; j++) { buf.writeFloatLE(seg[s * 8 + j], o); o += 4; }
      buf.writeUInt16LE(seg[s * 8 + 6], o); o += 2; buf.writeUInt16LE(seg[s * 8 + 7], o); o += 2;
    }
    fs.writeFileSync(`${OUT}/hist/s${sy}.bin`, buf);
    out.push({ sy, p0, p1, units, S });
    console.log("snapshot", sy, "units", units.length, "segments", S);
  }
  return out;
}

/** For every year 1800–1945: units after events; consecutive identical years are grouped into eras. */
export function buildEras(snaps) {
  const eras = [];
  const missing = new Set();
  snaps.forEach((sn, si) => {
    const evs = (EVENTS[sn.sy] || []).slice().sort((a, b) => a.y - b.y);
    for (const e of evs) {
      for (const k of Object.keys(e.r || {}).concat(Object.keys(e.f || {}))) if (!sn.units.some((u) => u.key === k)) missing.add(sn.sy + ":" + k);
      if (e.m) for (const k of e.m[2]) if (!sn.units.some((u) => u.key === k)) missing.add(sn.sy + ":" + k);
    }
    let last = null;
    for (let y = sn.p0; y <= sn.p1; y++) {
      const idx = new Map(sn.units.map((u, i) => [u.key, i]));
      const unitOf = sn.units.map((_, i) => i);            // snapshot unit -> group root
      const name = sn.units.map((u) => (u.key.startsWith("_null_") || u.key === "_none" ? null : u.key === "__UKNL" ? "Reino Unido dos Países Baixos" : translate(u.key)));
      const flag = sn.units.map((u) => (u.key === "__UKNL" ? "x:nl" : flagFor(u.key, u.subj, y)));
      const root = (i) => { while (unitOf[i] !== i) i = unitOf[i]; return i; };
      const own = sn.units.map(() => undefined);
      for (const e of evs) {
        if (e.y > y || (e.y1 !== undefined && e.y1 < y)) continue;
        for (const [k, v] of Object.entries(e.o || {})) if (idx.has(k)) own[root(idx.get(k))] = v;
        for (const [k, v] of Object.entries(e.r || {})) if (idx.has(k)) name[root(idx.get(k))] = v;
        for (const [k, v] of Object.entries(e.f || {})) if (idx.has(k)) flag[root(idx.get(k))] = v;
        if (e.m) {
          const present = e.m[2].filter((k) => idx.has(k)).map((k) => root(idx.get(k)));
          if (!present.length) continue;
          const r0 = present[0];
          for (const r of present) unitOf[r] = r0;
          unitOf[r0] = r0;
          if (e.m[0] !== null) { name[r0] = e.m[0]; flag[r0] = e.m[1]; } // m com nome null: só junta, mantém nome e bandeira da raiz
        }
      }
      // collapse to era units
      const roots = [...new Set(sn.units.map((_, i) => root(i)))];
      const code = new Map(roots.map((r, k) => [r, k]));
      const units = roots.map((r) => {
        const members = sn.units.map((_, i) => i).filter((i) => root(i) === r);
        const big = members.reduce((a, b) => (sn.units[b].sr > sn.units[a].sr ? b : a));
        const sr = members.reduce((s, i) => s + sn.units[i].sr, 0);
        const ll = sn.units[big].ll.map((v) => +v.toFixed(2));
        const nm = sr > 0 ? name[r] : null; // a unit left with no land (all of it given to other units) is hidden
        const fl = y < 1801 && flag[r] === "x:gb" ? "h:gb1707" : y < 1790 && flag[r] === "x:fr" ? "h:fr_bourbon" : y < 1794 && flag[r] === "x:fr" ? "h:fr1790" : flag[r]; // tricolor invertida até 15/fev/1794 // Union Jack sem a cruz de São Patrício antes de 1/jan/1801
        let ow = !nm ? null : own[r] !== undefined ? own[r] : ownerFor(sn.units[r].key, nm, flag[r], y);
        if (y < 1801 && (ow === "Reino Unido" || ow === "Grã-Bretanha")) ow = "Reino da Grã-Bretanha";
        return [nm, fl, ll[0], ll[1], +sr.toPrecision(4), ow];
      });
      const map = sn.units.map((_, i) => code.get(root(i)));
      const sig = JSON.stringify([units, map]);
      if (last && last.sig === sig) { last.era.y1 = y; continue; }
      const era = { y0: y, y1: y, s: si, u: units, m: map };
      eras.push(era);
      last = { sig, era };
    }
  });
  if (missing.size) console.warn("event keys not found:", [...missing].join(", "));
  console.log("eras", eras.length);
  return eras;
}
