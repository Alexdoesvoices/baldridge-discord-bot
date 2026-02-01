import { 
  Client, GatewayIntentBits, EmbedBuilder, Partials, 
  Message, Events, ActivityType, AuditLogEvent, 
  TextChannel, User 
} from 'discord.js';
import { Database } from 'bun:sqlite';

const db = new Database("message_cache.sqlite", { create: true });

// Database initialization with timestamp migration
db.run("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, content TEXT, authorTag TEXT, authorId TEXT, channelId TEXT, timestamp INTEGER)");
db.run("CREATE TABLE IF NOT EXISTS mod_counts (executorId TEXT PRIMARY KEY, lastCount INTEGER)");
try { db.run("ALTER TABLE messages ADD COLUMN timestamp INTEGER"); } catch (e) {}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel],
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID as string;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- ENHANCED SYNC FUNCTION ---
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
      } catch (e) {
        // Silently skip channels without permissions
      }
    }
  }
  console.log(`✅ SYNC COMPLETE: Buffered ${syncedCount} messages into SQLite.`);
}

client.once(Events.ClientReady, async (c) => {
  console.log('--------------------------------------');
  console.log(`🚀 ONLINE: ${c.user.tag}`);
  
  await syncRecentMessages(); // Bot waits for sync to finish before continuing
  
  console.log('📡 MONITORING: Deletion logs active');
  console.log('--------------------------------------');
  client.user?.setActivity({ name: 'Deletions', type: ActivityType.Watching });
});

// Save live messages
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot || !message.guild) return;
  const insert = db.prepare("INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?)");
  insert.run(message.id, message.content, message.author.tag, message.author.id, message.channel.id, Date.now());
});

// Deletion Event with mod tracking logic
client.on(Events.MessageDelete, async (message: Message | any) => {
  let content = message.content;
  let authorTag = message.author?.tag;
  let authorId = message.author?.id;

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

  let executorUser: User | null = null;
  await wait(3000); 

  try {
    const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 8, type: AuditLogEvent.MessageDelete });
    const log = fetchedLogs.entries.find((entry: any) => {
      if (entry.target?.id !== authorId) return false;
      const executorId = entry.executor?.id;
      const currentCount = entry.extra?.count || 0;
      const lastAction: any = db.query("SELECT lastCount FROM mod_counts WHERE executorId = ?").get(executorId);
      const isNewAction = !lastAction || currentCount > lastAction.lastCount;
      const isRecent = (Date.now() - entry.createdTimestamp) < 45000;
      if (isNewAction && isRecent) {
        db.prepare("INSERT OR REPLACE INTO mod_counts VALUES (?, ?)").run(executorId, currentCount);
        return true;
      }
      return false;
    });
    if (log && log.executor && log.executor.id !== authorId) executorUser = log.executor;
  } catch (err) {}

  const deleteEmbed = new EmbedBuilder()
    .setTitle('🗑️ Message Deleted')
    .setColor(executorUser ? '#ff4757' : '#2f3542')
    .setAuthor({ name: authorTag })
    .addFields(
      { name: 'Author', value: `<@${authorId}>`, inline: true },
      { name: 'Deleted By', value: `**${executorUser ? executorUser.tag : authorTag}**`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
    )
    .setDescription('**Message: **' + content || '*No text content found*')
    .setTimestamp();

  logChannel.send({ embeds: [deleteEmbed] }).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);