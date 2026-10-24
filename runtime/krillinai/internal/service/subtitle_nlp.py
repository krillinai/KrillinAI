"""spaCy subtitle boundaries; JSON stdin/stdout, no runtime model downloads.

Adapted from VideoLingo's punctuation/comma/connector NLP stages (Apache-2.0).
Unlike its text reconstruction, every part is sliced from the original string.
"""
import json
import sys


MODELS = {
    "en": "en_core_web", "zh_cn": "zh_core_web", "zh_tw": "zh_core_web",
    "yue": "zh_core_web", "ja": "ja_core_news", "ko": "ko_core_news",
    "de": "de_core_news", "fr": "fr_core_news", "es": "es_core_news",
    "it": "it_core_news", "pt": "pt_core_news", "ru": "ru_core_news",
    "uk": "uk_core_news", "nl": "nl_core_news", "sv": "sv_core_news",
    "da": "da_core_news", "fi": "fi_core_news", "pl": "pl_core_news",
    "el": "el_core_news", "ro": "ro_core_news", "mk": "mk_core_news",
}
CONNECTORS = {
    "en": {"that", "which", "where", "when", "because", "but", "and", "or"},
    "zh": {"因为", "所以", "但是", "而且", "虽然", "如果", "即使", "尽管"},
    "ja": {"けれども", "しかし", "だから", "それで", "ので", "のに", "ため"},
    "de": {"dass", "welche", "wo", "wann", "weil", "aber", "und", "oder"},
    "fr": {"que", "qui", "où", "quand", "parce que", "mais", "et", "ou"},
    "es": {"que", "cual", "donde", "cuando", "porque", "pero", "y", "o"},
    "it": {"che", "quale", "dove", "quando", "perché", "ma", "e", "o"},
    "pt": {"que", "onde", "quando", "porque", "mas", "e", "ou"},
    "ru": {"что", "который", "где", "когда", "потому что", "но", "и", "или"},
    "uk": {"що", "який", "де", "коли", "бо", "але", "і", "або"},
    "ko": {"하지만", "그러나", "그래서", "그런데"},
}


def valid_clause(tokens):
    return (any(t.dep_ in {"nsubj", "nsubjpass"} or t.pos_ == "PRON" for t in tokens)
            and any(t.pos_ in {"VERB", "AUX"} for t in tokens))


def split_commas(text, nlp):
    doc = nlp(text)
    cuts, start = [], 0
    for i, token in enumerate(doc):
        if token.text not in {",", "，", "،"}:
            continue
        left = [t for t in doc[max(start, i - 9):i] if not t.is_punct]
        right = doc[i + 1:min(len(doc), i + 10)]
        first_phrase = []
        for t in right:
            if t.is_punct:
                break
            first_phrase.append(t)
        if len(left) > 3 and len(first_phrase) > 3 and valid_clause(right):
            # Retain punctuation; only the boundary is new.
            cuts.append(token.idx + len(token))
            start = i + 1
    return slice_parts(text, cuts)


def slice_parts(text, cuts):
    bounds = [0, *cuts, len(text)]
    return [text[a:b].strip() for a, b in zip(bounds, bounds[1:]) if text[a:b].strip()]


def split_connectors(text, nlp):
    doc = nlp(text)
    connectors = CONNECTORS.get(doc.lang_, set())
    # Match multiword conjunctions as a whole: never cut "parce / que" or "потому / что".
    phrases = sorted((c.split() for c in connectors), key=len, reverse=True)
    starts, internal = set(), set()
    for i in range(len(doc)):
        if i in internal:
            continue
        for phrase in phrases:
            if [t.lower_ for t in doc[i:i + len(phrase)]] == phrase:
                starts.add(i)
                internal.update(range(i + 1, i + len(phrase)))
                break
    for i, token in enumerate(doc):
        if i not in starts or token.dep_ in {"det", "fixed", "flat", "compound"}:
            continue
        if doc.lang_ == "en" and token.lower_ == "that" and not (token.dep_ == "mark" and token.head.pos_ == "VERB"):
            continue
        # A coordinator of adverbs/function words is not a clause/list boundary.
        # Dependency POS generalizes to e.g. English/French/Spanish repetitions.
        # Noun coordination can share its head: "Rationalist or Idealist philosophers".
        # Keep it together now that NLP parts become actual translation units.
        if token.dep_ == "cc" and token.head.pos_ not in {"VERB", "AUX"}:
            continue
        if i + 1 < len(doc) and doc[i + 1].text in {"'s", "'re", "'ve", "'ll", "'d"}:
            continue
        # Do not reproduce VideoLingo's "two / or three pages" cut.
        if i and i + 1 < len(doc) and (doc[i - 1].pos_ == "NUM" or doc[i + 1].pos_ == "NUM"):
            continue
        left = [t for t in doc[max(0, i - 5):i] if not t.is_punct]
        right = [t for t in doc[i + 1:i + 6] if not t.is_punct]
        if len(left) >= 5 and len(right) >= 5:
            a, b = slice_parts(text, [token.idx])
            return [a, *split_connectors(b, nlp)]
    return [text]


def segment(text, nlp):
    doc = nlp(text)
    # Sentence segmentation and the connector pass use the actual source model.
    sentences = slice_parts(text, [s.start_char for s in list(doc.sents)[1:]])
    parts = [p for s in sentences for c in split_commas(s, nlp) for p in split_connectors(c, nlp)]
    return parts, [len(nlp.make_doc(p)) for p in parts]



def boundary_issue(text, parts, nlp):
    doc = nlp(text)
    cuts, cursor = [], 0
    for part in parts[:-1]:
        cursor = text.index(part, cursor) + len(part)
        cuts.append(cursor)
    protected = {"det", "amod", "compound", "fixed", "flat", "nummod",
                 "case", "mark", "aux", "auxpass", "neg", "prt", "pobj"}
    for cut in cuts:
        for token in doc:
            head = token.head
            crossed = (token.idx < cut <= head.idx or head.idx < cut <= token.idx)
            close_adverb = token.dep_ == "advmod" and abs(token.i - head.i) <= 3
            if crossed and (token.dep_ in protected or close_adverb):
                return f"Unsafe source boundary: keep {token.text!r} with {head.text!r} ({token.dep_}); move the cut outside this grammatical phrase."
    return ""


def display_boundaries(text, nlp):
    """Soft display-cut costs, not sentence boundaries or a length policy.

    Long phrases may span consecutive cues. Keep token/compound interiors costly
    without rejecting the entire translation when no perfect cut exists.
    Offsets use UTF-8 bytes so Go can slice the unchanged original text.
    """
    doc = nlp(text)
    result = []
    tight = {"compound", "fixed", "flat", "nummod", "det", "amod"}
    close = {"case", "aux", "auxpass", "neg", "prt", "pobj"}
    for i, token in enumerate(doc):
        if not token.idx:
            continue
        penalty = 20
        if doc[i - 1].is_punct:
            penalty = 0
        else:
            for child in doc:
                head = child.head
                if (child.idx < token.idx <= head.idx or head.idx < token.idx <= child.idx):
                    if child.dep_ in tight:
                        penalty += 160
                    elif child.dep_ in close:
                        penalty += 60
        if token.is_punct:
            penalty += 160
        result.append({"offset": len(text[:token.idx].encode("utf-8")), "penalty": penalty})
    return result

def merge_source_unit_parts(text, parts, nlp):
    """Remove unsafe proposed cuts; keep the original text and all safe cuts."""
    doc = nlp(text)
    cuts, cursor = [], 0
    for part in parts[:-1]:
        cursor = text.index(part, cursor) + len(part)
        left, right = text[:cursor].strip(), text[cursor:].strip()
        if not boundary_issue(text, [left, right], lambda _: doc):
            cuts.append(cursor)
    return slice_parts(text, cuts)


def main():
    request = json.load(sys.stdin)
    prefix = MODELS.get(request["language"])
    if prefix is None:
        return {"unavailable": "unsupported_language"}
    try:
        import spacy
    except ImportError:
        return {"unavailable": "spacy_missing"}
    installed = set(spacy.util.get_installed_models())
    model = next((prefix + "_" + size for size in ("md", "sm", "lg") if prefix + "_" + size in installed), None)
    if model is None:
        return {"unavailable": "language_model_missing"}
    nlp = spacy.load(model, exclude=["ner"])
    if not nlp.has_pipe("parser"):
        return {"unavailable": "dependency_parser_missing"}
    if "boundary_requests" in request:
        return {"model": model, "issues": [boundary_issue(r["source"], r["parts"], nlp)
                                            for r in request["boundary_requests"]]}
    result = {"model": model, "model_version": nlp.meta.get("version", ""), "segments": [], "tokens": []}
    for text in request["texts"]:
        parts, tokens = segment(text, nlp)
        result["segments"].append(parts)
        result["tokens"].append(tokens)
    return result


if __name__ == "__main__":
    json.dump(main(), sys.stdout, ensure_ascii=False)
