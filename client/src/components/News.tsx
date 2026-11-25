import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { NewsItem } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Alert, Badge, Card, EmptyState, PageTitle, Spinner } from './ui';

const useNews = () => useQuery({ queryKey: ['public', 'news'], queryFn: () => api.get<NewsItem[]>('/public/noticias') });

function Item({ n }: { n: NewsItem }) {
  return (
    <article className="py-3">
      <p className="text-xs text-muted">{fmtDate(n.publishedAt)} <Badge tone="info" icon={false}>{n.kind === 'campaign' ? 'Campaña' : 'Noticia'}</Badge></p>
      <h3 className="font-semibold">{n.title}</h3>
      <p className="text-sm whitespace-pre-line">{n.body}</p>
    </article>
  );
}

/** Bloque para la página de inicio de cada perfil. No aparece si no hay publicaciones. */
export function NewsBlock() {
  const q = useNews();
  if (!q.data?.length) return null;
  return <Card title="Noticias y avisos" actions={<Link className="btn-ghost btn-sm" to="/noticias">Ver todas</Link>}><div className="divide-y divide-line">{q.data.slice(0, 2).map((n) => <Item key={n.id} n={n} />)}</div></Card>;
}

export default function NewsPage() {
  const q = useNews();
  return (
    <div>
      <PageTitle title="Noticias y campañas" subtitle="Publicaciones del proyecto, con su fecha." />
      {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : !q.data?.length ? <EmptyState title="Todavía no hay publicaciones" /> : <Card><div className="divide-y divide-line">{q.data.map((n) => <Item key={n.id} n={n} />)}</div></Card>}
    </div>
  );
}

export interface HelpData { about: string; privacy: string; contact: string; updatedAt: string | null; complaintChannelUrl?: string | null }

export function HelpPage() {
  const q = useQuery({ queryKey: ['public', 'help'], queryFn: () => api.get<HelpData>('/public/ayuda') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const block = (title: string, text: string) => <Card title={title}>{text ? <p className="text-sm whitespace-pre-line">{text}</p> : <p className="text-sm text-muted">Pendiente de publicación.</p>}</Card>;
  return (
    <div className="space-y-4">
      <PageTitle title="Ayuda" subtitle={q.data.updatedAt ? `Actualizado el ${fmtDate(q.data.updatedAt)}` : undefined} />
      {block('Acerca de Kindra', q.data.about)}
      {block('Aviso de privacidad', q.data.privacy)}
      {block('Contacto y soporte', q.data.contact)}
      <p className="text-sm"><Link className="underline text-primary" to="/solicitar-informacion">Solicitar información</Link>{' · '}<Link className="underline text-primary" to="/solicitar-informacion?asunto=Queja%20o%20sugerencia">Enviar una queja o sugerencia</Link>{q.data.complaintChannelUrl && <> · <a className="underline text-primary" href={q.data.complaintChannelUrl} target="_blank" rel="noreferrer">Canal de denuncias</a></>}</p>
    </div>
  );
}

/** Contacto de soporte publicado por la administración. */
export function SupportContact() {
  const q = useQuery({ queryKey: ['public', 'help'], queryFn: () => api.get<HelpData>('/public/ayuda') });
  return <>{q.data?.contact || 'Pendiente de publicación'}</>;
}
