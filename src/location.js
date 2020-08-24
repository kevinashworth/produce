const fs = require('fs');
const glob = require('glob');
const difference = require('lodash/difference');
const remove = require('lodash/remove');
const mkdirp = require('mkdirp');
const path = require('path');
const puppeteer = require('puppeteer');

const chalk = require('chalk');
const error = chalk.bold.red;
const success = chalk.bold.green;
const verbose = chalk.bold.yellow;

const CONFIG = require('./config.js');
const CREDENTIALS = require('./credentials.js');

const USERNAME_SELECTOR = '#edit-name';
const PASSWORD_SELECTOR = '#edit-pass';
const LOGIN_BUTTON_SELECTOR = '#sagaftra-login-button-submit';
const SEARCH_BUTTON = '#edit-submit';
const LOCATION_SELECTOR = 'select#edit-location';
const LISTINGS_AVAILABLE = '#production_listings_results #production_listings';
const LISTINGS_SELECTOR = '#production_listings > [id^=row]';

const LOCATION = 'LA';
const OUTPUT_DIR = `./output/location/${LOCATION}`; // assumes we run `node src/location.js`

// reminder: runs in browser context
const handleListingsPageFn = (nodeListArray) => {
  return nodeListArray.map(listing => {
    const [id] = listing.id.match(/\d+/g);
    return {
      id,
      production: listing.children[1].innerText,
      type: listing.children[2].innerText,
      local: listing.children[3].innerText,
      startEndDates: listing.children[4].innerText
    };
  });
};

// reminder: runs in browser context
const handleDetailsPageFn = (detailsElement) => {
  const results = {};
  const shootingLocations = [];
  const alternateTitles = [];
  const children = Array.from(detailsElement.children);
  children.pop(); // last child is always an empty 'p' tag

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.children[0]) {
      // first, deal with two-parters here (shootingLocations, alternateTitles)
      if (i < children.length - 1) {
        const nextChild = children[i + 1];
        const nextChildren = nextChild && nextChild.children && Array.from(nextChild.children);
        if (nextChildren && nextChildren[0] && nextChildren[0].tagName === 'LI') {
          if (child.innerText.indexOf('Shooting Locations') === 0) {
            nextChildren.forEach(location => {
              shootingLocations.push(location.innerText);
            });
            results.shootingLocations = shootingLocations;
          } else if (child.innerText.indexOf('Alternate Titles') === 0) {
            nextChildren.forEach(title => {
              alternateTitles.push(title.innerText);
            });
            results.alternateTitles = alternateTitles;
          }
          // important next two lines
          i++;
          continue;
        }
      }
      // else, deal with one-parters
      const name = child.children[0].innerText.replace(/\W/g, '');
      const nameKey = _.camelCase(name);
      const nameFull = child.innerHTML;
      const nameSpan = child.children[0].outerHTML;
      const nameValue = nameFull.substring(nameSpan.length).trim();
      results[nameKey] = nameValue;
    }
  }
  return results;
};

(async () => {
  const timeStart = new Date();
  console.log('Start time:', timeStart);

  let existingFiles = null;
  mkdirp(OUTPUT_DIR + '/archive').then(made => {
    if (made) {
      console.log(verbose(`mkdirp ${made}`));
    }
  });
  glob(OUTPUT_DIR + '/*.json', null, function (err, files) {
    if (err) throw err;
    existingFiles = files.map(file => path.basename(file)).sort();
    console.log(verbose(`${existingFiles.length} existing files on disk:`));
    console.log(existingFiles);
  });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log(verbose('Created page.'));
  await page.setUserAgent(CONFIG.USER_AGENT);
  await page.setViewport({
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT
  });
  await page.goto('https://www.sagaftra.org/contracts-industry-resources/production-listings');
  await page.type(USERNAME_SELECTOR, CREDENTIALS.username);
  await page.type(PASSWORD_SELECTOR, CREDENTIALS.password);
  await page.click(LOGIN_BUTTON_SELECTOR);
  await page.waitForNavigation();
  console.log(success('Logged in to Production Listings.'));
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  await page.select(LOCATION_SELECTOR, LOCATION);
  await page.click(SEARCH_BUTTON);
  await page.waitForSelector(LISTINGS_AVAILABLE);
  var listings = await page.$$eval(LISTINGS_SELECTOR, handleListingsPageFn);
  if (!listings) {
    console.log(error('No listings for', LOCATION));
  }

  // find the files that are only in existingFiles, will move to archive
  const listingsIds = listings.map((listing) => listing.id + '.json').sort();
  console.log(verbose(`${listingsIds.length} listings on page:`));
  console.log(listingsIds);
  const toArchive = difference(existingFiles, listingsIds);
  if (toArchive.length > 0) {
    console.log(verbose(`${toArchive.length} being moved to archive:`));
    console.log(toArchive);
    for (let i = 0; i < toArchive.length; i++) {
      const file = toArchive[i];
      const fromPath = OUTPUT_DIR + '/' + file;
      const toPath = OUTPUT_DIR + '/archive/' + file;
      fs.renameSync(fromPath, toPath);
      console.log('Moved %s to %s', fromPath, toPath);
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
      const details = await page.$eval(detailsSelector, handleDetailsPageFn);
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
    var randomSeconds = Math.floor(Math.random() * 7000) + 3000; // 3 to 10 seconds
    await page.waitFor(randomSeconds);
  }

  console.log(success('Finished with', listings.length, 'listings.'));
  const outFile = OUTPUT_DIR + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(success(outFile, 'has been saved.'));
  });

  await page.waitFor(1500);
  await browser.close();
  const timeStop = new Date();
  console.log('Stop time:', timeStop);
  const duration = Math.floor((timeStop - timeStart) / 1000);
  console.log(`Program took ${duration} seconds.`);
})();
