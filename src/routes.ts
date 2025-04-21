import { createPlaywrightRouter, RequestQueue } from 'crawlee';
import { WalletData } from './types.js';

export function createRouter(dataCollection: WalletData[]) {
    const router = createPlaywrightRouter();

    router.addDefaultHandler(async ({ request, page, log }) => {
        log.info(`Processing API request for ${request.url}`);

        try {
            // Set up request interception
            await page.route('**/*', async (route) => {
                const routeRequest = route.request(); // Renamed to avoid collision
                const headers = routeRequest.headers();

                // Add additional headers
                headers['sec-ch-ua'] =
                    '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"';
                headers['sec-ch-ua-mobile'] = '?0';
                headers['sec-ch-ua-platform'] = '"macOS"';
                headers['sec-fetch-dest'] = 'empty';
                headers['sec-fetch-mode'] = 'cors';
                headers['sec-fetch-site'] = 'same-origin';

                await route.continue({ headers });
            });

            // First visit the main page to get cookies
            await page.goto('https://gmgn.ai/', {
                waitUntil: 'networkidle',
                timeout: 30000,
            });

            // Get cookies after visiting the main page
            const cookies = await page.context().cookies();
            const cookieString = cookies
                .map((cookie) => `${cookie.name}=${cookie.value}`)
                .join('; ');

            // Make the API request with cookies
            const apiResponse = await page.evaluate(
                // Renamed to avoid collision
                async ({ url, cookieStr }) => {
                    const fetchResponse = await fetch(url, {
                        // Renamed to avoid collision
                        method: 'GET',
                        headers: {
                            Accept: 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            Connection: 'keep-alive',
                            Referer: 'https://gmgn.ai/',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin',
                            Cookie: cookieStr,
                        },
                        credentials: 'include',
                    });
                    return {
                        status: fetchResponse.status,
                        data: await fetchResponse.json(),
                    };
                },
                { url: request.url, cookieStr: cookieString }, // Renamed parameter
            );

            if (apiResponse.status !== 200) {
                throw new Error(`API returned status ${apiResponse.status}`);
            }

            // Output the data to console
            console.log(
                'Scraped Data:',
                JSON.stringify(apiResponse.data, null, 2),
            );

            log.info('Successfully retrieved wallet statistics');

            // Instead of using global, add to the provided array
            dataCollection.push({
                walletAddress: request.userData.walletAddress,
                timestamp: new Date().toISOString(),
                status: apiResponse.status,
                data: apiResponse.data,
            });

            log.info(
                `Successfully retrieved wallet statistics for ${request.userData.walletAddress}`,
            );
        } catch (error: unknown) {
            // Type annotation added
            log.error('Failed to process API response', {
                error: error instanceof Error ? error.message : String(error),
            });

            // If we have retries left, add the request back to the queue
            const maxRetries = request.maxRetries ?? 3; // Default value if undefined

            if (request.retryCount < maxRetries) {
                log.info(
                    `Retrying request (${
                        request.retryCount + 1
                    }/${maxRetries})`,
                );

                // Get the request queue from the crawler
                const requestQueue = await RequestQueue.open();
                await requestQueue.addRequest({
                    ...request,
                    retryCount: (request.retryCount || 0) + 1,
                });
            } else {
                // For failed requests, create properly typed error data
                dataCollection.push({
                    walletAddress: request.userData.walletAddress,
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    error:
                        error instanceof Error ? error.message : String(error),
                    retryCount: request.retryCount,
                });
                throw error;
            }
        }
    });

    return router;
}
