type Invoke = <T>(cmd:string,args?:Record<string,unknown>)=>Promise<T>;
const bridge = (window as unknown as { __TAURI__?: {core:{invoke:Invoke}} }).__TAURI__;
export const native = bridge?.core;
export const apiBase = (native ? 'http://127.0.0.1:18790/api' : import.meta.env.VITE_WEB_API_BASE || '/api').replace(/\/$/,'');

export async function storeFile(blob:Blob,filename:string) {
  if (native) {
    const data = await new Promise<string>((resolve,reject) => {
      const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob);
    });
    return native.invoke<string>('save_result',{ filename, encoded:data });
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  return '';
}
