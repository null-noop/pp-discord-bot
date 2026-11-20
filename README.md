# Plane Shop Refresh Discord Bot

This bot posts `Plane shop has refreshed!` to a configured Discord channel every day at 00:00 UTC.

## Setup

1. Install [Node.js](https://nodejs.org/) 18 or newer.
2. Create a Discord application and add its bot to your server using the `bot` and `applications.commands` scopes. Give it permission to view and send messages in the target channel. To use `/members`, enable **Server Members Intent** under **Bot > Privileged Gateway Intents** in the Developer Portal.
3. Copy `.sample` to `.env` and set:
   - `DISCORD_TOKEN` to the bot token.
   - `DISCORD_CHANNEL_ID` to the channel where the message should be posted. Enable Developer Mode in Discord, then right-click the channel and choose **Copy Channel ID**.
4. Start the bot with Docker Compose:

   ```sh
   docker compose up -d --build
   ```

View its logs with `docker compose logs -f`; stop it with `docker compose down`.

The Compose service restarts automatically unless stopped. The bot sends at the next 00:00 UTC after startup and does not send catch-up messages if it was offline at midnight. To run it directly with Node.js instead, install dependencies with `npm install` and use `npm start`.

The bot also registers a `/ping` slash command, which replies `Pong!`, and an administrator-only `/members` command that privately lists server members and their roles in pages of 20. Use `/members page:2` to view another page.
