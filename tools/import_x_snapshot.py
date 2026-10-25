import zipfile, sys, json, re, hashlib
from pathlib import Path
from urllib.parse import unquote, urlsplit
from datetime import datetime, timezone
from html.parser import HTMLParser
from dataclasses import dataclass, field

@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()
    def text(self):
        if self.tag == 'img': return self.attrs.get('alt', '')
        if self.tag == 'br': return '\n'
        return ''.join(c.text() if isinstance(c, Node) else c for c in self.children)
    def find(self, **attrs):
        return next((n for n in self.walk() if all(n.attrs.get(k) == v for k,v in attrs.items())), None)

class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs)); self.stack[-1].children.append(node)
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:
            self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; break
    def handle_data(self, text): self.stack[-1].children.append(text)

def import_snapshot(archive_path):
    root = Path(__file__).resolve().parent.parent
    z = zipfile.ZipFile(archive_path)
    html_names = [n for n in z.namelist() if n.lower().endswith(('.html', '.htm')) and '/' not in n.strip('/')]
    if len(html_names) != 1: raise ValueError('Expected one saved HTML page in the ZIP')
    html_name = html_names[0]
    tree = Tree(); tree.feed(z.read(html_name).decode('utf-8'))
    media_dir = root / 'public/local-snapshot'
    copied = set()
    def local_image(src):
        # Only copy image bytes actually present in the ZIP. Never execute HTML/scripts or fetch URLs.
        path = unquote(src.removeprefix('./'))
        if path not in z.namelist(): return None
        payload = z.read(path)
        ext = '.jpg' if payload.startswith(b'\xff\xd8\xff') else '.png' if payload.startswith(b'\x89PNG\r\n\x1a\n') else '.webp' if payload[:4] == b'RIFF' and payload[8:12] == b'WEBP' else None
        if ext is None: return None
        name = hashlib.sha256(payload).hexdigest()[:24] + ext
        media_dir.mkdir(parents=True, exist_ok=True)
        (media_dir / name).write_bytes(payload); copied.add(name)
        return '/local-snapshot/' + name
    posts = []
    seen = set()
    for a in tree.root.walk():
        if a.tag != 'article' or a.attrs.get('data-testid') != 'tweet': continue
        source = next((n.attrs['href'] for n in a.walk() if n.tag == 'a' and re.fullmatch(r'https://x.com/\w+/status/\d+', n.attrs.get('href',''))), None)
        if not source: continue
        handle, post_id = re.search(r'x.com/(\w+)/status/(\d+)', source).groups()
        if post_id in seen: continue
        seen.add(post_id)
        users = [n for n in a.walk() if n.attrs.get('data-testid') == 'User-Name']
        texts = [n.text() for n in a.walk() if n.attrs.get('data-testid') == 'tweetText']
        name = users[0].text().split('@')[0].strip() if users else handle
        time = next((n.attrs.get('datetime') for n in a.walk() if n.tag == 'time'), None)
        if not time: continue
        imgs = [n for n in a.walk() if n.tag == 'img']
        avatar = local_image(imgs[0].attrs.get('src','')) if imgs else None
        media = []
        for photo in [n for n in a.walk() if n.attrs.get('data-testid') == 'tweetPhoto']:
            for img in [n for n in photo.walk() if n.tag == 'img']:
                local = local_image(img.attrs.get('src',''))
                if local and local not in media: media.append(local)
        group = next((n.attrs.get('aria-label','') for n in a.walk() if n.attrs.get('role') == 'group' and 'views' in n.attrs.get('aria-label','')), '')
        def count(noun):
            match = re.search(r'([\d,]+) '+noun,group)
            return int(match[1].replace(',','')) if match else 0
        videos = any(n.tag == 'video' for n in a.walk())
        post = dict(id=post_id,sourceUrl=source,author=name,handle=handle,createdAt=time,
            text=texts[0] if texts else '',avatarUrl=avatar,mediaUrls=media,hasMedia=bool(media),
            likes=count('likes?'),retweets=count('reposts?'),replyCount=count('replies'),viewCount=count('views'),
            tags=['saved-x-page'],truncated='Show more' in a.text(),videoNotSaved=videos)
        if len(users)>1 and len(texts)>1:
            user_text=users[1].text()
            match=re.search(r'@(\w+)',user_text)
            post['quote'] = dict(author=user_text.split('@')[0].strip(),handle=match[1] if match else '',text=texts[1])
        posts.append(post)
    if not posts: raise ValueError('No rendered X posts found; existing snapshot was not changed')
    data = dict(source='User-provided saved X Home page',importedAt=datetime.now(timezone.utc).isoformat(),posts=posts)
    (root/'data').mkdir(exist_ok=True)
    (root/'data/x-snapshot.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(posts=len(posts),localImages=len(copied),truncated=sum(p['truncated'] for p in posts),videosNotSaved=sum(p['videoNotSaved'] for p in posts))))

if __name__ == '__main__':
    if len(sys.argv)!=2: raise SystemExit('Usage: python tools/import_x_snapshot.py path/to/saved-page.zip')
    import_snapshot(sys.argv[1])
