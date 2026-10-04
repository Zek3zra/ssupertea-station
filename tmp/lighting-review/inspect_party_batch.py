from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import numpy as np,json
src=Path(r'C:\Users\Jerow Amelo\Documents\DCIM\276_FUJI')
work=Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\party-batch-276');work.mkdir(exist_ok=True)
files=sorted(p for p in src.iterdir() if p.suffix.lower() in ['.jpg','.jpeg','.png','.tif','.tiff'])
print(f'Found {len(files)} photos',flush=True)
records=[]
for start in range(0,len(files),24):
    group=files[start:start+24];canvas=Image.new('RGB',(1600,1800),'#202020');draw=ImageDraw.Draw(canvas)
    for j,p in enumerate(group):
        with Image.open(p) as raw:
            im=ImageOps.exif_transpose(raw).convert('RGB');im.thumbnail((392,266))
            a=np.asarray(im,dtype=np.float32)/255;y=a@np.array([.2126,.7152,.0722])
            records.append({'file':p.name,'size':raw.size,'orientation':raw.getexif().get(274),'p50':float(np.percentile(y,50)),'p80':float(np.percentile(y,80)),'p95':float(np.percentile(y,95))})
            x=(j%4)*400;yy=(j//4)*300;canvas.paste(im,(x,yy));draw.text((x+8,yy+273),p.name,fill='white')
    canvas.save(work/f'originals-{start//24+1}.jpg',quality=90)
    print(f'Inspected {min(start+24,len(files))}/{len(files)} source files',flush=True)
(work/'source-inventory.json').write_text(json.dumps(records,indent=2))
