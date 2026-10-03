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

export interface ModelChoice {
  /** Providers the server can use, in picker order. */
  providers: api.ModelProviderInfo[];
  /** Provider of the current pick ('' when no models could be loaded). */
  provider: string;
  /** Switch provider: selects that provider's recommended preset. */
  setProvider: (id: string) => void;
  /** The current provider's suggested models, best first. */
  options: api.ModelOption[];
  /** Selected model id; '' when the model list could not load (callers then omit it). */
  value: string;
  setValue: (id: string) => void;
  loading: boolean;
}

/**
 * The selectable models for one task plus the user's current pick.
 *
 * `value` is the remembered choice if the server still offers it, else the server default, else the
 * first model. It is '' when the model list could not load: callers then omit the model from the
 * request and the server picks its default, so generation never depends on this endpoint.
 */
export function useModelChoice(task: api.ModelTask): ModelChoice {
  const { user } = useAuth();
  const storageKey = `resume-model:${user?.id ?? 'anon'}:${task}`;
  const { data, isLoading } = useSWR(['resume-models', task], () => api.listResumeModels(task), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const [stored, setStored] = useState<string | null>(() => readStored(storageKey));
  useEffect(() => setStored(readStored(storageKey)), [storageKey]);

  const all = useMemo(() => data?.models ?? [], [data]);
  const providers = useMemo(() => data?.providers ?? [], [data]);
  const value = useMemo(() => {
    if (stored && all.some((o) => o.id === stored)) return stored;
    return data?.defaultId ?? all[0]?.id ?? '';
  }, [stored, all, data]);
  const provider = all.find((o) => o.id === value)?.provider ?? '';
  const options = useMemo(() => all.filter((o) => o.provider === provider), [all, provider]);

  const setValue = useCallback(
    (id: string) => {
      setStored(id);
      writeStored(storageKey, id);
    },
    [storageKey],
  );
  const setProvider = useCallback(
    (id: string) => {
      const preset = all.find((o) => o.provider === id && o.recommended) ?? all.find((o) => o.provider === id);
      if (preset) setValue(preset.id);
    },
    [all, setValue],
  );

  return { providers, provider, setProvider, options, value, setValue, loading: isLoading };
}
