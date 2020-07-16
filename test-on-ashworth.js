var puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    timeout: 0,
    devtools: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE LOG:', msg.text()));
  await page.goto('http://www.kevinashworth.com/');
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'
  });
  const divCount = await page.$$eval('div', (divs) => {
    console.log(_.camelCase('DivCount:'), divs.length);
    return divs.length;
  });
  // eslint-disable-next-line
  // debugger;
  console.log(divCount);
  await page.waitFor(20000);
  await browser.close();
})();
