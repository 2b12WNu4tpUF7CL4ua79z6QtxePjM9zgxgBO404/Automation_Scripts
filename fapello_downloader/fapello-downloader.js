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
