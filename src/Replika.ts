import * as pc from 'puppeteer-cluster';
import { Page, ElementHandle } from 'puppeteer';
import * as Fs from 'fs';
import { MessageContent, Message } from './ReplikaModels';

export enum ReplikaLoginResult { 
    WRONG_USERNAME,
    WRONG_PASSWORD,
    SUCCESS
}

type OnMessageCallback = (messageContents: MessageContent) => void;
type OnTypingCallback = (isTyping: boolean) => void;
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
    private imageQueue: any[];

    private readonly sendMessageSelector = '#send-message-textarea';

    public constructor() {
        this.createCluster = this.createCluster.bind(this);
        this.saveLocalStorage = this.saveLocalStorage.bind(this);
        this.restoreLocalStorage = this.restoreLocalStorage.bind(this);
        this.addMessageToQueue = this.addMessageToQueue.bind(this);
        this.addImageToQueue = this.addImageToQueue.bind(this);
        this.closeSession = this.closeSession.bind(this);
        this.isLoggedIn = this.isLoggedIn.bind(this);
        this.destroyCluster = this.destroyCluster.bind(this);
        this.sessionCount = this.sessionCount.bind(this);
        this.sessionInfo = [];
        this.messageQueue = [];
        this.imageQueue = [];
    }
    public sessionCount(): number {
        return this.sessionInfo.length;
    }
    public isLoggedIn(userId: string) {
        return this.sessionInfo.find(v => v.userId == userId) !== undefined;
    }
    public addMessageToQueue(message: string, userId: string) {
        this.messageQueue.push({userId: userId, message: message});
    }
    public addImageToQueue(filePath: string, userId: string) {
        this.imageQueue.push({userId: userId, filePath: filePath, isUploaded: false});
    }
    public async createCluster() {
        this.cluster = await pc.Cluster.launch({
            concurrency: pc.Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 10,
            timeout: Math.pow(2, 31) - 1,
            puppeteerOptions: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                  ],
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

    public async startSession(userId: string, onMessage: OnMessageCallback, onTyping: OnTypingCallback, readyForMessages: Function) {
        const userData = this.sessionInfo.find(v => v.userId == userId);
        if (!userData) {
            console.error('Could not find data for uid', userId);
            return false;
        }
        await this.cluster.queue(undefined, async ({page}) => {
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
                
                readyForMessages();

                const client = (<any>page)._client;

                client.on('Network.webSocketCreated', ({requestId, url}) => {
                    console.log('Network.webSocketCreated', requestId, url)
                })
                  
                client.on('Network.webSocketClosed', ({requestId, timestamp}) => {
                    console.log('Network.webSocketClosed', requestId, timestamp)
                })
                
                client.on('Network.webSocketFrameReceived', ({response}) => {
                    const json = JSON.parse(response.payloadData);

                    if (json.event_name === 'start_typing') {
                        onTyping(true);
                    }

                    // Ignore other events for right now.
                    if (json.event_name !== 'message') {
                        return;
                    }

                    onTyping(false);

                    const messagePayload = <Message>json.payload;
                    if (messagePayload) {
                        // If the nature is customer, it is us typing.
                        if (messagePayload.meta.nature !== 'Customer') {
                            onMessage(messagePayload.content);
                        }
                    }
                })

                while (this.sessionInfo.find(v => v.userId == userId)) {
                    try {
                        const queue = this.messageQueue.filter(v => v.userId == userId);
                        const imageQueue = this.imageQueue.filter(v => v.userId == userId);
                        if (imageQueue) {
                            try {
                                await page.waitForSelector('#upload-image-to-chat', { timeout: 1500 });
                                const inputUploadHandle = await page.$('#upload-image-to-chat');
                                imageQueue.forEach(async item => {
                                    if (inputUploadHandle) {
                                        console.warn('Uploading file', item.filePath);
                                        inputUploadHandle.uploadFile(item.filePath);
                                        item.isUploaded = true;
                                    }
                                    // Dodgy, but works for now, wait for upload...
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    if (item.isUploaded && Fs.existsSync(item.filePath)) {
                                        try {
                                            console.log('Unlinking', item.filePath);
                                            Fs.unlinkSync(item.filePath);
                                        } catch (error) {
                                            console.error('Failed to unlink a file', item.filePath, item.userId, error);
                                        }
                                    }
                                });
                            
                                // Remove only uploaded items from the array where the userId is the current session.
                                this.imageQueue = this.imageQueue.filter(v => !(v.isUploaded && v.userId == userId));
                            } catch (error) {
                                console.log('Could not upload image, no image button present.');
                            }
                        }
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
                        // Wait a bit...
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (error) {
                        console.error('Error inside while loop, reloading page...', error);
                        await page.goto('https://my.replika.ai')
                        await new Promise(resolve => setTimeout(resolve, 3000));
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