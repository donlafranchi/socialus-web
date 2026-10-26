import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { NcmecRecord } from './NcmecRecord'

// #648 part 2 — on a held (child-safety) row the operator sees how long it is kept, and records the number NCMEC
// gave back after the manual CyberTipline form. Operator-only screen.
afterEach(cleanup)
const RETAIN = new Date('2027-10-13T12:00:00Z')

describe('NcmecRecord', () => {
  it('says how long the item is kept and that it has not been reported yet, with a place for the number', () => {
    render(<NcmecRecord hold={{ retainUntil: RETAIN, ncmecReportNumber: null, ncmecReportedAt: null, reportId: 'r1' }} onRecord={vi.fn(async () => {})} />)
    expect(screen.getByTestId('hold-kept')).toHaveTextContent(/kept as evidence until Oct 13, 2027/i)
    expect(screen.getByTestId('hold-ncmec')).toHaveTextContent(/not reported to NCMEC yet/i)
    expect(screen.getByLabelText(/NCMEC report number/i)).toBeInTheDocument()
  })

  it('records the number against the report and then shows it', async () => {
    const onRecord = vi.fn(async () => {})
    render(<NcmecRecord hold={{ retainUntil: RETAIN, ncmecReportNumber: null, ncmecReportedAt: null, reportId: 'r1' }} onRecord={onRecord} />)
    fireEvent.change(screen.getByLabelText(/NCMEC report number/i), { target: { value: ' 4455 ' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onRecord).toHaveBeenCalledWith({ reportId: 'r1', reportNumber: '4455' }))
    await waitFor(() => expect(screen.getByTestId('hold-ncmec')).toHaveTextContent('4455'))
  })

  it('will not save an empty number', () => {
    const onRecord = vi.fn(async () => {})
    render(<NcmecRecord hold={{ retainUntil: RETAIN, ncmecReportNumber: null, ncmecReportedAt: null, reportId: 'r1' }} onRecord={onRecord} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    expect(onRecord).not.toHaveBeenCalled()
  })

  it('once recorded, shows the number and the day, and offers no second form', () => {
    render(<NcmecRecord hold={{ retainUntil: RETAIN, ncmecReportNumber: '998877', ncmecReportedAt: new Date('2026-10-14T09:00:00Z'), reportId: 'r1' }} onRecord={vi.fn(async () => {})} />)
    expect(screen.getByTestId('hold-ncmec')).toHaveTextContent(/998877/)
    expect(screen.getByTestId('hold-ncmec')).toHaveTextContent(/Oct 14, 2026/)
    expect(screen.queryByLabelText(/NCMEC report number/i)).toBeNull()
  })

  it('says plainly when saving failed and keeps what was typed', async () => {
    render(<NcmecRecord hold={{ retainUntil: RETAIN, ncmecReportNumber: null, ncmecReportedAt: null, reportId: 'r1' }} onRecord={vi.fn(async () => { throw new Error('boom') })} />)
    fireEvent.change(screen.getByLabelText(/NCMEC report number/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/didn.t save/i))
    expect(screen.getByLabelText(/NCMEC report number/i)).toHaveValue('12')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/boom/)
  })
})
