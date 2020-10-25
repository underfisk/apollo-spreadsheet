import React, { useCallback, useEffect, useRef, useState } from "react"
import { ApiRef } from "../api/types"
import { useApiExtends } from "../api"
import { SortApi } from "../api/types/sortApi"
import { orderBy } from 'lodash'

export interface SortState {
  accessor: string
  order: 'asc' | 'desc'
}

export function useSort(apiRef: ApiRef, initialised: boolean){
  const stateRef = useRef<SortState | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)

  const clearSort = useCallback(() => {
    if (!stateRef.current){
      return
    }
    stateRef.current = null
    setSort(null)
    apiRef.current.updateRows(apiRef.current.getOriginalRows())
  }, [apiRef])

  const toggleSort = useCallback((columnId: string) => {
    const currentRows = apiRef.current.getRows()
    const column = apiRef.current.getColumnById(columnId)
    if (!column){
      return console.error(`${columnId} not found at toggleSort`)
    }

    if (column?.accessor === stateRef.current?.accessor) {
      const nextSort = stateRef.current?.order === 'asc' ? 'desc' : 'asc'
      if (nextSort === 'asc') {
        clearSort()
      } else {
        stateRef.current = {
          accessor: column.accessor,
          order: nextSort
        }
        setSort(stateRef.current)
        apiRef.current.updateRows(orderBy([...currentRows], [stateRef.current.accessor], [stateRef.current.order]))
      }
    } else {
      stateRef.current = {
        accessor: column.accessor,
        order: 'asc'
      }
      setSort(stateRef.current)
      apiRef.current.updateRows(orderBy([...currentRows], [stateRef.current.accessor], [stateRef.current.order]))
    }
  }, [apiRef, clearSort])

  const sortColumn = useCallback((columnId: string, order: 'asc' | 'desc') => {
    const column = apiRef.current.getColumnById(columnId)
    if (!column){
      return console.error(`${columnId} not found at sortColumn`)
    }
    
    //Ensure its not applied already
    if (stateRef.current?.accessor === column.accessor && stateRef.current?.order === order){
      return 
    }
    stateRef.current = {
      accessor: column.accessor,
      order
    }
    setSort(stateRef.current)
    const currentRows = apiRef.current.getRows()
    apiRef.current.updateRows(orderBy([...currentRows], [stateRef.current.accessor], [stateRef.current.order]))
  }, [apiRef])

  const getSortState = useCallback(() => stateRef.current, [])
  const sortApi: SortApi = {
    getSortState,
    toggleSort,
    sortColumn,
    clearSort
  }
  useApiExtends(apiRef, sortApi, 'SortApi')

  return sort
}