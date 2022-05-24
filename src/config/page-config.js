const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const PAGE_CONFIG = {
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36',
  WIDTH: getRandomInt(1340, 1440),
  HEIGHT: getRandomInt(666, 766)
};

export default PAGE_CONFIG;
