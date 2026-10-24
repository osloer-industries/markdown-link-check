declare module "link-check" {
  export type LinkCheckOptions = Record<string, unknown>;
  export type LinkCheckCallback = (
    error: Error | null,
    result: { status: string; statusCode?: number },
  ) => void;
  export default function linkCheck(
    url: string,
    options: LinkCheckOptions,
    callback: LinkCheckCallback,
  ): void;
}

declare module "markdown-link-extractor" {
  export default function markdownLinkExtractor(markdown: string): string[];
}
