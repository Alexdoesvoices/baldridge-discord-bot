import { Client, GatewayIntentBits, EmbedBuilder, Partials, Message, Events } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

if (!LOG_CHANNEL_ID) {
  throw new Error("LOG_CHANNEL_ID is missing in your .env file!");
}

client.on('messageDelete', async (message: Message | any) => {
  if (message.partial) return;
  if (message.author?.bot || !message.guild) return;

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel || !('send' in logChannel)) return;

  const deleteEmbed = new EmbedBuilder()
    .setTitle('🗑️ Message Deleted')
    .setColor('#ff4757')
    .setAuthor({ 
      name: message.author.tag, 
      iconURL: message.author.displayAvatarURL() 
    })
    .setDescription(`**Channel:** ${message.channel}`)
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


client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);