const puppeteer = require('puppeteer');
const fs = require('fs');

const CREDENTIALS = require('./credentials');
const USERNAME_SELECTOR = '#edit-name';
const PASSWORD_SELECTOR = '#edit-pass';
const LOGIN_BUTTON_SELECTOR = '#sagaftra-login-button-submit';
const LOCATION_SELECTOR = 'select#edit-location';
const LOCATION_SEARCH_BUTTON = '#edit-submit';
// const LOCATIONS = ['AZ', 'GA', 'CH', 'LA'];
const LOCATION = 'AZ';
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
      startenddates: listing.children[4].innerText
    };
  });
};

const handleDetails = (el) => {
  console.log('handleDetails:', el);
  // eslint-disable-next-line
  debugger;
  return el.innerHTML;
};

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    timeout: 0
  });
  const page = await browser.newPage();
  await page.goto('https://www.sagaftra.org/contracts-industry-resources/production-listings');
  await page.type(USERNAME_SELECTOR, CREDENTIALS.username);
  await page.type(PASSWORD_SELECTOR, CREDENTIALS.password);
  await page.click(LOGIN_BUTTON_SELECTOR);
  await page.waitForNavigation();
  await page.select(LOCATION_SELECTOR, LOCATION);
  await page.click(LOCATION_SEARCH_BUTTON);
  await page.waitForSelector(LISTINGS_AVAILABLE);
  const listings = await page.$$eval(LISTINGS_SELECTOR, handleListings);

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const { id } = listing;
    const clickSelector = `#click-${id}`;
    const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
    const detailsSelector = `#result-${id}.fulldetail.openDetail`;

    await page.click(clickSelector);
    await page.waitForSelector(detailsAvailable);
    const details = await page.$eval(detailsSelector, handleDetails);
    // eslint-disable-next-line
    debugger;
    listings[i].details = details;
    await page.waitFor(600);
  }

  const outFile = './output/' + LOCATION + '.json';
  fs.writeFile(outFile, JSON.stringify(listings, null, 2), (err) => {
    if (err) throw err;
    console.log(outFile, 'was saved!');
  });

  await page.waitFor(2000);
  await browser.close();
})();
