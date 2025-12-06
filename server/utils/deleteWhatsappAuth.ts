import fs from 'node:fs'
import path from 'node:path'

const deleteDirectory = async (dirPath: string, maxRetries: number = 5): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!fs.existsSync(dirPath)) {
        return true // Already deleted
      }

      // Try to delete
      await fs.promises.rm(dirPath, { recursive: true, force: true })

      // Verify deletion
      if (!fs.existsSync(dirPath)) {
        return true
      }

      // If still exists, wait and retry
      if (attempt < maxRetries) {
        const waitTime = attempt * 200 // Exponential backoff: 200ms, 400ms, 600ms, etc.
        console.log(
          `Directory still exists, retrying in ${waitTime}ms... (attempt ${attempt}/${maxRetries})`
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 200
        console.log(
          `Error deleting directory, retrying in ${waitTime}ms... (attempt ${attempt}/${maxRetries})`
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      } else {
        console.error(`Failed to delete ${dirPath} after ${maxRetries} attempts:`, error)
        return false
      }
    }
  }
  return false
}

export const deleteWhatsappAuth = async (): Promise<void> => {
  try {
    const cwd = process.cwd()
    const authPath = path.join(cwd, 'whatsapp-auth')
    const cachePath = path.join(cwd, '.wwebjs_cache')

    console.log('=== Attempting to delete WhatsApp auth ===')
    console.log('Current working directory:', cwd)
    console.log('Auth path:', authPath)
    console.log('Cache path:', cachePath)

    // Check if paths exist before trying to delete
    const authExists = fs.existsSync(authPath)
    const cacheExists = fs.existsSync(cachePath)

    console.log('Auth exists:', authExists)
    console.log('Cache exists:', cacheExists)

    let authDeleted = true
    let cacheDeleted = true

    if (authExists) {
      console.log('Deleting whatsapp-auth directory...')
      authDeleted = await deleteDirectory(authPath)
      if (authDeleted) {
        console.log('✓ whatsapp-auth deleted successfully')
      } else {
        console.error('✗ Failed to delete whatsapp-auth after multiple attempts')
      }
    } else {
      console.log('whatsapp-auth directory does not exist')
    }

    if (cacheExists) {
      console.log('Deleting .wwebjs_cache directory...')
      cacheDeleted = await deleteDirectory(cachePath)
      if (cacheDeleted) {
        console.log('✓ .wwebjs_cache deleted successfully')
      } else {
        console.error('✗ Failed to delete .wwebjs_cache after multiple attempts')
      }
    } else {
      console.log('.wwebjs_cache directory does not exist')
    }

    // Final verification
    const authStillExists = fs.existsSync(authPath)
    const cacheStillExists = fs.existsSync(cachePath)

    if (authStillExists || cacheStillExists) {
      console.warn('⚠ Warning: Some directories still exist after deletion attempts')
      if (authStillExists) console.warn('  - whatsapp-auth still exists')
      if (cacheStillExists) console.warn('  - .wwebjs_cache still exists')
    } else if (authExists || cacheExists) {
      console.log('✓ All WhatsApp auth and cache directories deleted successfully')
    } else {
      console.log('No WhatsApp auth or cache directories found to delete')
    }
    console.log('=== WhatsApp auth deletion completed ===')
  } catch (error) {
    console.error('Error deleting WhatsApp auth:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error code:', (error as NodeJS.ErrnoException).code)
      console.error('Error stack:', error.stack)
    }
    // Don't throw - allow server to continue shutting down even if deletion fails
  }
}
