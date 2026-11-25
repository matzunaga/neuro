#!/usr/bin/env python3
"""Pull real human neuron reconstructions (SWC) from Allen Cell Types and
NeuroMorpho.Org, thin them for the web, and write data/. Stdlib only.
Rotates its selection every ISO week so the site refreshes itself."""
import json, math, os, random, re, shutil, sys, time, datetime, urllib.request as U, urllib.parse as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
N_ALLEN, N_NM = 24, 36
EPS = 0.7          # um, simplification tolerance
UA = {"User-Agent": "neuro-site/1.0 (github.com/matzunaga/neuro)"}

def get(url, tries=4):
    for i in range(tries):
        try:
            with U.urlopen(U.Request(url, headers=UA), timeout=90) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))

def gj(url): return json.loads(get(url))

# ---------- SWC -> thinned chains ----------
def parse_swc(text):
    pts = {}
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#"): continue
        p = ln.split()
        if len(p) < 7: continue
        try:
            i, t = int(p[0]), int(p[1]); x, y, z, r = map(float, p[2:6]); par = int(p[6])
        except ValueError: continue
        pts[i] = (t, x, y, z, r, par)
    return pts

def rdp(pl, eps):
    if len(pl) < 3: return pl
    keep = [False] * len(pl); keep[0] = keep[-1] = True
    st = [(0, len(pl) - 1)]
    while st:
        a, b = st.pop()
        ax, ay, az = pl[a][:3]; bx, by, bz = pl[b][:3]
        dx, dy, dz = bx - ax, by - ay, bz - az
        L2 = dx*dx + dy*dy + dz*dz; md, mi = -1, -1
        for k in range(a + 1, b):
            px, py, pz = pl[k][0] - ax, pl[k][1] - ay, pl[k][2] - az
            if L2 == 0: d = math.sqrt(px*px + py*py + pz*pz)
            else:
                u = max(0, min(1, (px*dx + py*dy + pz*dz) / L2))
                d = math.sqrt((px-u*dx)**2 + (py-u*dy)**2 + (pz-u*dz)**2)
            if d > md: md, mi = d, k
        if md > eps:
            keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pl, keep) if k]

def thin(pts):
    soma = [v for v in pts.values() if v[0] == 1]
    if not soma: return None
    cx = sum(s[1] for s in soma) / len(soma); cy = sum(s[2] for s in soma) / len(soma); cz = sum(s[3] for s in soma) / len(soma)
    if len(soma) == 1: sr = soma[0][4]
    else: sr = sum(math.dist((s[1], s[2], s[3]), (cx, cy, cz)) for s in soma) / len(soma)
    sr = max(sr, 3.0)
    somaids = {i for i, v in pts.items() if v[0] == 1}
    kids = {}
    for i, v in pts.items():
        if i not in somaids and v[5] in pts: kids.setdefault(v[5], []).append(i)
    chains, length = [], {"dendrite": 0.0, "axon": 0.0}
    def walk(start_pt, first_children, typ_hint):
        stack = [(start_pt, c) for c in first_children]
        while stack:
            prev, cur = stack.pop()
            chain = [prev]; ctype = pts[cur][0]
            while True:
                v = pts[cur]; chain.append((v[1], v[2], v[3], v[4])); ch = kids.get(cur, [])
                if len(ch) == 1: cur = ch[0]; continue
                for c in ch: stack.append(((v[1], v[2], v[3], v[4]), c))
                break
            for a, b in zip(chain, chain[1:]):
                length["axon" if ctype == 2 else "dendrite"] += math.dist(a[:3], b[:3])
            chains.append((ctype, rdp(chain, EPS)))
    # roots: children of soma nodes, or parentless non-soma nodes
    roots = []
    for i, v in pts.items():
        if i in somaids: continue
        if v[5] in somaids or v[5] not in pts: roots.append(i)
    for r in roots:
        v = pts[r]
        start = (cx, cy, cz, v[4])
        walk(start, [r], v[0])
    out = []
    for t, pl in chains:
        flat = []
        for x, y, z, r in pl:
            flat += [round((x - cx) * 10), round((y - cy) * 10), round((z - cz) * 10), round(r * 100)]
        out.append([t if t in (2, 3, 4) else 3, flat])
    if not out: return None
    ext = max(math.sqrt(sum(c * c for c in flat[i:i+3])) / 10 for _, flat in out for i in range(0, len(flat), 4))
    return {"soma": [0, 0, 0, round(sr, 1)], "chains": out, "extent": round(ext, 1),
            "len": {k: round(v) for k, v in length.items()}, "q": [10, 100]}

# ---------- sources ----------
def pick_allen(rng, n):
    q = ("https://api.brain-map.org/api/v2/data/query.json?criteria=model::ApiCellTypesSpecimenDetail,"
         "rma::criteria,%5Bdonor__species$il'homo%20sapiens'%5D,%5Bnr__reconstruction_type$ne'null'%5D,"
         "rma::options%5Bnum_rows$eqall%5D")
    rows = gj(q)["msg"]
    rng.shuffle(rows)
    picked = []
    for c in rows:
        if len(picked) >= n: break
        sid = c["specimen__id"]
        try:
            w = gj("https://api.brain-map.org/api/v2/data/query.json?criteria=model::NeuronReconstruction,"
                   f"rma::criteria,[specimen_id$eq{sid}],rma::include,well_known_files")["msg"]
            link = w[0]["well_known_files"][0]["download_link"]
            swc = get("https://api.brain-map.org" + link).decode("latin1")
        except Exception as e:
            print("allen skip", sid, e, file=sys.stderr); continue
        d = thin(parse_swc(swc))
        if not d: continue
        layer = c.get("structure__layer")
        region = (c.get("structure__name") or "").strip('"')
        dend = (c.get("tag__dendrite_type") or "").strip()
        state = (c.get("donor__disease_state") or "").strip()
        meta = {
            "id": f"allen-{sid}", "name": c.get("specimen__name") or f"Allen {sid}",
            "source": "Allen Cell Types Database", "archive": "Allen Institute for Brain Science",
            "species": "human", "region": region + (f", layer {layer}" if layer else ""),
            "cell_type": (dend + " dendrites").capitalize() if dend else "Neuron",
            "integrity": (c.get("nr__reconstruction_type") or "").capitalize() + " reconstruction",
            "tissue": ("Neurosurgical tissue" + (f" ({state})" if state else "")),
            "link": f"https://celltypes.brain-map.org/experiment/morphology/{sid}",
            "pub": None,
            "credit": "Allen Cell Types Database. © Allen Institute for Brain Science. celltypes.brain-map.org",
        }
        picked.append((meta, d)); time.sleep(0.3)
    return picked

def pick_nm(rng, n):
    base = "https://neuromorpho.org/api/neuron/select?q=species:human&size=500&page="
    first = gj(base + "0")
    pages, rows = first["page"]["totalPages"], list(first["_embedded"]["neuronResources"])
    for p in range(1, pages):
        try: rows += gj(base + str(p))["_embedded"]["neuronResources"]
        except Exception as e: print("nm page", p, e, file=sys.stderr)
    good = [r for r in rows if r["archive"] != "Allen Cell Types"
            and (r.get("physical_Integrity") or "").startswith("Dendrites Complete")
            and r.get("brain_region") and r.get("cell_type")
            and not re.search(r"ipsc|stem|progenitor|derived|organoid|cultur|xenograft|transplant",
                              " ".join(r["cell_type"] + r["brain_region"] + list(r.get("experiment_condition") or []) + [r.get("note") or "", r.get("protocol") or ""]), re.I)]
    buckets = {}
    for r in good: buckets.setdefault((r["archive"], r["cell_type"][0], r["brain_region"][0]), []).append(r)
    keys = sorted(buckets); rng.shuffle(keys)
    pool = []
    for k in keys:
        rng.shuffle(buckets[k]); pool.append(buckets[k][0])   # one per bucket first for variety
    rest = [r for k in keys for r in buckets[k][1:]]; rng.shuffle(rest)
    picked = []
    for r in pool + rest:
        if len(picked) >= n: break
        name, arch = r["neuron_name"], r["archive"]
        url = ("https://neuromorpho.org/dableFiles/" + P.quote(arch.lower()) + "/CNG%20version/" + P.quote(name) + ".CNG.swc")
        try: swc = get(url).decode("latin1")
        except Exception as e:
            print("nm skip", name, e, file=sys.stderr); continue
        d = thin(parse_swc(swc))
        if not d or d["len"]["dendrite"] < 300: continue
        meta = {
            "id": f"nm-{r['neuron_id']}", "name": name, "source": "NeuroMorpho.Org", "archive": arch.replace("_", " "),
            "species": "human", "region": ", ".join(r["brain_region"]), "cell_type": ", ".join(r["cell_type"]),
            "integrity": r.get("physical_Integrity"), "tissue": None,
            "link": "https://neuromorpho.org/neuron_info.jsp?neuron_name=" + P.quote(name),
            "pub": (("https://doi.org/" + r["reference_doi"][0]) if r.get("reference_doi") else
                    (("https://pubmed.ncbi.nlm.nih.gov/" + r["reference_pmid"][0]) if r.get("reference_pmid") else None)),
            "credit": "NeuroMorpho.Org (Ascoli, Donohue & Halavi, J Neurosci 2007), archive: " + arch.replace("_", " "),
        }
        picked.append((meta, d)); time.sleep(0.3)
    return picked

def main():
    wk = datetime.date.today().isocalendar()
    rng = random.Random(f"{wk[0]}-{wk[1]}")
    allen = pick_allen(rng, N_ALLEN)
    nm = pick_nm(rng, N_NM)
    items = allen + nm
    if len(items) < 10: sys.exit("too few neurons fetched; keeping existing data")
    rng.shuffle(items)
    tmp = OUT + ".new"; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp + "/n")
    index = []
    for meta, d in items:
        slug = re.sub(r"[^a-zA-Z0-9_-]", "_", meta["id"])
        with open(f"{tmp}/n/{slug}.json", "w") as f: json.dump(d, f, separators=(",", ":"))
        meta["file"] = f"data/n/{slug}.json"; meta["dendrite_um"] = d["len"]["dendrite"]
        index.append(meta)
    with open(tmp + "/index.json", "w") as f:
        json.dump({"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"), "week": f"{wk[0]}-W{wk[1]:02d}", "neurons": index}, f, separators=(",", ":"))
    shutil.rmtree(OUT, ignore_errors=True); os.rename(tmp, OUT)
    print("wrote", len(index), "neurons", sum(os.path.getsize(f"{OUT}/n/{x}") for x in os.listdir(OUT + "/n")) // 1024, "KB")

if __name__ == "__main__": main()
