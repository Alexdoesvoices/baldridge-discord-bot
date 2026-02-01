import { 
  Client, GatewayIntentBits, EmbedBuilder, Partials, 
  Message, Events, ActivityType, TextChannel 
} from 'discord.js';
import { Database } from 'bun:sqlite';

const db = new Database("message_cache.sqlite", { create: true });

// Setup Table
db.run("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, content TEXT, authorTag TEXT, authorId TEXT, channelId TEXT, timestamp INTEGER)");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel],
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID as string;

// --- SYNC FUNCTION ---
async function syncRecentMessages() {
  let syncedCount = 0;
  console.log('🔄 SYNC START: Grabbing messages missed while offline...');
  for (const guild of client.guilds.cache.values()) {
    const channels = guild.channels.cache.filter(c => c.isTextBased() && !c.isThread());
    for (const channel of channels.values()) {
      try {
        const textChannel = channel as TextChannel;
        const messages = await textChannel.messages.fetch({ limit: 50 });
        const insert = db.prepare("INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?)");
        messages.forEach(msg => {
          if (!msg.author.bot) {
            insert.run(msg.id, msg.content, msg.author.tag, msg.author.id, msg.channelId, msg.createdTimestamp);
            syncedCount++;
          }
        });
      } catch (e) {}
    }
  }
  console.log(`✅ SYNC COMPLETE: Buffered ${syncedCount} messages.`);
}

client.once(Events.ClientReady, async (c) => {
  console.log('--------------------------------------');
  console.log(`🚀 ONLINE: ${c.user.tag}`);
  await syncRecentMessages();
  console.log('📡 MONITORING: Simple deletion logs active');
  console.log('--------------------------------------');
  client.user?.setActivity({ name: 'Im watching you', type: ActivityType.Watching });
});

// Save live messages to SQLite
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot || !message.guild) return;
  const insert = db.prepare("INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?)");
  insert.run(message.id, message.content, message.author.tag, message.author.id, message.channel.id, Date.now());
});

client.on(Events.MessageDelete, async (message: Message | any) => {
  let content = message.content;
  let authorTag = message.author?.tag;
  let authorId = message.author?.id;

  // Retrieve from SQLite if bot restarted or message was sent while offline
  if (!content || !authorTag) {
    const row: any = db.query("SELECT * FROM messages WHERE id = ?").get(message.id);
    if (row) {
      content = row.content;
      authorTag = row.authorTag;
      authorId = row.authorId;
    } else return; 
  }

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel;
  if (!logChannel) return;

  const deleteEmbed = new EmbedBuilder()
    .setTitle('🗑️ Message Deleted')
    .setColor('#ff4757')
    .setAuthor({ name: authorTag })
    .addFields(
      { name: 'Author', value: `<@${authorId}>`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
    )
    .setDescription('**Message:**\n' + (content || '*No text content found*'))
    .setTimestamp();

  // Keep image logging if it was in the cache
  if (message.attachments?.size > 0) {
    const img = message.attachments.first();
    if (img?.contentType?.startsWith('image/')) deleteEmbed.setImage(img.proxyURL || img.url);
  }

  logChannel.send({ embeds: [deleteEmbed] }).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);
