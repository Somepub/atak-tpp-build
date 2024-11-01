import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
import fs from "fs";

const IN_MINUTE = 10000;//60000;

function generate2FACode(secret: string) {
    return execSync(`oathtool --totp -b ${secret}`).toString().trim();
}

async function auth(page: Page) {
    console.debug("Starting script...");
    await page.goto('https://tak.gov');

    await page.locator('.btn-login').click();
    await page.waitForNavigation();

    await page.type('#username', process.env.USER_NAME!);
    await page.type('#password', process.env.USER_PASS!);
    await page.click('#kc-login');
    await page.waitForNavigation();

    console.debug("Login successful!");

    const twoFACode = generate2FACode(process.env.FA_SECRET!);

    await page.type('#otp', twoFACode);
    await page.click('#kc-login');

    console.debug("2FA successful!");

    await page.waitForNavigation();

    console.debug("Auth successful!");
}

async function isAuth(page: Page): Promise<Boolean> {
    const navBarStatus = await page.$eval(".navbar-user", el => el.textContent?.trim());
    return navBarStatus!.includes("Account");
}

async function navigateToUserBuild(page: Page) {
    await page.goto('https://tak.gov/user_builds');
    await page.keyboard.press("End");
}

async function uploadFile(page: Page) {
    console.log("Uploading file: " + process.env.UPLOAD_FILE!);
    const [fileChooser] = await Promise.all([
        page.waitForFileChooser({timeout: 2000}),
        page.click("#user_build_upload_file"),
    ]);
    await fileChooser.accept([process.env.UPLOAD_FILE!]);
    await page.click('input[name="commit"]')
    console.debug("Upload successful!");
}

async function getTableStatus(page, rowIndex = 0): Promise<string> {
    try {
      await page.waitForSelector('table.table-full-width tbody tr', {
        timeout: 5000
      });
  
      const statuses = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.table-full-width tbody tr'));
        return rows.map(row => {
          const statusCell = row.querySelector('td:nth-child(3) span');
          return statusCell?.textContent?.trim() || '';
        });
      });

      const uploaded = await page.evaluate(() => {  
        const rows = Array.from(document.querySelectorAll('table.table-full-width tbody tr'));
        return rows.map(row => {
          const statusCell = row.querySelector('td:nth-child(2)');
          return statusCell?.textContent?.trim() || '';
        });
      });
  
  
      if (!statuses.length) {
        throw new Error('No status cells found in table');
      }
  
      console.debug(`Found ${statuses.length} status entries`);
      console.debug(`Update status: ${uploaded[rowIndex]}`);
      
      return statuses[rowIndex] || statuses[0];
    } catch (error) {
      throw new Error(`Failed to get table status: ${error.message}`);
    }
  }

async function waitForDownload(downloadPath: string, downloadFileName: string, timeoutMs = 300000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Download timeout'));
          return;
        }
  
        const files = fs.readdirSync(downloadPath);
        if (files.includes(downloadFileName)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  };

async function downloadBuild(page: Page, browser: Browser, downloadPath: string) {
    console.debug("Starting download...");
    const downloadLink = await page.$eval(
        'table.table-full-width tbody tr td:last-child a',
        el => el.href
    );
    const downloadLinkSplit = downloadLink.split("/");
    const downloadFileName = downloadLinkSplit[downloadLinkSplit.length - 1];
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath});

    const startTime = Date.now();
    
    await page.click('table.table-full-width tbody tr td:last-child a');

    console.debug(`Downloading ${downloadLink}`);

    await waitForDownload(downloadPath, downloadFileName);

    const endTime = Date.now();
    const downloadDuration = (endTime - startTime) / 1000;
    console.log(`Download completed in ${downloadDuration} seconds`);
    console.log(`Download location: ${downloadPath + downloadFileName}`)

    await browser.close();
}

async function waitForBuildDownload(page: Page, browser: Browser, downloadPath: string) {
    console.debug("Waiting for build...");
    //await delay(1000);
    let statusText = await getTableStatus(page);
    console.debug("Inital status: ", statusText)

    if(statusText?.includes("Success")) {
        // Recheck
        await navigateToUserBuild(page);
        statusText = await getTableStatus(page);
    }

    const statusInterval = setInterval( async () => {
        const _isAuth = await isAuth(page);

        if(!_isAuth){
            await auth(page);
            await navigateToUserBuild(page);
            statusText = await getTableStatus(page);
        }

        console.log("Status:", statusText);

        if(statusText?.includes("Success")) {
            clearInterval(statusInterval);
            downloadBuild(page, browser, downloadPath);
        }
        else if(statusText?.includes("Failed")) {
            console.error("The TPP build failed, exiting...");
            await browser.close();
        }
        else {
            console.debug("Update page");
            await navigateToUserBuild(page);
            statusText = await getTableStatus(page);
        }
    }, IN_MINUTE);
    // wait (ms) before reloading page and updating status
}

(async () => {
    if(!process.env.USER_NAME || !process.env.USER_PASS)
        throw Error("Failed to find USER_NAME or USER_PASS.")

    if(!process.env.FA_SECRET)
        throw Error("Failed to find FA_SECRET.")

    if(!process.env.DOWNLOAD_PATH || !process.env.UPLOAD_FILE)
        throw Error("Failed to find DOWNLOAD_PATH or UPLOAD FILE.")

    const browser = await puppeteer.launch({headless: false, args:['--no-sandbox']});
    const page = await browser.newPage();
    await page.setViewport({width: 1080, height: 1024});

    await auth(page);

    await navigateToUserBuild(page);

    await uploadFile(page);

    await waitForBuildDownload(page, browser, process.env.DOWNLOAD_PATH);
})();



