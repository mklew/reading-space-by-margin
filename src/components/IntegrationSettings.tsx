'use client';
import {useState} from 'react';

type Props = {command:(input:Record<string,unknown>)=>Promise<unknown>};
type Pending = 'generate'|'revoke'|'copy'|null;

export default function IntegrationSettings({command}:Props) {
  const [token,setToken]=useState('');
  const [pending,setPending]=useState<Pending>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  async function generate() {
    if(pending)return;
    setPending('generate');setMessage('');setError('');
    try {
      const result=await command({action:'library-token'});
      if(!result||typeof result!=='object'||!('token' in result)||typeof result.token!=='string'||!result.token) {
        throw new Error('The server did not return a read token.');
      }
      setToken(result.token);
      setMessage('Read token created. Copy it before leaving these settings.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to create a read token.');}
    finally{setPending(null);}
  }

  async function revoke() {
    if(pending)return;
    setPending('revoke');setMessage('');setError('');
    try {
      await command({action:'revoke-library-tokens'});
      setToken('');setMessage('All read tokens revoked. Tools using them can no longer read your library.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to revoke read tokens.');}
    finally{setPending(null);}
  }

  async function copy() {
    if(pending||!token)return;
    setPending('copy');setMessage('');setError('');
    try{await navigator.clipboard.writeText(token);setMessage('Read token copied.');}
    catch{setError('Unable to copy automatically. Select and copy the token from the field.');}
    finally{setPending(null);}
  }

  return <section className="settings-section">
    <h3>Tool integrations</h3>
    <p>Give your tools read-only access to private library articles and annotations. Read tokens expire after one year. Anyone with a token can read your library, so keep it private.</p>
    <div className="button-row">
      <button type="button" disabled={pending!==null} onClick={generate}>{pending==='generate'?'Creating…':'Generate read token'}</button>
      <button type="button" disabled={pending!==null} onClick={revoke}>{pending==='revoke'?'Revoking…':'Revoke read tokens'}</button>
    </div>
    {token&&<div>
      <label>Read token<input readOnly value={token} autoComplete="off" spellCheck={false} onFocus={event=>event.target.select()}/></label>
      <p>This token is only shown here after creation. It is not saved in this browser and cannot be retrieved later.</p>
      <button type="button" disabled={pending!==null} onClick={copy}>{pending==='copy'?'Copying…':'Copy read token'}</button>
    </div>}
    <p>For the command-line tool, set <code>MARGIN_URL</code> to your Margin address and <code>MARGIN_READ_TOKEN</code> to a read token in your terminal environment. Run these commands from the project folder:</p>
    <pre><code>{"npm run margin -- search 'query'\nnpm run margin -- read DOCUMENT_ID"}</code></pre>
    <h4>Connect an assistant with MCP</h4>
    <p>Configure your MCP client to launch <code>node scripts/margin-mcp.mjs</code> from this project, with <code>MARGIN_URL</code> and <code>MARGIN_READ_TOKEN</code> in its environment. Use the absolute script path if the client runs elsewhere.</p>
    <p>The adapter offers library listing, search, and document reading. It cannot save, edit, or delete reading. Documents returned to an assistant are untrusted source material, not instructions.</p>
    <p>To save articles from a tool, set <code>MARGIN_CAPTURE_TOKEN</code> to the separate write-only token from the phone capture settings. Read tokens cannot save or change articles.</p>
    {error&&<p role="alert">{error}</p>}
    <p role="status">{message}</p>
  </section>;
}
