// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useStatusNotePrompt } from './StatusNoteDialog';

afterEach(cleanup);

function Harness({ status, onAnswer, note, reason }: {
  status: string; onAnswer: (a: unknown) => void; note?: string; reason?: string | null;
}) {
  const { prompt, dialog } = useStatusNotePrompt();
  return (
    <>
      <button type="button" onClick={() => { void prompt(status, 'Tech round 1', note, reason).then(onAnswer); }}>ask</button>
      {dialog}
    </>
  );
}

function ask(status: string, extra: { note?: string; reason?: string | null } = {}) {
  const onAnswer = vi.fn();
  render(<Harness status={status} onAnswer={onAnswer} {...extra} />);
  fireEvent.click(screen.getByRole('button', { name: 'ask' }));
  return onAnswer;
}

describe('StatusNoteDialog', () => {
  it('Canceled cannot be saved without a reason, then sends the picked key', async () => {
    const onAnswer = ask('canceled');
    const save = screen.getByRole('button', { name: 'Save as Canceled' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest('form')!);
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Why was it canceled\?/), { target: { value: 'company' } });
    expect(screen.getByText("They canceled or moved it, or the interviewer didn't join.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: ' moved twice ' } });
    fireEvent.click(save);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ note: 'moved twice', reason: 'company' }));
  });

  it('Rejected cannot be saved without a reason, then sends the picked key', async () => {
    const onAnswer = ask('rejected');
    const save = screen.getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const select = screen.getByLabelText(/Why was it rejected\?/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toContain('No answer from the company');
    fireEvent.change(select, { target: { value: 'no_answer' } });
    fireEvent.click(save);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ note: '', reason: 'no_answer' }));
  });

  it('Passed still needs no reason', async () => {
    const onAnswer = ask('passed');
    expect(screen.queryByLabelText(/Why was it/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save as Passed' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ note: '', reason: '' }));
  });

  it('opens on the saved reason, and on an empty select for an old round with none', () => {
    ask('canceled', { note: 'old note', reason: 'technical' });
    expect((screen.getByLabelText(/Why was it canceled\?/) as HTMLSelectElement).value).toBe('technical');
    cleanup();
    ask('canceled', { note: 'old note', reason: null });
    expect((screen.getByLabelText(/Why was it canceled\?/) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Details (optional)') as HTMLTextAreaElement).value).toBe('old note');
  });

  it('Back resolves null', async () => {
    const onAnswer = ask('rejected');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(null));
  });
});
