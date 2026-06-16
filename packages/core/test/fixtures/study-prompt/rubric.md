# Rubric for Study-Prompt Fixture Evaluation

This rubric is used to manually score outputs from `eval-study-prompt.ts` against each
fixture. All outputs must pass the acceptance bar (≥ 80% of fixtures score ≥ 3/5 per
criterion) before the STUDY_SYSTEM_PROMPT is considered ready for production.

## How to score

Run the eval script against a live stage with all secrets seeded:

```bash
cd packages/scripts && sst shell --stage <your-stage> tsx src/eval-study-prompt.ts
```

Open `tmp/eval-output/` and score each output file against the criteria below.

---

## Per-fixture rubric

### grammar-subjuntivo.md (flashcards, pt-BR)
**Expected output shape**: ≥ 8 flashcards; fronts are concise Portuguese questions or
incomplete sentences; backs are precise grammatical answers.

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| All content in pt-BR (not European PT) | | |
| ≥ 8 cards covering the main use cases | | |
| Card fronts test recall, not just recognition | | |
| Irregular verb forms appear on cards | | |
| No large blocks of text verbatim from the note | | |

---

### vocabulary-comida.md (flashcards, pt-BR)
**Expected output shape**: ≥ 8 flashcards covering fruits, dishes, and expressions;
fronts ask for the meaning or usage, backs give definitions.

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| All content in pt-BR | | |
| At least 4 fruits covered | | |
| At least 3 typical dishes covered | | |
| At least 2 expressions covered | | |
| Backs are precise, not verbatim copies | | |

---

### history-proclamacao.md (quiz, pt-BR)
**Expected output shape**: 5–10 multiple-choice questions; each has exactly 4 choices;
answerIndex is 0–3; explanation is in pt-BR.

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| All content in pt-BR | | |
| ≥ 5 questions | | |
| All questions have exactly 4 choices | | |
| Distractors are plausible (not obviously wrong) | | |
| Explanations are informative and in pt-BR | | |
| Key dates (1888, 1889) and figures covered | | |

---

### bilingual-false-friends.md (flashcards, bilingual)
**Expected output shape**: ≥ 8 bilingual flashcards; fronts in pt-BR, backs in English
(or front = EN word, back = correct PT meaning).

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| Front text is in pt-BR (or the English word being tested) | | |
| Back text is in English (the correction or explanation) | | |
| At least 6 false friend pairs covered | | |
| Example sentences or context provided on backs | | |
| No content in European Portuguese | | |

---

### biology-celula.md (summary, pt-BR)
**Expected output shape**: tldr (1–2 sentences in pt-BR); 5–10 key points; glossary
with ≥ 5 terms (organella names + definitions in pt-BR).

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| All content in pt-BR | | |
| tldr summarises prokaryote vs eukaryote distinction | | |
| ≥ 5 key points covering major organelles | | |
| ≥ 5 terms in the glossary (e.g. mitocôndria, ATP) | | |
| Definitions are precise, not verbatim quotes | | |

---

### math-funcoes.md (assignment, pt-BR)
**Expected output shape**: a written assignment with a title, clear instructions,
and a rubric with 3–6 criteria each worth 1–10 points; total points ≥ 10.

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| All content in pt-BR | | |
| Assignment title is descriptive | | |
| Instructions are clear and require application (not just recall) | | |
| Rubric has ≥ 3 criteria | | |
| Each criterion has a point value (1–10) | | |
| Total rubric points ≥ 10 | | |

---

## Acceptance bar

The prompt is ready when: for each fixture, ≥ 4 out of 5 criteria score ≥ 3/5.
If any fixture fails the bar, iterate the relevant system prompt or per-type prompt
and re-run `eval-study-prompt.ts` before marking the milestone Done.
