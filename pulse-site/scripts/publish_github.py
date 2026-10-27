"""Upload the reviewed website with GitHub CLI, preserving a private repository.

Uses the Git Data API to retain unrelated files. No credential is read or saved.
Ref update is fast-forward only; an intervening update fails safely.
"""
from pathlib import Path
import argparse,json,subprocess,hashlib
p=argparse.ArgumentParser();p.add_argument('--repo',default='yitaozhengacademic-eng/pulse-hemoglobin-workbench');p.add_argument('--gh',default='/Users/zyt/.local/bin/gh');p.add_argument('--install-workflow',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1]
def api(endpoint,body=None):
    cmd=[a.gh,'api',endpoint]
    if body is not None:cmd+=['--method','POST','--input','-']
    r=subprocess.run(cmd,input=None if body is None else json.dumps(body),text=True,capture_output=True,check=False)
    if r.returncode:raise RuntimeError(r.stderr.strip()+' '+r.stdout[:600])
    return json.loads(r.stdout)
repo=api(f'repos/{a.repo}')
assert repo['private'] is True,'Refusing upload to a non-private repository'
head=api(f'repos/{a.repo}/git/ref/heads/main')['object']['sha']
base=api(f'repos/{a.repo}/git/commits/{head}')['tree']['sha']
tree=[];inventory=[]
for path in sorted(root.rglob('*')):
    if not path.is_file():continue
    rel=path.relative_to(root)
    if any(x in {'.git','__pycache__','qa','deployment-private','node_modules'} for x in rel.parts) or path.name=='.DS_Store':continue
    content=path.read_text()
    tree.append(dict(path='pulse-site/'+rel.as_posix(),mode='100644',type='blob',content=content))
    inventory.append(dict(path=rel.as_posix(),bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
if a.install_workflow:
    tree.append(dict(path='.github/workflows/pulse-pages.yml',mode='100644',type='blob',content=(root/'docs/pulse-pages.yml').read_text()))
new_tree=api(f'repos/{a.repo}/git/trees',dict(base_tree=base,tree=tree))['sha']
commit=api(f'repos/{a.repo}/git/commits',dict(message='Add English PULSE teaching workbench with local inference and city environmental updates',tree=new_tree,parents=[head]))['sha']
# PATCH specifically, rather than the helper's POST.
result=subprocess.run([a.gh,'api',f'repos/{a.repo}/git/refs/heads/main','--method','PATCH','--input','-'],input=json.dumps(dict(sha=commit,force=False)),text=True,capture_output=True)
if result.returncode:raise RuntimeError(result.stderr+' '+result.stdout[:600])
confirmed=api(f'repos/{a.repo}/git/ref/heads/main')['object']['sha']
assert confirmed==commit
receipt=dict(repository=a.repo,private=True,commit=commit,previous_head=head,source_url=f'https://github.com/{a.repo}/tree/main/pulse-site',files=inventory)
out=root/'deployment-private';out.mkdir(exist_ok=True);(out/'github-upload.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({k:v for k,v in receipt.items() if k!='files'}));print('Uploaded files:',len(tree))
