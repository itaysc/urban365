/**
 * What a signed-in agency can do with a membership that is not active yet.
 *
 * `waiting` is still in the queue. `revise` is an agency they created and we turned
 * down, so the details are theirs to correct. `reask` is a claim on an office that
 * went back to the directory. `switch` is a claim they lost — the office is someone
 * else's now, or it was removed — so the only move left is a different agency.
 * `closed` is an active membership, or an office an admin suspended.
 */
export type ResubmitKind = 'waiting' | 'revise' | 'reask' | 'switch' | 'closed';

export function resubmitKind(input: {
  agencyStatus: string;
  membershipStatus: string;
  yad2Id: string | null;
}): ResubmitKind {
  if (input.membershipStatus === 'active') return 'closed';
  if (input.agencyStatus === 'suspended') return 'closed';
  if (input.agencyStatus === 'pending' && input.membershipStatus === 'pending') return 'waiting';
  if (input.agencyStatus === 'rejected' && !input.yad2Id) return 'revise';
  if (input.agencyStatus === 'unclaimed' || input.agencyStatus === 'pending') return 'reask';
  return 'switch';
}
