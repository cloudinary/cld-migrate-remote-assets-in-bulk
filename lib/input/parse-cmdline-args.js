/**
 * @fileoverview Parses arguments from the command line. 
 */

const fs = require('node:fs');
const path = require('node:path');
const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const {terminalWidth} = require('yargs');

const toolDescriptionAndUsage = `
Migrates remote assets from a CSV file to Cloudinary via Cloudinary Upload API.

Implements
 - Memory-efficient processing of large input CSV file
 - Customizeable mapping of CSV records to Cloudinary Upload API parameters -- see the __input-to-api-payload.js module
 - Concurrent uploads (up to the specified limit)
 - Ongoing progress reporting
 - Migration log file (JSONL)
 - Customizeable migration report file (CSV) -- see the __log-to-report.js module

Usage: $0 --from-csv-file <path> --output-folder <path> --max-concurrent-uploads <number> --number-to-import <number>

🤓 To prevent unintentional override of log or report files from prior executions, the script does not proceed if the output folder already contains migration log or report files.`

// Define command line arguments using yargs
const cmdline_args = yargs(hideBin(process.argv))
  .usage(toolDescriptionAndUsage)
  .help('help').alias('help', 'h')
  .option('from-csv-file', {
    alias: 'f',
    description: 'CSV file detailing assets to import',
    type: 'string',
    demandOption: true, // Required argument
    coerce: path => {
      if (!fs.existsSync(path)) {
        throw new Error(`File does not exist: ${path}`);
      }
      return path;
    }
  })
  .option('output-folder', {
    alias: 'o',
    description: 'Folder name for the migration log and report files',
    type: 'string',
    demandOption: true, // Required argument
    coerce: folder => {
      const logFilePath = getLogFilePath(folder);
      const logFileExists = fs.existsSync(logFilePath);

      const reportFilePath = getReportFilePath(folder);
      const reportFileExists = fs.existsSync(reportFilePath);

      if (logFileExists || reportFileExists) {
        const logFileCallout = logFileExists ? `❗️ Migration log file ${logFilePath} already exists.\n` : '';
        const reportFileCallout = reportFileExists ? `❗️ Migration report file ${reportFilePath} already exists.\n` : '';
        let message = `${logFileCallout}${reportFileCallout}\n`;
        message += "💡 To prevent unintentional data loss for large migration batches please specify a different output folder or move/rename the existing files.";
        throw new Error(message);
      }

      // Creating output folder if it does not exist yet
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
      }

      return folder;
    }
  })
  .option('max-concurrent-uploads', {
    alias: 'c',
    description: 'Max number of concurrent uploads',
    type: 'number',
    demandOption: true, // Required argument
    coerce: value => {
      const intValue = parseInt(value, 10);
      if (isNaN(intValue) || intValue < 1 || intValue > 20) {
        throw new Error(`Invalid value for max concurrent uploads: ${value}`);
      }
      return intValue;
    }
  })
  .option('number-to-import', {
    alias: 'n',
    description: 'Number of assets to import',
    type: 'number',
    demandOption: false, // Required argument
    coerce: value => {
      const intValue = parseInt(value, 10);
      if (isNaN(intValue) || intValue < 1) {
        throw new Error(`Invalid value for number of assets to import: ${value}`);
      }
      return intValue;
    }
  })
  .option('rows-to-skip', {
    alias: 's',
    description: 'Number of rows to skip when importing',
    type: 'number',
    demandOption: false, // Required argument
    coerce: value => {
      const intValue = parseInt(value, 10);
      if (isNaN(intValue) || intValue < 1) {
        throw new Error(`Invalid value for number of rows to skip: ${value}`);
      }
      return intValue;
    }
  })
  .wrap(terminalWidth())
  .argv;

function getLogFilePath(outputFolder) {
  return path.join(outputFolder, 'log.jsonl');
}

function getReportFilePath(outputFolder) {
  return path.join(outputFolder, 'report.csv');
}

module.exports = {
    fromCsvFile           : cmdline_args['from-csv-file'],
    maxConcurrentUploads  : cmdline_args['max-concurrent-uploads'],
    numberToImport        : cmdline_args['number-to-import'],
    rowsToSkip            : cmdline_args['rows-to-skip'],
    logFile               : getLogFilePath(cmdline_args['output-folder']),
    reportFile            : getReportFilePath(cmdline_args['output-folder'])
}