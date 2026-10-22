/** Bound bytes actually received, including requests without Content-Length. */
export async function readBodyBytes(request: Request, limit = 600000): Promise<Uint8Array> {
  const oversized = () => Object.assign(new Error('The request is too large.'), {status:413});
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > limit) throw oversized();
  const reader = request.body?.getReader();
  if (!reader) throw new Error('A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw oversized(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readJsonBody(request: Request, limit = 600000): Promise<unknown> {
  const bytes = await readBodyBytes(request,limit);
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new Error('Supply a valid UTF-8 JSON request body.'); }
}
