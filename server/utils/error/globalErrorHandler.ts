import { NextFunction, Request, Response } from 'express'

export const globalErrorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    stack: err.stack
  })
}
