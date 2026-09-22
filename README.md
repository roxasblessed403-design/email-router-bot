# 📧 Email Router Bot

Telegram bot for managing Cloudflare email routing with bulk email creation.

## Features

- Telegram interface with inline buttons
- Single and bulk email creation (up to 1000 per request)
- REST API with token authentication
- Cloudflare Email Routing integration
- Docker ready

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

Or with Docker:

```bash
cp .env.example .env
docker-compose up -d
```

## Configuration

Edit `.env` with:
- Telegram Bot Token (from @BotFather)
- Cloudflare API Key and Zone ID
- Email domain and forward address

## Usage

Send `/start` to your Telegram bot and follow the menu.

## License

MIT License