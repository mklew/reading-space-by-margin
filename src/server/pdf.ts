import {PDFParse} from 'pdf-parse';
import {JSDOM} from 'jsdom';
import type {Article} from './capture';

const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function parsePdf(bytes:Buffer,filename:string):Promise<Article & {category:'pdf'}> {
  if(bytes.length>4*1024*1024||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('Choose a PDF smaller than 4 MB.');
  const parser=new PDFParse({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true});
  try {
    const info=await parser.getInfo();
    if(info.total>500)throw new Error('PDFs with more than 500 pages are not supported yet.');
    const pages:{num:number;text:string}[]=[];
    let length=0;const started=Date.now();
    for(let num=1;num<=info.total;num++) {
      if(Date.now()-started>30000)throw new Error('PDF extraction took too long. Try a smaller document.');
      const result=await parser.getText({partial:[num]});
      const text=result.pages[0]?.text??'';length+=text.length;
      if(length>2000000)throw new Error('PDF extracted text exceeds 2 million characters.');
      pages.push({num,text});
    }
    const hasText=pages.some(page=>page.text.trim());
    const html=pages.map(page=>`<section><h2>Page ${page.num}</h2><p>${escape(page.text||'No selectable text on this page. Open the original PDF to view it.')}</p></section>`).join('\n');
    const dom=new JSDOM(html);
    const text=dom.window.document.body.textContent??'';dom.window.close();
    return {category:'pdf',title:String(info.info?.Title||filename.replace(/\.pdf$/i,'')),author:String(info.info?.Author||''),siteName:'PDF',url:'',html,text,excerpt:hasText?pages.map(p=>p.text).join(' ').replace(/\s+/g,' ').trim().slice(0,280):'Scanned PDF: view the original pages. Text recognition is not yet available.',wordCount:hasText?pages.map(p=>p.text).join(' ').trim().split(/\s+/).length:0};
  } finally {await parser.destroy();}
}
