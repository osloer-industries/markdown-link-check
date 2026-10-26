#!/usr/bin/env node

import { isCheckRepoCliEntry, runCheckRepoCli } from "./check-repo.mjs";

const entry = process.argv[1] ?? "";
if (isCheckRepoCliEntry(import.meta.url, entry)) {
  await runCheckRepoCli(process.argv);
}
