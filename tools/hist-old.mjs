// History 1800–1945 from the historical-basemaps snapshots + yearly events.
// Writes <OUT>/hist/s<year>.bin (border segments between the snapshot's units) and returns the eras.
import fs from "fs";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";
import { feature } from "topojson-client";
import { geoArea, geoInterpolate, geoDistance } from "d3-geo";
import polylabel from "polylabel";
import { translate, flagFor, ownerFor } from "./hist-names.mjs";
import { triangulate, polysOf } from "./tri.mjs";

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

export const SNAPS = [
  [1600, 1600, 1649], [1650, 1650, 1699], [1700, 1700, 1714], [1715, 1715, 1782], [1783, 1783, 1799],
  [1800, 1800, 1814], [1815, 1815, 1879], [1880, 1880, 1899], [1900, 1900, 1913], [1914, 1914, 1919],
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
  1880: [
    { y: 1880, r: { "Kingdom of Brazil": "Império do Brasil" } },
    { y: 1889, r: { "Kingdom of Brazil": "Brasil" } },
    { y: 1894, r: { "Kingdom of Hawaii": "República do Havaí" } },
    { y: 1898, r: { "Kingdom of Hawaii": "Havaí (EUA)" }, f: { "Kingdom of Hawaii": "x:us" } },
    { y: 1899, r: { "Philippines": "Filipinas (EUA)" } },
  ],
  1900: [
    { y: 1900, r: { "Philippines": "Filipinas (EUA)", "Kingdom of Hawaii": "Havaí (EUA)" }, f: { "Philippines": "x:us", "Kingdom of Hawaii": "x:us", "Kingdom of Brazil": "x:br" } },
    { y: 1902, r: { "Transvaal": "Colônia do Transvaal", "Orange Free State": "Colônia do Rio Orange" }, f: { "Transvaal": "x:gb", "Orange Free State": "x:gb" } },
    { y: 1905, r: { "Sweden–Norway": "Suécia e Noruega" } },
    { y: 1908, r: { "Bosnia-Herzegovina": "Bósnia e Herzegovina (Áustria-Hungria)" }, f: { "Bosnia-Herzegovina": "h:at_hab" } },
    { y: 1910, r: { "Korea": "Coreia (Japão)" }, f: { "Korea": "x:jp" } },
    { y: 1910, m: ["União Sul-Africana", "h:za_old", ["Cape Colony", "Natal", "Transvaal", "Orange Free State"]] },
    { y: 1912, r: { "Manchu Empire": "República da China", "Morocco": "Marrocos (protetorado francês)" }, f: { "Manchu Empire": "h:cn_5", "Morocco": "x:fr" } },
  ],
  1914: [
    { y: 1917, r: { "Grand Duchy of Finland": "Finlândia" }, f: { "Grand Duchy of Finland": "x:fi" } },
    { y: 1918, r: { "Russian Empire": "Rússia Soviética", "Austro-Hungarian Empire": "Áustria-Hungria (em dissolução)" }, f: { "Russian Empire": "h:su" } },
    { y: 1919, r: { "German Empire": "Alemanha (República de Weimar)" }, f: { "German Empire": "x:de" } },
  ],
  1920: [
    { y: 1920, f: { "Mandatory Palestine (GB)": "x:gb" } },
    { y: 1922, r: { "Egypt": "Reino do Egito" }, f: { "Egypt": "h:eg_k" } },
    { y: 1922, m: ["União Soviética", "h:su", ["USSR", "Ukraine", "Georgia", "Armenia", "Azerbaijan", "Far Eastern SSR", "White Russia", "South Russia"]] },
    { y: 1923, r: { "Ottoman Sultanate": "Turquia" } },
    { y: 1926, r: { "Hejaz": "Reino de Hejaz e Négede" }, f: { "Hejaz": "x:sa" } },
    { y: 1928, r: { "Chinese Warlords": "República da China" }, f: { "Chinese Warlords": "x:tw" } },
  ],
  1930: [
    // revisão 1935–1937 (situação em 31/dez); vale também para 1930–1934, ainda não revisados. Unidades novas vêm de hist-overrides.json.
    { y: 1930, m: ["União Soviética", "h:su", ["White Russia", "Azerbaijan", "Armenia", "Georgia", "Far Eastern SSR"]] }, // a República do Extremo Oriente entrou na Rússia soviética em 15/nov/1922
    { y: 1930, m: ["Turquia", "x:tr", ["Republic of Turkey", "Turkey"]] },
    { y: 1930, m: ["Alemanha", "x:de", ["Germany", "East Prussia"]] },
    { y: 1935, m: ["Alemanha", "h:de_nazi", ["Germany", "East Prussia", "Saar"]] }, // Sarre: plebiscito, volta em 1/mar/1935; bandeira nazista única desde 15/set/1935
    { y: 1933, y1: 1934, f: { "Germany": "h:de_emp" } },
    { y: 1930, y1: 1934, r: { "Saar": "Território da Bacia do Sarre (Liga das Nações)" }, f: { "Saar": "blank" } },
    { y: 1930, r: { "Chinese Warlords": "República da China", "Korea": "Coreia (Japão)", "Taiwan": "Taiwan (Japão)",
      "Lebanon": "Líbano (mandato francês)", "Tuva": "República Popular de Tuva", "Iceland": "Reino da Islândia", "Egypt": "Reino do Egito", "Jordan": "Transjordânia (mandato britânico)",
      "Mesopotamia (GB)": "Iraque (mandato britânico)", "Kuwait": "Kuwait (protetorado britânico)", "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar (protetorado britânico)",
      "Aden": "Áden e protetorados (britânicos)", "Muscat and Oman": "Mascate e Omã", "Cyprus": "Chipre", "Malta": "Malta", "Gibraltar": "Gibraltar", "Macau": "Macau",
      "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português", "Maldives": "Maldivas (protetorado britânico)",
      "Rattanakosin Kingdom": "Sião", "Bhutan": "Butão", "Philippines": "Filipinas (EUA)", "South Seas Mandate": "Mandato do Pacífico Sul (Japão)", "Guam": "Guam",
      "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "Dodecanese Islands": "Dodecaneso (Itália)" },
      f: { "Chinese Warlords": "x:tw", "Xinjiang": "x:tw", "Mongolia": "blank", "Korea": "x:jp", "Taiwan": "x:jp", "Lebanon": "x:fr", "Tuva": "blank", "Iceland": "x:is",
      "Egypt": "h:eg_k", "Jordan": "x:gb", "Kuwait": "x:gb", "Bahrain": "x:gb", "Aden": "x:gb", "Muscat and Oman": "h:om_red", "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb",
      "Macau": "x:pt", "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Maldives": "x:gb", "Rattanakosin Kingdom": "x:th", "Bhutan": "blank", "Brunei": "h:bn06",
      "South Seas Mandate": "x:jp", "Guam": "h:us48", "Papua New Guinea": "x:au" },
      o: { "Taiwan": "Japão", "Egypt": null, "Muscat and Oman": null } },
    { y: 1930, y1: 1930, m: ["República da China", "x:tw", ["Chinese Warlords", "Manchuria"]] }, // Manchúria sob a República da China desde 1928
    { y: 1931, y1: 1931, r: { "Manchuria": "Manchúria (ocupação japonesa)" }, f: { "Manchuria": "x:jp" }, o: { "Manchuria": null } }, // invasão de set/1931
    { y: 1932, r: { "Manchuria": "Manchukuo (Estado fantoche do Japão)" }, f: { "Manchuria": "h:manchukuo" } }, // 1/mar/1932
    { y: 1930, y1: 1936, m: ["Índia Britânica", "x:gb", ["British Raj", "Burma"]] },
    { y: 1937, r: { "Burma": "Birmânia (britânica)" }, f: { "Burma": "x:gb" } }, // separada da Índia em 1/abr/1937
    { y: 1932, r: { "Mesopotamia (GB)": "Reino do Iraque" }, f: { "Mesopotamia (GB)": "h:iq_k" }, o: { "Mesopotamia (GB)": null } }, // 3/out/1932
    { y: 1930, y1: 1931, m: ["Reino de Hejaz e Négede", "x:sa", ["Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_44"]] },
    { y: 1932, m: ["Arábia Saudita", "x:sa", ["Hejaz", "Emirate of Bin Shal'an", "Hail", "_null_44"]] }, // 23/set/1932
    { y: 1935, r: { "Iran": "Irã" } },
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
      "Antigua and Barbuda": "x:gb", "Saint Vincent and the Grenadines": "x:gb", "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb",
      "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" } },
    { y: 1930, m: ["Ruanda-Urundi", "x:be", ["Rwanda (Belgium)", "Burundi"]] },
    { y: 1930, r: { "Danzig": null } }, // a Cidade Livre de Danzig não tem província própria hoje (fica na Polônia; pendente)
    { y: 1930, r: { "Ireland": "Estado Livre Irlandês", "Italy": "Reino da Itália" }, f: { "Ireland": "x:ie", "Hungary": "h:hu_k" }, o: { "Ireland": null } },
    { y: 1937, r: { "Ireland": "Irlanda" } }, // constituição de 29/dez/1937
  ],
  1938: [
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
      f: { "Mesopotamia (GB)": "h:iq_k", "Egypt": "h:eg_k", "Chinese warlords": "x:tw", "Xinjiang": "x:tw", "Mongolia": "blank", "Korea": "x:jp", "Taiwan": "x:jp",
      "Manchukuo": "h:manchukuo", "Tuva": "blank", "Iceland": "x:is", "Lebanon": "x:fr", "Jordan": "x:gb", "Kuwait": "x:gb", "Bahrain": "x:gb", "Cyprus": "x:gb", "Malta": "x:gb",
      "Gibraltar": "x:gb", "Macau": "x:pt", "Goa": "x:pt", "French India": "x:fr", "Portuguese Timor": "x:pt", "Maldives": "x:gb", "Andaman and Nicobar": "x:gb", "Burma": "x:gb",
      "Bhutan": "blank", "Brunei": "h:bn06" } },
    { y: 1938, y1: 1938, r: { "Hatay": "Estado de Hatay" }, f: { "Hatay": "blank" } }, // 2/set/1938 a jun/1939
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
      f: { "Philippines": "blank", "Burma": "blank" }, o: { "Philippines": null, "Burma": null } }, // 14/out/1943 e 1/ago/1943; bandeiras não descritas
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
    { y: 1939, r: { "Czechoslovakia": "Protetorado da Boêmia e Morávia", "Slovakia": "Eslováquia (Estado cliente da Alemanha)" }, f: { "Czechoslovakia": "h:de_nazi", "Slovakia": "blank" } }, // 14–15/mar/1939
    { y: 1939, m: ["Hungria", "h:hu_k", ["Hungary", "Carpathian Ruthenia"]] }, // mar/1939
    { y: 1938, y1: 1938, m: ["Lituânia", "x:lt", ["Lithuania", "Memel"]] },
    { y: 1939, m: ["Alemanha", "h:de_nazi", ["Germany", "Memel"]] }, // 23/mar/1939
    { y: 1938, y1: 1938, m: ["Polônia", "x:pl", ["Poland", "Vilnius region", "Eastern Poland", "Eastern Poland 1944"]] },
    { y: 1939, y1: 1943, m: ["Polônia (ocupada pela Alemanha)", "h:de_nazi", ["Poland", "Eastern Poland 1944"]] },
    { y: 1939, o: { "Poland": null } },
    { y: 1939, y1: 1939, m: ["Lituânia", "x:lt", ["Lithuania", "Vilnius region"]] }, // out/1939
    { y: 1939, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Eastern Poland"]] },
    { y: 1944, r: { "Poland": "Polônia (ocupada pela Alemanha)", "Eastern Poland 1944": "Polônia (Governo Provisório)" }, f: { "Poland": "h:de_nazi", "Eastern Poland 1944": "x:pl" } },
    { y: 1941, y1: 1943, r: { "Eastern Poland": "Leste da Polônia de 1939 (ocupado pela Alemanha)" }, f: { "Eastern Poland": "h:de_nazi" }, o: { "Eastern Poland": null } },
    { y: 1940, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Estonia", "Latvia", "Lithuania", "Vilnius region", "Bessarabia", "Finnish Karelia"]] },
    { y: 1941, y1: 1943, r: { "Estonia": "Estônia (ocupada pela Alemanha)", "Latvia": "Letônia (ocupada pela Alemanha)", "Lithuania": "Lituânia (ocupada pela Alemanha)",
      "Belarusian SSR": "Bielorrússia soviética (ocupada pela Alemanha)" },
      f: { "Estonia": "h:de_nazi", "Latvia": "h:de_nazi", "Lithuania": "h:de_nazi", "Belarusian SSR": "h:de_nazi" },
      o: { "Estonia": null, "Latvia": null, "Lithuania": null, "Belarusian SSR": null } },
    { y: 1941, y1: 1943, m: ["Lituânia (ocupada pela Alemanha)", "h:de_nazi", ["Lithuania", "Vilnius region"]] },
    { y: 1941, y1: 1942, m: ["Ucrânia soviética (ocupada pela Alemanha)", "h:de_nazi", ["Ukrainian SSR", "Ukrainian SSR east", "Crimea"]] },
    { y: 1943, y1: 1943, m: ["Ucrânia soviética (ocupada pela Alemanha)", "h:de_nazi", ["Ukrainian SSR", "Crimea"]] }, // margem esquerda do Dnieper e Kiev retomadas em 1943
    { y: 1941, y1: 1943, o: { "Ukrainian SSR": null } },
    { y: 1938, y1: 1940, m: ["União Soviética", "h:su", ["USSR", "Belarusian SSR", "Ukrainian SSR", "Ukrainian SSR east", "Crimea"]] },
    { y: 1941, y1: 1942, m: ["União Soviética", "h:su", ["USSR"]] },
    { y: 1943, y1: 1943, m: ["União Soviética", "h:su", ["USSR", "Ukrainian SSR east"]] },
    { y: 1944, m: ["União Soviética", "h:su", ["USSR", "Estonia", "Latvia", "Lithuania", "Vilnius region", "Eastern Poland", "Belarusian SSR", "Ukrainian SSR", "Ukrainian SSR east", "Crimea", "Bessarabia", "Finnish Karelia"]] },
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
    { y: 1943, y1: 1943, m: ["República Social Italiana (Estado fantoche da Alemanha)", "blank", ["Italy", "Central Italy"]] }, // 23/set/1943; bandeira não descrita
    { y: 1944, r: { "Italy": "República Social Italiana (Estado fantoche da Alemanha)" }, f: { "Italy": "blank" } },
    { y: 1943, r: { "Southern Italy": "Reino da Itália" }, f: { "Southern Italy": "h:it_sav" } },
    { y: 1944, m: ["Reino da Itália", "h:it_sav", ["Southern Italy", "Central Italy"]] }, // Roma 4/jun/1944
    { y: 1938, y1: 1942, r: { "Dodecanese": "Dodecaneso (Itália)" }, f: { "Dodecanese": "h:it_sav" } },
    { y: 1943, r: { "Dodecanese": "Dodecaneso (ocupação alemã)" }, f: { "Dodecanese": "h:de_nazi" }, o: { "Dodecanese": null } },
    { y: 1943, r: { "Albania": "Albânia (ocupada pela Alemanha)" }, f: { "Albania": "h:de_nazi" }, o: { "Albania": null } },
    { y: 1944, r: { "Albania": "Albânia" }, f: { "Albania": "x:al" } }, // libertada em nov/1944; desenho da bandeira de 1944 não descrito (pendente)
    { y: 1938, y1: 1940, m: ["Iugoslávia", "h:yu_fr", ["Yugoslavia", "Croatia", "Slovenia", "Montenegro", "Vardar Macedonia", "Kosovo"]] },
    { y: 1938, y1: 1940, m: ["Grécia", "h:gr_cross", ["Greece", "Western Thrace"]] },
    { y: 1941, y1: 1943, r: { "Yugoslavia": "Sérvia (ocupação alemã)", "Montenegro": "Montenegro (ocupação italiana)", "Vardar Macedonia": "Macedônia (ocupação búlgara)", "Greece": "Grécia (ocupada pelo Eixo)", "Western Thrace": "Trácia Ocidental (ocupação búlgara)" },
      f: { "Yugoslavia": "h:de_nazi", "Montenegro": "h:it_sav", "Vardar Macedonia": "x:bg", "Greece": "blank", "Western Thrace": "x:bg" },
      o: { "Yugoslavia": null, "Montenegro": null, "Vardar Macedonia": null, "Greece": null, "Western Thrace": null } }, // abr/1941
    { y: 1941, r: { "Croatia": "Estado Independente da Croácia (fantoche do Eixo)", "Slovenia": "Eslovênia (dividida entre Alemanha e Itália)" },
      f: { "Croatia": "blank", "Slovenia": "blank" }, o: { "Croatia": null, "Slovenia": null } }, // 10/abr/1941; bandeira da Croácia não descrita
    { y: 1941, y1: 1942, m: ["Albânia (ocupada pela Itália)", "h:it_sav", ["Albania", "Kosovo"]] },
    { y: 1943, y1: 1943, m: ["Albânia (ocupada pela Alemanha)", "h:de_nazi", ["Albania", "Kosovo"]] },
    { y: 1943, r: { "Montenegro": "Montenegro (ocupação alemã)", "Slovenia": "Eslovênia (ocupada pela Alemanha)" }, f: { "Montenegro": "h:de_nazi", "Slovenia": "h:de_nazi" } }, // set/1943
    { y: 1944, m: ["Iugoslávia (governo dos partisans)", "h:yu_sfr", ["Yugoslavia", "Montenegro", "Vardar Macedonia", "Kosovo"]] }, // Belgrado 20/out/1944
    { y: 1944, m: ["Grécia", "h:gr_cross", ["Greece", "Western Thrace"]] }, // out/1944
    { y: 1939, r: { "Albania": "Albânia (ocupada pela Itália)" }, f: { "Albania": "h:it_sav" }, o: { "Albania": null } },
  ],
  1945: [
    { y: 1945, f: { "Israel": "x:gb" }, r: { "Burma": "Birmânia (britânica)" } },
    { y: 1945, f: { "Burma": "x:gb" } },
    { y: 1945, m: ["Índia Britânica", "x:gb", ["India", "Pakistan", "Bangladesh"]] },
    // revisão 1945 (situação em 31/dez/1945)
    { y: 1945, r: { "Egypt": "Reino do Egito", "Ethiopia": "Império da Etiópia", "Manchuria": "Manchúria (ocupação soviética)", "Somalia": "Somália (adm. britânica)",
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
    for (const f of frag.features) { const a = geoArea(f); landSr[f.properties.u] += Math.min(a, 4 * Math.PI - a); }
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
          name[r0] = e.m[0]; flag[r0] = e.m[1];
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
        return [name[r], flag[r], ll[0], ll[1], +sr.toPrecision(4), !name[r] ? null : own[r] !== undefined ? own[r] : ownerFor(sn.units[r].key, name[r], flag[r], y)];
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
