#!/usr/bin/env node
/**
 * 💡 Edit the `__input-to-api-payload.js` module to customize how CSV input is "translated" to Cloudinary API payload
 * 
 * Recieves migration parameters from the command line (see `lib/parse-cmdline-args.js` for details)
 * Requires CLOUDINARY_URL environment variable to be set (either explicitly or via a .env file)
 * 
 * Runs migration flow:
 *  - Confirms migration parameters with the user (requires explicit confirmation to proceed)
 *  - Reads the input from the CSV file (uses Nodejs stream API to avoid loading the entire file into memory)
 *  - Runs concurrent migration operations (up to the maxConcurrentUploads parameter)
 *      + Converts each input CSV record to Cloudinary API payload (uses the logic you define in the `__input-to-api-payload.js` module)
 *      + Invokes Cloudinary Upload API with the payload
 *
 * Produces log file with two types of records: `script` (flow="script") and `migration` (flow="migration").
 * The `migration` records contain:
 *  - input (row from CSV file)
 *  - payload (parameters for Cloudinary API produced from the input)
 *  - response (Cloudinary API response)
 *  - summary (migration operation status and error message if it failed)
 * 
 * `migration` records from the log file are then used to produce the migration report using the `2-produce-report.js` script
 */

require('dotenv').config(); // Load environment variables from .env file

const fs = require('fs');
const readline = require('readline');

const async = require('async');
const progress = require('./lib/progress');
const args = require('./lib/input/parse-cmdline-args');
const csvReader = require('./lib/input/csv-file-reader');
const {confirm_Async} = require('./lib/input/confirm-migration-params');
const cloudinary = require('cloudinary').v2;

/* ℹ️ 👇 Modules intended to be customized */
// Logic to convert each CSV record into parameters for the Cloudinary Upload API
const {input2ApiPayload} = require('./__input-to-api-payload');
// Logic to convert migration log file into migration report
const {log2Report} = require('./__log-to-report');


const log = require('./lib/logging')(args.logFile);
const scriptLog = log.script;
const migrationLog = log.migration;

//
// Migration flow implementation
//
(async () => {
    await ensureCloudinaryConfigOrExit_Async();

    const migrationOptions = {
        dest_cloud             : cloudinary.config().cloud_name,
        from_csv_file          : args.fromCsvFile,
        max_concurrent_uploads : args.maxConcurrentUploads,
        number_to_import       : args.numberToImport,
        rows_to_skip           : args.rowsToSkip
    }

    const totalRows = (await countLines_Async(migrationOptions.from_csv_file)) - 1; //account for the headers

    await confirmMigrationOptionsOrExit_Async(migrationOptions, totalRows);

    scriptLog.info(migrationOptions, 'Migration parameters confirmed. Starting migration routine');
    const stats = {
        concurrent: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0
    }

    console.log('\n\n🚚 Starting migration routine');

    const startIndex = migrationOptions.rows_to_skip !== undefined ? migrationOptions.rows_to_skip+1 : 1;
    const totalToImport = migrationOptions.number_to_import || totalRows;

    // Initializing visual progress bar
    await progress.init_Async(totalToImport);

    // Using async generator to avoid loading the entire input file into memory
    const inputRecordGeneratorAsync = csvReader.getRecordGenerator_Async(migrationOptions.from_csv_file, startIndex, totalToImport);

    // Using async.mapLimit to limit the number of concurrent operations
    await async.mapLimit(inputRecordGeneratorAsync, migrationOptions.max_concurrent_uploads, async (input) => {
        let payload = null;
        let response = null;
        let summary = {
            status: 'MIGRATED',
            err: null
        }
        try {
            stats.concurrent += 1;
            stats.attempted += 1;
            payload = input2ApiPayload(input);
            response = await cloudinary.uploader.upload(payload.file, payload.options);
            stats.succeeded += 1;
        } catch (err) {
            stats.failed += 1;
            summary.status = 'FAILED';
            summary.err = err;
        } finally {
            migrationLog.info({input, payload, response, summary});
            progress.update(stats.concurrent, stats.attempted, stats.succeeded, stats.failed);
            stats.concurrent -= 1;
        }
    });
    scriptLog.info({stats}, 'Migration routine complete');
    progress.stop();
    
    console.log(`🏁 Migration routine complete. Summary: ${JSON.stringify(stats)}}`);
    console.log(`🪵  Log persisted to the file: '${log.logFile}'.`);

    await produceMigrationReport_Async();
})();

/**
 * Ensures Cloudinary config is set.
 * Reports error and exits process otherwise. 
 */
async function ensureCloudinaryConfigOrExit_Async() {
    if (!cloudinary.config().cloud_name) {
        const message = 'Cloudinary config is not initialized. Please set CLOUDINARY_URL environment variable (explicitly or via .env file).'
        console.error(`🛑 ${message}`);
        scriptLog.info(message);
        // Allowing bunyan to "catch up" on writing the log file: https://github.com/trentm/node-bunyan/issues/37
        await new Promise(resolve => setTimeout(resolve, 500));
        process.exit(1);
    }
}

/**
 * Prompts user to confirm parameters for the migration operation.
 * If confirmed - returns. Otherwise - exits the script.
 * 
 * @param {Object} migrationOptions 
 * @param {string} migrationOptions.dest_cloud    -  Destination Cloudinary environment (sub-account)
 * @param {string} migrationOptions.from_csv_file -  Path to the CSV file with the migration input
 */
async function confirmMigrationOptionsOrExit_Async(migrationOptions, total) {
    const migrationPrompt = 
`❗️WARNING: This script will perform asset migration with the following parameters:
    - source file           :  '${migrationOptions.from_csv_file}'
    - destination cloud     :  '${migrationOptions.dest_cloud}'
    - max concurrent uploads:  ${migrationOptions.max_concurrent_uploads}
    - number to import      :  ${migrationOptions.number_to_import ? `${migrationOptions.number_to_import} of ${total}` : total}
    - starting at row       :  ${migrationOptions.rows_to_skip ? migrationOptions.rows_to_skip + 1 : 1}
Are you sure you want to proceed?`;
    const promptConfirmed = await confirm_Async(migrationPrompt);
    if (!promptConfirmed) {
        const msg = 'Migration parameters not confirmed. Terminating';
        console.error(`🛑 ${msg}`);
        scriptLog.fatal(migrationOptions, msg);
        // Allowing bunyan to "catch up" on writing the log file: https://github.com/trentm/node-bunyan/issues/37
        await new Promise(resolve => setTimeout(resolve, 500));
        process.exit(1);
    }
}


/**
 * Produces migration report from the migration log file.
 */
async function produceMigrationReport_Async() {
    console.log(`\n\n📋 Producing migration report '${args.reportFile}' from the migration log file`);
    console.log('⏳ This may take some time for large migration batches. You can monitor progress by `tail -f` the migration report file.');
    // Allowing bunyan to "catch up" on writing the log file: https://github.com/trentm/node-bunyan/issues/37
    await new Promise(resolve => setTimeout(resolve, 1500));
    log2Report(args.logFile, args.reportFile);
    console.log(`🏁 Migration report produced.`);
}

/**
 * Counts the number of lines in a file.
 * 
 * @param {string} filePath - The path to the input file
 * @returns {Promise<number>} The count of lines in the file
 */
async function countLines_Async(filePath) {
    return new Promise((resolve, reject) => {
      let lineCount = 0;
      const readStream = fs.createReadStream(filePath);
      const lineReader = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
      });
  
      lineReader.on('line', () => {
        lineCount++;
      });
  
      lineReader.on('close', () => {
        resolve(lineCount);
      });
  
      lineReader.on('error', (err) => {
        reject(err);
      });
    });
  }
  