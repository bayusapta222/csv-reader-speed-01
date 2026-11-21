// main.ts — the driver the harness runs: reads every case from the input
// dir, answers each with solve.js's run, and writes /output/answers.json
// as a JSON array in the cases' order.
//
// V8's incremental marking is turned off before solve.js is imported, the
// same tuning the house driver uses. The output is written with a single
// JSON.stringify of the whole answers array, so two runs on the same input
// write byte-identical bytes: run() builds every answer as
// {columns, rows, errors} and every error as {code, line, row, ...} in a
// fixed key order, and nothing here reorders, filters or re-serializes
// any answer. No caching happens between cases: each case is answered
// alone by its own run() call, in the cases' order.

import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = (await import('./solve.js')) as {
  run: (input: unknown) => unknown;
};

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const answers = cases.map((c) => run(c.input));

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
