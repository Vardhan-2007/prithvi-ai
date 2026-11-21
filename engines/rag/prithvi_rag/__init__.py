"""Evidence-constrained retrieval for PRITHVI AI (extractive BM25, no generative model).

Retrieved text is treated strictly as data: the answer is assembled from retrieved sentences and cited,
or the assistant abstains. A generative LLM can be added later behind `answer.compose`, keeping the
same citation + abstain contract."""
