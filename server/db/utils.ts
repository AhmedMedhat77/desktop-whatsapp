import fs from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
config()

export interface IConfig {
  user: string
  password: string
  server: string
  database: string
}

export const getDbConfigFile = async (): Promise<IConfig> => {
  const configPath = path.join(process.cwd(), '.server-config.json')

  if (!fs.existsSync(configPath)) {
    throw new Error('Config file not found')
  }

  const dbConfigFile = fs.readFileSync(configPath, 'utf8')

  if (!dbConfigFile) {
    throw new Error('Config file is empty')
  }

  return JSON.parse(dbConfigFile)
}

export const createDbConfigFile = async (config: IConfig): Promise<boolean> => {
  try {
    const CONFIG_FILE = path.join(process.cwd(), '.server-config.json')

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')

    return true
  } catch (error) {
    console.error('Error creating database config file:', error)
    throw error
  }
}
