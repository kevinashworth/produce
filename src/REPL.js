/* eslint-disable */
const puppeteer = require('puppeteer');
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

let listings;
const handleListings = (results) => {
  listings = results.map(listing => {
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

let details;
const handleDetails = (el) => {
  details = el.innerHTML;
};

puppeteer.launch({ headless: false }).then(b => global.browser = b);
browser.newPage().then(p => global.page = p);
page.goto('https://www.sagaftra.org/contracts-industry-resources/production-listings');
page.type(USERNAME_SELECTOR, CREDENTIALS.username);
page.type(PASSWORD_SELECTOR, CREDENTIALS.password);
page.click(LOGIN_BUTTON_SELECTOR);
// page.waitForNavigation();
page.select(LOCATION_SELECTOR, LOCATION);
page.click(LOCATION_SEARCH_BUTTON);
page.waitForSelector(LISTINGS_AVAILABLE);
page.$$eval(LISTINGS_SELECTOR, handleListings).then((results) => {console.log(results);});

const i = 0;
const listing = listings[i];
const { id } = listing;
const clickSelector = `#click-${id}`;
const detailsAvailable = `#result-${id}.fulldetail.openDetail ul`;
const detailsSelector = `#result-${id}.fulldetail.openDetail`;

page.click(clickSelector);
page.waitForSelector(detailsAvailable);
page.$eval(detailsSelector, handleDetails);
// eslint-disable-next-line
debugger;
listings[i].details = details;
page.waitFor(600);
