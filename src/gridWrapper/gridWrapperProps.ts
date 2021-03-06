import { Column } from '../columnGrid'
import { NavigationCoords } from '../navigation'
import { GridCell } from './interfaces'
import { OnScrollParams } from 'react-virtualized'
import { StretchMode } from '../types'
import { ApiRef } from '../api'
import { SelectionProps } from '../rowSelection'
import { GridWrapperCommonProps } from './gridWrapperCommonProps'

export interface DisableSortFilterParam {
  (column: Column): boolean
}

export interface OutsideClickDeselectCallback {
  (target: HTMLElement): boolean
}

export interface GridWrapperProps<TRow = any> extends GridWrapperCommonProps {
  minRowHeight: number
  defaultColumnWidth: number
  width: number
  scrollLeft: number
  onScroll?: (params: OnScrollParams) => any
  height: number
  rows: TRow[]
  coords: NavigationCoords
  data: GridCell[][]
  columnCount: number
  getColumnWidth: ({ index }: { index: number }) => number
  apiRef: ApiRef
  stretchMode: StretchMode
  selection?: SelectionProps
}
