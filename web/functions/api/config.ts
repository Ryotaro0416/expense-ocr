import { Env, json } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  return json({ sa_email: ctx.env.SA_EMAIL });
};
