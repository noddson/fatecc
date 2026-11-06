#!/usr/bin/env python3
"""Audit reading destinations against official heading IDs; never import rule prose.

Run --refresh to refresh the heading-only snapshot, then --check to audit links
offline. Reviewing and changing reading-links.json remains a deliberate step.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import unicodedata
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'src/content'


def normalized(title):
    return ''.join(c for c in unicodedata.normalize('NFKD', title).casefold() if c.isalnum())


class Headings(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.headings = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.current = {'level': int(tag[1]), 'id': dict(attrs).get('id', ''), 'text': ''}

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data

    def handle_endtag(self, tag):
        if self.current is not None and tag == f"h{self.current['level']}":
            self.current['text'] = ' '.join(self.current['text'].split())
            if self.current['id'] or self.current['level'] == 1:
                self.headings.append(self.current)
            self.current = None


def refresh(mapping):
    paths = sorted({section['path'].split('#')[0] for section in mapping['sections']})

    def read(path):
        result = subprocess.run(
            ['curl', '-fsSL', '--retry', '2', '--max-time', '30', mapping['baseUrl'] + path],
            check=True, capture_output=True, text=True,
        )
        parser = Headings()
        parser.feed(result.stdout)
        if not parser.headings:
            raise ValueError(f'No headings returned for {path}')
        return path, parser.headings

    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = dict(pool.map(read, paths))
    snapshot = {'baseUrl': mapping['baseUrl'], 'verifiedAt': date.today().isoformat(), 'pages': pages}
    (CONTENT / 'reading-headings.json').write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
    print(f'Recorded heading labels and IDs for {len(pages)} official pages; no rule prose saved.')


def check(mapping):
    snapshot = json.loads((CONTENT / 'reading-headings.json').read_text())
    for section in mapping['sections']:
        page, _, anchor = section['path'].partition('#')
        headings = snapshot['pages'][page]
        if anchor and unquote(anchor) not in {heading['id'] for heading in headings}:
            raise ValueError(f"Missing official heading: {section['path']}")
    print(f"Verified {len(mapping['sections'])} reading boundaries against {len(snapshot['pages'])} pages.")


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--refresh', action='store_true', help='Fetch official pages for heading metadata only')
    args.add_argument('--check', action='store_true', help='Verify curated destinations offline')
    options = args.parse_args()
    mapping = json.loads((CONTENT / 'reading-links.json').read_text())
    if options.refresh:
        refresh(mapping)
    if options.check or not options.refresh:
        check(mapping)
