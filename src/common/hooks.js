import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import homedir from 'os';
import CREDENTIALS from '../config/credentials.js';
import CONFIG from '../config/config.js';
import PAGE_CONFIG from '../config/page-config.js';
import SELECTORS from './selectors.js';

const error = chalk.bold.red;
const success = chalk.bold.green;
const verbose = chalk.bold.yellow;

export const before = async () => {
  // 1 setup
  const timeStart = new Date();
  console.log('Start time:', timeStart.toLocaleString());

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log('Created the Puppeteer Page.');
  await page.setDefaultNavigationTimeout(0);
  await page.setUserAgent(PAGE_CONFIG.USER_AGENT);
  await page.setViewport({
    width: PAGE_CONFIG.WIDTH,
    height: PAGE_CONFIG.HEIGHT
  });

  // 2 if cookies file exists, read cookies
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

  return {
    browser,
    cookiesFile,
    page,
    timeStart
  };
};

export const beforeEach = async ({ page, msg }) => {
  if (msg) {
    console.log(verbose(msg));
  }
  if (page.url !== CONFIG.START_URL) {
    await page.goto(CONFIG.START_URL);
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
    });
  }
};

export const afterEach = ({ msg }) => {
  if (msg) {
    console.log(success(msg));
  }
};

export const after = async ({
  browser,
  cookiesFile,
  page,
  timeStart
}) => {
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
