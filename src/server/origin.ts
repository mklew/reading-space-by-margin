/** Browsers send the public Host even when Next binds to 0.0.0.0 internally. */
export function assertSameOrigin(request:Request,configuredOrigin?:string) {
  const origin=request.headers.get('origin');
  let expected:string;
  try {
    if(configuredOrigin) {
      const configured=new URL(configuredOrigin);
      if(!['http:','https:'].includes(configured.protocol)||configured.username||configured.password||configured.pathname!=='/'||configured.search||configured.hash)throw new Error();
      expected=configured.origin;
    } else {
      const url=new URL(request.url),host=request.headers.get('host');
      if(!host||/[\s/@\\]/.test(host))throw new Error();
      expected=new URL(`${url.protocol}//${host}`).origin;
    }
  } catch {throw Object.assign(new Error('The application origin is not configured correctly.'),{status:503});}
  if(!origin||origin!==expected)throw Object.assign(new Error('This action must come from this app.'),{status:403});
}
