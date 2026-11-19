'use strict';

const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})/u;
const FENCE_CLOSE_RE = /^([ \t]*)(`{3,}|~{3,})\s*$/u;
const TAG_NAME_RE = /^<\s*([^\s>/]+)/u;

/**
 * @param {string} value
 * @returns {string}
 */
function trimCommentWhitespace(value) {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === ' ' || value[start] === '\t')) {
    start += 1;
  }
  while (end > start && (value[end - 1] === ' ' || value[end - 1] === '\t')) {
    end -= 1;
  }
  return value.slice(start, end);
}

/**
 * @param {string} markdown
 * @param {number} fromIndex
 * @param {string} markerBody
 * @returns {number}
 */
function indexOfCommentMarker(markdown, fromIndex, markerBody) {
  let searchFrom = fromIndex;
  while (searchFrom < markdown.length) {
    const commentStart = markdown.indexOf('<!--', searchFrom);
    if (commentStart === -1) {
      return -1;
    }
    const commentEnd = markdown.indexOf('-->', commentStart + 4);
    if (commentEnd === -1) {
      return -1;
    }
    const normalized = trimCommentWhitespace(markdown.slice(commentStart + 4, commentEnd));
    if (normalized === markerBody) {
      return commentStart;
    }
    searchFrom = commentEnd + 3;
  }
  return -1;
}

/**
 * @param {string} markdown
 * @param {number} markerStart
 * @param {string} markerBody
 * @returns {number}
 */
function commentMarkerEnd(markdown, markerStart, markerBody) {
  const commentEnd = markdown.indexOf('-->', markerStart + 4);
  if (commentEnd === -1) {
    return markerStart + markerBody.length;
  }
  return commentEnd + 3;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeCodeBlocks(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const kept = [];
  let inFence = false;
  /** @type {string | undefined} */
  let fenceMarker;

  for (const line of lines) {
    const opening = FENCE_OPEN_RE.exec(line);
    if (!inFence && opening) {
      inFence = true;
      fenceMarker = opening[2];
      continue;
    }
    if (inFence && fenceMarker) {
      const closing = FENCE_CLOSE_RE.exec(line);
      if (closing?.[2] === fenceMarker) {
        inFence = false;
        fenceMarker = undefined;
        continue;
      }
    }
    if (!inFence) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeHtmlComments(markdown) {
  let result = '';
  let index = 0;
  while (index < markdown.length) {
    const start = markdown.indexOf('<!--', index);
    if (start === -1) {
      result += markdown.slice(index);
      break;
    }
    result += markdown.slice(index, start);
    const end = markdown.indexOf('-->', start + 4);
    if (end === -1) {
      result += markdown.slice(start);
      break;
    }
    index = end + 3;
  }
  return result;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeInlineCode(markdown) {
  let result = '';
  let index = 0;
  while (index < markdown.length) {
    const tick = markdown.indexOf('`', index);
    if (tick === -1) {
      result += markdown.slice(index);
      break;
    }
    result += markdown.slice(index, tick);
    if (tick > 0 && markdown[tick - 1] === '\\') {
      result += '`';
      index = tick + 1;
      continue;
    }
    const close = markdown.indexOf('`', tick + 1);
    if (close === -1) {
      result += markdown.slice(tick);
      break;
    }
    index = close + 1;
  }
  return result;
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isHtmlWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * @param {string} text
 * @param {number} from
 * @returns {number}
 */
function skipHtmlWhitespace(text, from) {
  let cursor = from;
  while (cursor < text.length && isHtmlWhitespace(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

/**
 * @param {string} lower
 * @param {number} attrIndex
 * @param {number} attrLength
 * @returns {boolean}
 */
function isAttributeToken(lower, attrIndex, attrLength) {
  const before = attrIndex === 0 ? '' : lower[attrIndex - 1];
  const afterAttr = lower[attrIndex + attrLength];
  const isBoundaryBefore = before === '' || isHtmlWhitespace(before) || before === '>' || before === '/';
  const isBoundaryAfter = afterAttr === undefined || isHtmlWhitespace(afterAttr) || afterAttr === '=';
  return isBoundaryBefore && isBoundaryAfter;
}

/**
 * @param {string} tagSource
 * @param {number} nameEnd
 * @returns {string | undefined}
 */
function readQuotedValueAfterName(tagSource, nameEnd) {
  let cursor = skipHtmlWhitespace(tagSource, nameEnd);
  if (tagSource[cursor] !== '=') {
    return undefined;
  }
  cursor = skipHtmlWhitespace(tagSource, cursor + 1);
  const quote = tagSource[cursor];
  if (quote !== '"' && quote !== '\'') {
    return undefined;
  }
  cursor += 1;
  let value = '';
  while (cursor < tagSource.length && tagSource[cursor] !== quote) {
    value += tagSource[cursor];
    cursor += 1;
  }
  return value;
}

/**
 * @param {string} tagSource
 * @param {string} attributeName
 * @returns {string | undefined}
 */
function readQuotedAttribute(tagSource, attributeName) {
  const lower = tagSource.toLowerCase();
  const attr = attributeName.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const attrIndex = lower.indexOf(attr, searchFrom);
    if (attrIndex === -1) {
      return undefined;
    }
    if (!isAttributeToken(lower, attrIndex, attr.length)) {
      searchFrom = attrIndex + attr.length;
      continue;
    }
    const value = readQuotedValueAfterName(tagSource, attrIndex + attr.length);
    if (value !== undefined) {
      return value;
    }
    searchFrom = attrIndex + attr.length;
  }
  return undefined;
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function extractHtmlSectionIds(markdown) {
  const sections = [];
  let index = 0;
  while (index < markdown.length) {
    const open = markdown.indexOf('<', index);
    if (open === -1) {
      break;
    }
    const close = markdown.indexOf('>', open + 1);
    if (close === -1) {
      break;
    }
    const tag = markdown.slice(open, close + 1);
    const id = readQuotedAttribute(tag, 'id');
    if (id !== undefined) {
      sections.push(id);
    }
    const tagNameMatch = TAG_NAME_RE.exec(tag);
    const tagName = tagNameMatch?.[1]?.toLowerCase();
    if (tagName === 'a') {
      const name = readQuotedAttribute(tag, 'name');
      if (name !== undefined) {
        sections.push(name);
      }
    }
    index = close + 1;
  }
  return sections;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeDisableEnableRegions(markdown) {
  let result = markdown;
  while (true) {
    const disableIndex = indexOfCommentMarker(result, 0, 'markdown-link-check-disable');
    if (disableIndex === -1) {
      break;
    }
    const enableIndex = indexOfCommentMarker(
      result,
      disableIndex + 1,
      'markdown-link-check-enable'
    );
    if (enableIndex === -1) {
      break;
    }
    const removeEnd = commentMarkerEnd(result, enableIndex, 'markdown-link-check-enable');
    result = result.slice(0, disableIndex) + result.slice(removeEnd);
  }
  return result;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeTrailingDisableRegions(markdown) {
  let result = markdown;
  while (true) {
    const disableIndex = indexOfCommentMarker(result, 0, 'markdown-link-check-disable');
    if (disableIndex === -1) {
      break;
    }
    const enableIndex = indexOfCommentMarker(
      result,
      disableIndex + 1,
      'markdown-link-check-enable'
    );
    if (enableIndex !== -1) {
      break;
    }
    result = result.slice(0, disableIndex);
  }
  return result;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeDisableNextLineRegions(markdown) {
  let result = '';
  let index = 0;
  while (index < markdown.length) {
    const markerIndex = indexOfCommentMarker(
      markdown,
      index,
      'markdown-link-check-disable-next-line'
    );
    if (markerIndex === -1) {
      result += markdown.slice(index);
      break;
    }
    result += markdown.slice(index, markerIndex);
    let cursor = commentMarkerEnd(markdown, markerIndex, 'markdown-link-check-disable-next-line');
    if (markdown.startsWith('\r\n', cursor)) {
      cursor += 2;
    } else if (markdown[cursor] === '\n') {
      cursor += 1;
    }
    const lineEnd = markdown.indexOf('\n', cursor);
    if (lineEnd === -1) {
      index = markdown.length;
    } else if (markdown[lineEnd - 1] === '\r') {
      index = lineEnd + 1;
    } else {
      index = lineEnd + 1;
    }
  }
  return result;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function lineHasDisableLineMarker(line) {
  return indexOfCommentMarker(line, 0, 'markdown-link-check-disable-line') !== -1;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function removeDisableLineRegions(markdown) {
  return markdown
    .split(/\r?\n/u)
    .filter((line) => !lineHasDisableLineMarker(line))
    .join('\n');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function stripDisabledLinkCheckRegions(markdown) {
  let result = markdown;
  result = removeDisableEnableRegions(result);
  result = removeTrailingDisableRegions(result);
  result = removeDisableNextLineRegions(result);
  result = removeDisableLineRegions(result);
  return result;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function prepareMarkdownForHtmlSectionScan(markdown) {
  let prepared = removeCodeBlocks(markdown);
  prepared = removeHtmlComments(prepared);
  prepared = removeInlineCode(prepared);
  return prepared;
}

module.exports = {
  removeCodeBlocks,
  removeHtmlComments,
  removeInlineCode,
  extractHtmlSectionIds,
  stripDisabledLinkCheckRegions,
  prepareMarkdownForHtmlSectionScan,
  readQuotedAttribute,
  indexOfCommentMarker,
};