const fs = require('fs');
const glob = require('glob');
const difference = require('lodash/difference');
const pull = require('lodash/pull');
const remove = require('lodash/remove');
const homedir = require('os').homedir();
const path = require('path');

const chalk = require('chalk');
const error = chalk.bold.red;
const success = chalk.bold.green;
const verbose = chalk.bold.yellow;

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
  .option('locations', {
    alias: 'l',
    type: 'string',
    description: 'Locations to query',
    demandOption: true,
    choices: ['LA', 'three', 'rest']
  })
  .usage('Usage: node $0 --locations=<LA/three/rest>')
  .usage('Usage: node $0 -l <LA/three/rest>')
  .help()
  .argv;

const CONFIG = require('./config/config.js');
const CONSTANTS = require('./common/constants.js');
const SELECTORS = require('./common/selectors.js');

const PRODTYPE_ALL = CONSTANTS.PRODTYPES[0].value;
let LOCATIONS = ['LA'];
switch (argv.locations) {
  case 'LA':
    break;
  case 'three':
    LOCATIONS = CONSTANTS.LOCATIONS_OTHERS;
    break;
  case 'rest':
    LOCATIONS = CONSTANTS.LOCATIONS_AT_ONCE;
    break;
}
console.log('Will run with locations', LOCATIONS);

const handlers = require('./common/handlers.js');
const hooks = require('./common/hooks.js');

(async () => {
  const {
    browser,
    cookiesFile,
    page,
    timeStart
  } = await hooks.before();

  for (const location of LOCATIONS) {
    await hooks.beforeEach({ page, msg: `Begin "for" loop (${location})` });

    const OUTPUT_DIR = path.join(homedir, CONFIG.OUTPUT_DIR, 'location', location);
    const OUTPUT_DIR_ARCHIVE = path.join(OUTPUT_DIR, 'archive');
    fs.mkdirSync(OUTPUT_DIR_ARCHIVE, { recursive: true });
    console.log('Output files will be in', OUTPUT_DIR);

    let existingFiles = null;
    glob(OUTPUT_DIR + '/*.json', null, function (err, files) {
      if (err) throw err;
      existingFiles = files.map(file => path.basename(file)).sort();
      console.log(verbose(`${existingFiles.length} existing files on disk:`));
      console.log(existingFiles);
    });

    await page.select(SELECTORS.PRODTYPE_SELECTOR, PRODTYPE_ALL);
    await page.select(SELECTORS.LOCATION_SELECTOR, location);
    await page.click(SELECTORS.SEARCH_BUTTON);
    await page.waitForSelector(SELECTORS.LISTINGS_AVAILABLE);

    const listings = await page.$$eval(SELECTORS.LISTINGS_SELECTOR, handlers.handleListings);
    if (!listings) {
      console.log(error('No listings for', location));
    }

    // find the files that are only in existingFiles, will move to archive
    const listingsIds = listings.map((listing) => listing.id + '.json').sort();
    console.log(verbose(`${listingsIds.length} listings on page:`));
    console.log(listingsIds);
    const toArchive = difference(existingFiles, listingsIds);
    pull(toArchive, 'zero.json'); // (`pull` mutates `toArchive`)
    if (toArchive.length > 0) {
      console.log(verbose(`${toArchive.length} being moved to archive:`));
      console.log(toArchive);
      for (let i = 0; i < toArchive.length; i++) {
        const file = toArchive[i];
        const fromPath = OUTPUT_DIR + '/' + file;
        const toPath = OUTPUT_DIR_ARCHIVE + '/' + file;
        fs.renameSync(fromPath, toPath);
      }
      // remove archive files before going thru listings (`remove` mutates `listings`)
      remove(listings, (listing) => {
        return (toArchive.indexOf(listing.id + '.json') > -1);
      });
    } else {
      console.log(verbose('There are no files to archive.'));
    }

    // scrape the listings
    console.log(verbose(`${listings.length} listings to process:`));
    for (let i = 0; i < listings.length; i++) {
      let listing = listings[i];
      const { id } = listing;
      if (id === '0') {
        const outFile = OUTPUT_DIR + '/zero.json';
        fs.writeFile(outFile, JSON.stringify(listing, null, 2), (err) => {
          if (err) throw err;
          console.log(verbose(outFile, 'got saved.'));
        });
        console.log(success('End of', location));
        continue;
      }
      const clickSelector = `#click-${id}`;
      const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
      const detailsSelector = `#result-${id}.fulldetail.openDetail`;
      try {
        await page.click(clickSelector);
        await page.waitForSelector(detailsAvailable);
      } catch (e) {
        console.log(error(`page.click or .waitForSelector error, ${id}:`));
        console.log(e);
        console.log('The "for" loop will now continue.');
        continue;
      }
      try {
        const details = await page.$eval(detailsSelector, handlers.handleDetails);
        listing = { ...listing, ...details };
        // don't keep reps
        delete listing.bgClaimsRepresentative;
        delete listing.businessRepresentative;
        delete listing.claimsRepresentative;
      } catch (e) {
        console.log(error(`page.$eval error, ${id}:`));
        console.log(e);
        console.log('The "for" loop will now continue.');
        continue;
      }
      const outFile = OUTPUT_DIR + '/' + id + '.json';
      fs.writeFile(outFile, JSON.stringify(listing, null, 2), (err) => {
        if (err) throw err;
        const timeWrite = new Date();
        const duration = Math.floor((timeWrite - timeStart) / 1000);
        console.log(verbose(`${i + 1}`) + ` of ${listings.length} (${duration} s) ${outFile} was saved:`);
        console.log(listing);
      });

      // add details back in to listings array for writing to an all-in-one file
      listings[i] = listing;
      const randomSeconds = Math.floor(Math.random() * 7000) + 3000; // 3 to 10 seconds
      await page.waitForTimeout(randomSeconds);
    }

    console.log(success('Finished with', listings.length, 'listings.'));
    const outFile = OUTPUT_DIR + '.json';
    fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
      if (err) throw err;
      console.log(success(outFile, 'has been saved.'));
    });

    hooks.afterEach(`End "for" loop (${location})`);
  }

  await hooks.after({
    browser,
    cookiesFile,
    page,
    timeStart
  });
})();
