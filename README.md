[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bayusapta222/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bayusapta222/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01 — a faster drop-in for csv-reader 1.0.0

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly
what csv-reader 1.0.0 returns for an input `{text, header}`: the JSON value
`{columns, rows, errors}`. It was written fresh from the competition's prose
specification, including the broken-CSV edge cases: a leading U+FEFF is
dropped, records end at LF or CRLF, empty lines are no record, a lone CR
outside quotes is dropped (`stray_cr`), a field that opens with a quote runs
to the next undoubled quote with `""` read as one quote and CR/LF inside it
read as LF, junk after the closing quote is appended as-is (`quote_junk`),
a quote that never closes is literal and the rest is re-read as unquoted
(`unterminated_quote`), and records are padded (`short_row`, with `fields`)
or cut (`long_row`, with `extra`) to the first record's width. Errors carry
the record's start line and its index in `rows` (null for the header).

`main.ts` is the driver the harness runs: it turns V8's incremental marking
off before importing `solve.js`, reads every case from
`$MAKEFUN_INPUT_DIR/cases.json` (default `/input`), answers each with `run`,
and writes `$MAKEFUN_OUTPUT_DIR/answers.json` (default `/output`) with a
single `JSON.stringify`, so two runs write byte-identical output.

## Speed

The parser scans with native `String.indexOf` instead of stepping character
by character, caches the next LF per record and the next CR per stretch
between CRs (an unbounded `indexOf('\r')` per field scans far past the
field on LF-terminated files — that one mistake cost 15x on such a case),
splits fully-clean records in one native pass, returns field scans through
shared locals instead of a fresh array per field, and only falls back to a
character loop for fields that actually contain a stray CR or a quoted
field that actually contains a line break.

Measured on this machine (Node 22.23.5, `run()` only, 9 interleaved rounds
per set, baseline run as a black box): median speedup over the house
baseline is 4.39x on the practice set and 2.51x–3.60x on six further
generated sets drawn with the kit's own generator (a1, b2, c3, d4, e5, f6).
End to end through `main.ts` (including Node startup and the JSON
parse/stringify the driver shares with the baseline) the median speedup on
the practice set is 2.28x over 7 interleaved rounds. Answers are identical
to the oracle on every case of all seven sets (42/42), and on 15,201
additional edge-case and fuzz checks against the baseline run as a black
box (BOM, CRLF vs LF, stray CR, doubled quotes, quote junk, unterminated
quotes, empty lines, short/long rows, header true and false).

## Run it

Requires Node 22.18 or later (the grader runs Node 22.23.4; on Node 22.6
to 22.17 run it as `node --experimental-strip-types main.ts`).

```sh
# answer the practice set and write answers.json
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts

# or with the kit's practice data, from the unpacked kit directory:
MAKEFUN_INPUT_DIR=$PWD/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

## License

MIT — see `LICENSE`.
