import 'dotenv/config';
import { Client, Events, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

const channelId = process.env.DISCORD_CHANNEL_ID;
const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('DISCORD_TOKEN must be set');
}

if (!channelId) {
  throw new Error('DISCORD_CHANNEL_ID must be set');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await readyClient.application.commands.set([
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('when')
        .setDescription('Shows time until next plane shop refresh and global event reset')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('table')
        .setDescription('Shows the leaderboard table for Pocket Planes')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('global')
        .setDescription('Shows current global event details and top contributors')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('members')
        .setDescription('Shows server members and their roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option => option
          .setName('page')
          .setDescription('Page of the member list to show')
          .setMinValue(1)
          .setRequired(false))
        .toJSON(),
    ]);
    console.log('Registered /ping, /when, /table, /global, and /global-table commands');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  console.log(`Connected to Discord as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === 'ping') {
    try {
      await interaction.reply('Pong!');
    } catch (error) {
      console.error('Failed to reply to /ping command:', error);
    }
  } else if (interaction.commandName === 'when') {
    try {
      const now = new Date();
      
      // Plane shop refresh (daily at 00:00 UTC)
      const nextMidnightUtc = new Date(now);
      nextMidnightUtc.setUTCHours(24, 0, 0, 0);
      const msUntilRefresh = nextMidnightUtc.getTime() - now.getTime();
      const refreshHours = Math.floor(msUntilRefresh / 3600000);
      const refreshMinutes = Math.floor((msUntilRefresh % 3600000) / 60000);

      // Global event reset (Monday 00:00 UTC)
      const nextMonday = new Date(now);
      const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
      nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
      nextMonday.setUTCHours(0, 0, 0, 0);
      const msUntilReset = nextMonday.getTime() - now.getTime();
      const resetDays = Math.floor(msUntilReset / 86400000);
      const resetHours = Math.floor((msUntilReset % 86400000) / 3600000);

      await interaction.reply(
        `**Plane Shop Refresh:** ${refreshHours}h ${refreshMinutes}m (00:00 UTC today)\n` +
        `**Global Event Reset:** ${resetDays}d ${resetHours}h (Monday 00:00 UTC)`
      );
    } catch (error) {
      console.error('Failed to reply to /when command:', error);
    }
  } else if (interaction.commandName === 'table') {
    await interaction.deferReply();
    try {
      const usRes = await fetch('https://pilots.nimblebit.com/api/tables?region=US');
      if (!usRes.ok) throw new Error(`API returned ${usRes.status}`);
      const usData = await usRes.json();

      const globalRes = await fetch('https://pilots.nimblebit.com/api/tables');
      if (!globalRes.ok) throw new Error(`API returned ${globalRes.status}`);
      const globalData = await globalRes.json();

      const topCompany = usData.cos[usData.list[0].id];
      const accentColor = topCompany?.paint?.accent || '#2f6fd0';
      const embed = new EmbedBuilder()
        .setTitle('Pocket Planes Leaderboards')
        .setColor(accentColor);

      // US Table
      let usDescription = 'US Leaderboard\n```\n';
      for (let i = 0; i < Math.min(15, usData.list.length); i++) {
        const company = usData.cos[usData.list[i].id];
        const rank = i + 1;
        const tag = company?.tag || 'N/A';
        const name = company?.name || 'Unknown';
        const money = usData.list[i].value.toLocaleString();
        const marker = tag === 'NJT' ? '> ' : '  ';
        usDescription += `${marker}${rank.toString().padEnd(2)} ${tag.padEnd(6)} ${name.substring(0, 20).padEnd(20)} $${money}\n`;
      }
      usDescription += '```';

      // Global Table
      let globalDescription = 'Global Leaderboard\n```\n';
      for (let i = 0; i < Math.min(15, globalData.list.length); i++) {
        const company = globalData.cos[globalData.list[i].id];
        const rank = i + 1;
        const tag = company?.tag || 'N/A';
        const name = company?.name || 'Unknown';
        const money = globalData.list[i].value.toLocaleString();
        const marker = tag === 'NJT' ? '> ' : '  ';
        globalDescription += `${marker}${rank.toString().padEnd(2)} ${tag.padEnd(6)} ${name.substring(0, 20).padEnd(20)} $${money}\n`;
      }
      globalDescription += '```';

      embed.addFields(
        { name: '\u200b', value: globalDescription },
        { name: '\u200b', value: usDescription }
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
      await interaction.editReply('Failed to fetch leaderboard data.');
    }
  } else if (interaction.commandName === 'global') {
    await interaction.deferReply();
    try {
      const res = await fetch('https://pilots.nimblebit.com/api/world?v=2');
      if (!res.ok) throw new Error(`API returned ${res.status}`);

      const data = await res.json();
      const event = data.event;

      const tableData = await fetch('https://pilots.nimblebit.com/api/tables?region=US');
      const tableJson = await tableData.json();
      const cos = tableJson.cos;

      const progress = Math.round((event.units / event.goal) * 100);
      const embed = new EmbedBuilder()
        .setTitle(event.name)
        .setColor('#2f6fd0')
        .setDescription(event.blurb)
        .addFields(
          { name: 'Goal', value: `${event.goal.toLocaleString()} ${event.unit}`, inline: true },
          { name: 'Progress', value: `${event.units.toLocaleString()} / ${event.goal.toLocaleString()} (${progress}%)`, inline: true },
          { name: 'Contributors', value: event.pilots.toLocaleString(), inline: true }
        );

      let topText = '';
      for (let i = 0; i < Math.min(5, event.top.length); i++) {
        const company = cos[event.top[i].id];
        const rank = i + 1;
        const tag = company?.tag || 'N/A';
        const units = event.top[i].units.toLocaleString();
        topText += `${rank}. **${tag}** - ${units} ${event.unit}\n`;
      }
      embed.addFields({ name: 'Top Contributors', value: topText });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to fetch global event:', error);
      await interaction.editReply('Failed to fetch global event data.');
    }
  } else if (interaction.commandName === 'members') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const members = await interaction.guild.members.fetch();
      const sortedMembers = [...members.values()].sort((left, right) =>
        left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
      );
      const pageSize = 20;
      const page = interaction.options.getInteger('page') ?? 1;
      const totalPages = Math.max(1, Math.ceil(sortedMembers.length / pageSize));

      if (page > totalPages) {
        await interaction.editReply(`There are ${totalPages} page(s) of members.`);
        return;
      }

      const rows = sortedMembers
        .slice((page - 1) * pageSize, page * pageSize)
        .map(member => {
          const name = member.displayName.replace(/[\r\n`]/g, ' ').slice(0, 24);
          const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .map(role => role.name)
            .join(', ') || 'None';
          return `${name.padEnd(24)}  ${roles.replace(/[\r\n`]/g, ' ').slice(0, 72)}`;
        });

      const table = [
        `${'User'.padEnd(24)}  Roles`,
        '-'.repeat(98),
        ...rows,
      ].join('\n');
      const embed = new EmbedBuilder()
        .setTitle('Server Members and Roles')
        .setDescription(`Page ${page}/${totalPages}\n\`\`\`\n${table}\n\`\`\``)
        .setFooter({ text: `${sortedMembers.length} members` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to fetch server members:', error);
      await interaction.editReply('Failed to fetch server members.');
    }
  }
});

function scheduleDailyMessage() {
  const now = new Date();
  const nextMidnightUtc = new Date(now);
  nextMidnightUtc.setUTCHours(24, 0, 0, 0);

  const delay = nextMidnightUtc.getTime() - now.getTime();
  setTimeout(async () => {
    try {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await channel.send('Plane shop has refreshed!');
        console.log('Sent daily plane shop refresh message');
      } else {
        console.error(`Channel ${channelId} not found in cache`);
      }
    } catch (error) {
      console.error('Failed to send daily plane shop refresh message:', error);
    }

    scheduleDailyMessage();
  }, delay);
}

async function startBot() {
  try {
    await client.login(token);
  } catch (error) {
    console.error('Failed to connect to Discord:', error);
    process.exitCode = 1;
    return;
  }

  scheduleDailyMessage();
  console.log('Daily plane shop refresh message scheduled for 00:00 UTC');
}

startBot();
