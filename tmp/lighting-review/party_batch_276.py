from pathlib import Path
from PIL import Image,ImageOps,ImageFilter,ImageDraw
from concurrent.futures import ThreadPoolExecutor,as_completed
import numpy as np,json,hashlib,argparse,time
SRC=Path(r'C:\Users\Jerow Amelo\Documents\DCIM\276_FUJI')
ROOT=Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\party-batch-276')
FILES=sorted(p for p in SRC.iterdir() if p.suffix.lower() in ['.jpg','.jpeg','.png','.tif','.tiff'])
W=np.array([.2126,.7152,.0722],dtype=np.float32)
WB=np.array([1.065,1.008,.953],dtype=np.float32)
SIZE=49
bb,gg,rr=np.meshgrid(np.linspace(0,1,SIZE,dtype=np.float32),np.linspace(0,1,SIZE,dtype=np.float32),np.linspace(0,1,SIZE,dtype=np.float32),indexing='ij')
GRID=np.stack([rr,gg,bb],axis=-1).reshape(-1,3)

def settings(im):
    sm=ImageOps.exif_transpose(im);sm.thumbnail((480,480));a=np.asarray(sm.convert('RGB'),dtype=np.float32)/255
    a*=WB;y=a@W
    mx=a.max(axis=-1);mn=a.min(axis=-1);s=(mx-mn)/np.maximum(mx,.001)
    mask=(a[:,:,0]>a[:,:,1]*1.035)&(a[:,:,0]>a[:,:,2]*1.065)&(a[:,:,1]>a[:,:,2]*.91)&(s>.07)&(s<.48)&(y>.14)&(y<.94)
    mask[:int(y.shape[0]*.15)]=False;mask[int(y.shape[0]*.83):]=False
    if mask.sum()>100:
        anchor=float(np.percentile(y[mask],65))
    else:
        valid=y[(y>.12)&(y<.88)];anchor=float(np.percentile(valid,65)) if valid.size else .4
    ev=float(np.clip(2.2*np.log2(.51/max(anchor,.07)),-.70,1.15))
    return {'exposure_ev':round(ev,3),'skin_midtone_anchor':round(anchor,3)}

def lut(params):
    a=GRID*WB;y=a@W
    ev=params['exposure_ev']
    if ev>=0:
        effective=ev*(1-.78*np.clip((y-.53)/.35,0,1))
    else:
        effective=ev*np.clip((y-.12)/.52,0,1)
    exposed=y*np.exp2(effective/2.2)
    t=np.interp(exposed,[0,.025,.08,.18,.35,.55,.75,1,1.3],[.004,.029,.125,.265,.448,.632,.807,.965,.99]).astype('float32')
    gain=t/np.maximum(y,.00001)
    rgb=t[:,None]+(a-y[:,None])*np.power(gain,.72)[:,None]
    mx=a.max(axis=-1);mn=a.min(axis=-1);sat=(mx-mn)/np.maximum(mx,.001)
    # Soft protection of warm skin-color ranges for smooth transitions.
    skin=np.clip((a[:,0]-a[:,1]-.005)/.055,0,1)*np.clip((a[:,0]-a[:,2])/.055,0,1)*np.clip((y-.08)/.12,0,1)
    vibrance=1+.15*(1-sat)*(1-.80*skin)
    rgb=t[:,None]+(rgb-t[:,None])*vibrance[:,None]
    shadow=np.clip((.48-t)/.48,0,1)**1.3
    highlight=np.clip((t-.38)/.6,0,1)
    teal=np.array([-.018,.008,.024]);teal-=teal@W
    warm=np.array([.019,.002,-.013]);warm-=warm@W
    plum=np.array([.016,-.012,.028]);plum-=plum@W
    rgb+=shadow[:,None]*teal*(1-.85*skin[:,None])
    rgb+=highlight[:,None]*warm
    rgb+=(np.sin(np.pi*np.clip(t,0,1))**1.5*(1-.94*skin))[:,None]*plum
    lum=rgb@W;delta=rgb-lum[:,None]
    high=delta.max(axis=-1);low=-delta.min(axis=-1)
    factor=np.minimum(1,np.minimum((1-lum)/np.maximum(high,.00001),lum/np.maximum(low,.00001)))
    rgb=lum[:,None]+delta*factor.clip(0,1)[:,None]
    return ImageFilter.Color3DLUT(SIZE,rgb.clip(0,1).reshape(-1).tolist(),channels=3)

def preview_one(p):
    with Image.open(p) as raw:
        params=settings(raw);im=ImageOps.exif_transpose(raw).convert('RGB');im.thumbnail((1200,1200));edited=im.filter(lut(params))
        edited.save(ROOT/(p.stem+'-sample.jpg'),quality=94)
        before=im.copy();after=edited.copy();before.thumbnail((800,600));after.thumbnail((800,600))
        c=Image.new('RGB',(1600,636),'#202020');c.paste(before,(0,36));c.paste(after,(800,36));d=ImageDraw.Draw(c)
        d.text((12,12),p.name+' ORIGINAL',fill='white');d.text((812,12),'PARTY EDIT',fill='white');c.save(ROOT/(p.stem+'-comparison.jpg'),quality=93)
        return p.name,params

def process_one(p):
    digest=hashlib.sha256(p.read_bytes()).hexdigest()
    dest=ROOT/'final'/(p.stem+'_party.JPG')
    with Image.open(p) as raw:
        assert raw.mode=='RGB'
        params=settings(raw);out=raw.filter(lut(params))
        opts={'quality':97,'subsampling':0,'optimize':True}
        for key in ['exif','icc_profile']:
            if raw.info.get(key):opts[key]=raw.info[key]
        out.save(dest,**opts)
        with Image.open(dest) as check:
            check.load();assert check.size==raw.size
            assert check.getexif().get(274)==raw.getexif().get(274)
            assert check.info.get('icc_profile')==raw.info.get('icc_profile')
            im=ImageOps.exif_transpose(check);im.thumbnail((600,600));im.save(ROOT/'previews'/(p.stem+'.jpg'),quality=90)
        rec={'source':p.name,'output':dest.name,'size':raw.size,'settings':params,'source_sha256':digest,'output_sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
    assert digest==hashlib.sha256(p.read_bytes()).hexdigest()
    return rec

def sheets():
    for start in range(0,len(FILES),24):
        c=Image.new('RGB',(1600,1800),'#202020');d=ImageDraw.Draw(c)
        for j,p in enumerate(FILES[start:start+24]):
            with Image.open(ROOT/'previews'/(p.stem+'.jpg')) as im:
                im.thumbnail((392,266));x=(j%4)*400;y=(j//4)*300;c.paste(im,(x,y));d.text((x+8,y+273),p.name,fill='white')
        c.save(ROOT/f'edited-{start//24+1}.jpg',quality=92)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('mode',choices=['preview','process']);args=ap.parse_args()
    if args.mode=='preview':
        ids=[6040,6047,6053,6085,6097,6115,6138,6149,6170,6185,6199,6204]
        for n in ids:print(preview_one(SRC/f'DSCF{n}.JPG'),flush=True)
    else:
        (ROOT/'final').mkdir(exist_ok=True);(ROOT/'previews').mkdir(exist_ok=True)
        results=[];errors=[]
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures={pool.submit(process_one,p):p for p in FILES}
            for future in as_completed(futures):
                p=futures[future]
                try:
                    rec=future.result();results.append(rec)
                    print(f'{len(results)}/{len(FILES)} verified: {p.name}',flush=True)
                except Exception as exc:
                    errors.append({'source':p.name,'error':str(exc)});print(f'ERROR {p.name}: {exc}',flush=True)
                (ROOT/'verification.json').write_text(json.dumps({'completed':results,'errors':errors},indent=2))
        if errors:raise RuntimeError(errors)
        assert len(results)==len(FILES)==140
        sheets();print('DONE: all 140 exports and review sheets verified',flush=True)

