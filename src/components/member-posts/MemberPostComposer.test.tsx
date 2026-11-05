// #1183 — posting without a Page: a kind, the words, a neighborhood; a yard sale's day and street; Listed under.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemberPostComposer } from './MemberPostComposer'

afterEach(cleanup)

const hoods = async () => [{ placeId: 'h1', name: 'Curtis Park', centroid: [-121.49, 38.55] as [number, number] }]

async function fill(kind: string, body: string) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(kind) }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Say what it is' }), { target: { value: body } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Neighborhood' }), { target: { value: 'Cur' } })
  fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
}

describe('#1183 — MemberPostComposer', () => {
  it('offers the three kinds and nothing else', () => {
    render(<MemberPostComposer onPost={vi.fn()} onPosted={vi.fn()} searchNeighborhoods={hoods} />)
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['lost_found', 'free_sale', 'ask'])
    expect(screen.getByTestId('member-post-submit')).toBeDisabled()
  })

  it('posts the kind, the words, the neighborhood and where it is listed', async () => {
    const onPost = vi.fn().mockResolvedValue({ ok: true, postId: 'p1' })
    const onPosted = vi.fn()
    render(<MemberPostComposer onPost={onPost} onPosted={onPosted} searchNeighborhoods={hoods} />)
    await fill('Lost & found', 'Lost my dog near the park')
    expect(screen.getByTestId('member-post-place')).toHaveTextContent('Curtis Park')
    expect(screen.getByTestId('member-post-listed')).toHaveTextContent('Listed under:')
    fireEvent.click(screen.getByTestId('member-post-submit'))
    await waitFor(() => expect(onPosted).toHaveBeenCalledWith('p1'))
    expect(onPost.mock.calls[0]![0]).toMatchObject({ kind: 'lost_found', body: 'Lost my dog near the park', placeId: 'h1', labelsPinned: false })
    expect(onPost.mock.calls[0]![0].saleOn).toBeUndefined()
  })

  it('a street only on a yard sale, once its day is set', async () => {
    const onPost = vi.fn().mockResolvedValue({ ok: true, postId: 'p2' })
    render(<MemberPostComposer onPost={onPost} onPosted={vi.fn()} searchNeighborhoods={hoods} />)
    await fill('Free / for sale', 'Yard sale: tools and books')
    expect(screen.queryByRole('textbox', { name: /Street address/ })).toBeNull()
    fireEvent.change(screen.getByLabelText(/Its day/), { target: { value: '2026-11-07' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Street address/ }), { target: { value: '2700 Portola Way' } })
    fireEvent.click(screen.getByTestId('member-post-submit'))
    await waitFor(() => expect(onPost).toHaveBeenCalled())
    expect(onPost.mock.calls[0]![0]).toMatchObject({ saleOn: '2026-11-07', street: '2700 Portola Way' })
  })

  it('says a refusal in its own words, and the post stays to try again', async () => {
    const onPost = vi.fn().mockResolvedValue({ ok: false, message: 'You have 3 posts up. Take one down to post another.' })
    render(<MemberPostComposer onPost={onPost} onPosted={vi.fn()} searchNeighborhoods={hoods} />)
    await fill('Ask a neighbor', 'A good tailor?')
    fireEvent.click(screen.getByTestId('member-post-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 3 posts up.')
    expect(screen.getByTestId('member-post-submit')).toBeEnabled()
  })

  it('without a confirmed phone, asks for it first and offers no form', () => {
    render(<MemberPostComposer onPost={vi.fn()} onPosted={vi.fn()} searchNeighborhoods={hoods} needsPhone />)
    expect(screen.getByTestId('member-post-phone')).toHaveTextContent('Confirm your phone number before you post.')
    expect(screen.queryByTestId('member-post-composer')).toBeNull()
  })
})
