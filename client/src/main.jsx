import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Bell, Check, ChevronDown, Download, FileImage, Gauge, Globe2, Import,
  LoaderCircle, LockKeyhole, LogIn, LogOut, Mail, Play, Plus, RefreshCw, Search,
  Send, Server, Settings2, Smartphone, Trash2, X
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

const serviceNames = { netflix: 'Netflix', disney: 'Disney+', youtube: 'YouTube', primeVideo: 'Prime', chatgpt: 'ChatGPT' };

function ServiceState({ value }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  const variants = { unlocked: 'success', limited: 'warning', blocked: 'danger', error: 'outline' };
  const labels = { unlocked: value.region || '可用', limited: '受限', blocked: '不可用', error: '错误' };
  return <Tooltip content={value.detail || labels[value.status]}>
    <Badge variant={variants[value.status] || 'outline'}>{labels[value.status] || value.status}</Badge>
  </Tooltip>;
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

function NodeTable({ nodes, selected, onSelect, onDelete }) {
  return <div className="overflow-x-auto rounded-md border">
    <table className="w-full min-w-[1180px] border-collapse text-sm">
      <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
        <tr>
          <th className="w-10 px-3 py-2.5"></th>
          <th className="min-w-56 px-3 py-2.5 font-medium">节点</th>
          <th className="w-40 px-3 py-2.5 font-medium">来源</th>
          <th className="w-24 px-3 py-2.5 font-medium">协议</th>
          <th className="w-24 px-3 py-2.5 font-medium">状态</th>
          <th className="w-24 px-3 py-2.5 font-medium">延迟</th>
          {Object.values(serviceNames).map(name => <th key={name} className="w-28 px-3 py-2.5 text-center font-medium">{name}</th>)}
          <th className="w-12 px-3 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        {nodes.length === 0 && <EmptyRow columns={12}>没有符合条件的节点</EmptyRow>}
        {nodes.map(status => <tr key={status.node.id} className="border-t hover:bg-muted/35">
          <td className="px-3 py-2.5"><input type="checkbox" className="size-4 accent-zinc-900" checked={selected.has(status.node.id)} onChange={() => onSelect(status.node.id)} aria-label={`选择 ${status.node.name}`} /></td>
          <td className="max-w-72 px-3 py-2.5">
            <div className="truncate font-medium" title={status.node.name}>{status.node.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{status.node.server}:{status.node.port}</div>
          </td>
          <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground" title={status.node.subscription}>{status.node.subscription}</td>
          <td className="px-3 py-2.5"><Badge variant="outline">{String(status.node.protocol).toUpperCase()}</Badge></td>
          <td className="px-3 py-2.5"><NodeState online={status.online} /></td>
          <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{status.online ? `${status.responseTime} ms` : '-'}</td>
          {Object.keys(serviceNames).map(key => <td key={key} className="px-3 py-2.5 text-center"><ServiceState value={status.media?.services?.[key]} /></td>)}
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
  const defaultMonitoring = { checkIntervalMinutes: 5, timeoutSeconds: 10, concurrency: 8 };
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
        <label className="grid gap-2 text-sm font-medium">超时（秒）<Input type="number" min="1" value={monitoringForm.timeoutSeconds ?? 10} onChange={e => setMonitoringForm({ ...monitoringForm, timeoutSeconds: Number(e.target.value) })} /></label>
        <label className="grid gap-2 text-sm font-medium">并发数<Input type="number" min="1" max="32" value={monitoringForm.concurrency ?? 8} onChange={e => setMonitoringForm({ ...monitoringForm, concurrency: Number(e.target.value) })} /></label>
      </div>
      <Button className="mt-6" type="submit" disabled={Boolean(saving)}>{saving === 'monitoring' ? <LoaderCircle className="animate-spin" /> : <Check />}保存检测设置</Button>
    </form>

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
  const [system, setSystem] = useState({ sourceStatus: [], jobs: {}, mihomoReady: false });
  const [monitoring, setMonitoring] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [reportKey, setReportKey] = useState(Date.now());

  const notify = (text, error = false) => { setMessage({ text, error }); setTimeout(() => setMessage(null), 3500); };
  const load = async () => {
    const [nodeData, subData, importData, systemData, configData, notificationData] = await Promise.all([
      api('/api/nodes/public'), api('/api/subscriptions'), api('/api/imports'), api('/api/system/status'), api('/api/system/config'), api('/api/notifications')
    ]);
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
    if (auth.authenticated) load().catch(error => notify(error.message, true));
  }, [auth.authenticated]);
  useEffect(() => {
    if (!auth.authenticated) return undefined;
    const timer = setInterval(() => load().catch(() => {}), system.jobs?.media?.status === 'running' ? 2500 : 12000);
    return () => clearInterval(timer);
  }, [auth.authenticated, system.jobs?.media?.status]);

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
  const mediaCheck = async () => { setBusy('media'); try { await api('/api/nodes/media-check', { method: 'POST', body: JSON.stringify({ nodeIds: [...selected] }) }); await load(); notify(selected.size ? `已提交 ${selected.size} 个节点` : '已提交全部节点'); } catch (error) { notify(error.message, true); } finally { setBusy(''); } };
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
      <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md border bg-foreground text-background"><Activity className="size-5" /></div><div className="min-w-0"><h1 className="truncate text-sm font-semibold">Node Watcher</h1><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-1.5 rounded-full ${system.mihomoReady ? 'bg-emerald-500' : 'bg-red-500'}`} />Mihomo {system.mihomoReady ? '已连接' : '未连接'}</div></div></div>
      <div className="flex items-center gap-2">
        <Tooltip content="重新拉取来源"><Button size="icon" variant="outline" aria-label="重新拉取来源" onClick={reload} disabled={Boolean(busy)}>{busy === 'reload' ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</Button></Tooltip>
        <Button variant="outline" onClick={healthCheck} disabled={Boolean(busy)}>{busy === 'health' ? <LoaderCircle className="animate-spin" /> : <Gauge />}<span className="hidden sm:inline">检测延迟</span></Button>
        <Button onClick={mediaCheck} disabled={Boolean(busy) || mediaJob?.status === 'running'}>{mediaJob?.status === 'running' ? <LoaderCircle className="animate-spin" /> : <Play />}<span className="hidden sm:inline">流媒体检测</span>{selected.size > 0 && <Badge className="bg-zinc-700 text-white ring-0">{selected.size}</Badge>}</Button>
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
      {mediaJob?.status === 'running' && <div className="mb-5 rounded-md border bg-muted/40 p-3"><div className="flex items-center justify-between text-sm"><span className="flex min-w-0 items-center gap-2"><LoaderCircle className="size-4 shrink-0 animate-spin" /><span className="truncate">正在检测 {mediaJob.currentNode || '节点'}</span></span><span className="ml-4 shrink-0 font-mono text-xs">{mediaJob.completed}/{mediaJob.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><div className="h-full bg-zinc-800 transition-all" style={{ width: `${mediaJob.total ? mediaJob.completed / mediaJob.total * 100 : 0}%` }} /></div></div>}
      <Tabs defaultValue="nodes">
        <TabsList><TabsTrigger value="nodes"><Server className="mr-1.5 size-3.5" />节点</TabsTrigger><TabsTrigger value="sources"><Globe2 className="mr-1.5 size-3.5" />来源</TabsTrigger><TabsTrigger value="report"><FileImage className="mr-1.5 size-3.5" />报告</TabsTrigger><TabsTrigger value="settings"><Settings2 className="mr-1.5 size-3.5" />设置</TabsTrigger></TabsList>
        <TabsContent value="nodes">
          <div className="mb-4 flex flex-wrap items-center gap-2"><div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索节点、地址或协议" /></div>
            <div className="relative"><select className="h-9 min-w-36 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">全部来源</option>{sources.map(source => <option key={source}>{source}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>
            <div className="relative"><select className="h-9 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="pending">待检测</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></div>
            <span className="ml-auto text-xs text-muted-foreground">显示 {filtered.length} / {nodes.length}</span>
          </div>
          <NodeTable nodes={filtered} selected={selected} onSelect={select} onDelete={exclude} />
        </TabsContent>
        <TabsContent value="sources"><SourcesView subscriptions={subscriptions} imports={imports} sourceStatus={system.sourceStatus || []} reload={load} notify={notify} /></TabsContent>
        <TabsContent value="report"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">检测报告</h2><p className="mt-1 text-sm text-muted-foreground">当前节点矩阵</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setReportKey(Date.now())}><RefreshCw />刷新</Button><Button asChild><a href="/api/reports/latest.png" download><Download />下载 PNG</a></Button></div></div><div className="overflow-auto rounded-md border bg-muted/20 p-2"><img key={reportKey} src={`/api/reports/latest.png?t=${reportKey}`} alt="节点检测报告" className="min-w-[900px] max-w-none" /></div></TabsContent>
        <TabsContent value="settings"><SettingsView config={monitoring} notifications={notifications} onSaved={load} notify={notify} /></TabsContent>
      </Tabs>
    </main>
  </div></TooltipProvider>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
