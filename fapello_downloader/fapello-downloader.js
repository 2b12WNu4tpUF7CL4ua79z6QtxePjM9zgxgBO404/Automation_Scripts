const fs = require('fs');
const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const readline = require('readline');

const config = {
    downloadDir: path.join(__dirname, 'downloads'),
    timeout: 60000,
    concurrency: 5,
    executablePaths: {
        Brave: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        Chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        Firefox: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        Edge: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    }
};

if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir);
}

const log = (message) => {
    const logMessage = `[${new Date().toISOString()}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync('download_log.txt', logMessage + '\n');
};

const conciseLog = (message) => {
    console.log(message);
};

const validateUrl = (url) => {
    const regex = /^https:\/\/fapello\.com\/[^\/]+\/$/;
    return regex.test(url);
};

const downloadFile = async (url, filepath) => {
    try {
        conciseLog(`Downloading: ${path.basename(filepath)}`);
        const writer = fs.createWriteStream(filepath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: true }),
        });
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                conciseLog(`Completed download: ${path.basename(filepath)}`);
                resolve();
            });
            writer.on('error', reject);
        });
    } catch (error) {
        log(`Failed to download file from ${url}: ${error.message}`);
    }
};

const fetchDynamicContent = async (page, username) => {
    let pageNum = 2;
    let contentLoaded = true;

    conciseLog('Fetching content...');
    while (contentLoaded) {
        const ajaxUrl = `https://fapello.com/ajax/model/${username}/page-${pageNum}/`;

        try {
            const response = await axios.get(ajaxUrl);
            if (response.status === 200 && response.data) {
                await page.evaluate((data) => {
                    document.querySelector('#content').insertAdjacentHTML('beforeend', data);
                }, response.data);
                pageNum++;
            } else {
                contentLoaded = false;
            }
        } catch (error) {
            log(`Error fetching content from ${ajaxUrl}: ${error.message}`);
            contentLoaded = false;
        }
    }
    conciseLog('Done fetching content.');
};

const processLink = async (browser, link, parentFolder) => {
    try {
        log(`Processing link: ${link}`);
        const newPage = await browser.newPage();
        await newPage.goto(link, { waitUntil: 'load', timeout: config.timeout });

        conciseLog('Searching for images and videos...');
        const mediaLinks = await newPage.evaluate(() => {
            const mediaLinks = [];
            document.querySelectorAll('a[href*="/content/"] img').forEach(img => {
                mediaLinks.push({ type: 'image', src: img.src });
            });
            document.querySelectorAll('video source[type="video/mp4"]').forEach(video => {
                mediaLinks.push({ type: 'video', src: video.src });
            });
            return mediaLinks;
        });
        conciseLog('Done searching.');

        for (const mediaLink of mediaLinks) {
            const mediaUrl = new URL(mediaLink.src);
            const filename = path.basename(mediaUrl.pathname);
            const filepath = path.join(parentFolder, filename);

            await downloadFile(mediaLink.src, filepath);
        }

        await newPage.close();
    } catch (error) {
        log(`Error processing link ${link}: ${error.message}`);
    }
};

(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('Select the browser you want to use:');
    console.log('1: Brave');
    console.log('2: Chrome');
    console.log('3: Firefox');
    console.log('4: Edge');
    
    rl.question('Enter the number of your choice: ', async (choice) => {
        let executablePath;
        switch (choice) {
            case '1':
                executablePath = config.executablePaths.Brave;
                break;
            case '2':
                executablePath = config.executablePaths.Chrome;
                break;
            case '3':
                executablePath = config.executablePaths.Firefox;
                break;
            case '4':
                executablePath = config.executablePaths.Edge;
                break;
            default:
                console.log('Invalid choice, defaulting to Brave.');
                executablePath = config.executablePaths.Brave;
        }

        rl.question('Please enter the base URL (e.g., https://fapello.com/username/) right click to paste: ', async (baseUrl) => {
            if (!validateUrl(baseUrl)) {
                console.log('Invalid URL format.');
                rl.close();
                return;
            }

            rl.close();
            const browser = await puppeteer.launch({
                headless: true,
                timeout: config.timeout,
                executablePath,
            });

            try {
                const page = await browser.newPage();
                const usernameMatch = baseUrl.match(/https:\/\/[^\/]+\/([^\/]+)\//);
                if (!usernameMatch) {
                    throw new Error('Invalid URL format.');
                }
                const username = usernameMatch[1];
                const parentFolderPath = path.join(config.downloadDir, username);

                if (!fs.existsSync(parentFolderPath)) {
                    fs.mkdirSync(parentFolderPath, { recursive: true });
                }

                await page.setContent('<div id="content"></div>');
                await fetchDynamicContent(page, username);

                const dynamicRegex = new RegExp(`${baseUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\d+/`);
                const links = await page.$$eval('a', (as, regexStr) => {
                    const regex = new RegExp(regexStr);
                    return as.map((a) => a.href).filter((href) => regex.test(href));
                }, dynamicRegex.source);

                log(`Found ${links.length} links to process: ${JSON.stringify(links, null, 2)}`);

                for (let i = 0; i < links.length; i += config.concurrency) {
                    const batch = links.slice(i, i + config.concurrency);
                    await Promise.all(batch.map((link) => processLink(browser, link, parentFolderPath)));
                }
            } catch (error) {
                log(`Error in main process: ${error.message}`);
            } finally {
                await browser.close();
            }
        });
    });
})();
