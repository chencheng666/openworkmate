import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir,tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const desktop=join(root,'desktop');
const env={...process.env};
function run(cmd,args,opts={}) {
  const p=spawnSync(cmd,args,{cwd:root,env,stdio:'inherit',...opts});
  if(p.error || p.status!==0) throw new Error(cmd+' 未能完成：'+(p.error?.message || p.status));
}
if(process.platform!=='darwin') throw new Error('当前启动器仅验证了 macOS；其他平台可在 desktop 中使用 cargo build。');
const host=process.arch==='arm64'?'aarch64':'x86_64';
const toolchain=spawnSync('rustup',['which','--toolchain','stable-'+host+'-apple-darwin','cargo'],{encoding:'utf8'});
const cargo=toolchain.status===0?toolchain.stdout.trim():'cargo';
if(cargo!=='cargo') env.PATH=dirname(cargo)+':'+env.PATH;
const clt=spawnSync('xcode-select',['-p'],{encoding:'utf8'}).stdout.trim();
const cc=join(clt,'usr/bin/clang');
if(existsSync(cc)){env.CC=cc;env.PATH=dirname(cc)+':'+env.PATH;env['CARGO_TARGET_'+host.toUpperCase()+'_APPLE_DARWIN_LINKER']=cc;}
env.CARGO_HOME=env.CARGO_HOME || join(homedir(),'Library/Caches/openworkmate-cargo');
const args=[process.argv.includes('--test')?'test':'build','--locked','--manifest-path',join(desktop,'Cargo.toml')];
if(process.argv.includes('--offline'))args.push('--offline');
run('pnpm',['web:build']);
run(cargo,args,{cwd:tmpdir()});
if(args[0]==='test')process.exit(0);
const app=join(root,'outputs','desktop','OpenWorkMate.app');
const bin=join(app,'Contents','MacOS');
const resources=join(app,'Contents','Resources');
mkdirSync(bin,{recursive:true});mkdirSync(resources,{recursive:true});
copyFileSync(join(desktop,'target/debug/openworkmate-desktop'),join(bin,'openworkmate-desktop'));
copyFileSync(join(desktop,'Info.plist'),join(app,'Contents/Info.plist'));
run('sips',['-s','format','icns',join(desktop,'icons/icon.png'),'--out',join(resources,'icon.icns')]);
run('codesign',['--force','--sign','-',app]);
run('codesign',['--verify','--strict',app]);
console.log('本地桌面应用：'+app);
if(!process.argv.includes('--build-only'))run('open',[app]);
