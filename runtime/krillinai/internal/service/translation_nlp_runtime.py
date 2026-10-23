"""Task-scoped JSON-lines worker; reuse the same language parser between requests."""
models = {}


def runtime_model(language):
    if language in models:
        return models[language]
    prefix = MODELS.get(language)
    if prefix is None:
        return None, {"unavailable": "unsupported_language"}
    try:
        import spacy
    except ImportError:
        return None, {"unavailable": "spacy_missing"}
    installed = set(spacy.util.get_installed_models())
    model = next((prefix + "_" + size for size in ("md", "sm", "lg")
                  if prefix + "_" + size in installed), None)
    if model is None:
        return None, {"unavailable": "language_model_missing"}
    nlp = spacy.load(model, exclude=["ner"])
    if not nlp.has_pipe("parser"):
        return None, {"unavailable": "dependency_parser_missing"}
    result = (nlp, {"model": model, "model_version": nlp.meta.get("version", "")})
    models[language] = result
    return result


def runtime_request(request):
    nlp, metadata = runtime_model(request["language"])
    if nlp is None:
        return metadata
    result = dict(metadata)
    if "source_unit_requests" in request:
        result["segments"] = [merge_source_unit_parts(r["source"], r["parts"], nlp)
                              for r in request["source_unit_requests"]]
    elif "boundary_requests" in request:
        result["issues"] = [boundary_issue(r["source"], r["parts"], nlp)
                            for r in request["boundary_requests"]]
    elif "requests" in request:
        result["options"] = [choose_source_options(r["source"], r["minimum_pieces"], request["soft"], nlp)
                             for r in request["requests"]]
    else:
        result["segments"], result["tokens"] = [], []
        for text in request["texts"]:
            parts, tokens = segment(text, nlp)
            result["segments"].append(parts)
            result["tokens"].append(tokens)
    return result


for line in sys.stdin:
    try:
        response = runtime_request(json.loads(line))
    except Exception as error:
        response = {"unavailable": "worker_error", "error_type": type(error).__name__}
    print(json.dumps(response, ensure_ascii=False), flush=True)
