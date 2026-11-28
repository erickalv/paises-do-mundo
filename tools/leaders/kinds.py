"""Tipo de território e cargo do governante no modo História (situação em 31/dez).

Fontes:
- REIGN (OEF Research), 1950–ago/2021: tipo de regime ("government") do mês de dezembro;
  2021–2026 seguem o último regime do REIGN com as mudanças conferidas no Wikipedia (REGIME_FIX).
- Antes de 1950: forma do Estado pelo nome da unidade (reino, sultanato, canato...) e tabelas
  conferidas no Wikipedia para os regimes mais conhecidos (FORM, REGIME_OLD).
- Cargo: forma do Estado + regime + quem é o líder de fato (Archigos/REIGN), com exceções por pessoa.
"""
import csv, re

# ---------- forma do Estado pelo nome ----------
KEYS = [  # (regex no nome, tipo) — a primeira que casar vale
    (r"\b(fantoche|estado cliente)\b", "Estado fantoche"),
    (r"guerra civil", "País em guerra civil"),
    (r"\bocupa(ção|da|do)\b|\banexad|\blibertad", "Território ocupado"),
    (r"\bprotetorado\b", "Protetorado"),
    (r"\bmandato\b", "Território sob mandato"),
    (r"liga das nações", "Território da Liga das Nações"),
    (r"fiduciári|\btutela\b", "Território sob tutela"),
    (r"\bdisputad|\bem disputa\b", "Território disputado"),
    (r"\bcondomínio\b", "Condomínio"),
    (r"^vice-reino\b", "Vice-reino (colônia)"),
    (r"^capitania-geral\b|^capitanias\b", "Capitania-geral (colônia)"),
    (r"^governaç(ão|ões)\b|^governo-geral\b|^governadoria\b", "Governação (colônia)"),
    (r"^províncias? d", "Província colonial"),
    (r"\beialete\b|\bpaxalique\b|\bsanjaco\b", "Eialete (província otomana)"),
    (r"^beilhique\b", "Beilhique (vassalo otomano)"),
    (r"^regência de (argel|túnis|trípoli)", "Regência (província autônoma otomana)"),
    (r"^quedivato\b", "Quedivato (vassalo otomano)"),
    (r"\bcompanhia\b|\bcia\.", "Território de companhia comercial"),
    (r"\b(fortes|feitorias?|entrepostos?|postos?) ", "Fortes e feitorias europeus"),
    (r"^estados papais\b", "Estado papal (teocracia)"),
    (r"^(estado da )?ordem\b|cavaleiros", "Estado de ordem militar religiosa"),
    (r"príncipe-(arce)?bispado|principado-(arce)?bispado|arcebispado|bispado", "Principado eclesiástico"),
    (r"^cidades? livres?", "Cidade livre imperial"),
    (r"^czarado\b", "Czarado (monarquia)"),
    (r"^império\b|^dinastia\b", "Império"),
    (r"^reinos?\b", "Reino"),
    (r"^grão-ducado\b", "Grão-ducado"),
    (r"^grão-principado\b", "Grão-principado"),
    (r"^ducados?\b", "Ducado"),
    (r"^eleitorado\b", "Eleitorado (Sacro Império)"),
    (r"^landgraviatos?\b", "Landgraviato"),
    (r"^margraviato\b", "Margraviato"),
    (r"^condados?\b", "Condado"),
    (r"^principados?\b", "Principado"),
    (r"^senhorio\b", "Senhorio"),
    (r"^sultanatos?\b", "Sultanato"),
    (r"^canatos?\b|\bhorda\b", "Canato"),
    (r"^emirados?\b|^amirados?\b", "Emirado"),
    (r"^xeicados?\b", "Xeicados"),
    (r"^xerifado\b", "Xerifado"),
    (r"^califado\b", "Califado"),
    (r"^imamato\b", "Imamato"),
    (r"^nababado\b|\bnababos\b", "Nababado"),
    (r"^xogunato\b", "Xogunato"),
    (r"^confederação\b", "Confederação"),
    (r"^federação\b|^estados federados\b", "Federação"),
    (r"^commonwealth da (inglaterra|libéria)", "República"),
    (r"^repúblicas?\b", "República"),
    (r"^estado livre\b", "República"),
    (r"^domínio\b", "Domínio britânico"),
    (r"\bsoviétic[oa]\b", "República soviética"),
    (r"\b(povos|tribos|chefias|cacicados|caribes|taínos|inuítes|maoris|misquitos|micmacs|beotucos|caquetíos|buriates|"
     r"bashkires|tchuktchis|aborígines|mapuches|muíscas|guaranis|tupis|estados maias|clãs)\b", "Povos indígenas e chefias locais"),
    (r"\breinos (locais|e sultanatos|e chefias)|\bsultanatos (locais|malaios)|\bestados (akan|shan|karenni)", "Reinos e chefias locais"),
    (r"\bdividid[oa]\b", "Território dividido"),
    (r"\b(revolta|rebelião|revolução|insurreição|secessão|em rebelião|independência não reconhecida|independência efêmera|juntas autônomas)\b", "Território em revolta"),
    (r"\bneutra\b|\bsem governo\b|\bindivisa\b", "Território sem soberano definido"),
    (r"\breinos (do|de|locais)|\boutros reinos\b|\be outros\)|\bsultanatos locais\b", "Reinos e chefias locais"),
]
KEYS = [(re.compile(p, re.I), t) for p, t in KEYS]

# formas de países com nome simples (base sem o parêntese), [ano0, ano1, forma]
FORM = {
    "Abissínia": [(0, 9999, "Império")], "Etiópia": [(0, 1974, "Império"), (1975, 9999, "República")],
    "Afeganistão": [(0, 1825, "Império (Durrani)"), (1826, 1925, "Emirado"), (1926, 1972, "Reino"), (1973, 9999, "República")],
    "Albânia": [(0, 1924, "Principado"), (1925, 1927, "República"), (1928, 1938, "Reino"), (1939, 1943, "República"), (1944, 1945, "Governo provisório"), (1946, 9999, "República")],
    "Alemanha": [(0, 9999, "República")], "Alemanha Ocidental": [(0, 9999, "República federal")], "Alemanha Oriental": [(0, 9999, "República")],
    "Andorra": [(0, 9999, "Coprincipado")], "Bahrein": [(0, 2001, "Emirado"), (2002, 9999, "Reino")], "Brunei": [(0, 9999, "Sultanato")],
    "Butão": [(0, 1906, "Teocracia budista (Zhabdrung)"), (1907, 9999, "Reino")], "Bulgária": [(1908, 1945, "Reino (czarado búlgaro)"), (1946, 9999, "República")],
    "Catar": [(0, 9999, "Emirado")], "Kuwait": [(0, 9999, "Emirado")], "Omã": [(0, 9999, "Sultanato")], "Mascate e Omã": [(0, 9999, "Sultanato")],
    "Arábia Saudita": [(0, 9999, "Reino")], "Jordânia": [(0, 9999, "Reino")], "Transjordânia": [(0, 1945, "Emirado"), (1946, 9999, "Reino")], "Iêmen": [(0, 1961, "Reino (imamato)"), (1962, 9999, "República")],
    "Marrocos": [(0, 1956, "Sultanato"), (1957, 9999, "Reino")], "Espanha": [(0, 1872, "Reino"), (1873, 1873, "República"), (1874, 1930, "Reino"),
    (1931, 1938, "República"), (1939, 1974, "Estado espanhol"), (1975, 9999, "Reino")],
    "Dinamarca": [(0, 9999, "Reino")], "Dinamarca-Noruega": [(0, 9999, "Reino (união dinástica)")], "Suécia": [(0, 9999, "Reino")],
    "Noruega": [(0, 9999, "Reino")], "Países Baixos": [(0, 9999, "Reino")], "Bélgica": [(0, 9999, "Reino")], "Luxemburgo": [(0, 9999, "Grão-ducado")],
    "Liechtenstein": [(0, 9999, "Principado")], "Mônaco": [(0, 9999, "Principado")], "San Marino": [(0, 9999, "República")],
    "Reino Unido": [(0, 9999, "Reino")], "Japão": [(0, 9999, "Império")], "Tailândia": [(0, 9999, "Reino")], "Sião": [(0, 9999, "Reino")],
    "Nepal": [(0, 2007, "Reino"), (2008, 9999, "República")], "Tonga": [(0, 9999, "Reino")], "Essuatíni": [(0, 9999, "Reino")],
    "Suazilândia": [(0, 9999, "Reino")], "Lesoto": [(0, 9999, "Reino")], "Camboja": [(0, 1969, "Reino"), (1970, 1992, "República"), (1993, 9999, "Reino")],
    "Laos": [(0, 1974, "Reino"), (1975, 9999, "República")], "Malásia": [(0, 9999, "Monarquia federal eletiva")],
    "Federação Malaia": [(0, 9999, "Monarquia federal eletiva")], "Emirados Árabes Unidos": [(0, 9999, "Federação de emirados")],
    "Irã": [(0, 1978, "Reino (xá)"), (1979, 9999, "República Islâmica")], "Pérsia": [(0, 9999, "Império (xá)")],
    "Iraque": [(0, 1957, "Reino"), (1958, 9999, "República")], "Egito": [(0, 1952, "Reino"), (1953, 9999, "República")],
    "Líbia": [(0, 1968, "Reino"), (1969, 9999, "República")], "Iêmen do Norte": [(0, 1961, "Reino (imamato)"), (1962, 9999, "República")],
    "Grécia": [(0, 1923, "Reino"), (1924, 1934, "República"), (1935, 1972, "Reino"), (1973, 9999, "República")],
    "Itália": [(0, 1945, "Reino"), (1946, 9999, "República")], "Romênia": [(0, 1946, "Reino"), (1947, 9999, "República")],
    "Iugoslávia": [(0, 1944, "Reino"), (1945, 9999, "República federal")], "Hungria": [(1920, 1945, "Reino (sem rei, regência)"), (1946, 9999, "República")],
    "Montenegro": [(0, 1909, "Principado"), (1910, 1918, "Reino"), (2006, 9999, "República")], "Sérvia": [(0, 1881, "Principado"), (1882, 1918, "Reino"), (1919, 9999, "República")],
    "Portugal": [(0, 1909, "Reino"), (1910, 1925, "República"), (1926, 1932, "República (ditadura militar)"), (1933, 1973, "República (Estado Novo)"), (1974, 9999, "República")],
    "França": [(0, 1847, "Reino"), (1848, 1851, "República"), (1852, 1869, "Império"), (1870, 9999, "República")],
    "Rússia": [(0, 1720, "Czarado"), (1721, 1917, "Império"), (1918, 9999, "República federal")], "Brasil": [(0, 1888, "Império"), (1889, 9999, "República federal")],
    "México": [(0, 9999, "República federal")], "Estados Unidos": [(0, 9999, "República federal")], "Argentina": [(0, 9999, "República federal")],
    "Venezuela": [(0, 9999, "República federal")], "Índia": [(0, 9999, "República federal")], "Paquistão": [(0, 9999, "República federal")],
    "Austrália": [(0, 9999, "Monarquia federal da Commonwealth")], "Canadá": [(0, 9999, "Monarquia federal da Commonwealth")],
    "Nova Zelândia": [(0, 9999, "Monarquia da Commonwealth")], "Suíça": [(0, 9999, "Confederação (república federal)")],
    "Áustria": [(0, 9999, "República federal")], "Bósnia e Herzegovina": [(0, 9999, "República federal")], "Nigéria": [(0, 9999, "República federal")],
    "Etiópia (federal)": [(0, 9999, "República federal")], "Tibete": [(0, 9999, "Teocracia budista (dalai-lama)")], "China": [(0, 9999, "República")],
    "Mongólia": [(0, 9999, "República")], "Tunísia": [(0, 1956, "Beilhique (vassalo otomano)"), (1957, 9999, "República")],
    "Burundi": [(0, 1965, "Reino"), (1966, 9999, "República")], "Ruanda": [(0, 1960, "Reino"), (1961, 9999, "República")],
    "Samoa": [(0, 9999, "Monarquia parlamentar eletiva")], "Cidade do Vaticano": [(0, 9999, "Estado papal (teocracia)")],
}
# reinos da Commonwealth (chefe de Estado = monarca britânico), [ano0, ano1]
REALMS = {"África do Sul": (1910, 1960), "Jamaica": (1962, 9999), "Barbados": (1966, 2020), "Bahamas": (1973, 9999), "Belize": (1981, 9999), "Granada": (1974, 9999),
          "Santa Lúcia": (1979, 9999), "São Vicente e Granadinas": (1979, 9999), "Antígua e Barbuda": (1981, 9999),
          "São Cristóvão e Névis": (1983, 9999), "Papua-Nova Guiné": (1975, 9999), "Ilhas Salomão": (1978, 9999), "Tuvalu": (1978, 9999),
          "Ceilão": (1948, 1971), "Gana": (1957, 1959), "Nigéria": (1960, 1962), "Serra Leoa": (1961, 1970), "Tanganica": (1961, 1961),
          "Uganda": (1962, 1962), "Quênia": (1963, 1963), "Malawi": (1964, 1965), "Malta": (1964, 1973), "Gâmbia": (1965, 1969),
          "Guiana": (1966, 1969), "Maurício": (1968, 1991), "Fiji": (1970, 1986), "Trinidad e Tobago": (1962, 1975), "Paquistão": (1947, 1955),
          "Índia": (1947, 1949), "União Sul-Africana": (1910, 1960), "Rodésia": (1965, 1969)}
MONARCHY_MODERN = {"Reino Unido", "Japão", "Espanha", "Suécia", "Noruega", "Dinamarca", "Países Baixos", "Bélgica", "Luxemburgo", "Liechtenstein",
                   "Mônaco", "Andorra", "Tailândia", "Camboja", "Malásia", "Federação Malaia", "Brunei", "Butão", "Nepal", "Jordânia", "Arábia Saudita",
                   "Kuwait", "Catar", "Bahrein", "Emirados Árabes Unidos", "Omã", "Marrocos", "Essuatíni", "Suazilândia", "Lesoto", "Tonga",
                   "Irã", "Iraque", "Egito", "Líbia", "Afeganistão", "Etiópia", "Grécia", "Itália", "Romênia", "Bulgária", "Iugoslávia", "Laos",
                   "Iêmen do Norte", "Burundi", "Ruanda", "Tunísia", "Austrália", "Canadá", "Nova Zelândia", "Samoa"} | set(REALMS)

# regime REIGN -> texto
REIGN_REG = {"Presidential Democracy": "democracia presidencialista", "Parliamentary Democracy": "democracia parlamentarista",
             "Monarchy": "monarquia absoluta", "Military": "ditadura militar", "Military-Personal": "ditadura militar personalista",
             "Indirect Military": "governo civil sob tutela militar", "Personal Dictatorship": "regime personalista",
             "Party-Personal": "regime de partido dominante personalista", "Party-Personal-Military Hybrid": "regime de partido dominante com militares",
             "Party-Military": "regime de partido e militares", "Dominant Party": "regime de partido dominante",
             "Oligarchy": "oligarquia", "Provisional - Civilian": "governo provisório", "Provisional - Military": "governo provisório militar",
             "Warlordism": "fragmentado entre senhores da guerra", "Foreign/Occupied": "sob ocupação estrangeira"}
# Estados comunistas (partido único marxista-leninista), anos
COMMUNIST = {"União Soviética": (1922, 1991), "Rússia Soviética": (1917, 1922), "China": (1949, 9999), "Coreia do Norte": (1948, 9999),
             "Vietnã do Norte": (1945, 1976), "Vietnã": (1976, 9999), "Cuba": (1961, 9999), "Laos": (1975, 9999), "Mongólia": (1924, 1990),
             "República Popular da Mongólia": (1924, 1991), "Alemanha Oriental": (1949, 1990), "Polônia": (1947, 1989), "Tchecoslováquia": (1948, 1989),
             "Hungria": (1949, 1989), "Romênia": (1947, 1989), "Bulgária": (1946, 1990), "Albânia": (1946, 1991), "Iugoslávia": (1945, 1990),
             "Kampuchea Democrática": (1975, 1979), "Kampuchea": (1979, 1991), "Afeganistão": (1978, 1992), "Etiópia": (1987, 1990),
             "Angola": (1975, 1991), "Moçambique": (1975, 1990), "Benin": (1975, 1990), "República do Congo": (1970, 1991), "Iêmen do Sul": (1969, 1990),
             "Somália": (1976, 1991)}
PARTY_TITLE = {"China": [(1949, 1976, "Presidente do Partido Comunista"), (1977, 1980, "Presidente do Partido Comunista"),
                         (1981, 1989, "Líder supremo"), (1990, 9999, "Secretário-geral do Partido Comunista")],
               "Coreia do Norte": [(0, 9999, "Líder supremo")]}

# regimes antes de 1950 (ou fora do REIGN), conferidos no Wikipedia: nome -> [(ano0, ano1, regime)]
REGIME_OLD = {
    "Alemanha": [(1918, 1918, "governo revolucionário"), (1933, 1945, "ditadura nazista")],
    "Alemanha (República de Weimar)": [(1919, 1932, "democracia parlamentarista")],
    "Itália": [(1922, 1943, "ditadura fascista")], "Reino da Itália": [(1861, 1921, "monarquia constitucional"), (1922, 1943, "ditadura fascista")],
    "União Soviética": [(1922, 1991, "partido único comunista")], "Rússia Soviética": [(1917, 1922, "partido único comunista")],
    "Espanha": [(1923, 1929, "ditadura de Primo de Rivera"), (1939, 1975, "ditadura franquista")],
    "Portugal": [(1926, 1932, "ditadura militar"), (1933, 1974, "ditadura do Estado Novo")],
    "Brasil": [(1930, 1936, "governo provisório e constitucional de Vargas"), (1937, 1945, "ditadura do Estado Novo")],
    "Turquia": [(1923, 1945, "partido único")], "Japão": [], "Império do Japão": [(1890, 1945, "monarquia constitucional")],
    "Grécia": [(1936, 1941, "ditadura de Metaxas")], "Polônia": [(1926, 1939, "regime autoritário (Sanacja)")],
    "Hungria": [(1920, 1944, "regência autoritária de Horthy")], "Áustria": [(1934, 1937, "ditadura austrofascista")],
    "Romênia": [(1938, 1940, "ditadura real de Carol II"), (1940, 1944, "ditadura de Antonescu")],
    "Iugoslávia": [(1929, 1934, "ditadura real")], "Reino dos Sérvios, Croatas e Eslovenos": [(1918, 1928, "monarquia constitucional")],
    "Bulgária": [(1934, 1944, "ditadura real")], "Lituânia": [(1926, 1940, "regime autoritário de Smetona")],
    "Letônia": [(1934, 1940, "regime autoritário de Ulmanis")], "Estônia": [(1934, 1940, "regime autoritário de Päts")],
    "Reino Unido": [(1689, 9999, "monarquia parlamentarista")], "Império Russo": [(1721, 1905, "monarquia absoluta"), (1906, 1917, "monarquia constitucional")],
    "Império Alemão": [(1871, 1918, "monarquia constitucional")], "Império Austríaco": [(1804, 1866, "monarquia absoluta")],
    "Áustria-Hungria": [(1867, 1918, "monarquia dual")], "Império Otomano": [(0, 1875, "monarquia absoluta"), (1876, 1877, "monarquia constitucional"),
    (1878, 1907, "monarquia absoluta"), (1908, 1922, "monarquia constitucional")], "Império Qing": [(0, 1911, "monarquia absoluta")],
    "Estados Unidos": [(1789, 9999, "democracia presidencialista")], "França": [(1870, 1939, "democracia parlamentarista")],
    "Suíça": [(1848, 9999, "democracia direta e diretorial")], "Paraguai": [(1940, 1948, "ditadura militar")],
    "Argentina": [(1930, 1931, "ditadura militar"), (1943, 1945, "ditadura militar")], "Venezuela": [(1908, 1935, "ditadura de Gómez")],
    "República Dominicana": [(1930, 1961, "ditadura de Trujillo")], "Nicarágua": [(1937, 1979, "ditadura dos Somoza")],
    "México": [(1876, 1910, "ditadura de Porfirio Díaz"), (1929, 2000, "regime de partido dominante")],
    "China (República)": [], "República da China": [(1928, 1948, "partido único do Kuomintang")],
    "Tailândia": [(1938, 1944, "ditadura militar")], "Sião": [(0, 1931, "monarquia absoluta"), (1932, 1937, "monarquia constitucional"),
    (1938, 1944, "ditadura militar")], "Arábia Saudita": [(0, 9999, "monarquia absoluta")], "Pérsia": [(0, 1905, "monarquia absoluta"),
    (1906, 1934, "monarquia constitucional")], "Irã": [(1925, 1941, "ditadura de Reza Xá")],
}
# mudanças de regime 2021–2026 (o REIGN para em ago/2021), conferidas no Wikipedia
REGIME_FIX = {"Mianmar": [(2021, 9999, "Military")],
              "Mali": [(2020, 9999, "Military")], "Guiné": [(2021, 2025, "Military")], "Sudão": [(2021, 9999, "Military")],
              "Burkina Faso": [(2022, 9999, "Military")], "Níger": [(2023, 9999, "Military")], "Gabão": [(2023, 2024, "Military")],
              "Chade": [(2021, 2023, "Military")], "Tunísia": [(2021, 9999, "Personal Dictatorship")],
              # o REIGN marca "Foreign/Occupied" em casos que não são ocupação do país todo; aqui fica sem regime
              "Chipre": [(1960, 9999, "-")], "Bósnia e Herzegovina": [(1995, 9999, "-")], "Líbano": [(1976, 2004, "-")], "Síria": [(1961, 1961, "-"), (2024, 9999, "Provisional - Civilian")],
              "República Dominicana": [(1962, 1962, "-")],
              "Afeganistão": [(2001, 2003, "Provisional - Civilian"), (2004, 2013, "-"), (2021, 9999, "Monarchy*Emirado Islâmico (Talibã)")],
              "Iraque": [(2004, 2005, "Provisional - Civilian"), (2006, 2010, "Parliamentary Democracy")],
              "Etiópia": [(1991, 1994, "Provisional - Civilian")], "Egito": [(2014, 2018, "-")], "Rússia": [(1993, 1999, "-Presidential Democracy")],
              "Turquia": [(2019, 9999, "-Presidential Democracy")], "Hungria": [(2020, 9999, "-Parliamentary Democracy")],
              "Chade": [(2021, 2023, "Military"), (2024, 9999, "-")]}

def base(name):
    return re.sub(r"\s*\(.*\)$", "", name).strip()

ANY = [(re.compile(p, re.I), t) for p, t in [(r"\bcanato\b", "Canato"), (r"\bsultanato\b", "Sultanato"), (r"\bemirado\b", "Emirado"),
       (r"\breino\b", "Reino"), (r"\bimpério\b", "Território imperial"), (r"\bgrão-ducado\b", "Grão-ducado"), (r"\bimamato\b", "Imamato"),
       (r"\bconfederação\b", "Confederação"), (r"\bxogunato\b", "Xogunato"), (r"\bnizam\b", "Principado (nizamato)"),
       (r"\b(dinastia|timúridas|babur|kalhoras|hotak|arghun|caramanli|haféssidas|sardares|nayaks|xirvanxás|jabrida)\b", "Monarquia"),
       (r"\bgoverno provisório\b|\bcomissariado\b", "Governo provisório"), (r"\bguarnição\b|\bsitiad|\bcerco\b|\bcercada\b", "Território sitiado"),
       (r"\bpesqueiros\b", "Pesqueiros sazonais (sem colônia)"), (r"\bassentamento\b|\bgranville\b", "Assentamento colonial"),
       (r"\bconquista .* em curso\b", "Território em conquista"), (r"\breivindicad", "Território reivindicado (sem ocupação)"),
       (r"\btributári|\bvassal|\bsuserania\b|\bsob proteção\b", "Estado vassalo")]]
NAMED = {"Antiga Confederação Suíça": "Confederação", "Anhalt": "Principados (dinastia ascânia)", "Estados da Turíngia": "Ducados e principados (Sacro Império)",
 "Renânia e Palatinado (estados do Sacro Império)": "Estados do Sacro Império", "Vestfália e Baixo Reno (estados do Sacro Império)": "Estados do Sacro Império",
 "Monarquia de Habsburgo": "Monarquia (arquiducado e coroas dos Habsburgo)", "Países Baixos dos Habsburgo": "Domínios dos Habsburgo (17 províncias)",
 "Brandemburgo-Prússia": "Eleitorado (Sacro Império) e Ducado da Prússia", "Mongóis Khalkha": "Canatos mongóis", "Yuan do Norte (mongóis do sul)": "Canato (Yuan do Norte)",
 "Mogulistão e oirates": "Canato e confederação tribal", "Oirates e Canato de Yarkent": "Canato e confederação tribal", "Kokonor (mongóis)": "Tribos mongóis",
 "Kokonor (mongóis Khoshut)": "Canato (Khoshut)", "Kokonor (Khoshut, Güshi Khan)": "Canato (Khoshut)", "Jin Posterior": "Canato (manchu)",
 "Estado Mahdista": "Estado islâmico (mahdista)", "Estado de Creta": "Estado autônomo sob suserania otomana", "Estado de Hatay": "República",
 "Estado de Tashkent": "Cidade-estado", "Estado Helênico": "República (governo provisório)", "Estado Oriental do Uruguai": "República",
 "Estado de Buenos Aires": "República", "Estado do Haiti (Christophe)": "Estado (presidência vitalícia de Christophe)", "Estados Confederados da América": "Confederação (república)",
 "Estados Unidos da Colômbia": "República federal", "Grã-Colômbia": "República", "Hetmanato Cossaco": "Hetmanato (Estado cossaco)",
 "Ming do Sul (Hongguang)": "Império (regime remanescente Ming)", "Ming do Sul (Longwu)": "Império (regime remanescente Ming)", "Ming do Sul (Yongli)": "Império (regime remanescente Ming)",
 "Ming do Sul (Yongli, em Anlong)": "Império (regime remanescente Ming)", "Ming do Sul (Yongli; Shaowu em Cantão)": "Império (regimes remanescentes Ming)",
 "Grande Xi (Zhang Xianzhong)": "Reino rebelde", "Grande Zhou (Wu Sangui e Wu Shifan)": "Império rebelde", "Grande Zhou (Wu Shifan, Yunnan)": "Império rebelde",
 "Revolta dos Três Feudatários (Wu Sangui)": "Território em revolta", "Guizhou e Yunnan (Sun Kewang e Li Dingguo, ex-Grande Xi)": "Território rebelde (aliado dos Ming do Sul)",
 "Raj de Sarawak": "Reino (rajás brancos)", "Segundo Império Mexicano": "Império", "Yettishar (Emirado de Kashgar)": "Emirado",
 "Zhuz Sênior cazaque": "Canato (zhuz)", "Quirguizes do norte (vale do Chu e Issyk-Kul)": "Tribos quirguizes", "Ha'il": "Emirado",
 "Primeira República da Venezuela": "República", "Segunda República da Venezuela": "República", "Junta Suprema de Caracas": "Governo provisório",
 "Províncias Unidas de Nova Granada": "República federal", "Províncias Unidas do Rio da Prata": "República", "Liga Federal (Artigas)": "Confederação",
 "Províncias Unidas da Itália Central": "Governo provisório", "Estados Belgas (Revolução de Brabante)": "Confederação (em revolta)",
 "Associação Internacional do Congo": "Território de companhia comercial", "Estado Livre do Congo": "Estado pessoal do rei Leopoldo II",
 "Transorângia (griquas)": "Chefias griquas", "Transorângia (bôeres e griquas)": "Território dividido", "Zululândia (chefaturas após a Guerra Anglo-Zulu)": "Chefias locais",
 "Reserva Indígena (Proclamação Real de 1763)": "Reserva indígena (reivindicada pelo Reino Unido)", "Kedah, Kelantan e Terengganu (tributários do Sião)": "Sultanatos vassalos",
 "Kedah, Perlis, Kelantan e Terengganu (tributários do Sião)": "Sultanatos vassalos", "Niue": "Chefias locais", "Wallis e Futuna": "Reinos locais",
 "Celebes (Gowa-Tallo e outros reinos)": "Reinos e chefias locais", "Molucas (Ternate, Tidore e outros)": "Sultanatos locais",
 "Java (Mataram, Banten e outros)": "Sultanatos locais", "Vietnã do Sul": "República", "Vaticano": "Estado papal (teocracia)", "Sikkim": "Reino (chogyal)",
 "Malta (Ordem de São João)": "Estado de ordem militar religiosa", "Malta (Reino da Sicília)": "Parte do Reino da Sicília", "Macau": "Colônia (entreposto português)",
 "Goa (Índia Portuguesa)": "Colônia", "Timor Português": "Colônia", "Goa (Sultanato de Bijapur)": "Parte do Sultanato de Bijapur",
 "Franco-Condado (Habsburgo)": "Condado (domínio dos Habsburgo)", "Áustria-Hungria": "Império (monarquia dual)", "Confederação da Alemanha do Norte": "Confederação (presidida pelo rei da Prússia)",
 "Transvaal (República Sul-Africana)": "República", "Transvaal (República Sul-Africana, suserania britânica)": "República sob suserania britânica",
 "Paxalato de Trípoli (dinastia Caramanli)": "Paxalato (vassalo otomano, autônomo)", "Novo México (Revolta dos Pueblos)": "Território em revolta"}
REPUB_SINCE = 1776

WARNAME = re.compile(r"\((guerra|governo|pátria velha|fora da|último estado|grã-colômbia em dissolução|lugar-tenência|comissão|exército|transição|sítio)", re.I)
NAMED.update({"Đại Nam (Vietnã)": "Império", "Lan Na (Chiang Mai)": "Reino", "Al-Hasa": "Território tribal", "Bengala (Sher Shah Suri)": "Território de Sher Shah Suri (em conquista)",
 "Cabul e Kandahar (mogóis, sob Kamran e Humayun)": "Território mogol (governo de Kamran Mirza)", "Java (Mataram e Banten, sob influência da VOC)": "Sultanatos locais",
 "Java (Mataram, Banten e outros; Batávia holandesa)": "Sultanatos locais e colônia holandesa", "Zanzibar e Pemba (reinos suaílis)": "Reinos e chefias locais",
 "Quito (resistência inca de Rumiñahui)": "Resistência inca", "Orissa (chefes afegãos)": "Chefias afegãs", "Síria (governo árabe de Faiçal)": "Governo árabe (administração militar)",
 "Decão ocidental (guerra mogol–maratha)": "Território em guerra", "Zungária e Bacia do Tarim (guerra Qing–Zungar)": "Território em guerra",
 "Vietnã (guerra entre Tây Sơn e Nguyễn)": "País em guerra civil", "Tortuga (França) e Hispaniola ocidental (bucaneiros)": "Território de bucaneiros",
 "Flórida (Forte Caroline, colônia francesa)": "Colônia", "São Tomé e Príncipe (descobertas por Portugal; povoamento a partir de 1493)": "Ilhas desabitadas",
 "América Central (independente da Espanha)": "Governo provisório", "Alta Califórnia (guerra mexicano-americana)": "Território em guerra",
 "Alsácia-Lorena (Guerra Franco-Prussiana)": "Território em guerra", "Hong Kong (Primeira Guerra do Ópio)": "Território em guerra",
 "Banda Oriental (Artigas; invasão luso-brasileira)": "Território em guerra", "Banda Oriental (Guerra da Cisplatina)": "Território em guerra",
 "Rio Grande do Sul (Guerra dos Farrapos)": "Território em revolta (República Rio-Grandense)", "Sudão (Guerra Mahdista)": "Território em revolta",
 "Schleswig (Primeira Guerra do Schleswig)": "Território em guerra", "Schleswig (comissão mista do armistício)": "Território administrado",
 "Holstein (lugar-tenência alemã)": "Território administrado", "Holstein (governo de Schleswig-Holstein)": "Governo provisório",
 "Luisiana (transição da França para a Espanha)": "Colônia (em transição)", "Minorca (sítio franco-espanhol)": "Território sitiado",
 "Saint-Domingue (Guerra do Sul)": "Colônia em guerra civil", "Saint-Domingue (exército de Dessalines)": "Território em revolta",
 "Saint-Domingue (governo de Toussaint Louverture)": "Colônia autônoma (governo de Toussaint Louverture)", "Saint-Domingue (guerra de independência)": "Território em revolta",
 "São Domingos (Guerra da Restauração)": "Território em revolta", "Transvaal (Primeira Guerra dos Bôeres)": "Território em revolta"})
for _k in ("Catalunha e Maiorca (austracistas, por Carlos III)", "Catalunha e Maiorca (austracistas, por Carlos VI)", "Catalunha e Valência (austracistas, por Carlos III)",
           "Catalunha, Valência e Maiorca (austracistas, por Carlos III)"):
    NAMED[_k] = "Território austracista (Guerra de Sucessão Espanhola)"

def form_of(name, y, indep=True):
    if name in NAMED: return NAMED[name]
    if WARNAME.search(name) and base(name) != name:
        f = form_of(base(name), y, indep)
        return f or "Território em guerra"
    for p, t in KEYS:
        if p.search(name): return t
    b = base(name)
    for a, z, t in FORM.get(b, []):
        if a <= y <= z: return t
    if b in REALMS and REALMS[b][0] <= y <= REALMS[b][1]: return "Monarquia da Commonwealth"
    if b in NAMED: return NAMED[b]
    for p, t in ANY:
        if p.search(name): return t
    if indep and name == b and y >= REPUB_SINCE and b not in MONARCHY_MODERN: return "República"
    return None

def lookup(tab, name, y):
    for k in (name, base(name)):
        for a, z, t in tab.get(k, []):
            if a <= y <= z: return t
    return None

def in_years(tab, name, y):
    for k in (name, base(name)):
        if k in tab and tab[k][0] <= y <= tab[k][1]: return True
    return False

def kind(name, own, y, gov=None, dependent_type=None):
    """texto do campo Tipo"""
    f = form_of(name, y)
    if dependent_type: return dependent_type if not f or f in ("Território dependente",) else f
    if f in ("Território ocupado", "Estado fantoche", "Protetorado", "Território sob mandato", "Território disputado", "País em guerra civil",
             "Território sob tutela", "Território da Liga das Nações", "Povos indígenas e chefias locais", "Reinos e chefias locais",
             "Território dividido", "Fortes e feitorias europeus", "Condomínio"):
        return f
    reg = None
    if gov:
        g = gov.split("*")
        if len(g) == 2: return g[1]
        reg = REIGN_REG.get(gov)
        if gov in ("Party-Personal", "Party-Personal-Military Hybrid", "Party-Military", "Dominant Party") and in_years(COMMUNIST, name, y):
            reg = "partido único comunista"
        mon = base(name) in MONARCHY_MODERN and (f or "").split(" ")[0] in ("Reino", "Império", "Sultanato", "Emirado", "Principado", "Grão-ducado",
              "Coprincipado", "Monarquia", "Federação", "Reino", "Teocracia") or (f or "").startswith(("Monarquia", "Reino", "Império", "Sultanato", "Emirado"))
        if gov == "Parliamentary Democracy": reg = "monarquia parlamentarista" if mon else "democracia parlamentarista"
        if gov == "Presidential Democracy" and mon: reg = "monarquia constitucional"
        if gov == "Monarchy" and not mon: reg = "monarquia"
    else:
        reg = lookup(REGIME_OLD, name, y)
        if not reg and in_years(COMMUNIST, name, y): reg = "partido único comunista"
    mon = (f or "").startswith(("Monarquia", "Reino", "Império", "Sultanato", "Emirado", "Principado", "Grão-ducado", "Coprincipado", "Czarado", "Canato"))
    if not f: f = "Monarquia" if base(name) in MONARCHY_MODERN and gov == "Monarchy" else ("República" if reg else "Estado independente")
    if reg and f.startswith("Monarquia") and reg.startswith("monarquia "): reg = reg[len("monarquia "):]
    if reg and reg.lower() not in f.lower() and not (reg == "monarquia" and mon) and not (reg.split(" ")[0] in f.lower()):
        return f[:-1] + "; " + reg + ")" if f.endswith(")") else f"{f} ({reg})"
    return f

# ---------- REIGN: regime em dezembro de cada ano ----------
def load_reign(path):
    g = {}
    for x in csv.DictReader(open(path, encoding="utf-8", errors="replace")):
        try: c, y, m = int(float(x["ccode"])), int(float(x["year"])), int(float(x["month"]))
        except ValueError: continue
        k = (c, y)
        if k not in g or m >= g[k][0]: g[k] = (m, x["government"])
    return {k: v[1] for k, v in g.items()}

# ---------- cargo ----------
FEM = {"Rei": "Rainha", "Imperador": "Imperatriz", "Grão-duque": "Grã-duquesa", "Príncipe": "Princesa", "Presidente": "Presidente",
       "Primeiro-ministro": "Primeira-ministra", "Chanceler": "Chanceler", "Czar": "Czarina", "Sultão": "Sultana", "Ditador": "Ditadora",
       "Chefe do governo militar": "Chefe do governo militar"}
MONARCH_TITLE = [  # (regex na forma ou no nome, título do monarca)
    (r"Império Otomano|^Turquia", "Sultão"), (r"Áustria-Hungria|Império Austríaco", "Imperador"), (r"Alemanha do Norte", "Presidente da Confederação (rei da Prússia)"), (r"Pérsia|Irã", "Xá"), (r"Império Russo", "Imperador (czar)"), (r"Czarado", "Czar"),
    (r"Bulgária", "Czar"), (r"Afeganistão|Reino do Afeganistão", None), (r"Etiópia|Abissínia", "Imperador"), (r"Império", "Imperador"),
    (r"Sultanato|Omã|Mascate|Brunei", "Sultão"), (r"Emirado|Kuwait|Catar", "Emir"), (r"Bahrein", None),
    (r"Beilhique|Túnis|Tunísia", "Bei"), (r"Quedivato", "Quediva"), (r"Iêmen", "Imã e rei"), (r"Tibete", "Dalai-lama"),
    (r"Butão", "Rei (Druk Gyalpo)"), (r"Grão-ducado|Luxemburgo", "Grão-duque"), (r"Principado|Mônaco|Liechtenstein", "Príncipe"),
    (r"Malásia|Federação Malaia", "Yang di-Pertuan Agong (rei)"), (r"Emirados Árabes", "Presidente"), (r"Samoa", "O le Ao o le Malo (chefe de Estado)"),
    (r"Reino|Arábia|Jordânia|Tailândia|Sião|Nepal|Tonga|Essuatíni|Suazilândia|Lesoto|Camboja|Laos|Bélgica|Países Baixos|Dinamarca|Suécia|"
     r"Noruega|Espanha|Portugal|Itália|Grécia|Romênia|Sérvia|Montenegro|Iugoslávia|Iraque|Egito|Líbia|Burundi|Ruanda|Hejaz|Albânia", "Rei"),
]
MONARCH_TITLE = [(re.compile(p), t) for p, t in MONARCH_TITLE]
PM_TITLE = [(r"^Alemanha|Áustria|Weimar", "Chanceler"), (r"Reino da Prússia", "Ministro-presidente"),
            (r"^Itália|Reino da Itália", "Presidente do Conselho de Ministros"), (r"^Espanha", None), (r"^França", "Presidente do Conselho"),
            (r"^Portugal|Reino de Portugal", "Presidente do Conselho de Ministros"), (r"Império Otomano", "Grão-vizir"),
            (r"^Irlanda", "Taoiseach (primeiro-ministro)"), (r"Estado Livre Irlandês", "Presidente do Conselho Executivo"),
            (r"^Nepal", None), (r"^Suíça", "Presidente da Confederação"), (r"^Andorra", "Chefe de Governo")]
PM_TITLE = [(re.compile(p), t) for p, t in PM_TITLE]
REGNAL = re.compile(r"(\b[IVX]+$|^Imperador |^(Rei|Rainha|Xá|Sultão|Emir|Xeique|Príncipe|Grão-duque|Grã-duquesa) |\bShah\b| Xá\b|Dalai Lama|\bibn Saud\b|^Rama [IVX]+)")
KNOWN_MONARCH = set("""Muhammad III as-Sadiq;Faruk;Abdelaziz;Jigme Wangchuck;Ugyen Wangchuck;Franz Josef;Prajadhipok;Abdulaziz ibn Saud;Yahya Muhammad Hamid ed-Din;Turki bin Said;Faisal bin Turki;Taimur bin Feisal;Said bin Taimur;Mohammed Zahir Shah;Amanullah Khan;Habibullah Khan;Abdur Rahman Khan;Sher Ali Khan;Mohammed Nadir Shah;Abdulaziz;Ibn Saud;Saud;Faisal;Khalid;Fahd;Abdullah;Salman;
Haile Selassie;Menelik II;Zewditu;Hussein;Abdullah II;Talal;Hassan II;Mohammed VI;Mohammed V;Qaboos bin Said;Haitham bin Tariq;Said bin Taimur;Hassanal Bolkiah;
Jaber Al-Ahmad Al-Sabah;Sabah Al-Ahmad Al-Jaber Al-Sabah;Nawaf Al-Ahmad Al-Jaber Al-Sabah;Mishal Al-Ahmad Al-Jaber Al-Sabah;Abdullah Al-Salim Al-Sabah;Sabah Al-Salim Al-Sabah;
Tamim bin Hamad Al Thani;Hamad bin Khalifa Al Thani;Khalifa bin Hamad Al Thani;Ahmad bin Ali Al Thani;Hamad bin Isa Al Khalifa;Isa bin Salman Al Khalifa;
Zayed bin Sultan Al Nahyan;Khalifa bin Zayed Al Nahyan;Mohamed bin Zayed Al Nahyan;Mswati III;Sobhuza II;Jigme Singye Wangchuck;Jigme Khesar Namgyel Wangchuck;Jigme Dorji Wangchuck;
Mahendra;Birendra;Gyanendra;Tribhuvan;Taufa'ahau Tupou IV;George Tupou V;Tupou VI;Norodom Sihanouk;Sisavang Vong;Sisavang Vatthana;Mohammad Reza Pahlavi;Reza Shah;
Faisal I;Ghazi;Faisal II;Fuad I;Farouk;Idris;Ahmad bin Yahya;Yahya Muhammad Hamid ed-Din;Zog I;Mwambutsa IV;Ntare V;Imperador Meiji;Imperador Taishō;Imperador Shōwa;
Chulalongkorn;Vajiravudh;Prajadhipok;Pedro II;Guilherme I;Guilherme II;Francisco José I;Carlos I;Alexandre II;Alexandre III;Nicolau II;Abdul Aziz;Abdul Hamid II;Mehmed V;Mehmed VI;
Muhammad Ali Shah Qajar;Mozaffar ad-Din Shah Qajar;Naser al-Din Shah Qajar;Ahmad Shah Qajar;Guangxu;Xuantong;Tongzhi;Cixi;Gojong;Sunjong;Thubten Gyatso;Tenzin Gyatso;
Ugyen Wangchuck;Nicolau I;Pedro I;Dalai Lama""".replace("\n", "").split(";"))

def title(name, y, leader, female, gov, form):
    """cargo do líder de fato"""
    female = female or leader in FEM_EXTRA
    b = base(name)
    lt = LEADER_TITLE.get(leader)
    if lt:
        for a, z, t in lt:
            if a <= y <= z: return t
    if "(regente)" in leader: return "Regente"
    tf = lookup(TITLE_FIRST, name, y)
    if tf: return ("Capitães-regentes" if tf == "Capitão-regente" and " e " in leader else tf)
    if name.startswith("Principado") and (REGNAL.search(leader) or leader in KNOWN_MONARCH): return "Princesa" if female else "Príncipe"
    if gov and gov.startswith("-"): gov = gov[1:] or None
    pt = lookup(PARTY_TITLE, name, y)
    if pt and gov in (None, "Dominant Party", "Party-Personal", "Party-Personal-Military Hybrid", "Party-Military"): return pt
    if in_years(COMMUNIST, name, y) and gov in (None, "Dominant Party", "Party-Personal", "Party-Personal-Military Hybrid", "Party-Military"):
        return "Secretária-geral do partido" if female else "Secretário-geral do partido"
    mform = (form or "").split(" ")[0] in ("Reino", "Império", "Sultanato", "Emirado", "Principado", "Grão-ducado", "Coprincipado", "Monarquia", "Czarado",
             "Beilhique", "Quedivato", "Teocracia", "Federação", "Imamato", "Canato", "Confederação") or (not form and base(name) in MONARCHY_MODERN)
    monarch = gov == "Monarchy" or (mform and (bool(REGNAL.search(leader)) or leader in KNOWN_MONARCH))
    s = f"{name} {form or ''}"
    if monarch:
        for p, t in MONARCH_TITLE:
            if p.search(s):
                if t is None:
                    if b.startswith("Afeganistão") or "Afeganistão" in name: t = "Emir" if y <= 1925 else "Rei"
                    elif b == "Bahrein": t = "Emir" if y <= 2001 else "Rei"
                    else: t = "Monarca"
                return FEM.get(t, t) if female else t
        return "Monarca"
    if gov == "Provisional - Military": return "Chefe do governo militar provisório"
    if gov in ("Military", "Military-Personal"):
        return "Chefe do governo militar" if mform else "Presidente (regime militar)"
    if gov == "Provisional - Civilian": return "Chefe do governo provisório"
    to = lookup(TITLE_OLD, name, y)
    if to: return FEM_T.get(to, to) if female else to
    if mform and not monarch and gov != "Warlordism" and b not in PRES_PARL and not name.startswith("Emirados"):
        if b == "Nepal" and y <= 1950: return "Primeiro-ministro (marajá Rana)"
        for p, t in PM_TITLE:
            if t and p.search(name): return t
        return "Primeira-ministra" if female else "Primeiro-ministro"
    if gov == "Warlordism": return "Líder de facção"
    parl = gov == "Parliamentary Democracy" or (gov in (None, "Oligarchy") and (form or "").split(" ")[0] in ("Reino", "Império", "Monarquia", "Grão-ducado",
           "Principado", "Domínio", "Coprincipado") and not monarch)
    if gov is None and lookup(REGIME_OLD, name, y) == "democracia parlamentarista": parl = True
    if parl and b not in PRES_PARL:
        for p, t in PM_TITLE:
            if p.search(name):
                if t is None:
                    if b == "Espanha": t = "Presidente do Governo" if y >= 1938 else "Presidente do Conselho de Ministros"
                    elif b == "Nepal": t = "Primeiro-ministro (marajá Rana)" if y <= 1950 else "Primeiro-ministro"
                return t
        return "Primeira-ministra" if female else "Primeiro-ministro"
    if b == "Suíça": return "Presidente da Confederação"
    if b in ("San Marino",): return "Capitão-regente"
    if b == "Andorra": return "Chefe de governo"
    return "Presidente"

PRES_PARL = {"África do Sul", "Botsuana", "Suriname", "Kiribati", "Nauru", "Ilhas Marshall", "Micronésia", "Guiana", "Suíça"}
# exceções por pessoa: [(ano0, ano1, cargo)], conferidas no Wikipedia
LEADER_TITLE = {
    "Adolf Hitler": [(1933, 1933, "Chanceler"), (1934, 1945, "Führer e chanceler (ditador)")],
    "Benito Mussolini": [(1922, 1943, "Duce e chefe do governo (ditador)")],
    "Francisco Franco": [(1936, 1975, "Caudilho e chefe de Estado (ditador)")],
    "António de Oliveira Salazar": [(1932, 1968, "Presidente do Conselho (ditador)")], "Marcelo Caetano": [(1968, 1974, "Presidente do Conselho")],
    "Joseph Stalin": [(1922, 1953, "Secretário-geral do partido (ditador)")], "Lenin": [(1917, 1924, "Presidente do Conselho dos Comissários do Povo")],
    "Philippe Pétain": [(1940, 1944, "Chefe do Estado Francês")], "Charles de Gaulle": [(1944, 1946, "Presidente do Governo Provisório"), (1958, 1958, "Presidente do Conselho"), (1959, 1969, "Presidente")],
    "Getúlio Vargas": [(1930, 1934, "Chefe do Governo Provisório"), (1935, 1937, "Presidente"), (1938, 1945, "Presidente (ditador do Estado Novo)"), (1951, 1954, "Presidente")],
    "Mustafa Kemal Atatürk": [(1920, 1923, "Presidente da Grande Assembleia Nacional"), (1924, 1938, "Presidente")],
    "Enver Paxá": [(1913, 1918, "Ministro da Guerra (triunvirato dos Três Paxás)")], "Mahmud Şevket Paxá": [(1909, 1913, "Inspetor-geral do exército (líder de fato)")],
    "Józef Piłsudski": [(1918, 1922, "Chefe de Estado"), (1926, 1935, "Ministro dos Assuntos Militares (líder de fato)")],
    "Miklós Horthy": [(1920, 1944, "Regente")], "Ioannis Metaxas": [(1936, 1941, "Primeiro-ministro (ditador)")],
    "Ion Antonescu": [(1940, 1944, "Conducător (ditador)")], "Chiang Kai-shek": [(1928, 1948, "Presidente do Governo Nacional (generalíssimo)"), (1949, 1975, "Presidente")],
    "Mao Zedong": [(1949, 1976, "Presidente do Partido Comunista")], "Deng Xiaoping": [(1978, 1997, "Líder supremo")],
    "Kim Il-sung": [(1948, 1994, "Líder supremo")], "Kim Jong-il": [(1994, 2011, "Líder supremo")], "Kim Jong-un": [(2011, 2099, "Líder supremo")],
    "Fidel Castro": [(1959, 2008, "Primeiro-secretário do partido (comandante em chefe)")], "Raúl Castro": [(2008, 2021, "Primeiro-secretário do partido")],
    "Ruhollah Khomeini": [(1979, 1989, "Líder supremo")], "Ali Khamenei": [(1989, 2099, "Líder supremo")],
    "Hibatullah Akhundzada": [(2016, 2099, "Líder supremo (emir)")], "Mohammed Omar": [(1996, 2001, "Líder supremo (emir)")],
    "Muammar Gaddafi": [(1969, 2011, "Líder da Revolução (ditador)")], "Saddam Hussein": [(1979, 2003, "Presidente (ditador)")],
    "Pol Pot": [(1975, 1979, "Secretário-geral do partido (ditador)")], "Gamal Abdel Nasser": [(1954, 1970, "Presidente")],
    "Josip Broz Tito": [(1945, 1980, "Presidente (marechal)")], "Augusto Pinochet": [(1973, 1990, "Presidente da junta militar (ditador)")],
    "Imperador Meiji": [(1867, 1912, "Imperador")], "Cixi": [(1861, 1908, "Imperatriz-viúva (regente de fato)")],
    "Otto von Bismarck": [(1862, 1890, "Chanceler")],
    "Reza Khan": [(1921, 1924, "Primeiro-ministro"), (1925, 1941, "Xá")], "Reza Xá Pahlavi": [(1925, 1941, "Xá")],
    "Zog": [(1922, 1924, "Primeiro-ministro"), (1925, 1927, "Presidente"), (1928, 1939, "Rei")], "Enver Hoxha": [(1944, 1945, "Chefe do governo provisório")],
    "Friedrich Ebert": [(1918, 1918, "Presidente do Conselho dos Representantes do Povo"), (1919, 1925, "Presidente")],
    "Theodoros Pangalos": [(1925, 1926, "Ditador")], "Kārlis Ulmanis": [(1934, 1935, "Primeiro-ministro (ditador)"), (1936, 1940, "Presidente (ditador)")],
    "Konstantin Päts": [(1934, 1937, "Ancião de Estado (ditador)"), (1938, 1940, "Presidente (ditador)")], "Mátyás Rákosi": [(1945, 1956, "Secretário-geral do partido")],
    "Muhammad Ali Jinnah": [(1947, 1948, "Governador-geral")], "Boris Yeltsin": [(1991, 1999, "Presidente")],
    "Imperatriz-viúva Cixi": [(1861, 1908, "Imperatriz-viúva (regente de fato)")], "Imperatriz-viúva Longyu": [(1908, 1912, "Imperatriz-viúva (regente)")],
    "Empress Dowager Longyu": [(1908, 1912, "Imperatriz-viúva (regente)")], "Vladimir Lenin": [(1917, 1924, "Presidente do Conselho dos Comissários do Povo")],
    "Mullah Omar": [(1996, 2001, "Líder supremo (emir)")], "Mohammad Jan Khan Wardak": [(1879, 1879, "Líder da resistência")],
    "Ramiz Alia": [(1985, 1990, "Primeiro-secretário do partido"), (1991, 1992, "Presidente")], "Sali Berisha": [(1992, 1997, "Presidente"), (2005, 2013, "Primeiro-ministro")],
    "Wilhelm Pieck": [(1949, 1950, "Presidente")], "Iajuddin Ahmed": [(2006, 2006, "Presidente e conselheiro-chefe (governo interino)")],
    "Fakhruddin Ahmed": [(2007, 2008, "Conselheiro-chefe (governo interino)")], "Muhammad Yunus": [(2024, 2026, "Conselheiro-chefe (governo interino)")],
    "Ne Win": [(1958, 1959, "Primeiro-ministro (governo militar interino)"), (1962, 1973, "Presidente do Conselho Revolucionário"), (1974, 1981, "Presidente"), (1982, 1988, "Presidente do partido")],
    "Norodom Sihanouk": [(1941, 1954, "Rei"), (1955, 1959, "Primeiro-ministro"), (1960, 1970, "Chefe de Estado"), (1993, 2004, "Rei")],
    "Carlos Arias Navarro": [(1973, 1976, "Presidente do Governo")], "Pierre Laval": [(1942, 1944, "Chefe do Governo")], "Kofi Abrefa Busia": [(1969, 1972, "Primeiro-ministro")],
    "Maurice Bishop": [(1979, 1983, "Primeiro-ministro (governo revolucionário)")], "George Cadle Price": [(1961, 1980, "Primeiro-ministro (autogoverno)")],
    "Paul Bremer": [(2003, 2004, "Administrador da Autoridade Provisória da Coalizão")], "Mohan Shumsher Jang Bahadur Rana": [(1948, 1951, "Primeiro-ministro (marajá Rana)")],
    "Lokendra Bahadur Chand": [(2002, 2003, "Primeiro-ministro")], "Surya Bahadur Thapa": [(2003, 2004, "Primeiro-ministro")], "Sher Bahadur Deuba": [(2004, 2005, "Primeiro-ministro")],
    "Liaquat Ali Khan": [(1947, 1951, "Primeiro-ministro")], "Ghulam Muhammad": [(1951, 1955, "Governador-geral")], "Iskander Mirza": [(1955, 1955, "Governador-geral"), (1956, 1958, "Presidente")],
    "Asif Ali Zardari": [(2008, 2013, "Presidente"), (2024, 2099, "Presidente")], "Zulfikar Ali Bhutto": [(1971, 1972, "Presidente"), (1973, 1977, "Primeiro-ministro")],
    "Ian Smith": [(1964, 1979, "Primeiro-ministro")], "Dzeliwe Shongwe": [(1982, 1983, "Rainha-regente")], "Ntfombi Tfwala": [(1983, 1986, "Rainha-regente")],
    "Phoumi Nosavan": [(1959, 1965, "Líder militar (vice-primeiro-ministro)")], "Shah Mahmud Khan": [(1946, 1953, "Primeiro-ministro")],
    "Mohammed Daoud Khan": [(1953, 1963, "Primeiro-ministro"), (1973, 1978, "Presidente")], "Tosiwo Nakayama": [(1979, 1991, "Presidente")],
    "Vojislav Koštunica": [(2000, 2003, "Presidente"), (2004, 2008, "Primeiro-ministro")], "Francisco da Costa Gomes": [(1974, 1976, "Presidente")],
    "Turgut Özal": [(1983, 1988, "Primeiro-ministro"), (1989, 1993, "Presidente")], "Süleyman Demirel": [(1965, 1980, "Primeiro-ministro"), (1991, 1992, "Primeiro-ministro"), (1993, 2000, "Presidente")],
    "Recep Tayyip Erdoğan": [(2003, 2013, "Primeiro-ministro"), (2014, 2099, "Presidente")], "Abdullah Gül": [(2002, 2002, "Primeiro-ministro"), (2007, 2014, "Presidente")],
    "İsmet İnönü": [(1938, 1950, "Presidente"), (1961, 1965, "Primeiro-ministro")], "Adnan Menderes": [(1950, 1960, "Primeiro-ministro")],
    "Aleksandar Vučić": [(2014, 2016, "Primeiro-ministro"), (2017, 2099, "Presidente")],
    "Tarja Halonen": [(2000, 2012, "Presidente")], "Sauli Niinistö": [(2012, 2024, "Presidente")], "Stjepan Mesić": [(2000, 2010, "Presidente")], "Ivo Josipović": [(2010, 2015, "Presidente")],
    "Kolinda Grabar-Kitarović": [(2015, 2020, "Presidente")], "Mircea Snegur": [(1991, 1996, "Presidente")], "Petru Lucinschi": [(1997, 2001, "Presidente")],
    "Vytautas Landsbergis": [(1990, 1992, "Presidente do Conselho Supremo")], "Mário Soares": [(1986, 1996, "Presidente")], "Jorge Sampaio": [(1996, 2006, "Presidente")],
    "Aníbal Cavaco Silva": [(2006, 2016, "Presidente")], "Marcelo Rebelo de Sousa": [(2016, 2026, "Presidente")], "António José Seguro": [(2026, 2099, "Presidente")],
    "Traian Băsescu": [(2004, 2014, "Presidente")], "Klaus Iohannis": [(2014, 2025, "Presidente")], "Nicușor Dan": [(2025, 2099, "Presidente")], "Nicolae Ceaușescu": [(1965, 1989, "Secretário-geral do partido")],
    "Fouad Siniora": [(2005, 2009, "Primeiro-ministro")], "Tammam Salam": [(2014, 2016, "Primeiro-ministro")], "Hassan Diab": [(2020, 2021, "Primeiro-ministro")], "Saad Hariri": [(2009, 2020, "Primeiro-ministro")],
    "Nawaf Salam": [(2025, 2099, "Primeiro-ministro")], "Aung San Suu Kyi": [(2016, 2021, "Conselheira de Estado")], "Than Shwe": [(1992, 2011, "Presidente do Conselho de Estado (junta militar)")],
    "Min Aung Hlaing": [(2021, 2099, "Chefe da junta militar")], "Fatafehi Fakafānua": [(2024, 2099, "Primeiro-ministro")], "Fatafehi Tuʻipelehake": [(1965, 1991, "Primeiro-ministro")],
    "Jigme Thinley": [(1998, 1998, "Presidente do Conselho de Ministros"), (2003, 2003, "Presidente do Conselho de Ministros"), (2008, 2013, "Primeiro-ministro")],
    "Sangay Ngedup": [(1999, 2005, "Presidente do Conselho de Ministros")], "Yeshey Zimba": [(2000, 2004, "Presidente do Conselho de Ministros")],
    "Khandu Wangchuk": [(2001, 2006, "Presidente do Conselho de Ministros")], "Kinzang Dorji": [(2002, 2007, "Presidente do Conselho de Ministros")],
    "Krishna Prasad Bhattarai": [(1990, 1999, "Primeiro-ministro")], "Khorloogiin Choibalsan": [(1939, 1952, "Primeiro-ministro")],
    "Punsalmaagiin Ochirbat": [(1990, 1990, "Presidente do Presidium")], "Edward Rydz-Śmigły": [(1935, 1939, "Inspetor-geral das Forças Armadas (líder de fato)")],
    "Abd Rabbuh Mansur Hadi": [(2015, 2022, "Presidente (governo reconhecido, em guerra civil)")], "Rashad al-Alimi": [(2022, 2099, "Presidente do Conselho de Liderança Presidencial")],
    "Vladimir Putin": [(1999, 1999, "Primeiro-ministro"), (2000, 2007, "Presidente"), (2008, 2011, "Primeiro-ministro"), (2012, 2099, "Presidente")],
}
FEM_EXTRA = set("""Sanae Takaichi;Sheikh Hasina;Kaja Kallas;Ingrida Šimonytė;Natalia Gavrilița;Fiamē Naomi Mataʻafa;Giorgia Meloni;Mette Frederiksen;Magdalena Andersson;
Liz Truss;Élisabeth Borne;Kristrún Frostadóttir;Katrín Jakobsdóttir;Claudia Sheinbaum;Xiomara Castro;Dina Boluarte;Hilda Heine;Samia Suluhu Hassan;Netumbo Nandi-Ndaitwah;
Evika Siliņa;Ana Brnabic;Ana Brnabić;Mia Mottley;Kamla Persad-Bissessar;Jacinda Ardern;Sanna Marin;Karin Keller-Sutter;Viola Amherd;Maia Sandu;Tsai Ing-wen;Theresa May;
Margaret Thatcher;Angela Merkel;Julia Gillard;Helen Clark;Jenny Shipley;Golda Meir;Indira Gandhi;Benazir Bhutto;Khaleda Zia;Sirimavo Bandaranaike;Chandrika Kumaratunga;
Gro Harlem Brundtland;Erna Solberg;Helle Thorning-Schmidt;Jóhanna Sigurðardóttir;Tarja Halonen;Dalia Grybauskaitė;Kolinda Grabar-Kitarović;Yingluck Shinawatra;
Ellen Johnson Sirleaf;Joyce Banda;Portia Simpson-Miller;Eugenia Charles;Sophie Wilmes;Iveta Radičová;Alenka Bratušek;Zinaida Greceanîi;Reneta Indzhova;Laimdota Straujuma;
Ertha Pascal-Trouillot;Sylvie Kinigi;Jeanine Áñez;Roza Otunbayeva;Nino Burjanadze;Brigitte Bierlein;Aung San Suu Kyi;Dzeliwe Shongwe;Ntfombi Tfwala;Zewditu;Cixi;Imperatriz-viúva Cixi;Imperatriz-viúva Longyu;Empress Dowager Longyu""".replace("\n", "").split(";"))
FEM_T = {"Primeiro-ministro": "Primeira-ministra", "Chanceler": "Chanceler", "Presidente": "Presidente"}
# cargo fixo, antes de qualquer outra regra
TITLE_FIRST = {"Emirados Árabes Unidos": [(0, 9999, "Presidente")], "San Marino": [(0, 9999, "Capitão-regente")], "Iugoslávia": [(1980, 1991, "Presidente da Presidência")],
    "Bósnia e Herzegovina": [(1995, 9999, "Presidente da Presidência")], "Tonga": [(0, 9999, "Primeiro-ministro")], "Lituânia": [(1992, 9999, "Presidente")],
    "Líbano": [(0, 1975, "Presidente")]}
# cargo do líder de fato antes do REIGN (1950) onde o padrão (presidente) não serve
TITLE_OLD = {"Grécia": [(1924, 1934, "Primeiro-ministro")], "Alemanha": [(1919, 1932, "Chanceler")], "Áustria": [(1918, 1949, "Chanceler")],
    "Áustria Alemã": [(0, 9999, "Chanceler")], "Letônia": [(1918, 1933, "Primeiro-ministro")], "Estônia": [(1918, 1919, "Primeiro-ministro"), (1920, 1933, "Ancião de Estado")],
    "Hungria": [(1918, 1919, "Primeiro-ministro")], "Estado Livre Irlandês": [(0, 9999, "Presidente do Conselho Executivo")], "Irlanda": [(1937, 9999, "Taoiseach (primeiro-ministro)")],
    "Islândia": [(1944, 1949, "Primeiro-ministro")], "África do Sul": [(0, 1983, "Primeiro-ministro")], "União Sul-Africana": [(0, 9999, "Primeiro-ministro")],
    "Itália": [(1946, 1949, "Presidente do Conselho de Ministros")], "Índia": [(1947, 1949, "Primeiro-ministro")], "Paquistão": [(1948, 1957, "Primeiro-ministro")], "São Tomé e Príncipe": [(1975, 9999, "Presidente")],
    "Birmânia": [(1948, 1949, "Primeiro-ministro")], "Israel": [(1948, 1949, "Primeiro-ministro")], "Alemanha Ocidental": [(1949, 1949, "Chanceler")],
    "França": [(1946, 1949, "Presidente do Conselho")], "Espanha": [(1931, 1935, "Presidente do Conselho de Ministros")],
    "Camboja": [(1989, 9999, "Primeiro-ministro")], "Etiópia": [(1995, 9999, "Primeiro-ministro")], "Federação Malaia": [(0, 9999, "Primeiro-ministro")],
    "Malásia": [(0, 9999, "Primeiro-ministro")], "Fiji": [(1970, 9999, "Primeiro-ministro")], "Guiana": [(1966, 1979, "Primeiro-ministro")],
    "Singapura": [(0, 9999, "Primeiro-ministro")], "Equador": [(0, 9999, "Presidente")], "Turquia": [(1950, 1959, "Primeiro-ministro"), (1961, 1979, "Primeiro-ministro"), (1983, 2013, "Primeiro-ministro")],
    "Rodésia": [(0, 9999, "Primeiro-ministro")], "Granada": [(0, 9999, "Primeiro-ministro")], "Japão": [(0, 9999, "Primeiro-ministro")]}

# ---- tipo de território dependente (colônias, possessões etc.) ----
# (regex no nome, ano inicial, ano final, tipo); a primeira que casar vale. Fontes: artigos do Wikipedia de cada território.
DEP = [
    # dependências da Coroa britânica e Europa
    (r"^(Jersey|Guernsey|Ilha de Man|Ilhas do Canal)", 0, 9999, "Dependência da Coroa britânica"),
    (r"^Islândia", 0, 1917, "Dependência (Dinamarca-Noruega)"),
    (r"^Ilhas Faroé", 0, 1947, "Dependência (Dinamarca)"), (r"^Ilhas Faroé", 1948, 9999, "Território autônomo (Dinamarca)"),
    (r"^Groenlândia", 0, 1952, "Colônia"), (r"^Groenlândia", 1953, 1978, "Condado da Dinamarca"), (r"^Groenlândia", 1979, 9999, "Território autônomo (Dinamarca)"),
    (r"^Reino de Chipre \(Veneza\)", 0, 9999, "Possessão veneziana"),
    (r"^Ducado de (Holstein|Schleswig) \(Dinamarca\)", 0, 9999, "Ducado governado pelo rei da Dinamarca"),
    (r"^Condados de Oldemburgo", 0, 9999, "Condados governados pelo rei da Dinamarca"),
    (r"^Ducado de Milão \(sob a França\)", 0, 9999, "Ducado sob domínio francês"),
    (r"^Ducado da Curlândia", 0, 9999, "Ducado vassalo (República das Duas Nações)"),
    (r"^Países Baixos Espanhóis|^Franco-Condado \(Espanha\)", 0, 9999, "Possessão dos Habsburgo espanhóis"),
    (r"^Catalunha \(França\)", 0, 9999, "Principado sob domínio francês"),
    (r"^Halland \(arrendado", 0, 9999, "Território arrendado"),
    (r"^Pomerânia Sueca|^Bremen-Verden \(Suécia\)", 0, 9999, "Possessão sueca no Sacro Império"),
    (r"^Minorca \(britânica\)", 0, 9999, "Possessão britânica"),
    (r"^Gibraltar", 0, 1829, "Possessão britânica"), (r"^Gibraltar", 1830, 1982, "Colônia"),
    (r"^Malta", 1813, 1963, "Colônia"),
    (r"^Chipre", 1914, 1924, "Território anexado (Reino Unido)"), (r"^Chipre", 1925, 1959, "Colônia"),
    (r"^Ilhas Jônicas \((domínio francês|França)\)", 0, 9999, "Possessão francesa"),
    (r"^Dodecaneso \(Itália\)", 0, 9999, "Possessão italiana"),
    (r"^Rumélia Oriental", 0, 9999, "Província autônoma (Império Otomano)"),
    (r"^Grão-Ducado da Finlândia", 0, 9999, "Grão-ducado autônomo (Império Russo)"),
    (r"^Ilhas Åland \(Grão-Ducado", 0, 9999, "Parte do Grão-Ducado da Finlândia"),
    (r"^Ilhas Åland", 0, 1920, "Território dependente"), (r"^Ilhas Åland", 1921, 9999, "Região autônoma (Finlândia)"),
    (r"^Svalbard", 0, 9999, "Território (Noruega)"), (r"^Ilha Bouvet", 0, 9999, "Dependência (Noruega)"),
    (r"^Acrotíri", 0, 9999, "Área de base soberana (Reino Unido)"),
    (r"^Hong Kong$", 1997, 9999, "Região administrativa especial (China)"),
    (r"^Xinjiang", 0, 9999, "Província autônoma de fato (China)"),
    # otomanos e Egito
    (r"^Tripolitânia otomana", 0, 9999, "Eialete (Império Otomano)"),
    (r"^Sudão Egípcio", 0, 9999, "Província (Egito)"),
    (r"^Sudão Anglo-Egípcio", 0, 9999, "Condomínio anglo-egípcio"),
    (r"^Trípoli \(Espanha\)", 0, 9999, "Praça-forte espanhola"),
    # França
    (r"^(Guadalupe|Martinica|Guiana Francesa|Reunião)$", 1946, 9999, "Departamento ultramarino (França)"),
    (r"^Mayotte", 1946, 1975, "Território ultramarino (França)"), (r"^Mayotte", 1976, 2010, "Coletividade territorial (França)"), (r"^Mayotte", 2011, 9999, "Departamento ultramarino (França)"),
    (r"^Saint-Pierre", 1946, 1975, "Território ultramarino (França)"), (r"^Saint-Pierre", 1976, 1984, "Departamento ultramarino (França)"),
    (r"^Saint-Pierre", 1985, 2002, "Coletividade territorial (França)"), (r"^Saint-Pierre", 2003, 9999, "Coletividade ultramarina (França)"),
    (r"^(São Bartolomeu|São Martinho)$", 2007, 9999, "Coletividade ultramarina (França)"),
    (r"^Polinésia Francesa", 1946, 2002, "Território ultramarino (França)"), (r"^Polinésia Francesa", 2003, 9999, "Coletividade ultramarina (França)"),
    (r"^Nova Caledônia", 1946, 1998, "Território ultramarino (França)"), (r"^Nova Caledônia", 1999, 9999, "Coletividade sui generis (França)"),
    (r"^Terras Austrais", 1955, 9999, "Território ultramarino (França)"), (r"^Ilha de Clipperton", 0, 9999, "Propriedade do Estado francês"),
    (r"^Wallis", 1961, 9999, "Coletividade ultramarina (França)"),
    (r"^Argélia", 1848, 1961, "Colônia (departamentos franceses)"),
    (r"^Indochina Francesa \(Vietnã\)", 0, 9999, "Estado associado (União Francesa)"),
    (r"^Indochina Francesa", 1946, 9999, "Federação Indochinesa (União Francesa)"),
    (r"^(Senegal|Mauritânia|Sudão Francês|Costa do Marfim|Daomé|Alto Volta|Níger|Chade|Ubangui-Chari|Gabão|Congo|Madagascar)( \(França\))?$", 1946, 1957, "Território ultramarino (União Francesa)"),
    (r"^(Senegal|Mauritânia|Sudão Francês|Costa do Marfim|Daomé|Alto Volta|Níger|Chade|Ubangui-Chari|Gabão|Congo|Madagascar)( \(França\))?$", 1958, 1960, "República autônoma (Comunidade Francesa)"),
    (r"^Guiné Francesa", 1946, 1957, "Território ultramarino (União Francesa)"),
    (r"^(Comores|Somalilândia Francesa)", 1946, 9999, "Território ultramarino (França)"),
    (r"^Território Francês dos Afars", 0, 9999, "Território ultramarino (França)"),
    (r"^Novas Hébridas", 0, 9999, "Condomínio franco-britânico"),
    # Países Baixos
    (r"^(Aruba|Curaçao|Sint Maarten)$", 1986, 9999, "País constituinte (Reino dos Países Baixos)"),
    (r"^Países Baixos Caribenhos", 0, 9999, "Municípios especiais (Países Baixos)"),
    (r"^Guiana Holandesa", 1954, 1975, "País constituinte (Reino dos Países Baixos)"),
    # EUA
    (r"^Porto Rico", 1952, 9999, "Estado livre associado (EUA)"),
    (r"^(Porto Rico|Guam|Samoa Americana|Ilhas Virgens Americanas)", 1898, 9999, "Território não incorporado (EUA)"),
    (r"^Ilhas Marianas do Norte", 1986, 9999, "Commonwealth (EUA)"),
    (r"^Ilhas Menores Distantes", 0, 9999, "Territórios insulares (EUA)"),
    (r"^Zona do Canal", 0, 9999, "Zona do canal (EUA)"),
    # Austrália, Nova Zelândia, Chile
    (r"^Ilhas Cocos", 1955, 9999, "Território externo (Austrália)"), (r"^Ilha Christmas", 1958, 9999, "Território externo (Austrália)"), (r"^Ilha Heard", 1947, 9999, "Território externo (Austrália)"),
    (r"^Ilha Norfolk", 1946, 9999, "Território externo (Austrália)"),
    (r"^Papua e Nova Guiné", 0, 9999, "Território (Austrália; Nova Guiné sob tutela da ONU)"),
    (r"^Tokelau|^Ilhas Cook", 0, 9999, "Território (Nova Zelândia)"),
    (r"^Rapa Nui", 0, 9999, "Território (Chile)"),
    # Portugal: colônias até 1950, províncias ultramarinas de 1951 a 1974
    (r"^(Moçambique|Angola|Cabo Verde|São Tomé e Príncipe|Guiné Portuguesa|Goa|Timor Português|Macau)", 1951, 1975, "Província ultramarina (Portugal)"),
    # Espanha
    (r"^Saara Espanhol", 1958, 9999, "Província (Espanha)"), (r"^Guiné Espanhola", 1959, 1963, "Províncias (Espanha)"),
    (r"^Guiné Espanhola", 1964, 9999, "Região autônoma (Espanha)"), (r"^Marrocos Espanhol", 0, 9999, "Protetorado"),
    # Reino Unido
    (r"^(Bermudas|Ilhas Cayman|Ilhas Malvinas|Santa Helena|Ilhas Pitcairn|Ilhas Virgens Britânicas|Ilhas Turks e Caicos|Anguilla|Montserrat|Gibraltar|Território Britânico|Ilhas Geórgia)", 2002, 9999, "Território britânico ultramarino"),
    (r"^(Bermudas|Ilhas Cayman|Ilhas Malvinas|Santa Helena|Ilhas Pitcairn|Ilhas Virgens Britânicas|Ilhas Turks e Caicos|Anguilla|Montserrat|Gibraltar|Território Britânico|Ilhas Geórgia)", 1983, 2001, "Território dependente britânico"),
    (r"^(Uganda|Bechuanalândia|Suazilândia|Niassalândia|Somalilândia Britânica|Ilhas Salomão|Estados da Trégua)", 0, 9999, "Protetorado"),
    (r"^Rodésia do Norte", 1924, 9999, "Protetorado"), (r"^Rodésia do Sul", 1923, 9999, "Colônia autogovernada"),
    (r"^Rodésia( do (Norte|Sul))?$", 0, 1923, "Território da Companhia Britânica da África do Sul"),
    (r"^África Central Britânica", 1891, 9999, "Protetorado"), (r"^África Oriental Britânica", 0, 9999, "Protetorado"),
    (r"^Malásia Britânica", 1946, 9999, "Federação Malaia (protetorado britânico)"),
    (r"^Áden \(britânica\)", 0, 9999, "Colônia (administrada pela Índia Britânica)"),
    (r"^Índia Britânica", 0, 9999, "Colônia (Raj britânico)"),
    (r"^Eritreia$", 1941, 1951, "Território sob administração militar britânica"),
    # mandatos e tutela
    (r"^(Tanganica|Ruanda-Urundi|Togo|Camarões Franceses|Camarões Britânicos|Camarões|Sudoeste Africano|Ruanda|Burundi)$", 1920, 1945, "Território sob mandato (Liga das Nações)"),
    (r"^(Tanganica|Ruanda-Urundi|Togo|Camarões)( \((britânica|Bélgica|França)\))?$", 1946, 9999, "Território sob tutela (ONU)"),
    # colônias de companhias e sociedades
    (r"^Libéria \(colônia", 0, 9999, "Colônia (Sociedade Americana de Colonização)"),
    (r"^Maryland na Libéria", 0, 9999, "Colônia (Sociedade de Colonização de Maryland)"),
    (r"^Camboja \(província vietnamita", 0, 9999, "Província (Đại Nam)"),
    (r"^Basutolândia \(Colônia do Cabo\)", 0, 9999, "Território anexado à Colônia do Cabo"),
    (r"^Senegâmbia \(britânica\)", 0, 9999, "Colônia"),
]
DEP = [(re.compile(p), a, b, t) for p, a, b, t in DEP]
def dep_kind(name, y):
    for p, a, b, t in DEP:
        if a <= y <= b and p.search(name): return t
    return None
