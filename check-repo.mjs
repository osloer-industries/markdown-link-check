import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkMarkdownFileLinks } from "./index.mjs";

const skipDirs = new Set(["node_modules", "dist", "coverage", ".git"]);

/**
 * @param {string} dir
 * @param {string[]} files
 */
export function collectMarkdownFiles(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const absolutePath = join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) collectMarkdownFiles(absolutePath, files);
    else if (entry.endsWith(".md")) files.push(absolutePath);
  }
}

/**
 * @param {string} cwd
 * @param {import('link-check').LinkCheckOptions} [linkCheckOptions]
 */
export async function checkRepositoryMarkdownFiles(cwd, linkCheckOptions = {}) {
  /** @type {string[]} */
  const markdownFiles = [];
  collectMarkdownFiles(cwd, markdownFiles);
  markdownFiles.sort((left, right) => left.localeCompare(right));

  const failures = await Promise.all(
    markdownFiles.map(async (filePath) => {
      try {
        const markdown = readFileSync(filePath, "utf8");
        await checkMarkdownFileLinks(markdown, filePath, linkCheckOptions);
        return undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `${relative(cwd, filePath)}: ${message}`;
      }
    }),
  );

  return failures.filter((message) => message !== undefined);
}

/**
 * @param {string} metaUrl
 * @param {string} argvEntry
 */
export function isCheckRepoCliEntry(metaUrl, argvEntry) {
  return metaUrl === new URL(argvEntry, "file:").href;
}

/**
 * @param {readonly string[]} argv
 * @param {string} [cwd]
 */
export async function runCheckRepoCli(argv, cwd = process.cwd()) {
  const configArgIndex = argv.indexOf("--config");
  const configPath = configArgIndex >= 0 ? argv[configArgIndex + 1] : undefined;
  const linkCheckOptions = configPath ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const failures = await checkRepositoryMarkdownFiles(cwd, linkCheckOptions);
  for (const message of failures) {
    console.error(message);
  }
  if (failures.length > 0) process.exit(1);
}
