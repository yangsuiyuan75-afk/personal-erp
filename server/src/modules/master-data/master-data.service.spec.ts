import { MasterDataService } from './master-data.service';

describe('MasterDataService resource boundary', () => {
  const service = new MasterDataService({} as never, {} as never);

  it('rejects unknown dynamic resources', () => {
    expect(() => service.assertResource('prices')).toThrow('不支持的基础资料类型');
  });

  it('normalizes corrected master-data codes', async () => {
    const updateData = service as unknown as {
      updateData: (
        resource: 'categories',
        payload: { code: string },
      ) => Promise<Record<string, unknown>>;
    };
    await expect(updateData.updateData('categories', { code: ' cat-002 ' })).resolves.toEqual({
      code: 'CAT-002',
    });
  });
});
