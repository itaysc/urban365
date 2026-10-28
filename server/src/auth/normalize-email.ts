/**
 * Postgres unique indexes are case-sensitive, so without this `Itay@x.com` and
 * `itay@x.com` are two accounts — and the neutral "an account may already exist"
 * responses quietly stop protecting anything. Call it on every write *and* every lookup.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
