from pathlib import Path
import argparse, json, hashlib
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageFilter

SOURCE=Path(r'C:\Users\Jerow Amelo\Documents\to be edit')
WORK=Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\lighting-review\revision-2')
WORK.mkdir(exist_ok=True)
FILES=sorted(SOURCE.glob('*.JPG'))
WEIGHTS=np.array([.2126,.7152,.0722],dtype=np.float32)

# Natural warmth retained; gently compensate the indoor yellow illumination.
def settings(im, name):
    sample=im.copy(); sample.thumbnail((600,400))
    a=np.asarray(sample,dtype=np.float32)/255
    y=a@WEIGHTS
    mid=y[(y>.10)&(y<.78)]
    m=float(np.median(mid))
    gamma=float(np.clip(np.log(.56)/np.log(max(m,.05)),.60,.75))
    daylight=name in ['DSCF5904','DSCF5906','DSCF5907','DSCF5976','DSCF5981','DSCF5982','DSCF6001','DSCF6009']
    wb=np.array([.99,1.005,1.045] if daylight else [.98,1.012,1.13],dtype=np.float32)
    scene_gamma = {5894:.74,5896:.60,5898:.66,5899:.66,5902:.63,5903:.65,5904:.65,5906:.65,5907:.65,5908:.68,5910:.70,5952:.63,5953:.63,5954:.63,5957:.70,5958:.70,5976:.69,5981:.67,5982:.69,5990:.64,5996:.61,5997:.61,5998:.61,5999:.61,6001:.61,6009:.61,6011:.65,6012:.65,6013:.66,6019:.66,6020:.66,6021:.66,6024:.67,6030:.67,6031:.67,6034:.68,6035:.68,6037:.68,6038:.68}
    return scene_gamma[int(name[4:])],wb

def enhance(im,name):
    gamma,wb=settings(im,name)
    small=im.copy(); small.thumbnail((360,360))
    a=np.asarray(small,dtype=np.float32)/255
    ys=(a*wb)@WEIGHTS
    # A broad, feathered illumination mask evens the fill without touching detail.
    mask=Image.fromarray(np.rint(ys.clip(0,1)*255).astype('uint8')).filter(ImageFilter.GaussianBlur(18))
    mask=mask.resize(im.size,Image.Resampling.BILINEAR)
    result=Image.new('RGB',im.size)
    # Process in strips to retain the full camera resolution without excess memory.
    for top in range(0,im.height,256):
        box=(0,top,im.width,min(top+256,im.height))
        rgb=np.asarray(im.crop(box),dtype=np.float32)/255
        rgb=rgb*wb
        y=rgb@WEIGHTS
        illumination=np.asarray(mask.crop(box),dtype=np.float32)/255
        g=gamma + .32*(illumination-.45)
        toe=.009
        target=((np.maximum(y,0)+toe)**g-toe**g)/((1+toe)**g-toe**g)
        target=target.clip(0,1)
        gain=target/np.maximum(y,.00001)
        out=target[...,None]+(rgb-y[...,None])*np.power(gain,.65)[...,None]
        # Compress chroma smoothly at the gamut boundary instead of clipping channels.
        delta=out-target[...,None]
        high=np.max(delta,axis=2)
        low=-np.min(delta,axis=2)
        chroma=np.minimum(1,np.minimum((1-target)/np.maximum(high,.00001),target/np.maximum(low,.00001)))
        out=target[...,None]+delta*chroma[...,None]
        result.paste(Image.fromarray(np.rint(out.clip(0,1)*255).astype('uint8')),(0,top))
    return result,{'gamma':gamma,'white_balance':wb.tolist()}

def preview():
    thumbs=[]
    samples={'DSCF5896','DSCF5906','DSCF5997','DSCF6012','DSCF6038'}
    for i,p in enumerate(FILES):
        with Image.open(p) as raw:
            im=ImageOps.exif_transpose(raw).convert('RGB'); im.thumbnail((1200,1200))
            out,params=enhance(im,p.stem)
            out.save(WORK/(p.stem+'-preview.jpg'),quality=94)
            if p.stem in samples:
                canvas=Image.new('RGB',(im.width*2,im.height+36),'#202020')
                canvas.paste(im,(0,36));canvas.paste(out,(im.width,36))
                d=ImageDraw.Draw(canvas);d.text((16,12),'ORIGINAL',fill='white');d.text((im.width+16,12),'REVISED LIGHTING',fill='white')
                canvas.save(WORK/(p.stem+'-comparison.jpg'),quality=94)
            im.thumbnail((450,300));out.thumbnail((450,300));thumbs.append((p.name,im.copy(),out.copy()))
            print(p.stem,params,flush=True)
    for start in range(0,len(thumbs),10):
        group=thumbs[start:start+10]
        canvas=Image.new('RGB',(920,330*len(group)),'#202020');d=ImageDraw.Draw(canvas)
        for i,(name,original,edited) in enumerate(group):
            y=i*330;canvas.paste(original,(0,y));canvas.paste(edited,(460,y))
            d.text((8,y+305),name+' original',fill='white');d.text((468,y+305),'Revised lighting',fill='white')
        canvas.save(WORK/f'review-{start//10+1}.jpg',quality=92)

def process():
    dest=WORK/'final';dest.mkdir(exist_ok=True);records=[]
    for i,p in enumerate(FILES,1):
        digest=hashlib.sha256(p.read_bytes()).hexdigest()
        with Image.open(p) as raw:
            out,params=enhance(raw,p.stem)
            filename=dest/(p.stem+'_enhanced_v2.JPG')
            opts={'quality':97,'subsampling':0,'optimize':True}
            for key in ['exif','icc_profile']:
                if raw.info.get(key):opts[key]=raw.info[key]
            out.save(filename,**opts)
            with Image.open(filename) as check:
                check.load();assert check.size==raw.size
                assert check.getexif().get(274)==raw.getexif().get(274)
                assert check.info.get('icc_profile')==raw.info.get('icc_profile')
                before=np.asarray(raw.resize((600,400)),dtype=np.float32)
                after=np.asarray(check.resize((600,400)),dtype=np.float32)
                assert after.mean()>before.mean()+8
                records.append({'source':p.name,'output':filename.name,'parameters':params,'source_sha256':digest,'output_sha256':hashlib.sha256(filename.read_bytes()).hexdigest(),'dimensions':raw.size,'mean_brightness_before':float(before.mean()),'mean_brightness_after':float(after.mean())})
        assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
        print(f'{i}/39 exported and verified: {filename.name}',flush=True)
    (WORK/'verification.json').write_text(json.dumps(records,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['preview','process']);args=parser.parse_args()
    preview() if args.mode=='preview' else process()


