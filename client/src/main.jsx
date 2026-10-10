import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Bell, Cable, Check, ChevronDown, Copy, Download, FileImage, Gauge, Globe2, Import, KeyRound,
  LoaderCircle, LockKeyhole, LogIn, LogOut, Mail, Network, Play, Plus, Radar, RefreshCw, Search,
  Send, Server, Settings2, Smartphone, Square, Timer, Trash2, X, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import './styles.css';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('auth-required'));
    }
    throw error;
  }
  return data;
}

function formatTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

function Metric({ label, value, detail, tone }) {
  return <div className="min-w-0 flex-1 px-5 py-4 first:pl-0 last:pr-0">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone || ''}`}>{value}</div>
    <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>
  </div>;
}

const unlockVariants = { unlocked: 'success', limited: 'warning', blocked: 'danger', na: 'outline', error: 'outline' };
const unlockText = { unlocked: '解锁', limited: '受限', blocked: '失败', na: 'N/A', error: '未知' };

function unlockTip(value) {
  return [value.text, value.stale ? `（上次成功结果；最近一次：${value.lastError || '失败'}）` : '', value.elapsedMs ? `耗时 ${value.elapsedMs} ms` : ''].filter(Boolean).join('\n');
}

function ServiceState({ value }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return <Tooltip content={unlockTip(value) || unlockText[value.status]}>
    <span><Badge variant={unlockVariants[value.status] || 'outline'} className={value.stale ? 'opacity-60' : ''}>{value.status === 'unlocked' && value.region ? value.region : unlockText[value.status] || value.status}</Badge></span>
  </Tooltip>;
}

function regionFlag(code) {
  const value = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return '';
  return String.fromCodePoint(...[...value].map(char => 0x1F1E6 + char.charCodeAt(0) - 65));
}

function RegionCell({ node, media }) {
  const claimed = node.region;
  const actual = media?.exit?.region;
  if (!claimed && !actual) return <span className="text-muted-foreground">-</span>;
  const mismatch = claimed && actual && claimed !== actual;
  const shown = claimed || actual;
  const tip = mismatch
    ? `节点名标注 ${claimed}，但出口 IP 实际在 ${actual}`
    : claimed ? `来自节点名${node.regionSource === 'flag' ? '中的国旗' : '中的地名'}` : '来自出口 IP';
  return <Tooltip content={tip}>
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>{regionFlag(shown)}</span><span className="font-mono text-xs">{shown}</span>
      {mismatch && <Badge variant="warning">出口 {actual}</Badge>}
    </span>
  </Tooltip>;
}

function RegionalServices({ services }) {
  const entries = Object.entries(services || {}).filter(([, value]) => value?.regional);
  if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
  return <div className="flex flex-wrap gap-1.5">
    {entries.map(([key, value]) => <Tooltip key={key} content={unlockTip(value)}>
      <Badge variant={unlockVariants[value.status] || 'outline'} className={value.stale ? 'opacity-60' : ''}>{value.label || key} {value.status === 'unlocked' && value.region ? value.region : unlockText[value.status] || value.status}</Badge>
    </Tooltip>)}
  </div>;
}

function readStored(key, fallback) {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function ProbeDots({ probes }) {
  if (!probes?.length) return <span className="text-muted-foreground">-</span>;
  return <div className="flex items-center gap-1.5">
    {probes.map(probe => {
      const tone = probe.online === true ? 'bg-emerald-500' : probe.online === false ? 'bg-red-500' : 'bg-zinc-300';
      const state = probe.online === true ? `在线 ${probe.responseTime ?? '-'} ms` : probe.online === false ? '离线' : '无数据';
      return <Tooltip key={probe.id} content={`${probe.name}：${state}${probe.lastCheck ? `\n${formatTime(probe.lastCheck)}` : ''}`}>
        <span className={`inline-block size-2.5 rounded-full ${tone}`} aria-label={`${probe.name} ${state}`} />
      </Tooltip>;
    })}
  </div>;
}

function CopyField({ label, value, notify }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); notify('已复制'); } catch { notify('复制失败，请手动选择文本', true); }
  };
  return <div className="grid gap-1.5">
    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground"><span>{label}</span><Button size="sm" variant="ghost" type="button" onClick={copy}><Copy />复制</Button></div>
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{value}</pre>
  </div>;
}

function Select({ value, onChange, children, className = '', ...props }) {
  return <div className={`relative ${className}`}><select className="h-9 w-full appearance-none rounded-md border bg-background pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" value={value} onChange={e => onChange(e.target.value)} {...props}>{children}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>;
}

const backendTypeLabels = { local: '本机', forward: '正向', reverse: '反向' };

function BackendState({ backend }) {
  if (!backend.enabled) return <Badge variant="outline">已停用</Badge>;
  if (backend.online) return <Badge variant="success">在线{backend.type === 'reverse' && backend.sessions > 1 ? ` ×${backend.sessions}` : ''}</Badge>;
  if (backend.online === false) return <Tooltip content={backend.error || '未连接'}><span><Badge variant="danger">离线</Badge></span></Tooltip>;
  return <Badge variant="outline">检测中</Badge>;
}

function ConnectDetails({ info, notify }) {
  return <div className="grid gap-4">
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">token 只显示这一次。每台机器运行一个 miaospeed，主动连接主控，自身不需要开放端口；丢失 token 后可重置。</div>
    {!info.secure && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">当前地址是不加密的 ws://，测试任务里包含节点密码，只建议在局域网使用。公网请让主控通过 HTTPS 访问（域名 + Let's Encrypt 证书），或设置 MIAOSPEED_PUBLIC_URL=wss://你的域名。</div>}
    <CopyField label="Docker（支持 amd64 / arm64 / 树莓派 armv7）" value={info.docker} notify={notify} />
    <CopyField label="Linux / macOS 二进制" value={info.binary} notify={notify} />
    <CopyField label="Windows" value={info.windows} notify={notify} />
  </div>;
}

function BackendsSection({ notify }) {
  const [data, setData] = useState({ backends: [], reverseBase: '' });
  const [busy, setBusy] = useState('');
  const [connect, setConnect] = useState(null);
  const [adding, setAdding] = useState(null);
  const [form, setForm] = useState({ name: '', url: '', token: '', buildToken: '', fingerprint: '' });
  const load = async () => { try { setData(await api('/api/backends')); } catch (error) { notify(error.message, true); } };
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, []);
  const act = async (key, run) => { setBusy(key); try { await run(); await load(); } catch (error) { notify(error.message, true); } finally { setBusy(''); } };
  const create = event => {
    event.preventDefault();
    act('create', async () => {
      const body = adding === 'reverse' ? { type: 'reverse', name: form.name } : { type: 'forward', ...form };
      const result = await api('/api/backends', { method: 'POST', body: JSON.stringify(body) });
      setAdding(null); setForm({ name: '', url: '', token: '', buildToken: '', fingerprint: '' });
      if (result.url) setConnect(result); else notify('后端已添加');
    });
  };
  const rotate = backend => { if (!confirm(`重置“${backend.name}”的 token？正在运行的 miaospeed 需要用新命令重新启动。`)) return; act(backend.id, async () => setConnect(await api(`/api/backends/${backend.id}/rotate`, { method: 'POST', body: '{}' }))); };
  const remove = backend => { if (!confirm(`删除后端“${backend.name}”？`)) return; act(backend.id, () => api(`/api/backends/${backend.id}`, { method: 'DELETE' })); };
  const toggle = backend => act(backend.id, () => api(`/api/backends/${backend.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !backend.enabled }) }));
  const field = key => ({ value: form[key], onChange: e => setForm(current => ({ ...current, [key]: e.target.value })) });
  return <section className="border-b pb-8 pt-8">
    <div className="mb-2 flex items-center gap-2"><Cable className="size-4" /><h2 className="text-base font-semibold">miaospeed 后端</h2></div>
    <p className="mb-5 text-sm text-muted-foreground">深度测试在这些后端上运行。正向：填写已有 miaospeed 的地址和 token（例如给 Koipy 用的后端）；反向：在 NAT 后的机器上运行 miaospeed，主动连接主控 {data.reverseBase && <span className="font-mono text-xs">{data.reverseBase}</span>}。</p>
    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-sm">
      <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">名称</th><th className="px-4 py-2.5 font-medium">类型</th><th className="px-4 py-2.5 font-medium">状态</th><th className="px-4 py-2.5 font-medium">版本 / 地址</th><th className="px-4 py-2.5 font-medium">启用</th><th className="w-24 px-3 py-2.5"></th></tr></thead>
      <tbody>{data.backends.length === 0 && <EmptyRow columns={6}>没有可用后端（本机 miaospeed 未安装）</EmptyRow>}{data.backends.map(backend => <tr key={backend.id} className="border-t">
        <td className="px-4 py-3"><div className="font-medium">{backend.name}</div><div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{backend.id}</div></td>
        <td className="px-4 py-3"><Badge variant="outline">{backendTypeLabels[backend.type]}</Badge></td>
        <td className="px-4 py-3"><BackendState backend={backend} />{backend.type === 'reverse' && !backend.online && backend.lastSeen && <div className="mt-1 text-[11px] text-muted-foreground">最后在线 {formatTime(backend.lastSeen)}</div>}</td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground"><div>{backend.version || '-'}</div><div className="max-w-64 truncate">{backend.url || backend.remote || ''}</div></td>
        <td className="px-4 py-3">{backend.type !== 'local' ? <Switch checked={backend.enabled} onCheckedChange={() => toggle(backend)} disabled={busy === backend.id} aria-label="启用后端" /> : <span className="text-muted-foreground">-</span>}</td>
        <td className="px-3 py-3">{backend.type !== 'local' && <div className="flex justify-end gap-1">{backend.type === 'reverse' && <Tooltip content="重置 token"><Button size="icon" variant="ghost" onClick={() => rotate(backend)} disabled={Boolean(busy)}><KeyRound /></Button></Tooltip>}<Tooltip content="删除"><Button size="icon" variant="ghost" onClick={() => remove(backend)} disabled={Boolean(busy)}><Trash2 /></Button></Tooltip></div>}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setAdding('reverse')}><Plus />添加反向后端</Button><Button variant="outline" onClick={() => setAdding('forward')}><Plus />添加正向后端</Button></div>
    <Dialog open={Boolean(adding)} onOpenChange={open => { if (!open) setAdding(null); }}>
      <DialogContent><form onSubmit={create} className="grid gap-4"><DialogHeader><DialogTitle>{adding === 'reverse' ? '添加反向后端' : '添加正向后端'}</DialogTitle><DialogDescription>{adding === 'reverse' ? '创建后会给出在目标机器上运行 miaospeed 的命令。' : '主控主动连接一个已在运行的 miaospeed server。'}</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-medium">名称<Input {...field('name')} placeholder="例如：上海联通" maxLength={40} required /></label>
        {adding === 'forward' && <>
          <label className="grid gap-2 text-sm font-medium">地址<Input {...field('url')} placeholder="wss://example.com:8765/path" required /></label>
          <label className="grid gap-2 text-sm font-medium">token<Input {...field('token')} type="password" autoComplete="off" required /></label>
          <label className="grid gap-2 text-sm font-medium">证书指纹（可选，自签证书时填写 SHA-256）<Input {...field('fingerprint')} placeholder="留空则按域名校验证书" /></label>
          <label className="grid gap-2 text-sm font-medium">编译 token（可选，自行编译的 miaospeed 才需要）<Input {...field('buildToken')} autoComplete="off" /></label>
        </>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setAdding(null)}>取消</Button><Button disabled={busy === 'create'}>{busy === 'create' ? <LoaderCircle className="animate-spin" /> : <Plus />}添加</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
    <Dialog open={Boolean(connect)} onOpenChange={open => { if (!open) setConnect(null); }}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>部署后端：{connect?.backend?.name}</DialogTitle><DialogDescription>在目标机器上运行下面任一命令，miaospeed 连上主控后即可在深度测试中选择它。</DialogDescription></DialogHeader>{connect && <ConnectDetails info={connect} notify={notify} />}<DialogFooter><Button onClick={() => setConnect(null)}>完成</Button></DialogFooter></DialogContent>
    </Dialog>
  </section>;
}

const presetIcons = { latency: Timer, speed: Gauge, topology: Network };
const statusLabels = { running: '进行中', completed: '完成', failed: '失败', cancelled: '已取消' };
const statusVariants = { running: 'outline', completed: 'success', failed: 'danger', cancelled: 'warning' };

function DeepTestView({ subscriptions, imports, notify }) {
  const [data, setData] = useState({ current: null, history: [], presets: {}, backends: [], downloadSources: [] });
  const [preset, setPreset] = useState(() => readStored('nw-deep-preset', 'latency'));
  const [backendId, setBackendId] = useState(() => readStored('nw-deep-backend', ''));
  const [sourceId, setSourceId] = useState('');
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [speed, setSpeed] = useState({ downloadDuration: 5, downloadThreading: 1, downloadSource: 'auto' });
  const [viewId, setViewId] = useState(null);
  const [sort, setSort] = useState('');
  const [busy, setBusy] = useState(false);
  const running = data.current?.status === 'running';
  const load = async () => { try { setData(await api('/api/deep-tests')); } catch (error) { notify(error.message, true); } };
  useEffect(() => { load(); }, []);
  useEffect(() => { const timer = setInterval(load, running ? 1500 : 10000); return () => clearInterval(timer); }, [running]);
  const backends = data.backends.filter(item => item.enabled);
  const backend = backends.find(item => item.id === backendId) || backends.find(item => item.online) || backends[0];
  const shown = data.history.find(item => item.id === viewId) || data.history[0];
  const start = async () => {
    if (preset === 'speed' && !confirm('测速会消耗大量流量（每个节点约 时长 × 带宽，千兆节点 5 秒约 600MB），确定开始？')) return;
    setBusy(true);
    try {
      writeStored('nw-deep-preset', preset); if (backend) writeStored('nw-deep-backend', backend.id);
      await api('/api/deep-tests', { method: 'POST', body: JSON.stringify({ preset, backendId: backend?.id, sourceId: sourceId || undefined, include, exclude, options: preset === 'speed' ? speed : {} }) });
      setViewId(null); await load();
    } catch (error) { notify(error.message, true); } finally { setBusy(false); }
  };
  const cancel = async () => { try { await api(`/api/deep-tests/${data.current.id}/cancel`, { method: 'POST', body: '{}' }); await load(); } catch (error) { notify(error.message, true); } };
  const remove = async item => { if (!confirm('删除这条测试记录？')) return; try { await api(`/api/deep-tests/${item.id}`, { method: 'DELETE' }); if (viewId === item.id) setViewId(null); await load(); } catch (error) { notify(error.message, true); } };
  const reportUrl = item => `/api/deep-tests/${item.id}/report.png?t=${encodeURIComponent(item.finishedAt || '')}${sort ? `&sort=${sort}` : ''}`;
  const sources = [...subscriptions.map(item => ({ id: item.id, name: item.name })), ...imports.map(item => ({ id: item.id, name: item.name }))];
  const current = data.current;
  return <div className="grid gap-6">
    <section className="grid gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(data.presets).map(([key, label]) => { const Icon = presetIcons[key] || Zap; return <Button key={key} variant={preset === key ? 'default' : 'outline'} onClick={() => setPreset(key)} disabled={running}><Icon />{label}</Button>; })}
        <span className="ml-auto text-xs text-muted-foreground">{preset === 'latency' ? '延迟RTT / HTTP延迟 / UDP NAT 类型' : preset === 'speed' ? '下载测速 + 延迟 + UDP 类型' : '入口与出口的地区、ASN、组织，按落地 IP 聚类'}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">后端<Select value={backend?.id || ''} onChange={setBackendId} disabled={running}>{backends.length === 0 && <option value="">没有可用后端</option>}{backends.map(item => <option key={item.id} value={item.id}>{item.name}{[item.type !== 'local' && backendTypeLabels[item.type], !item.online && '离线'].filter(Boolean).map(text => `（${text}）`).join('')}</option>)}</Select></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">来源<Select value={sourceId} onChange={setSourceId} disabled={running}><option value="">全部来源</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">包含（关键字或正则）<Input value={include} onChange={e => setInclude(e.target.value)} placeholder="例如：香港|HK" disabled={running} /></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">排除<Input value={exclude} onChange={e => setExclude(e.target.value)} placeholder="例如：剩余|到期" disabled={running} /></label>
      </div>
      {preset === 'speed' && <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">每节点时长（秒）<Input type="number" min={1} max={30} value={speed.downloadDuration} onChange={e => setSpeed(s => ({ ...s, downloadDuration: Number(e.target.value) }))} disabled={running} /></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">线程<Input type="number" min={1} max={32} value={speed.downloadThreading} onChange={e => setSpeed(s => ({ ...s, downloadThreading: Number(e.target.value) }))} disabled={running} /></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">测速文件<Select value={speed.downloadSource} onChange={value => setSpeed(s => ({ ...s, downloadSource: value }))} disabled={running}>{(data.downloadSources.length ? data.downloadSources : ['auto']).map(key => <option key={key} value={key}>{{ auto: '自动（微软/谷歌）', fast: 'Fast.com', cloudflare: 'Cloudflare', cachefly: 'CacheFly' }[key] || key}</option>)}</Select></label>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        {running ? <Button variant="outline" onClick={cancel}><Square />停止</Button> : <Button onClick={start} disabled={busy || !backend}>{busy ? <LoaderCircle className="animate-spin" /> : <Play />}开始测试</Button>}
        {preset === 'speed' && !running && <span className="text-xs text-amber-700">测速会消耗大量流量，请勿频繁运行</span>}
      </div>
      {current && running && <div className="rounded-md border bg-muted/40 p-3"><div className="flex items-center justify-between text-sm"><span className="flex min-w-0 items-center gap-2"><LoaderCircle className="size-4 shrink-0 animate-spin" /><span className="truncate">{current.backend.name} · {current.label} · {current.current ? `已完成 ${current.current}` : current.queuing ? `排队中（前面 ${current.queuing} 个任务）` : '等待结果'}</span></span><span className="ml-4 shrink-0 font-mono text-xs">{current.completed}/{current.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><div className="h-full bg-zinc-800 transition-all" style={{ width: `${current.total ? current.completed / current.total * 100 : 0}%` }} /></div></div>}
      {current && !running && current.status === 'failed' && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">上次测试失败：{current.error}</div>}
    </section>
    {shown && <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">{shown.label} · {shown.backend.name}</h2><p className="mt-1 text-xs text-muted-foreground">{formatTime(shown.startedAt)} · {shown.nodeCount} 个节点 · {Math.round((shown.durationMs || 0) / 1000)}s{shown.status !== 'completed' ? ` · ${statusLabels[shown.status]} ${shown.completed}/${shown.total}` : ''}</p></div>
        <div className="flex gap-2">{shown.preset !== 'topology' && <Select value={sort} onChange={setSort} className="w-36"><option value="">订阅原序</option><option value="rtt">按延迟RTT</option><option value="http">按HTTP延迟</option>{shown.preset === 'speed' && <option value="speed">按平均速度</option>}</Select>}<Button asChild><a href={`${reportUrl(shown)}&download=1`} download><Download />下载 PNG</a></Button></div>
      </div>
      <div className="overflow-auto rounded-md border bg-muted/20 p-2"><img key={reportUrl(shown)} src={reportUrl(shown)} alt={`${shown.label}报告`} className="mx-auto max-w-full" /></div>
    </section>}
    <section>
      <h2 className="mb-3 text-base font-semibold">测试记录</h2>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">时间</th><th className="px-4 py-2.5 font-medium">类型</th><th className="px-4 py-2.5 font-medium">后端</th><th className="px-4 py-2.5 font-medium">节点</th><th className="px-4 py-2.5 font-medium">状态</th><th className="px-4 py-2.5 font-medium">耗时</th><th className="w-16 px-3 py-2.5"></th></tr></thead>
        <tbody>{data.history.length === 0 && <EmptyRow columns={7}>还没有测试记录</EmptyRow>}{data.history.map(item => <tr key={item.id} className={`cursor-pointer border-t hover:bg-muted/40 ${shown?.id === item.id ? 'bg-muted/50' : ''}`} onClick={() => setViewId(item.id)}>
          <td className="px-4 py-2.5 tabular-nums">{formatTime(item.startedAt)}</td><td className="px-4 py-2.5">{item.label}</td><td className="px-4 py-2.5">{item.backend.name}</td><td className="px-4 py-2.5 tabular-nums">{item.nodeCount}</td>
          <td className="px-4 py-2.5"><Badge variant={statusVariants[item.status] || 'outline'}>{statusLabels[item.status] || item.status}</Badge></td><td className="px-4 py-2.5 tabular-nums">{Math.round((item.durationMs || 0) / 1000)}s</td>
          <td className="px-3 py-2.5" onClick={event => event.stopPropagation()}><Tooltip content="删除"><Button size="icon" variant="ghost" onClick={() => remove(item)}><Trash2 /></Button></Tooltip></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

const categoryLabels = { media: '流媒体', ai: 'AI', games: '游戏', network: '网络', search: '搜索', social: '社交' };

function UnlockSection({ notify, onSaved }) {
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [regional, setRegional] = useState(true);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api('/api/unlock').then(result => { setData(result); setChosen(result.settings.scripts); setRegional(result.settings.regional); }).catch(error => notify(error.message, true));
  }, []);
  if (!data) return null;
  const byId = new Map(data.scripts.map(item => [item.id, item]));
  const needle = query.trim().toLowerCase();
  const matches = data.scripts.filter(item => !needle || `${item.id} ${item.name} ${item.description} ${item.regions.join(' ')} ${categoryLabels[item.category] || ''}`.toLowerCase().includes(needle));
  const toggle = id => setChosen(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  const save = async () => {
    setSaving(true);
    try { await api('/api/unlock', { method: 'PUT', body: JSON.stringify({ scripts: chosen, regional }) }); notify('解锁检测设置已保存'); await onSaved(); } catch (error) { notify(error.message, true); } finally { setSaving(false); }
  };
  return <section className="border-b pb-8 pt-8">
    <div className="mb-2 flex items-center gap-2"><Play className="size-4" /><h2 className="text-base font-semibold">解锁检测</h2></div>
    <p className="mb-5 text-sm text-muted-foreground">使用 miaospeed-scripts（{data.scripts.length} 个脚本）在 miaospeed 后端上检测。选中的脚本作为节点表的列，按选择顺序排列。</p>
    <div className="mb-3 flex flex-wrap gap-1.5">{chosen.map(id => <button key={id} type="button" onClick={() => toggle(id)} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted">{byId.get(id)?.name || id}<X className="size-3" /></button>)}{chosen.length === 0 && <span className="text-xs text-muted-foreground">未选择，使用默认列</span>}</div>
    <div className="mb-3 flex flex-wrap items-center gap-3"><div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索服务、地区（如 hk、jp）或分类" /></div><label className="flex items-center gap-2 text-sm"><Switch checked={regional} onCheckedChange={setRegional} />按节点地区自动追加区域服务</label></div>
    <div className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-3">{matches.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"><input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={chosen.includes(item.id)} onChange={() => toggle(item.id)} /><span className="min-w-0"><span className="font-medium">{item.name}</span><span className="ml-1.5 text-[11px] text-muted-foreground">{categoryLabels[item.category] || item.category} · {item.regions.join('/')}</span></span></label>)}</div>
    <div className="mt-4 flex gap-2"><Button onClick={save} disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}保存解锁设置</Button><Button variant="outline" onClick={() => setChosen(data.defaults)}>恢复默认</Button></div>
  </section>;
}

function EmptyRow({ columns, children }) {
  return <tr><td colSpan={columns} className="h-32 text-center text-sm text-muted-foreground">{children}</td></tr>;
}

function LoginView({ onAuthenticated }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      onAuthenticated(data.username || username);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="flex min-h-screen items-center justify-center px-5 py-10">
    <main className="w-full max-w-sm">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-md bg-foreground text-background"><Activity className="size-6" /></div>
        <div><h1 className="text-xl font-semibold">Node Watcher</h1><p className="mt-0.5 text-sm text-muted-foreground">节点监控控制台</p></div>
      </div>
      <form onSubmit={submit} className="grid gap-5">
        <div><div className="flex items-center gap-2"><LockKeyhole className="size-4" /><h2 className="text-base font-semibold">管理员登录</h2></div></div>
        <label className="grid gap-2 text-sm font-medium">用户名<Input autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
        <label className="grid gap-2 text-sm font-medium">密码<Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <Button className="w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <LogIn />}登录</Button>
      </form>
    </main>
  </div>;
}

function NodeState({ online }) {
  if (online == null) return <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full bg-zinc-400" />待检测</span>;
  return <span className={`inline-flex items-center gap-1.5 ${online ? 'text-emerald-700' : 'text-red-700'}`}><span className={`size-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />{online ? '在线' : '离线'}</span>;
}

function NodeTable({ nodes, columns, selected, onSelect, onDelete }) {
  const multiProbe = nodes.some(item => item.probes?.length > 1);
  return <div className="overflow-x-auto rounded-md border">
    <table className="w-full min-w-[1200px] border-collapse text-sm">
      <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
        <tr>
          <th className="w-10 px-3 py-2.5"></th>
          <th className="min-w-56 px-3 py-2.5 font-medium">节点</th>
          <th className="w-40 px-3 py-2.5 font-medium">来源</th>
          <th className="w-24 px-3 py-2.5 font-medium">协议</th>
          <th className="w-28 px-3 py-2.5 font-medium">地区</th>
          <th className="w-24 px-3 py-2.5 font-medium">状态</th>
          <th className="w-24 px-3 py-2.5 font-medium">延迟</th>
          {multiProbe && <th className="w-28 px-3 py-2.5 font-medium"><Tooltip content={`圆点依次为：${(nodes.find(item => item.probes?.length)?.probes || []).map(probe => probe.name).join('、')}`}><span className="cursor-help underline decoration-dotted underline-offset-4">各探针</span></Tooltip></th>}
          {columns.map(column => <th key={column.id} className="w-28 px-3 py-2.5 text-center font-medium">{column.label}</th>)}
          <th className="min-w-48 px-3 py-2.5 font-medium">区域服务</th>
          <th className="w-12 px-3 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        {nodes.length === 0 && <EmptyRow columns={columns.length + (multiProbe ? 10 : 9)}>没有符合条件的节点</EmptyRow>}
        {nodes.map(status => <tr key={status.node.id} className="border-t hover:bg-muted/35">
          <td className="px-3 py-2.5"><input type="checkbox" className="size-4 accent-zinc-900" checked={selected.has(status.node.id)} onChange={() => onSelect(status.node.id)} aria-label={`选择 ${status.node.name}`} /></td>
          <td className="max-w-72 px-3 py-2.5">
            <div className="truncate font-medium" title={status.node.name}>{status.node.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{status.node.server}:{status.node.port}</div>
          </td>
          <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground" title={status.node.subscription}>{status.node.subscription}</td>
          <td className="px-3 py-2.5"><Badge variant="outline">{String(status.node.protocol).toUpperCase()}</Badge></td>
          <td className="px-3 py-2.5"><RegionCell node={status.node} media={status.media} /></td>
          <td className="whitespace-nowrap px-3 py-2.5"><NodeState online={status.online} /></td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums">{status.online ? <Tooltip content="HTTP 延迟（含建连）/ 延迟 RTT"><span>{status.responseTime} ms{status.rtt ? <span className="ml-1 text-muted-foreground">/ {status.rtt}</span> : null}</span></Tooltip> : '-'}</td>
          {multiProbe && <td className="px-3 py-2.5"><ProbeDots probes={status.probes} /></td>}
          {columns.map(column => <td key={column.id} className="px-3 py-2.5 text-center"><ServiceState value={status.media?.services?.[column.id]} /></td>)}
          <td className="px-3 py-2.5"><RegionalServices services={status.media?.services} /></td>
          <td className="px-3 py-2.5"><Tooltip content="排除节点"><Button size="icon" variant="ghost" onClick={() => onDelete(status.node)}><Trash2 /></Button></Tooltip></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function AddSubscriptionDialog({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try { await api('/api/subscriptions', { method: 'POST', body: JSON.stringify({ name, url }) }); setOpen(false); setName(''); setUrl(''); await onAdded(); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button><Plus />添加订阅</Button></DialogTrigger>
    <DialogContent><form onSubmit={submit} className="grid gap-5">
      <DialogHeader><DialogTitle>添加订阅</DialogTitle><DialogDescription>支持 Clash YAML 与 Base64 通用订阅。</DialogDescription></DialogHeader>
      <label className="grid gap-2 text-sm font-medium">名称<Input value={name} onChange={event => setName(event.target.value)} required /></label>
      <label className="grid gap-2 text-sm font-medium">订阅 URL<Input type="url" value={url} onChange={event => setUrl(event.target.value)} required /></label>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}保存</Button></DialogFooter>
    </form></DialogContent>
  </Dialog>;
}

function ImportDialog({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('手动导入');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const inspect = async () => { setBusy(true); try { setPreview(await api('/api/imports/preview', { method: 'POST', body: JSON.stringify({ content }) })); } finally { setBusy(false); } };
  const submit = async () => { setBusy(true); try { await api('/api/imports', { method: 'POST', body: JSON.stringify({ name, content }) }); setOpen(false); setContent(''); setPreview(null); await onAdded(); } finally { setBusy(false); } };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline"><Import />导入节点</Button></DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>导入节点</DialogTitle><DialogDescription>支持 VMess、VLESS、Trojan、Shadowsocks、Hysteria2/Hy2、TUIC 链接或 Clash YAML。</DialogDescription></DialogHeader>
      <label className="grid gap-2 text-sm font-medium">名称<Input value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-medium">节点内容<Textarea value={content} onChange={event => { setContent(event.target.value); setPreview(null); }} placeholder="vless://...&#10;hy2://..." /></label>
      {preview && <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm"><span className="font-medium">识别 {preview.nodeCount} 个节点</span>{preview.errors.length > 0 && <span className="ml-2 text-amber-700">{preview.errors.length} 行未识别</span>}</div>}
      <DialogFooter><Button variant="outline" onClick={inspect} disabled={busy || !content}>{busy ? <LoaderCircle className="animate-spin" /> : <Search />}预检</Button><Button onClick={submit} disabled={busy || !content || (preview && preview.nodeCount === 0)}>导入</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function SourcesView({ subscriptions, imports, sourceStatus, reload, notify }) {
  const statusById = new Map(sourceStatus.map(item => [item.id, item]));
  const toggle = async item => { try { await api(`/api/subscriptions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: item.enabled === false }) }); await reload(); } catch (error) { notify(error.message, true); } };
  const removeSubscription = async item => { if (!confirm(`删除订阅“${item.name}”？`)) return; try { await api(`/api/subscriptions/${item.id}`, { method: 'DELETE' }); await reload(); } catch (error) { notify(error.message, true); } };
  const removeImport = async item => { if (!confirm(`删除导入“${item.name}”？`)) return; try { await api(`/api/imports/${item.id}`, { method: 'DELETE' }); await reload(); } catch (error) { notify(error.message, true); } };
  const rows = [...subscriptions.map(item => ({ ...item, kind: '订阅' })), ...imports.map(item => ({ ...item, kind: '导入' }))];
  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">节点来源</h2><p className="mt-1 text-sm text-muted-foreground">{rows.length} 个来源</p></div><div className="flex gap-2"><ImportDialog onAdded={reload} /><AddSubscriptionDialog onAdded={reload} /></div></div>
    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">名称</th><th className="px-4 py-2.5 font-medium">类型</th><th className="px-4 py-2.5 font-medium">节点</th><th className="px-4 py-2.5 font-medium">拉取状态</th><th className="px-4 py-2.5 font-medium">启用</th><th className="w-12 px-3 py-2.5"></th></tr></thead>
      <tbody>{rows.length === 0 && <EmptyRow columns={6}>尚未添加节点来源</EmptyRow>}{rows.map(item => { const health = statusById.get(item.id); return <tr key={item.id} className="border-t hover:bg-muted/35">
        <td className="px-4 py-3"><div className="font-medium">{item.name}</div>{item.url && <div className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{item.url}</div>}</td>
        <td className="px-4 py-3"><Badge variant="outline">{item.kind}</Badge></td><td className="px-4 py-3 tabular-nums">{health?.nodeCount ?? item.nodeCount ?? '-'}</td>
        <td className="px-4 py-3">{health ? <Badge variant={health.ok ? 'success' : 'danger'}>{health.ok ? '正常' : health.error || '失败'}</Badge> : <span className="text-muted-foreground">待加载</span>}</td>
        <td className="px-4 py-3">{item.kind === '订阅' ? <Switch checked={item.enabled !== false} onCheckedChange={() => toggle(item)} aria-label="切换订阅" /> : <span className="text-muted-foreground">-</span>}</td>
        <td className="px-3 py-3"><Tooltip content="删除"><Button size="icon" variant="ghost" onClick={() => item.kind === '订阅' ? removeSubscription(item) : removeImport(item)}><Trash2 /></Button></Tooltip></td>
      </tr>; })}</tbody>
    </table></div>
  </div>;
}

function ChannelHeader({ icon: Icon, name, detail, enabled, onEnabledChange }) {
  return <div className="flex items-center justify-between gap-4">
    <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40"><Icon className="size-4" /></div><div className="min-w-0"><div className="text-sm font-semibold">{name}</div><div className="truncate text-xs text-muted-foreground">{detail}</div></div></div>
    <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label={`启用 ${name}`} />
  </div>;
}

function SettingsView({ config, notifications, onSaved, notify }) {
  const defaultMonitoring = { checkIntervalMinutes: 5, timeoutSeconds: 10, retryAttempts: 1, failureThreshold: 2, subscriptionRefreshMinutes: 30, customHealthCheckUrl: '' };
  const [monitoringForm, setMonitoringForm] = useState(config || defaultMonitoring);
  const [channels, setChannels] = useState({
    bark: { enabled: false, url: '' },
    email: { enabled: false, host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: '', pass: '' }, from: '', to: '' },
    telegram: { enabled: false, botToken: '', chatId: '' }
  });
  const [saving, setSaving] = useState('');
  const monitoringKey = JSON.stringify(config || defaultMonitoring);
  const notificationsKey = JSON.stringify(notifications || {});

  useEffect(() => setMonitoringForm(config || defaultMonitoring), [monitoringKey]);
  useEffect(() => {
    if (!notifications) return;
    setChannels({
      bark: { ...notifications.bark, url: '' },
      email: { ...notifications.email, auth: { ...notifications.email.auth, pass: '' } },
      telegram: { ...notifications.telegram, botToken: '' }
    });
  }, [notificationsKey]);

  const updateChannel = (type, values) => setChannels(current => ({
    ...current,
    [type]: { ...current[type], ...values }
  }));
  const updateEmailAuth = values => setChannels(current => ({
    ...current,
    email: { ...current.email, auth: { ...current.email.auth, ...values } }
  }));
  const channelPayload = type => {
    const value = channels[type];
    if (type === 'bark') return { enabled: value.enabled, ...(value.url ? { url: value.url } : {}) };
    if (type === 'telegram') return { enabled: value.enabled, ...(value.botToken ? { botToken: value.botToken } : {}), ...(value.chatId ? { chatId: value.chatId } : {}) };
    return {
      enabled: value.enabled, host: value.host, port: Number(value.port), secure: value.secure,
      from: value.from, to: value.to,
      auth: { ...(value.auth.user ? { user: value.auth.user } : {}), ...(value.auth.pass ? { pass: value.auth.pass } : {}) }
    };
  };
  const saveMonitoring = async event => {
    event.preventDefault(); setSaving('monitoring');
    try { await api('/api/system/monitoring', { method: 'PUT', body: JSON.stringify(monitoringForm) }); notify('检测设置已保存'); await onSaved(); }
    catch (error) { notify(error.message, true); }
    finally { setSaving(''); }
  };
  const saveChannel = async (type, test = false) => {
    setSaving(type);
    try {
      await api(`/api/notifications/${type}`, { method: 'PUT', body: JSON.stringify(channelPayload(type)) });
      if (test) await api(`/api/notifications/test/${type}`, { method: 'POST', body: '{}' });
      notify(test ? '测试通知已发送' : '告警配置已保存');
      await onSaved();
    } catch (error) { notify(error.message, true); }
    finally { setSaving(''); }
  };

  return <div className="max-w-3xl">
    <form onSubmit={saveMonitoring} className="border-b pb-8">
      <div className="mb-5"><h2 className="text-base font-semibold">检测设置</h2><p className="mt-1 text-sm text-muted-foreground">节点状态变化由周期检测触发。</p></div>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">周期（分钟）<Input type="number" min="1" value={monitoringForm.checkIntervalMinutes ?? 5} onChange={e => setMonitoringForm({ ...monitoringForm, checkIntervalMinutes: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium">超时（秒，最多 10）<Input type="number" min="1" max="10" value={monitoringForm.timeoutSeconds ?? 10} onChange={e => setMonitoringForm({ ...monitoringForm, timeoutSeconds: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium">失败重试（次，0-3）<Input type="number" min="0" max="3" value={monitoringForm.retryAttempts ?? 1} onChange={e => setMonitoringForm({ ...monitoringForm, retryAttempts: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium">连续失败多少次才告警<Input type="number" min="1" max="10" value={monitoringForm.failureThreshold ?? 2} onChange={e => setMonitoringForm({ ...monitoringForm, failureThreshold: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium">订阅刷新（分钟）<Input type="number" min="1" value={monitoringForm.subscriptionRefreshMinutes ?? 30} onChange={e => setMonitoringForm({ ...monitoringForm, subscriptionRefreshMinutes: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-3">探测地址（留空使用默认 gstatic generate_204）<Input type="url" placeholder="https://www.gstatic.com/generate_204" value={monitoringForm.customHealthCheckUrl ?? ''} onChange={e => setMonitoringForm({ ...monitoringForm, customHealthCheckUrl: e.target.value })} /></label>
      </div>
      <Button className="mt-6" type="submit" disabled={Boolean(saving)}>{saving === 'monitoring' ? <LoaderCircle className="animate-spin" /> : <Check />}保存检测设置</Button>
    </form>

    <BackendsSection notify={notify} />
    <UnlockSection notify={notify} onSaved={onSaved} />

    <section className="pt-8">
      <div className="mb-2 flex items-center gap-2"><Bell className="size-4" /><h2 className="text-base font-semibold">状态告警</h2></div>
      <div className="divide-y border-y">
        <div className="py-6">
          <ChannelHeader icon={Smartphone} name="Bark" detail={channels.bark.urlConfigured ? '推送地址已配置' : 'iPhone 推送'} enabled={channels.bark.enabled} onEnabledChange={enabled => updateChannel('bark', { enabled })} />
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="grid gap-2 text-sm font-medium">推送地址<Input type="password" autoComplete="off" value={channels.bark.url} onChange={e => updateChannel('bark', { url: e.target.value })} placeholder={channels.bark.urlConfigured ? '已配置，留空则保留' : 'https://api.day.app/你的Key'} /></label><div className="flex gap-2"><Button variant="outline" onClick={() => saveChannel('bark')} disabled={Boolean(saving)}>保存</Button><Button onClick={() => saveChannel('bark', true)} disabled={Boolean(saving) || !channels.bark.enabled}>{saving === 'bark' ? <LoaderCircle className="animate-spin" /> : <Send />}保存并测试</Button></div></div>
        </div>

        <div className="py-6">
          <ChannelHeader icon={Mail} name="邮件" detail={channels.email.auth?.passwordConfigured ? 'SMTP 密码已配置' : 'SMTP 邮件通知'} enabled={channels.email.enabled} onEnabledChange={enabled => updateChannel('email', { enabled })} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">SMTP 服务器<Input value={channels.email.host} onChange={e => updateChannel('email', { host: e.target.value })} placeholder="smtp.example.com" /></label>
            <div className="grid grid-cols-[1fr_auto] gap-3"><label className="grid gap-2 text-sm font-medium">端口<Input type="number" min="1" max="65535" value={channels.email.port} onChange={e => updateChannel('email', { port: Number(e.target.value) })} /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium"><Switch checked={channels.email.secure} onCheckedChange={secure => updateChannel('email', { secure })} />SSL</label></div>
            <label className="grid gap-2 text-sm font-medium">SMTP 账号<Input autoComplete="username" value={channels.email.auth?.user || ''} onChange={e => updateEmailAuth({ user: e.target.value })} placeholder={channels.email.auth?.userConfigured ? '已配置，留空则保留' : 'name@example.com'} /></label>
            <label className="grid gap-2 text-sm font-medium">SMTP 密码<Input type="password" autoComplete="new-password" value={channels.email.auth?.pass || ''} onChange={e => updateEmailAuth({ pass: e.target.value })} placeholder={channels.email.auth?.passwordConfigured ? '已配置，留空则保留' : '应用专用密码'} /></label>
            <label className="grid gap-2 text-sm font-medium">发件人<Input type="email" value={channels.email.from} onChange={e => updateChannel('email', { from: e.target.value })} placeholder="Node Watcher <name@example.com>" /></label>
            <label className="grid gap-2 text-sm font-medium">收件人<Input type="email" value={channels.email.to} onChange={e => updateChannel('email', { to: e.target.value })} placeholder="you@example.com" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => saveChannel('email')} disabled={Boolean(saving)}>保存</Button><Button onClick={() => saveChannel('email', true)} disabled={Boolean(saving) || !channels.email.enabled}>{saving === 'email' ? <LoaderCircle className="animate-spin" /> : <Send />}保存并测试</Button></div>
        </div>

        <div className="py-6">
          <ChannelHeader icon={Send} name="Telegram" detail={channels.telegram.botTokenConfigured ? 'Bot Token 已配置' : '机器人消息'} enabled={channels.telegram.enabled} onEnabledChange={enabled => updateChannel('telegram', { enabled })} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Bot Token<Input type="password" autoComplete="off" value={channels.telegram.botToken} onChange={e => updateChannel('telegram', { botToken: e.target.value })} placeholder={channels.telegram.botTokenConfigured ? '已配置，留空则保留' : '123456:ABC...'} /></label><label className="grid gap-2 text-sm font-medium">Chat ID<Input value={channels.telegram.chatId} onChange={e => updateChannel('telegram', { chatId: e.target.value })} placeholder={channels.telegram.chatIdConfigured ? '已配置，留空则保留' : '123456789'} /></label></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => saveChannel('telegram')} disabled={Boolean(saving)}>保存</Button><Button onClick={() => saveChannel('telegram', true)} disabled={Boolean(saving) || !channels.telegram.enabled}>{saving === 'telegram' ? <LoaderCircle className="animate-spin" /> : <Send />}保存并测试</Button></div>
        </div>
      </div>
    </section>
  </div>;
}

function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, authEnabled: true, username: null });
  const [nodes, setNodes] = useState([]);
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0, pending: 0 });
  const [subscriptions, setSubscriptions] = useState([]);
  const [imports, setImports] = useState([]);
  const [system, setSystem] = useState({ sourceStatus: [], jobs: {}, engineReady: false, unlock: { columns: [] } });
  const [monitoring, setMonitoring] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [reportKey, setReportKey] = useState(Date.now());
  const [probes, setProbes] = useState([]);
  const [probeId, setProbeId] = useState(() => readStored('nw-probe', ''));
  const [activeProbe, setActiveProbe] = useState(null);

  const notify = (text, error = false) => { setMessage({ text, error }); setTimeout(() => setMessage(null), 3500); };
  const chooseProbe = id => { setProbeId(id); writeStored('nw-probe', id); };
  const load = async (probe = probeId) => {
    const nodeRequest = api(`/api/nodes/public${probe ? `?probe=${encodeURIComponent(probe)}` : ''}`).catch(error => {
      if (error.status === 404 && probe) { chooseProbe(''); return api('/api/nodes/public'); }
      throw error;
    });
    const [nodeData, subData, importData, systemData, configData, notificationData] = await Promise.all([
      nodeRequest, api('/api/subscriptions'), api('/api/imports'), api('/api/system/status'), api('/api/system/config'), api('/api/notifications')
    ]);
    setActiveProbe(nodeData.probe || null); setProbes(systemData.status.probes || []);
    setNodes(nodeData.stats); setSummary(nodeData.summary); setSubscriptions(subData.subscriptions);
    setImports(importData.imports); setSystem(systemData.status); setMonitoring(configData.config.monitoring); setNotifications(notificationData.notifications);
  };
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session').then(async response => {
      const data = await response.json();
      if (active) setAuth({
        loading: false,
        authenticated: response.ok && data.authenticated,
        authEnabled: data.authEnabled !== false,
        username: data.username || null
      });
    }).catch(() => {
      if (active) setAuth(current => ({ ...current, loading: false, authenticated: false }));
    });
    const handleRequired = () => setAuth(current => ({ ...current, loading: false, authenticated: false, username: null }));
    window.addEventListener('auth-required', handleRequired);
    return () => { active = false; window.removeEventListener('auth-required', handleRequired); };
  }, []);
  useEffect(() => {
    if (auth.authenticated) load(probeId).catch(error => notify(error.message, true));
  }, [auth.authenticated, probeId]);
  useEffect(() => {
    if (!auth.authenticated) return undefined;
    const timer = setInterval(() => load(probeId).catch(() => {}), system.jobs?.media?.status === 'running' ? 2500 : 12000);
    return () => clearInterval(timer);
  }, [auth.authenticated, system.jobs?.media?.status, probeId]);

  const sources = useMemo(() => Array.from(new Set(nodes.map(item => item.node.subscription))).sort(), [nodes]);
  const filtered = useMemo(() => nodes.filter(item => {
    const query = search.trim().toLowerCase();
    return (!query || `${item.node.name} ${item.node.server} ${item.node.protocol}`.toLowerCase().includes(query))
      && (sourceFilter === 'all' || item.node.subscription === sourceFilter)
      && (statusFilter === 'all'
        || (statusFilter === 'online' && item.online === true)
        || (statusFilter === 'offline' && item.online === false)
        || (statusFilter === 'pending' && item.online == null));
  }), [nodes, search, sourceFilter, statusFilter]);
  const mediaJob = system.jobs?.media;
  const lastCheck = nodes.map(item => item.lastCheck).filter(Boolean).sort().at(-1);
  const avgLatency = nodes.filter(item => item.online && item.responseTime).reduce((sum, item, _, all) => sum + item.responseTime / all.length, 0);

  const healthCheck = async () => { setBusy('health'); try { await api('/api/nodes/check', { method: 'POST', body: '{}' }); await load(); notify('连通性检测完成'); } catch (error) { notify(error.message, true); } finally { setBusy(''); } };
  const mediaCheck = async () => { setBusy('media'); try { await api('/api/nodes/media-check', { method: 'POST', body: JSON.stringify({ nodeIds: [...selected], probeId: activeProbe?.id || null }) }); await load(); notify(selected.size ? `已提交 ${selected.size} 个节点` : '已提交全部节点'); } catch (error) { notify(error.message, true); } finally { setBusy(''); } };
  const reload = async () => { setBusy('reload'); try { await api('/api/nodes/reload', { method: 'POST', body: '{}' }); await load(); notify('来源已重新加载'); } catch (error) { notify(error.message, true); } finally { setBusy(''); } };
  const exclude = async node => { if (!confirm(`排除节点“${node.name}”？`)) return; try { await api(`/api/nodes/${node.id}`, { method: 'DELETE' }); await load(); } catch (error) { notify(error.message, true); } };
  const select = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    setAuth(current => ({ ...current, authenticated: false, username: null }));
    setNodes([]);
    setSelected(new Set());
  };

  if (auth.loading) return <div className="flex min-h-screen items-center justify-center"><LoaderCircle className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!auth.authenticated) return <LoginView onAuthenticated={username => setAuth(current => ({ ...current, authenticated: true, username }))} />;

  return <TooltipProvider><div className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md border bg-foreground text-background"><Activity className="size-5" /></div><div className="min-w-0"><h1 className="truncate text-sm font-semibold">Node Watcher</h1>{(() => {
        const current = probes.find(item => item.id === activeProbe?.id) || probes[0];
        const ok = Boolean(current?.online);
        const label = current ? `${probes.length > 1 ? `${current.name} · ` : ''}miaospeed ${ok ? '在线' : '离线'}${current.version ? ` ${current.version}` : ''}` : 'miaospeed 未配置';
        return <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />{label}</div>;
      })()}</div></div>
      <div className="flex items-center gap-2">
        <Tooltip content="重新拉取来源"><Button size="icon" variant="outline" aria-label="重新拉取来源" onClick={reload} disabled={Boolean(busy)}>{busy === 'reload' ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</Button></Tooltip>
        <Button variant="outline" onClick={healthCheck} disabled={Boolean(busy)}>{busy === 'health' ? <LoaderCircle className="animate-spin" /> : <Gauge />}<span className="hidden sm:inline">检测延迟</span></Button>
        <Button onClick={mediaCheck} disabled={Boolean(busy) || mediaJob?.status === 'running'}>{mediaJob?.status === 'running' ? <LoaderCircle className="animate-spin" /> : <Play />}<span className="hidden sm:inline">解锁检测</span>{selected.size > 0 && <Badge className="bg-zinc-700 text-white ring-0">{selected.size}</Badge>}</Button>
        {auth.authEnabled && <Tooltip content={`退出 ${auth.username || ''}`}><Button size="icon" variant="ghost" aria-label="退出登录" onClick={logout}><LogOut /></Button></Tooltip>}
      </div>
    </div></header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      {message && <div className={`fixed right-4 top-20 z-50 flex max-w-sm items-center gap-2 rounded-md border px-4 py-3 text-sm shadow-lg ${message.error ? 'border-red-200 bg-red-50 text-red-800' : 'bg-background'}`}>{message.error ? <X className="size-4" /> : <Check className="size-4 text-emerald-600" />}{message.text}</div>}
      <section className="mb-6 flex divide-x border-b">
        <Metric label="全部节点" value={summary.total} detail={`${sources.length} 个来源`} />
        <Metric label="在线" value={summary.online} detail={summary.total ? `${Math.round(summary.online / summary.total * 100)}% 可用` : '-'} tone="text-emerald-700" />
        <Metric label="离线" value={summary.offline} detail={summary.pending ? `${summary.pending} 个待检测` : '最近一轮检测'} tone={summary.offline ? 'text-red-700' : ''} />
        <Metric label="平均延迟" value={avgLatency ? `${Math.round(avgLatency)} ms` : '-'} detail={formatTime(lastCheck)} />
      </section>
      {mediaJob?.status === 'running' && <div className="mb-5 rounded-md border bg-muted/40 p-3"><div className="flex items-center justify-between text-sm"><span className="flex min-w-0 items-center gap-2"><LoaderCircle className="size-4 shrink-0 animate-spin" /><span className="truncate">{probes.length > 1 && mediaJob.probeId ? `${probes.find(item => item.id === mediaJob.probeId)?.name || mediaJob.probeId} · ` : ''}正在检测 {mediaJob.currentNode || '节点'}</span></span><span className="ml-4 shrink-0 font-mono text-xs">{mediaJob.completed}/{mediaJob.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><div className="h-full bg-zinc-800 transition-all" style={{ width: `${mediaJob.total ? mediaJob.completed / mediaJob.total * 100 : 0}%` }} /></div></div>}
      <Tabs defaultValue="nodes">
        <TabsList><TabsTrigger value="nodes"><Server className="mr-1.5 size-3.5" />节点</TabsTrigger><TabsTrigger value="sources"><Globe2 className="mr-1.5 size-3.5" />来源</TabsTrigger><TabsTrigger value="deep"><Zap className="mr-1.5 size-3.5" />深度测试</TabsTrigger><TabsTrigger value="report"><FileImage className="mr-1.5 size-3.5" />报告</TabsTrigger><TabsTrigger value="settings"><Settings2 className="mr-1.5 size-3.5" />设置</TabsTrigger></TabsList>
        <TabsContent value="nodes">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {probes.length > 1 && <div className="relative"><select aria-label="探针" className="h-9 min-w-36 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring" value={activeProbe?.id || ''} onChange={e => { chooseProbe(e.target.value); setSelected(new Set()); }}>{probes.filter(item => item.enabled).map(item => <option key={item.id} value={item.id}>{item.name}{!item.online ? '（离线）' : ''}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>}
            <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索节点、地址或协议" /></div>
            <div className="relative"><select className="h-9 min-w-36 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">全部来源</option>{sources.map(source => <option key={source}>{source}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>
            <div className="relative"><select className="h-9 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="pending">待检测</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>
            <span className="ml-auto text-xs text-muted-foreground">显示 {filtered.length} / {nodes.length}</span>
          </div>
          <NodeTable nodes={filtered} columns={system.unlock?.columns || []} selected={selected} onSelect={select} onDelete={exclude} />
        </TabsContent>
        <TabsContent value="sources"><SourcesView subscriptions={subscriptions} imports={imports} sourceStatus={system.sourceStatus || []} reload={load} notify={notify} /></TabsContent>
        <TabsContent value="deep"><DeepTestView subscriptions={subscriptions} imports={imports} notify={notify} /></TabsContent>
        <TabsContent value="report"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">检测报告</h2><p className="mt-1 text-sm text-muted-foreground">当前节点矩阵</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setReportKey(Date.now())}><RefreshCw />刷新</Button><Button asChild><a href={`/api/reports/latest.png${activeProbe ? `?probe=${encodeURIComponent(activeProbe.id)}` : ''}`} download><Download />下载 PNG</a></Button></div></div><div className="overflow-auto rounded-md border bg-muted/20 p-2"><img key={`${reportKey}-${activeProbe?.id || ''}`} src={`/api/reports/latest.png?t=${reportKey}${activeProbe ? `&probe=${encodeURIComponent(activeProbe.id)}` : ''}`} alt="节点检测报告" className="min-w-[900px] max-w-none" /></div></TabsContent>
        <TabsContent value="settings"><SettingsView config={monitoring} notifications={notifications} onSaved={load} notify={notify} /></TabsContent>
      </Tabs>
    </main>
  </div></TooltipProvider>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
