import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ListParams } from './api'

const PAGE_SIZES = [10, 20, 50, 100]

export function useListUrlState() {
  const [search, setSearch] = useSearchParams()
  const [keyword, setKeyword] = useState(search.get('keyword') ?? '')
  const pageSizeValue = Number(search.get('pageSize') ?? 20)
  const params = useMemo<ListParams>(
    () => ({
      page: Math.max(1, Number(search.get('page') ?? 1)),
      pageSize: PAGE_SIZES.includes(pageSizeValue) ? pageSizeValue : 20,
      keyword: search.get('keyword') || undefined,
      status: search.get('status') || undefined,
      sortBy: search.get('sortBy') ?? 'createdAt',
      sortOrder: search.get('sortOrder') === 'asc' ? 'asc' : 'desc',
      createdFrom: search.get('createdFrom') || undefined,
      createdTo: search.get('createdTo') || undefined,
      categoryId: search.get('categoryId') || undefined,
      productId: search.get('productId') || undefined,
      purchaseChannelId: search.get('purchaseChannelId') || undefined,
      salesChannelId: search.get('salesChannelId') || undefined,
      module: search.get('module') || undefined,
      action: search.get('action') || undefined,
      entityType: search.get('entityType') || undefined,
      result: search.get('result') || undefined,
      locationId: search.get('locationId') || undefined,
      skuId: search.get('skuId') || undefined,
      stockStatus: search.get('stockStatus') || undefined,
      supplierId: search.get('supplierId') || undefined,
      transactionType: search.get('transactionType') || undefined,
      documentStatus: search.get('documentStatus') || undefined,
      buyerId: search.get('buyerId') || undefined,
      customerId: search.get('customerId') || undefined,
      sourceType: search.get('sourceType') || undefined,
      responsibility: search.get('responsibility') || undefined,
      resolutionType: search.get('resolutionType') || undefined,
      accountId: search.get('accountId') || undefined,
      direction: search.get('direction') || undefined,
      category: search.get('category') || undefined,
      expenseCategory: search.get('expenseCategory') || undefined,
      month: search.get('month') || undefined,
      provider: search.get('provider') || undefined,
      fileStatus: search.get('fileStatus') || undefined,
      backupStatus: search.get('backupStatus') || undefined,
      trigger: search.get('trigger') || undefined,
      locked: search.get('locked') || undefined,
    }),
    [pageSizeValue, search],
  )

  const setParam = (key: string, value?: string, resetPage = true) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        if (resetPage && key !== 'page') next.set('page', '1')
        return next
      },
      { replace: true },
    )
  }

  const setDateRange = (from?: string, to?: string) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        if (from) next.set('createdFrom', `${from}T00:00:00.000Z`)
        else next.delete('createdFrom')
        if (to) next.set('createdTo', `${to}T00:00:00.000Z`)
        else next.delete('createdTo')
        next.set('page', '1')
        return next
      },
      { replace: true },
    )
  }

  const clearParams = (keys: string[]) => {
    if (keys.includes('keyword')) setKeyword('')
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        keys.forEach((key) => next.delete(key))
        next.set('page', '1')
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setParam('keyword', keyword || undefined), 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  return { params, keyword, setKeyword, setParam, setDateRange, clearParams }
}
