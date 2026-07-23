import { MasterDataService } from './master-data.service';

describe('MasterDataService resource boundary', () => {
  const service = new MasterDataService({} as never, {} as never);

  it('rejects unknown dynamic resources', () => {
    expect(() => service.assertResource('prices')).toThrow('不支持的基础资料类型');
  });

  it('trims and preserves master-data code casing', async () => {
    const data = service as unknown as {
      createData: (
        resource: 'categories',
        payload: { code: string; name: string },
      ) => Promise<Record<string, unknown>>;
      updateData: (
        resource: 'categories',
        payload: { code: string },
      ) => Promise<Record<string, unknown>>;
    };
    await expect(
      data.createData('categories', { code: ' cat-aB ', name: '分类' }),
    ).resolves.toEqual({
      code: 'cat-aB',
      name: '分类',
    });
    await expect(data.updateData('categories', { code: ' CAT-aB ' })).resolves.toEqual({
      code: 'CAT-aB',
    });
  });
});
