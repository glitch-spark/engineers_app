// Profile page → Profile tab helpers (spec 2026-11-14-profile-tab-ux-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptsDirty, promptsOf, setupStrip, tailoringSetUp } from '../src/lib/profileSetup.ts';

const unit = (over = {}) => ({ id: 'u1', name: 'Backend', roles: ['backend'], body: 'Rewrite it', templateHtml: '<p>x</p>', templateName: 't.html', ...over });
const doc = (over = {}) => ({
  name: 'Matthew (Puma)', country: 'US', region: 'Americas', resumes: [{ id: 'r1' }, { id: 'r2' }],
  resumePrompts: [
    unit({ id: 'b', name: 'Backend' }),
    unit({ id: 'f', name: 'Fullstack', roles: ['fullstack'] }),
    unit({ id: 'q', name: 'QA', roles: ['qa'] }),
  ],
  defaultPromptId: 'b', screeningPrompt: '', coverLetterPrompt: '', ...over,
});

test('legacy profile reads as one set-up unit', () => {
  const s = promptsOf({ resumePromptBody: '# Senior Backend (v2)\nRewrite…', styleTemplate: '' });
  assert.equal(s.prompts.length, 1);
  assert.equal(s.prompts[0].id, 'default');
  assert.equal(s.prompts[0].name, 'Senior Backend');
  assert.equal(s.defaultId, 'default');
  assert.equal(tailoringSetUp(s.prompts), true);
  assert.equal(tailoringSetUp(promptsOf({}).prompts), false);
});

test('strip counts and default', () => {
  const d = doc();
  assert.deepEqual(setupStrip(d, promptsOf(d)).parts,
    ['US', 'Americas', '2 fixed resumes', '3 tailoring units (default: Backend)']);
  const one = doc({ resumes: [{ id: 'r1' }], country: null, region: '' });
  assert.deepEqual(setupStrip(one, promptsOf(one)).parts, ['1 fixed resume', '3 tailoring units (default: Backend)']);
});

test('no tailoring: no units part', () => {
  const d = doc({ resumePrompts: [unit({ id: 'b', body: '', templateHtml: '', roles: [] })] });
  assert.deepEqual(setupStrip(d, promptsOf(d)).parts, ['US', 'Americas', '2 fixed resumes']);
  assert.deepEqual(setupStrip(d, promptsOf(d)).warnings, []);
});

test('warnings', () => {
  const d = doc({
    resumePrompts: [
      unit({ id: 'b', name: 'Backend', roles: [] }),                     // default without roles: fine
      unit({ id: 'q', name: 'QA', templateHtml: '' }),                   // roles, no draft
      unit({ id: 'g', name: 'General', roles: [] }),                     // not default, no roles
    ],
  });
  assert.deepEqual(setupStrip(d, promptsOf(d)).warnings, [
    '"QA" unit has no tailor draft',
    '"General" unit has no roles, so Job Applies never suggests it',
  ]);
});

test('screening-only edit is a change', () => {
  const saved = promptsOf(doc());
  const out = promptsDirty(saved, { ...saved, screeningPrompt: 'Answer briefly' });
  assert.deepEqual(out, { changed: true, dirtyUnitIds: [], moreChanged: true });
});

test('unit edit, delete and default move each give changed', () => {
  const saved = promptsOf(doc());
  const edited = { ...saved, prompts: saved.prompts.map((p) => (p.id === 'f' ? { ...p, body: 'New' } : p)) };
  assert.deepEqual(promptsDirty(saved, edited), { changed: true, dirtyUnitIds: ['f'], moreChanged: false });
  const deleted = { ...saved, prompts: saved.prompts.filter((p) => p.id !== 'q') };
  assert.equal(promptsDirty(saved, deleted).changed, true);
  assert.equal(promptsDirty(saved, { ...saved, defaultId: 'f' }).changed, true);
  const added = { ...saved, prompts: [...saved.prompts, unit({ id: 'new1', name: 'New unit' })] };
  assert.deepEqual(promptsDirty(saved, added).dirtyUnitIds, ['new1']);
});

test('same state is not a change', () => {
  const saved = promptsOf(doc());
  assert.deepEqual(promptsDirty(saved, promptsOf(doc())), { changed: false, dirtyUnitIds: [], moreChanged: false });
});

test('archived flag passes through', () => {
  const d = doc({ archived: true });
  assert.equal(setupStrip(d, promptsOf(d)).archived, true);
  assert.equal(setupStrip(doc(), promptsOf(doc())).archived, false);
});
