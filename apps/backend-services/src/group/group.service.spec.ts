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
