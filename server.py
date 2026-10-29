#!/usr/bin/env python3
"""Local multi-host resource dashboard. Python 3.7+, no third-party dependencies."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'servers.json'
LOCK = threading.Lock()
STOP = threading.Event()
WAKE = threading.Event()
STATE = {}
TOKEN = secrets.token_urlsafe(32)
INTERVAL = 5


def load_hosts():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding='utf-8'))['servers']
    return []


HOSTS = load_hosts()


def sample(host):
    started = time.time()
    try:
        completed = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=1',
            host, 'python3 -'], input=(ROOT/'collector.py').read_text(), stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, universal_newlines=True, timeout=18)
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip() or 'SSH 连接失败')
        data = json.loads(completed.stdout)
        data.update(status='online', updated=time.time(), latency_ms=round((time.time()-started)*1000), error=None)
    except Exception as exc:
        data = dict(status='offline', checked=time.time(), error=str(exc)[:500])
    with LOCK:
        if host not in HOSTS:
            return
        previous = STATE.get(host, {})
        history = previous.get('history', [])
        if data['status'] == 'online':
            gpu = [g['util'] for g in data['gpus'] if g['util'] is not None]
            history = (history + [dict(time=data['updated'],cpu=data['cpu_percent'],memory=data['memory_percent'],gpu=sum(gpu)/len(gpu) if gpu else None)])[-120:]
        else:
            data = dict(previous, **data)
        data['history'] = history
        STATE[host] = data


def monitor():
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        while not STOP.is_set():
            start = time.monotonic()
            with LOCK:
                hosts = list(HOSTS)
            list(pool.map(sample, hosts))
            WAKE.wait(max(0.1, INTERVAL-(time.monotonic()-start)))
            WAKE.clear()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, data, status=200, content_type='application/json; charset=utf-8'):
        body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host') in ('127.0.0.1:'+str(self.server.server_port), 'localhost:'+str(self.server.server_port))

    def do_GET(self):
        if not self.valid_host():
            return self.send({'error':'Invalid host'},403)
        if self.path == '/api/state':
            with LOCK:
                payload = json.dumps(dict(servers=[dict(alias=h, **STATE.get(h, dict(status='loading',history=[]))) for h in HOSTS],interval=INTERVAL,token=TOKEN),ensure_ascii=False).encode()
            return self.send(payload)
        if self.path in ('/', '/index.html'):
            return self.send((ROOT/'web/index.html').read_bytes(),content_type='text/html; charset=utf-8')
        self.send({'error':'Not found'},404)

    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Monitor-Token') != TOKEN:
            return self.send({'error':'请求验证失败'},403)
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length < 4096:
                raise ValueError('请求过大或为空')
            body = json.loads(self.rfile.read(length))
            if self.path != '/api/servers':
                return self.send({'error':'Not found'},404)
            host = body.get('alias','').strip()
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}',host):
                raise ValueError('请填写 SSH Host 别名（字母、数字、点、横线或下划线）')
            with LOCK:
                new_hosts = list(HOSTS)
                if body.get('action') == 'remove':
                    new_hosts = [h for h in new_hosts if h != host]
                elif body.get('action') == 'add':
                    if host not in new_hosts:
                        if len(new_hosts) >= 16:
                            raise ValueError('当前最多支持 16 台服务器')
                        new_hosts.append(host)
                else:
                    raise ValueError('未知操作')
                tmp = CONFIG.with_suffix('.tmp')
                tmp.write_text(json.dumps({'servers':new_hosts},ensure_ascii=False,indent=2),encoding='utf-8')
                os.replace(str(tmp),str(CONFIG))
                HOSTS[:] = new_hosts
                if body.get('action') == 'remove':
                    STATE.pop(host,None)
            WAKE.set()
            self.send({'ok':True})
        except (ValueError,OSError) as exc:
            self.send({'error':str(exc)},400)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    args = parser.parse_args()
    http = ThreadingHTTPServer(('127.0.0.1', args.port),Handler)
    threading.Thread(target=monitor,daemon=True).start()
    print('服务器资源监控器：http://127.0.0.1:%d · Ctrl+C 停止' % args.port,flush=True)
    try:
        http.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STOP.set()
        WAKE.set()
        http.server_close()
