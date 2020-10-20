import React, { useCallback, useEffect } from 'react'
import { ApiRef } from '../api/types/apiRef'
import { CELL_CLICK, CELL_DOUBLE_CLICK, GRID_FOCUS_OUT } from "../api/eventConstants"

export function useEvents(gridRootRef: React.RefObject<HTMLDivElement>, apiRef: ApiRef) {
	const createHandler = useCallback(
		(name: string) => (...args: any[]) => apiRef.current.dispatchEvent(name, ...args),
		[apiRef],
	)

	const onClickHandler = useCallback(
		(event: MouseEvent) => {
			const target = event.target as HTMLElement
			const isCell = target?.getAttribute('role') === 'cell' && !target?.getAttribute('data-dummy')
			if (isCell) {
				apiRef.current.dispatchEvent(CELL_CLICK, {
					event,
					colIndex: parseInt(target.getAttribute('aria-colindex') || '-1'),
					rowIndex: parseInt(target.getAttribute('data-rowindex') || '-1'),
				})
			}
		},
		[apiRef],
	)

	const onDoubleClickHandler = useCallback(
		(event: MouseEvent) => {
			const target = event.target as HTMLElement
			const isCell = target?.getAttribute('role') === 'cell' && !target?.getAttribute('data-dummy')
			if (isCell) {
				apiRef.current.dispatchEvent(CELL_DOUBLE_CLICK, {
					event,
					colIndex: parseInt(target.getAttribute('aria-colindex') || '-1'),
					rowIndex: parseInt(target.getAttribute('data-rowindex') || '-1'),
				})
			}
		},
		[apiRef],
	)

	useEffect(() => {
		if (gridRootRef && gridRootRef.current && apiRef.current?.isInitialised) {
			console.info('Binding events listeners')
			const keyDownHandler = createHandler('keydown')
			const gridRootElem = gridRootRef.current

			gridRootRef.current.addEventListener('click', onClickHandler, { capture: true })
			gridRootRef.current.addEventListener('dblclick', onDoubleClickHandler, { capture: true })
			//gridRootRef.current.addEventListener('focusout', onFocusOut)

			document.addEventListener('keydown', keyDownHandler)

			apiRef.current.isInitialised = true
			const api = apiRef.current

			return () => {
				console.info('Clearing all events listeners')
				gridRootElem.removeEventListener('click', onClickHandler, { capture: true })
				gridRootElem.removeEventListener('dblclick', onDoubleClickHandler, { capture: true })
				//gridRootElem.removeEventListener('focusout', onFocusOut)
				document.removeEventListener('keydown', keyDownHandler)
				api.removeAllListeners()
			}
		}

		return
	}, [gridRootRef, apiRef])
}