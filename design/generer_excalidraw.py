"""Génère les schémas Excalidraw du projet (modifiables sur excalidraw.com : Menu > Ouvrir).
python design/generer_excalidraw.py  ->  design/fil-du-projet.excalidraw, design/architecture.excalidraw
"""
import json
import random
from pathlib import Path

ICI = Path(__file__).parent
random.seed(20261104)
COUL = {"jaune": "#fff3bf", "bleu": "#d0ebff", "violet": "#e5dbff", "orange": "#ffe8cc", "vert": "#d3f9d8",
        "gris": "#e9ecef", "sarcelle": "#c3fae8", "rose": "#ffdeeb", "blanc": "#ffffff"}


class Schema:
    def __init__(self):
        self.el = []

    def _base(self, t, x, y, w, h, **k):
        e = {"id": f"{t[:3]}{len(self.el)}", "type": t, "x": x, "y": y, "width": w, "height": h, "angle": 0,
             "strokeColor": k.get("trait", "#1e1e1e"), "backgroundColor": k.get("fond", "transparent"),
             "fillStyle": "solid", "strokeWidth": k.get("epaisseur", 2), "strokeStyle": k.get("style", "solid"),
             "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None, "roundness": k.get("arrondi"),
             "seed": random.randint(1, 2**31), "version": 1, "versionNonce": random.randint(1, 2**31),
             "isDeleted": False, "boundElements": [], "updated": 1, "link": None, "locked": False}
        self.el.append(e)
        return e

    def texte(self, x, y, w, h, txt, taille=20, conteneur=None, align="center", couleur="#1e1e1e"):
        # une ligne = un élément : rendu identique dans toutes les versions d'Excalidraw
        for i, ligne in enumerate(txt.split(chr(10))):
            if not ligne:
                continue
            e = self._base("text", x, y + i * taille * 1.25, w, taille * 1.25, trait=couleur)
            e.update({"text": ligne, "fontSize": taille, "fontFamily": 1, "textAlign": align,
                      "verticalAlign": "top", "containerId": None, "originalText": ligne,
                      "lineHeight": 1.25, "baseline": int(taille * 0.9), "autoResize": True})
        return e

    def boite(self, x, y, w, h, txt, fond="blanc", taille=18, style="solid", trait="#1e1e1e"):
        r = self._base("rectangle", x, y, w, h, fond=COUL.get(fond, fond), style=style, trait=trait, arrondi={"type": 3})
        lignes = txt.count("\n") + 1
        self.texte(x + 10, y + h / 2 - lignes * taille * 0.625, w - 20, lignes * taille * 1.25, txt, taille)
        return r

    def fleche(self, a, b, label=None, style="solid", vertical=False, montant=False):
        if montant:
            x1, y1 = a["x"] + a["width"] / 2, a["y"]
            x2, y2 = b["x"] + b["width"] / 2, b["y"] + b["height"]
        elif vertical:
            x1, y1 = a["x"] + a["width"] / 2, a["y"] + a["height"]
            x2, y2 = b["x"] + b["width"] / 2, b["y"]
        else:
            x1, y1 = a["x"] + a["width"], a["y"] + a["height"] / 2
            x2, y2 = b["x"], b["y"] + b["height"] / 2
        e = self._base("arrow", x1, y1, x2 - x1, y2 - y1, style=style)
        e.update({"points": [[0, 0], [x2 - x1, y2 - y1]], "lastCommittedPoint": None,
                  "startBinding": {"elementId": a["id"], "focus": 0, "gap": 6},
                  "endBinding": {"elementId": b["id"], "focus": 0, "gap": 6},
                  "startArrowhead": None, "endArrowhead": "arrow", "elbowed": False})
        a["boundElements"].append({"type": "arrow", "id": e["id"]})
        b["boundElements"].append({"type": "arrow", "id": e["id"]})
        if label:
            if x1 == x2 or vertical or montant:
                self.texte((x1 + x2) / 2 + 12, (y1 + y2) / 2 - 10, 200, 20, label, 14, align="left", couleur="#495057")
            else:
                self.texte((x1 + x2) / 2 - 110, (y1 + y2) / 2 - 26, 220, 20, label, 14, couleur="#495057")
        return e

    def ecrire(self, nom):
        doc = {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com", "elements": self.el,
               "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None}, "files": {}}
        (ICI / f"{nom}.excalidraw").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------------------------------------------------------------- 1. Fil du projet (vue métier)
s = Schema()
s.texte(40, 20, 1400, 40, "Assurance IARD : du besoin métier à la décision du lundi", 32, align="left")
s.boite(40, 90, 2100, 70, "Question métier : où se forme l'écart de S/P, que va-t-il se passer si l'on ne fait rien, et que lancer cette semaine ?", "jaune", 22, trait="#e8590c")
etapes = [
    ("1. LE BESOIN\n\n« Le S/P dérive :\npourquoi ? »\n\nS/P 70,6 %\npour une cible de 68 %", "jaune", "Acteurs : direction technique,\nindemnisation, prévention"),
    ("2. DES CHIFFRES FIABLES\n\n« Peut-on s'y fier ? »\n\n12 KPI gouvernés\n8 contrôles de chargement", "bleu", "Outil : Qlik Sense\n· script de chargement"),
    ("3. COMPRENDRE\n\n« Où se forme l'écart ? »\n\n813 800 € d'écart\ndégâts des eaux 39,8 %", "bleu", "Outil : Qlik Sense\n· 12 volets métier"),
    ("4. ANTICIPER\n\n« Que va-t-il arriver ? »\n\n3 modèles backtestés\nfourchette à 3 mois", "violet", "Outil : Python\n· scikit-learn · 5 000 tirages"),
    ("5. AGIR\n\n« Que lancer lundi ? »\n\n5 actions, 1 responsable\nchacune, tâches classées", "orange", "Outil : volet 13 Anticiper\n· copilote volet 14"),
    ("6. APPRENDRE\n\n« L'action a-t-elle\nmarché ? »\n\ngroupe témoin\navant de généraliser", "vert", "Outil : briefing hebdomadaire\n· agent de veille"),
]
prec = None
for i, (txt, fond, outil) in enumerate(etapes):
    x = 40 + i * 355
    b = s.boite(x, 210, 300, 270, txt, fond, 19)
    s.boite(x + 20, 505, 260, 64, outil, "gris", 14, "dashed", "#868e96")
    if prec:
        s.fleche(prec, b)
    prec = b
s.texte(40, 610, 800, 30, "Garanties de confiance, en continu", 22, align="left")
for i, g in enumerate(["Gouvernance\nune définition, une règle et un propriétaire\npar KPI · fiche par modèle",
                       "Lecture seule\nle copilote ne modifie ni prime,\nni provision, ni décision",
                       "Traçabilité\nchaque chiffre cité avec l'outil\nou le document source",
                       "L'humain décide\nscore = probabilité, projection = fourchette,\nefficacité = hypothèse à mesurer"]):
    s.boite(40 + i * 530, 650, 500, 100, g, "gris", 16, "dashed", "#868e96")
s.ecrire("fil-du-projet")

# ---------------------------------------------------------------- 2. Architecture
a = Schema()
a.texte(40, 20, 1200, 40, "Architecture : Qlik Sense → serveur MCP → LLM, en lecture seule", 32, align="left")
gen = a.boite(40, 110, 300, 120, "Données synthétiques\n12 000 contrats\n418 863 mouvements\n(générateurs Python)", "gris", 17)
qlik = a.boite(460, 90, 380, 160, "Qlik Sense Desktop\nscript de chargement · 14 volets\nextension veoriax-labs\n(cartes IA, éventail, copilote)", "bleu", 17)
mod = a.boite(40, 330, 300, 140, "Modèles Python\ndégâts des eaux · coût final\nimpayés GLI · plan d'action\n5 000 tirages", "violet", 17)
csv = a.boite(460, 340, 380, 120, "Sorties IA et gouvernance\nia_*.csv · gouv_*.csv\nchargées dans Qlik", "violet", 17)
mcp = a.boite(980, 90, 380, 160, "Serveur MCP Node.js\n7 outils · lecture seule\nKPI, écart, scores, plan,\ntâches, gouvernance, RAG", "sarcelle", 17)
rag = a.boite(900, 340, 250, 120, "Mini RAG (BM25)\ncatalogue KPI · 47 règles\nfiches modèles · charte IA", "sarcelle", 17)
pont = a.boite(1500, 90, 380, 160, "Pont local 127.0.0.1:8787\nroutage d'intention\nréponses calculées\nagent de veille hebdomadaire", "orange", 17)
llm = a.boite(1500, 340, 380, 120, "LLM local qwen2.5:3b (Ollama)\ncomprend la question · rédige\ndepuis les documents, chiffres contrôlés", "rose", 16)
cc = a.boite(1200, 560, 260, 100, "Claude Code\nclient MCP pour l'investigation", "rose", 17)
web = a.boite(460, 560, 380, 100, "Version web (GitHub Pages)\nmêmes chiffres, sans licence", "vert", 17)
a.fleche(gen, qlik, "chargement")
a.fleche(gen, mod, "historique", vertical=True)
a.fleche(mod, csv, "scores")
a.fleche(csv, qlik, "rechargement", montant=True)
a.fleche(qlik, mcp, "Engine API")
a.fleche(mcp, pont, "outils")
a.fleche(mcp, rag, vertical=True)
a.fleche(pont, llm, vertical=True)
a.fleche(mcp, cc, "stdio", vertical=True)
a.fleche(csv, web, "construire_site · data.js", vertical=True)
cop = a.boite(1500, 560, 380, 100, "Copilote du volet 14\nchaque réponse affiche ses outils\net ses sources", "orange", 16)
a.fleche(llm, cop, "réponse tracée", vertical=True)
a.ecrire("architecture")
print("ok")
