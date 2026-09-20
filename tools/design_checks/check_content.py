#!/usr/bin/env python3
"""Check a running redesign against the legacy site's links and content counts.

Usage: python3 tools/design_checks/check_content.py http://localhost:8082/
Only the Python standard library is required.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import urljoin
from urllib.request import Request, urlopen

SITE = Path(__file__).resolve().parents[2]
REPO = SITE / 'oldv'


class Inventory(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.links = set()
        self.assets = set()
        self.classes = Counter()
        self.ids = set()
        self.feed(re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', source, flags=re.S | re.I))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.links.add(normalize(attrs['href']))
        if tag in ('img', 'video', 'track', 'script', 'link'):
            src = attrs.get('src') or attrs.get('data-src') or (attrs.get('href') if tag == 'link' else '')
            if src and src.startswith('/') and not src.startswith('/cdn-cgi/'):
                self.assets.add(src)
        self.classes.update(attrs.get('class', '').split())
        if 'id' in attrs:
            self.ids.add(attrs['id'])


def normalize(link):
    if link.startswith('/cdn-cgi/l/email-protection#'):
        encoded = bytes.fromhex(link.split('#', 1)[1])
        link = 'mailto:' + bytes(value ^ encoded[0] for value in encoded[1:]).decode('utf-8')
    return (link.strip().replace('https://vlang.io/compare', '/compare')
            .replace('/#', '#').replace('@@', '@')
            .replace('vlang.veery.cc', 'vlang.veery.blog')
            # The old PayPal URL omitted HTML escaping for &currency_code.
            .replace('¤cy_code', '&currency_code'))


def read_url(url):
    request = Request(url, headers={'User-Agent': 'VWebsiteContentCheck/1.0 bot'})
    with urlopen(request, timeout=20) as response:
        assert response.status == 200, (url, response.status)
        return response.read().decode('utf-8')


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8082/'
    if not base.endswith('/'):
        base += '/'
    legacy = Inventory((REPO / 'index.html').read_text() + (REPO / '_layout.html').read_text())
    homepage = read_url(base)
    current = Inventory(homepage)
    missing = legacy.links - current.links
    assert not missing, f'Legacy links are missing: {sorted(missing)}'
    expected = {'news-card': 27, 'review-card': 25, 'project-card': 18,
                'feature-detail': 15, 'example-code': 5}
    for name, count in expected.items():
        assert current.classes[name] == count, (name, current.classes[name], count)
    for asset in current.assets:
        local = SITE / 'static' / asset.lstrip('/').split('?')[0]
        assert local.is_file(), f'Missing asset: {asset}'
    for link in current.links:
        if link.startswith('#'):
            assert link[1:] in current.ids, f'Missing anchor: {link}'
    compare = read_url(urljoin(base, 'compare'))
    old_comparison = Inventory((REPO / 'compare.html').read_text())
    assert old_comparison.links <= Inventory(compare).links, 'Comparison links are missing'
    assert 'simple_language_for_maintainable_programs' not in homepage, 'Translations did not load; run from the repository root'
    assert '<html lang="en"' in homepage
    print('Content parity passed: all legacy links, 27 news entries, 25 reviews, '
          '18 projects, 15 feature groups, five examples, comparison page, and local assets.')


if __name__ == '__main__':
    main()
