// Damn 2,074 porn images of Paris White downloaded. Might stick to few multiple URLs at a time (but that's just me).
// Okay as of now August 2024 I think I can leave this code for now and should work as expected but I will be testing now and see how it goes.
// Last Updated: 08/01/2024 (mm/dd/yyyy)

const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');
const { promisify } = require('util');
const { createLogger, transports, format } = require('winston');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const puppeteer = require('puppeteer');

const sleep = promisify(setTimeout);

const MAX_RETRIES = 3;
const MIN_SLEEP_DURATION = 1000;
const MAX_SLEEP_DURATION = 3000;

const imagesDirectory = './images';
if (!fs.existsSync(imagesDirectory)) {
  fs.mkdirSync(imagesDirectory);
}

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'app.log' })
  ]
});

// I wanted to add more but I think this will do for now but if want to add more then you can just use a search engine and look for "intext:User agent list txt"
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/18.18363 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; AS; rv:11.0) like Gecko",
  "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; ONEPLUS A6003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/91.0.4472.114 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Mobile/15E148 Safari/604.1"
];

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

async function fetchHtmlContent(url) {
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  logger.info(`Using User-Agent: ${userAgent}`);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await autoScroll(page);
    const content = await page.content();
    await browser.close();
    return content;
  } catch (error) {
    logger.error(`Error fetching URL ${url}: ${error.message}`);
    await browser.close();
    return null;
  }
}

async function getAlbumUrlsFromMainPage(mainPageUrl) {
  const htmlContent = await fetchHtmlContent(mainPageUrl);
  if (!htmlContent) return [];
  
  const $ = cheerio.load(htmlContent);
  const albumLinkElements = $("a.rel-link");
  const albumUrls = [];

  albumLinkElements.each((index, element) => {
    const albumUrl = $(element).attr('href');
    if (albumUrl) {
      albumUrls.push(albumUrl);
    }
  });

  return albumUrls;
}

async function getImageUrlsFromAlbumPage(albumPageUrl) {
  const htmlContent = await fetchHtmlContent(albumPageUrl);
  if (!htmlContent) return [];

  const $ = cheerio.load(htmlContent);
  const imageUrls = new Set();

  $("li.thumbwook a").each((index, element) => {
    const imageUrl = $(element).attr('href');
    if (imageUrl && /https:\/\/cdni\.pornpics\.com\/1280\//.test(imageUrl)) {
      imageUrls.add(imageUrl);
    }
  });

  const imageUrlRegex = /https:\/\/cdni\.pornpics\.com\/1280\/[^\s"']+/g;
  let match;
  while ((match = imageUrlRegex.exec(htmlContent)) !== null) {
    imageUrls.add(match[0]);
  }

  return Array.from(imageUrls);
}

async function downloadAndSaveImage(imageUrl, filePath) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
      const response = await axios({
        url: imageUrl,
        headers: { 'User-Agent': userAgent },
        responseType: 'stream',
      });
      
      await new Promise((resolve, reject) => {
        const fileWriter = fs.createWriteStream(filePath);
        response.data.pipe(fileWriter);
        fileWriter.on('finish', resolve);
        fileWriter.on('error', reject);
      });

      logger.info(`Downloaded ${imageUrl} to ${filePath}`);
      break;
    } catch (error) {
      logger.error(`Retry ${attempt + 1} for image ${imageUrl} failed: ${error.message}`);
      if (attempt < MAX_RETRIES - 1) {
        const sleepDuration = Math.random() * (MAX_SLEEP_DURATION - MIN_SLEEP_DURATION) + MIN_SLEEP_DURATION;
        await sleep(sleepDuration);
      }
    }
  }
}

async function processMainPageUrl(mainPageUrl) {
  const albumUrls = await getAlbumUrlsFromMainPage(mainPageUrl);
  if (albumUrls.length === 0) {
    logger.warn(`No albums found at ${mainPageUrl}`);
    return;
  }

  const workerPromises = [];

  for (const albumUrl of albumUrls) {
    const imageUrls = await getImageUrlsFromAlbumPage(albumUrl);
    if (imageUrls.length === 0) {
      logger.warn(`No images found at album URL ${albumUrl}`);
      continue;
    }

    for (const imageUrl of imageUrls) {
      const imageName = path.basename(imageUrl);
      const imagePath = path.join(imagesDirectory, imageName);
      
      workerPromises.push(new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { imageUrl, imagePath }
        });
        worker.on('message', resolve);
        worker.on('error', reject);
      }));

      const sleepDuration = Math.random() * (MAX_SLEEP_DURATION - MIN_SLEEP_DURATION) + MIN_SLEEP_DURATION;
      await sleep(sleepDuration);
    }
  }

  await Promise.all(workerPromises);
}

async function main() {
  let mainPageUrls = [];

  if (process.argv.length > 2) {
    mainPageUrls = process.argv.slice(2);
  } else {
    try {
      const config = JSON.parse(fs.readFileSync('config.json'));
      mainPageUrls = config.mainPageUrls;
    } catch (error) {
      logger.error('Error reading config.json: ' + error.message);
      process.exit(1);
    }
  }

  if (!mainPageUrls || mainPageUrls.length === 0) {
    logger.error('No URLs provided. Please specify URLs as command-line arguments or in config.json');
    process.exit(1);
  }

  for (const mainPageUrl of mainPageUrls) {
    if (!mainPageUrl.startsWith('http://') && !mainPageUrl.startsWith('https://')) {
      logger.error(`Invalid URL: ${mainPageUrl}. Please ensure it starts with http:// or https://`);
      continue;
    }
    await processMainPageUrl(mainPageUrl);
  }
}

if (isMainThread) {
  main().catch(error => {
    logger.error('An error occurred: ' + error.message);
    process.exit(1);
  });
} else {
  const { imageUrl, imagePath } = workerData;

  downloadAndSaveImage(imageUrl, imagePath)
    .then(() => parentPort.postMessage('done'))
    .catch((error) => logger.error(`Worker error: ${error.message}`));
}
