import {
    Client,
    GuildChannel,
    Role,
    User,
    Message,
    GuildMember,
    Permissions,
    Guild,
    Status,
    Presence,
    VoiceChannel,
    VoiceState,
    TextChannel,
    Constants,
} from 'discord.js';
import { Replika, ReplikaLoginResult } from './Replika';

const client = new Client({ partials: Object.values(Constants.PartialTypes)  });
const replika = new Replika();
class Bot {

    constructor() {
        this.safe = this.safe.bind(this);
        this.start = this.start.bind(this);
    }

    private safe(str: string) {
        return str.replace(/`/g, '');
    }
    
    public async start() {
        await replika.createCluster();

        client.on('message', async message => { 

            // Fetch the full message if partial.
            if (message.partial) await message.fetch();

            // Skip itself, do not allow it to process its own messages.
            if (message.author.id === client.user.id) return;

            
            if (message.channel.type !== 'dm' && message.mentions.members.find(v => v.user.id === client.user.id)) {
                // They've mentioned us, so let's dm them because they've not dm'd us.
                (await message.author.createDM()).send('Hiya, start off with the !login email password to login to Replika.ai.');
                return;
            } else if (message.channel.type !== 'dm') {
                return;
            }
           
            // Skip other bots now.
            if (message.author.bot) return;

            if (replika.isLoggedIn(message.author.id) && message.content.indexOf('!') !== 0) {
                replika.addMessageToQueue(message.cleanContent, message.author.id);
            }

            // Check for prefix.
            if (message.content.indexOf('!') !== 0) return;

            const args = message.content.slice(1).trim().split(/ +/g);
            const command = args.shift().toLowerCase();
            
            if (command === 'login' && args.length === 2) {
                const [email, pass] = args;
                const res = await replika.login(email, pass, message.author.id);
                switch (res) {
                    case ReplikaLoginResult.SUCCESS:
                        await message.channel.send('Alrighty, you\'re all logged in, hold tight while we connect to your Replika...')
                        await replika.startSession(message.author.id, async (content) => {
                            // Simply only handle text for now...
                            if (content.type === 'text') {
                                await message.channel.send(content.text);
                            }
                        }, async (isTyping) => {
                            isTyping ? message.channel.startTyping() : message.channel.stopTyping();
                        }, async () => {
                            message.channel.send('All sorted, you can start chatting now!')

                        });
                        break;
                    case ReplikaLoginResult.WRONG_USERNAME:
                        await message.channel.send('Woah, looks like your email is incorrect.')
                        break;
                    case ReplikaLoginResult.WRONG_PASSWORD: 
                        await message.channel.send('Woah, looks like your password is incorrect.');
                        break;
                }
                
            } else if (command === 'close' || command === 'logout') {
                await replika.closeSession(message.author.id);
            }
        });

        client.on('ready', () => {
            console.log(`Bot has started, with ${client.users.cache.size} users in cache, in ${client.channels.cache.size} cached channels of ${client.guilds.cache.size} cached guilds.`); 
            client.user.setActivity(`to ${client.guilds.cache.size} servers`, { type: "LISTENING" });
            console.log(`Logged in as ${client.user.tag}!`);
        });

        client.login(process.env.DISCORD_BOT_TOKEN);
    }
}

export = new Bot();