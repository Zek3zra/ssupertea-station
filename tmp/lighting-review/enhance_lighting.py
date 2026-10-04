from pathlib import Path
import argparse, hashlib, json
import numpy as np
from PIL import Image, ImageOps, ImageDraw

SOURCE = Path(r'C:\Users\Jerow Amelo\Documents\to be edit')
WORK = Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\lighting-review')
FILES = sorted(SOURCE.glob('*.JPG'))

def strength_for(im):
    sample = im.copy()
    sample.thumbnail((600, 400))
    a = np.asarray(sample, dtype=np.float32) / 255
    y = a @ np.array([.2126, .7152, .0722], dtype=np.float32)
    return float(np.clip(.72 + (.43 - np.median(y)) * .8, .58, .96))

def enhance(im, strength):
    # One identical gain for all RGB channels; no spatial processing or synthesis.
    # The curve anchors black and white and cannot create clipped highlights.
    a = np.asarray(im, dtype=np.float32) / 255
    peak = a.max(axis=2, keepdims=True)
    gain = 1 + strength * (1 - peak) ** 2
    return Image.fromarray(np.rint(a * gain * 255).clip(0,255).astype(np.uint8))

def preview():
    for start in range(0, len(FILES), 10):
        group=FILES[start:start+10]
        canvas=Image.new('RGB',(1440, 270*len(group)), '#202020')
        d=ImageDraw.Draw(canvas)
        for row,p in enumerate(group):
            with Image.open(p) as raw:
                s=strength_for(raw)
                im=ImageOps.exif_transpose(raw).convert('RGB')
                im.thumbnail((700,240))
                edited=enhance(im,s)
                y=row*270
                canvas.paste(im,(0,y))
                canvas.paste(edited,(720,y))
                d.text((8,y+246),p.name+' | Original',fill='white')
                d.text((728,y+246),f'Lighting enhanced | strength {s:.2f}',fill='white')
        canvas.save(WORK/f'comparison-{start//10+1}.jpg',quality=90)

def process():
    dest=WORK/'final'
    dest.mkdir(exist_ok=True)
    records=[]
    for i,p in enumerate(FILES,1):
        before=hashlib.sha256(p.read_bytes()).hexdigest()
        with Image.open(p) as raw:
            assert raw.mode=='RGB'
            strength=strength_for(raw)
            exif=raw.info.get('exif')
            icc=raw.info.get('icc_profile')
            out=enhance(raw,strength)
            opts={'quality':97,'subsampling':0,'optimize':True}
            if exif: opts['exif']=exif
            if icc: opts['icc_profile']=icc
            filename=dest/(p.stem+'_enhanced.JPG')
            out.save(filename,**opts)
            with Image.open(filename) as check:
                check.load()
                assert check.size==raw.size
                assert check.getexif().get(274)==raw.getexif().get(274)
                assert check.info.get('icc_profile')==icc
                a=np.asarray(raw.resize((600,400)),dtype=np.int16)
                b=np.asarray(check.resize((600,400)),dtype=np.int16)
                assert b.mean()>a.mean()
                records.append({'source':p.name,'output':filename.name,'dimensions':raw.size,'strength':strength,'source_sha256':before,'output_sha256':hashlib.sha256(filename.read_bytes()).hexdigest(),'mean_brightness_before':float(a.mean()),'mean_brightness_after':float(b.mean())})
        assert hashlib.sha256(p.read_bytes()).hexdigest()==before
        print(f'{i}/{len(FILES)} saved and verified: {filename.name}',flush=True)
    (WORK/'verification.json').write_text(json.dumps(records,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['preview','process'])
    args=parser.parse_args()
    preview() if args.mode=='preview' else process()
