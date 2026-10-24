"""Select source cuts using parser dependencies and measured width.

Executed after subtitle_nlp.py definitions (without its main block).
No text rewriting, model downloads, or target-language heuristics.
"""
import unicodedata


def display_width(text):
    return sum(0 if unicodedata.combining(c) or unicodedata.category(c) == "Cf"
               else 2 if unicodedata.east_asian_width(c) in {"W", "F"} else 1 for c in text)


def choose_source_options(text, minimum, soft, nlp, limit=3):
    doc = nlp(text)
    nodes = [0]
    penalties = {0: 0}
    for i, token in enumerate(doc):
        cut = token.idx
        if not cut or boundary_issue(text, [text[:cut].strip(), text[cut:].strip()], lambda _: doc):
            continue
        if i and doc[i-1].is_punct:
            penalty = 0
        elif token.dep_ in {"cc", "mark", "advcl", "ccomp", "relcl"}:
            penalty = 0
        elif token.pos_ == "ADP":
            penalty = 400 if token.head.pos_ in {"VERB", "AUX"} else 30
        elif token.dep_ == "aux" and token.head.i > token.i:
            penalty = 40
        else:
            penalty = 240
        nodes.append(cut)
        penalties[cut] = penalty
    nodes.append(len(text))
    best = {(0, 0): [(0, [])]}
    for b in range(1, len(nodes)):
        for a in range(b):
            piece = text[nodes[a]:nodes[b]].strip()
            width = display_width(piece)
            if not piece or width > 75:
                continue
            for count in range(0, min(30, b)):
                priors = best.get((a, count))
                if priors is None:
                    continue
                key = (b, count+1)
                candidates = list(best.get(key, []))
                for prior in priors:
                    cost = prior[0] + 100 + penalties.get(nodes[a], 0) + .003 * (soft-width)**2
                    if width < 12:
                        cost += 150
                    candidates.append((cost, prior[1] + [piece]))
                candidates.sort(key=lambda value: value[0])
                best[key] = candidates[:limit]
    valid = sorted((value for (end, count), values in best.items()
                    if end == len(nodes)-1 and count >= max(2, minimum)
                    for value in values), key=lambda value: value[0])
    # Keep the candidate set small: alignment can consider target-language order
    # without inventing source cuts or making another source-only model call.
    result = []
    for _, parts in valid:
        if parts not in result:
            result.append(parts)
        if len(result) == limit:
            break
    return result


def choose_source_parts(text, minimum, soft, nlp):
    options = choose_source_options(text, minimum, soft, nlp)
    return options[0] if options else []


def cut_main():
    request = json.load(sys.stdin)
    prefix = MODELS.get(request["language"])
    if prefix is None:
        return {"unavailable": "unsupported_language"}
    try:
        import spacy
    except ImportError:
        return {"unavailable": "spacy_missing"}
    installed = set(spacy.util.get_installed_models())
    model = next((prefix+"_"+size for size in ("md", "sm", "lg") if prefix+"_"+size in installed), None)
    if model is None:
        return {"unavailable": "language_model_missing"}
    nlp = spacy.load(model, exclude=["ner"])
    if not nlp.has_pipe("parser"):
        return {"unavailable": "dependency_parser_missing"}
    options = [choose_source_options(r["source"], r["minimum_pieces"], request["soft"], nlp)
               for r in request["requests"]]
    return {"model": model, "options": options}


if __name__ == "__main__":
    json.dump(cut_main(), sys.stdout, ensure_ascii=False)
