import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ResumeStylingEditor from '../components/ResumeStylingEditor';

export default function AccountResumeSettings() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-3">
      <header className="flex items-center gap-3">
        <Link to="/accounts" className="text-gray-500 hover:text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Resume styling</h1>
      </header>
      <ResumeStylingEditor accountId={id} />
    </div>
  );
}
