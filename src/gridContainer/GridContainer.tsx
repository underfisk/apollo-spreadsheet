import React, { useCallback, useRef } from 'react'
import { StretchMode } from '../types'
import { scrollbarWidth } from '@xobotyi/scrollbar-width'
import { AutoSizer, ScrollSync, Size } from 'react-virtualized'
import { createColumnWidthsMapping } from '../columnGrid/utils'
import { ColumnWidthRecord } from '../columnGrid'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'
import { useLogger } from '../logger'
import { GRID_RESIZE } from '../api'
import { GridContainerProps } from './GridContainerProps'

const useStyles = makeStyles(() => ({
  root: {
    height: '100%',
    width: '100%',
  },
}))

export const GridContainer = React.memo(
  ({
    minColumnWidth,
    stretchMode,
    apiRef,
    columns,
    children,
    width,
    height,
    containerClassName,
  }: GridContainerProps) => {
    const logger = useLogger('GridContainer')
    const scrollbarSize = scrollbarWidth() ?? 0
    const classes = useStyles()
    const gridContainerRef = useRef<HTMLDivElement | null>(null)
    const columnWidths = useRef<ColumnWidthRecord>({
      totalSize: 0,
      mapping: {},
    })

    /**
     * Helper that facades with getColumnWidth function provided by react-virtualize and either returns
     * the fixed width from our mapping or fetches directly from react-virtualize
     * @param getColumnWidth
     */
    const getColumnWidthHelper = useCallback(
      ({ index }: { index: number }) => {
        const value = columnWidths.current.mapping[index]
        return isNaN(value) ? minColumnWidth : value
      },
      [minColumnWidth],
    )

    const calculateColumnWidths = (containerWidth: number) => {
      const { mapping, totalSize } = createColumnWidthsMapping(
        columns,
        containerWidth,
        minColumnWidth,
        stretchMode,
      )

      //Just update with the new calculated (if it was otherwise it might have been a cached result)
      columnWidths.current = {
        totalSize,
        mapping,
      }
    }

    const onResize = useCallback(
      (info: Size) => {
        if (!apiRef.current.isInitialised) {
          return
        }
        apiRef.current.dispatchEvent(GRID_RESIZE, info)
      },
      [apiRef],
    )

    function render(containerWidth: number, containerHeight = 500) {
      const normalizedContainerWidth =
        stretchMode !== StretchMode.None ? containerWidth - scrollbarSize : containerWidth

      //Invoke our column builder
      calculateColumnWidths(normalizedContainerWidth)

      logger.debug({
        containerWidth,
        containerHeight,
        scrollbarSize,
        stretchMode,
        normalizedContainerWidth,
        columnWidths: columnWidths.current,
        hasHorizontalScroll: stretchMode === StretchMode.None,
      })

      if (stretchMode !== StretchMode.None) {
        return (
          <>
            {children({
              width: containerWidth,
              height: containerHeight,
              getColumnWidth: getColumnWidthHelper,
              scrollLeft: 0,
            })}
          </>
        )
      }

      return (
        <ScrollSync>
          {({ onScroll, scrollLeft }) => (
            <>
              {children({
                width: containerWidth,
                height: containerHeight,
                getColumnWidth: getColumnWidthHelper,
                scrollLeft,
                onScroll,
              })}
            </>
          )}
        </ScrollSync>
      )
    }

    //In case of specified width and height, allow the control to the developer
    if (height && width) {
      return (
        <div
          id="grid-container"
          ref={gridContainerRef}
          className={clsx(classes.root, containerClassName)}
          style={{ width, height, position: 'relative' }}
        >
          {render(Number(width), Number(height))}
        </div>
      )
    }

    return (
      <div
        id="grid-container"
        className={clsx(classes.root, containerClassName)}
        ref={gridContainerRef}
      >
        <AutoSizer
          disableWidth={width !== undefined}
          disableHeight={height !== undefined}
          defaultHeight={Number(height)}
          defaultWidth={Number(width)}
          onResize={onResize}
        >
          {({ width, height }) => render(width, height)}
        </AutoSizer>
      </div>
    )
  },
)
