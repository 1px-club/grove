import { Provider, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';

export const appProviders: Provider[] = [
  {
    provide: APP_PIPE,
    useValue: new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: ResponseInterceptor,
  },
  {
    provide: APP_FILTER,
    useClass: HttpExceptionFilter,
  },
];
