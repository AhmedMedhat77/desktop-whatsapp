import express from 'express'
import cors from 'cors'
import { Server } from 'http'
import { config } from 'dotenv'
config()

const PORT = process.env.PORT || 3000

export const startServer = async (server: Server | null): Promise<Server> => {
  const app = express()

  if (server) {
    console.log('Server already running')
    return server
  }
  // connect to database
  // await connectToDB()

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    })
  )
  app.use(express.json())

  const s = app.listen(PORT, () => {
    console.log(`Admin server is running on port ${PORT}`)
  })

  return s
}
