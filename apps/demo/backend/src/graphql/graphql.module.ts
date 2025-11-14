import { Module } from '@nestjs/common';
import { UserResolver } from './resolvers/user.resolver';
import { WorkspaceResolver } from './resolvers/workspace.resolver';
import { DocumentResolver } from './resolvers/document.resolver';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UserResolver, WorkspaceResolver, DocumentResolver],
})
export class GraphQLModule {}





