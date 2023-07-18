/**
 * @fileoverview This module encapsulates the logic to produce memory-efficient CSV record generator for a CSV file
 * with Node stream API.
 */

const fs = require('node:fs');
const {parse} = require('csv-parse');

/**
 * Generator function to load and parse records from large CSV files
 * "on demand" (when processing loop is ready for more data).
 * 
 * Using generator function prevents loading the entire file into memory. 
 * DOC: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
 * 
 * @param {string}  csvFilePath - The path to the input CSV file
 */
async function* getRecordGenerator_Async(csvFilePath, startIndex = 1, rowsToImport = 1) {
    const parser = fs.createReadStream(csvFilePath)
        .pipe(parse({
            columns: true,
            from: startIndex,
            to: startIndex + rowsToImport - 1
        }));

    for await (const record of parser) {
        yield record;
    }
}

module.exports = {
    getRecordGenerator_Async
};

