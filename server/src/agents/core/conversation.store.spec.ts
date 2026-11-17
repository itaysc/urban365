import { historyWhere } from './conversation.store.js';

describe('historyWhere', () => {
  it('names an account and the anonymous chats still on that browser', () => {
    expect(historyWhere({ agentId: 'end-user', userId: 'user-1', visitorId: 'visitor-1' })).toEqual({
      OR: [
        { agentId: 'end-user', userId: 'user-1' },
        { agentId: 'end-user', userId: null, visitorId: 'visitor-1' },
      ],
    });
  });

  it('names only the browser when nobody is signed in', () => {
    expect(historyWhere({ agentId: 'end-user', userId: null, visitorId: 'visitor-1' })).toEqual({
      agentId: 'end-user',
      userId: null,
      visitorId: 'visitor-1',
    });
  });

  it('matches nothing when the caller cannot be told apart', () => {
    expect(historyWhere({ agentId: 'end-user', userId: null, visitorId: null })).toBeNull();
  });

  it('keeps a CRM chat inside one office', () => {
    expect(
      historyWhere({ agentId: 'agency', userId: 'user-1', visitorId: null, agencyId: 'office-1' }),
    ).toEqual({ agentId: 'agency', userId: 'user-1', agencyId: 'office-1' });
  });
});
