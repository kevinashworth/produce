const puppeteer = require('puppeteer');
const fs = require('fs');
const mkdirp = require('mkdirp');
const CREDENTIALS = require('./credentials.js');
const CONFIG = require('./config.js');

const USERNAME_SELECTOR = '#edit-name';
const PASSWORD_SELECTOR = '#edit-pass';
const LOGIN_BUTTON_SELECTOR = '#sagaftra-login-button-submit';
const SEARCH_BUTTON = '#edit-submit';
const PRODTYPE_SELECTOR = 'select#edit-prodtype';
// const PRODTYPES = [
//   {
//     label: 'All',
//     value: 'ALL'
//   },
//   {
//     label: 'Agnostic',
//     value: 'AG'
//   },
//   {
//     label: 'New Media',
//     value: 'NMA'
//   },
//   {
//     label: 'Television',
//     value: 'TV'
//   },
//   {
//     label: 'Theatrical',
//     value: 'TH'
//   }
// ]
const PRODTYPE = 'TV';
const LISTINGS_AVAILABLE = '#production_listings_results #production_listings';
const LISTINGS_SELECTOR = '#production_listings > [id^=row]';
const OUTPUT_DIR = './output/'; // assumes we run `node src/prodtype.js`

const handleListings = (results) => {
  return results.map(listing => {
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

const handleDetails = (el) => {
  const results = {};
  const shootingLocations = [];
  const alternateTitles = [];
  const children = Array.from(el.children);

  // last child is always an empty 'P' tagName
  children.pop();

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child.children[0]) {
      console.log('This child has no children:', child);
    } else {
      // first deal separately with possible two-parters (shootingLocations, alternateTitles)
      if (i < children.length - 1) {
        const nextChild = children[i + 1];
        const nextChildren = nextChild && nextChild.children && Array.from(nextChild.children);
        if (nextChildren && nextChildren[0] && nextChildren[0].tagName === 'LI') {
          console.log('nextChildren[0] LI:', nextChildren[0].innerText);
          if (child.innerText.indexOf('Shooting Locations') === 0) {
            nextChildren.forEach(location => {
              shootingLocations.push(location.innerText);
              console.log('shootingLocations:', shootingLocations);
            });
            results.shootingLocations = shootingLocations;
          } else if (child.innerText.indexOf('Alternate Titles') === 0) {
            nextChildren.forEach(title => {
              alternateTitles.push(title.innerText);
              console.log('alternateTitles:', alternateTitles);
            });
            results.alternateTitles = alternateTitles;
          } else {
            console.log('Why are we here?!');
          }
          // important next two lines
          i++;
          continue;
        }
      }
      // now process the other one-parters
      const name = child.children[0].innerText.replace(/\W/g, '');
      const nameKey = _.camelCase(name);
      const nameFull = child.innerHTML;
      const nameSpan = child.children[0].outerHTML;
      const nameValue = nameFull.substring(nameSpan.length).trim();
      results[nameKey] = nameValue;
      console.log('results:', results);
    }
  }
  return results;
};

(async () => {
  mkdirp(OUTPUT_DIR + PRODTYPE).then(made => {
    if (made) {
      console.log(`mkdirp made directories, starting with ${made}`);
    }
  });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log('Created page.');
  await page.setUserAgent(CONFIG.USER_AGENT);
  await page.setViewport({
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT
  });
  // page.on('console', msg => console.log('page.log:', msg.text()));
  await page.goto('https://www.sagaftra.org/contracts-industry-resources/production-listings');
  await page.type(USERNAME_SELECTOR, CREDENTIALS.username);
  await page.type(PASSWORD_SELECTOR, CREDENTIALS.password);
  await page.click(LOGIN_BUTTON_SELECTOR);
  await page.waitForNavigation();
  console.log('Logged in to Production Listings.');
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  await page.select(PRODTYPE_SELECTOR, PRODTYPE);
  await page.click(SEARCH_BUTTON);
  await page.waitForSelector(LISTINGS_AVAILABLE);
  const listings = await page.$$eval(LISTINGS_SELECTOR, handleListings);
  if (!listings) {
    console.log('No listings for', PRODTYPE);
  }
  console.log('Going through', listings.length, 'listings.');
  for (let i = 0; i < listings.length; i++) {
    let listing = listings[i];
    const { id } = listing;
    if (id === '0') {
      const outFile = OUTPUT_DIR + PRODTYPE + '/' + id + '.json';
      fs.writeFile(outFile, JSON.stringify(listing, null, 2), (err) => {
        if (err) throw err;
        console.log(outFile, 'was saved:', listing);
      });
      await browser.close();
      console.log('End of program.');
      return;
    }
    const clickSelector = `#click-${id}`;
    const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
    const detailsSelector = `#result-${id}.fulldetail.openDetail`;

    await page.click(clickSelector);
    try {
      await page.waitForSelector(detailsAvailable);
    } catch (e) {
      console.groupCollapsed('waitForSelector error:');
      console.error(e);
      console.log(`error is for listing ${id}.`);
      console.groupEnd();
      console.log('For loop will now continue.');
      continue;
    }
    const details = await page.$eval(detailsSelector, handleDetails);
    // eslint-disable-next-line
    // debugger;
    listing = { ...listing, ...details };

    const outFile = OUTPUT_DIR + PRODTYPE + '/' + id + '.json';
    fs.writeFile(outFile, JSON.stringify(listing, null, 2), (err) => {
      if (err) throw err;
      console.log(outFile, 'was saved:', listing);
    });

    listings[i] = listing;
    var randomSeconds = Math.floor(Math.random() * 4500) + 3000; // between 3 and 7.5 seconds
    await page.waitFor(randomSeconds);
  }
  console.log('Finished with', listings.length, 'listings.');
  const outFile = OUTPUT_DIR + PRODTYPE + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(outFile, 'was saved.');
  });

  await page.waitFor(2000);
  await browser.close();
  console.log('End of program.');
})();
