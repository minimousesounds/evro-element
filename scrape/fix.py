p='scrape.py'; L=open(p,encoding='utf-8').read().split('\n')
NL=chr(92)+'n'
a=next(i for i,l in enumerate(L) if l.startswith('        md = f"# {title}'))
b=next(i for i,l in enumerate(L) if '(PAGES / f"{slug}.md").write_text' in l)
new=['        md = f"# {title}'+NL+NL+'Старый адрес: /{slug}.html'+NL+'Meta description: {meta(h, \'description\')}'+NL+'Meta robots: {meta(h, \'robots\')}'+NL+NL+'---'+NL+NL+'{text}'+NL+'"',
     '        if links:',
     '            md += "'+NL+NL+'## Ссылки в тексте'+NL+'" + "'+NL+'".join(f"- {l}" for l in links) + "'+NL+'"']
L[a:b]=new
s='\n'.join(L)
open(p,'w',encoding='utf-8').write(s)
