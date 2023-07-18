/**
 * @fileoverview This module encapsulates the logic to display progress bars using the 'cli-progress' library.
 */
const progress = require('cli-progress');

// Create a multi bar container
const _multiBar = new progress.MultiBar({
    clearOnComplete: false,
    hideCursor: true
});
let _statusBar = null;
let _progressBar = null;


/**
 * Initializes the 'cli-progress' progress bars for the migration process.
 * 
 * @param {string} filePath - The path to the migration input CSV file
 */
async function init_Async(totalToImport) {
    const init_stats = {
        concurrent: 0,
        succeeded: 0,
        failed: 0
    };
    _progressBar = _multiBar.create(totalToImport, 0, init_stats, {
        format: '(🔀{concurrent}) ⏳ [{bar}] ETA: {eta_formatted}',
        fps: 5
    });
    _statusBar = _multiBar.create(totalToImport, 0, init_stats, {
        format: 'Attempted: {value} (✅{succeeded} /❌{failed}) out of {total}',
        fps: 5
    });
}

/**
 * Updates the 'cli-progress' progress bars for the migration process.
 * 
 * @param {int} concurrent - The count of currently running concurrent upload requests
 * @param {int} attempted - The count of attempted migration operations
 * @param {int} succeeded - The count of succeeded migration operations
 * @param {ing} failed - The count of failed migration operations
 */
function update(concurrent, attempted, succeeded, failed) {
    _progressBar.update(attempted, { succeeded, failed, concurrent });
    _statusBar.update(attempted, { succeeded, failed, concurrent });
}

/**
 * Stops the 'cli-progress' progress bars for the migration process.
 */
function stop() {
    _multiBar.stop();
}

module.exports = {
    init_Async,
    update,
    stop
}