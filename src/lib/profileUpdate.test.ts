import { describe, expect, it } from 'vitest';
import { profileUpdateBody } from './profileUpdate';

const original = { username: 'Ana', email: 'ana@x.io', image: '', birthday: '', phone: '' };

describe('profileUpdateBody', () => {
  it('leaves the phone out when it did not change, even when it is empty', () => {
    const body = profileUpdateBody({ ...original, username: 'Ana B' }, original);
    expect(body).toEqual({ username: 'Ana B', email: 'ana@x.io', image: '', birthday: '' });
    expect('phone' in body).toBe(false);
  });

  it('sends a phone the user changed, or cleared on purpose', () => {
    expect(profileUpdateBody({ ...original, phone: '555' }, original)).toMatchObject({ phone: '555' });
    expect(profileUpdateBody({ ...original, phone: '' }, { ...original, phone: '555' })).toMatchObject({ phone: '' });
  });
});
