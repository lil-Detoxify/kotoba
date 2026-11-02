# Dictionary source notes — 2026-10-12

Scope: source-lineage and attribution notes for the web dictionary comparison work. This is not a legal review.

## Lineage

- The current JMdict English glosses and Tomoshi Chinese glosses are not independent dictionary sources: Tomoshi's official data README identifies `entries` as JMdict entries and `zh_defs` / `zh_defs_zhtw` as Chinese translations of JMdict glosses. Preserve that relationship in source metadata and avoid counting them as two independent upstream gloss corpora.
- Japanese Wiktionary (`ja.wiktionary.org`) is a separate upstream from JMdict and the Tomoshi Chinese translations. Tomoshi's README also says its `jpn_defs` combines Japanese-Wiktionary-derived definitions with LLM definitions derived from JMdict, so possible overlap with that existing field should not be described as zero.
- Kotobank remains an outbound lookup link. It is not an integrated dictionary source, and this review found no publisher authorization for embedding its entries.

## Kaikki edition check

Use the edition-specific page `https://kaikki.org/jawiktionary/rawdata.html`: it labels the feed “Japanese-language edition of Wiktionary,” identifies the source as the `jawiktionary` dump dated 2026-10-01, says its glosses and metadata are in Japanese, and links `ja-extract.jsonl` (426.5 MB) plus `ja-extract.jsonl.gz` (62.0 MB). The shared rawdata page groups English-edition downloads and other-edition downloads separately; its generic enwiktionary footer does not describe every other-edition file. The selected `/dictionary/downloads/ja/ja-extract.jsonl.gz` is the Japanese-edition feed. The edition-specific entry page `https://kaikki.org/jawiktionary/index.html` identifies the Japanese edition, links its source to ja.wiktionary.org, and describes its dataset license as Wiktionary's CC-BY-SA and GFDL. The data agent subsequently sampled and built the complete raw JSONL: Japanese glosses and source forms were confirmed, with examples and coverage recorded in `kotobud-review/round26-2026-10-12/`. For academic use, Kaikki asks users to cite Tatu Ylonen's Wiktextract paper and welcomes links to relevant Kaikki pages.

## Text license and attribution

- The checked Japanese Wiktionary entry footer links to CC BY-SA 4.0. Kaikki's Japanese-edition index states that the extracted data is available under Wiktionary's CC-BY-SA and GFDL terms; do not describe the dataset as CC BY-SA 4.0 only. For reused page text, keep the entry title, a page/permanent revision link (the checked sample footer exposes `oldid`), attribution/source, the applicable license links, and a concise note describing extraction/formatting or other changes. Preserve the applicable share-alike terms for adapted text. This note does not cover images/audio or make a legal determination.
- Tomoshi's repository is per-table licensed: its README says most tables are CC BY-SA 4.0, with `kanji_strokes` CC BY-SA 3.0; the authoritative metadata is the database's `table_licenses` table. For its JMdict/KANJIDIC2-derived content credit EDRDG; for Tomoshi-derived Chinese layers credit “Tomoshi (Y1Z)”; state modifications and use the same or compatible share-alike terms for adapted BY-SA tables. Do not imply Tomoshi endorses KotoBud or use its logo as branding.
- Keep source/version/license/attribution attached to each provider result or in a visible source-details affordance. Keep entries separated by source rather than merging glosses in a way that loses provenance.

## Sources checked

- Existing project plan: `docs/reference/WEB_MULTI_DICTIONARY_PLAN_2026-09-27.md`.
- Tomoshi data README and per-table license: <https://github.com/tomoshi-app/tomoshi-dict-data>.
- Japanese Wiktionary sample `ありがとう` and its footer: <https://ja.wiktionary.org/wiki/ありがとう>.
- Kaikki raw data: <https://kaikki.org/dictionary/rawdata.html> (the page groups multiple editions; use the jawiktionary-specific section/page for this source).
- Kaikki Japanese-edition raw data and source/license notes: <https://kaikki.org/jawiktionary/rawdata.html>; edition index: <https://kaikki.org/jawiktionary/index.html>.
- CC BY-SA 4.0 deed: <https://creativecommons.org/licenses/by-sa/4.0/>.
