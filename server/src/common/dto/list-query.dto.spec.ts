import { paginationMeta } from './list-query.dto'

describe('paginationMeta', () => {
  it('returns stable empty-list metadata', () => {
    expect(paginationMeta(1, 20, 0)).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    })
  })

  it('reports both directions on a middle page', () => {
    expect(paginationMeta(2, 20, 45)).toMatchObject({
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    })
  })
})
