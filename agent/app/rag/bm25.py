"""BM25 (Okapi) ranking implementation for technical terms and acronyms."""
import math
import re
from typing import List, Tuple


def tokenize(text: str) -> List[str]:
    """Tokenize text into lowercase alphanumeric tokens, preserving words and acronyms."""
    # Matches words with optional internal hyphens or underscores (e.g. faq-agent, gpt-4)
    tokens = re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower())
    return [t for t in tokens if len(t) > 1]


class BM25Okapi:
    def __init__(self, corpus: List[str], k1: float = 1.5, b: float = 0.75):
        """
        Args:
            corpus: List of raw document chunk texts.
            k1: Term frequency saturation parameter (default 1.5).
            b: Document length normalization parameter (default 0.75).
        """
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        self.doc_len: List[int] = []
        self.doc_freqs: List[dict[str, int]] = []
        self.nd: dict[str, int] = {}
        self.idf: dict[str, float] = {}

        total_len = 0
        for doc in corpus:
            tokens = tokenize(doc)
            length = len(tokens)
            self.doc_len.append(length)
            total_len += length

            freqs: dict[str, int] = {}
            for token in tokens:
                freqs[token] = freqs.get(token, 0) + 1
            self.doc_freqs.append(freqs)

            for token in freqs:
                self.nd[token] = self.nd.get(token, 0) + 1

        self.avgdl = (total_len / self.corpus_size) if self.corpus_size > 0 else 0

        # Calculate Robertson-Spärck Jones IDF
        for word, freq in self.nd.items():
            self.idf[word] = math.log(
                (self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0
            )

    def get_scores(self, query: str) -> List[float]:
        """Compute BM25 scores for a query across all documents in the corpus."""
        query_tokens = tokenize(query)
        scores = [0.0] * self.corpus_size

        if self.corpus_size == 0 or not query_tokens:
            return scores

        for q in query_tokens:
            if q not in self.idf:
                continue

            idf = self.idf[q]
            for idx, doc_freq in enumerate(self.doc_freqs):
                freq = doc_freq.get(q, 0)
                if freq == 0:
                    continue

                len_norm = 1.0 - self.b + self.b * (self.doc_len[idx] / self.avgdl)
                num = freq * (self.k1 + 1.0)
                denom = freq + self.k1 * len_norm
                scores[idx] += idf * (num / denom)

        return scores

    def get_top_n(self, query: str, n: int = 10) -> List[Tuple[int, float]]:
        """Return (doc_index, score) pairs for the top-N matching documents."""
        scores = self.get_scores(query)
        ranked = sorted(
            [(i, s) for i, s in enumerate(scores) if s > 0],
            key=lambda x: x[1],
            reverse=True,
        )
        return ranked[:n]
