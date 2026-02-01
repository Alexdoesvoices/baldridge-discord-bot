import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  Partials, 
  Message, 
  Events, 
  ActivityType, 
  AuditLogEvent, 
  TextChannel 
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

if (!LOG_CHANNEL_ID) {
  throw new Error("LOG_CHANNEL_ID is missing in your .env file!");
}

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  client.user?.setActivity({ name: 'Im watching you', type: ActivityType.Watching });
  client.user?.setStatus('online');
});

client.on(Events.MessageDelete, async (message: Message | any) => {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (error) {
      return; 
    }
  }

  if (message.author?.bot || !message.guild) return;

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel;
  if (!logChannel || typeof logChannel.send !== 'function') return;

  let executorTag = message.author.tag;
  
  try {
    const fetchedLogs = await message.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MessageDelete,
    });

    const deletionLog = fetchedLogs.entries.first();

    if (deletionLog) {
      const { executor, target, createdTimestamp } = deletionLog;
      
      if (
        target?.id === message.author.id && 
        (Date.now() - createdTimestamp) < 5000 &&
        executor?.id !== message.author.id
      ) {
        executorTag = executor ? `${executor.tag}` : "A Moderator";
      }
    }
  } catch (err) {
  }

  const deleteEmbed = new EmbedBuilder()
    .setTitle('🗑️ Message Deleted')
    .setColor('Random')
    .setAuthor({ 
      name: message.author.tag, 
      iconURL: message.author.displayAvatarURL() 
    })
    .addFields(
      { name: 'Author', value: `${message.author}`, inline: true },
      { name: 'Deleted By', value: `**${executorTag}**`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true }
    )
    .setTimestamp();

  const safeContent = message.content && message.content.length > 0 
    ? message.content 
    : '*No text content*';
    
  deleteEmbed.addFields({ name: 'Content', value: safeContent });

  if (message.attachments && message.attachments.size > 0) {
    const firstAttachment = message.attachments.first();
    if (firstAttachment?.contentType?.startsWith('image/')) {
      deleteEmbed.setImage(firstAttachment.proxyURL || firstAttachment.url);
    }
    deleteEmbed.addFields({ 
      name: 'Attachment', 
      value: firstAttachment?.name || 'Unknown File' 
    });
  }

  try {
    await logChannel.send({ embeds: [deleteEmbed] });
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);