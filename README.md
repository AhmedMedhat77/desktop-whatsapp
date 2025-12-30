# ClinicMessenger

An Electron-based desktop application for automated WhatsApp messaging integrated with SQL Server databases. Perfect for healthcare/clinic management systems to send automated appointment confirmations, reminders, and patient welcome messages.

## Features

- 🤖 **Automated Messaging**: Sends WhatsApp messages automatically when appointments are created or patients are registered
- 📅 **Appointment Reminders**: Configurable reminder system (1 day, 2 days, or custom hours before appointments)
- 💬 **Manual Messaging**: Send messages manually with scheduling options
- 📊 **Message History**: Track all sent messages with search and filter capabilities
- 🔄 **Duplicate Prevention**: Prevents sending duplicate messages to the same recipient
- 🗄️ **Database Integration**: Monitors SQL Server databases for real-time updates
- ⚙️ **Easy Configuration**: Simple UI for database and reminder settings

## Quick Start

### Prerequisites

- Node.js v18 or higher
- SQL Server database access
- Google Chrome or Chromium installed

### Installation

```bash
# Install dependencies
npm install

# Install Puppeteer Chrome
npx puppeteer browsers install chrome

# Start development server
npm run dev
```

### Build

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## Documentation

📖 **For complete documentation, see [DOCUMENTATION.md](./DOCUMENTATION.md)**

The documentation includes:
- Architecture overview
- Installation & setup guide
- Configuration instructions
- API documentation
- Development guide
- Troubleshooting
- Maintenance guide

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, TanStack Router
- **Backend**: Node.js, Express, Electron
- **Database**: Microsoft SQL Server
- **WhatsApp**: whatsapp-web.js (Puppeteer-based)
- **Build**: Electron Vite, Electron Builder

## License

Copyright © 2025
