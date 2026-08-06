import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class DomainExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      response
        .status(status)
        .json(
          typeof exceptionResponse === 'string'
            ? { statusCode: status, message: exceptionResponse }
            : exceptionResponse,
        );
      return;
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Erro interno do servidor';

    if (error.name.endsWith('NotFoundError')) {
      status = HttpStatus.NOT_FOUND;
    } else if (
      error.name.endsWith('ValidationError') ||
      error.name.endsWith('InvalidOperationError')
    ) {
      status = HttpStatus.BAD_REQUEST;
    } else if (error.name.endsWith('UnauthorizedError')) {
      status = HttpStatus.UNAUTHORIZED;
    } else if (error.name.endsWith('ConflictError')) {
      status = HttpStatus.CONFLICT;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: error.name,
      timestamp: new Date().toISOString(),
    });
  }
}
