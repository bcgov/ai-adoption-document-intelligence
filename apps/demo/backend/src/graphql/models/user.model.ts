import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { UserRole, UserStatus } from '@prisma/client';

registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'User role in the system',
});

registerEnumType(UserStatus, {
  name: 'UserStatus',
  description: 'User account status',
});

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  full_name?: string;

  @Field(() => UserRole)
  role: UserRole;

  @Field(() => UserStatus)
  status: UserStatus;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}





