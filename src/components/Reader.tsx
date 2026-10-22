'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Archive, Clock, Inbox, Trash2, Settings2, PanelRight, X, ExternalLink, Highlighter, Check, Download, BookOpen } from 'lucide-react';
import type { Document as ReadingDocument, Highlight, Preferences, Folder } from '@/domain';
import './reader.css';
import Listen from './Listen';
import FindInDocument from './FindInDocument';
import {shortcutAction} from '@/keyboard';

type Props = {
  document: ReadingDocument; highlights: Highlight[]; preferences: Preferences;
  onClose:()=>void; onCommand:(command:Record<string,unknown>)=>Promise<unknown>;
  onPrevious?:()=>void; onNext?:()=>void;
  onPreferences:(patch:Partial<Preferences>)=>Promise<void>;
};
export default function Reader({document:doc,highlights,preferences,onClose,onCommand,onPreferences,onPrevious,onNext}:Props) {
  const content=useRef<HTMLDivElement>(null);
  const scroller=useRef<HTMLDivElement>(null);
  const latest=useRef(doc);
  const progressTimer=useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panel,setPanel]=useState<'info'|'notebook'|null>(preferences.readerPanel==='hidden'?null:preferences.readerPanel??'notebook');
  const [linkStatus,setLinkStatus]=useState('');
  const [showVideo,setShowVideo]=useState(false);
  const [appearance,setAppearance]=useState(false);
  const resetting=useRef(false);
  const [metadata,setMetadata]=useState({title:doc.title,author:doc.author,siteName:doc.siteName,excerpt:doc.excerpt});
  useEffect(()=>setMetadata({title:doc.title,author:doc.author,siteName:doc.siteName,excerpt:doc.excerpt}),[doc.id,doc.title,doc.author,doc.siteName,doc.excerpt]);
  const [note,setNote]=useState(doc.note);
  const [tags,setTags]=useState(doc.tags.join(', '));
  const [quote,setQuote]=useState<{start:number;end:number;quote:string}|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [outline,setOutline]=useState<{id:string;text:string}[]>([]);
  latest.current=doc;
  useEffect(()=>{setNote(doc.note);setTags(doc.tags.join(', '));},[doc.id,doc.note,doc.tags.join(',')]);
  useEffect(()=>{
    const root=content.current;
    if(!root) return;
    root.innerHTML=doc.html;
    const headings=Array.from(root.querySelectorAll('h1,h2,h3')).map((h,i)=>{if(!h.id)h.id=`section-${i}`;return {id:h.id,text:h.textContent??''};});
    setOutline(headings);
    const walker=window.document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let offset=0;
    const nodes:{node:Text;start:number;end:number}[]=[];
    while(walker.nextNode()) {const node=walker.currentNode as Text;nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;}
    for(const {node,start,end} of nodes) {
      const ranges=highlights.filter(h=>h.start<end&&h.end>start).map(h=>[Math.max(0,h.start-start),Math.min(end-start,h.end-start)]).sort((a,b)=>a[0]-b[0]);
      if(!ranges.length) continue;
      const cuts=[0,...ranges.flat(),node.length].sort((a,b)=>a-b).filter((n,i,a)=>i===0||n!==a[i-1]);
      const fragment=window.document.createDocumentFragment();
      for(let i=0;i<cuts.length-1;i++) {
        const text=node.data.slice(cuts[i],cuts[i+1]);
        if(ranges.some(([s,e])=>cuts[i]>=s&&cuts[i+1]<=e)) {const mark=window.document.createElement('mark');mark.textContent=text;fragment.append(mark);}
        else fragment.append(window.document.createTextNode(text));
      }
      node.replaceWith(fragment);
    }
  },[doc.id,doc.html,highlights]);
  useEffect(()=>{
    const timer=setTimeout(()=>{const el=scroller.current;if(el)el.scrollTop=(el.scrollHeight-el.clientHeight)*doc.progress;},100);
    return ()=>{clearTimeout(timer);if(progressTimer.current)clearTimeout(progressTimer.current);};
  },[doc.id]);
  useEffect(()=>{
    function key(event:KeyboardEvent) {
      if(event.key==='Escape') {if(appearance)setAppearance(false);else if(quote)setQuote(null);else onClose();return;}
      if(pending||appearance)return;
      const action=shortcutAction(event,preferences.shortcuts);
      if(action==='next'&&onNext){event.preventDefault();onNext();}
      if(action==='previous'&&onPrevious){event.preventDefault();onPrevious();}
      if(action==='notebook'){event.preventDefault();setPanel(current=>current?null:'notebook');}
      if(action==='archive'||action==='later') {event.preventDefault();void move(action==='archive'?'archive':'later',action==='archive').catch(()=>{});}
    }
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  });
  async function command(input:Record<string,unknown>) {
    setPending(true);setError('');
    try{return await onCommand(input);}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');throw e;}finally{setPending(false);}
  }
  async function move(folder:Folder,returnToList=false) {
    const next=onNext;
    await command({action:'document',id:doc.id,revision:latest.current.revision,folder});
    if(preferences.autoAdvance){if(next)next();else onClose();}
    else if(returnToList)onClose();
  }
  function selectedText() {
    const selection=window.getSelection();const root=content.current;
    if(!selection||selection.isCollapsed||!selection.rangeCount||!root){setQuote(null);return;}
    const range=selection.getRangeAt(0);
    if(!root.contains(range.startContainer)||!root.contains(range.endContainer)){setQuote(null);return;}
    const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
    const start=before.toString().length;const text=range.toString();
    if(text.trim()&&text.length<=10000)setQuote({start,end:start+text.length,quote:text});
  }
  function progress() {
    if(resetting.current)return;
    if(progressTimer.current)clearTimeout(progressTimer.current);
    progressTimer.current=setTimeout(()=>{
      const el=scroller.current;if(!el||el.scrollHeight<=el.clientHeight)return;
      const value=Math.min(1,el.scrollTop/(el.scrollHeight-el.clientHeight));
      if(value>latest.current.progress+.03)onCommand({action:'document',id:latest.current.id,revision:latest.current.revision,progress:value}).catch(()=>{});
    },1200);
  }
  async function resetProgress() {
    resetting.current=true;
    if(progressTimer.current)clearTimeout(progressTimer.current);
    try {await command({action:'reset-progress',id:doc.id,revision:latest.current.revision});scroller.current?.scrollTo({top:0,behavior:'instant'});}
    finally {resetting.current=false;}
  }
  function exportNotes() {
    const text=[`# ${doc.title}`,doc.author,doc.url,doc.tags.length?`Document tags: ${doc.tags.join(', ')}`:'',doc.note,...highlights.map(h=>[`> ${h.quote.replace(/\n/g,'\n> ')}`,h.note,h.tags?.length?`Highlight tags: ${h.tags.join(', ')}`:''].filter(Boolean).join('\n\n'))].filter(Boolean).join('\n\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));const a=window.document.createElement('a');a.href=url;a.download='margin-notes.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className={`reader-view ${panel?'with-notebook':''}`} aria-label="Document reader">
    <header className="reader-toolbar">
      <button className="icon-button" onClick={onClose} aria-label="Back to library" title="Back to library (Esc)"><ArrowLeft size={20}/></button>
      <button disabled={!onPrevious||pending} onClick={onPrevious} aria-label="Previous document">Previous</button><button disabled={!onNext||pending} onClick={onNext} aria-label="Next document">Next</button><span className="reader-toolbar-title">{doc.title}</span>
      <div className="reader-tools">
        <button className="icon-button" onClick={()=>setAppearance(!appearance)} aria-label="Reading appearance" aria-expanded={appearance}><Settings2 size={18}/></button>
        <button onClick={()=>{const url=`${location.origin}/read/${encodeURIComponent(doc.id)}`;void navigator.clipboard.writeText(url).then(()=>setLinkStatus('Private link copied. Sign-in is required.')).catch(()=>setLinkStatus('Could not copy. Copy the address from your browser.'));}}>Copy link</button><button onClick={()=>window.print()} aria-label="Print article with annotations">Print</button><span className="tool-divider"/>
        {([['inbox',Inbox,'Move to Inbox'],['later',Clock,'Move to Later'],['shortlist',BookOpen,'Move to Shortlist'],['archive',Archive,'Archive']] as const).map(([folder,Icon,label])=><button key={folder} className={`icon-button ${doc.folder===folder?'active':''}`} title={label} aria-label={label} disabled={pending} onClick={()=>void move(folder).catch(()=>{})}><Icon size={18}/></button>)}
        <button className="icon-button" title="Move to Trash" aria-label="Move to Trash" disabled={pending} onClick={()=>void move('trash',true).catch(()=>{})}><Trash2 size={18}/></button>
        <button className="icon-button" aria-label="Toggle notebook" aria-expanded={!!panel} onClick={()=>setPanel(panel?null:'notebook')}><PanelRight size={19}/></button>
      </div>
    </header>
    {linkStatus&&<div role="status" className="reader-link-status">{linkStatus}<button aria-label="Dismiss link message" onClick={()=>setLinkStatus('')}>×</button></div>}
    {appearance&&<div className="reader-appearance" role="region" aria-label="Reading appearance settings">
      <div className="appearance-heading"><strong>Make yourself comfortable</strong><button className="icon-button" aria-label="Close appearance" onClick={()=>setAppearance(false)}><X size={16}/></button></div>
      <label>Theme<select value={preferences.theme} onChange={e=>void onPreferences({theme:e.target.value as Preferences['theme']}).catch(()=>{})}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
      <label>Typeface<select value={preferences.font} onChange={e=>void onPreferences({font:e.target.value as Preferences['font']}).catch(()=>{})}><option value="serif">Literary serif</option><option value="sans">Clean sans serif</option></select></label>
      <label>Text size <span>{preferences.fontSize}px</span><input aria-label="Reader font size" type="range" min="14" max="30" value={preferences.fontSize} onChange={e=>void onPreferences({fontSize:Number(e.target.value)}).catch(()=>{})}/></label>
      <label>Reading width<select value={preferences.width} onChange={e=>void onPreferences({width:e.target.value as Preferences['width']}).catch(()=>{})}><option value="narrow">Narrow</option><option value="medium">Medium</option><option value="wide">Wide</option></select></label>
    </div>}
    <aside className="reader-outline"><button className="reader-back" onClick={onClose}><ArrowLeft size={15}/>Library</button><h2>Contents</h2>{outline.length?outline.map(h=><button key={h.id} onClick={()=>window.document.getElementById(h.id)?.scrollIntoView({behavior:'smooth',block:'start'})}>{h.text}</button>):<p>A little room to focus.</p>}<div className="reader-progress"><BookOpen size={16}/><span>{Math.round(doc.progress*100)}% read</span></div></aside>
    <div className="reader-scroll" ref={scroller} onScroll={progress}>
      <article className={`reading-page measure-${preferences.width} font-${preferences.font}`} style={{fontSize:preferences.fontSize}}>
        <div className="article-source">{doc.category==='pdf'&&doc.attachmentId&&<a href={`/api/files/${doc.attachmentId}?view=true`} target="_blank" rel="noreferrer">View original pages</a>}{doc.attachmentId&&<a href={`/api/files/${doc.attachmentId}`}>Download original {doc.category?.toUpperCase()}</a>}{doc.url?<a href={doc.url} target="_blank" rel="noreferrer">{doc.siteName||new URL(doc.url).hostname}<ExternalLink size={12}/></a>:<span>{doc.siteName||'Personal note'}</span>}</div>
        <h1>{doc.title}</h1>
        <p className="article-byline">{doc.author&&<span>{doc.author}</span>}<span>{Math.max(1,Math.ceil(doc.wordCount/230))} min read</span></p>
        {doc.category==='video'&&<section className="video-source"><p>Publisher-provided video description. A transcript has not been generated.</p>{doc.youtubeVideoId&&/^[a-zA-Z0-9_-]{11}$/.test(doc.youtubeVideoId)&&(showVideo?<iframe title={`Watch ${doc.title}`} src={`https://www.youtube-nocookie.com/embed/${doc.youtubeVideoId}`} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button onClick={()=>setShowVideo(true)}>Load YouTube video</button>)}</section>}<div className="episode-audio">{doc.audioUrl&&<><audio controls preload="none" src={doc.audioUrl} aria-label={`Play ${doc.title}`}/><p>Episode audio and publisher-provided show notes. A transcript has not been generated.</p></>}</div><FindInDocument text={doc.text} root={content}/><Listen text={doc.text}/><div className="article-body" ref={content} onClick={event=>{
          const anchor=(event.target as Element).closest('a');
          const href=anchor?.getAttribute('href');
          if(!href||!/^#epub-[a-f0-9]{64}$/.test(href))return;
          event.preventDefault();
          content.current?.querySelector(href)?.scrollIntoView({behavior:'smooth',block:'start'});
        }} onMouseUp={selectedText} onTouchEnd={()=>setTimeout(selectedText,50)} onKeyUp={selectedText}/>
        <section className="print-annotations"><h2>Notes and highlights</h2>{doc.note&&<p>{doc.note}</p>}{highlights.map(h=><div key={h.id}><blockquote>{h.quote}</blockquote>{h.note&&<p>{h.note}</p>}{!!h.tags?.length&&<p>Tags: {h.tags.join(', ')}</p>}</div>)}{!doc.note&&!highlights.length&&<p>No annotations.</p>}</section><footer className="article-end"><span>You’ve reached the end.</span><button disabled={pending} onClick={()=>void command({action:'document',id:doc.id,revision:latest.current.revision,progress:1}).catch(()=>{})}><Check size={16}/>Mark as read</button><button disabled={pending} onClick={()=>void move('archive',true).catch(()=>{})}><Archive size={16}/>{preferences.autoAdvance?'Archive & next':'Archive & return'}</button></footer>
      </article>
    </div>
    {quote&&<div className="highlight-action"><button disabled={pending} onMouseDown={e=>e.preventDefault()} onClick={()=>void command({action:'highlight',id:crypto.randomUUID(),documentId:doc.id,...quote,note:''}).then(()=>{setQuote(null);window.getSelection()?.removeAllRanges();setPanel('notebook');}).catch(()=>{})}><Highlighter size={17}/>Highlight selection</button><button className="icon-button" aria-label="Cancel selection" onClick={()=>setQuote(null)}><X size={16}/></button></div>}
    {panel&&<aside className="reader-notebook">
      <div className="notebook-tabs"><button className={panel==='info'?'active':''} onClick={()=>setPanel('info')}>Info</button><button className={panel==='notebook'?'active':''} onClick={()=>setPanel('notebook')}>Notebook <span>{highlights.length}</span></button><button className="icon-button notebook-close" aria-label="Close notebook" onClick={()=>setPanel(null)}><X size={16}/></button></div>
      {panel==='info'?<div className="notebook-content"><h2>About this document</h2><form onSubmit={e=>{e.preventDefault();void command({action:'document',id:doc.id,revision:latest.current.revision,...metadata}).catch(()=>{});}}>{(['title','author','siteName','excerpt'] as const).map(key=><label key={key}>{({title:'Title',author:'Author',siteName:'Source name',excerpt:'Summary'})[key]}{key==='excerpt'?<textarea rows={4} maxLength={5000} value={metadata[key]} onChange={e=>setMetadata({...metadata,[key]:e.target.value})}/>:<input required={key==='title'} maxLength={500} value={metadata[key]} onChange={e=>setMetadata({...metadata,[key]:e.target.value})}/>}</label>)}<button disabled={pending||!metadata.title.trim()}>Save metadata</button></form><dl><dt>Source</dt><dd>{doc.siteName||'Personal note'}</dd><dt>Length</dt><dd>{doc.wordCount.toLocaleString()} words</dd><dt>Saved</dt><dd>{new Date(doc.createdAt).toLocaleDateString()}</dd><dt>Location</dt><dd>{doc.folder}</dd></dl><button disabled={pending} onClick={()=>void resetProgress().catch(()=>{})}>Start reading again</button><label htmlFor="document-tags">Tags</label><input id="document-tags" value={tags} onChange={e=>setTags(e.target.value)} placeholder="ideas, design, weekend"/><button disabled={pending||tags===doc.tags.join(', ')} onClick={()=>void command({action:'document',id:doc.id,revision:latest.current.revision,tags:[...new Set(tags.split(',').map(t=>t.trim()).filter(Boolean))]}).catch(()=>{})}>Save tags</button></div>:<div className="notebook-content"><label htmlFor="document-note">Document note</label><textarea id="document-note" rows={5} placeholder="What would you like to remember?" value={note} onChange={e=>setNote(e.target.value)}/><button className="save-note" disabled={pending||note===doc.note} onClick={()=>void command({action:'document',id:doc.id,revision:latest.current.revision,note}).catch(()=>{})}>Save note</button><h2>Highlights</h2>{highlights.length===0?<div className="highlights-empty"><Highlighter size={25}/><p>Select a passage in the article to save your first highlight.</p></div>:highlights.map(h=><HighlightNote key={h.id} highlight={h} pending={pending} onSave={(note,tags,revision)=>command({action:'highlight-note',id:h.id,note,tags,revision})} onRemove={revision=>command({action:'highlight-remove',id:h.id,revision})}/>)}<button className="export-notes" onClick={exportNotes}><Download size={15}/>Export notes</button></div>}
      {error&&<p className="reader-error" role="alert">{error}</p>}
    </aside>}
  </section>;
}
function HighlightNote({highlight,pending,onSave,onRemove}:{highlight:Highlight;pending:boolean;onSave:(note:string,tags:string[],revision:number)=>Promise<unknown>;onRemove:(revision:number)=>Promise<unknown>}) {
  const [note,setNote]=useState(highlight.note);
  const [tags,setTags]=useState((highlight.tags??[]).join(', '));
  const [revision,setRevision]=useState(highlight.revision??0);
  const stale=revision!==(highlight.revision??0);
  return <div className="highlight-note"><blockquote>{highlight.quote}</blockquote><textarea aria-label="Highlight note" value={note} rows={2} onChange={e=>setNote(e.target.value)} placeholder="Add a thought…"/><label>Highlight tags<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="concept, follow-up"/></label>{stale&&<div role="alert"><p>This highlight changed elsewhere. Your draft is still above. Copy it before loading the current values.</p><button onClick={()=>{setNote(highlight.note);setTags((highlight.tags??[]).join(', '));setRevision(highlight.revision??0);}}>Load current values</button></div>}<div><button disabled={pending||stale||(note===highlight.note&&tags===(highlight.tags??[]).join(', '))} onClick={()=>void onSave(note,[...new Set(tags.split(',').map(t=>t.trim()).filter(Boolean))],revision).then(result=>setRevision((result as Highlight).revision??revision+1)).catch(()=>{})}>Save</button><button className="icon-button" disabled={pending||stale} aria-label="Remove highlight" onClick={()=>void onRemove(revision).catch(()=>{})}><Trash2 size={14}/></button></div></div>;
}
