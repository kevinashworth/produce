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

const PRODTYPE_ALL = CONSTANTS.PRODTYPES[0].value;
// const LOCATIONS = CONSTANTS.LOCATIONS_AT_ONCE;
// const LOCATIONS = CONSTANTS.LOCATIONS_OTHERS;
const LOCATIONS = ['LA'];

const handlers = require('./handlers.js');

(async () => {
  /* ***************************** */
  let browser;
  let cookiesFile;
  let page;
  let timeStart;

  const before = async () => {
    // 1 setup
    timeStart = new Date();
    console.log('Start time:', timeStart.toLocaleString());

    browser = await puppeteer.launch();
    page = await browser.newPage();
    console.log('Created the Puppeteer Page.');
    await page.setUserAgent(PAGE_CONFIG.USER_AGENT);
    await page.setViewport({
      width: PAGE_CONFIG.WIDTH,
      height: PAGE_CONFIG.HEIGHT
    });

    // 2 if cookies file exists, read cookies
    cookiesFile = path.join(homedir, CONFIG.OUTPUT_DIR) + '/cookies.json';
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

    // 3 go to start
    await page.goto(CONFIG.START_URL);
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
    });

    // 4 log in, if cookies did not
    const isLogInForm = await page.$(SELECTORS.USERNAME_SELECTOR);
    const isThePage = await page.$(SELECTORS.PRODTYPE_SELECTOR);

    if (isLogInForm) {
      await page.type(SELECTORS.USERNAME_SELECTOR, CREDENTIALS.USER);
      await page.type(SELECTORS.PASSWORD_SELECTOR, CREDENTIALS.PASS);
      await page.click(SELECTORS.LOGIN_BUTTON_SELECTOR);
      await page.waitForNavigation();
      console.log('Logged in to Production Listings.');
    } else if (isThePage) {
      console.log('Cookies got us to Production Listings.');
    } else {
      console.log(error('WTF?'));
    }
  };

  const beforeEach = async (location) => {
    console.log(verbose(`Begin "for" loop (${location})`));
    if (page.url !== CONFIG.START_URL) {
      await page.goto(CONFIG.START_URL);
      await page.addScriptTag({
        url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
      });
    }
  };

  const afterEach = (location) => {
    console.log(success(`End "for" loop (${location})`));
  };

  const after = async () => {
    // save session cookies
    const cookies = await page.cookies();
    cookies.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFile(cookiesFile, JSON.stringify(cookies, null, 2), (err) => {
      if (err) throw err;
      console.log('Cookies have been saved to', cookiesFile);
    });

    await page.waitForTimeout(1500);
    await browser.close();
    const timeStop = new Date();
    console.log('Stop time:', timeStop.toLocaleString());
    const duration = Math.floor((timeStop - timeStart) / 1000);
    console.log(`Program took ${duration} seconds.`);
  };

  /* ***************************** */
  await before();

  for (const location of LOCATIONS) {
    await beforeEach(location);

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

    afterEach(location);
  }

  await after();
  /* ***************************** */
})();
