from pathlib import Path
import argparse, json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\lighting-review\even-lighting')
ROOT.mkdir(exist_ok=True)
SOURCE=Path(r'C:\Users\Jerow Amelo\Documents\to be edit')
IDS=[6011,6012,6013,6019,6020,6021,6024,6030,6031,6034,6035]
W=np.array([.2126,.7152,.0722],dtype=np.float32)
# Feathered local exposure brushes placed using the original photographs.
FACES={
6011:[(.075,.48,.40),(.145,.48,.55),(.235,.475,.40),(.435,.47,.20),(.61,.47,-.45),(.725,.47,.15),(.855,.475,.50)],
6012:[(.075,.48,.40),(.145,.47,.55),(.235,.475,.40),(.435,.47,.20),(.625,.47,-.45),(.735,.47,.15),(.872,.46,.50)],
6013:[(.28,.40,.3),(.27,.455,.4),(.48,.43,.55),(.58,.43,.55),(.656,.365,.3),(.79,.373,.45)],
6019:[(.217,.412,.35),(.213,.52,.35),(.458,.407,.55),(.602,.402,.55),(.704,.345,.35),(.869,.342,.4)],
6020:[(.25,.423,.35),(.23,.528,.35),(.48,.427,.55),(.574,.393,.5),(.706,.366,.35),(.911,.348,.4)],
6021:[(.215,.414,.35),(.193,.526,.35),(.457,.411,.55),(.603,.412,.5),(.734,.365,.35),(.953,.328,.4)],
6024:[(.312,.411,.3),(.31,.486,.35),(.472,.455,.55),(.595,.502,.5),(.637,.421,.35),(.759,.459,.45),(.986,.476,.1)],
6030:[(.19,.414,.3),(.177,.468,.35),(.444,.455,.55),(.532,.391,.5),(.753,.39,.35),(.887,.415,.4)],
6031:[(.231,.433,.3),(.244,.505,.35),(.454,.484,.55),(.556,.412,.5),(.74,.40,.35),(.888,.431,.4)],
6034:[(.34,.459,-.18),(.621,.5,.4)],
6035:[(.354,.48,-.12),(.505,.506,.5),(.644,.528,.7)]}

def exposure_map(im,number):
    small=im.copy();small.thumbnail((480,480))
    a=np.asarray(small,dtype=np.float32)/255
    y=a@W
    # Smooth illumination estimate: the full-resolution texture is never filtered.
    base=np.asarray(Image.fromarray(np.rint(y*255).astype('uint8')).filter(ImageFilter.GaussianBlur(24)),dtype=np.float32)/255
    ev=np.clip(1.18*np.log2(.54/np.maximum(base,.035)),-.22,1.65)
    yy,xx=np.mgrid[0:y.shape[0],0:y.shape[1]].astype(np.float32)
    xx/=y.shape[1];yy/=y.shape[0]
    for x,fy,amount in FACES[number]:
        ev+=(amount*1.8 if amount>0 else amount*.12)*np.exp(-.5*(((xx-x)/.045)**2+((yy-fy)/.075)**2))
    if number in (6011,6012):
        # Reduce the ceiling spotlight on the central face and wall.
        ev-=.22*np.exp(-.5*(((xx-.61)/.105)**2+((yy-.24)/.12)**2))
    if number in (6034,6035):
        ev-=.20*np.exp(-.5*(((xx-.26)/.11)**2+((yy-.36)/.20)**2))
    return Image.fromarray(ev.astype('float32')).resize(im.size,Image.Resampling.BILINEAR)

def render(im,number):
    field=exposure_map(im,number)
    out=Image.new('RGB',im.size)
    for top in range(0,im.height,256):
        box=(0,top,im.width,min(top+256,im.height))
        a=np.asarray(im.crop(box),dtype=np.float32)/255
        y=a@W
        ev=np.asarray(field.crop(box),dtype=np.float32)
        # Luminance-qualified fill limits spill onto white shirts and bright skin.
        highlight_protection=1-.88*np.clip((y-.30)/.45,0,1)
        ev=np.where(ev>0,np.minimum(ev,1.85)*highlight_protection,ev)
        raw=y*np.exp2(ev/2.2)
        # Gentle highlight shoulder with continuous slope, preserving bright detail.
        t=np.where(raw>.80,.80+.20*(1-np.exp(-np.maximum(raw-.80,0)/.20)),raw).clip(0,1)
        t=t+.70*t*(1-t)**3
        ratio=t/np.maximum(y,.00001)
        delta=(a-y[...,None])*np.power(ratio,.65)[...,None]
        high=np.max(delta,axis=2);low=-np.min(delta,axis=2)
        c=np.minimum(1,np.minimum((1-t)/np.maximum(high,.00001),t/np.maximum(low,.00001)))
        result=t[...,None]+delta*c[...,None]
        out.paste(Image.fromarray(np.rint(result.clip(0,1)*255).astype('uint8')),(0,top))
    return out

def preview():
    for n in IDS:
        with Image.open(SOURCE/f'DSCF{n}.JPG') as im:
            im=im.convert('RGB');im.thumbnail((1200,800));out=render(im,n)
            out.save(ROOT/f'DSCF{n}-preview.jpg',quality=94)
            comp=Image.new('RGB',(2400,836),'#202020');comp.paste(im,(0,36));comp.paste(out,(1200,36))
            d=ImageDraw.Draw(comp);d.text((16,12),'ORIGINAL',fill='white');d.text((1216,12),'EVEN LIGHTING',fill='white')
            comp.save(ROOT/f'DSCF{n}-comparison.jpg',quality=94)
        print(f'Preview {n}',flush=True)

def process():
    dest=ROOT/'final';dest.mkdir(exist_ok=True);records=[]
    for i,n in enumerate(IDS,1):
        path=SOURCE/f'DSCF{n}.JPG';before=hashlib.sha256(path.read_bytes()).hexdigest()
        with Image.open(path) as im:
            out=render(im,n);file=dest/f'DSCF{n}_even_lighting.JPG'
            opts={'quality':97,'subsampling':0,'optimize':True}
            for key in ['exif','icc_profile']:
                if im.info.get(key):opts[key]=im.info[key]
            out.save(file,**opts)
            with Image.open(file) as check:
                check.load();assert check.size==im.size
                assert check.getexif().get(274)==im.getexif().get(274)
                assert check.info.get('icc_profile')==im.info.get('icc_profile')
            records.append({'source':path.name,'output':file.name,'source_sha256':before,'output_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'dimensions':im.size})
        assert before==hashlib.sha256(path.read_bytes()).hexdigest()
        print(f'{i}/11 exported and verified: {file.name}',flush=True)
    (ROOT/'verification.json').write_text(json.dumps(records,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['preview','process']);args=p.parse_args()
    preview() if args.mode=='preview' else process()


