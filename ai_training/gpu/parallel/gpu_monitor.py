"""通过Windows PDH读取GPU引擎占用；无法读取时明确标记未知。"""
import ctypes as c
import os
import re
import threading
import time


class ValueUnion(c.Union):
    _fields_ = [('doubleValue', c.c_double), ('largeValue', c.c_int64)]


class CounterValue(c.Structure):
    _fields_ = [('status', c.c_uint32), ('value', ValueUnion)]


class Item(c.Structure):
    _fields_ = [('name', c.c_wchar_p), ('counter', CounterValue)]


class GpuMonitor:
    def __init__(self):
        self.latest = {'available': False, 'reason': '等待两次PDH采样'}
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def run(self):
        query = c.c_void_p()
        try:
            pdh = c.WinDLL('pdh.dll')
            def bind(name, args):
                fn = getattr(pdh, name); fn.argtypes = args; fn.restype = c.c_uint32; return fn
            open_query = bind('PdhOpenQueryW', [c.c_wchar_p, c.c_size_t, c.POINTER(c.c_void_p)])
            add = bind('PdhAddEnglishCounterW', [c.c_void_p, c.c_wchar_p, c.c_size_t, c.POINTER(c.c_void_p)])
            collect = bind('PdhCollectQueryData', [c.c_void_p])
            values = bind('PdhGetFormattedCounterArrayW', [c.c_void_p, c.c_uint32, c.POINTER(c.c_uint32), c.POINTER(c.c_uint32), c.c_void_p])
            close = bind('PdhCloseQuery', [c.c_void_p])
            counter = c.c_void_p()
            for status in [open_query(None, 0, c.byref(query)), add(query, r'\GPU Engine(*)\Utilization Percentage', 0, c.byref(counter))]:
                if status: raise RuntimeError(f'PDH初始化错误0x{status:08x}')
            collect(query)
            while not self.stopped.wait(1.):
                status = collect(query)
                if status: raise RuntimeError(f'PDH采样错误0x{status:08x}')
                size, count = c.c_uint32(), c.c_uint32()
                status = values(counter, 0x200 | 0x8000, c.byref(size), c.byref(count), None)
                if not size.value: continue
                buffer = c.create_string_buffer(size.value)
                status = values(counter, 0x200 | 0x8000, c.byref(size), c.byref(count), buffer)
                if status: continue
                rows = c.cast(buffer, c.POINTER(Item))
                own = {}; all_rows = []
                for i in range(count.value):
                    row = rows[i]
                    if row.counter.status not in (0, 1): continue
                    name, value = row.name, max(0., row.counter.value.doubleValue)
                    all_rows.append((name, value))
                    if name.startswith(f'pid_{os.getpid()}_'):
                        key = re.sub(r'^pid_\d+_', '', name)
                        own[key] = own.get(key, 0.) + value
                adapters = {key.split('_eng_')[0] for key in own}
                system = {}
                for name, value in all_rows:
                    key = re.sub(r'^pid_\d+_', '', name)
                    if key.split('_eng_')[0] in adapters:
                        system[key] = system.get(key, 0.) + value
                self.latest = dict(available=bool(own), epoch=time.time(), processMaxEnginePercent=min(100., max(own.values(), default=0.)),
                                   adapterMaxEnginePercent=min(100., max(system.values(), default=0.)), engines=own,
                                   reason=None if own else '尚无当前GPU进程的引擎实例')
        except Exception as error:
            self.latest = dict(available=False, reason=repr(error))
        finally:
            if query.value:
                try: close(query)
                except Exception: pass

    def close(self):
        self.stopped.set(); self.thread.join(timeout=2)
