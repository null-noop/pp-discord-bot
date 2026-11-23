import { readFileSync } from 'node:fs';
import { ChannelType, Client, Events, GatewayIntentBits, Partials, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import { FLEET_DATA_PATH, refreshFleet } from './scripts/scrape-fleet.js';

const channelId = process.env.DISCORD_CHANNEL_ID;
const token = process.env.DISCORD_TOKEN;
const memberDisplayRoles = ['Chief Pilot', 'Captain', 'First Officer'];
const memberLicenceRoles = [
  ['Private', 'PPL'],
  ['Night', 'NIGHT'],
  ['Instrument', 'IFR'],
  ['Commercial', 'CPL'],
  ['Multi-Engine', 'ME'],
  ['Jet', 'JET'],
  ['Airline Transport', 'ATP'],
  ['Heavy Jet', 'HVY'],
  ['Helicopter', 'HELI'],
  ['Twin-Turbine', 'TWIN-H'],
  ['Heavy-Lift', 'LIFT'],
  ['Tiltrotor', 'TILT'],
  ['Seaplane', 'SEA'],
];
const licenceReactionEmojis = [
  '🪪',
  '🌙',
  '🧭',
  '💼',
  '⚙️',
  '✈️',
  '🛬',
  '🛫',
  '🚁',
  '🔩',
  '🏗️',
  '🛸',
  '🌊',
];
const legacyLicenceReactionEmojis = {
  HVY: '\u0031\uFE0F\u20E3',
  ATP: '\u0032\uFE0F\u20E3',
  JET: '\u0033\uFE0F\u20E3',
  ME: '\u0034\uFE0F\u20E3',
  CPL: '\u0035\uFE0F\u20E3',
  IFR: '\u0036\uFE0F\u20E3',
  NIGHT: '\u0037\uFE0F\u20E3',
  PPL: '\u0038\uFE0F\u20E3',
  HELI: '\u0039\uFE0F\u20E3',
  'TWIN-H': '\u0030\uFE0F\u20E3',
  LIFT: '\u{1F51F}',
  SEA: '\u{1F170}\uFE0F',
};
const licencePanelHeader = '🚆 **Welcome to NJ Transit!** ✈️';
const legacyLicencePanelHeader = '**Licence roles**';
const licencePanelOptions = memberLicenceRoles.map(([roleName, abbreviation], index) => ({
  roleName,
  abbreviation,
  emoji: licenceReactionEmojis[index],
  legacyEmoji: legacyLicenceReactionEmojis[abbreviation],
}));
const licenceDescriptions = {
  PPL: 'Private Pilot License',
  NIGHT: 'Night Rating',
  IFR: 'Instrument Rating',
  CPL: 'Commercial Pilot License',
  ME: 'Multi-Engine Rating',
  JET: 'Jet Type Rating',
  ATP: 'Airline Transport Pilot',
  HVY: 'Heavy Jet Rating',
  HELI: 'Helicopter License',
  'TWIN-H': 'Twin-Turbine Rating',
  LIFT: 'Heavy-Lift Rating',
  TILT: 'Tiltrotor Rating',
  SEA: 'Seaplane Rating',
};
const notificationRoleOptions = [
  { roleName: 'Plane Shop Refresh', emoji: '🔔', description: 'Daily plane shop refresh' },
  { roleName: 'Global Event Reset', emoji: '🌍', description: 'Sunday event preview and Monday reset' },
];
const notificationPanelHeader = '🔔 **NJ Transit Notification Roles**';
let planeData = JSON.parse(readFileSync(FLEET_DATA_PATH, 'utf8'));

function findPlane(name) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return planeData.planes.find(plane =>
    plane.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
  );
}

if (!token) {
  throw new Error('DISCORD_TOKEN must be set');
}

if (!channelId) {
  throw new Error('DISCORD_CHANNEL_ID must be set');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

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
        .setName('plane')
        .setDescription('Shows aircraft details or compares two planes')
        .addStringOption(option => option
          .setName('name')
          .setDescription('Aircraft name')
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption(option => option
          .setName('compare')
          .setDescription('Second aircraft to compare')
          .setRequired(false)
          .setAutocomplete(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('fleet-refresh')
        .setDescription('Refresh the fleet data from the NimbleBit wiki')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('members')
        .setDescription('Shows server members and their roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => option
          .setName('licence')
          .setDescription('Filter members by licence abbreviation')
          .addChoices(...memberLicenceRoles.map(([, abbreviation]) => ({
            name: abbreviation,
            value: abbreviation,
          })))
          .setRequired(false))
        .addIntegerOption(option => option
          .setName('page')
          .setDescription('Page of the member list to show')
          .setMinValue(1)
          .setRequired(false))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('licences')
        .setDescription('Create a reaction panel for licence roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option
          .setName('channel')
          .setDescription('Channel where the licence panel will be posted')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true))
        .toJSON(),
      new SlashCommandBuilder()
        .setName('notifications')
        .setDescription('Create a reaction panel for notification roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option
          .setName('channel')
          .setDescription('Channel where the notification panel will be posted')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true))
        .toJSON(),
    ]);
    console.log('Registered /ping, /when, /table, /global, /plane, /fleet-refresh, /members, /licences, and /notifications commands');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  console.log(`Connected to Discord as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
    if (!['plane'].includes(interaction.commandName)) return;
    const focused = interaction.options.getFocused().trim().toLowerCase();
    const choices = planeData.planes
      .filter(plane => plane.name.toLowerCase().includes(focused))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 25)
      .map(plane => ({ name: plane.name, value: plane.name }));
    await interaction.respond(choices);
    return;
    }

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

      await interaction.editReply(
        `**Pocket Planes Leaderboards**\n\n${globalDescription}\n\n${usDescription}`
      );
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
      const topText = event.top.slice(0, 5).map((pilot, index) => {
        const company = cos[pilot.id];
        const tag = company?.tag || 'N/A';
        return `${index + 1}. **${tag}** - ${pilot.units.toLocaleString()} ${event.unit}`;
      }).join('\n') || 'No contributors yet.';

      await interaction.editReply([
        `**${event.name}**`,
        event.blurb,
        `**Goal:** ${event.goal.toLocaleString()} ${event.unit}`,
        `**Progress:** ${event.units.toLocaleString()} / ${event.goal.toLocaleString()} ${event.unit} (${progress}%)`,
        `**Contributors:** ${event.pilots.toLocaleString()}`,
        '**Top Contributors**',
        topText,
      ].join('\n\n'));
    } catch (error) {
      console.error('Failed to fetch global event:', error);
      await interaction.editReply('Failed to fetch global event data.');
    }
  } else if (interaction.commandName === 'plane') {
    const name = interaction.options.getString('name', true);
    const compareName = interaction.options.getString('compare');
    const plane = findPlane(name);

    if (!plane) {
      await interaction.reply({ content: `No aircraft named **${name}** was found.`, ephemeral: true });
      return;
    }

    if (!compareName) {
      await interaction.reply([
        `**${plane.name}**`,
        `**Seats:** ${plane.seats ?? 'N/A'}  **Cargo:** ${plane.cargoDisplay}`,
        `**Speed:** ${plane.speedDisplay}  **Range:** ${plane.rangeDisplay}`,
        `**Runway:** ${plane.runway}  **License:** ${plane.licenseDisplay}`,
        `**Price:** ${plane.price}`,
        ...(plane.restorationCost ? [`**Restoring:** ${plane.restorationCost}`] : []),
        ...(plane.wikiUrl ? [`**Wiki:** ${plane.wikiUrl}`] : []),
      ].join('\n'));
      return;
    }

    const comparedPlane = findPlane(compareName);
    if (!comparedPlane) {
      await interaction.reply({ content: `No aircraft named **${compareName}** was found.`, ephemeral: true });
      return;
    }

    const rows = [
      ['Seats', plane.seats, comparedPlane.seats],
      ['Cargo', plane.cargoDisplay, comparedPlane.cargoDisplay],
      ['Speed', plane.speedDisplay, comparedPlane.speedDisplay],
      ['Range', plane.rangeDisplay, comparedPlane.rangeDisplay],
      ['Runway', plane.runway, comparedPlane.runway],
      ['License', plane.licenseDisplay, comparedPlane.licenseDisplay],
      ['Price', plane.price, comparedPlane.price],
      ['Restoring', plane.restorationCost ?? 'Not applicable', comparedPlane.restorationCost ?? 'Not applicable'],
    ];

    const metricWidth = Math.max(7, ...rows.map(([metric]) => metric.length));
    const leftWidth = Math.max(plane.name.length, ...rows.map(([, left]) => String(left ?? 'N/A').length));
    const rightWidth = Math.max(comparedPlane.name.length, ...rows.map(([, , right]) => String(right ?? 'N/A').length));
    const pad = (value, width) => String(value).padEnd(width, ' ');

    const table = [
      ` ${pad('Metric', metricWidth)} | ${pad(plane.name, leftWidth)} | ${pad(comparedPlane.name, rightWidth)} `,
      `-${'-'.repeat(metricWidth)}-|-${'-'.repeat(leftWidth)}-|-${'-'.repeat(rightWidth)}-`,
      ...rows.map(([metric, left, right]) =>
        ` ${pad(metric, metricWidth)} | ${pad(left ?? 'N/A', leftWidth)} | ${pad(right ?? 'N/A', rightWidth)} `
      ),
    ].join('\n');

    const wikiLinks = [
      plane.wikiUrl ? `[${plane.name}](${plane.wikiUrl})` : plane.name,
      comparedPlane.wikiUrl ? `[${comparedPlane.name}](${comparedPlane.wikiUrl})` : comparedPlane.name,
    ].join(' | ');
    await interaction.reply(`\`\`\`text\n${table}\n\`\`\`\n**Wiki:** ${wikiLinks}`);
  } else if (interaction.commandName === 'fleet-refresh') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const fleet = await refreshFleet();
      planeData = fleet;
      await interaction.editReply(`Fleet data refreshed: ${fleet.planes.length} aircraft updated.`);
    } catch (error) {
      console.error('Failed to refresh fleet data:', error);
      await interaction.editReply(`Fleet refresh failed: ${error.message}`);
    }
  } else if (interaction.commandName === 'members') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    try {
      const members = [];
      let after;
      while (true) {
        const batch = await interaction.guild.members.list({ limit: 1000, after, cache: false });
        members.push(...batch.values());
        if (batch.size < 1000) break;
        after = batch.last().id;
      }
      const selectedLicence = interaction.options.getString('licence');
      const selectedLicenceRole = memberLicenceRoles.find(([, abbreviation]) =>
        abbreviation === selectedLicence
      )?.[0];
      const sortedMembers = members
        .filter(member => memberDisplayRoles.some(roleName =>
          member.roles.cache.some(role => role.name === roleName)
        ) && (!selectedLicenceRole || member.roles.cache.some(role => role.name === selectedLicenceRole)))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
        );

      if (sortedMembers.length === 0) {
        const filterMessage = selectedLicence ? ` and licence ${selectedLicence}` : '';
        await interaction.editReply(`No members with the listed roles${filterMessage} were found.`);
        return;
      }

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
          const roles = memberDisplayRoles
            .filter(roleName => member.roles.cache.some(role => role.name === roleName))
            .join(', ');
          const licences = memberLicenceRoles
            .filter(([roleName]) => member.roles.cache.some(role => role.name === roleName))
            .map(([, abbreviation]) => abbreviation)
            .join(', ') || 'None';
          return `${name.padEnd(24)}  ${roles.padEnd(36)}  ${licences}`;
        });

      const table = [
        `${'User'.padEnd(24)}  ${'Roles'.padEnd(36)}  Licences`,
        '-'.repeat(80),
        ...rows,
      ].join('\n');
      await interaction.editReply(
        `**Server Members and Roles${selectedLicence ? ` (${selectedLicence})` : ''}** (Page ${page}/${totalPages})\n\`\`\`\n${table}\n\`\`\`\n${sortedMembers.length} members`
      );
    } catch (error) {
      console.error('Failed to fetch server members:', error);
      await interaction.editReply('Failed to fetch server members.');
    }
  } else if (interaction.commandName === 'licences') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const guild = interaction.guild;
      const channel = interaction.options.getChannel('channel', true);
      const botMember = guild.members.me ?? await guild.members.fetchMe();
      const channelPermissions = channel.permissionsFor(botMember);
      const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ];

      if (!channelPermissions?.has(requiredChannelPermissions)) {
        await interaction.editReply('I need View Channel, Send Messages, Read Message History, and Add Reactions in that channel.');
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.editReply('I need the Manage Roles permission to assign licence roles.');
        return;
      }

      const roleOptions = licencePanelOptions.map(option => ({
        ...option,
        role: guild.roles.cache.find(role => role.name === option.roleName),
      }));
      const missingRoles = roleOptions.filter(option => !option.role);
      if (missingRoles.length > 0) {
        await interaction.editReply(`These server roles were not found: ${missingRoles.map(option => option.roleName).join(', ')}`);
        return;
      }

      const unmanageableRoles = roleOptions.filter(option =>
        botMember.roles.highest.comparePositionTo(option.role) <= 0
      );
      if (unmanageableRoles.length > 0) {
        await interaction.editReply(`Move my bot role above these roles: ${unmanageableRoles.map(option => option.roleName).join(', ')}`);
        return;
      }

      const panelContent = [
        licencePanelHeader,
        '',
        "Welcome aboard **NJ Transit**, a growing airline company in Pocket Pilots! Whether you're a seasoned pilot or just getting your wings, we're excited to have you join our team.",
        '',
        'Our goal is to build a successful airline together, expand our operations, and help each other grow along the way!',
        '',
        '🛫 **Ready to join the fleet?**',
        '- **Company Name:** NJ Transit',
        '- **Company Code:** `EANRZA`',
        '',
        '🪪 **Pilot Licenses & Reaction Roles**',
        '',
        'React with the corresponding emoji to show which licenses you have earned. Select all licenses you currently hold and update your roles as you advance!',
        ...licencePanelOptions.map(option => `${option.emoji} **${option.abbreviation}** - ${licenceDescriptions[option.abbreviation]}`),
        '',
        'All pilots are welcome, regardless of experience. Join us, take to the skies, and help make NJ Transit a success!',
        '',
        '**Fly together. Grow together. Welcome aboard!** 🛩️',
      ].join('\n');
      let panelMessage;
      try {
        panelMessage = await channel.send(panelContent);
        for (const option of licencePanelOptions) {
          await panelMessage.react(option.emoji);
        }
      } catch (error) {
        await panelMessage?.delete().catch(() => { });
        throw error;
      }

      await interaction.editReply(`Licence role panel created in ${channel}: ${panelMessage.url}`);
    } catch (error) {
      console.error('Failed to create licence role panel:', error);
      await interaction.editReply('Failed to create the licence role panel. Check the bot permissions and role hierarchy.');
    }
  } else if (interaction.commandName === 'notifications') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const guild = interaction.guild;
      const panelChannel = interaction.options.getChannel('channel', true);
      const botMember = guild.members.me ?? await guild.members.fetchMe();
      const panelPermissions = panelChannel.permissionsFor(botMember);
      const requiredPanelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ];

      if (!panelPermissions?.has(requiredPanelPermissions)) {
        await interaction.editReply('I need View Channel, Send Messages, Read Message History, and Add Reactions in the panel channel.');
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.editReply('I need the Manage Roles permission to create and assign notification roles.');
        return;
      }

      const notificationChannel = await guild.channels.fetch(channelId);
      if (!notificationChannel) {
        await interaction.editReply('The configured notification channel was not found in this server.');
        return;
      }
      const notificationPermissions = notificationChannel.permissionsFor(botMember);
      if (!notificationPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.MentionEveryone,
      ])) {
        await interaction.editReply('I need View Channel, Send Messages, and Mention @everyone, @here, and All Roles in the configured notification channel.');
        return;
      }

      const roles = [];
      for (const option of notificationRoleOptions) {
        const role = guild.roles.cache.find(candidate => candidate.name === option.roleName)
          ?? await guild.roles.create({
            name: option.roleName,
            reason: 'Create opt-in notification role',
          });
        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
          await interaction.editReply(`Move my bot role above ${role.name}.`);
          return;
        }
        roles.push({ ...option, role });
      }

      const panelContent = [
        notificationPanelHeader,
        '',
        'React to opt in to a notification. Remove your reaction to opt out.',
        ...roles.map(option => `${option.emoji} **${option.role.name}** - ${option.description}`),
      ].join('\n');
      let panelMessage;
      try {
        panelMessage = await panelChannel.send(panelContent);
        for (const option of roles) {
          await panelMessage.react(option.emoji);
        }
      } catch (error) {
        await panelMessage?.delete().catch(() => {});
        throw error;
      }

      await interaction.editReply(`Notification role panel created in ${panelChannel}: ${panelMessage.url}`);
    } catch (error) {
      console.error('Failed to create notification role panel:', error);
      await interaction.editReply('Failed to create the notification role panel. Check the bot permissions and role hierarchy.');
    }
  }
  } catch (error) {
    if (error?.code === 10062) {
      console.warn('Ignored an expired Discord interaction');
      return;
    }
    console.error('Failed to handle Discord interaction:', error);
  }
});

async function updateReactionRole(reaction, user, shouldHaveRole) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();

  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.guild || message.author?.id !== client.user.id) return;

  const isLicencePanel = message.content.startsWith(licencePanelHeader) ||
    message.content.startsWith(legacyLicencePanelHeader);
  const isNotificationPanel = message.content.startsWith(notificationPanelHeader);
  if (!isLicencePanel && !isNotificationPanel) return;

  const options = isLicencePanel ? licencePanelOptions : notificationRoleOptions;
  const option = options.find(candidate =>
    candidate.emoji === reaction.emoji.name || candidate.legacyEmoji === reaction.emoji.name
  );
  if (!option) return;

  const role = message.guild.roles.cache.find(candidate => candidate.name === option.roleName);
  if (!role) return;

  const member = await message.guild.members.fetch({ user: user.id, force: true });
  if (shouldHaveRole && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Licence role selected from the reaction panel');
  } else if (!shouldHaveRole && member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Licence role deselected from the reaction panel');
  }
}

client.on(Events.MessageReactionAdd, (reaction, user) => {
  updateReactionRole(reaction, user, true).catch(error => {
    console.error('Failed to assign reaction role:', error);
  });
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  updateReactionRole(reaction, user, false).catch(error => {
    console.error('Failed to remove reaction role:', error);
  });
});

async function sendNotification(channel, roleName, message) {
  const role = channel.guild.roles.cache.find(candidate => candidate.name === roleName);
  await channel.send({
    content: `${role ? `${role} ` : ''}${message}`,
    allowedMentions: { roles: role ? [role.id] : [] },
  });
}

function scheduleDailyMessage() {
  const now = new Date();
  const nextMidnightUtc = new Date(now);
  nextMidnightUtc.setUTCHours(24, 0, 0, 0);

  const delay = nextMidnightUtc.getTime() - now.getTime();
  setTimeout(async () => {
    try {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await sendNotification(channel, 'Plane Shop Refresh', 'Plane shop has refreshed!');
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

function scheduleWeeklyResetMessage() {
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);

  const delay = nextMonday.getTime() - now.getTime();
  setTimeout(async () => {
    try {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await sendNotification(channel, 'Global Event Reset', 'The global event has reset!');
        console.log('Sent weekly global event reset message');
      } else {
        console.error(`Channel ${channelId} not found in cache`);
      }
    } catch (error) {
      console.error('Failed to send weekly global event reset message:', error);
    }

    scheduleWeeklyResetMessage();
  }, delay);
}

function scheduleGlobalEventPreviewMessage() {
  const now = new Date();
  const nextSunday = new Date(now);
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(0, 0, 0, 0);

  const delay = nextSunday.getTime() - now.getTime();
  setTimeout(async () => {
    try {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await sendNotification(
          channel,
          'Global Event Reset',
          'The next global event preview is available! The event resets in 24 hours.'
        );
        console.log('Sent global event preview notification');
      } else {
        console.error(`Channel ${channelId} not found in cache`);
      }
    } catch (error) {
      console.error('Failed to send global event preview notification:', error);
    }

    scheduleGlobalEventPreviewMessage();
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
  scheduleWeeklyResetMessage();
  scheduleGlobalEventPreviewMessage();
  console.log('Daily plane shop refresh, global event preview, and weekly reset messages scheduled');
}

startBot();
