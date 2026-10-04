/* One "uber" fragment shader: 12 generative styles, symmetry, pixelate, OKLab colour mixing and a finishing stack.
   Every animated element moves on a closed circle (integer harmonics of u_phase) so loops are seamless. */
export const VERT = `#version 300 es
void main(){ vec2 v = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(v*2.-1., 0., 1.); }`

export const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res; uniform vec2 u_origin;
uniform float u_phase, u_seed;
uniform int u_style, u_n, u_sub, u_sym;
uniform vec3 u_lab[8];
uniform float u_scale,u_detail,u_warp,u_soft,u_angle,u_amp,u_kn,u_pixel;
uniform float u_hue,u_sat,u_bri,u_con,u_grain,u_gsize,u_gmono,u_vig,u_glow,u_gang,u_shade,u_post;
const float PI=3.14159265;
float g_asp; vec2 so;

float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p,int oct){ float a=.5,s=0.; for(int i=0;i<6;i++){ if(i>=oct) break; s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s/.96875; }
vec2 orb(float k,float s){ float a=u_phase*k+s*6.2831853; return vec2(cos(a),sin(a)); }

vec3 lin2srgb(vec3 c){ c=max(c,0.); return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
vec3 oklab2lin(vec3 c){
  float l_=c.x+.3963377774*c.y+.2158037573*c.z, m_=c.x-.1055613458*c.y-.0638541728*c.z, s_=c.x-.0894841775*c.y-1.2914855480*c.z;
  float l=l_*l_*l_, m=m_*m_*m_, s=s_*s_*s_;
  return vec3(4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s);
}
vec3 ramp(float t){
  t=clamp(t,0.,1.); if(u_n<2) return u_lab[0];
  float x=t*float(u_n-1); int i=min(int(floor(x)),u_n-2); float f=x-float(i); f=f*f*(3.-2.*f);
  return mix(u_lab[i],u_lab[i+1],f);
}
vec3 pal(int i){ return u_lab[i%u_n]; }

/* 0 MESH ------------------------------------------------------------------ */
vec3 sMesh(vec2 p){
  float A=u_amp;
  vec2 w=vec2(fbm(p*1.1+so+orb(1.,.1)*.5*A,3),fbm(p*1.1+so+vec2(7.3,2.1)+orb(1.,.6)*.5*A,3))-.5;
  p+=w*u_warp*1.6;
  int np=max(u_n,3+int(u_detail*5.)); np=min(np,8);
  vec3 acc=vec3(0.); float ws=0.; float pw=mix(8.,2.4,u_soft);
  for(int i=0;i<8;i++){ if(i>=np) break;
    float fi=float(i);
    vec2 h=hash22(vec2(fi*1.713+u_seed*3.1,fi*.371+u_seed*1.7));
    vec2 c=(h-.5)*vec2(g_asp,1.)*1.15;
    c+=orb(1.+mod(fi,2.),h.x)*.15*A*(.5+h.y);
    float d=length(p-c); float w1=1./(pow(d+.001,pw)+.02);
    acc+=pal(i)*w1; ws+=w1;
  }
  return acc/ws;
}
/* 1 AURORA ---------------------------------------------------------------- */
vec3 sAurora(vec2 p){
  float A=u_amp; vec3 col=mix(ramp(0.),u_lab[0]*vec3(.8,1.,1.),smoothstep(-.5,.5,p.y));
  int L=3+int(u_detail*5.); float wid=mix(.035,.28,u_soft);
  for(int l=0;l<8;l++){ if(l>=L) break;
    float fl=float(l), t=fl/float(max(L-1,1));
    float yy=p.y-(.3-t*.55);
    yy+=.14*sin(p.x*(1.3+fl*.35)+orb(1.+mod(fl,2.),fl*.21+.3).x*1.4*A+fl*1.9+u_seed);
    yy+=(fbm(vec2(p.x*1.1,fl*3.1)+so+orb(1.,fl*.17)*.5*A,3)-.5)*u_warp*1.3;
    float band=exp(-pow(yy/wid,2.));
    float ray=.65+.35*vnoise(vec2(p.x*(9.+fl*2.),fl*5.)+so);
    col=mix(col,ramp(.15+.85*t),clamp(band*ray*.9,0.,1.));
  }
  return col;
}
/* 2 LIQUID ---------------------------------------------------------------- */
vec3 sLiquid(vec2 p){
  float A=u_amp; int oc=2+int(u_detail*4.); vec2 q=p*1.4+so;
  float f1=fbm(q+orb(1.,.2)*.35*A,oc), f2=fbm(q+vec2(5.2,1.3)+orb(2.,.5)*.25*A,oc);
  float t=fbm(q+(1.5+4.5*u_warp)*vec2(f1,f2)+orb(1.,.9)*.2*A,oc);
  t=mix(smoothstep(.28,.72,t),t,u_soft);
  return ramp(t*1.12-.04);
}
/* 3 WAVES ------------------------------------------------------------------ */
vec3 sWaves(vec2 p){
  float A=u_amp; int L=3+int(u_detail*5.);
  vec3 col=mix(ramp(0.),ramp(.2),smoothstep(.55,-.5,p.y));
  float aa=fwidth(p.y)*1.5+mix(.002,.05,u_soft);
  for(int l=0;l<8;l++){ if(l>=L) break;
    float fl=float(l), t=fl/float(max(L-1,1));
    float y=mix(.18,-.42,t);
    y+=(.07+.05*u_warp)*sin(p.x*(1.1+.5*fl)+orb(1.+mod(fl,2.),fl*.37).x*1.6*A+fl*1.7+u_seed*2.);
    y+=.035*sin(p.x*(3.1+fl*.8)+orb(2.,fl*.2+.4).y*1.3*A+fl*.9);
    y+=(fbm(vec2(p.x*1.3,fl*2.7)+so,3)-.5)*u_warp*.3;
    float m=smoothstep(y+aa,y-aa,p.y);
    col=mix(col,ramp(.22+.78*t),m);
  }
  return col;
}
/* 4 SILK ------------------------------------------------------------------- */
vec3 sSilk(vec2 p){
  float A=u_amp; vec2 q=p*(1.4+u_detail*2.6)+so*.1;
  for(int i=0;i<5;i++){ float fi=float(i);
    q+=(.5+.45*u_warp)*sin(q.yx*(1.1+.2*fi)+fi*1.7+orb(1.+mod(fi,2.),fi*.31)*.9*A);
  }
  float t=.5+.5*sin(q.x*1.7+q.y*1.3);
  t=mix(smoothstep(.2,.8,t),t,u_soft);
  return ramp(t);
}
/* 5 BOKEH ------------------------------------------------------------------ */
vec3 sBokeh(vec2 p){
  float A=u_amp; vec3 col=mix(u_lab[0],ramp(.3),smoothstep(-.5,.6,p.y*.8+p.x*.3));
  int N=8+int(u_detail*44.);
  for(int i=0;i<60;i++){ if(i>=N) break;
    float fi=float(i); vec2 h=hash22(vec2(fi*2.31+u_seed*5.,fi*.77+1.));
    vec2 pos=(h-.5)*vec2(g_asp,1.)*1.25+orb(1.+mod(fi,3.),h.x)*.09*A;
    float r=mix(.035,.17,h.y*h.y+.1);
    float d=length(p-pos); float edge=mix(.012,.75,u_soft)*r+.0015;
    float disc=smoothstep(r,r-edge,d); float ring=smoothstep(r*.78,r,d)*disc;
    float a=(disc*.34+ring*(1.-u_soft)*.4)*mix(.45,1.,hash11(fi*3.7));
    col=mix(col,ramp(hash11(fi*1.9+2.)),a);
  }
  return col;
}
/* 6 GRADIENT --------------------------------------------------------------- */
vec3 sGrad(vec2 p){
  float A=u_amp; float ar=radians(u_angle),c=cos(ar),s=sin(ar);
  vec2 w=(vec2(fbm(p*1.3+so+orb(1.,.2)*.4*A,3),fbm(p*1.3+so+9.1+orb(1.,.7)*.4*A,3))-.5);
  p+=w*u_warp*.9;
  float ext=abs(s)*g_asp+abs(c); float t;
  if(u_sub==0) t=.5-p.y/ext;
  else if(u_sub==1) t=length(p)/(.5*sqrt(g_asp*g_asp+1.));
  else if(u_sub==2) t=abs(atan(p.y,p.x))/PI;
  else if(u_sub==3) t=(abs(p.x)+abs(p.y))/(.5*(g_asp+1.));
  else t=abs((.5-p.y/ext)*2.-1.);
  t+=.05*A*sin(u_phase);
  t=mix(smoothstep(0.,1.,t),t,u_soft);
  return ramp(t);
}
/* 7 TOPO ------------------------------------------------------------------- */
vec3 sTopo(vec2 p){
  float A=u_amp; float f=fbm(p*1.25+so+orb(1.,.3)*.3*A,3+int(u_detail*3.));
  float lv=7.+u_detail*30.; float v=f*lv; float l=abs(fract(v)-.5);
  float lw=mix(.02,.12,u_soft*.6+.2); float aa=fwidth(v)*.9+.001;
  float line=1.-smoothstep(lw-aa,lw+aa,l);
  vec3 bg=ramp(f*1.25-.1); vec3 lc=bg; lc.x+=u_sub==0?.2:-.2; lc.yz*=1.1;
  return mix(bg,lc,line*.9);
}
/* 8 DOTS ------------------------------------------------------------------- */
vec3 sDots(vec2 p){
  float A=u_amp; float n=10.+u_detail*60.; vec2 g=p*n; vec2 id=floor(g), fc=fract(g)-.5;
  vec2 cc=(id+.5)/n;
  float f=fbm(cc*1.1+so+orb(1.,.4)*.35*A,3);
  float val=clamp(mix(f,.5-cc.y*.9,.35*(1.-u_warp))+(u_warp-.3)*0.0,0.,1.);
  float r=.64*pow(val,.6); float d=length(fc); float aa=fwidth(d)*.8+.001;
  float dm=smoothstep(r,r-aa-mix(0.,.35,u_soft)*r,d);
  return mix(u_lab[0],ramp(.2+.8*val),dm);
}
/* 9 BLOBS ------------------------------------------------------------------ */
vec3 sBlobs(vec2 p){
  float A=u_amp; int N=4+int(u_detail*5.); float field=0.; vec3 acc=vec3(0.);
  for(int i=0;i<9;i++){ if(i>=N) break;
    float fi=float(i); vec2 h=hash22(vec2(fi*1.9+u_seed*2.3,fi*.53+3.));
    vec2 pos=(h-.5)*vec2(g_asp,1.)*.85+orb(1.+mod(fi,3.),h.y)*.2*A*(.4+h.x);
    float r=mix(.1,.27,h.y); float d=length(p-pos); float w=r*r/(d*d+1e-4);
    field+=w; acc+=(u_n>1?u_lab[1+i%(u_n-1)]:u_lab[0])*w;
  }
  vec3 bc=acc/max(field,1e-4); vec3 bg=mix(u_lab[0],ramp(.15),smoothstep(-.5,.5,p.y)*.6);
  float e=.015+u_soft*.9; float iso=smoothstep(1.-e*.5,1.+e,field);
  vec3 halo=mix(bg,bc,clamp(field*.18,0.,1.)*u_soft);
  return mix(halo,bc,iso);
}
/* 10 BANDS ----------------------------------------------------------------- */
vec3 sBands(vec2 p){
  float A=u_amp; float freq=2.+u_detail*14.; float t=p.y*freq;
  t+=(fbm(p*1.4+so+orb(1.,.4)*.3*A,3)-.5)*u_warp*5.;
  t+=floor(1.+A*3.)*u_phase/6.2831853*step(.001,A);
  float x=fract(t); float k=floor(t);
  float e=mix(.015,.5,u_soft);
  vec3 cur=pal(int(mod(k,float(u_n)))), prev=pal(int(mod(k-1.,float(u_n))));
  return mix(prev,cur,smoothstep(0.,e,x));
}

vec3 tone(vec3 lab){
  if(u_glow>0.){
    float ga=radians(u_gang); vec2 ctr=vec2(.5)+vec2(cos(ga),sin(ga))*.62;
    vec2 uv=(gl_FragCoord.xy+u_origin)/u_res; float d=length((uv-ctr)*vec2(g_asp,1.));
    float gl=exp(-d*d*3.2)*u_glow; lab.x+=gl*.3; lab.yz=lab.yz*(1.+gl*.6)+vec2(.0,.035)*gl;
  }
  lab.x=(lab.x-.6)*u_con+.6+u_bri*.25;
  lab.yz*=u_sat; float h=radians(u_hue),ch=cos(h),sh=sin(h); lab.yz=vec2(ch*lab.y-sh*lab.z,sh*lab.y+ch*lab.z);
  return lab;
}

void main(){
  vec2 px=gl_FragCoord.xy+u_origin;
  if(u_pixel>.5){ float m=min(u_res.x,u_res.y); float cell=m/u_pixel; px=(floor(px/cell)+.5)*cell; }
  vec2 uv=px/u_res; g_asp=u_res.x/u_res.y; vec2 p=(uv-.5)*vec2(g_asp,1.);
  if(u_sym==1) p.x=abs(p.x);
  else if(u_sym==2) p=abs(p);
  else if(u_sym==3){ float a=atan(p.y,p.x),r=length(p),seg=6.2831853/max(u_kn,2.); a=mod(a,seg); a=abs(a-seg*.5); p=r*vec2(cos(a),sin(a)); }
  float ar=radians(u_angle),c=cos(ar),s=sin(ar);
  p=vec2(c*p.x+s*p.y,-s*p.x+c*p.y); p/=max(u_scale,.05);
  so=vec2(hash11(u_seed*1.13)*80.,hash11(u_seed*2.17+3.)*80.);
  vec3 lab;
  if(u_style==0) lab=sMesh(p); else if(u_style==1) lab=sAurora(p); else if(u_style==2) lab=sLiquid(p);
  else if(u_style==3) lab=sWaves(p); else if(u_style==4) lab=sSilk(p); else if(u_style==5) lab=sBokeh(p);
  else if(u_style==6) lab=sGrad(p); else if(u_style==7) lab=sTopo(p); else if(u_style==8) lab=sDots(p);
  else if(u_style==9) lab=sBlobs(p); else if(u_style==10) lab=sBands(p); else lab=u_lab[0];
  lab=tone(lab);
  vec2 q=(gl_FragCoord.xy+u_origin)/u_res;
  if(abs(u_shade)>.001){
    float k=u_shade>0.?(1.-smoothstep(0.,.75,q.y)):smoothstep(.25,1.,q.y);
    lab.x*=1.-abs(u_shade)*.55*k; lab.yz*=1.-abs(u_shade)*.2*k;
  }
  if(u_vig>0.){ float vg=smoothstep(.3,1.15,length((q-.5)*vec2(g_asp*.55+.45,1.)*1.7)); lab.x*=1.-u_vig*.65*vg; lab.yz*=1.-u_vig*.3*vg; }
  vec3 rgb=lin2srgb(oklab2lin(lab));
  if(u_post>1.5) rgb=floor(clamp(rgb,0.,1.)*u_post+.5)/u_post;
  if(u_grain>0.){
    float m=min(u_res.x,u_res.y); float cell=max(1.,m/1100.*u_gsize); vec2 gp=floor((gl_FragCoord.xy+u_origin)/cell)+fract(u_seed)*57.;
    vec3 n3=vec3(hash21(gp),hash21(gp+17.3),hash21(gp+31.7))-.5; float n1=hash21(gp+3.1)-.5;
    rgb+=mix(n3,vec3(n1),u_gmono)*u_grain*.42;
  }
  vec2 dp=gl_FragCoord.xy+u_origin; rgb+=(hash21(dp)+hash21(dp+11.7)-1.)/255.;
  o=vec4(clamp(rgb,0.,1.),1.);
}`

export const STYLES = [
  { id: 'mesh', n: 0, name: 'Mesh', blurb: 'Soft colour blooms', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'aurora', n: 1, name: 'Aurora', blurb: 'Glowing curtains of light', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'liquid', n: 2, name: 'Liquid', blurb: 'Marbled, inky flow', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'waves', n: 3, name: 'Waves', blurb: 'Layered dunes & hills', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'silk', n: 4, name: 'Silk', blurb: 'Folded satin ripples', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'bokeh', n: 5, name: 'Bokeh', blurb: 'Out-of-focus lights', uses: ['scale', 'detail', 'soft', 'amp'] },
  { id: 'gradient', n: 6, name: 'Gradient', blurb: 'Classic, five shapes', uses: ['scale', 'warp', 'soft', 'amp', 'sub'], subs: ['Linear', 'Radial', 'Conic', 'Diamond', 'Mirror'] },
  { id: 'topo', n: 7, name: 'Contours', blurb: 'Topographic lines', uses: ['scale', 'detail', 'soft', 'amp', 'sub'], subs: ['Light lines', 'Dark lines'] },
  { id: 'dots', n: 8, name: 'Halftone', blurb: 'Printed dot field', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'blobs', n: 9, name: 'Blobs', blurb: 'Gooey metaballs', uses: ['scale', 'detail', 'soft', 'amp'] },
  { id: 'bands', n: 10, name: 'Bands', blurb: 'Prism stripes', uses: ['scale', 'detail', 'warp', 'soft', 'amp'] },
  { id: 'solid', n: 11, name: 'Solid', blurb: 'One flat colour', uses: [] },
]
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0]
