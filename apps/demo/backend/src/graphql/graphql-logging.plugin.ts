import { Logger } from '@nestjs/common';
import { MercuriusPlugin } from '@nestjs/mercurius';

const logger = new Logger('GraphQL');

export const graphqlLoggingPlugin: MercuriusPlugin = {
  plugin: async (instance, options) => {
    instance.addHook('onRequest', async (request, reply) => {
      // Only log GraphQL requests
      if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
        logger.debug('=== GraphQL Request Received ===');
        logger.debug(`Method: ${request.method}`);
        logger.debug(`URL: ${request.url}`);
        logger.debug(`Headers: ${JSON.stringify(request.headers, null, 2)}`);
        logger.debug(`IP: ${request.ip}`);
        logger.debug(`Origin: ${request.headers.origin || 'N/A'}`);
        logger.debug(`User-Agent: ${request.headers['user-agent'] || 'N/A'}`);
      }
    });

    instance.addHook('preHandler', async (request, reply) => {
      if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
        // Log request body for POST requests
        if (request.method === 'POST' && request.body) {
          logger.debug('=== GraphQL Request Body ===');
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

    instance.addHook('onResponse', async (request, reply) => {
      if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
        logger.debug('=== GraphQL Response ===');
        logger.debug(`Status Code: ${reply.statusCode}`);
        
        // Try to log response body if available
        if (reply.sent) {
          logger.debug('Response sent successfully');
        }
        logger.debug('=== GraphQL Request Complete ===');
      }
    });

    instance.addHook('onError', async (request, reply, error) => {
      if (request.url === '/graphql' || request.url.startsWith('/graphql?')) {
        logger.error('=== GraphQL Request Error ===');
        logger.error(`Error: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);
        logger.error(`Request URL: ${request.url}`);
        logger.error(`Request Method: ${request.method}`);
        if (request.body) {
          try {
            const body = typeof request.body === 'string' 
              ? JSON.parse(request.body) 
              : request.body;
            logger.error(`Request Body: ${JSON.stringify(body, null, 2)}`);
          } catch (e) {
            logger.error(`Request Body (raw): ${JSON.stringify(request.body)}`);
          }
        }
        logger.error('=== GraphQL Request Error End ===');
      }
    });
  },
};

