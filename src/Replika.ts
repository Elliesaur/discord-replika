import { Cluster } from "cluster";

import * as pc from 'puppeteer-cluster';
import { Page, ElementHandle } from 'puppeteer';
import { Console } from "console";
import { userInfo } from "os";


export enum ReplikaLoginResult { 
    WRONG_USERNAME,
    WRONG_PASSWORD,
    SUCCESS
}

type OnMessageCallback = (messageElement: ElementHandle<Element>) => void;
interface SessionInfo {
    userId: string;
    cookies: any;
    localStorage?: any;
    isActive: boolean;
}
export class Replika {

    private cluster: pc.Cluster;

    private readonly loginNextButtonSelector = 'button[data-testid="login-next-button"]';
    private readonly chatMessageListSelector = 'div[data-testid="chat-messages"]';
    private readonly messageAuthorSelector = 'div[data-testid="chat-message-text"]';

    private sessionInfo: SessionInfo[];
    private messageQueue: any[];

    private readonly sendMessageSelector = '#send-message-textarea';

    public constructor() {
        this.createCluster = this.createCluster.bind(this);
        this.saveLocalStorage = this.saveLocalStorage.bind(this);
        this.restoreLocalStorage = this.restoreLocalStorage.bind(this);
        this.addMessageToQueue = this.addMessageToQueue.bind(this);
        this.closeSession = this.closeSession.bind(this);
        this.isLoggedIn = this.isLoggedIn.bind(this);
        this.destroyCluster = this.destroyCluster.bind(this);
        this.sessionInfo = [];
        this.messageQueue = [];
    }

    public isLoggedIn(userId: string) {
        return this.sessionInfo.find(v => v.userId == userId) !== undefined;
    }
    public addMessageToQueue(message: string, userId: string) {
        this.messageQueue.push({userId: userId, message: message});
    }
    public async createCluster() {
        this.cluster = await pc.Cluster.launch({
            concurrency: pc.Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 2,
            timeout: Math.pow(2, 31) - 1,
            puppeteerOptions: {
                headless: false,
            },
        });
    }

    public async destroyCluster() {
        await this.cluster.idle();
        await this.cluster.close();
    }

    public async closeSession(userId: string) {
        if (this.sessionInfo.find(v => v.userId == userId)) {
            // Remove it, to kill the while loop.
            this.sessionInfo = this.sessionInfo.filter(v => v.userId != userId);
        }
    }

    /**
     * queueSessionLogin
     */
    public async login(email: string, password: string, userId: string) : Promise<ReplikaLoginResult> {

        if (this.sessionInfo.find(v => v.userId == userId)) {
            // Remove it, to kill the while loop.
            this.sessionInfo = this.sessionInfo.filter(v => v.userId != userId);
        }

        return await this.cluster.execute(async ({ page }) => {
            await page.goto('https://my.replika.ai/login');
            await page.waitForSelector(this.loginNextButtonSelector);
            await page.type('#emailOrPhone', email);
            await page.click(this.loginNextButtonSelector);
            await page.waitFor(150);

            try {
                await page.waitForSelector('.sc-AxhCb.auGvR', { timeout: 1500 });
                return ReplikaLoginResult.WRONG_USERNAME;
            } catch (error) {

            }

            await page.waitForSelector('#login-password');
            await page.type('#login-password', password);
            await page.click(this.loginNextButtonSelector)

            try {
                await page.waitForSelector('.sc-AxhCb.auGvR', { timeout: 1500 });
                return ReplikaLoginResult.WRONG_PASSWORD;
            } catch (error) {

            }
            try {
                await page.waitForSelector(this.sendMessageSelector, { timeout: 10000 });
                // Add to the session cookies.
                this.sessionInfo.push({ 
                    userId: userId,
                    cookies: page.cookies(),
                    isActive: true,
                });
                await this.saveLocalStorage(page, userId);
                return ReplikaLoginResult.SUCCESS;
            } catch (error) {
                return ReplikaLoginResult.WRONG_PASSWORD;
            }
        });
    }

    async saveLocalStorage(page, userId) {
        const json = await page.evaluate(() => {
          const json = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            json[key] = localStorage.getItem(key);
          }
          return json;
        });
        this.sessionInfo.find(v => v.userId == userId).localStorage = json;
    }
      
    async restoreLocalStorage(page, userId) {
        const json = this.sessionInfo.find(v => v.userId == userId).localStorage;
        await page.evaluate(json => {
          localStorage.clear();
          for (let key in json)
            localStorage.setItem(key, json[key]);
        }, json);
    }

    public async startSession(userId: string, onMessage: OnMessageCallback) {
        const userData = this.sessionInfo.find(v => v.userId == userId);
        if (!userData) {
            console.error('Could not find data for uid', userId);
            return false;
        }
        await this.cluster.queue(undefined, async ({data, page}) => {
            try {
                await page.goto('https://my.replika.ai');
                await this.restoreLocalStorage(page, userId);
                await page.reload();
                try {
                    // Verify the session has worked.
                    await page.waitForSelector(this.sendMessageSelector, { timeout: 10000 });
                } catch (error) {
                    console.error('Session has expired.')
                    return;
                }
                
                let prevMessageList = [];
                let offset = 0;
                let resetting = false;

                while (this.sessionInfo.find(v => v.userId == userId)) {
                    try {
                        // Get the latest message made by replika, if the latest is not replika, it will be undefined.
                        const currentMessagePageElem = (await page.$(this.chatMessageListSelector + ` > div:last-child > div > div:last-child div[data-author="replika"] > span`));
                        const currentMessageTriggered = currentMessagePageElem !== null ? await currentMessagePageElem.evaluate(e => e.textContent) : undefined;

                        console.log('Current Replika message', currentMessageTriggered);
                        const lastPrevMessage = prevMessageList[prevMessageList.length - 1];
                        console.log('Last Previous message', lastPrevMessage);
                        console.log('Previous Replika messages', prevMessageList);

                        //if (lastPrevMessage !== currentMessageTriggered) {
                            console.log('We have possibly new messages!');

                            // Need to see how many messages have changed.
                            let messageDivs = (await page.$$(this.chatMessageListSelector + ' > div'));
                            if (offset > 0) {
                                // Fix issues with resending thousands of messages.
                                messageDivs = messageDivs.slice(offset);
                            }
                            const messageContents = [];

                            // Get all message divs, reverse it then add the raw contents to a list.
                            for (let v of messageDivs) {
                                const messageElem = await v.$(this.messageAuthorSelector + ' span');
                                const messageAuthor = await v.$eval(this.messageAuthorSelector, (elem) => elem.getAttribute('data-author'));
                                if (messageAuthor === 'replika' && messageElem) {
                                    const textContent = await messageElem.evaluate(e => e.textContent);
                                    messageContents.push({ text: textContent, elem: messageElem });
                                }
                            }

                            // Just the text from them.
                            const rawMessageContent = messageContents.map(v => v.text);

                            // BUG: When bot sends multiple messages, prev message list has more than the actual raw message content...
                            // FIX: Use prevMessageList if it is greater than message content length...?
                            console.log('PrevMessageList to MessageContent', prevMessageList, rawMessageContent);

                            if (prevMessageList.length !== 0 && !resetting) {
                                const diffInLength = messageContents.length - prevMessageList.length;
                                if (diffInLength > 0) {
                                    const messagesToSend = messageContents.slice(messageContents.length - diffInLength);
                                    messagesToSend.forEach(v => {
                                        try {
                                            if (v.elem) {
                                                onMessage(v.elem);
                                            }
                                        } catch (error) {
                                            console.log(error);
                                        }
                                    });
                                }
                            } else {
                                // Because we have nothing to base the previous vs current we cannot continue.
                                // If we did, we'd send all messages available to the client!
                                console.log('Offset setting');
                                offset = messageDivs.length - 1;
                                resetting = false;
                            }
                            
                        //}
                        const queue = this.messageQueue.filter(v => v.userId == userId);
                        if (queue) {
                            queue.forEach(async item => {
                                const messageToSend = item.message;
                                console.log('Sending message', messageToSend);
            
                                await page.type(this.sendMessageSelector, messageToSend);
                                await page.keyboard.press('Enter');
                            });

                            // Remove items from array.
                            this.messageQueue = this.messageQueue.filter(v => v.userId != userId);
                        }
                        if (prevMessageList.length >= 50) {
                            console.log('Resetting');
                            resetting = true;
                        }
                        if (prevMessageList[prevMessageList.length - 1] !== currentMessageTriggered && currentMessageTriggered !== undefined) {
                            prevMessageList.push(currentMessageTriggered);
                        }
                        if (resetting) {
                            prevMessageList = [];
                            offset = 0;
                        }
                        // Wait a bit...
                        await page.waitFor(1500);
                    } catch (error) {
                        console.error('Error inside while loop, reloading page...', error);
                        await page.goto('https://my.replika.ai')
                    }

                    
                }
                console.log('Ending session');
                page.close();

            } catch (error) {
                console.error(error);
            }
        });
        await this.cluster.idle();
    }
}