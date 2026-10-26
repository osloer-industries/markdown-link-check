import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import linkCheck from "link-check";
import markdownLinkExtractor from "markdown-link-extractor";

/**
 * @typedef {import('link-check').LinkCheckOptions} LinkCheckOptions
 */

/**
 * @param {string} target
 */
export function isHttpLink(target) {
  return /^https?:\/\//i.test(target);
}

/**
 * @param {string} target
 */
export function isSkippableLink(target) {
  return target.startsWith("#") || target.startsWith("mailto:");
}

/**
 * @param {string} markdownFilePath
 * @param {string} target
 */
export function resolveRepositoryLink(markdownFilePath, target) {
  const withoutFragment = target.split("#")[0] ?? "";
  if (withoutFragment.length === 0) return { ok: true };
  const resolved = resolve(dirname(markdownFilePath), withoutFragment);
  if (existsSync(resolved)) return { ok: true };
  return { ok: false, resolved };
}

/**
 * @param {string} url
 * @param {LinkCheckOptions} options
 */
export function checkHttpLink(url, options) {
  return new Promise((resolvePromise, reject) => {
    linkCheck(url, options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      if (result.status === "alive") {
        resolvePromise(undefined);
        return;
      }
      reject(new Error(`${url} (${result.statusCode ?? result.status})`));
    });
  });
}

/**
 * @param {string} markdown
 * @param {string} markdownFilePath
 * @param {LinkCheckOptions} [linkCheckOptions]
 */
export async function checkMarkdownFileLinks(markdown, markdownFilePath, linkCheckOptions = {}) {
  const links = [...new Set(markdownLinkExtractor(markdown))];
  await Promise.all(
    links.map(async (target) => {
      const trimmed = target.trim();
      if (isSkippableLink(trimmed)) return;
      if (isHttpLink(trimmed)) {
        await checkHttpLink(trimmed, linkCheckOptions);
        return;
      }
      const relativeResult = resolveRepositoryLink(markdownFilePath, trimmed);
      if (!relativeResult.ok) {
        throw new Error(`missing target ${trimmed} (resolved ${relativeResult.resolved})`);
      }
    })
  );
}
