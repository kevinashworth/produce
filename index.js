const puppeteer = require('puppeteer');
const fs = require('fs');
const CREDENTIALS = require('./credentials.js');

const USERNAME_SELECTOR = '#edit-name';
const PASSWORD_SELECTOR = '#edit-pass';
const LOGIN_BUTTON_SELECTOR = '#sagaftra-login-button-submit';
const LOCATION_SELECTOR = 'select#edit-location';
const LOCATION_SEARCH_BUTTON = '#edit-submit';
// const LOCATIONS = [
//   {
//     label: 'Los Angeles',
//     value: 'LA'
//   },
//   {
//     label: 'Atlanta',
//     value: 'GA'
//   },
//   {
//     label: 'Chicago',
//     value: 'CH'
//   },
//   {
//     label: 'Arizona-Utah',
//     value: 'AZ'
//   },
//   {
//     label: 'New England',
//     value: 'BO'
//   }
// ];
const LOCATION = 'LA';
const LISTINGS_AVAILABLE = '#production_listings_results #production_listings';
const LISTINGS_SELECTOR = '#production_listings > [id^=row]';

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
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  // page.on('console', msg => console.log('page.log:', msg.text()));
  await page.goto('https://www.sagaftra.org/contracts-industry-resources/production-listings');
  await page.type(USERNAME_SELECTOR, CREDENTIALS.username);
  await page.type(PASSWORD_SELECTOR, CREDENTIALS.password);
  await page.click(LOGIN_BUTTON_SELECTOR);
  await page.waitForNavigation();
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  await page.select(LOCATION_SELECTOR, LOCATION);
  await page.click(LOCATION_SEARCH_BUTTON);
  await page.waitForSelector(LISTINGS_AVAILABLE);
  const listings = await page.$$eval(LISTINGS_SELECTOR, handleListings);

  for (let i = 0; i < listings.length; i++) {
    let listing = listings[i];
    const { id } = listing;
    const clickSelector = `#click-${id}`;
    const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
    const detailsSelector = `#result-${id}.fulldetail.openDetail`;

    await page.click(clickSelector);
    await page.waitForSelector(detailsAvailable);
    const details = await page.$eval(detailsSelector, handleDetails);
    // eslint-disable-next-line
    // debugger;
    listing = { ...listing, ...details };
    console.log('listing', i, ':', listing)
    listings[i] = listing;
    await page.waitFor(50000);
  }

  const outFile = './output/' + LOCATION + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(outFile, 'was saved!');
  });

  await page.waitFor(2000);
  await browser.close();
})();

// handle locations first
// const locations = [];
// if (children[children.length - 2].innerText.indexOf('Shooting Locations') === 0) {
//   const items = Array.from(children[children.length - 1].children);
//   items.forEach(location => {
//     locations.push(location.innerText);
//     console.log('locations:', locations);
//   })
// }
// results.locations = locations;
// // remove locations before proceeding
// children.pop();
// children.pop();
