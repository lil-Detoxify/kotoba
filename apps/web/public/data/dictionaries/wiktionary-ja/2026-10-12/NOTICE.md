# Wiktionary Japanese data notice

This dataset contains Japanese-language dictionary text from pages authored by the Japanese Wiktionary community. Japanese Wiktionary pages link their text to the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/. The original page for each record is linked by its sourceUrl.

Kaikki / Wiktextract extracted the source entries from Japanese Wiktionary. This project filtered the extracted JSONL to lang_code="ja" entries with source glosses, omitted redirect-only and glossless entries, kept source glosses and examples as plain text, removed empty or duplicate strings within a source sense, and split the resulting records into 256 ordinary JSON shards. Static hosting may apply transfer compression. No generated translations or inferred readings were added. Readings are included only when forms are pure kana and tagged transliteration, hiragana, or katakana; otherwise the record keeps an empty readings array.

This notice identifies the community source and processing changes; it does not imply endorsement by Wiktionary, Kaikki, or Wiktextract.
