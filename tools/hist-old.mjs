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
  [1800, 1800, 1814], [1815, 1815, 1879], [1880, 1880, 1894], [1900, 1895, 1912], [1914, 1913, 1919],
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
  1880: [
    { y: 1880, r: { "Kingdom of Brazil": "Império do Brasil" } },
    { y: 1889, r: { "Kingdom of Brazil": "Brasil" } },
    { y: 1894, r: { "Kingdom of Hawaii": "República do Havaí" } },
    { y: 1898, r: { "Kingdom of Hawaii": "Havaí (EUA)" }, f: { "Kingdom of Hawaii": "x:us" } },
    { y: 1899, r: { "Philippines": "Filipinas (EUA)" } },
  ],
  1900: [
    // revisão 1895–1912 (situação em 31/dez); 1895–1899 usam o mapa de 1900 com os eventos abaixo; 1913 usa o mapa de 1914. Unidades novas vêm de hist-overrides.json.
    // Américas e Pacífico
    { y: 1895, r: { "Kingdom of Brazil": "Brasil", "Kingdom of Hawaii": "Havaí (EUA)", "Puerto Rico": "Porto Rico (EUA)", "Guam": "Guam", "American Samoa": "Samoa Americana",
      "Philippines": "Filipinas (EUA)", "United States Virgin Islands": "Índias Ocidentais Dinamarquesas", "Samoa": "Samoa Alemã", "Micronesia": "Micronésia Alemã",
      "Papua New Guinea": "Nova Guiné Alemã", "Tonga": "Tonga (protetorado britânico)", "Wallis and Futuna Islands": "Wallis e Futuna", "Rapa Nui": "Rapa Nui (Chile)",
      "Guadeloupe": "Guadalupe", "Netherlands Antilles": "Curaçao e dependências", "Canada": "Canadá", "United States of America": "Estados Unidos" },
      f: { "Kingdom of Brazil": "h:br21", "United States Virgin Islands": "x:dk", "Samoa": "h:de_emp", "Micronesia": "h:de_emp", "Papua New Guinea": "h:de_emp", "Tonga": "x:to",
      "Wallis and Futuna Islands": "x:fr", "Rapa Nui": "x:cl", "Guadeloupe": "x:fr", "Martinique": "x:fr", "Netherlands Antilles": "x:nl", "Dominica": "x:gb",
      "Antigua and Barbuda": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb",
      "Saint Martin": "x:fr", "Saint Barthelemy": "x:fr" },
      o: { "Kingdom of Brazil": null, "Kingdom of Hawaii": "Estados Unidos", "Puerto Rico": "Estados Unidos", "Guam": "Estados Unidos", "American Samoa": "Estados Unidos",
      "United States Virgin Islands": "Dinamarca", "Samoa": "Império Alemão", "Micronesia": "Império Alemão", "Papua New Guinea": "Império Alemão" } },
    { y: 1895, y1: 1907, f: { "Kingdom of Hawaii": "h:us45", "Puerto Rico": "h:us45", "Guam": "h:us45", "American Samoa": "h:us45", "Philippines": "h:us45" } }, // 45 estrelas até 4/jul/1908
    { y: 1908, y1: 1911, f: { "Kingdom of Hawaii": "h:us46", "Puerto Rico": "h:us46", "Guam": "h:us46", "American Samoa": "h:us46", "Philippines": "h:us46" } },
    { y: 1912, f: { "Kingdom of Hawaii": "h:us48", "Puerto Rico": "h:us48", "Guam": "h:us48", "American Samoa": "h:us48", "Philippines": "h:us48" } },
    { y: 1895, r: { "Cuba": "Cuba", "British West Indies": "Índias Ocidentais Britânicas", "Martinique": "Martinica" }, f: { "Cuba": "x:cu", "British West Indies": "x:gb", "Martinique": "x:fr" },
      o: { "Cuba": null, "British West Indies": "Reino Unido", "Martinique": "França" } },
    { y: 1895, y1: 1901, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us45" }, o: { "Cuba": null } }, // até 20/mai/1902
    { y: 1906, y1: 1907, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us45" }, o: { "Cuba": null } }, // set/1906 a jan/1909
    { y: 1908, y1: 1908, r: { "Cuba": "Cuba (ocupação americana)" }, f: { "Cuba": "h:us46" }, o: { "Cuba": null } },
    { y: 1895, y1: 1902, m: ["Colômbia", "x:co", ["Colombia", "Panama"]] },
    { y: 1903, r: { "Panama": "Panamá" }, f: { "Panama": "x:pa" }, o: { "Panama": null } }, // 3/nov/1903
    { y: 1895, y1: 1906, r: { "Newfoundland": "Terra Nova" }, f: { "Newfoundland": "x:gb" }, o: { "Newfoundland": "Reino Unido" } },
    { y: 1907, r: { "Newfoundland": "Domínio da Terra Nova" }, f: { "Newfoundland": "x:gb" }, o: { "Newfoundland": null } }, // 26/set/1907
    { y: 1895, y1: 1900, f: { "Niue": "x:gb" }, o: { "Niue": "Reino Unido" } },
    { y: 1901, f: { "Niue": "x:nz" }, o: { "Niue": "Nova Zelândia" } }, // anexada pela Nova Zelândia em 1901
    // Austrália, Nova Zelândia e Papua
    { y: 1895, y1: 1900, m: ["Austrália Meridional (britânica)", "x:gb", ["South Australia (UK)", "Northern Territory (UK)"]] },
    { y: 1895, y1: 1900, r: { "_null_150": "Tasmânia (britânica)" }, f: { "_null_150": "x:gb" }, o: { "_null_150": "Reino Unido" } },
    { y: 1901, m: ["Austrália", "x:au", ["Western Australia (UK)", "Queensland (UK)", "Northern Territory (UK)", "South Australia (UK)", "New South Wales (UK)", "Victoria (UK)", "_null_150"]], o: { "Western Australia (UK)": null } }, // federação em 1/jan/1901
    { y: 1895, y1: 1901, r: { "New Zealand": "Nova Zelândia" }, f: { "New Zealand": "x:gb" }, o: { "New Zealand": "Reino Unido" } },
    { y: 1902, y1: 1906, r: { "New Zealand": "Nova Zelândia" }, f: { "New Zealand": "x:nz" }, o: { "New Zealand": "Reino Unido" } }, // bandeira de 1902
    { y: 1907, r: { "New Zealand": "Domínio da Nova Zelândia" }, f: { "New Zealand": "x:nz" }, o: { "New Zealand": null } }, // 26/set/1907
    { y: 1895, y1: 1905, r: { "Papua": "Nova Guiné Britânica" }, f: { "Papua": "x:gb" }, o: { "Papua": "Reino Unido" } },
    { y: 1906, r: { "Papua": "Território de Papua (Austrália)" }, f: { "Papua": "x:au" }, o: { "Papua": "Austrália" } }, // 1/set/1906
    // Ásia
    { y: 1895, m: ["Império do Japão", "x:jp", ["Imperial Japan", "_null_185", "_null_186", "_null_187", "_null_188", "_null_189", "_null_190", "_null_191", "_null_192", "_null_193", "_null_194", "_null_195", "_null_196", "_null_197", "_null_198", "_null_199", "_null_200", "_null_201"]] },
    { y: 1895, r: { "Taiwan": "Taiwan (Japão)", "Bhutan": "Butão", "Goa": "Goa (Índia Portuguesa)", "French India": "Índia Francesa", "Portuguese Timor": "Timor Português",
      "Macau": "Macau", "Maldives": "Maldivas (protetorado britânico)", "Rattanakosin Kingdom": "Sião" },
      f: { "Taiwan": "x:jp", "Bhutan": "blank", "Afghanistan": "h:af_black", "French India": "x:fr", "Maldives": "x:gb" }, o: { "Taiwan": "Japão" } },
    { y: 1895, m: ["Índia Britânica", "x:gb", ["British Raj", "India"]] },
    { y: 1895, y1: 1905, f: { "Brunei": "h:bn_y" } }, // amarela lisa até 1906
    { y: 1906, f: { "Brunei": "h:bn06" } },
    { y: 1895, y1: 1904, r: { "Korea": "Império Coreano" }, f: { "Korea": "x:kr" }, o: { "Korea": null } },
    { y: 1905, y1: 1909, r: { "Korea": "Império Coreano (protetorado japonês)" }, f: { "Korea": "x:kr" }, o: { "Korea": null } }, // nov/1905
    { y: 1910, r: { "Korea": "Coreia (Japão)" }, f: { "Korea": "x:jp" }, o: { "Korea": "Japão" } }, // 29/ago/1910
    { y: 1895, y1: 1910, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Mongolia", "Tibet", "Tuva"]] },
    { y: 1911, y1: 1911, m: ["Império Qing", "h:cn_qing", ["Manchu Empire", "Tibet", "Tuva"]] },
    { y: 1911, r: { "Mongolia": "Mongólia (Canato de Bogd)" }, f: { "Mongolia": "h:mn_bogd" }, o: { "Mongolia": null } }, // dez/1911
    { y: 1912, r: { "Manchu Empire": "República da China", "Tibet": "Tibete", "Tuva": null }, f: { "Manchu Empire": "h:cn_5", "Tibet": "blank" }, o: { "Manchu Empire": null, "Tibet": null } },
    { y: 1895, m: ["Império Russo", "x:ru", ["Russian Empire", "central Asian khanates"]] },
    // Oriente Médio
    { y: 1895, y1: 1910, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Libya", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159", "Asir"]] },
    { y: 1911, y1: 1911, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Albania", "Kosovo and Macedonia", "Ottoman Sandzak", "Ottoman Macedonia", "Epirus", "Western Thrace", "East Thrace", "Aegean Islands", "_null_159"]] },
    { y: 1912, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Lebanon", "Hejaz", "Hasa", "North Yemen", "Epirus"]] }, // Janina cercada até mar/1913
    { y: 1911, r: { "Asir": "Emirado Idríssida de Asir" }, f: { "Asir": "h:asir09" }, o: { "Asir": null } },
    { y: 1895, y1: 1901, m: ["Emirado de Jabal Shammar", "blank", ["Hail", "Riyadh", "Qassim"]] },
    { y: 1902, y1: 1903, m: ["Emirado de Jabal Shammar", "blank", ["Hail", "Qassim"]] }, // Riad tomada por Ibn Saud em jan/1902
    { y: 1902, y1: 1903, r: { "Riyadh": "Emirado de Riad" }, f: { "Riyadh": "x:sa" } },
    { y: 1904, r: { "Hail": "Emirado de Jabal Shammar" }, f: { "Hail": "blank" } },
    { y: 1904, m: ["Emirado de Riad", "x:sa", ["Riyadh", "Qassim"]] }, // Qassim em 1904–1906
    { y: 1895, r: { "Arabia": null, "Kuwait": "Kuwait", "Bahrain": "Bahrein (protetorado britânico)", "Qatar": "Catar", "Trucial Oman": "Estados da Trégua (protetorado britânico)",
      "Oman": "Mascate e Omã", "Aden": "Áden e protetorados (britânicos)", "Cyprus": "Chipre (administração britânica)", "Malta": "Malta", "Gibraltar": "Gibraltar" },
      f: { "Kuwait": "x:tr", "Bahrain": "x:gb", "Qatar": "blank", "Trucial Oman": "h:trucial", "Oman": "h:om_red", "Aden": "x:gb", "Cyprus": "x:gb", "Malta": "x:gb", "Gibraltar": "x:gb" },
      o: { "Kuwait": null, "Qatar": null, "Trucial Oman": null, "Oman": null, "Cyprus": null } },
    // Europa
    { y: 1895, r: { "Germany": "Império Alemão", "Italy": "Reino da Itália", "Austria Hungary": "Áustria-Hungria", "Faroe Islands": "Ilhas Faroé", "Channel Islands": "Ilhas do Canal",
      "Finland": "Grão-Ducado da Finlândia" },
      f: { "Faroe Islands": "x:dk", "Channel Islands": "x:gb", "Finland": "x:ru" }, o: { "Finland": "Império Russo" } },
    { y: 1895, m: ["Reino Unido", "x:gb", ["United Kingdom of Great Britain and Ireland", "_null_164", "_null_165", "_null_166", "_null_167", "_null_168", "_null_169", "_null_170", "_null_171", "_null_172", "_null_173", "_null_174", "_null_175", "_null_176", "_null_177", "_null_178", "_null_179", "_null_180", "_null_181", "_null_182", "_null_184"]] },
    { y: 1895, m: ["Suécia", "x:se", ["Sweden–Norway", "_null_149"]] },
    { y: 1895, y1: 1904, r: { "Sweden–Norway": "Suécia (em união com a Noruega)", "Norway": "Noruega (em união com a Suécia)" }, f: { "Sweden–Norway": "h:se_union", "Norway": "x:no" }, o: { "Norway": null } }, // Noruega tirou a marca da união da bandeira em 1899; a Suécia manteve até 1905
    { y: 1905, r: { "Sweden–Norway": "Suécia", "Norway": "Noruega" }, f: { "Sweden–Norway": "x:se", "Norway": "x:no" }, o: { "Norway": null } }, // jun–out/1905
    { y: 1895, y1: 1909, r: { "Portugal": "Reino de Portugal" } },
    { y: 1895, y1: 1909, f: { "Portuguese East Africa": "h:pt_mon", "Portuguese Guinea": "h:pt_mon", "Cape Verde": "h:pt_mon", "Sao Tome": "h:pt_mon", "Goa": "h:pt_mon", "Macau": "h:pt_mon", "Portuguese Timor": "h:pt_mon", "Angola": "h:pt_mon" } },
    { y: 1910, f: { "Portuguese East Africa": "x:pt", "Portuguese Guinea": "x:pt", "Cape Verde": "x:pt", "Sao Tome": "x:pt", "Goa": "x:pt", "Macau": "x:pt", "Portuguese Timor": "x:pt", "Angola": "x:pt" } }, // república em 5/out/1910
    { y: 1895, y1: 1907, r: { "Bosnia-Herzegovina": "Bósnia e Herzegovina (ocupação austro-húngara)" }, f: { "Bosnia-Herzegovina": "h:at_hab" }, o: { "Bosnia-Herzegovina": null } },
    { y: 1908, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "Bosnia-Herzegovina", "_null_154"]] }, // anexada em out/1908
    { y: 1895, y1: 1907, m: ["Áustria-Hungria", "h:at_hab", ["Austria Hungary", "_null_154"]] },
    { y: 1895, y1: 1907, r: { "Bulgaria": "Principado da Bulgária" }, f: { "Bulgaria": "x:bg" } },
    { y: 1908, r: { "Bulgaria": "Bulgária" }, f: { "Bulgaria": "x:bg" } }, // independência em 5/out/1908
    { y: 1895, y1: 1909, r: { "Montenegro": "Principado de Montenegro" } },
    { y: 1910, r: { "Montenegro": "Reino de Montenegro" } }, // 28/ago/1910
    { y: 1895, y1: 1911, r: { "Crete": "Estado de Creta" }, f: { "Crete": "h:cretan" }, o: { "Crete": null } },
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
    { y: 1895, r: { "Egypt": "Quedivato do Egito", "Darfur": "Sultanato de Darfur", "Anglo-Egyptian Sudan": "Sudão Anglo-Egípcio", "Algeria": "Argélia", "Tunisia": "Tunísia",
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
    { y: 1895, y1: 1911, r: { "Morocco": "Marrocos" }, f: { "Morocco": "h:ma_red" }, o: { "Morocco": null } },
    { y: 1912, r: { "Morocco": "Marrocos (protetorado francês)" }, f: { "Morocco": "x:fr" }, o: { "Morocco": "França" } }, // 30/mar/1912
    { y: 1895, y1: 1902, r: { "Mauritania": null } }, // emirados mouros (pendente)
    { y: 1903, m: ["África Ocidental Francesa", "x:fr", ["French West Africa", "Mauritania"]] }, // protetorado em 1903
    { y: 1895, y1: 1909, r: { "French Congo": "Congo Francês" }, f: { "French Congo": "x:fr" }, o: { "French Congo": "França" } },
    { y: 1910, r: { "French Congo": "África Equatorial Francesa" }, f: { "French Congo": "x:fr" }, o: { "French Congo": "França" } }, // jan/1910
    { y: 1895, y1: 1907, r: { "Congo Free State": "Estado Livre do Congo" }, f: { "Congo Free State": "h:cfs" }, o: { "Congo Free State": null } },
    { y: 1908, r: { "Congo Free State": "Congo Belga" }, f: { "Congo Free State": "x:be" }, o: { "Congo Free State": "Bélgica" } }, // 15/nov/1908
    { y: 1895, y1: 1901, r: { "Transvaal": "Transvaal (Guerra dos Bôeres)", "Orange Free State": "Estado Livre de Orange (Guerra dos Bôeres)" },
      f: { "Transvaal": "blank", "Orange Free State": "blank" }, o: { "Transvaal": null, "Orange Free State": null } }, // anexados em 1900; guerra até 31/mai/1902
    { y: 1902, y1: 1909, r: { "Transvaal": "Colônia do Transvaal", "Orange Free State": "Colônia do Rio Orange" }, f: { "Transvaal": "x:gb", "Orange Free State": "x:gb" },
      o: { "Transvaal": "Reino Unido", "Orange Free State": "Reino Unido" } },
    { y: 1910, m: ["União Sul-Africana", "h:za_red", ["Cape Colony", "Natal", "Transvaal", "Orange Free State"]], o: { "Cape Colony": null } }, // 31/mai/1910
    { y: 1895, y1: 1902, r: { "Swaziland": "Suazilândia" }, f: { "Swaziland": "blank" }, o: { "Swaziland": null } },
    { y: 1903, r: { "Swaziland": "Suazilândia (protetorado britânico)" }, f: { "Swaziland": "x:gb" }, o: { "Swaziland": null } },
    { y: 1895, y1: 1906, r: { "British Central Africa": "África Central Britânica" }, f: { "British Central Africa": "x:gb" }, o: { "British Central Africa": "Reino Unido" } },
    { y: 1907, r: { "British Central Africa": "Niassalândia" }, f: { "British Central Africa": "x:gb" }, o: { "British Central Africa": "Reino Unido" } },
    // revisão 1895–1899 (situação em 31/dez; fontes: Wikipedia)
    { y: 1895, y1: 1897, r: { "Kingdom of Hawaii": "República do Havaí" }, f: { "Kingdom of Hawaii": "h:hawaii" }, o: { "Kingdom of Hawaii": null } }, // 4/jul/1894 a 12/ago/1898; manteve a bandeira do reino
    { y: 1895, y1: 1897, r: { "Guam": "Guam (Espanha)", "Puerto Rico": "Porto Rico (Espanha)", "Cuba": "Cuba (Espanha)", "Philippines": "Filipinas (Espanha)" },
      f: { "Guam": "x:es", "Puerto Rico": "x:es", "Cuba": "x:es", "Philippines": "x:es" }, o: { "Guam": "Espanha", "Puerto Rico": "Espanha", "Cuba": "Espanha", "Philippines": "Espanha" } },
    { y: 1898, y1: 1898, r: { "Puerto Rico": "Porto Rico (ocupação americana)", "Cuba": "Cuba (Guerra Hispano-Americana)", "Philippines": "Filipinas (Revolução Filipina)" },
      f: { "Puerto Rico": "h:us45", "Cuba": "blank", "Philippines": "blank" }, o: { "Puerto Rico": null, "Cuba": null, "Philippines": null } }, // Tratado de Paris assinado em 10/dez/1898, em vigor em 11/abr/1899
    { y: 1898, y1: 1898, r: { "Guam": "Guam (ocupação americana)" }, o: { "Guam": null } }, // rendeu-se em 20/jun/1898
    { y: 1895, y1: 1898, r: { "Micronesia": "Carolinas e Marianas (Espanha)" }, f: { "Micronesia": "x:es" }, o: { "Micronesia": "Espanha" } }, // vendidas à Alemanha pelo tratado de 12/fev/1899
    { y: 1895, y1: 1899, m: ["Samoa", "blank", ["Samoa", "American Samoa"]], o: { "Samoa": null } }, // partilha só em 1900
    { y: 1895, y1: 1899, r: { "Niue": "Niue", "Tonga": "Reino de Tonga" }, f: { "Niue": "blank", "Tonga": "x:to" }, o: { "Niue": null, "Tonga": null } }, // protetorados britânicos em 1900
    { y: 1895, y1: 1896, r: { "Korea": "Reino de Joseon" }, f: { "Korea": "x:kr" }, o: { "Korea": null } }, // Império Coreano em 13/out/1897; taegukgi oficial desde 1883
    { y: 1895, y1: 1897, f: { "Norway": "h:no_union", "Sweden–Norway": "h:se_union" } },
    { y: 1898, y1: 1898, f: { "Norway": "h:no_union" } }, // lei de 10/dez/1898; a bandeira "pura" foi hasteada a partir de 1899
    { y: 1895, y1: 1896, m: ["Império Otomano", "x:tr", ["Ottoman Empire", "Crete"]] },
    { y: 1897, y1: 1897, r: { "Crete": "Creta (ocupação das Grandes Potências)" }, f: { "Crete": "blank" }, o: { "Crete": null } }, // revolta e ocupação em mar–abr/1897; Estado de Creta proclamado em 9/dez/1898
    { y: 1895, y1: 1897, m: ["Estado Mahdista", "blank", ["Anglo-Egyptian Sudan", "Darfur"]], o: { "Anglo-Egyptian Sudan": null } },
    { y: 1898, y1: 1898, r: { "Anglo-Egyptian Sudan": "Sudão (ocupação anglo-egípcia)" }, f: { "Anglo-Egyptian Sudan": "x:gb" }, o: { "Anglo-Egyptian Sudan": null } }, // Omdurman 2/set/1898; convenção de 18/jan/1899
    { y: 1895, y1: 1896, f: { "Ethiopia": "blank" } }, // primeira bandeira oficial em 11/out/1897
    { y: 1895, y1: 1895, r: { "Madagascar": "Reino Merina (invasão francesa)" }, f: { "Madagascar": "blank" }, o: { "Madagascar": null } },
    { y: 1896, y1: 1896, r: { "Madagascar": "Madagascar (protetorado francês)" } }, // anexada em 1897
    { y: 1895, y1: 1899, r: { "Nigeria": "Costa do Níger, Lagos e Cia. Real do Níger (britânicos)" } }, // protetorados da Nigéria em 1/jan/1900
    { y: 1895, y1: 1899, r: { "Transvaal": "Transvaal (República Sul-Africana)", "Orange Free State": "Estado Livre de Orange" },
      f: { "Transvaal": "h:transvaal", "Orange Free State": "h:ofs" }, o: { "Transvaal": null, "Orange Free State": null } }, // Guerra dos Bôeres desde 11/out/1899; anexados em 1900
    { y: 1895, y1: 1898, r: { "Swaziland": "Suazilândia (protetorado do Transvaal)" }, f: { "Swaziland": "blank" }, o: { "Swaziland": "Transvaal (República Sul-Africana)" } }, // convenção de 1894 até out/1899
  ],
  1914: [
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
        const nm = sr > 0 ? name[r] : null; // a unit left with no land (all of it given to other units) is hidden
        return [nm, flag[r], ll[0], ll[1], +sr.toPrecision(4), !nm ? null : own[r] !== undefined ? own[r] : ownerFor(sn.units[r].key, nm, flag[r], y)];
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
