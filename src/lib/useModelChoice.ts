import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): the choice just is not remembered */
  }
}

/**
 * The selectable models for one task plus the user's current pick.
 *
 * `value` is the remembered choice if the server still offers it, else the server default, else the
 * first option. It is '' when the model list could not load: callers then omit the model from the
 * request and the server picks its default, so generation never depends on this endpoint.
 */
export function useModelChoice(task: api.ModelTask) {
  const { user } = useAuth();
  const storageKey = `resume-model:${user?.id ?? 'anon'}:${task}`;
  const { data, isLoading } = useSWR(['resume-models', task], () => api.listResumeModels(task), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const [stored, setStored] = useState<string | null>(() => readStored(storageKey));
  useEffect(() => setStored(readStored(storageKey)), [storageKey]);

  const options = useMemo(() => data?.models ?? [], [data]);
  const value = useMemo(() => {
    if (stored && options.some((o) => o.id === stored)) return stored;
    return data?.defaultId ?? options[0]?.id ?? '';
  }, [stored, options, data]);

  const setValue = useCallback(
    (id: string) => {
      setStored(id);
      writeStored(storageKey, id);
    },
    [storageKey],
  );

  return { options, value, setValue, loading: isLoading };
}
