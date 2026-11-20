# Plane Shop Refresh Discord Bot

This bot posts `Plane shop has refreshed!` to a configured Discord channel every day at 00:00 UTC.

## Setup

1. Install [Node.js](https://nodejs.org/) 18 or newer.
2. Create a Discord application and add its bot to your server using the `bot` and `applications.commands` scopes. Enable **Server Members Intent** under **Bot > Privileged Gateway Intents** for `/members` and role assignment. Give the bot **Manage Roles**, and move its role above all licence roles in **Server Settings > Roles**. In panel channels, it also needs **View Channel**, **Send Messages**, **Read Message History**, and **Add Reactions**. In the configured notification channel, grant it **Mention @everyone, @here, and All Roles** so it can ping notification roles.
3. Copy `.sample` to `.env` and set:
   - `DISCORD_TOKEN` to the bot token.
   - `DISCORD_CHANNEL_ID` to the channel where the message should be posted. Enable Developer Mode in Discord, then right-click the channel and choose **Copy Channel ID**.
4. Start the bot with Docker Compose:

   ```sh
   docker compose up -d --build
   ```

View its logs with `docker compose logs -f`; stop it with `docker compose down`.

An administrator can run `/licences channel:#roles` to post a reaction panel. Users can react to add the matching licence role and remove their reaction to remove it.

An administrator can run `/notifications channel:#roles` to create the **Plane Shop Refresh** and **Global Event Reset** opt-in roles and post their reaction panel. The bot mentions the matching role in the daily shop refresh, Sunday event preview reminder, and Monday reset notification.

The Compose service restarts automatically unless stopped. The bot sends at the next 00:00 UTC after startup and does not send catch-up messages if it was offline at midnight. To run it directly with Node.js instead, install dependencies with `npm install` and use `npm start`.

The bot also registers a `/ping` slash command, which replies `Pong!`, and an administrator-only `/members` command that posts a text table of members with the Chief Pilot, Captain, or First Officer role. Listed licence roles appear by abbreviation, with up to 20 members per page. Choose a licence abbreviation to filter, such as `/members licence:HVY`, or use `/members page:2` to view another page.
