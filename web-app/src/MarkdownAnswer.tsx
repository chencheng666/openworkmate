import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef, useState } from 'react';
import type { Components } from 'react-markdown';
import { commonsUrl } from '../../backend/src/modules/web-chat/media/contract';

export function downloadText(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Media({ src, label, video }: { src?: string; label: string; video?: boolean }) {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src) return <span>{label}</span>;
  let url: URL;
  try { url = new URL(src, location.href); } catch { return <span>{label}</span>; }
  if (!(url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:'))) return <span>{label}</span>;
  return <span className="answer-media">{(show || (!video && !!commonsUrl(src))) && !failed
    ? video ? <video controls preload="metadata" src={url.href} aria-label={label} onError={() => setFailed(true)} /> :
      <img src={url.href} alt={label} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : failed ? <a href={url.href} target="_blank" rel="noopener noreferrer">预览失败，打开原文件</a> :
      <button type="button" onClick={() => setShow(true)}>{video ? '播放视频' : '预览图片'} · {label}（{url.host}）</button>}</span>;
}

const components: Components = {
  img: ({ src, alt }) => <Media src={typeof src === 'string' ? src : undefined} label={alt || '图片'} />,
  a: ({ href, children }) => {
    const name = typeof children === 'string' ? children : '文件';
    const path = href?.split(/[?#]/)[0] || '';
    if (/\.(mp4|webm|ogv)$/i.test(path)) return <Media src={href} label={name} video />;
    if (/\.(png|jpe?g|webp|gif)$/i.test(path)) return <Media src={href} label={name} />;
    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
  table: function AnswerTable({ children }) {
    const table = useRef<HTMLTableElement>(null);
    const chart = useRef<SVGSVGElement>(null);
    const [series, setSeries] = useState<{ label: string; value: number }[]>([]);
    const [showChart, setShowChart] = useState(false);
    useEffect(() => {
      const rows = Array.from(table.current?.tBodies[0]?.rows ?? []);
      const values = rows.map(row => {
        const label = row.cells[0]?.textContent?.trim() || '';
        const number = row.cells[1]?.textContent?.trim() || '';
        return { label, value: row.cells.length === 2 && /^\d+(?:\.\d+)?$/.test(number) ? Number(number) : NaN };
      });
      setSeries(values.length >= 2 && values.length <= 12 && values.every(x => x.label && Number.isFinite(x.value)) ? values : []);
      setShowChart(false);
    }, [children]);
    const max = Math.max(1, ...series.map(x => x.value));
    const save = () => {
      if (!table.current) return;
      const rows = Array.from(table.current.rows, row => Array.from(row.cells, cell => {
        let value = cell.textContent || '';
        if (/^\s*[=+@-]|^[\t\r\n]/.test(value)) value = "'" + value;
        return '"' + value.replaceAll('"', '""') + '"';
      }).join(','));
      downloadText('回答表格.csv', '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    };
    return <div className="answer-table"><table ref={table}>{children}</table><button type="button" onClick={save}>下载 CSV 表格</button>
      {series.length > 0 && <button type="button" aria-expanded={showChart} onClick={() => setShowChart(!showChart)}>{showChart ? '收起柱状图' : '生成柱状图'}</button>}
      {showChart && <figure><svg ref={chart} xmlns="http://www.w3.org/2000/svg" viewBox={'0 0 560 ' + (series.length * 34 + 16)} role="img" aria-label="表格数据柱状图">
        <rect width="100%" height="100%" fill="#f4f7fc" />{series.map((x, i) => <g key={i} transform={'translate(0,' + (i * 34 + 10) + ')'}><title>{x.label}：{x.value}</title>
          <text x="8" y="17" fill="#14243e" fontSize="13">{Array.from(x.label).slice(0, 9).join('')}</text>
          <rect x="148" y="3" width={x.value / max * 290} height="18" rx="3" fill="#245ce3" />
          <text x={154 + x.value / max * 290} y="17" fill="#14243e" fontSize="13">{x.value}</text></g>)}</svg>
        <button type="button" onClick={() => { if (chart.current) downloadText('业务图表.svg', new XMLSerializer().serializeToString(chart.current), 'image/svg+xml'); }}>下载 SVG 图表</button></figure>}
    </div>;
  },
};

export default function MarkdownAnswer({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>;
}
