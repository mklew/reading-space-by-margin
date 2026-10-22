'use client';
import {useState,type RefObject} from 'react';
export default function FindInDocument({text,root}:{text:string;root:RefObject<HTMLDivElement|null>}) {
 const [query,setQuery]=useState(''),[index,setIndex]=useState(-1);
 const matches:number[]=[];
 if(query){
  const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const expression=new RegExp(escaped,'gi');
  for(const match of text.matchAll(expression)){matches.push(match.index);if(matches.length===1000)break;}
 }
 function jump(next:number){
  if(!matches.length||!root.current)return;
  const chosen=(next+matches.length)%matches.length;setIndex(chosen);
  const start=matches[chosen],end=start+query.length;
  const walker=document.createTreeWalker(root.current,NodeFilter.SHOW_TEXT);
  const range=document.createRange();let offset=0,started=false,finished=false;
  while(walker.nextNode()){
   const node=walker.currentNode as Text;
   if(!started&&start<offset+node.length){range.setStart(node,start-offset);started=true;}
   if(started&&end<=offset+node.length){range.setEnd(node,end-offset);finished=true;break;}
   offset+=node.length;
  }
  if(!finished)return;
  const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
  const element=range.startContainer.parentElement;element?.scrollIntoView({block:'center'});
 }
 return <details className="find-controls"><summary>Find in document</summary><form onSubmit={e=>{e.preventDefault();jump(index+1);}}><input aria-label="Find in article" value={query} maxLength={200} onChange={e=>{setQuery(e.target.value);setIndex(-1);}}/><button disabled={!matches.length}>Next match</button><button type="button" disabled={!matches.length} onClick={()=>jump(index<0?matches.length-1:index-1)}>Previous match</button></form><span role="status">{query?`${index<0?0:index+1} of ${matches.length}${matches.length===1000?'+':''} matches`:'Enter text to search this article.'}</span></details>;
}
