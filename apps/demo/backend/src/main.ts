import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Add Fastify hooks for GraphQL request logging
  const fastifyInstance = app.getHttpAdapter().getInstance();
  
  fastifyInstance.addHook('onRequest', async (request, reply) => {
    if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
      logger.debug('=== Fastify: GraphQL HTTP Request ===');
      logger.debug(`Method: ${request.method}`);
      logger.debug(`URL: ${request.url}`);
      logger.debug(`Headers: ${JSON.stringify(request.headers, null, 2)}`);
      logger.debug(`IP: ${request.ip}`);
      logger.debug(`Origin: ${request.headers.origin || 'N/A'}`);
      logger.debug(`User-Agent: ${request.headers['user-agent'] || 'N/A'}`);
    }
  });

  fastifyInstance.addHook('preHandler', async (request, reply) => {
    if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
      if (request.method === 'POST' && request.body) {
        logger.debug('=== Fastify: GraphQL Request Body ===');
        try {
          const body = typeof request.body === 'string' 
            ? JSON.parse(request.body) 
            : request.body;
          
          if (body.query) {
            logger.debug(`Query: ${body.query}`);
          }
          if (body.variables) {
            logger.debug(`Variables: ${JSON.stringify(body.variables, null, 2)}`);
          }
          if (body.operationName) {
            logger.debug(`Operation Name: ${body.operationName}`);
          }
          logger.debug(`Full Body: ${JSON.stringify(body, null, 2)}`);
        } catch (error) {
          logger.debug(`Body (raw): ${JSON.stringify(request.body)}`);
          logger.error(`Error parsing request body: ${error.message}`);
        }
      }
    }
  });

  // Hook to capture response payload before it's sent
  fastifyInstance.addHook('onSend', async (request, reply, payload) => {
    if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
      if (reply.statusCode >= 400) {
        logger.error('=== Fastify: GraphQL Error Response ===');
        logger.error(`Status Code: ${reply.statusCode}`);
        try {
          const responseBody = typeof payload === 'string' 
            ? JSON.parse(payload) 
            : payload;
          logger.error(`Error Response Body: ${JSON.stringify(responseBody, null, 2)}`);
        } catch (error) {
          logger.error(`Error Response Body (raw): ${JSON.stringify(payload)}`);
        }
        logger.error('=== Fastify: GraphQL Error Response End ===');
      }
    }
    return payload;
  });

  fastifyInstance.addHook('onResponse', async (request, reply) => {
    if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
      logger.debug('=== Fastify: GraphQL HTTP Response ===');
      logger.debug(`Status Code: ${reply.statusCode}`);
      logger.debug('=== Fastify: GraphQL Request Complete ===');
    }
  });

  // Add error handler hook to catch GraphQL errors
  fastifyInstance.setErrorHandler(async (error, request, reply) => {
    if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
      logger.error('=== Fastify: GraphQL Error Handler ===');
      logger.error(`Error: ${error.message}`);
      logger.error(`Error Stack: ${error.stack}`);
      logger.error(`Request URL: ${request.url}`);
      logger.error(`Request Method: ${request.method}`);
      if (error.validation) {
        logger.error(`Validation Errors: ${JSON.stringify(error.validation, null, 2)}`);
      }
      logger.error('=== Fastify: GraphQL Error Handler End ===');
    }
    // Re-throw to let NestJS handle it
    throw error;
  });

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Enable validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`GraphQL Playground: http://localhost:${port}/playground`);
  console.log(`GraphQL Endpoint: http://localhost:${port}/graphql`);
}
bootstrap();
