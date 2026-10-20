The punctuation, comma and connector segmentation logic in
`internal/service/subtitle_nlp.py` is adapted from VideoLingo:
https://github.com/Huanshere/VideoLingo

Reference revision: 01f843492759be9bbfd1a5cb697b799cc9de1609.
Source files: `core/spacy_utils/split_by_mark.py`, `split_by_comma.py`,
and `split_by_connector.py`.

VideoLingo is licensed under Apache License 2.0; see `VideoLingo-LICENSE`.
Modifications for KrillinAI include JSON process isolation, original-text slicing
that preserves punctuation, installed-model discovery without runtime downloads,
additional language rules, and protection for coordinated numbers.
