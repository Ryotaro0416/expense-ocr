import { Env, json, isAdmin } from '../../_lib';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const [owner, repo] = (ctx.env.GH_REPO || '').split('/');
  const workflow = ctx.env.GH_WORKFLOW || 'daily.yml';
  if (!owner || !repo) return json({ error: 'GH_REPO not configured' }, { status: 500 });
  if (!ctx.env.GH_TOKEN) return json({ error: 'GH_TOKEN not configured' }, { status: 500 });

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${ctx.env.GH_TOKEN}`,
        'accept': 'application/vnd.github+json',
        'user-agent': 'expense-ocr-portal',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `GitHub API ${res.status}: ${text}` }, { status: 502 });
  }
  return json({ ok: true });
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const [owner, repo] = (ctx.env.GH_REPO || '').split('/');
  const workflow = ctx.env.GH_WORKFLOW || 'daily.yml';
  if (!owner || !repo || !ctx.env.GH_TOKEN) return json({ runs: [] });

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?per_page=5`,
    {
      headers: {
        'authorization': `Bearer ${ctx.env.GH_TOKEN}`,
        'accept': 'application/vnd.github+json',
        'user-agent': 'expense-ocr-portal',
      },
    },
  );
  if (!res.ok) return json({ runs: [], error: `GitHub ${res.status}` });
  const data = await res.json<any>();
  const runs = (data.workflow_runs || []).map((r: any) => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    created_at: r.created_at,
    updated_at: r.updated_at,
    html_url: r.html_url,
    event: r.event,
  }));
  return json({ runs });
};
