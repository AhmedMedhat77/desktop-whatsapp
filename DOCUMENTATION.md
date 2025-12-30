# ClinicMessenger - Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Configuration](#configuration)
5. [Features](#features)
6. [API Documentation](#api-documentation)
7. [Development Guide](#development-guide)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Overview

**WhatsApp Desktop Manager** is an Electron-based desktop application that automates WhatsApp messaging for healthcare/clinic management systems. It integrates with SQL Server databases to monitor appointments, patients, and send automated WhatsApp messages.

### Key Capabilities

- **Automated Messaging**: Sends WhatsApp messages automatically when new appointments are created, new patients are registered, or appointment reminders are needed
- **Database Integration**: Connects to SQL Server databases to monitor and respond to data changes
- **Message Scheduling**: Schedule messages to be sent immediately, after delays, or at specific times
- **Message History**: Track all sent messages with status, type, and timestamps
- **Duplicate Prevention**: Prevents sending duplicate messages to the same recipient

### Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, TanStack Router
- **Backend**: Node.js, Express, Electron
- **Database**: Microsoft SQL Server (mssql)
- **WhatsApp**: whatsapp-web.js (Puppeteer-based)
- **Build Tool**: Electron Vite, Electron Builder

---

## Architecture

### Application Structure

```
desktop-whatsapp/
├── src/
│   ├── main/              # Electron main process
│   │   └── index.ts       # Main process entry point, IPC handlers
│   ├── preload/           # Preload scripts (bridge between main and renderer)
│   │   ├── index.ts      # API exposure via contextBridge
│   │   └── index.d.ts    # TypeScript definitions
│   └── renderer/          # React frontend
│       └── src/
│           ├── components/    # React components
│           ├── routes/        # Page components
│           ├── hooks/         # Custom React hooks
│           └── utils/        # Utility functions
├── server/                # Backend server code
│   ├── db/                # Database connection and utilities
│   ├── modules/          # Business logic modules
│   │   ├── appointment/  # Appointment monitoring
│   │   └── patient/      # Patient monitoring
│   ├── utils/            # Utility functions
│   └── constants/        # Constants and queries
└── dist/                  # Build output
```

### Process Architecture

1. **Main Process** (`src/main/index.ts`)
   - Manages Electron window lifecycle
   - Handles IPC communication
   - Manages server lifecycle
   - Coordinates database and WhatsApp connections

2. **Renderer Process** (`src/renderer/`)
   - React-based UI
   - Communicates with main process via IPC
   - Manages local state and UI interactions

3. **Preload Script** (`src/preload/index.ts`)
   - Securely exposes Node.js APIs to renderer
   - Provides type-safe API interface

4. **Server Modules** (`server/modules/`)
   - Monitor database tables for changes
   - Trigger automated messages
   - Handle scheduling and reminders

### Data Flow

```
Database → Server Modules → WhatsApp Client → WhatsApp Web → Recipients
                ↓
         Message History (localStorage)
                ↓
         UI Display (React)
```

---

## Installation & Setup

### Prerequisites

- **Node.js**: v18 or higher
- **npm** or **yarn** package manager
- **SQL Server**: Access to Microsoft SQL Server database
- **Google Chrome** or **Chromium**: Required for WhatsApp Web automation
- **Windows/macOS/Linux**: Supported platforms

### Installation Steps

1. **Clone or download the project**

```bash
cd desktop-whatsapp
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
```

3. **Install Puppeteer Chrome** (if not already installed)

```bash
npx puppeteer browsers install chrome
```

4. **Build the application**

```bash
# For development
npm run dev

# For production build (Windows)
npm run build:win

# For production build (macOS)
npm run build:mac

# For production build (Linux)
npm run build:linux
```

### First Run

1. Launch the application
2. Navigate to **Settings** page
3. Configure database connection:
   - Server/Host
   - Database name
   - Username
   - Password
4. Click **"Save Configuration"** and **"Test Connection"**
5. Go to **Home** page
6. Click **"Start Server"**
7. Click **"Connect WhatsApp"** and scan QR code
8. Once connected, automated messaging will begin

---

## Configuration

### Database Configuration

Database settings are stored in `.server-config.json` in the application directory.

**Configuration Fields:**
- `server`: SQL Server hostname or IP address
- `database`: Database name
- `user`: SQL Server username
- `password`: SQL Server password

**Example:**
```json
{
  "server": "localhost",
  "database": "ClinicDB",
  "user": "sa",
  "password": "your_password"
}
```

### Appointment Reminder Settings

Configure when appointment reminders are sent:

- **1 Day Before**: Reminders sent 24 hours before appointment
- **2 Days Before**: Reminders sent 48 hours before appointment
- **Custom Hours**: Set custom number of hours (1-168 hours)

**Settings Location**: Settings page → Appointment Reminder Settings

### Environment Variables

Optional environment variables (`.env` file):

```env
NODE_ENV=production
PORT=3000
```

---

## Features

### 1. Automated Messaging

#### New Appointment Messages
- **Trigger**: When a new appointment is created in the database
- **Message Type**: `appointment`
- **Content**: Includes appointment date, time, doctor name, clinic information

#### Appointment Reminders
- **Trigger**: Based on configured reminder timing (1 day, 2 days, or custom hours before appointment)
- **Message Type**: `appointmentReminder`
- **Content**: Reminder with appointment details

#### New Patient Messages
- **Trigger**: When a new patient is registered
- **Message Type**: `newPatient`
- **Content**: Welcome message with patient file number and clinic information

### 2. Manual Messaging

- Send messages manually to any phone number
- Schedule messages with delays:
  - Immediate
  - After 1 minute
  - After 1 hour
  - After 1 day
  - Custom delay (in milliseconds)

### 3. Message Management

- **Message History**: View all sent messages with:
  - Phone number and user name
  - Message content
  - Message type (appointment, reminder, new patient, manual)
  - Status (sent, failed, pending)
  - Timestamp
  - Error messages (if failed)

- **Search & Filter**:
  - Search by name, phone number, or message content
  - Filter by message type
  - Filter by status

- **Statistics**: View message counts by type and status

### 4. Duplicate Prevention

- Automatically prevents sending duplicate messages to the same recipient
- Checks within 24-hour window
- Allows different message types to the same user

### 5. Server Management

- Start/Stop backend server
- Health check monitoring
- Database connection status
- WhatsApp connection status

### 6. WhatsApp Authentication

- QR code scanning for initial authentication
- Session persistence (no need to re-scan)
- Delete cache option for re-authentication

---

## API Documentation

### IPC API (Preload)

All APIs are exposed via `window.api` in the renderer process.

#### Server Management

```typescript
// Start the backend server
startServer(): Promise<string>

// Stop the backend server
stopServer(): Promise<string>

// Check server health
checkHealth(): Promise<boolean>
```

#### Database Management

```typescript
// Create/save database configuration
createDbConfigFile(config: IConfig): Promise<boolean>

// Connect to database
connectToDB(): Promise<ConnectionResult>

// Check database connection status
checkDbStatus(): Promise<boolean>
```

#### WhatsApp Management

```typescript
// Initialize WhatsApp client
initializeWhatsapp(): Promise<{ success: boolean; status: WhatsAppStatus; error?: string }>

// Get current WhatsApp status
getWhatsappStatus(): Promise<WhatsAppStatus>

// Disconnect WhatsApp
disconnectWhatsapp(): Promise<{ success: boolean; error?: string }>

// Delete WhatsApp authentication cache
deleteWhatsappAuth(): Promise<{ success: boolean; error?: string }>

// Listen for WhatsApp status changes
onWhatsappStatus(
  callback: (event: Electron.IpcRendererEvent, data: { status: WhatsAppStatus; data?: unknown }) => void
): () => void
```

#### Message Management

```typescript
// Send a message
sendMessage(
  phoneNumber: string,
  message: string,
  delay?: ScheduleDelay,
  customDelayMs?: number
): Promise<{ success: boolean; scheduled?: boolean; jobId?: string; error?: string }>

// Get scheduled jobs
getScheduledJobs(): Promise<Array<{
  id: string
  delay: ScheduleDelay
  customDelayMs?: number
  executeAt: string
  phoneNumber: string
  message: string
}>>

// Cancel a scheduled job
cancelScheduledJob(jobId: string): Promise<{ success: boolean; error?: string }>

// Listen for message sent events
onMessageSent(
  callback: (event: Electron.IpcRendererEvent, data: {
    phoneNumber: string
    userName?: string
    message: string
    messageType: MessageType
    status: 'sent' | 'failed' | 'pending'
    sentAt: string
    error?: string
  }) => void
): () => void
```

#### Appointment Reminder Settings

```typescript
// Get appointment reminder settings
getAppointmentReminderSettings(): Promise<AppointmentReminderSettings>

// Set appointment reminder settings
setAppointmentReminderSettings(settings: AppointmentReminderSettings): Promise<{ success: boolean; error?: string }>
```

### Types

```typescript
interface IConfig {
  user: string
  password: string
  server: string
  database: string
}

type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready'
  | 'auth_failure'
  | 'disconnected_error'

type ScheduleDelay = 'immediate' | '1min' | '1hour' | '1day' | 'custom'

type MessageType = 'appointment' | 'appointmentReminder' | 'newPatient' | 'manual'

interface AppointmentReminderSettings {
  reminderType: '1day' | '2days' | 'custom'
  customHours: number
  enabled: boolean
}
```

---

## Development Guide

### Project Structure

```
src/
├── main/           # Electron main process
├── preload/        # Preload scripts
└── renderer/       # React frontend

server/
├── db/             # Database utilities
├── modules/        # Business logic
├── utils/          # Utility functions
└── constants/      # Constants and SQL queries
```

### Development Commands

```bash
# Start development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
```

### Adding New Features

#### 1. Adding a New Database Module

1. Create module file in `server/modules/your-module/`
2. Use `node-schedule` to create scheduled jobs
3. Monitor database tables using SQL queries
4. Call `sendMessageToPhone()` when conditions are met

Example:
```typescript
import { scheduleJob } from 'node-schedule'
import { getConnection } from '../../db'
import { sendMessageToPhone } from '../../utils/whatsapp'

scheduleJob('*/1 * * * * *', async () => {
  const pool = await getConnection()
  const result = await pool.request().query('YOUR_QUERY')
  // Process results and send messages
})
```

#### 2. Adding a New IPC Handler

1. Add handler in `src/main/index.ts`:
```typescript
ipcMain.handle('your-handler', async (_, ...args) => {
  // Your logic
  return result
})
```

2. Expose in `src/preload/index.ts`:
```typescript
const api = {
  // ... existing APIs
  yourHandler: (...args) => ipcRenderer.invoke('your-handler', ...args)
}
```

3. Add types in `src/preload/index.d.ts`:
```typescript
interface Window {
  api: {
    // ... existing APIs
    yourHandler: (...args) => Promise<ReturnType>
  }
}
```

#### 3. Adding a New UI Route

1. Create route file in `src/renderer/src/routes/your-route/index.tsx`
2. Use `createFileRoute` from TanStack Router
3. Add navigation link in `Navbar.tsx`

### Code Style

- Use TypeScript for type safety
- Follow ESLint rules
- Use Prettier for formatting
- Use functional React components with hooks
- Use async/await for asynchronous operations

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Fails

**Symptoms**: Cannot connect to SQL Server

**Solutions**:
- Verify SQL Server is running and accessible
- Check firewall settings
- Verify credentials are correct
- For Windows: Check SSL/TLS certificate settings (app handles this automatically)
- For localhost: Try using `127.0.0.1` instead of `localhost`

#### 2. WhatsApp QR Code Not Appearing

**Symptoms**: QR code doesn't show or WhatsApp fails to initialize

**Solutions**:
- Ensure Chrome/Chromium is installed
- Check if port 9222 is available (Puppeteer debug port)
- Delete WhatsApp auth cache and try again
- Check system permissions for file access
- On Windows: Ensure Chrome is in standard installation paths

#### 3. Messages Not Sending

**Symptoms**: Messages stay in "pending" status

**Solutions**:
- Verify WhatsApp is connected (status should be "ready")
- Check if phone number format is correct (include country code)
- Verify WhatsApp Web session is active
- Check browser console for errors
- Try disconnecting and reconnecting WhatsApp

#### 4. Duplicate Messages Being Sent

**Symptoms**: Same message sent multiple times

**Solutions**:
- Check duplicate prevention logic in `localStorage.ts`
- Verify message content is exactly the same
- Check if message type is being considered in duplicate check
- Clear message history if needed

#### 5. Server Won't Start

**Symptoms**: Server start button doesn't work

**Solutions**:
- Check if port is already in use
- Verify Express server initialization
- Check console logs for errors
- Restart the application

#### 6. Build Errors

**Symptoms**: `npm run build` fails

**Solutions**:
- Run `npm run typecheck` to identify TypeScript errors
- Ensure all dependencies are installed: `npm install`
- Check Node.js version (should be v18+)
- Clear build cache: `rm -rf out dist`

#### 7. Windows Certificate Errors

**Symptoms**: SSL/TLS certificate errors on Windows

**Solutions**:
- The app automatically handles Windows certificate issues
- If issues persist, check SQL Server SSL configuration
- Try connecting without encryption (for localhost)

### Debug Mode

Enable debug logging:

1. Open DevTools: `F12` (development mode)
2. Check Console for errors
3. Check Network tab for API calls
4. Check Application tab for localStorage

### Logs Location

- **Main Process Logs**: Console output when running `npm run dev`
- **Renderer Logs**: Browser DevTools console
- **Database Logs**: Console output with connection status
- **WhatsApp Logs**: Console output with status updates

---

## Maintenance

### Regular Maintenance Tasks

#### 1. Database Connection Health

- Monitor database connection status regularly
- Reconnect if connection drops
- Verify database queries are optimized

#### 2. WhatsApp Session Management

- WhatsApp sessions may expire after inactivity
- Re-authenticate if connection is lost
- Delete cache if authentication fails repeatedly

#### 3. Message History Cleanup

- Message history is stored in browser localStorage
- Limited to 1000 messages by default
- Clear history if storage becomes full

#### 4. Update Dependencies

```bash
# Check for outdated packages
npm outdated

# Update dependencies (carefully)
npm update

# Update specific packages
npm install package-name@latest
```

#### 5. Backup Configuration

- Backup `.server-config.json` regularly
- Backup appointment reminder settings
- Document any custom SQL queries

### Monitoring

#### Key Metrics to Monitor

1. **Message Success Rate**: Track sent vs failed messages
2. **Database Connection Uptime**: Monitor connection stability
3. **WhatsApp Connection Status**: Ensure continuous connection
4. **Server Health**: Monitor server uptime and response times

#### Performance Optimization

1. **Database Queries**: Optimize SQL queries for better performance
2. **Message Queue**: Monitor message queue size
3. **Memory Usage**: Check for memory leaks in long-running processes
4. **CPU Usage**: Monitor CPU usage during message sending

### Security Considerations

1. **Database Credentials**: Store securely, never commit to version control
2. **WhatsApp Session**: Protect `.wwebjs_auth` directory
3. **API Security**: Ensure IPC handlers validate inputs
4. **Error Messages**: Don't expose sensitive information in error messages

### Backup and Recovery

#### Backup Checklist

- [ ] Database configuration file (`.server-config.json`)
- [ ] Appointment reminder settings
- [ ] Message history (if needed)
- [ ] Custom SQL queries
- [ ] Application build files

#### Recovery Steps

1. Restore configuration files
2. Reconnect to database
3. Re-authenticate WhatsApp
4. Verify automated modules are running
5. Test message sending

### Version Updates

When updating the application:

1. **Backup current configuration**
2. **Review changelog** for breaking changes
3. **Update dependencies** carefully
4. **Test in development** before production
5. **Update documentation** if needed

### Support and Resources

- **Documentation**: This file
- **Code Comments**: Inline code documentation
- **Type Definitions**: TypeScript type definitions
- **Error Messages**: User-friendly error messages in UI

---

## Appendix

### SQL Query Examples

The application uses SQL queries defined in `server/constants/queries.ts`. Customize these queries based on your database schema.

### File Locations

- **Database Config**: `.server-config.json` (application directory)
- **WhatsApp Auth**: `.wwebjs_auth/` (application directory)
- **Message History**: Browser localStorage (key: `whatsapp_messages`)
- **Build Output**: `dist/` directory
- **Logs**: Console output

### Environment-Specific Notes

#### Windows
- Automatic SSL/TLS certificate handling
- Chrome path detection for multiple installation locations
- Process cleanup for Chrome/Puppeteer

#### macOS
- Standard Chrome installation path
- File permission handling

#### Linux
- Multiple Chrome/Chromium path support
- System-level dependencies may be required

---

**Last Updated**: December 2024
**Version**: 1.0.0

