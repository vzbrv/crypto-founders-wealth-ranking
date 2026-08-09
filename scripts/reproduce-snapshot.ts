import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  reproduceSnapshot,
  type SnapshotReproductionBundle,
} from "../packages/calculations/src/index.js";

const input = process.argv[2];
if (!input)
  throw new Error("Usage: pnpm reproduce:snapshot <snapshot_id|bundle.json>");

const path = input.endsWith(".json")
  ? resolve(input)
  : resolve("data/ranking-v2/snapshots", `${input}.json`);
const bundle = JSON.parse(
  await readFile(path, "utf8"),
) as SnapshotReproductionBundle;
const result = reproduceSnapshot(bundle);
if (!result.passed) {
  console.error(`FAIL step ${result.step}: ${result.message}`);
  process.exitCode = 1;
} else {
  console.log("PASS: snapshot reproduced exactly");
}
