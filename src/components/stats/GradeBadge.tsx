import type { ProfileGrade } from '../../api/endpoints';

const GRADE: Record<ProfileGrade, { text: string; cls: string }> = {
  strong: { text: '✅ Strong', cls: 'text-green-700 dark:text-green-400' },
  watch: { text: '⚠ Watch', cls: 'text-amber-700 dark:text-amber-400' },
  dead: { text: '⛔ Dead', cls: 'text-red-700 dark:text-red-400' },
  early: { text: '⏳ Too early', cls: 'text-muted' },
};

export default function GradeBadge({ grade }: { grade: ProfileGrade }) {
  const g = GRADE[grade];
  return <span className={`whitespace-nowrap font-medium ${g.cls}`}>{g.text}</span>;
}
