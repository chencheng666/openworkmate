import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { defaultBrand, palettes, type Brand } from '../../../ui/branding';
import { adminApi } from '../api';
import type { BrandEditor } from '../components/AdminLayout';

export default function BrandingPage() {
  const { brand, setBrand, loaded, loadError, retry } = useOutletContext<BrandEditor>();
  const [draft, setDraft] = useState<Brand | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const current = draft ?? brand;
  const dirty = current.name.trim() !== brand.name || current.theme !== brand.theme || current.logo !== brand.logo;
  const update = (patch: Partial<Brand>) => {
    setNotice('');
    setDraft(value => ({ ...(value ?? brand), ...patch }));
  };
  const selectLogo = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.type !== 'image/png' || file.size > 65536) throw new Error();
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width <= 512 && bitmap.height <= 512;
      bitmap.close();
      if (!valid) throw new Error();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      update({ logo: data });
    } catch { setNotice('图标无法读取，请使用 512 × 512 像素以内、最大 64 KB 的 PNG。'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setNotice('');
    try { setBrand(await adminApi.branding.save({ ...current, name: current.name.trim() })); setDraft(null); setNotice('已保存。员工下次打开工作台时会看到新外观。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <section className="page-stack"><header className="page-heading"><div><h1>企业外观</h1><p>为本公司设置工作台标识，员工端和管理端共用。</p></div></header>
    {!loaded ? <div role="status">{loadError ? <>外观配置读取失败。 <button className="button secondary" onClick={retry}>重新读取</button></> : '正在读取…'}</div> :
    <div className="brand-grid"><form className="panel brand-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy}><legend className="config-title">品牌设置</legend><label>工作台名称<input required maxLength={32} value={current.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>企业图标<input type="file" accept="image/png" onChange={e => { void selectLogo(e.target.files?.[0]); e.target.value = ''; }} /><small>PNG · 最大 64 KB · 最长边 512 像素</small></label>
      {current.logo && <button type="button" className="button secondary" onClick={() => update({ logo: '' })}>使用默认图标</button>}
      <fieldset className="palette-options"><legend>界面配色</legend>{(Object.keys(palettes) as Brand['theme'][]).map(key =>
        <label key={key} data-theme={key}><input type="radio" name="theme" checked={current.theme === key} onChange={() => update({ theme: key })} /><i />{palettes[key]}</label>)}</fieldset>
      <div className="brand-actions"><button className="button primary" disabled={!dirty || !current.name.trim()}>保存外观</button>
        {dirty && <button className="button secondary" type="button" onClick={() => {setDraft(null);setNotice('已撤销本次修改。');}}>撤销修改</button>}
        <button className="brand-reset" type="button" onClick={() => update(defaultBrand)}>恢复默认外观</button></div></fieldset>
      <span role="status">{notice || (dirty ? '有未保存的修改，仅在预览中可见。' : '当前外观已生效。')}</span></form>
      <aside data-theme={current.theme} className="brand-preview" aria-label="员工端外观预览">
        <div className="preview-heading"><strong>员工端预览</strong><small>随配置更新</small></div>
        <div className="preview-workspace"><div className="preview-bar"><img className="brand-logo" src={current.logo || '/admin/brand/logo.svg'} alt="" /><strong>{current.name || '工作台名称'}</strong><span>新建对话</span><small>最近对话</small><b>新对话</b></div>
        <div className="preview-body"><small>企业工作空间</small><h2>今天想查什么？</h2><p>查制度、找流程，或询问已接入的业务。</p><div>描述你要处理的业务…</div></div></div></aside>
    </div>}</section>;
}
