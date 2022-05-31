import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import proxyLogin from '@pierreminiggio/puppeteer-proxy-login'
puppeteer.use(StealthPlugin())

/**
 * @typedef {Function} LogFunction
 * @property {string} toLog
 */

/**
 * @param {string} facebookLogin
 * @param {string} facebookPassword
 * @param {boolean} show
 * @param {LogFunction} sendLog
 * @param {string|null} proxy
 *
 * @returns {Promise<import('puppeteer').Page>}
 */
export default function login(
    facebookLogin,
    facebookPassword,
    show = false,
    sendLog = (toLog) => {},
    proxy = null
) {
    const {alterPuppeteerOptions, pageAuthenticate} = proxyLogin(proxy)

    return new Promise(async (resolve, rejects) => {
        sendLog('Launch !')

        const args = [
            '--window-size=1000,800',
            '--no-sandbox'
        ]

        const puppeteerOptions = {
            headless: ! show,
            args
        }

        alterPuppeteerOptions(puppeteerOptions)

        const browser = await puppeteer.launch(puppeteerOptions)
        sendLog('Launched')

        let posterTimeout = setTimeout(async () => {
            await browser.close()
            sendLog('Timed out')
            rejects('timed out')
        }, 30000)

        sendLog('Go to login page')
        const page = await browser.newPage()
        await pageAuthenticate(page)
        await page.evaluateOnNewDocument(() => {
            delete navigator.__proto__.webdriver;
        });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 OPR/77.0.4054.60');
        await page.goto('https://www.tiktok.com/login')

        sendLog('Waiting for Fb Login selector...')

        let facebookButtonSelector = '.channel-item-wrapper-2gBWB+.channel-item-wrapper-2gBWB+.channel-item-wrapper-2gBWB .channel-name-2qzLW'

        try {
            await page.waitForSelector(facebookButtonSelector, {timeout: 10000})
        } catch (e) {
            facebookButtonSelector = '#loginContainer>div>div>div+div+a+a+div'
            await page.waitForSelector(facebookButtonSelector)
        }

        sendLog('Waited !')

        let hasLoggedIn = false
        const onTargetCreatedHandler = async () => {
            sendLog('Target created')
            /** @type {import('puppeteer').Page} foundFacebookLogin */
            const facebookLoginPage = await findFacebookLogin(browser, sendLog);
            sendLog('Fb login page found ? ' + (facebookLoginPage ? 'yes' : 'no'))
            if (facebookLoginPage) {
                sendLog('Fb login page reloading...')
                await facebookLoginPage.reload()
                sendLog('Fb login page reloaded. Loggin-in ...')
                try {
                    await facebookLoginPage.evaluate((facebookLogin, facebookPassword) => {
                        const body = document.body
                        body.querySelector('#email').value = facebookLogin
                        body.querySelector('#pass').value = facebookPassword
                        body.querySelector('input[name="login"]').click()
                    }, facebookLogin, facebookPassword)

                } catch (loginError) {
                    if (posterTimeout) {
                        clearTimeout(posterTimeout)
                        posterTimeout = null
                    }
                    await browser.close()
                    rejects('Facebook Login failed')

                    return
                }

                await facebookLoginPage.waitForTimeout(3000)

                const loginErrorBoxSelector = '.login_error_box'

                let errorMessage = false
                try {
                    errorMessage = await facebookLoginPage.evaluate(
                        loginErrorBoxSelector => document.querySelector(loginErrorBoxSelector)?.innerText,
                        loginErrorBoxSelector
                    )
                } catch (e) {
                    browser.off('targetcreated', onTargetCreatedHandler)
                    sendLog('Likely logged in !')

                    return
                }

                if (errorMessage) {
                    if (posterTimeout) {
                        clearTimeout(posterTimeout)
                        posterTimeout = null
                    }
                    await browser.close()
                    rejects('Facebook Login failed : ' + errorMessage)

                    return
                }

                await facebookLoginPage.waitForTimeout(3000)

                try {
                    const continueButtonSelector = '[data-visualcompletion="ignore"]'

                    const isContinueButtonDisplayed = await facebookLoginPage.evaluate(
                        continueButtonSelector => document.querySelector(continueButtonSelector) !== null,
                        continueButtonSelector
                    )

                    if (isContinueButtonDisplayed) {
                        await facebookLoginPage.click(continueButtonSelector)
                    }

                    await facebookLoginPage.waitForTimeout(3000)
                } catch (e) {
                    browser.off('targetcreated', onTargetCreatedHandler)
                    sendLog('Likely logged in !')

                    return
                }

                const acceptedCookies = await facebookLoginPage.evaluate(() => {
                    const buttons = document.querySelectorAll('[role="button"]')
                    if (buttons.length !== 3) {
                        return false
                    }

                    buttons[2].click()

                    return true
                })

                if (acceptedCookies) {
                    await facebookLoginPage.waitForTimeout(1000)
                }

                const typeAgainPasswordInputSelector = '[name="pass"]'

                const needToTypePasswordAgain = await facebookLoginPage.evaluate(typeAgainPasswordInputSelector => {
                    return document.querySelector(typeAgainPasswordInputSelector) !== null
                }, typeAgainPasswordInputSelector)

                if (needToTypePasswordAgain) {
                    sendLog('Need to type password again')

                    try {
                        await page.evaluate((typeAgainPasswordInputSelector, facebookPassword) => {
                            document.querySelector(typeAgainPasswordInputSelector).value = facebookPassword
                        }, typeAgainPasswordInputSelector, facebookPassword)
    
                        const continueButtonSelector = 'input[type="submit"]'
                        await facebookLoginPage.click(continueButtonSelector)
                    } catch (typeAgainPasswordError) {
                        if (posterTimeout) {
                            clearTimeout(posterTimeout)
                            posterTimeout = null
                        }
                        await browser.close()
                        rejects('Typing password again failed')
    
                        return
                    }
                    
                }

                browser.off('targetcreated', onTargetCreatedHandler)
                sendLog('Likely logged in !')
            } else {
                sendLog('WTF is this page ?')
            }
        }
        browser.on('targetcreated', onTargetCreatedHandler)

        const onTargetDestroyedHandler = async () => {
            try {
                await page.waitForTimeout(10000)
            } catch (e) {
                sendLog('Program probably just ended')
                return
            }
            
            /** @type {import('puppeteer').Page} loggedInPage */
            const loggedInPage = await findLoggedInPage(browser, sendLog);
            sendLog('TikTok page found ? ' + (loggedInPage ? 'yes' : 'no'))
            if (loggedInPage) {
                if (! hasLoggedIn) {
                    hasLoggedIn = true
                    if (posterTimeout) {
                        clearTimeout(posterTimeout)
                        posterTimeout = null
                    }
                    browser.off('targetdestroyed', onTargetDestroyedHandler)
                    sendLog('logged in !')
                    resolve(loggedInPage)
                }
            }
        }

        browser.on('targetdestroyed', onTargetDestroyedHandler)

        sendLog('Clicking Fb Login button !')
        await page.click(facebookButtonSelector)
        sendLog('Fb Login button clicked !')
    })
}


/**
 * @param {import('puppeteer').Browser} browser
 * @param {LogFunction} sendLog
 *
 * @returns {?import('puppeteer').Page}
 */
async function findFacebookLogin(browser, sendLog) {
    return await findPageIncludes(browser, 'facebook.com/login.php', sendLog)
}

/**
 * @param {import('puppeteer').Browser} browser
 * @param {LogFunction} sendLog
 *
 * @returns {?import('puppeteer').Page}
 */
async function findLoggedInPage(browser, sendLog) {
    return await findPageIncludes(
        browser,
        'https://www.tiktok.com/foryou?loginType=facebook&lang=en',
        sendLog
    ) || await findPageIncludes(
        browser,
        'https://www.tiktok.com/foryou?lang=en',
        sendLog
    ) || await findPageIncludes(
        browser,
        'https://www.tiktok.com/foryou?loginType=facebook&lang=fr',
        sendLog
    ) || await findPageIncludes(
        browser,
        'https://www.tiktok.com/foryou?lang=fr',
        sendLog
    )
}

/**
 * @param {import('puppeteer').Browser} browser
 * @param {string} pageTitleIncludedText
 * @param {LogFunction} sendLog
 *
 * @returns {?import('puppeteer').Page}
 */
async function findPageIncludes(browser, pageTitleIncludedText, sendLog) {
    let pages = await browser.pages()
    for (let i = 0; i < pages.length; i += 1) {
        const pageUrl = pages[i].url()
        sendLog(pageUrl)
        if (pageUrl.includes(pageTitleIncludedText)) {
            return pages[i]
        }
    }
    return null;
}
