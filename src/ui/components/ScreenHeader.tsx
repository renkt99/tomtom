import type { ComponentChildren } from 'preact';
import { navigate } from '../router';
import { ChevronLeftIcon } from './icons';

export interface ScreenHeaderProps {
  title: string;
  /** Renders a back chevron navigating to this hash when set. */
  backHash?: string;
  /** Optional right-slot action (e.g. settings gear). */
  right?: ComponentChildren;
  /** Makes the title tappable (RouteDetail rename). */
  onTitleClick?: () => void;
}

export function ScreenHeader({ title, backHash, right, onTitleClick }: ScreenHeaderProps) {
  return (
    <header class="screen-header">
      {backHash ? (
        <button
          class="icon-btn"
          aria-label="Back"
          onClick={() => navigate(backHash)}
        >
          <ChevronLeftIcon />
        </button>
      ) : (
        <span class="header-spacer" />
      )}
      <h1 class={onTitleClick ? 'tap-target' : undefined} onClick={onTitleClick}>
        {title}
      </h1>
      {right ?? <span class="header-spacer" />}
    </header>
  );
}
