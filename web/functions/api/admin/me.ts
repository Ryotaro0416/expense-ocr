import { Env, json, getRole } from '../../_lib';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const role = getRole(ctx.request, ctx.env);
  if (!role) return json({ error: 'unauthorized' }, { status: 401 });
  return json({ role });
};
