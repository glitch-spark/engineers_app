import Select from '../Select';
import Switch from '../Switch';
import type { CallerMethod } from '../../api/endpoints';
import type { RoundFormState } from '../../lib/interviewForm';
import { CALLER_METHOD_OPTIONS } from './types';

const METHOD_VALUE_PLACEHOLDER: Record<CallerMethod | '', string> = {
  '': 'Meeting link or phone number',
  video: 'https://meet.google.com/…',
  phone_hushed: '+1 555 000 0000',
  phone_slynumber: '+1 555 000 0000',
};

/** Caller request for one round. The caller joins at the round's start time. */
export default function CallerFields({
  round,
  onChange,
  disabled,
  idPrefix,
}: {
  round: RoundFormState;
  onChange: (patch: Partial<RoundFormState>) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const method = (round.callerMethod || '') as CallerMethod | '';
  const id = (k: string) => `${idPrefix}-caller-${k}`;

  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <Switch
        id={id('toggle')}
        label="Request a caller"
        description="A caller joins at this round's start time. Posts to the #caller channel on Slack."
        checked={round.callerEnabled}
        disabled={disabled}
        onChange={(on) => onChange({ callerEnabled: on })}
      />
      {round.callerEnabled && (
        <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={id('name')} className="block text-sm font-medium mb-1">Caller</label>
              <input
                id={id('name')}
                className="input"
                value={round.callerName}
                disabled={disabled}
                placeholder="TBD"
                onChange={(e) => onChange({ callerName: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={id('method')} className="block text-sm font-medium mb-1">Method</label>
              <Select
                id={id('method')}
                value={method}
                onChange={(v) => onChange({ callerMethod: v })}
                options={[{ value: '', label: 'TBD' }, ...CALLER_METHOD_OPTIONS]}
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <label htmlFor={id('value')} className="block text-sm font-medium mb-1">
              {method === 'video' ? 'Meeting link' : method ? 'Phone number' : 'Link or number'}
            </label>
            <input
              id={id('value')}
              className="input"
              type={method === 'video' ? 'url' : method ? 'tel' : 'text'}
              value={round.callerMethodValue}
              disabled={disabled}
              placeholder={METHOD_VALUE_PLACEHOLDER[method]}
              onChange={(e) => onChange({ callerMethodValue: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
