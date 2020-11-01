const fs = require('fs');
const glob = require('glob');
const difference = require('lodash/difference');
const pull = require('lodash/pull');
const remove = require('lodash/remove');
const homedir = require('os').homedir();
const path = require('path');
const puppeteer = require('puppeteer');

const chalk = require('chalk');
const error = chalk.bold.red;
const success = chalk.bold.green;
const verbose = chalk.bold.yellow;

const CONFIG = require('./config.js');
const CONSTANTS = require('./constants.js');
const CREDENTIALS = require('./credentials.js');
const PAGE_CONFIG = require('./page-config.js');
const SELECTORS = require('./selectors.js');

const PRODTYPE = CONSTANTS.PRODTYPES[0].value; // 0 - ALL
const LOCATION = CONSTANTS.LOCATIONS[6].value; // 1 - GA, 8 - LA, 17 - NY, 22 - SF

const OUTPUT_DIR = path.join(homedir, CONFIG.OUTPUT_DIR, 'location', LOCATION);
const OUTPUT_DIR_ARCHIVE = path.join(OUTPUT_DIR, 'archive');
fs.mkdirSync(OUTPUT_DIR_ARCHIVE, { recursive: true });
console.log(verbose('Output files will be in', OUTPUT_DIR));

const handlers = require('./handlers.js');

(async () => {
  const timeStart = new Date();
  console.log('Start time:', timeStart.toLocaleString());

  let existingFiles = null;
  glob(OUTPUT_DIR + '/*.json', null, function (err, files) {
    if (err) throw err;
    existingFiles = files.map(file => path.basename(file)).sort();
    console.log(verbose(`${existingFiles.length} existing files on disk:`));
    console.log(existingFiles);
  });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log(verbose('Created the Puppeteer Page object.'));
  await page.setUserAgent(PAGE_CONFIG.USER_AGENT);
  await page.setViewport({
    width: PAGE_CONFIG.WIDTH,
    height: PAGE_CONFIG.HEIGHT
  });

  // if cookies file exists, read cookies
  const cookiesFile = path.join(homedir, CONFIG.OUTPUT_DIR) + '/cookies.json';
  const previousSession = fs.existsSync(cookiesFile);
  if (previousSession) {
    const content = fs.readFileSync(cookiesFile);
    const cookies = JSON.parse(content);
    if (cookies.length !== 0) {
      for (const cookie of cookies) {
        await page.setCookie(cookie);
      }
      console.log('Cookies have been loaded in the browser.');
    }
  }

  await page.goto(CONFIG.START_URL);

  // did cookies log us in?
  const isLogInForm = await page.$(SELECTORS.USERNAME_SELECTOR);
  const isThePage = await page.$(SELECTORS.PRODTYPE_SELECTOR);

  if (isLogInForm) {
    await page.type(SELECTORS.USERNAME_SELECTOR, CREDENTIALS.USER);
    await page.type(SELECTORS.PASSWORD_SELECTOR, CREDENTIALS.PASS);
    await page.click(SELECTORS.LOGIN_BUTTON_SELECTOR);
    await page.waitForNavigation();
    console.log(success('Logged in to Production Listings.'));
  } else if (isThePage) {
    console.log(success('Cookies got us to the page; no need to log in.'));
  } else {
    console.log(error('WTF?'));
  }

  // save session cookies
  const cookies = await page.cookies();
  cookies.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFile(cookiesFile, JSON.stringify(cookies, null, 2), (err) => {
    if (err) throw err;
    console.log(verbose('Cookies have been saved to', cookiesFile));
  });

  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  await page.select(SELECTORS.PRODTYPE_SELECTOR, PRODTYPE);
  await page.select(SELECTORS.LOCATION_SELECTOR, LOCATION);
  await page.click(SELECTORS.SEARCH_BUTTON);
  await page.waitForSelector(SELECTORS.LISTINGS_AVAILABLE);

  const listings = await page.$$eval(SELECTORS.LISTINGS_SELECTOR, handlers.handleListings);
  if (!listings) {
    console.log(error('No listings for', LOCATION));
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
      console.log('Moved %s to %s', file, toPath);
    }
    // remove archive files before going thru listings (`remove` mutates `listings`)
    remove(listings, (listing) => {
      return (toArchive.indexOf(listing.id + '.json') > -1);
    });
  } else {
    console.log(verbose('There are no files to archive.'));
  }

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
      await browser.close();
      console.log(success('End of program.'));
      return;
    }
    const clickSelector = `#click-${id}`;
    const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
    const detailsSelector = `#result-${id}.fulldetail.openDetail`;
    try {
      await page.click(clickSelector);
    } catch (e) {
      console.log(error(`page.click error, ${id}:`));
      console.log(e);
      console.log('The "for" loop will now continue.');
      continue;
    }
    try {
      await page.waitForSelector(detailsAvailable);
    } catch (e) {
      console.log(error(`page.waitForSelector error, ${id}:`));
      console.log(e);
      console.log('The "for" loop will now continue.');
      continue;
    }
    try {
      const details = await page.$eval(detailsSelector, handlers.handleDetails);
      listing = { ...listing, ...details };
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
    const randomSeconds = Math.floor(Math.random() * 7000) + 3000; // 3 to 10 seconds
    await page.waitForTimeout(randomSeconds);
  }

  console.log(success('Finished with', listings.length, 'listings.'));
  const outFile = OUTPUT_DIR + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(success(outFile, 'has been saved.'));
  });

  await page.waitForTimeout(1500);
  await browser.close();
  const timeStop = new Date();
  console.log('Stop time:', timeStop.toLocaleString());
  const duration = Math.floor((timeStop - timeStart) / 1000);
  console.log(`Program took ${duration} seconds.`);
})();
