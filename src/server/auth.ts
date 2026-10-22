import { createHash, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
export type Query = (sql:string, params?:unknown[])=>Promise<Record<string,any>[]>;
export type Database = { query:Query; transaction:<T>(fn:(query:Query)=>Promise<T>)=>Promise<T>; close:()=>Promise<void> };
export function fail(message:string,status=400):never { throw Object.assign(new Error(message),{status}); }
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function equal(a:string,b:string) { return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b))); }
export function auth(database:()=>Promise<Database>) {
  async function attempt(key:string) {
    const db=await database();
    const [row]=await db.query(`INSERT INTO attempts (key,count,started) VALUES ($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.started<$2-900000 THEN 1 ELSE attempts.count+1 END, started=CASE WHEN attempts.started<$2-900000 THEN $2 ELSE attempts.started END RETURNING count`,[key,Date.now()]);
    if(Number(row.count)>10) fail('Too many attempts. Try again in 15 minutes.',429);
  }
  return {
    async hasAccount() { return (await (await database()).query('SELECT id FROM accounts LIMIT 1')).length>0; },
    async createAccount(username:string,password:string,setupCode:string) {
      await attempt('setup');
      const secret=process.env.SETUP_SECRET;
      if(!secret || !equal(setupCode,secret)) fail('Invalid setup code',401);
      username=username.trim().toLowerCase();
      if(username.length<3 || username.length>100 || password.length<12 || password.length>1024) fail('Use a username of 3–100 characters and a password of 12–1024 characters.');
      const salt=randomBytes(16).toString('hex');
      const passwordHash=scryptSync(password,salt,64).toString('hex');
      const id=randomUUID();
      const rows=await (await database()).query('INSERT INTO accounts (id,username,salt,password_hash,singleton) VALUES ($1,$2,$3,$4,1) ON CONFLICT DO NOTHING RETURNING id',[id,username,salt,passwordHash]);
      if(!rows.length) fail('An account already exists',409);
      return id;
    },
    async login(username:string,password:string) {
      await attempt('login');
      if(password.length>1024) fail('Invalid credentials',401);
      const db=await database();
      const [account]=await db.query('SELECT * FROM accounts WHERE username=$1',[username.trim().toLowerCase()]);
      const candidate=scryptSync(password,account?.salt ?? 'missing-account-salt',64).toString('hex');
      if(!account || !equal(candidate,account.password_hash)) fail('Invalid credentials',401);
      const token=randomBytes(32).toString('base64url');
      await db.query('INSERT INTO tokens (hash,user_id,kind,expires) VALUES ($1,$2,$3,$4)',[hash(token),account.id,'session',Date.now()+30*86400000]);
      return token;
    },
    async authenticate(token:string,kind:'session'|'capture'|'library-read'):Promise<string|null> {
      if(!token || token.length>200) return null;
      const [row]=await (await database()).query('SELECT user_id FROM tokens WHERE hash=$1 AND kind=$2 AND expires>$3',[hash(token),kind,Date.now()]);
      return row?.user_id ?? null;
    },
    async createCaptureToken(userId:string) {
      const token=randomBytes(32).toString('base64url');
      await (await database()).query('INSERT INTO tokens (hash,user_id,kind,expires) VALUES ($1,$2,$3,$4)',[hash(token),userId,'capture',Date.now()+365*86400000]);
      return token;
    },
    async revokeCaptureTokens(userId:string) { await (await database()).query("DELETE FROM tokens WHERE user_id=$1 AND kind='capture'",[userId]); },
    async createLibraryToken(userId:string) {
      const token=randomBytes(32).toString('base64url');
      await (await database()).query('INSERT INTO tokens (hash,user_id,kind,expires) VALUES ($1,$2,$3,$4)',[hash(token),userId,'library-read',Date.now()+365*86400000]);
      return token;
    },
    async revokeLibraryTokens(userId:string) { await (await database()).query("DELETE FROM tokens WHERE user_id=$1 AND kind='library-read'",[userId]); },
    async logout(token:string) { await (await database()).query("DELETE FROM tokens WHERE hash=$1 AND kind='session'",[hash(token)]); },
  };
}
