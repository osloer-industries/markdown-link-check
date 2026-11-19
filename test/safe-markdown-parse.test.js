'use strict';

const expect = require('expect.js');
const {
  removeCodeBlocks,
  removeHtmlComments,
  removeInlineCode,
  extractHtmlSectionIds,
  stripDisabledLinkCheckRegions,
  prepareMarkdownForHtmlSectionScan,
  readQuotedAttribute,
} = require('../safe-markdown-parse');

describe('safe-markdown-parse', function () {
  it('removes fenced code blocks without backtracking', function () {
    const input = [
      '# Title',
      '```',
      '<a id="hidden"></a>',
      '```',
      '<a id="visible"></a>',
    ].join('\n');
    const stripped = removeCodeBlocks(input);
    expect(stripped).to.contain('visible');
    expect(stripped).not.to.contain('hidden');
  });

  it('removes HTML comments in linear time', function () {
    const input = 'before <!-- ignore <a id="x"></a> --> after';
    expect(removeHtmlComments(input)).to.eql('before  after');
  });

  it('removes inline code while honoring backslash escapes', function () {
    const input = 'visible `<a id="in_code"></a>` hidden';
    const withoutCode = removeInlineCode(input);
    expect(withoutCode).to.contain('visible');
    expect(withoutCode).not.to.contain('in_code');
    expect(removeInlineCode(String.raw`\`<a id="kept"></a>\``)).to.contain('kept');
  });

  it('drops headings inside fenced blocks that use an info string', function () {
    const input = ['```bash', '# heading-in-code', '```', '# real-heading'].join('\n');
    const stripped = removeCodeBlocks(input);
    expect(stripped).to.contain('real-heading');
    expect(stripped).not.to.contain('heading-in-code');
  });

  it('extracts HTML section ids from prepared markdown', function () {
    const input = [
      '<a id="tomato_id"></a>',
      '<a name="tomato_name"></a>',
      '<div id="onion"></div>',
    ].join('\n');
    const ids = extractHtmlSectionIds(prepareMarkdownForHtmlSectionScan(input));
    expect(ids).to.eql(['tomato_id', 'tomato_name', 'onion']);
  });

  it('reads quoted attributes without regex backtracking', function () {
    expect(readQuotedAttribute('<div id="foo-bar"></div>', 'id')).to.eql('foo-bar');
    expect(readQuotedAttribute("<a name='baz'></a>", 'name')).to.eql('baz');
  });

  it('strips markdown-link-check disable regions like the legacy patterns', function () {
    const input = [
      '![alive](ok.jpg)',
      '<!-- markdown-link-check-disable -->',
      '![dead](nope.jpg)',
      '<!-- markdown-link-check-enable -->',
      '<!-- markdown-link-check-disable-next-line -->',
      '![dead](nope.jpg)',
      '![dead](nope.jpg) <!-- markdown-link-check-disable-line -->',
      '<!-- markdown-link-check-disable -->',
      '![dead](nope.jpg)',
    ].join('\n');
    const stripped = stripDisabledLinkCheckRegions(input);
    expect(stripped).to.contain('ok.jpg');
    expect(stripped.match(/nope\.jpg/g)).to.be(null);
  });

  it('finishes quickly on adversarial comment-heavy input', function () {
    const padding = 'x'.repeat(8000);
    const input = `${padding}<!-- ${'y'.repeat(4000)} -->${padding}`;
    const start = Date.now();
    const output = removeHtmlComments(input);
    const elapsed = Date.now() - start;
    expect(output).not.to.contain('<!--');
    expect(elapsed).to.be.below(500);
  });
});