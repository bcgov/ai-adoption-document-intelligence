import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { User } from '../models/user.model';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';

@Resolver(() => User)
export class UserResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => User, { nullable: true })
  async user(@Args('id', { type: () => ID }) id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  @Mutation(() => User)
  async createUser(
    @Args('email') email: string,
    @Args('full_name', { nullable: true }) full_name?: string,
    @Args('role', { type: () => UserRole, nullable: true }) role?: UserRole,
    @Args('status', { type: () => UserStatus, nullable: true }) status?: UserStatus,
  ): Promise<User> {
    return this.prisma.user.create({
      data: {
        email,
        full_name,
        role: role || UserRole.user,
        status: status || UserStatus.active,
      },
    });
  }

  @Mutation(() => User, { nullable: true })
  async updateUser(
    @Args('id', { type: () => ID }) id: string,
    @Args('email', { nullable: true }) email?: string,
    @Args('full_name', { nullable: true }) full_name?: string,
    @Args('role', { type: () => UserRole, nullable: true }) role?: UserRole,
    @Args('status', { type: () => UserStatus, nullable: true }) status?: UserStatus,
  ): Promise<User | null> {
    return this.prisma.user.update({
      where: { id },
      data: {
        email,
        full_name,
        role,
        status,
      },
    });
  }

  @Mutation(() => Boolean)
  async deleteUser(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}





