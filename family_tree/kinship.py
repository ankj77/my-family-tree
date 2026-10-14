from typing import List, Optional

UP = {"father", "mother", "parent"}
DOWN = {"son": "brother", "daughter": "sister", "child": "sibling"}

HINDI = {
    "father": "पिता जी", "mother": "माता जी", "son": "बेटा", "daughter": "बेटी",
    "brother": "भाई", "sister": "बहन", "husband": "पति", "wife": "पत्नी",
    "father's father": "दादा जी", "father's mother": "दादी जी",
    "mother's father": "नाना जी", "mother's mother": "नानी जी",
    "father's brother": "चाचा / ताऊ जी", "father's brother's wife": "चाची / ताई जी",
    "father's sister": "बुआ जी", "father's sister's husband": "फूफा जी",
    "mother's brother": "मामा जी", "mother's brother's wife": "मामी जी",
    "mother's sister": "मौसी जी", "mother's sister's husband": "मौसा जी",
    "father's brother's son": "चचेरा भाई", "father's brother's daughter": "चचेरी बहन",
    "father's sister's son": "फुफेरा भाई", "father's sister's daughter": "फुफेरी बहन",
    "mother's brother's son": "ममेरा भाई", "mother's brother's daughter": "ममेरी बहन",
    "mother's sister's son": "मौसेरा भाई", "mother's sister's daughter": "मौसेरी बहन",
    "brother's wife": "भाभी जी", "sister's husband": "जीजा जी",
    "wife's brother": "साला", "wife's sister": "साली",
    "husband's brother": "देवर / जेठ जी", "husband's sister": "ननद",
    "wife's father": "ससुर जी", "husband's father": "ससुर जी",
    "wife's mother": "सास जी", "husband's mother": "सास जी",
    "son's son": "पोता", "son's daughter": "पोती",
    "daughter's son": "नाती", "daughter's daughter": "नातिन",
    "brother's son": "भतीजा", "brother's daughter": "भतीजी",
    "sister's son": "भांजा", "sister's daughter": "भांजी",
    "daughter's husband": "दामाद", "son's wife": "बहू",
}


def words(steps: List[dict]) -> List[str]:
    rels = [s["rel"] for s in steps[1:]]
    out, i = [], 0
    while i < len(rels):
        if rels[i] in UP and i + 1 < len(rels) and rels[i + 1] in DOWN:
            out.append(DOWN[rels[i + 1]])
            i += 2
        else:
            out.append(rels[i])
            i += 1
    return out


def describe(steps: Optional[List[dict]]) -> dict:
    path = "'s ".join(words(steps or []))
    if not path:
        return {"en": None, "hi": None}
    return {"en": path, "hi": HINDI.get(path)}
