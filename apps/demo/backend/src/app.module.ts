import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { GraphQLJSON } from 'graphql-type-json';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlaygroundService } from './playground.service';
import { PrismaModule } from './prisma/prisma.module';
import { GraphQLModule as GraphQLModuleProvider } from './graphql/graphql.module';
import { GraphQLLoggingInterceptor } from './graphql/graphql-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true, // Cache environment variables
    }),
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      path: '/graphql',
      // Enable GraphiQL interface - Mercurius configuration
      graphiql: {
        enabled: true,
      },
      // Only regenerate schema in development, use existing in production
      autoSchemaFile:
        process.env.NODE_ENV === 'production'
          ? join(process.cwd(), 'dist/schema.gql')
          : join(process.cwd(), 'src/schema.gql'),
      sortSchema: false, // Disable sorting for faster startup
      introspection: true,
      resolvers: { JSON: GraphQLJSON },
    }),
    PrismaModule,
    GraphQLModuleProvider,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PlaygroundService,
    {
      provide: APP_INTERCEPTOR,
      useClass: GraphQLLoggingInterceptor,
    },
  ],
})
export class AppModule {}
