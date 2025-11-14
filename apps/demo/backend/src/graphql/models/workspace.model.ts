import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import {
  Ministry,
  WorkspaceStatus,
  AccessLevel,
  RetentionPolicy,
} from '@prisma/client';

registerEnumType(Ministry, {
  name: 'Ministry',
  description: 'Government ministry',
});

registerEnumType(WorkspaceStatus, {
  name: 'WorkspaceStatus',
  description: 'Workspace status',
});

registerEnumType(AccessLevel, {
  name: 'AccessLevel',
  description: 'Security access level',
});

registerEnumType(RetentionPolicy, {
  name: 'RetentionPolicy',
  description: 'Document retention period',
});

@ObjectType()
export class Workspace {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => Ministry)
  ministry: Ministry;

  @Field({ nullable: true })
  description?: string;

  @Field(() => WorkspaceStatus)
  status: WorkspaceStatus;

  @Field(() => [String])
  intake_methods: string[];

  @Field(() => RetentionPolicy)
  retention_policy: RetentionPolicy;

  @Field(() => AccessLevel)
  access_level: AccessLevel;

  @Field(() => {
    const { Document } = require('./document.model');
    return [Document];
  }, { nullable: true })
  /** @type {import('./document.model').Document[]} */
  documents?: any[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

