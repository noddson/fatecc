#!/usr/bin/env python3
"""Audit reading destinations against official heading IDs; never import rule prose.

Run --refresh to refresh the heading-only snapshot, then --check to audit links
offline. Select --edition accelerated to audit that edition using the same workflow.
Reviewing and changing either reading-links mapping remains a deliberate step.
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


def refresh(mapping, snapshot_path):
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
    snapshot_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
    print(f'Recorded heading labels and IDs for {len(pages)} official pages; no rule prose saved.')


def check(mapping, snapshot_path):
    snapshot = json.loads(snapshot_path.read_text())
    if snapshot['baseUrl'] != mapping['baseUrl']:
        raise ValueError('Heading snapshot belongs to another rules system.')
    for section in mapping['sections']:
        page, _, anchor = section['path'].partition('#')
        headings = snapshot['pages'][page]
        if anchor and unquote(anchor) not in {heading['id'] for heading in headings}:
            raise ValueError(f"Missing official heading: {section['path']}")
    print(f"Verified {len(mapping['sections'])} reading boundaries against {len(snapshot['pages'])} pages.")


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--edition', choices=['core', 'accelerated'], default='core',
                      help='Rules library to audit (Core is the existing default)')
    args.add_argument('--refresh', action='store_true', help='Fetch official pages for heading metadata only')
    args.add_argument('--check', action='store_true', help='Verify curated destinations offline')
    options = args.parse_args()
    prefix = 'accelerated-' if options.edition == 'accelerated' else ''
    mapping = json.loads((CONTENT / f'{prefix}reading-links.json').read_text())
    snapshot_path = CONTENT / f'{prefix}reading-headings.json'
    if options.refresh:
        refresh(mapping, snapshot_path)
    if options.check or not options.refresh:
        check(mapping, snapshot_path)
