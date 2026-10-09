# AivisSpeech Engine (Style-Bert-VITS2 based) + JVNV "F2" emotional model.
# Each line: several takes with varied style strength/tempo; best take chosen by ASR (faster-whisper) CER + pitch liveliness.
import requests, json, subprocess, os, sys, numpy as np, parselmouth, difflib, re
E='http://localhost:10101'
sp={s['name']:{t['name']:t['id'] for t in s['styles']} for s in requests.get(E+'/speakers').json()}
V=sp['F2']
# key: text, asr_ref, style, speed, intonation(style strength), tempoDyn, semitone shift
L={
 'spot1':("みーつけたっ♪",'幸せ',0.92,1.6,1.3,-1.0),
 'spot2':("うふふっ、みぃつけた。",'幸せ',0.9,1.5,1.2,-1.5),
 'spot3':("あらぁ？　そんなところにいたのね♪",'幸せ',0.95,1.6,1.2,-1.5),
 'taunt1':("ぽ、ぽ、ぽ……。ぽぽぽぽ……♪",'幸せ',0.8,1.6,1.2,-1.5),
 'taunt2':("逃げても無駄よぉ〜？",'幸せ',0.92,1.6,1.3,-1.5),
 'taunt3':("ねぇ、まってぇ〜？　お姉さんと、あそびましょ？",'幸せ',0.92,1.6,1.3,-1.5),
 'taunt4':("うふふっ。どこへ行くのかしら？",'幸せ',0.95,1.6,1.2,-1.5),
 'taunt5':("あははっ、鬼ごっこ、楽しいわねぇ！",'幸せ',1.0,1.7,1.3,-1.5),
 'taunt6':("ほぉら、もうすぐそこよ？　うふふっ♪",'幸せ',0.9,1.6,1.2,-1.5),
 'catch1':("つかまえたっ♡",'幸せ',0.9,1.6,1.3,-1.0),
 'catch2':("うふふっ、もう、はなさないわよ？",'幸せ',0.92,1.4,1.2,-1.5),
 'catch3':("はぁい、つかまえた。いい子ねぇ♡",'幸せ',0.9,1.6,1.2,-1.5),
 'slap1':("ひゃあんっ！",'驚き',1.0,1.7,1.2,-1.0),
 'slap2':("お腹、たたかないでぇ！",'悲しみ',1.0,1.6,1.3,-1.0),
 'slap3':("やぁんっ！",'驚き',1.05,1.6,1.2,-1.0),
 'slap4':("ちょっと、お腹はだめぇっ！",'驚き',1.05,1.6,1.2,-1.0),
 'slap5':("いたぁい！",'悲しみ',0.95,1.5,1.2,-1.0),
 'slap6':("きゃあっ！　いたぁい！",'驚き',1.0,1.6,1.2,-1.0),
 'esc1':("もう〜っ！",'怒り',1.0,1.6,1.3,-1.0),
 'esc2':("あぁん……逃げられちゃった……。",'悲しみ',0.95,1.6,1.2,-1.5),
 'esc3':("もうっ！　ひどいじゃないっ！",'怒り',1.05,1.6,1.3,-1.5),
 'irr1':("イライラしてきた……！",'怒り',0.97,1.6,1.3,-1.5),
 'irr2':("もう許さないんだからっ！",'怒り',1.0,1.7,1.3,-1.5),
 'irr3':("ああもうっ！　イライラして、お腹がふくらんじゃうっ！",'怒り',1.03,1.7,1.3,-1.5),
 'irr4':("見なさい、このお腹！　ぜんぶ、あなたのせいなんだからっ！",'怒り',1.0,1.6,1.3,-1.5),
 'irr5':("まだまだ大きくなるわよぉ……。覚悟しなさいっ！",'怒り',0.97,1.5,1.2,-2.0),
 'smash1':("邪魔よっ！",'怒り',1.0,1.7,1.3,-1.5),
 'smash2':("あら、ごめんなさいね？　お腹がぶつかっちゃった♪",'幸せ',0.97,1.5,1.2,-1.5),
 'smash3':("おほほほっ！　建物なんて関係ないわ！",'幸せ',1.0,1.7,1.3,-1.5),
 'over1':("うふふ……。これで、ずぅっと、お姉さんと一緒ね♡",'幸せ',0.88,1.4,1.1,-2.0),
 'over2':("つーかまえたっ。もう、逃がさないんだから♡",'幸せ',0.9,1.5,1.2,-1.5),
}
out='/workspace/hachishaku3d/assets/voice'; os.makedirs(out,exist_ok=True)
os.makedirs('/tmp/takes3d',exist_ok=True)
from faster_whisper import WhisperModel
asr=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=3)
def norm(s): return re.sub(r'[^\u3040-\u30ff\u4e00-\u9fff]','',s).replace('ー','').replace('〜','')
def kana(s):
    q=requests.post(E+'/audio_query',params={'text':s,'speaker':V['ノーマル']}).json(); return q['kana']
only=sys.argv[1:]
report={}
for k,(t,st,spd,it,td,semi) in L.items():
    if only and k not in only: continue
    best=None
    VARS=[(0,0),(0.25,-0.03),(-0.2,0.03)]+([(0.1,-0.06),(-0.35,0.0)] if only else [])
    for j,(dit,dsp) in enumerate(VARS):
        sid=V[st]
        q=requests.post(E+'/audio_query',params={'text':t,'speaker':sid}).json()
        q.update(speedScale=spd+dsp,intonationScale=it+dit,tempoDynamicsScale=td,prePhonemeLength=0.05,postPhonemeLength=0.25)
        fn=f'/tmp/takes3d/{k}_{j}.wav'
        if not os.path.exists(fn):
            w=requests.post(E+'/synthesis',params={'speaker':sid},json=q).content
            open(fn,'wb').write(w)
        aud=parselmouth.Sound(fn).resample(16000).values[0].astype(np.float32)
        segs,_=asr.transcribe(aud,language='ja',beam_size=3)
        hyp=''.join(s.text for s in segs)
        r=difflib.SequenceMatcher(None,norm(hyp),norm(t)).ratio()
        snd=parselmouth.Sound(fn); f=snd.to_pitch().selected_array['frequency']; f=f[f>0]
        rng=12*np.log2(np.percentile(f,95)/np.percentile(f,5)) if len(f)>5 else 0
        score=r+0.01*min(rng,16)
        print(f'  {k} take{j} asr="{hyp}" sim={r:.2f} range={rng:.1f}st')
        if best is None or score>best[0]: best=(score,fn,hyp,r,rng)
    _,fn,hyp,r,rng=best
    af=f'rubberband=pitch={2**(semi/12):.4f}:formant=preserved,highpass=f=80,equalizer=f=3500:t=q:w=1.2:g=2,aecho=0.8:0.6:38|77:0.13|0.07,loudnorm=I=-16:TP=-1.5:LRA=11'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',fn,'-af',af,'-ac','1','-ar','44100','-b:a','80k',f'{out}/{k}.mp3'],check=True)
    report[k]=dict(text=t,style=st,asr=hyp,sim=round(r,2),pitch_range_st=round(float(rng),1))
    print(k,st,'->',hyp,round(r,2),flush=True)
old={}
if os.path.exists(out+'/lines.json'): old=json.load(open(out+'/lines.json'))
old.update(report)
json.dump(old,open(out+'/lines.json','w'),ensure_ascii=False,indent=1)
