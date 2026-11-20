'use strict';

const fs = require('fs');
const path = require('path');
const expect = require('expect.js');
const {
    spawnMarkdownLinkCheck,
    collectChildOutput,
} = require('./helpers/junit-reporter-cli');

describe('JUnit Reporter', function () {
    let tempDir;

    before(function () {
        tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
    });

    after(function () {
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            files.forEach((file) => {
                fs.unlinkSync(path.join(tempDir, file));
            });
            fs.rmdirSync(tempDir);
        }
    });

    it('should generate valid JUnit XML for a markdown file with mixed link results', function (done) {
        this.timeout(15000);

        const testMarkdown = `# Test File

## Working Links
- [Google](https://www.google.com)
- [GitHub](https://github.com)

## Local Links
- [README](./README.md)
- [Package](./package.json)

## Dead Links
- [Non-existent](https://this-site-definitely-does-not-exist-12345.com)
`;

        const testFile = path.join(tempDir, 'test-markdown.md');
        const outputFile = path.join(tempDir, 'junit-output.xml');

        fs.writeFileSync(testFile, testMarkdown);

        const child = spawnMarkdownLinkCheck([
            '--reporters',
            'junit',
            '--junit-output',
            outputFile,
            testFile,
        ]);

        collectChildOutput(child)
            .then(({ stdout }) => {
                expect(fs.existsSync(outputFile)).to.be(true);

                const xmlContent = fs.readFileSync(outputFile, 'utf8');

                expect(xmlContent).to.contain('<?xml version="1.0" encoding="UTF-8"?>');
                expect(xmlContent).to.contain('<testsuites name="markdown-link-check"');
                expect(xmlContent).to.contain('<testsuite name="test-markdown"');
                expect(xmlContent).to.contain('</testsuites>');

                const testCaseMatches = xmlContent.match(/<testcase/g);
                expect(testCaseMatches).to.be.ok();
                expect(testCaseMatches.length).to.be.greaterThan(4);

                expect(xmlContent).to.contain('https://www.google.com');
                expect(xmlContent).to.contain('https://github.com');
                expect(xmlContent).to.contain('./README.md');
                expect(xmlContent).to.contain('./package.json');
                expect(xmlContent).to.contain('this-site-definitely-does-not-exist-12345.com');

                expect(xmlContent).to.contain('<failure');
                expect(xmlContent).to.contain('type="DeadLink"');

                expect(xmlContent).to.contain('<testcase name="https://www.google.com"');
                expect(xmlContent).to.contain('<properties>');
                expect(xmlContent).to.contain('<property name="url"');
                expect(xmlContent).to.contain('<property name="status"');
                expect(xmlContent).to.contain('<property name="statusCode"');

                const testsMatch = xmlContent.match(/tests="(\d+)"/);
                const failuresMatch = xmlContent.match(/failures="(\d+)"/);
                const skippedMatch = xmlContent.match(/skipped="(\d+)"/);

                expect(testsMatch).to.be.ok();
                expect(failuresMatch).to.be.ok();
                expect(skippedMatch).to.be.ok();

                const totalTests = parseInt(testsMatch[1], 10);
                const failures = parseInt(failuresMatch[1], 10);
                const skipped = parseInt(skippedMatch[1], 10);

                expect(totalTests).to.be.greaterThan(0);
                expect(failures).to.be.greaterThan(0);
                expect(skipped).to.be.greaterThan(-1);

                expect(stdout).to.contain('JUnit report written to:');
            })
            .then(() => done())
            .catch(done);
    });

    it('should generate JUnit XML with default filename when not specified', function (done) {
        this.timeout(10000);

        const testMarkdown = `# Simple Test
- [Google](https://www.google.com)
`;

        const testFile = path.join(tempDir, 'simple-test.md');
        fs.writeFileSync(testFile, testMarkdown);

        const defaultOutputFile = 'junit-results.xml';

        if (fs.existsSync(defaultOutputFile)) {
            fs.unlinkSync(defaultOutputFile);
        }

        const child = spawnMarkdownLinkCheck(['--reporters', 'junit', testFile]);

        collectChildOutput(child)
            .then(() => {
                expect(fs.existsSync(defaultOutputFile)).to.be(true);

                const xmlContent = fs.readFileSync(defaultOutputFile, 'utf8');
                expect(xmlContent).to.contain('<?xml version="1.0" encoding="UTF-8"?>');
                expect(xmlContent).to.contain('https://www.google.com');

                fs.unlinkSync(defaultOutputFile);
            })
            .then(() => done())
            .catch(done);
    });

    it('should work with both default and junit reporters', function (done) {
        this.timeout(10000);

        const testMarkdown = `# Combined Test
- [Google](https://www.google.com)
- [GitHub](https://github.com)
`;

        const testFile = path.join(tempDir, 'combined-test.md');
        const outputFile = path.join(tempDir, 'combined-output.xml');

        fs.writeFileSync(testFile, testMarkdown);

        const child = spawnMarkdownLinkCheck([
            '--reporters',
            'default,junit',
            '--junit-output',
            outputFile,
            testFile,
        ]);

        collectChildOutput(child)
            .then(({ stdout }) => {
                expect(stdout).to.contain('✓');
                expect(stdout).to.contain('links checked');
                expect(stdout).to.contain('JUnit report written to:');

                expect(fs.existsSync(outputFile)).to.be(true);
                const xmlContent = fs.readFileSync(outputFile, 'utf8');
                expect(xmlContent).to.contain('https://www.google.com');
                expect(xmlContent).to.contain('https://github.com');
            })
            .then(() => done())
            .catch(done);
    });

    it('should handle XML escaping properly in file names', function (done) {
        this.timeout(10000);

        const testMarkdown = `# Escaping Test
- [Simple Link](https://www.google.com)
`;

        const testFile = path.join(tempDir, 'escaping-test & file.md');
        const outputFile = path.join(tempDir, 'escaping-output.xml');

        fs.writeFileSync(testFile, testMarkdown);

        const child = spawnMarkdownLinkCheck([
            '--reporters',
            'junit',
            '--junit-output',
            outputFile,
            testFile,
        ]);

        collectChildOutput(child)
            .then(() => {
                expect(fs.existsSync(outputFile)).to.be(true);

                const xmlContent = fs.readFileSync(outputFile, 'utf8');

                expect(xmlContent).to.contain('escaping-test &amp; file');
                expect(xmlContent).to.contain('<?xml version="1.0" encoding="UTF-8"?>');
                expect(xmlContent).to.contain('https://www.google.com');
            })
            .then(() => done())
            .catch(done);
    });
});