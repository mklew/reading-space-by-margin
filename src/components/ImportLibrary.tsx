'use client';
import { useState } from 'react';
type Source={url:string;title?:string;tags?:string[];folder?:string;progress?:number;createdAt?:string};
type Report={attachments?:number;entries?:number;hasPreferences?:boolean;views?:number;documents:number;feeds:number;sources?:number;duplicates?:number;highlights?:number;warnings:string[];pendingSources?:Source[]};
export default function ImportLibrary({onImported,preferencesRevision}:{preferencesRevision:number;onImported:()=>Promise<void>}) {
  const [restorePreferences,setRestorePreferences]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const [captureStatus,setCaptureStatus]=useState('');
  const [failures,setFailures]=useState<{source:Source;error:string}[]>([]);
  async function upload(apply:boolean) {
    if(!file)return;
    setBusy(true);setError('');
    try {
      if(file.size>20*1024*1024)throw new Error('Choose a file smaller than 20 MB.');
      const response=await fetch(`/api/import?filename=${encodeURIComponent(file.name)}&apply=${apply}&preferences=${restorePreferences}&revision=${preferencesRevision}`,{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream'}});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Import failed.');
      setReport(result);setDone(apply);setFailures([]);setCaptureStatus('');
      if(apply)await onImported();
    } catch(e) {setError(e instanceof Error?e.message:'Import failed.');}
    finally {setBusy(false);}
  }
  async function captureSources(sources:Source[]) {
    setBusy(true);setError('');
    const failed:{source:Source;error:string}[]=[];
    let saved=0,duplicates=0;
    for(let index=0;index<sources.length;index++) {
      const source=sources[index];
      setCaptureStatus(`Capturing ${index+1} of ${sources.length}…`);
      try {
        const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...source,action:'import-source'})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'Capture failed.');
        saved+=result.documents;duplicates+=result.duplicates;
      } catch(e) {failed.push({source,error:e instanceof Error?e.message:'Capture failed.'});}
    }
    setFailures(failed);setReport(previous=>previous?{...previous,pendingSources:[]}:previous);
    setCaptureStatus(`Captured ${saved} articles; skipped ${duplicates} existing items; ${failed.length} failed.`);
    try {await onImported();}catch {setError('Capture finished, but the library could not refresh. Reload to see saved articles.');}
    setBusy(false);
  }
  return <section className="settings-section"><h2>Import your reading</h2><p>Choose a Margin archive, JSON, CSV, OPML, bookmarks HTML, or text file. Preview the contents before adding them. Maximum 20 MB.</p><input aria-label="Import file" type="file" disabled={busy} accept=".zip,.json,.csv,.opml,.xml,.html,.htm,.txt,.md" onChange={e=>{setFile(e.target.files?.[0]??null);setReport(null);setDone(false);setError('');setFailures([]);setCaptureStatus('');}}/><label><input type="checkbox" checked={restorePreferences} disabled={busy} onChange={e=>setRestorePreferences(e.target.checked)}/> Restore reading preferences from this backup</label><div className="button-row"><button disabled={!file||busy} onClick={()=>void upload(false)}>{busy?'Processing…':'Preview import'}</button>{report&&!done&&<button disabled={busy||(!report.documents&&!report.feeds&&!report.sources&&!report.views&&!report.entries&&!(restorePreferences&&report.hasPreferences))} onClick={()=>void upload(true)}>Import documents and feeds</button>}</div>{done&&!!report?.pendingSources?.length&&<button disabled={busy} onClick={()=>void captureSources(report.pendingSources!)}>Capture {report.pendingSources.length} imported links</button>}{captureStatus&&<p role="status">{captureStatus}</p>}{failures.length>0&&<><button disabled={busy} onClick={()=>void captureSources(failures.map(f=>f.source))}>Retry failed links</button><ul>{failures.map((failure,index)=><li key={index}>{failure.source.url}: {failure.error}</li>)}</ul></>}{error&&<p role="alert">{error}</p>}{report&&<div role="status"><p>{done?'Imported':'Found'} {report.documents} documents and {report.feeds} feed subscriptions, plus {report.views??0} saved views, {report.entries??0} feed entries, and {report.attachments??0} original files.{report.duplicates!==undefined&&` Skipped ${report.duplicates} existing items.`}</p>{!!report.sources&&<p>{report.sources} URL-only items need article capture. After importing, capture these links to retrieve their article text.</p>}{report.warnings.length>0&&<details><summary>{report.warnings.length} import notices</summary><ul>{report.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}</div>}</section>;
}
