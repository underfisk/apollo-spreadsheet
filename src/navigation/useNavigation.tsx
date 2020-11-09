import React, { useCallback, useEffect, useRef, useState } from 'react'
import { isIndexOutOfBoundaries, isMetaKey, isPrintableChar } from './navigation.utils'
import { NavigationCoords } from './types'
import { isFunctionType } from '../helpers'
import { CellChangeParams } from '../editorManager'
import * as clipboardy from 'clipboardy'
import { ColumnCellType, Column } from '../columnGrid/types'
import dayjs from 'dayjs'
import { ROW_SELECTION_HEADER_ID } from '../rowSelection'
import { debounce, DebouncedFunc } from 'lodash'
import { NavigationKey } from '../editorManager/enums'
import {
	CELL_BEGIN_EDITING,
	CELL_CLICK,
	CELL_DOUBLE_CLICK,
	ROWS_CHANGED,
	useApiExtends,
	NavigationApi,
	ApiRef,
	useApiEventHandler,
	CELL_NAVIGATION_CHANGED,
} from '../api'
import { Row } from '../types'
import { useLogger } from '../logger'

interface Props {
	defaultCoords: NavigationCoords
	suppressControls: boolean
	onCellChange?: (params: CellChangeParams) => void
	onCreateRow?: (coords: NavigationCoords) => void
	apiRef: ApiRef
	initialised: boolean
}

export interface KeyDownEventParams {
	event: KeyboardEvent | React.KeyboardEvent
}

export function useNavigation({
	defaultCoords,
	suppressControls,
	onCellChange,
	onCreateRow,
	apiRef,
	initialised,
}: Props): NavigationCoords {
	const logger = useLogger('useNavigation')
	const coordsRef = useRef<NavigationCoords>(defaultCoords)
	const [coords, setCoords] = useState<NavigationCoords>(defaultCoords)
	const delayEditorDebounce = useRef<DebouncedFunc<any> | null>(null)

	const onCellBeginEditing = useCallback(() => {
		if (delayEditorDebounce.current) {
			delayEditorDebounce.current.cancel()
		}
	}, [])

	const onRowsChanged = useCallback(
		({ rows }: { rows: unknown[] }) => {
			const target = rows[coordsRef.current.rowIndex]
			if (!target) {
				coordsRef.current = defaultCoords
				apiRef.current.dispatchEvent(CELL_NAVIGATION_CHANGED, { coords: coordsRef.current })
				setCoords(defaultCoords)
			}
		},
		[apiRef, defaultCoords],
	)

	//Cancels the debounce if the editor is prematurely open
	useApiEventHandler(apiRef, CELL_BEGIN_EDITING, onCellBeginEditing)

	//Subscribe for data changes to ensure the selected coordinates exist
	useApiEventHandler(apiRef, ROWS_CHANGED, onRowsChanged)

	//Cleanup the debounce on unmount
	useEffect(
		() => () => {
			delayEditorDebounce.current?.cancel()
		},
		[],
	)

	function getDefaultValueFromValue(value: unknown) {
		if (Array.isArray(value)) {
			return []
		}
		if (typeof value === 'string') {
			return ''
		}
		if (typeof value === 'number') {
			return 0
		}
		return undefined
	}

	/**
	 * Recursively looks for the next navigable cell
	 * @param currentIndex
	 * @param direction
	 */
	const findNextNavigableColumnIndex = useCallback(
		(currentIndex: number, direction: 'left' | 'right') => {
			const nextIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1
			const nextCol = apiRef.current.getColumnAt(nextIndex)
			//Fallback the current in case it was not found
			if (!nextCol) {
				return currentIndex
			}

			if (nextCol.disableNavigation) {
				return findNextNavigableColumnIndex(nextIndex, direction)
			}
			return nextIndex
		},
		[apiRef],
	)

	const selectCell = useCallback(
		({ colIndex, rowIndex }: NavigationCoords, force?: boolean, targetElement?: HTMLElement) => {
			logger.debug(`Select cell for coordinates [${rowIndex},${colIndex}]`)
			if (colIndex === undefined || rowIndex === undefined) {
				return logger.error(
					`Undefined coordinates detected at selectCell [${rowIndex},${colIndex}]. If you wish to remove highlight, you can pass -1, -1 coordinates`,
				)
			}
			//Coordinates when the grid is clicked away
			if ((colIndex === -1 && rowIndex === -1) || force) {
				logger.debug('Force or negative -1 coordinates selected')
				coordsRef.current = { colIndex, rowIndex }
				apiRef.current.dispatchEvent(CELL_NAVIGATION_CHANGED, { coords: coordsRef.current })
				return setCoords({ colIndex, rowIndex })
			}

			//Equal selection comparison
			if (coords.colIndex === colIndex && coords.rowIndex === rowIndex) {
				return logger.debug('Coordinates given are equal to the current coordinates')
			}

			//Validate boundaries
			if (
				isIndexOutOfBoundaries(colIndex, 0, apiRef.current.getColumnCount() - 1) ||
				isIndexOutOfBoundaries(rowIndex, 0, apiRef.current.getRowsCount() - 1)
			) {
				return logger.warn('Attempting to go out of boundaries, states result ', {
					colIndex,
					rowIndex,
					columnCount: apiRef.current.getColumnCount(),
					rowsCount: apiRef.current.getRowsCount(),
					columnOutOfBound: isIndexOutOfBoundaries(
						colIndex,
						0,
						apiRef.current.getColumnCount() - 1,
					),
					rowOutOfBound: isIndexOutOfBoundaries(rowIndex, 0, apiRef.current.getRowsCount() - 1),
				})
			}

			const column = apiRef.current.getColumnAt(colIndex)
			if (!column) {
				return logger.warn(
					`Column not found at index ${colIndex}, review your configuration. Total loaded columns ${apiRef.current.getColumnCount()}`,
				)
			}

			const isDisabled = isFunctionType(column.disableNavigation)
				? column.disableNavigation({ rowIndex, colIndex })
				: column.disableNavigation

			if (isDisabled) {
				return logger.info(`Navigation is disabled for the given column: ${column.id}`)
			}

			const delayEditingOpen = column.delayEditorOpen
			//Cleanup
			if (delayEditorDebounce.current) {
				logger.info('Delay editor debounce is being cleared')
				delayEditorDebounce.current.cancel()
				delayEditorDebounce.current = null
			}

			if (delayEditingOpen) {
				delayEditorDebounce.current = debounce(() => {
					logger.info('Debounce has been invoked')
					delayEditorDebounce.current = null
					if (colIndex < 0 || rowIndex < 0) {
						return logger.info("Debounce couldn't start editor at negative coordinates")
					}
					const selector = `[aria-colindex='${colIndex}'][data-rowindex='${rowIndex}'][role='cell']`
					const target =
						targetElement ?? apiRef.current.rootElementRef?.current?.querySelector(selector)
					if (!target) {
						return logger.error(
							`Cell dom element not found on delayEditingOpen debounce with selector: ${selector}`,
						)
					}

					apiRef.current.beginEditing({
						coords: { rowIndex, colIndex },
						targetElement: target,
					})
				}, delayEditingOpen)
				delayEditorDebounce.current()
			}

			coordsRef.current = { colIndex, rowIndex }
			apiRef.current.dispatchEvent(CELL_NAVIGATION_CHANGED, { coords: coordsRef.current })
			setCoords({ colIndex, rowIndex })
		},
		[logger, coords, apiRef],
	)

	const handleCellPaste = useCallback(
		async (column: Column, row: Row, currentValue: unknown) => {
			try {
				let text = await clipboardy.read()
				//Check the text length if passes the maxLength allowed, if so we cut
				if (column.maxLength && text.length > column.maxLength) {
					text = text.slice(0, column.maxLength)
				}

				if (column.validatorHook) {
					if (column.validatorHook(text)) {
						return onCellChange?.({
							coords,
							previousValue: currentValue,
							newValue: text,
							column,
							row,
						})
					}
					return
				}
				//Fallback is the column type
				if (column.type === ColumnCellType.Numeric) {
					if (!isNaN(Number(text))) {
						return onCellChange?.({
							coords,
							previousValue: currentValue,
							newValue: text,
							column,
							row,
						})
					}
					return
				}
				if (column.type === ColumnCellType.Calendar) {
					if (dayjs(text, 'YYYY-MM-DD').format('YYYY-MM-DD') === text) {
						return onCellChange?.({
							coords,
							previousValue: currentValue,
							newValue: text,
							column,
							row,
						})
					}
					return
				}

				return onCellChange?.({ coords, previousValue: currentValue, newValue: text, column, row })
			} catch (ex) {
				logger.error(`handleCellPaste -> ${ex}`)
			}
		},
		[coords, logger, onCellChange],
	)

	const handleCellCut = useCallback(
		async (currentValue: unknown, column: Column, row: Row) => {
			await clipboardy.write(String(currentValue))
			const newValue = getDefaultValueFromValue(currentValue)
			if (currentValue === newValue) {
				return
			}
			onCellChange?.({ coords, previousValue: currentValue, newValue, column, row })
		},
		[coords, onCellChange],
	)

	const handleEditorOpenControls = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault()
				return apiRef.current.stopEditing({ save: false })
			}

			if (event.key === 'Enter') {
				event.preventDefault()
				return apiRef.current.stopEditing()
			}
		},
		[apiRef],
	)

	const handleControlOrMetaPressedControls = useCallback(
		(event: KeyboardEvent, column: Column, row: Row, currentValue: unknown) => {
			if (event.key === 'x') {
				event.preventDefault()
				if (column.disableCellCut) {
					return
				}
				return handleCellCut(currentValue, column, row)
			}
			if (event.key === 'c') {
				event.preventDefault()
				return clipboardy.write(String(currentValue))
			}

			if (event.key === 'v') {
				event.preventDefault()
				if (column.disableCellPaste) {
					return
				}
				return handleCellPaste(column, row, currentValue)
			}
		},
		[handleCellCut, handleCellPaste],
	)

	/** @todo Might need to consider colSpan **/
	const handleArrowNavigationControls = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				let nextRowIndex = coords.rowIndex + 1

				//If we have span we need to skip that to the next
				const currentCellSpan = apiRef.current.getSpanProperties(coords)
				if (currentCellSpan) {
					nextRowIndex = coords.rowIndex + currentCellSpan.rowSpan
				}

				//Ensure we are not out of boundaries
				if (isIndexOutOfBoundaries(nextRowIndex, 0, apiRef.current.getRowsCount() - 1)) {
					return
				}

				return selectCell({
					rowIndex: nextRowIndex,
					colIndex: coords.colIndex,
				})
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault()
				let nextRowIndex = coords.rowIndex - 1
				//If we have span we need to skip that to the next
				const isNextMerged = apiRef.current.isMerged({
					rowIndex: nextRowIndex,
					colIndex: coords.colIndex,
				})
				if (isNextMerged) {
					const parentCoords = apiRef.current.getMergeParentCoords({
						rowIndex: nextRowIndex,
						colIndex: coords.colIndex,
					})
					if (!parentCoords) {
						return logger.warn(
							`[Navigation] Merge group path not correct, returned ${parentCoords} positions instead of the expected coordinates. Please review`,
						)
					}
					//Means we have the parent, parent comes in the first position always
					nextRowIndex = parentCoords.rowIndex
				}

				//Ensure we are not out of boundaries
				if (nextRowIndex < 0) {
					return
				}

				return selectCell({
					rowIndex: nextRowIndex,
					colIndex: coords.colIndex,
				})
			}

			if (event.key === 'ArrowRight' || (event.key === 'Tab' && !event.shiftKey)) {
				event.preventDefault()
				let nextColIndex = coords.colIndex + 1

				if (isIndexOutOfBoundaries(nextColIndex, 0, apiRef.current.getColumnCount() - 1)) {
					return
				}

				//Is navigable?
				const col = apiRef.current.getColumnAt(nextColIndex)
				if (!col) {
					return logger.error(`Column not found at${nextColIndex}`)
				}

				if (col.disableNavigation) {
					nextColIndex = findNextNavigableColumnIndex(coords.colIndex, 'right')
				}

				if (apiRef.current.isMerged({ rowIndex: coords.rowIndex, colIndex: nextColIndex })) {
					const parentCoords = apiRef.current.getMergeParentCoords({
						rowIndex: coords.rowIndex,
						colIndex: nextColIndex,
					})
					if (parentCoords) {
						return selectCell(parentCoords)
					}
					return logger.warn(
						`[Navigation] Merge group path not correct, returned ${parentCoords} positions instead of the expected coordinates. Please review`,
					)
				}

				return selectCell({ rowIndex: coords.rowIndex, colIndex: nextColIndex })
			}

			if (event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey)) {
				event.preventDefault()
				let nextColIndex = coords.colIndex - 1
				if (isIndexOutOfBoundaries(nextColIndex, 0, apiRef.current.getColumnCount() - 1)) {
					return
				}
				const nextColumn = apiRef.current.getColumnAt(nextColIndex)
				if (!nextColumn) {
					return logger.error(`Column not found at ${nextColIndex}`)
				}

				if (nextColumn.disableNavigation) {
					nextColIndex = findNextNavigableColumnIndex(coords.colIndex, 'left')
				}

				if (apiRef.current.isMerged({ rowIndex: coords.rowIndex, colIndex: nextColIndex })) {
					const parentCoords = apiRef.current.getMergeParentCoords({
						rowIndex: coords.rowIndex,
						colIndex: nextColIndex,
					})
					if (parentCoords) {
						return selectCell(parentCoords)
					}
					return logger.warn(
						`[Navigation] Merge group path not correct, returned ${parentCoords} positions instead of the expected coordinates. Please review`,
					)
				}

				return selectCell({ rowIndex: coords.rowIndex, colIndex: nextColIndex })
			}
		},
		[apiRef, coords, findNextNavigableColumnIndex, logger, selectCell],
	)

	const handleSelectionHeaderControls = useCallback(
		(event: KeyboardEvent, row: Row) => {
			//Enable only checkbox via enter
			if (event.key === 'Enter') {
				return apiRef.current.selectRow(row)
			}
		},
		[apiRef],
	)

	const onKeyDown = useCallback(
		(event: KeyboardEvent) => {
			const editorState = apiRef.current.getEditorState()
			//Ensure we can proceed navigation under this core conditions
			if (!initialised || suppressControls || editorState?.isPopup) {
				return logger.info(
					`Navigation is suppressed for key ${event.key} with the following states: ${{
						initialised,
						suppressControls,
						isPopup: editorState?.isPopup,
					}}`,
				)
			}

			const isCtrlPressed = (event.ctrlKey || event.metaKey) && !event.altKey
			//Common strategy - Must be on top level, its priority over normal navigation
			if (editorState && (event.key === 'Enter' || event.key === 'Escape')) {
				return handleEditorOpenControls(event)
			}

			const selector = `[aria-colindex='${coords.colIndex}'][data-rowindex='${coords.rowIndex}'][role='cell']`
			const cellElement = apiRef.current.rootElementRef?.current?.querySelector(selector)
			if (!cellElement) {
				return logger.error(
					`Cell DOM element not found with coordinates [${coords.rowIndex},${coords.colIndex}] using the following selector: ${selector}`,
				)
			}

			const column = apiRef.current.getColumnAt(coords.colIndex)
			if (!column) {
				return logger.warn('Column not found')
			}

			//Travel like excel rules for non-editing
			if (!editorState) {
				if (event.key === 'F2') {
					event.preventDefault()
					return apiRef.current.beginEditing({
						coords,
						targetElement: cellElement,
					})
				}

				if (event.key === 'Enter' && onCreateRow && column.id !== ROW_SELECTION_HEADER_ID) {
					event.preventDefault()
					onCreateRow(coords)
				}
			}

			//Check if its a navigation key
			if (NavigationKey[event.key] !== undefined && !editorState) {
				return handleArrowNavigationControls(event)
			}

			const row = apiRef.current.getRowAt(coords.rowIndex)
			if (!row) {
				return logger.warn(`Row not found at index ${coords.rowIndex}`)
			}
			const currentValue = row[column.accessor]

			//Handle specific keyboard handlers
			if (column.id === ROW_SELECTION_HEADER_ID) {
				return handleSelectionHeaderControls(event, row)
			}

			if (isCtrlPressed && !editorState) {
				return handleControlOrMetaPressedControls(event, column, row, currentValue)
			}

			//Handle cell deleting
			if ((event.key === 'Backspace' || event.key === 'Delete') && !editorState) {
				if (column.disableBackspace) {
					return
				}
				event.preventDefault()
				const newValue = getDefaultValueFromValue(currentValue)
				if (currentValue === newValue) {
					return
				}

				return onCellChange?.({
					newValue,
					previousValue: currentValue,
					coords,
					row,
					column,
				})
			}

			//If its numeric key and we are in numeric column, open with this key by default
			if (column.type === ColumnCellType.Numeric && !editorState) {
				const regex = /^[0-9]+$/
				if (regex.test(event.key)) {
					event.preventDefault()
					return apiRef.current.beginEditing({
						coords,
						defaultKey: event.key !== 'Dead' ? event.key : undefined,
						targetElement: cellElement,
					})
				}
			}

			//If its any printable char, we allow to open editing
			if (
				!column.type &&
				isPrintableChar(event.keyCode) &&
				!isMetaKey(event.keyCode) &&
				!editorState
			) {
				//Any key makes it to open and send the key pressed
				event.preventDefault()
				return apiRef.current.beginEditing({
					coords,
					defaultKey: event.key !== 'Dead' ? event.key : undefined,
					targetElement: cellElement,
				})
			}
		},
		[
			apiRef,
			initialised,
			suppressControls,
			coords,
			handleEditorOpenControls,
			logger,
			onCreateRow,
			handleArrowNavigationControls,
			handleSelectionHeaderControls,
			handleControlOrMetaPressedControls,
			onCellChange,
		],
	)

	const onCellClick = useCallback(
		({
			event,
			colIndex,
			rowIndex,
			element,
		}: {
			event: MouseEvent
			colIndex: number
			rowIndex: number
			element: HTMLElement
		}) => {
			event.preventDefault()
			selectCell({ rowIndex, colIndex }, false, element)
		},
		[selectCell],
	)

	const onCellDoubleClick = useCallback(
		({
			event,
			colIndex,
			rowIndex,
			element,
		}: {
			event: MouseEvent
			colIndex: number
			rowIndex: number
			element: HTMLDivElement
		}) => {
			event.preventDefault()
			//Compare if the cell is equal to whats selected otherwise select it first
			if (colIndex !== coords.colIndex && rowIndex !== coords.rowIndex) {
				selectCell({ rowIndex, colIndex }, false, element)
			}
			apiRef.current.beginEditing({
				coords: { colIndex, rowIndex },
				targetElement: element,
			})
		},
		[apiRef, selectCell, coords],
	)

	const getSelectedCoords = useCallback(() => coordsRef.current, [])
	useApiEventHandler(apiRef, 'keydown', onKeyDown)
	useApiEventHandler(apiRef, CELL_CLICK, onCellClick)
	useApiEventHandler(apiRef, CELL_DOUBLE_CLICK, onCellDoubleClick)
	const navigationApi: NavigationApi = {
		getSelectedCoords,
		selectCell,
	}
	useApiExtends(apiRef, navigationApi, 'NavigationApi')
	return coords
}
