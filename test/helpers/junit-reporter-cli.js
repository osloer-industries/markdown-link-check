'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const cliPath = path.join(__dirname, '..', '..', 'markdown-link-check');

/**
 * @param {string[]} cliArgs Arguments after the CLI path (e.g. '--reporters', 'junit', filePath)
 * @param {import('node:child_process').SpawnOptions} [spawnOptions]
 */
function spawnMarkdownLinkCheck(cliArgs, spawnOptions) {
    return spawn(process.execPath, [cliPath, ...cliArgs], {
        stdio: 'pipe',
        ...spawnOptions,
    });
}

/**
 * @param {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @returns {Promise<{ stdout: string, exitCode: number | null }>}
 */
function collectChildOutput(child) {
    return new Promise((resolve, reject) => {
        let stdout = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.on('close', (exitCode) => {
            resolve({ stdout, exitCode });
        });

        child.on('error', reject);
    });
}

module.exports = { cliPath, spawnMarkdownLinkCheck, collectChildOutput };