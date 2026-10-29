"""Read-only Linux metrics collector, sent to the remote Python interpreter over SSH."""
import csv
import io
import json
import os
import pwd
import socket
import subprocess
import time


def cpu():
    counters = {}
    with open('/proc/stat') as f:
        for line in f:
            fields = line.split()
            if fields and (fields[0] == 'cpu' or (fields[0].startswith('cpu') and fields[0][3:].isdigit())):
                values = [int(v) for v in fields[1:9]]
                counters[fields[0]] = (sum(values), values[3] + values[4])
    return counters


def utilization(before, after):
    if before is None or after is None or after[0] <= before[0] or after[1] < before[1]:
        return None
    return round(max(0, min(100, 100 * (1 - (after[1]-before[1]) / (after[0]-before[0])))), 1)


def number(value):
    try:
        return float(value.strip())
    except ValueError:
        return None


def process_user(pid):
    """Resolve the effective UID (the user running the process), without elevation."""
    if not str(pid).isdigit():
        return None
    try:
        with open('/proc/{}/status'.format(pid)) as status:
            for line in status:
                if line.startswith('Uid:'):
                    uid = int(line.split()[2])
                    try:
                        return pwd.getpwuid(uid).pw_name
                    except KeyError:
                        return 'UID {}'.format(uid)
    except (OSError, ValueError, IndexError):
        pass
    return None


def collect():
    a = cpu()
    time.sleep(0.4)
    b = cpu()
    memory = {}
    with open('/proc/meminfo') as f:
        for line in f:
            key, value = line.split(':', 1)
            memory[key] = int(value.strip().split()[0]) * 1024
    total = memory['MemTotal']
    available = memory.get('MemAvailable', memory.get('MemFree', 0))
    result = dict(hostname=socket.gethostname(), cpu_percent=utilization(a.get('cpu'), b.get('cpu')) or 0.0,
                  cpu_count=os.cpu_count(), cpu_cores=[dict(id=int(key[3:]), percent=utilization(a.get(key), b[key])) for key in sorted((key for key in b if key != 'cpu'), key=lambda key: int(key[3:]))], load=list(os.getloadavg()), memory_total=total,
                  memory_used=total-available, memory_percent=round(100*(total-available)/total,1),
                  gpus=[], processes=[], gpu_error=None)
    keys = ['index', 'name', 'uuid', 'utilization.gpu', 'memory.used', 'memory.total', 'temperature.gpu', 'power.draw', 'power.limit']
    try:
        output = subprocess.check_output(['nvidia-smi', '--query-gpu='+','.join(keys), '--format=csv,noheader,nounits'], stderr=subprocess.STDOUT, timeout=5).decode()
        for row in csv.reader(io.StringIO(output)):
            if len(row) == len(keys):
                result['gpus'].append(dict(zip(['index','name','uuid','util','used','total','temp','power','power_limit'],
                    [row[0].strip(),row[1].strip(),row[2].strip()]+[number(x) for x in row[3:]])))
    except (OSError, subprocess.SubprocessError) as exc:
        result['gpu_error'] = str(exc)[:300]
    try:
        output = subprocess.check_output(['nvidia-smi', '--query-compute-apps=gpu_uuid,pid,process_name,used_gpu_memory', '--format=csv,noheader,nounits'], stderr=subprocess.DEVNULL, timeout=5).decode()
        for row in csv.reader(io.StringIO(output)):
            if len(row) == 4:
                result['processes'].append(dict(uuid=row[0].strip(),pid=row[1].strip(),name=row[2].strip(),memory=number(row[3]),user=process_user(row[1].strip())))
    except (OSError, subprocess.SubprocessError):
        pass
    return result


if __name__ == '__main__':
    print(json.dumps(collect()))
