"""Simple file-based JSON cache with TTL."""

import json
import os
import time

_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')


def _path(key):
    return os.path.join(_CACHE_DIR, f'{key}.json')


def get(key, ttl=3600):
    path = _path(key)
    if not os.path.exists(path):
        return None
    if time.time() - os.path.getmtime(path) > ttl:
        return None
    with open(path) as f:
        return json.load(f)


def set(key, data):
    os.makedirs(_CACHE_DIR, exist_ok=True)
    with open(_path(key), 'w') as f:
        json.dump(data, f, indent=2, default=str)


def invalidate(key):
    path = _path(key)
    if os.path.exists(path):
        os.remove(path)


def invalidate_all():
    if not os.path.isdir(_CACHE_DIR):
        return
    for fname in os.listdir(_CACHE_DIR):
        if fname.endswith('.json'):
            os.remove(os.path.join(_CACHE_DIR, fname))
