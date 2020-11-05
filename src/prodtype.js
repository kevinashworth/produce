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

const CONFIG = require('./config/config.js');
const SELECTORS = require('./common/selectors.js');

const PRODTYPE = 'AG';

const OUTPUT_DIR = path.join(homedir, CONFIG.OUTPUT_DIR, 'prodtype', PRODTYPE);
const OUTPUT_DIR_ARCHIVE = path.join(OUTPUT_DIR, 'archive');
fs.mkdirSync(OUTPUT_DIR_ARCHIVE, { recursive: true });
console.log('Output files will be in', OUTPUT_DIR);

const handlers = require('./common/handlers.js');
const hooks = require('./common/hooks.js');

(async () => {
  const {
    browser,
    cookiesFile,
    page,
    timeStart
  } = await hooks.before();

  await hooks.beforeEach({ page, msg: `Begin (${PRODTYPE})` });

  let existingFiles = null;
  glob(OUTPUT_DIR + '/*.json', null, function (err, files) {
    if (err) throw err;
    existingFiles = files.map(file => path.basename(file)).sort();
    console.log(verbose(`${existingFiles.length} existing files on disk:`));
    console.log(existingFiles);
  });

  await page.select(SELECTORS.PRODTYPE_SELECTOR, PRODTYPE);
  await page.select(SELECTORS.LOCATION_SELECTOR, 'ALL');
  await page.click(SELECTORS.SEARCH_BUTTON);
  await page.waitForSelector(SELECTORS.LISTINGS_AVAILABLE);

  const listings = await page.$$eval(SELECTORS.LISTINGS_SELECTOR, handlers.handleListings);
  if (!listings) {
    console.log(error('No listings for', PRODTYPE));
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
      const toPath = OUTPUT_DIR + '/archive/' + file;
      fs.renameSync(fromPath, toPath);
      console.log('Moved %s to %s', file, toPath);
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
      console.log(success('End of program.'));
      return;
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
      console.log(verbose(`${i + 1} of ${listings.length} (${duration} s) ${outFile} was saved:`));
      console.log(listing);
    });

    // add details back in to listings array for writing to an all-in-one file
    listings[i] = listing;
    const randomSeconds = Math.floor(Math.random() * 5000) + 2000; // 2 to 7 seconds
    await page.waitForTimeout(randomSeconds);
  }

  console.log(success('Finished with', listings.length, 'listings.'));
  const outFile = OUTPUT_DIR + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(success(outFile, 'has been saved.'));
  });

  hooks.afterEach(`End (${PRODTYPE})`);

  await hooks.after({
    browser,
    cookiesFile,
    page,
    timeStart
  });
})();
