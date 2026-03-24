import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiErrorResponse } from '../types/api-response.type';

type ErrorHttpResponse = {
  status(code: number): {
    json(body: ApiErrorResponse): void;
  };
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ErrorHttpResponse>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    response.status(status).json({
      code: status,
      message: this.resolveMessage(exception, exceptionResponse),
      data: null,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveMessage(
    exception: unknown,
    exceptionResponse: string | object | null,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseWithMessage = exceptionResponse as {
        message?: string | string[];
      };

      if (responseWithMessage.message) {
        return responseWithMessage.message;
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal server error';
  }
}
