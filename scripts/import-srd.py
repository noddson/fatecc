#!/usr/bin/env python3
"""Generate offline Core references from the pinned fate-srd-content repository source.

python3 scripts/import-srd.py                 # use the vendored, verified source
python3 scripts/import-srd.py /path/to/clone  # use a checkout of the pinned repository
python3 scripts/import-srd.py --check         # verify reproducibility without writing

No downloads, website scraping, PDF extraction, or upstream code execution.
The upstream Core Markdown is abridged OGL; this conversion uses its CC-BY original.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'src/content'
ATTRIBUTION = 'This work is based on Fate Core System and Fate Accelerated Edition (found at http://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).'
TRANSFORMATION = ('The pinned repository CC-BY HTML is converted into local Markdown and heading-based '
                  'plain-text entries. Whitespace and list/table layout are normalized; links retain their '
                  'visible text; styling, images, chapter-number decorations, and empty graphic placeholders '
                  'are omitted. Rule text and examples are retained. The upstream abridged OGL Core '
                  'Markdown is not used. Other editions and supplements are catalogued, not imported.')


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def clean(value):
    value = value.replace('\xa0', ' ').replace('\u200b', '').replace('\ufffc', '')
    value = re.sub(r'\[Insert[^\]]*\]', '', value, flags=re.I)
    value = re.sub(r'[ \t]+', ' ', value)
    value = re.sub(r' *\n *', '\n', value)
    return re.sub(r'\n{3,}', '\n\n', value).strip()


def category(chapter):
    value = chapter.lower()
    if 'skills' in value: return 'Skills & stunts'
    if 'extras' in value: return 'Extras'
    if 'character' in value: return 'Characters'
    if 'aspects' in value: return 'Aspects & Fate points'
    if 'actions' in value: return 'Actions & outcomes'
    if 'challenges' in value: return 'Challenges & conflicts'
    if any(word in value for word in ('game creation', 'long game', 'scenes')):
        return 'Campaigns & advancement'
    if 'running' in value: return 'Running the game'
    if value == 'fate core system': return 'About'
    return 'Basics'


class Reader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections = []
        self.parts = []
        self.heading = None
        self.heading_parts = []
        self.title = 'Fate Core System — attribution'
        self.chapter = 'Fate Core System'
        self.level = 1
        self.line = 1
        self.has_heading = False
        self.skip_tag = None
        self.skip_depth = 0
        self.in_table = False
        self.in_cell = False
        self.row_cells = []
        self.cell_parts = []

    def flush(self):
        body = clean(''.join(self.parts))
        self.parts = []
        if self.has_heading:
            self.sections.append(dict(title=self.title, chapter=self.chapter, level=self.level,
                                      line=self.line, body=body, category=category(self.chapter)))

    def handle_starttag(self, tag, attrs):
        if self.skip_tag:
            if tag == self.skip_tag: self.skip_depth += 1
            return
        attrs = dict(attrs)
        # Decorative title paragraphs contain only enlarged chapter numbers.
        if tag in ('head', 'script', 'style') or (tag == 'p' and 'Title' in attrs.get('class', '').split()):
            self.skip_tag, self.skip_depth = tag, 1
            return
        if tag == 'table':
            self.in_table = True
            self.parts.append('\n\n')
            return
        if self.in_table:
            if tag == 'tr': self.row_cells = []
            if tag in ('td', 'th'):
                self.in_cell, self.cell_parts = True, []
            elif tag in ('p', 'br', 'li') and self.in_cell:
                self.cell_parts.append(' ')
            return
        if re.fullmatch(r'h[1-6]', tag):
            self.flush()
            self.heading = tag
            self.heading_parts = []
            self.line = self.getpos()[0]
        if tag in ('p', 'div', 'ul', 'ol', 'table', 'tr', 'blockquote', 'hr'):
            self.parts.append('\n\n')
        if tag == 'li': self.parts.append('\n- ')
        if tag == 'br':
            (self.heading_parts if self.heading else self.parts).append(' ' if self.heading else '\n')
        if tag in ('td', 'th'): self.parts.append(' | ')

    def handle_endtag(self, tag):
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_depth -= 1
                if not self.skip_depth: self.skip_tag = None
            return
        if self.in_table:
            if tag in ('td', 'th'):
                self.row_cells.append(re.sub(r'\s+', ' ', clean(''.join(self.cell_parts))))
                self.in_cell = False
            elif tag == 'tr':
                self.parts.append(' | '.join(self.row_cells) + '\n')
            elif tag == 'table':
                self.in_table = False
                self.parts.append('\n\n')
            elif tag == 'p' and self.in_cell:
                self.cell_parts.append(' ')
            return
        if tag == self.heading:
            title = clean(''.join(self.heading_parts))
            self.title = title.title() if title.isupper() else title
            self.has_heading = True
            self.level = int(tag[1])
            if tag == 'h1': self.chapter = self.title
            self.heading = None
            self.heading_parts = []
        if tag in ('p', 'div', 'ul', 'ol', 'table', 'tr', 'blockquote', 'li'):
            self.parts.append('\n\n')

    def handle_data(self, data):
        if not self.skip_tag:
            if self.in_table:
                if self.in_cell: self.cell_parts.append(data)
            else:
                (self.heading_parts if self.heading else self.parts).append(data)


def markdown_body(body):
    # Keep normalized table rows readable in any Markdown renderer, without raw HTML.
    return '\n\n'.join('```text\n' + block + '\n```'
                       if block and all(' | ' in line for line in block.splitlines()) else block
                       for block in body.split('\n\n'))


def outputs(raw, lock):
    source = lock['selectedSource']
    sha256 = hashlib.sha256(raw).hexdigest()
    blob_sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if (sha256, blob_sha, len(raw)) != (source['sha256'], source['blobSha'], source['bytes']):
        raise ValueError('Source differs from the pinned GitHub blob. Review source-lock.json before updating.')
    parser = Reader()
    parser.feed(raw.decode('utf-8-sig'))
    parser.close()
    parser.flush()
    if not parser.sections or ATTRIBUTION not in parser.sections[0]['body']:
        raise ValueError('The selected source is missing its required CC-BY attribution.')
    source_url = f"{lock['repositoryUrl']}/blob/{lock['revision']}/{source['path']}"
    version = f"core-srd-github-{lock['revision'][:12]}-cc"
    reading_links = json.loads((TARGET / 'reading-links.json').read_text())
    if reading_links['sourceRevision'] != lock['revision']:
        raise ValueError('Review reading-page mappings for the new pinned source revision.')
    def reading_url(line):
        section = next(section for section in reversed(reading_links['sections'])
                       if section['sourceLine'] <= line)
        return reading_links['baseUrl'] + section['path']

    entries = []
    markdown = [
        '<!-- Generated by scripts/import-srd.py. Do not edit; original notices are preserved below. -->',
        f'<!-- Source: {source_url} -->',
        f'<!-- Source SHA-256: {sha256} -->',
        f'<!-- Changes: {TRANSFORMATION} -->', '',
    ]
    for section in parser.sections:
        markdown.extend(['#' * section['level'] + ' ' + section['title'], '',
                         markdown_body(section['body']), ''])
        if not section['body']:
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', section['title'].lower()).strip('-')
        entry = dict(id=f'core-{len(entries)+1:03d}-{slug}', title=section['title'],
                     category=section['category'], body=section['body'],
                     source='Fate Core SRD · GitHub · CC BY 3.0',
                     readingUrl=reading_url(section['line']),
                     sourceUrl=f"{source_url}#L{section['line']}",
                     sourceSection=section['title'], sourceLine=section['line'],
                     contentVersion=version, tags=[section['chapter'], 'Fate Core'])
        entries.append(entry)
    markdown_bytes = ('\n'.join(markdown).rstrip() + '\n').encode('utf-8')
    metadata = dict(title='Fate Core System SRD', version=version, converterVersion=1,
                    repository=lock['repository'], repositoryUrl=lock['repositoryUrl'],
                    revision=lock['revision'], sourceUrl=source_url, sourcePath=source['path'],
                    readingUrl='https://fate-srd.com/fate-core',
                    readingLinksVerifiedAt=reading_links['verifiedAt'],
                    sourceBlobSha=blob_sha, sourceSha256=sha256, sourceBytes=len(raw),
                    sourceFormat='HTML (original CC-BY SRD in the GitHub repository)',
                    markdownPath='src/content/source/fate-core.generated.md',
                    markdownSha256=hashlib.sha256(markdown_bytes).hexdigest(),
                    copyright='©2013 Evil Hat Productions, LLC.',
                    license='Creative Commons Attribution 3.0 Unported',
                    licenseUrl='https://creativecommons.org/licenses/by/3.0/',
                    licensingGuideUrl='https://fate-srd.com/official-licensing-fate',
                    attribution=ATTRIBUTION, transformation=TRANSFORMATION,
                    entryCount=len(entries))
    return {
        TARGET / 'source/fate-core-SRD.html': raw,
        TARGET / 'source/fate-core.generated.md': markdown_bytes,
        TARGET / 'reference.json': json_bytes(entries),
        TARGET / 'source-metadata.json': json_bytes(metadata),
    }, len(entries)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('checkout', nargs='?', type=Path, help='Local fate-srd-content checkout')
    cli.add_argument('--check', action='store_true', help='Verify generated outputs without writing')
    args = cli.parse_args()
    lock = json.loads((TARGET / 'source-lock.json').read_text())
    source = args.checkout / lock['selectedSource']['path'] if args.checkout else TARGET / 'source/fate-core-SRD.html'
    try:
        generated, count = outputs(source.read_bytes(), lock)
        if args.check:
            changed = [str(path.relative_to(ROOT)) for path, data in generated.items()
                       if not path.exists() or path.read_bytes() != data]
            if changed: raise ValueError('Generated content is out of date: ' + ', '.join(changed))
        else:
            for path, data in generated.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(path.suffix + '.tmp')
                temporary.write_bytes(data)
                temporary.replace(path)
        print(f'{"Verified" if args.check else "Generated"} {count} Core references from GitHub {lock["revision"]}.')
    except (OSError, ValueError) as error:
        cli.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
