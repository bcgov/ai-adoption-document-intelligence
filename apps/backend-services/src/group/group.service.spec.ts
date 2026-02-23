import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { DatabaseService } from '../database/database.service';

describe('GroupService', () => {
  let service: GroupService;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    const mockPrisma = {
      group: { findMany: jest.fn().mockResolvedValue([{ id: 'group1' }, { id: 'group2' }]) },
      userGroup: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        {
          provide: DatabaseService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('assignUserToGroups should resolve', async () => {
    await expect(service.assignUserToGroups('user1', ['group1', 'group2'])).resolves.toBeUndefined();
  });
});

describe('removeUserFromGroup', () => {
  it('should remove a user from a group', async () => {
    const groupId = 'test-group';
    const userId = 'test-user';
    const group = { id: groupId, users: [{ id: userId }] };
    const findOneMock = jest.fn().mockResolvedValue(group);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const databaseService = {
      prisma: {
        group: {
          findOne: findOneMock,
          save: saveMock,
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await service.removeUserFromGroup(groupId, userId);
    expect(group.users.length).toBe(0);
    expect(saveMock).toHaveBeenCalledWith(group);
  });

  it('should throw if group not found', async () => {
    const groupId = 'missing-group';
    const userId = 'user';
    const findOneMock = jest.fn().mockResolvedValue(undefined);
    const databaseService = {
      prisma: {
        group: {
          findOne: findOneMock,
          save: jest.fn(),
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await expect(service.removeUserFromGroup(groupId, userId)).rejects.toThrow('Group not found');
  });

  it('should throw if user not a member', async () => {
    const groupId = 'group';
    const userId = 'not-member';
    const group = { id: groupId, users: [{ id: 'other-user' }] };
    const findOneMock = jest.fn().mockResolvedValue(group);
    const databaseService = {
      prisma: {
        group: {
          findOne: findOneMock,
          save: jest.fn(),
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await expect(service.removeUserFromGroup(groupId, userId)).rejects.toThrow('User not a member of this group');
  });
});
