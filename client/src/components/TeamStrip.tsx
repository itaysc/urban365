import type { TeamMember } from '@/types/yad2';

/** Initials stand in when yad2 has no avatar for a broker. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export function TeamStrip({ team, agencyName }: { team: TeamMember[]; agencyName: string }) {
  if (team.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">צוות {agencyName}</h2>

      <ul className="flex gap-6 overflow-x-auto pb-2">
        {team.map((member) => (
          <li key={member.id ?? member.name} className="w-36 flex-none text-center">
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.name}
                className="mx-auto h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-500">
                {initials(member.name)}
              </div>
            )}

            <div className="mt-2 font-semibold text-slate-900">{member.name}</div>
            <div className="text-xs text-slate-500">מס׳ רישיון {member.licenseNumber}</div>
            <div className="text-sm text-slate-700 underline">{member.activeAssetsCount ?? 0} נכסים פעילים</div>
            {member.specialization && (
              <div className="mt-1 text-xs font-medium text-blue-600">{member.specialization}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
