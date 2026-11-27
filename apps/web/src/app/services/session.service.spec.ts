import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'

import { SessionService } from './session.service'

describe('a session that ran out under an open page', () => {
  const setup = (url: string) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const router = TestBed.inject(Router)
    vi.spyOn(router, 'url', 'get').mockReturnValue(url)
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true)
    return { session: TestBed.inject(SessionService), navigate }
  }

  it('goes to the token page once, keeping where the person was', () => {
    const { session, navigate } = setup('/board/3')
    session.expired()
    session.expired() // the stream and a request both say so
    expect(session.state()).toBe('needs-token')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { next: '/board/3' } })
  })

  it('stays on the token page when already there', () => {
    const { session, navigate } = setup('/login?next=%2Fboard')
    session.expired()
    expect(navigate).not.toHaveBeenCalled()
  })
})
