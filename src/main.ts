/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://docs.apify.com/sdk/js
import { Actor, Dataset } from 'apify';
// For more information, see https://crawlee.dev
import { PlaywrightCrawler, RequestList } from 'crawlee';
// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
import { firefox } from 'playwright';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import * as dotenv from 'dotenv';
import { WalletData, WalletDataCollection } from './types.js';

// Create a router function that accepts and returns data
import { createRouter } from './routes.js';

dotenv.config();
interface Input {
    walletAddresses: string[];
    period: string;
    maxRetries?: number;
}

// Initialize the Apify SDK
await Actor.init();

// Structure of input is defined in input_schema.json
const {
    walletAddresses = [
        // '3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV',
        // 'BuPuiqgry31hqxrJ4Vv9hDYQ4735zQcLbRUXKEK4TgVh',
        // '72e6QM7gn9MH5u1YpgQbduexm4WAon1cnsSXPqKnLQec',
    ],
    period = '7d',
    maxRetries = 3,
} = (await Actor.getInput<Input>()) ?? ({} as Input);

// Create a local array to store all wallet data
const allWalletData: WalletData[] = [];

// Generate requests for all wallet addresses
const requests = walletAddresses.map((walletAddress) => ({
    url: `https://gmgn.ai/api/v1/wallet_stat/sol/${walletAddress}/${period}?device_id=0a95111c-3b19-4f49-b0da-742a65f887e4&client_id=gmgn_web_2025.0418.112049&from_app=gmgn&app_ver=2025.0418.112049&tz_name=Asia%2FCalcutta&tz_offset=19800&app_lang=en-US&fp_did=73262958e673b77d2022a2011dc75437&os=web&period=${period}`,
    headers: {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Referer: 'https://gmgn.ai/',
    },
    userData: {
        walletAddress, // Store wallet address in userData for reference
    },
    maxRetries,
}));

// Create a request list with retry logic
const requestList = await RequestList.open('wallet-stats', requests);

// Create a router that accepts our data array
const router = createRouter(allWalletData);

// Make proxy configuration optional based on environment variable
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['BUYPROXIES94952'], // Switch from RESIDENTIAL to DATACENTER (much cheaper)
    countryCode: 'US',
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    // Update this to match the number of wallet addresses
    maxRequestsPerCrawl: walletAddresses.length,
    requestHandler: router,
    requestList,
    launchContext: {
        launcher: firefox,
        launchOptions: await camoufoxLaunchOptions({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // Keep only essential arguments for performance and anti-detection
            ],
        }),
    },
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: ['chrome'],
                devices: ['desktop'],
                operatingSystems: ['windows', 'macos'],
                locales: ['en-US'],
            },
        },
    },
    preNavigationHooks: [
        async ({ page }) => {
            // Set up request interception
            await page.route('**/*', async (route) => {
                const request = route.request();
                const resourceType = request.resourceType();

                // Block unnecessary resources
                if (
                    ['image', 'stylesheet', 'font', 'media', 'other'].includes(
                        resourceType,
                    )
                ) {
                    await route.abort();
                } else {
                    await route.continue();
                }
            });

            // Set up additional browser context
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'MacIntel',
                });
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => 8,
                });
                Object.defineProperty(navigator, 'deviceMemory', {
                    get: () => 8,
                });
            });

            // Set up performance optimizations
            await page.setDefaultNavigationTimeout(30000);
            await page.setDefaultTimeout(30000);
            await page.setViewportSize({ width: 1920, height: 1080 });
        },
    ],
    failedRequestHandler: async ({ request, error }) => {
        console.error(`Request ${request.url} failed:`, error);
    },
});

try {
    await crawler.run();

    // After all requests are processed, save the combined data
    if (allWalletData.length > 0) {
        const dataCollection: WalletDataCollection = {
            timestamp: new Date().toISOString(),
            wallets: allWalletData,
        };
        await Dataset.pushData(dataCollection);
        console.log(
            `Successfully scraped data for ${allWalletData.length} wallets`,
        );
    }
} catch (error) {
    console.error('Crawler failed:', error);
    throw error;
} finally {
    // Exit successfully
    await Actor.exit();
}
