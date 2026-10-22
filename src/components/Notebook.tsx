'use client';
import {useState} from 'react';
import type {Library} from '@/domain';
export default function Notebook({library,onOpen}:{library:Library;onOpen:(id:string)=>void}) {
 const [query,setQuery]=useState(''),[tag,setTag]=useState('');
 const docs=new Map(library.documents.filter(d=>d.folder!=='trash').map(d=>[d.id,d]));
 const all=library.highlights.filter(h=>docs.has(h.documentId));
 const tags=[...new Set(all.flatMap(h=>h.tags??[]))].sort();
 const matches=(text:string)=>text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
 const highlights=all.filter(h=>(!tag||h.tags?.includes(tag))&&matches([h.quote,h.note,...h.tags??[],docs.get(h.documentId)!.title].join(' '))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const notes=[...docs.values()].filter(d=>!tag&&d.note&&matches(`${d.title} ${d.note}`));
 function download() {
  const text=['# Notebook',...notes.map(d=>`## ${d.title}\n\n${d.note}`),...highlights.map(h=>`## ${docs.get(h.documentId)!.title}\n\n> ${h.quote.replace(/\n/g,'\n> ')}\n\n${h.note}${h.tags?.length?`\n\nTags: ${h.tags.join(', ')}`:''}`)].join('\n\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='margin-notebook.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="settings-content"><div className="search-field"><input aria-label="Search notebook" placeholder="Search passages, notes, titles, or tags" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="list-toolbar"><select aria-label="Filter highlight tags" value={tag} onChange={e=>setTag(e.target.value)}><option value="">All annotation tags</option>{tags.map(t=><option key={t}>{t}</option>)}</select><button onClick={download} disabled={!highlights.length&&!notes.length}>Export shown notes</button></div><p>{highlights.length} highlights · {notes.length} document notes</p>{notes.map(d=><article className="settings-section" key={d.id}><button onClick={()=>onOpen(d.id)}>{d.title}</button><p style={{whiteSpace:'pre-wrap'}}>{d.note}</p></article>)}{highlights.map(h=><article className="settings-section" key={h.id}><button onClick={()=>onOpen(h.documentId)}>{docs.get(h.documentId)!.title}</button><blockquote>{h.quote}</blockquote>{h.note&&<p style={{whiteSpace:'pre-wrap'}}>{h.note}</p>}<div className="tag-list">{h.tags?.map(t=><button key={t} onClick={()=>setTag(t)}>{t}</button>)}</div></article>)}{!highlights.length&&!notes.length&&<p>No matching annotations. Highlight passages or write notes while reading to collect them here.</p>}</section>;
}
