import { z } from 'zod'

export const dbConfigSchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
  server: z.string().min(1),
  database: z.string().min(1)
})

export type IDatabaseForm = z.infer<typeof dbConfigSchema>
