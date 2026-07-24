import { FilesService } from './files.service'

describe('FilesService product images', () => {
  const actor = { id: 'admin-1' } as never
  const image = {
    originalname: 'product.png',
    mimetype: 'image/png',
    size: 8,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }

  function serviceForProduct() {
    const productImage = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    }
    const tx = {
      productImage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null }, _count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'image-1', fileAssetId: 'asset-1' }),
      },
    }
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1', status: 'ACTIVE' }) },
      productImage,
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset-1', status: 'SYNCED' }) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    }
    const mockStorage = {
      upload: jest.fn().mockResolvedValue({
        provider: 'MOCK_LOCAL',
        driveId: 'mock-local',
        itemId: 'item-1',
        parentItemId: 'mock-local-root',
        logicalPath: 'Products/product-1',
        fileName: 'product.png',
        mimeType: 'image/png',
        size: 8,
      }),
      delete: jest.fn(),
    }
    const audit = { record: jest.fn() }
    return {
      service: new FilesService(
        prisma as never,
        audit as never,
        { isConnected: jest.fn().mockResolvedValue(false) } as never,
        mockStorage as never,
        {} as never,
      ),
      prisma,
      mockStorage,
      audit,
      tx,
    }
  }

  it('stores a product image through the configured storage provider and links it as primary', async () => {
    const { service, prisma, mockStorage, audit, tx } = serviceForProduct()

    await service.uploadProductImages('product-1', [image], actor, 'request-1')

    expect(mockStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ logicalPath: 'Products/product-1', mimeType: 'image/png' }),
    )
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.productImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
    )
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPLOAD_IMAGES', entityType: 'Product' }),
    )
  })

  it('rejects a spoofed PNG upload before writing product data', async () => {
    const { service, prisma } = serviceForProduct()

    await expect(
      service.uploadProductImages(
        'product-1',
        [{ ...image, buffer: Buffer.from('not an image'), size: 12 }],
        actor,
      ),
    ).rejects.toThrow('图片内容与文件类型不匹配')
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
  })
})
