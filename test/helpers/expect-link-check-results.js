'use strict';

/**
 * @param {import('expect.js')} expect
 * @param {Array<{ statusCode: number, status: string }>} results
 * @param {Array<{ statusCode: number, status: string }>} expected
 */
function expectLinkCheckResults(expect, results, expected) {
    expect(results.length).to.be(expected.length);

    for (let i = 0; i < results.length; i++) {
        expect(results[i].statusCode).to.be(expected[i].statusCode);
        expect(results[i].status).to.be(expected[i].status);
    }
}

module.exports = { expectLinkCheckResults };