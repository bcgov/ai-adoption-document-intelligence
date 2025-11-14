import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class GraphQLLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQLInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const args = gqlContext.getArgs();
    const contextValue = gqlContext.getContext();

    this.logger.debug('=== GraphQL Interceptor: Request ===');
    this.logger.debug(`Operation: ${info.operation.operation}`);
    this.logger.debug(`Field Name: ${info.fieldName}`);
    this.logger.debug(`Parent Type: ${info.parentType.name}`);
    this.logger.debug(`Return Type: ${info.returnType.toString()}`);
    this.logger.debug(`Arguments: ${JSON.stringify(args, null, 2)}`);
    
    // Log request headers if available
    if (contextValue?.request) {
      const request = contextValue.request;
      this.logger.debug(`Request Headers: ${JSON.stringify(request.headers, null, 2)}`);
      this.logger.debug(`Request IP: ${request.ip || 'N/A'}`);
      this.logger.debug(`Request Origin: ${request.headers?.origin || 'N/A'}`);
      this.logger.debug(`Request User-Agent: ${request.headers?.['user-agent'] || 'N/A'}`);
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        this.logger.debug(`=== GraphQL Interceptor: Response ===`);
        this.logger.debug(`Operation: ${info.operation.operation} ${info.fieldName}`);
        this.logger.debug(`Duration: ${duration}ms`);
        this.logger.debug(`Response Data: ${JSON.stringify(data, null, 2)}`);
        this.logger.debug('=== GraphQL Interceptor: Complete ===');
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error('=== GraphQL Interceptor: Error ===');
        this.logger.error(`Operation: ${info.operation.operation} ${info.fieldName}`);
        this.logger.error(`Duration: ${duration}ms`);
        this.logger.error(`Error Message: ${error.message}`);
        this.logger.error(`Error Stack: ${error.stack}`);
        this.logger.error(`Arguments: ${JSON.stringify(args, null, 2)}`);
        this.logger.error('=== GraphQL Interceptor: Error End ===');
        return throwError(() => error);
      }),
    );
  }
}

