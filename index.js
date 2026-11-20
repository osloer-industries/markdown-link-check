'use strict';

const async = require('async');
const linkCheck = require('link-check');
const LinkCheckResult = require('link-check').LinkCheckResult;
const markdownLinkExtractor = require('markdown-link-extractor');
const ProgressBar = require('progress');

const envVarPatternMatcher = /(?<pattern>{{env\.(?<name>[a-zA-Z0-9\-_]+)}})/;
const {
    removeCodeBlocks,
    extractHtmlSectionIds,
    stripDisabledLinkCheckRegions,
    prepareMarkdownForHtmlSectionScan,
} = require('./safe-markdown-parse');

/*
 * Performs some special replacements for the following patterns:
 * - {{BASEURL}} - to be replaced with opts.projectBaseUrl
 * - {{env.<env_var_name>}} - to be replaced with the environment variable specified with <env_var_name>
 */
function performSpecialReplacements(str, opts) {
    // replace the `{{BASEURL}}` with the opts.projectBaseUrl. Helpful to build absolute urls "relative" to project roots
    str = str.replace('{{BASEURL}}', opts.projectBaseUrl);

    // replace {{env.<env_var_name>}} with the corresponding environment variable or an empty string if none is set.
    let envVarMatch;
    do {
        envVarMatch = envVarPatternMatcher.exec(str);

        if (!envVarMatch) {
            break;
        }

        const envVarPattern = envVarMatch.groups.pattern;
        const envVarName = envVarMatch.groups.name;

        let envVarPatternReplacement = '';

        if (envVarName in process.env) {
            envVarPatternReplacement = process.env[envVarName];
        }

        str = str.replace(envVarPattern, envVarPatternReplacement);
        // eslint-disable-next-line no-constant-condition
    } while (true);

    return str;
}

function extractHtmlSections(markdown) {
    return extractHtmlSectionIds(prepareMarkdownForHtmlSectionScan(markdown));
}

function isAllowedHeadingUrlCharacter(character) {
    if (character >= '0' && character <= '9') {
        return true;
    }
    if (character >= 'A' && character <= 'Z') {
        return true;
    }
    if (character >= 'a' && character <= 'z') {
        return true;
    }
    return (
        character === '.' ||
        character === '/' ||
        character === '?' ||
        character === '=' ||
        character === '#' ||
        character === '-' ||
        character === '_'
    );
}

function headingLinkUrlPrefixLength(headingLine, urlStart) {
    const tail = headingLine.slice(urlStart);
    if (tail.startsWith('https://')) {
        return 'https://'.length;
    }
    if (tail.startsWith('http://')) {
        return 'http://'.length;
    }
    if (tail.startsWith('./')) {
        return 2;
    }
    if (tail.startsWith('/')) {
        return 1;
    }
    if (tail.startsWith('#')) {
        return 1;
    }
    return -1;
}

function parseHeadingLinkUrl(headingLine, urlStart) {
    const prefixLength = headingLinkUrlPrefixLength(headingLine, urlStart);
    if (prefixLength < 0) {
        return null;
    }

    let urlEnd = urlStart + prefixLength;
    while (urlEnd < headingLine.length) {
        const character = headingLine[urlEnd];
        if (character === ')') {
            break;
        }
        if (!isAllowedHeadingUrlCharacter(character)) {
            return null;
        }
        urlEnd += 1;
    }
    if (urlEnd >= headingLine.length || headingLine[urlEnd] !== ')') {
        return null;
    }
    if (urlEnd === urlStart + prefixLength) {
        return null;
    }

    return { urlEnd, url: headingLine.slice(urlStart, urlEnd) };
}

function replaceFirstHeadingInlineLink(headingLine) {
    const openBracket = headingLine.indexOf('[');
    if (openBracket === -1) {
        return headingLine;
    }

    let closeBracket = openBracket + 1;
    while (closeBracket < headingLine.length && headingLine[closeBracket] !== ']') {
        closeBracket += 1;
    }
    if (closeBracket >= headingLine.length) {
        return headingLine;
    }

    if (headingLine[closeBracket + 1] !== '(') {
        return headingLine;
    }

    const urlStart = closeBracket + 2;
    const parsedUrl = parseHeadingLinkUrl(headingLine, urlStart);
    if (!parsedUrl) {
        return headingLine;
    }

    const linkText = headingLine.slice(openBracket + 1, closeBracket);
    return (
        headingLine.slice(0, openBracket) +
        linkText +
        headingLine.slice(parsedUrl.urlEnd + 1)
    );
}

function normalizeSectionHeading(section) {
    return encodeURIComponent(
        replaceFirstHeadingInlineLink(section)
            .toLowerCase()
            .replace(/^#+\s*/, '')
            .replace(/[^\p{L}\p{Nd}\p{Nl}\s_\-`]/gu, '')
            .replaceAll('*', '')
            .replaceAll('`', '')
            .replace(/\s/gu, '-')
    );
}

function dedupeEncodedSections(sections) {
    const uniq = {};
    for (let section of sections) {
        if (section in uniq) {
            uniq[section] += 1;
            section = `${section}-${uniq[section]}`;
        }
        uniq[section] = 0;
    }
    return Object.keys(uniq);
}

function extractSections(markdown) {
    // First remove code blocks.
    markdown = removeCodeBlocks(markdown);

    const sectionTitles = markdown.match(/^#+ .*$/gm) || [];

    const sections = sectionTitles.map(normalizeSectionHeading);

    return dedupeEncodedSections(sections);
}

function shouldIgnoreLink(link, ignorePatterns) {
    return ignorePatterns.some((ignorePattern) => {
        const pattern =
            ignorePattern.pattern instanceof RegExp
                ? ignorePattern.pattern
                : new RegExp(ignorePattern.pattern);
        return pattern.test(link);
    });
}

function applyReplacementPatterns(link, opts) {
    let updatedLink = link;
    if (!opts.replacementPatterns) {
        return updatedLink;
    }
    for (const replacementPattern of opts.replacementPatterns) {
        let pattern = replacementPattern.pattern;
        if (!(pattern instanceof RegExp)) {
            let flags = '';
            if (replacementPattern.global) {
                flags = 'g';
            }
            pattern = new RegExp(replacementPattern.pattern, flags);
        }
        updatedLink = updatedLink.replace(
            pattern,
            performSpecialReplacements(replacementPattern.replacement, opts)
        );
    }
    return updatedLink;
}

function applyHttpHeadersForLink(link, opts) {
    opts.headers = {};

    if (!opts.httpHeaders) {
        return;
    }

    for (const httpHeader of opts.httpHeaders) {
        if (httpHeader.headers) {
            for (const header of Object.keys(httpHeader.headers)) {
                httpHeader.headers[header] = performSpecialReplacements(
                    httpHeader.headers[header],
                    opts
                );
            }
        }

        for (const url of httpHeader.urls) {
            if (link.startsWith(url)) {
                Object.assign(opts.headers, httpHeader.headers);
                break;
            }
        }
    }
}

function resolveSectionLink(link, opts) {
    if (link.startsWith('#')) {
        return link;
    }

    if ('baseUrl' in opts && link.startsWith(opts.baseUrl)) {
        const remainder = link.substring(opts.baseUrl.length);
        if (/^\/*#/.test(remainder)) {
            return link.replace(/^[^#]+/, '');
        }
    }

    return null;
}

function createIgnoredLinkResult(opts, link, callback) {
    const result = new LinkCheckResult(opts, link, 0, undefined);
    result.status = 'ignored';
    callback(null, result);
}

function createSectionLinkResult(opts, sectionLink, sections, callback) {
    const sectionId = sectionLink.substring(1);
    const statusCode = sections.has(sectionId) ? 200 : 404;
    const result = new LinkCheckResult(opts, sectionLink, statusCode, undefined);
    callback(null, result);
}

function runRemoteLinkCheck(link, opts, bar, callback) {
    let numCalls = 0;
    linkCheck(link, opts, function (err, result) {
        if (numCalls > 0) {
            console.trace(
                `linkCheck called us back more than once for ${link}. This is likely due to a server answering HEAD with 302 and a body, against the HTTP spec. Ignoring.`
            );
            return;
        }
        numCalls += 1;

        if (opts.showProgressBar) {
            bar.tick();
        }

        if (err) {
            result = new LinkCheckResult(opts, link, 500, err);
            result.status = 'error';
        }

        callback(null, result);
    });
}

function checkSingleLink(link, opts, sections, bar, callback) {
    if (opts.ignorePatterns && shouldIgnoreLink(link, opts.ignorePatterns)) {
        createIgnoredLinkResult(opts, link, callback);
        return;
    }

    link = applyReplacementPatterns(link, opts);
    applyHttpHeadersForLink(link, opts);

    const sectionLink = resolveSectionLink(link, opts);
    if (sectionLink) {
        createSectionLinkResult(opts, sectionLink, sections, callback);
        return;
    }

    runRemoteLinkCheck(link, opts, bar, callback);
}

module.exports = function markdownLinkCheck(markdown, opts, callback) {
    if (arguments.length === 2 && typeof opts === 'function') {
        // optional 'opts' not supplied.
        callback = opts;
        opts = {};
    }

    if (!opts.ignoreDisable) {
        markdown = stripDisabledLinkCheckRegions(markdown);
    }

    const links = markdownLinkExtractor(markdown);
    const sections = new Set([
        ...extractSections(markdown),
        ...extractHtmlSections(markdown),
    ]);
    const linksCollection = [...new Set(links)];
    const bar = opts.showProgressBar
        ? new ProgressBar('Checking... [:bar] :percent', {
              complete: '=',
              incomplete: ' ',
              width: 25,
              total: linksCollection.length,
          })
        : undefined;

    async.mapLimit(
        linksCollection,
        2,
        function (link, mapCallback) {
            checkSingleLink(link, opts, sections, bar, mapCallback);
        },
        callback
    );
};