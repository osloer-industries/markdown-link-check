import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, it, mock } from "node:test";

const linkCheckMock = mock.fn((_url, _options, callback) => {
  callback(undefined, { status: "alive", statusCode: 200 });
});

mock.module("link-check", {
  defaultExport: linkCheckMock,
});

const { checkHttpLink, checkMarkdownFileLinks, isHttpLink, isSkippableLink, resolveRepositoryLink } =
  await import("../index.mjs");
const {
  checkRepositoryMarkdownFiles,
  collectMarkdownFiles,
  isCheckRepoCliEntry,
  runCheckRepoCli,
} = await import("../check-repo.mjs");

describe("resolveRepositoryLink", () => {
  it("accepts existing relative targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-"));
    try {
      writeFileSync(join(dir, "target.md"), "# Target\n");
      const readme = join(dir, "README.md");
      writeFileSync(readme, "[x](./target.md)\n");
      assert.deepEqual(resolveRepositoryLink(readme, "./target.md"), { ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing relative targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-missing-"));
    try {
      const readme = join(dir, "README.md");
      writeFileSync(readme, "[x](./missing.md)\n");
      const result = resolveRepositoryLink(readme, "./missing.md");
      assert.equal(result.ok, false);
      assert.match(result.resolved, /missing\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts fragment-only links", () => {
    const readme = join(tmpdir(), "README.md");
    assert.deepEqual(resolveRepositoryLink(readme, "#section"), { ok: true });
  });
});

describe("checkMarkdownFileLinks", () => {
  beforeEach(() => {
    linkCheckMock.mock.resetCalls();
    linkCheckMock.mock.mockImplementation((_url, _options, callback) => {
      callback(undefined, { status: "alive", statusCode: 200 });
    });
  });

  it("validates relative links in a markdown file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-check-"));
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "guide.md"), "# Guide\n");
      const readme = join(dir, "README.md");
      const markdown = "[Guide](docs/guide.md)\n";
      writeFileSync(readme, markdown);
      await checkMarkdownFileLinks(markdown, readme);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects broken relative links", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-broken-"));
    try {
      const readme = join(dir, "README.md");
      const markdown = "[Missing](docs/missing.md)\n";
      writeFileSync(readme, markdown);
      await assert.rejects(
        () => checkMarkdownFileLinks(markdown, readme),
        /missing target docs\/missing\.md/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checks http links via link-check", async () => {
    const readme = join(mkdtempSync(join(tmpdir(), "mlc-http-")), "README.md");
    await checkMarkdownFileLinks("[Example](https://example.com)\n", readme);
    assert.equal(linkCheckMock.mock.calls.length, 1);
  });

  it("forwards link-check options such as aliveStatusCodes", async () => {
    const readme = join(mkdtempSync(join(tmpdir(), "mlc-opts-")), "README.md");
    const options = { aliveStatusCodes: [200, 206], timeout: "30s" };
    await checkMarkdownFileLinks("[Example](https://example.com)\n", readme, options);
    assert.deepEqual(linkCheckMock.mock.calls[0].arguments[1], options);
  });
});

describe("link helpers", () => {
  beforeEach(() => {
    linkCheckMock.mock.resetCalls();
    linkCheckMock.mock.mockImplementation((_url, _options, callback) => {
      callback(undefined, { status: "alive", statusCode: 200 });
    });
  });

  it("detects http(s) links", () => {
    assert.equal(isHttpLink("https://example.com"), true);
    assert.equal(isHttpLink("docs/a.md"), false);
  });

  it("skips anchors and mailto links", () => {
    assert.equal(isSkippableLink("#section"), true);
    assert.equal(isSkippableLink("mailto:team@example.com"), true);
    assert.equal(isSkippableLink("docs/a.md"), false);
  });

  it("rejects dead http links", async () => {
    linkCheckMock.mock.mockImplementationOnce((_url, _options, callback) => {
      callback(undefined, { status: "dead", statusCode: 404 });
    });
    await assert.rejects(() => checkHttpLink("https://example.com/missing", {}), /404/);
  });

  it("rejects when link-check returns an error", async () => {
    linkCheckMock.mock.mockImplementationOnce((_url, _options, callback) => {
      callback(new Error("network fail"));
    });
    await assert.rejects(() => checkHttpLink("https://example.com", {}), /network fail/);
  });

  it("accepts alive http links including partial content status codes via link-check", async () => {
    linkCheckMock.mock.mockImplementationOnce((_url, _options, callback) => {
      callback(undefined, { status: "alive", statusCode: 206 });
    });
    await checkHttpLink("https://example.com/range", { aliveStatusCodes: [200, 206] });
  });
});

describe("checkRepositoryMarkdownFiles", () => {
  beforeEach(() => {
    linkCheckMock.mock.resetCalls();
    linkCheckMock.mock.mockImplementation((_url, _options, callback) => {
      callback(undefined, { status: "alive", statusCode: 200 });
    });
  });

  it("collects markdown files and validates them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-repo-"));
    try {
      writeFileSync(join(dir, "README.md"), "# Root\n");
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "guide.md"), "[Root](../README.md)\n");
      mkdirSync(join(dir, "node_modules"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "ignored.md"), "[x](./nope.md)\n");
      const files = [];
      collectMarkdownFiles(dir, files);
      assert.equal(files.length, 2);
      const failures = await checkRepositoryMarkdownFiles(dir);
      assert.deepEqual(failures, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs repository cli with config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-cli-"));
    try {
      writeFileSync(join(dir, "README.md"), "# Root\n");
      const configPath = join(dir, "link-check.json");
      writeFileSync(configPath, JSON.stringify({ aliveStatusCodes: [200, 206] }));
      await runCheckRepoCli(["node", "check-repo-cli.mjs", "--config", configPath], dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runCheckRepoCli prints failures and exits with code 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-cli-fail-"));
    const errorMock = mock.method(console, "error", () => {});
    mock.method(process, "exit", (code) => {
      throw new Error(`exit:${code}`);
    });
    try {
      writeFileSync(join(dir, "README.md"), "[Missing](./nope.md)\n");
      await assert.rejects(
        () => runCheckRepoCli(["node", "check-repo-cli.mjs"], dir),
        /exit:1/,
      );
      assert.equal(errorMock.mock.calls.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      errorMock.mock.restore();
      mock.restoreAll();
    }
  });

  it("detects check-repo cli entry", () => {
    const cliAbs = join(mkdtempSync(join(tmpdir(), "mlc-cli-entry-")), "check-repo.mjs");
    const cliUrl = pathToFileURL(cliAbs).href;
    assert.equal(isCheckRepoCliEntry(cliUrl, cliAbs), true);
    assert.equal(isCheckRepoCliEntry(cliUrl, join(tmpdir(), "other.mjs")), false);
  });

  it("returns formatted failures", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlc-repo-fail-"));
    try {
      writeFileSync(join(dir, "README.md"), "[Missing](./nope.md)\n");
      const failures = await checkRepositoryMarkdownFiles(dir);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /README\.md: missing target/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
