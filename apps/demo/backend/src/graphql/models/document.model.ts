import { ObjectType, Field, ID, Float, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import {
  DocumentFileType,
  IntakeMethod,
  DocumentStatus,
  ValidationStatus,
  Ministry,
  Priority,
} from '@prisma/client';

registerEnumType(DocumentFileType, {
  name: 'DocumentFileType',
  description: 'Type of document file',
});

registerEnumType(IntakeMethod, {
  name: 'IntakeMethod',
  description: 'How the document was submitted',
});

registerEnumType(DocumentStatus, {
  name: 'DocumentStatus',
  description: 'Current processing status',
});

registerEnumType(ValidationStatus, {
  name: 'ValidationStatus',
  description: 'Human validation status',
});

registerEnumType(Priority, {
  name: 'Priority',
  description: 'Processing priority',
});

@ObjectType()
export class Document {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  file_url: string;

  @Field(() => DocumentFileType)
  file_type: DocumentFileType;

  @Field(() => IntakeMethod)
  intake_method: IntakeMethod;

  @Field(() => ID, { nullable: true })
  workspace_id?: string;

  @Field(() => DocumentStatus)
  status: DocumentStatus;

  @Field(() => Float, { nullable: true })
  confidence_score?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  extracted_data?: any;

  @Field(() => ValidationStatus)
  validation_status: ValidationStatus;

  @Field(() => Ministry)
  ministry: Ministry;

  @Field(() => Priority)
  priority: Priority;

  @Field({ nullable: true })
  retention_date?: Date;

  @Field()
  created_date: Date;

  @Field()
  updatedAt: Date;

  @Field(() => {
    const { Workspace } = require('./workspace.model');
    return Workspace;
  }, { nullable: true })
  /** @type {import('./workspace.model').Workspace} */
  workspace?: any;
}

