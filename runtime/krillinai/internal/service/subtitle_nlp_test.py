"""Tokenizer regressions for language-specific boundary rules (no model download)."""
import unittest

import spacy

from subtitle_nlp import split_connectors


class ConnectorBoundariesTest(unittest.TestCase):
    def test_multiword_conjunctions_remain_whole(self):
        for language, left, right in [
            ("fr", "Je lis beaucoup de livres", "parce que cela me permet de mieux comprendre notre monde."),
            ("ru", "Я читаю много полезных книг", "потому что они помогают лучше понимать наш мир."),
        ]:
            with self.subTest(language=language):
                self.assertEqual(split_connectors(left + " " + right, spacy.blank(language)), [left, right])

    def test_unknown_language_does_not_use_english_connectors(self):
        text = "I read a lot of books because they help me understand the world."
        self.assertEqual(split_connectors(text, spacy.blank("xx")), [text])


class DependencyBoundaryTest(unittest.TestCase):
    def test_semantic_units_merge_broken_phrase_and_keep_other_cuts(self):
        from spacy.tokens import Doc
        from subtitle_nlp import merge_source_unit_parts
        vocab = spacy.blank("en").vocab
        words = "I had an existential crisis then I read another book".split()
        heads = [1, 1, 4, 4, 1, 7, 7, 7, 9, 7]
        deps = ["nsubj", "ROOT", "det", "amod", "dobj", "advmod", "nsubj", "conj", "det", "dobj"]
        doc = Doc(vocab, words=words, heads=heads, deps=deps)
        text = " ".join(words)
        self.assertEqual(
            merge_source_unit_parts(text, ["I had an existential", "crisis", "then I read another book"], lambda _: doc),
            ["I had an existential crisis", "then I read another book"])

    def test_function_words_stay_with_their_complements(self):
        from spacy.tokens import Doc
        from subtitle_nlp import boundary_issue
        vocab=spacy.blank("en").vocab
        for words,heads,deps,pos,parts in [
            (["speak","in","clear","ways"],[0,0,3,1],["ROOT","prep","amod","pobj"],["VERB","ADP","ADJ","NOUN"],["speak in","clear ways"]),
            (["use","very","general","terms"],[0,2,3,0],["ROOT","advmod","amod","dobj"],["VERB","ADV","ADJ","NOUN"],["use very","general terms"]),
        ]:
            doc=Doc(vocab,words=words,heads=heads,deps=deps,pos=pos)
            text=" ".join(words)
            self.assertTrue(boundary_issue(text,parts,lambda _:doc))
            self.assertEqual(boundary_issue(text,[text],lambda _:doc),"")

    def test_adverb_coordination_is_not_a_clause_cut(self):
        from spacy.tokens import Doc
        vocab=spacy.blank("en").vocab
        words="This book has been read over and over again many times before today".split()
        heads=list(range(len(words)));heads[6]=7
        deps=["ROOT"]*len(words);deps[6]="cc"
        pos=["NOUN"]*len(words);pos[6]="CCONJ";pos[7]="ADV"
        doc=Doc(vocab,words=words,heads=heads,deps=deps,pos=pos)
        text=" ".join(words)
        self.assertEqual(split_connectors(text,lambda _:doc),[text])

class ParsedSourceSelectionTest(unittest.TestCase):
    def test_real_parser_keeps_grammar_and_exact_source(self):
        import translation_source_cut as selector
        from subtitle_nlp import boundary_issue
        if not spacy.util.is_package("en_core_web_md"):
            self.skipTest("English parser not installed")
        nlp=spacy.load("en_core_web_md",exclude=["ner"])
        selector.boundary_issue=boundary_issue
        for text in [
            "because they are timeless and they speak in very general philosophical terms about contemporary morals,",
            "The museum has a remarkably extensive collection of early modern paintings from many different countries.",
        ]:
            parts=selector.choose_source_parts(text,2,75,nlp)
            self.assertGreaterEqual(len(parts),2)
            self.assertEqual("".join("".join(p.split()) for p in parts),"".join(text.split()))
            self.assertTrue(all(selector.display_width(p)<=75 for p in parts))
            self.assertEqual(boundary_issue(text,parts,nlp),"")

    def test_multiple_safe_options_allow_target_language_choice(self):
        import translation_source_cut as selector
        from subtitle_nlp import boundary_issue
        if not spacy.util.is_package("en_core_web_md"):
            self.skipTest("English parser not installed")
        nlp=spacy.load("en_core_web_md",exclude=["ner"])
        selector.boundary_issue=boundary_issue
        text="They serve a a utilitarian purpose in my life to to to bring me back to foundational ideas."
        options=selector.choose_source_options(text,2,75,nlp)
        self.assertGreater(len(options),1)
        self.assertLessEqual(len(options),3)
        self.assertIn(["They serve a a utilitarian purpose in my life", "to to to bring me back to foundational ideas."],options)
        for parts in options:
            self.assertEqual("".join("".join(p.split()) for p in parts),"".join(text.split()))
            self.assertTrue(all(selector.display_width(p)<=75 for p in parts))
            self.assertEqual(boundary_issue(text,parts,nlp),"")


if __name__ == "__main__":
    unittest.main()
