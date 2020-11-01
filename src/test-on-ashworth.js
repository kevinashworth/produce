const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 200,
    timeout: 0,
    devtools: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('page.log:', msg.text()));
  await page.goto('http://www.kevinashworth.com/');
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  const divCount = await page.$$eval('div', (divs) => {
    console.log(_.camelCase('DivCount:'), divs.length);
    return divs.length;
  });
  const divs = await page.$$eval('div', (divs) => {
    return divs;
  });
  for (let i = 0; i < divs.length; i++) {
    const randomSeconds = Math.floor(Math.random() * 20000) + 2000; // between 2 and 22 seconds, to appear human
    await page.waitFor(randomSeconds);
  }

  // eslint-disable-next-line
  // debugger;
  console.log(divCount);
  const randomSeconds = Math.floor(Math.random() * 20000) + 2000; // between 2 and 22 seconds, to appear human
  await page.waitFor(randomSeconds);
  await browser.close();
})();
