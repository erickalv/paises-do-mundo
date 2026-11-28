"""Líder do ano no modo História (situação em 31/dez).

Fontes (governante de fato, "effective leader"):
- Archigos 4.1 (Goemans, Gleditsch e Chiozza), 1875–2015
- REIGN (OEF Research), 1950–ago/2021, para os anos depois de 2015 e países fora do Archigos
- tools/leaders/recent.json: 2021–2026, conferido no Wikipedia
Saída: android/app/src/main/assets/leaders.json = {nome da unidade: [[ano0, ano1, líder], ...]}
Uso: python3 gen-hist-leaders.py ARCHIGOS.tsv REIGN_leader_list.csv codelist.csv
"""
import csv, json, re, sys, urllib.parse, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/leaders")
import kinds
ARCH, REIGN, CODES = sys.argv[1:4]
ROOT = os.path.dirname(os.path.abspath(__file__)) + "/.."
A = ROOT + "/android/app/src/main/assets/"
hist = json.load(open(A + "history.json"))
ents = {e["id"]: e for e in json.load(open(A + "entities.json"))}
Y0, Y1 = hist["open"], hist["to"]

def clean(s):
    s = re.sub(r"\s*\((acting|interim|f|\d+(st|nd|rd|th) time)\)", "", s)
    s = re.sub(r"\s*\($", "", s.strip()).strip()
    s = re.sub(r" (and|&) ", " e ", s)
    if s.count(", ") == 1 and not re.search(r"\b(Jr|Sr)\b", s):
        a, b = s.split(", "); s = b + " " + a
    return s

# ---- mandatos por país (letras do COW) ----
SRC = {"A": {}, "R": {}, "W": {}}
FEMALE = set()
AB2CC = {}
FULL = set()
for x in csv.DictReader(open(ARCH), delimiter="\t"):
    nm = x["leader"]
    if x["dbpedia.uri"] not in ("NA", ""):
        nm = urllib.parse.unquote(x["dbpedia.uri"].rsplit("/", 1)[1]).replace("_", " ")
        nm = re.sub(r"\s*\(.*?\)", "", nm)
        FULL.add(nm)
    else:
        nm = clean(nm)
    if x["gender"] == "F": FEMALE.add(nm)
    SRC["A"].setdefault(x["idacr"], []).append((x["startdate"], x["enddate"], nm))
def at(src, c, dd):
    best = None
    for s, e, nm in SRC[src].get(c, []):
        if s <= dd <= e and (best is None or s >= best[0]): best = (s, nm)
    return best[1] if best else None
for x in csv.DictReader(open(REIGN, encoding="utf-8", errors="replace")):
    if not x["syear"]: continue
    c = x["stateabb"]
    d = "%s-%02d-%02d" % (x["syear"], int(x["smonth"] or 1), int(x["sdate"] or 1))
    e = "%s-%02d-31" % (x["eyear"], int(x["emonth"] or 12)) if x["eyear"] else "2021-08-31"
    nm = clean(x["leader"])
    AB2CC[c] = int(x["ccode"])
    if x["gender"] == "0": FEMALE.add(nm)
    if d <= "2015-12-31" <= e: nm = at("A", c, "2015-12-31") or nm  # mesmo líder: nome completo do Archigos
    SRC["R"].setdefault(c, []).append((d, e, nm))
GOV = kinds.load_reign(os.path.join(os.path.dirname(REIGN), "REIGN_2021_8.csv"))
def gov(c, name, y):
    """regime REIGN em dez/y (1950–2021), com as mudanças posteriores conferidas"""
    fx = kinds.lookup(kinds.REGIME_FIX, name, y)
    if fx: return fx
    c = RALIAS.get(c, c)
    if not c or c not in AB2CC or y < 1950: return None
    cc = AB2CC[c]
    for yy in range(min(y, 2021), 1949, -1):
        if (cc, yy) in GOV: return GOV[(cc, yy)]
    return None
RECENT = ROOT + "/tools/leaders/recent.json"
rec = json.load(open(RECENT)) if os.path.exists(RECENT) else {}
for c, lst in rec.items():
    if c.startswith("_"): continue
    SRC["W"][c] = [(d, "2099-12-31", nm) for d, nm in lst]

RALIAS = {"GFR": "GMY", "SER": "YUG", "RUM": "ROM", "FJI": "FIJ"}  # letras do Archigos -> REIGN
def leader(c, y):
    """quem governava em 31/dez/y"""
    dd = "%d-12-31" % y
    if y <= 2015 and c in SRC["A"]: return at("A", c, dd)
    if y <= 2020: return at("R", RALIAS.get(c, c), dd)
    return at("W", c, dd)

iso2cow = {}
for x in csv.DictReader(open(CODES)):
    if x["iso3c"] and x["cowc"]: iso2cow[x["iso3c"]] = x["cowc"]
iso2cow.update({"UNK": "KOS", "DEU": "GFR", "SRB": "SER", "VNM": "DRV", "YEM": "YEM", "SSD": "SSD"})
ROWCOW = {"SUN": "RUS", "YUG1": "YUG", "YUG2": "YUG", "YUG3": "YUG", "SCG": "YUG", "SRB06": "SER", "CSK": "CZE", "FRG": "GFR", "GDR49": "GDR", "GDR": "GDR",
          "ROC": "CHN", "UAR": "EGY"}
ERA = json.load(open(ROOT + "/tools/leaders/era-names.json"))
BAD = re.compile(r"ocupa|protetorado|mandato|fantoche|colônia|Liga das Nações|guerra civil|em disputa|adm\.|anexad|dividida|libertado|Estado cliente|parcialmente|\((britânic|francês|frances|holandes|portugu|espanhol|belga|italian|japon|americ|dinamarq|EUA|Japão|Reino Unido|França)")

# ---- antes de 1875: listas de governantes conferidas no Wikipedia (tools/leaders/old/*.txt) ----
OLDDIR = ROOT + "/tools/leaders/old/"
OLDR = {}  # STATE -> [(início, fim, nome, cargo)]
for fn in sorted(os.listdir(OLDDIR)):
    if not fn.endswith(".txt") or fn == "map.txt": continue
    for ln in open(OLDDIR + fn, encoding="utf-8"):
        ln = ln.strip()
        if not ln or ln.startswith("#"): continue
        st, a, b, nm, t = ln.split("|")
        OLDR.setdefault(st, []).append((a, b or "9999", nm, t))
OLDMAP = []
for ln in open(OLDDIR + "map.txt", encoding="utf-8"):
    ln = ln.strip()
    if not ln or ln.startswith("#"): continue
    st, rest = ln.split("|", 1); rx, a, b = rest.rsplit("|", 2)
    OLDMAP.append((st, re.compile(rx + "$"), int(a), int(b)))
def oldlead(name, y):
    """quem governava em 31/dez/y, pelas listas antigas: (nome, cargo)"""
    dd = "%d-12-31" % y
    for st, rx, a, b in OLDMAP:
        if a <= y <= b and rx.match(name):
            best = None
            for s0, e0, nm, t in OLDR.get(st, []):
                if s0 <= dd < e0 and (best is None or s0 >= best[0]): best = (s0, nm, t)
            return best[1:] if best else None
    return None
OLDNAMES = set()
OLDC = []  # (unidade, ano, cargo)

TYPES = []  # (name, own, y, cow, lon)
TYPE_FIX = {"Antártida": None, "Bir Tawil": "Terra não reivindicada", "Palestina": "Estado parcialmente reconhecido",
            "Kosovo": "Estado parcialmente reconhecido", "Taiwan": "Estado parcialmente reconhecido", "Rapa Nui (Chile)": "Território dependente"}
DOMINION = {"Canadá": 1930, "União Sul-Africana": 1930, "Estado Livre Irlandês": 1930, "Austrália": 1938, "Nova Zelândia": 1946,
            "Domínio da Nova Zelândia": 9999, "Domínio da Terra Nova": 9999}
def ttype(name, own, y):
    if name in TYPE_FIX: return TYPE_FIX[name]
    n = name.lower()
    if "fantoche" in n or "estado cliente" in n: return "Estado fantoche"
    if "ocupa" in n or "anexad" in n or "libertado" in n: return "Território ocupado"
    if "protetorado" in n: return "Protetorado"
    if "mandato" in n: return "Território sob mandato"
    if "liga das nações" in n: return "Território da Liga das Nações"
    if "fiduciário" in n or "tutela" in n: return "Território sob tutela"
    if "guerra civil" in n: return "País em guerra civil"
    if "disputa" in n: return "Território disputado"
    if "adm." in n or "administração" in n: return "Território administrado"
    if "estado associado" in n: return "Estado associado"
    if own:
        o = own.lower()
        if o.startswith("disputad"): return "Território disputado"
        if o.startswith("associad"): return "Estado associado"
        return "Território dependente"
    if re.search(r"\((britânic|francês|francesa|holandês|holandesa|portugu|espanhol|belga|italian|japon|american|dinamarq|colônia)", n): return "Território dependente"
    if name in DOMINION and y <= DOMINION[name]: return "Domínio britânico"
    return "País independente"

out = {}
cargo = {}
FEMALE_REC = set(rec.get("_mulheres", [])) if isinstance(rec.get("_mulheres"), list) else set()
CIN = []  # (unidade, ano, cow): o cargo é calculado depois, com o nome final do líder
def addc(name, y, nm, c): CIN.append((name, y, c, nm in FEMALE or nm in FEMALE_REC))
def mkcargo():
    for name, y, t in OLDC:
        lst = cargo.setdefault(name, [])
        if lst and lst[-1][2] == t and lst[-1][1] == y - 1: lst[-1][1] = y
        else: lst.append([y, y, t])
    for name, y, c, fem in CIN:
        nm = next((r[2] for r in out.get(name, []) if r[0] <= y <= r[1]), None)
        if not nm: continue
        g = gov(c, name, y)
        t = kinds.title(name, y, nm, fem or nm in FEMALE or nm in FEMALE_REC, g, kinds.form_of(name, y))
        lst = cargo.setdefault(name, [])
        if lst and lst[-1][2] == t and lst[-1][1] == y - 1: lst[-1][1] = y
        else: lst.append([y, y, t])
REGNAL = {"Alexander": "Alexandre", "Charles": "Carlos", "Constantine": "Constantino", "Farouk": "Faruk"}
def add(name, y, nm):
    # monarcas no formato da DBpedia ("Carol II of Romania"): tira o país e traduz o nome
    m = re.match(r"^(.+?)((?: [IVX]+)?) of [A-Z][\w ]+$", nm)
    if m: nm = REGNAL.get(m.group(1), m.group(1)) + m.group(2)
    lst = out.setdefault(name, [])
    if lst and lst[-1][2] == nm and lst[-1][1] == y - 1: lst[-1][1] = y
    else: lst.append([y, y, nm])

for y in range(Y0, Y1 + 1):
    if y < hist["modernFrom"]:
        era = next(e for e in hist["eras"] if e["y0"] <= y <= e["y1"])
        for u in era["u"]:
            name = u[0]
            if name: TYPES.append((name, u[5] if len(u) > 5 else None, y, ERA.get(name), (u[2], u[3])))
            if not name or (len(u) > 5 and u[5]): continue
            if y < 1875:
                o = oldlead(name, y)
                if o:
                    add(name, y, o[0]); OLDNAMES.add(o[0]); OLDC.append((name, y, o[1])); continue
            c = ERA.get(name)
            if not c: continue
            nm = leader(c, y)
            if nm: add(name, y, nm); addc(name, y, out[name][-1][2], c)
        continue
    rows = [r for r in hist["units"] if r[3] <= y <= r[4]]
    inrow = set(m for r in rows for m in r[5])
    units = []
    for r in rows:
        own = r[7] if len(r) > 7 else None
        m0 = r[5][0].split("~")[0]
        name = r[1] or ents[m0]["n"]
        units.append((name, own, ROWCOW.get(r[0]) or (None if "~" in r[5][0] else iso2cow.get(m0))))
    for k, e in ents.items():
        if k in inrow: continue
        units.append((e["n"], e.get("o"), iso2cow.get(k)))
    for name, own, c in units:
        TYPES.append((name, own, y, c, (None, None)))
        if own or not c or BAD.search(name): continue
        nm = leader(c, y)
        if nm: add(name, y, nm); addc(name, y, out[name][-1][2], c)
FIX = json.load(open(ROOT + "/tools/leaders/fullnames.json"))
todo = {}
for k, v in out.items():
    for r in v:
        key = k + "|" + r[2]
        yk = [int(z.rsplit("|", 1)[1]) for z in FIX if z.startswith(key + "|") and int(z.rsplit("|", 1)[1]) <= r[0]]
        if yk: r[2] = FIX[key + "|" + str(max(yk))]
        elif key in FIX: r[2] = FIX[key]
        elif r[2] not in FULL and r[2] not in OLDNAMES: todo.setdefault(key, []).append("%d-%d" % (r[0], r[1]))
for k, v in list(out.items()):  # junta trechos que ficaram iguais
    m = []
    for r in v:
        if m and m[-1][2] == r[2] and m[-1][1] == r[0] - 1: m[-1][1] = r[1]
        else: m.append(r)
    out[k] = m
mkcargo()
for v in cargo.values(): v.sort()
if len(sys.argv) > 4: open(sys.argv[4], "w").write("\n".join(k + " " + ",".join(v) for k, v in sorted(todo.items())))
typ = {}
COLONIAL = re.compile(r"^(Espanha|Portugal|França|Reino da França|Reino Unido|Reino da Grã-Bretanha|Reino da Inglaterra|Holanda|República das Sete Províncias Unidas|"
                      r"República Holandesa|Reino Unido dos Países Baixos|Países Baixos|Dinamarca|Suécia|Bélgica|Império Alemão|Itália|Reino da Itália|Japão|Império do Japão|"
                      r"Estados Unidos|Commonwealth da Inglaterra|República Batava|Reino da Holanda|Colônia do Cabo|Império Russo|Brandemburgo-Prússia|Courlândia|Austrália|Nova Zelândia|África do Sul|União Sul-Africana)")
CADJ = re.compile(r"\((britânic|francês|francesa|holandês|holandesa|portugu|espanhol|belga|italian|japon|american|dinamarq|colônia)", re.I)
VASSAL = re.compile(r"vassal|tribut|feudo|suserania|sob proteção", re.I)
def ktype(name, own, y, c, ll):
    lon, lat = ll
    t = ttype(name, own, y)
    if t in ("País independente", "Domínio britânico"):
        if t == "Domínio britânico": return t
        return kinds.kind(name, None, y, gov(c, name, y))
    if t == "Território dependente":
        d = kinds.dep_kind(name, y)
        if d: return d
        f = kinds.form_of(name, y, False)
        if VASSAL.search(name): return "Estado vassalo" + (f" ({f.lower()})" if f and f.split(" ")[0] in ("Reino", "Principado", "Canato", "Sultanato", "Emirado", "Ducado", "Beilhique") else "")
        if "união pessoal" in name: return "União pessoal"
        if f and f not in ("Território dependente", "Reino", "Principado", "Ducado", "Condado", "Grão-ducado", "Império", "República"): return f
        europe = lon is not None and -25 <= lon <= 45 and lat >= 34
        colon = (own and COLONIAL.match(own)) or (not own and CADJ.search(name))
        if colon and not europe and (lon is not None or y >= 1946): return "Colônia"
        if own == "Império Otomano": return "Eialete (Império Otomano)"
        if f: return f + " (sob " + own + ")" if own and not own[0].islower() else f
    return t
for name, own, y, c, ll in TYPES:
    t = ktype(name, own, y, c, ll)
    if t is None: continue
    lst = typ.setdefault(name, [])
    if lst and lst[-1][2] == t and lst[-1][1] >= y - 1: lst[-1][1] = max(lst[-1][1], y)
    elif not (lst and lst[-1][2] == t and lst[-1][1] >= y): lst.append([y, y, t])
json.dump({"l": out, "t": typ, "c": cargo}, open(A + "leaders.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("unidades com líder:", len(out), "trechos:", sum(len(v) for v in out.values()))
