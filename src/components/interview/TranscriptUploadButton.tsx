import { notify } from '../../lib/notify';

const TRANSCRIPT_ACCEPT = '.txt,.md,.markdown,.doc,.docx,.pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf';

/** "Upload file" link that reads a transcript file as text. */
export function TranscriptUploadButton({
  hasTranscript,
  onLoad,
}: {
  hasTranscript: boolean;
  onLoad: (raw: string) => void;
}) {
  return (
    <label className="rounded-sm text-xs text-blue-600 hover:text-blue-700 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-sky-600 dark:[&:has(:focus-visible)]:ring-sky-400">
      {hasTranscript ? 'Replace file' : 'Upload file'}
      <input
        type="file"
        accept={TRANSCRIPT_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const ext = file.name.toLowerCase().split('.').pop() || '';
          const isPlain = ext === 'txt' || ext === 'md' || ext === 'markdown';
          const reader = new FileReader();
          reader.onload = () => {
            onLoad(String(reader.result || ''));
            if (!isPlain) notify.error(`${ext.toUpperCase()} may not parse cleanly — prefer .txt or .md`);
            else notify.success(`Transcript loaded: ${file.name}`);
          };
          reader.onerror = () => notify.error('Could not read the file');
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}
