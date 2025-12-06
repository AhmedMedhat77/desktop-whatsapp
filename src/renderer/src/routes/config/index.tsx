import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@renderer/components/Button'
import Input from '@renderer/components/Input'
import { dbConfigSchema, IDatabaseForm } from '@renderer/utils'

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

export const Route = createFileRoute('/config/')({
  component: DatabaseConfig
})

function DatabaseConfig(): React.ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<IDatabaseForm>({
    resolver: zodResolver(dbConfigSchema)
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onSubmit = handleSubmit(async (data) => {
    setIsLoading(true)
    try {
      const response = await window.api.createDbConfigFile(data)
      if (response) {
        setSuccess(true)
      } else {
        setError('Failed to create database config file')
      }
    } catch (error) {
      setError('An error occurred while creating the database config file')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  })

  return (
    <main className="h-svh flex items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="grid gap-2 shadow-2xl p-4 rounded-xl mx-auto space-y-2 max-w-3xl w-full"
      >
        <h1 className="text-2xl font-bold text-start text-primary-color">Database Config</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            Connection file created successfully!
          </div>
        )}

        <Input
          {...register('database')}
          label="Database Name"
          id="database-name"
          placeholder="database_name"
          error={errors.database?.message}
        />
        <Input
          {...register('user')}
          label="Database User"
          id="database-user"
          placeholder="database_user"
          error={errors.user?.message}
        />
        <Input
          {...register('password')}
          label="Database Password"
          id="database-password"
          placeholder="database_password"
          type="password"
          error={errors.password?.message}
        />
        <Input
          {...register('server')}
          label="Database Host"
          id="database-host"
          placeholder="database_host"
          error={errors.server?.message}
        />
        <Button type="submit" isLoading={isLoading} disabled={isLoading}>
          Save
        </Button>
      </form>
    </main>
  )
}
