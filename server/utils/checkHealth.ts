import { Server } from 'http'

export const checkHealth = async (server: Server | null): Promise<boolean> => {
  if (!server) {
    return false
  }
  return true
}
