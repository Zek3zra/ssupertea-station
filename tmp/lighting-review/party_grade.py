from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
import hashlib,json
SOURCE=Path(r'C:\Users\JEROWA~1\AppData\Local\Temp\codex-clipboard-5342aad8-e3d8-4c34-994e-daa3061dbe4e.jpg')
ROOT=Path(r'C:\Users\Jerow Amelo\Documents\ssupertea-station\tmp\party-edit');ROOT.mkdir(exist_ok=True)
W=np.array([.2126,.7152,.0722],dtype=np.float32)

def grade(im):
    result=Image.new('RGB',im.size)
    for top in range(0,im.height,256):
        box=(0,top,im.width,min(top+256,im.height))
        a=np.asarray(im.crop(box),dtype=np.float32)/255
        # Correct the cold flash white balance and lift the midtones.
        a=a*np.array([1.065,1.008,.953],dtype=np.float32)
        y=a@W
        t=np.interp(y,[0,.025,.08,.18,.35,.55,.75,1],[.008,.019,.060,.178,.405,.635,.827,.982]).astype('float32')
        gain=t/np.maximum(y,.00001)
        rgb=t[...,None]+(a-y[...,None])*np.power(gain,.72)[...,None]
        # Keep the warm skin color range restrained while enriching drinks/clothes.
        mx=a.max(axis=2);mn=a.min(axis=2)
        sat=(mx-mn)/np.maximum(mx,.001)
        skin=((a[:,:,0]>a[:,:,1]*1.035)&(a[:,:,1]>a[:,:,2]*.94)&(a[:,:,0]>a[:,:,2]*1.04)&(y>.14)).astype('float32')
        vibrance=1+.15*(1-sat)*(1-.75*skin)
        rgb=t[...,None]+(rgb-t[...,None])*vibrance[...,None]
        # Cinematic split toning: teal shadows, warm flash-lit highlights.
        shadow=np.clip((.48-t)/.48,0,1)**1.3
        highlight=np.clip((t-.38)/.60,0,1)
        teal=np.array([-.018,.008,.024],dtype=np.float32);teal-=teal@W
        warm=np.array([.019,.002,-.013],dtype=np.float32);warm-=warm@W
        rgb+=shadow[...,None]*teal*(1-.8*skin[...,None])
        rgb+=highlight[...,None]*warm
        yy,xx=np.mgrid[top:box[3],0:im.width].astype('float32')
        xx/=im.width;yy/=im.height
        # A subtle plum color grade toward the frame edges, not added scene lighting.
        edge=np.clip(np.abs(xx-.50)*1.7,0,1)*(1-.65*skin)
        plum=np.array([.019,-.010,.025],dtype=np.float32);plum-=plum@W
        rgb+=edge[...,None]*plum*(.35+.65*shadow[...,None])
        # Magenta/cyan midtone color grading, feathered and protected on skin.
        left=np.exp(-((xx-.18)/.52)**2)
        right=np.exp(-((xx-.90)/.60)**2)
        mids=np.sin(np.pi*np.clip(t,0,1))**1.4*(1-.94*skin)
        pink=np.array([.043,-.024,.047],dtype=np.float32);pink-=pink@W
        cyan=np.array([-.031,.009,.042],dtype=np.float32);cyan-=cyan@W
        rgb+=mids[...,None]*(left[...,None]*pink+right[...,None]*cyan)
        distance=((xx-.50)/.75)**2+((yy-.48)/.85)**2
        rgb*=np.exp2(-.23*np.clip(distance,0,1.5)/2.2)[...,None]
        # Soft color-gamut compression avoids clipping saturated reds or skin.
        lum=rgb@W;delta=rgb-lum[...,None]
        high=delta.max(axis=2);low=-delta.min(axis=2)
        factor=np.minimum(1,np.minimum((1-lum)/np.maximum(high,.00001),lum/np.maximum(low,.00001)))
        rgb=lum[...,None]+delta*factor.clip(0,1)[...,None]
        result.paste(Image.fromarray(np.rint(rgb.clip(0,1)*255).astype('uint8')),(0,top))
    return result

before=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
with Image.open(SOURCE) as original:
    output=grade(original)
    opts={'quality':97,'subsampling':0,'optimize':True}
    for key in ['exif','icc_profile']:
        if original.info.get(key):opts[key]=original.info[key]
    final=ROOT/'party_vibe_lightroom_style.jpg';output.save(final,**opts)
    with Image.open(final) as check:
        check.load();assert check.size==original.size
        assert check.getexif().get(274)==original.getexif().get(274)
    preview=ImageOps.exif_transpose(output);preview.thumbnail((1600,1600));preview.save(ROOT/'party_vibe_preview.jpg',quality=94)
    orig=ImageOps.exif_transpose(original);orig.thumbnail((900,600));after=preview.copy();after.thumbnail((900,600))
    comp=Image.new('RGB',(1800,600));comp.paste(orig,(0,0));comp.paste(after,(900,0));comp.save(ROOT/'before-after.jpg',quality=93)
assert before==hashlib.sha256(SOURCE.read_bytes()).hexdigest()
print(json.dumps({'output':str(final),'dimensions':output.size,'source_unchanged':True,'output_sha256':hashlib.sha256(final.read_bytes()).hexdigest()}))

