# Speed test: player vs her at every stage, with and without forced lunges. Gap must grow in every case; her peak must stay <= 45% of player speed.
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':480,'height':270}); ev=pg.evaluate
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type in ('error','warning') and errs.append(m.text))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__ready===true')
        await pg.click('#start-btn'); await pg.wait_for_function("window.__game.S.mode==='play'")
        await ev("window.__fixedDt=1/30")
        await ev("""()=>{window.__mx=0;window.__mon=setInterval(()=>{const S=window.__game.S;window.__mx=Math.max(window.__mx,S.h.speed);if(window.__forceLunge){S.h.lunge=9;}},5)}""")
        res=[]
        for stage in range(0,7):
          for lunge in (False, True):
            await ev(f"()=>{{const g=window.__game,S=g.S;S.stage={stage};g.hachi.setStage({stage},true);S.irritation=99;S.invuln=0;S.h.stun=0;S.h.lungeCd=99;S.h.lunge=0;window.__forceLunge={'true' if lunge else 'false'};S.pos.set(14,0,120);S.vel.set(0,0,-11.5);S.yaw=0;const R=g.hachi.radius;S.h.pos.set(14,0,120+2*R+6);S.h.yaw=Math.PI;g.hachi.root.rotation.y=Math.PI;S.h.speed=0;S.hearts=3;window.__mx=0;}}")
            await pg.keyboard.down('KeyW'); await ev("window.__simSteps=3")
            g = "()=>{const g=window.__game,S=g.S,c=g.hachi.bellyCenter(new g.camera.position.constructor());return Math.hypot(S.pos.x-c.x,S.pos.z-c.z)-g.hachi.radius}"
            await pg.wait_for_timeout(400); g0 = await ev(g); t0 = await ev("performance.now()")
            await pg.wait_for_timeout(2500); g1 = await ev(g)
            r = await ev("()=>{const S=window.__game.S;return {pv:Math.hypot(S.vel.x,S.vel.z),hmax:window.__mx,mode:S.mode}}")
            await ev("window.__simSteps=1;window.__forceLunge=false"); await pg.keyboard.up('KeyW')
            row=dict(stage=stage,lunge=lunge,gap0=round(g0,2),gap1=round(g1,2),player=round(r['pv'],2),her_max=round(r['hmax'],2),ratio=round(r['hmax']/11.5,3),mode=r['mode'])
            print(row, flush=True); res.append(row)
        print('ALL_GROW', all(x['gap1']>x['gap0'] and x['mode']=='play' for x in res), 'MAXRATIO', max(x['ratio'] for x in res))
        print('errors', errs)
        await b.close()
asyncio.run(main())
