import argon2 from 'argon2';
import type {Request} from 'express';
import {ensure,pool,sha} from './core.js';

export async function confirmPassword(req:Request,password:string) {
 const actor=req.access!.userId;
 const key=sha('sensitive-action:'+actor);
 const attempt=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1)
  ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[key]);
 ensure(attempt.rows[0].attempts<=8,429,'Muitas tentativas de confirmação. Aguarde alguns minutos.');
 const user=await pool.query('SELECT password_hash FROM users WHERE id=$1',[actor]);
 ensure(user.rowCount&&await argon2.verify(user.rows[0].password_hash,password),403,'Senha atual incorreta.');
}
