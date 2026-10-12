import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from './EmptyState';

export function ErrorState({ retryHref }: { retryHref: string }) {
  return (
    <EmptyState title="Не получилось загрузить" text="Похоже, проблемы со связью или на нашей стороне. Попробуй ещё раз." art="notes">
      <ButtonLink href={retryHref}>Повторить</ButtonLink>
    </EmptyState>
  );
}
