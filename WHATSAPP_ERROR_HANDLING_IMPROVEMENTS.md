# WhatsApp Error Handling Improvements

## Overview
This document describes the improvements made to handle WhatsApp connection errors, particularly the `Cannot read properties of undefined (reading 'markedUnread')` error.

## Problem
The `markedUnread` error occurs when:
1. WhatsApp Web updates their internal API structure
2. Cached session data becomes incompatible with new WhatsApp Web versions
3. The `whatsapp-web.js` library tries to access properties that have been renamed or removed

## Improvements Made

### 1. Backend Error Handling (`server/utils/whatsapp.ts`)

#### Session Cleanup Function
- Added `cleanupSessionData()` function to completely remove `.wwebjs_auth` folder
- Exported `cleanupWhatsAppSession()` for manual triggering from the UI

#### Initialization Tracking
- Added attempt counter (max 3 attempts)
- Automatic session cleanup after max attempts reached
- Better logging with attempt numbers

#### Enhanced Event Handlers
- **auth_failure**: Now automatically cleans up session data
- **disconnected**: Cleans up session on LOGOUT
- **remote_session_saved**: Added event listener for better progress tracking

#### Timeout Protection
- Added 5-minute initialization timeout
- Automatic cleanup and retry suggestion on timeout
- Clear timeout on successful connection

#### Property Error Detection
- Detects errors related to undefined/null property access
- Provides contextual suggestions when property errors occur
- Auto-cleans session after repeated property errors
- Sends detailed error info to renderer with suggestions

#### Better Cleanup
- Clears timeouts properly on all error paths
- Destroys client instances safely
- Resets attempt counter on successful connections

### 2. Frontend UI Improvements (`src/renderer/src/routes/index.tsx`)

#### New "Clean Session" Button
- Added dedicated button to clean WhatsApp session data
- Separated from "Delete Auth Cache" for clearer purpose
- Confirmation dialog before cleaning

#### Enhanced Error Display
- Shows detailed error messages from backend
- Displays suggestions for fixing errors
- "Clean Session & Retry" button appears in error state
- Color-coded error messages (red for errors, yellow for suggestions)

#### Better State Management
- Added `whatsappError` state for error messages
- Added `whatsappSuggestion` state for helpful hints
- Clears error state when session is cleaned

#### Improved Status Listener
- Parses error and suggestion data from backend
- Updates UI with contextual information
- Shows attempt numbers and max attempts

### 3. IPC Communication

#### New Handler (`src/main/index.ts`)
```typescript
ipcMain.handle('cleanup-whatsapp-session', async () => {
  try {
    cleanupWhatsAppSession()
    return { success: true }
  } catch (error) {
    console.error('Error cleaning up WhatsApp session:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
```

#### Updated Preload (`src/preload/index.ts`)
- Added `cleanupWhatsappSession` API method
- Updated TypeScript definitions

## How to Use

### For Users

When you encounter the `markedUnread` error:

1. **Click "Clean Session" button** on the home screen
2. Confirm the action
3. Click "Connect WhatsApp" again
4. Scan the QR code when it appears

### Alternative: Manual Cleanup

If the app continues to fail:

1. **Stop the app completely**
2. **Delete the session folder manually**:
   ```bash
   rm -rf .wwebjs_auth
   ```
3. **Restart the app**
4. **Click "Connect WhatsApp"**

### For npm Cache Issues

If you see npm permission errors:
```bash
sudo chown -R 501:20 "/Users/max/.npm"
```

If you see package not found errors:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Technical Details

### Session Cleanup Flow
```
User clicks "Clean Session"
  → Frontend calls api.cleanupWhatsappSession()
    → IPC handler invokes cleanupWhatsAppSession()
      → Backend removes .wwebjs_auth folder
        → Resets attempt counter
          → Returns success to frontend
            → Frontend clears error state
              → User can reconnect
```

### Error Detection Flow
```
WhatsApp initialization fails
  → Error caught in initialize()
    → Check if error is property-related
      → If yes, increment attempts
        → If attempts >= 3, auto-clean session
          → Send error + suggestion to renderer
            → Renderer displays error with "Clean & Retry" button
```

## Benefits

1. **Automatic Recovery**: Detects and suggests fixes for common errors
2. **User-Friendly**: Clear error messages and actionable buttons
3. **Robust**: Handles timeouts, property errors, and auth failures
4. **Traceable**: Detailed logging for debugging
5. **Safe**: Always confirms before destructive actions
6. **Self-Healing**: Auto-cleans after repeated failures

## Future Improvements

Potential enhancements:
- Automatic retry with exponential backoff
- Health monitoring for WhatsApp connection
- Session backup before cleanup
- Detailed connection diagnostics
- WhatsApp Web version detection
