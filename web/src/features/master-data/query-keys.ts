import type { ListParams } from './api'

export const queryKeys = {
  masterData: {
    all: ['master-data'] as const,
    list: (resource: string, params: ListParams) => ['master-data', resource, params] as const,
    options: (resource: string) => ['master-data', resource, 'options'] as const,
  },
}
