# End-to-end test: title -> play -> chase -> restraint/slap escape -> irritation growth -> building smash -> game over -> retry
import asyncio, sys, time
from playwright.async_api import async_playwright
OUT = '/workspace/hachishaku3d/screenshots'
errors = []
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(180000)
        def onc(m):
            if m.type in ('error', 'warning'): errors.append(f'{m.type}: {m.text}'); print('CONSOLE', m.type, m.text, flush=True)
        pg.on('console', onc)
        pg.on('pageerror', lambda e: (errors.append(f'pageerror: {e}'), print('PAGEERROR', e, flush=True)))
        ev = pg.evaluate
        async def sim(steps, ms): await ev(f'window.__simSteps={steps}'); await pg.wait_for_timeout(ms); await ev('window.__simSteps=1')
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__ready===true')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{OUT}/01_title.png'); print('title ok', flush=True)
        await pg.click('#howto-btn'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{OUT}/01b_howto.png'); await pg.click('#howto-close')
        await pg.click('#start-btn'); await pg.wait_for_function("window.__game.S.mode==='play'")
        await ev("window.__fixedDt=1/30")
        await sim(6, 2500)
        # ---- chase, close up
        await ev("""()=>{const S=window.__game.S;S.invuln=99;S.h.stun=99;S.h.pos.set(S.pos.x+0.3,0,S.pos.z-3.6);S.h.yaw=0;window.__game.hachi.root.rotation.y=0;S.yaw=0.04;S.pitch=0.5;window.__game.setExpr('smug',99);document.getElementById('announce').classList.remove('show');}""")
        await sim(6, 2500)
        await pg.screenshot(path=f'{OUT}/02_chase_close.png'); print('chase ok', flush=True)
        await ev("""()=>{const S=window.__game.S;S.h.pos.set(S.pos.x+1.5,0,S.pos.z-7.5);S.h.yaw=-0.2;S.pitch=0.3;window.__game.setExpr('angry',99);}""")
        await sim(6, 2000)
        await pg.screenshot(path=f'{OUT}/02b_chase_angry.png')
        # ---- restraint + slap escape
        await ev("()=>{const S=window.__game.S;S.invuln=0;S.h.stun=0;window.__game.setExpr('smug',0);S.h.pos.set(S.pos.x,0,S.pos.z-2.5);window.__game.startGrab();}")
        await sim(5, 2500)
        await pg.screenshot(path=f'{OUT}/03_restraint.png'); print('grab ok', flush=True)
        for i in range(4):
            await pg.mouse.click(640, 420); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Space'); await sim(2, 300)
        await pg.screenshot(path=f'{OUT}/04_slap.png')
        for i in range(10):
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(150)
        await sim(4, 1500)
        st = await ev("()=>{const S=window.__game.S;return {mode:S.mode,escapes:S.escapes,hearts:S.hearts}}"); print('after slaps', st, flush=True)
        assert st['mode'] == 'play' and st['escapes'] == 1, st
        # ---- irritation growth (stage ups through the real meter)
        for i in range(4):
            await ev("()=>{const S=window.__game.S;S.irritation=99.9;S.h.stun=99;S.invuln=99;}"); await sim(10, 2500)
        await sim(10, 4000)
        st = await ev("()=>{const S=window.__game.S;return {stage:S.stage,r:+window.__game.hachi.radius.toFixed(2)}}"); print('stage', st, flush=True)
        assert st['stage'] >= 4
        # ---- smash: put her on the road next to a tall building, player watching from down the road
        info = await ev("""()=>{const g=window.__game,S=g.S,w=g.world;const r=-14;
          const cand=w.buildings.filter(b=>b.alive&&b.h>8&&b.h<17&&Math.abs(b.x1-(r-4))<1.5&&Math.abs(b.cz)<45).sort((a,b)=>Math.abs(a.cz)-Math.abs(b.cz));
          const b=cand[0]; const R=g.hachi.radius;
          S.invuln=999; S.h.stun=999;
          S.h.pos.set(b.x1+R*0.9+1.2,0,b.cz); S.h.yaw=-Math.PI/2; g.hachi.root.rotation.y=S.h.yaw;
          S.pos.set(r+3.2,0,b.cz+11.5); const lx=(b.x1+1)-S.pos.x, lz=b.cz-S.pos.z; S.yaw=Math.atan2(-lx,-lz); S.pitch=0.38;
          window.__tb=b; return {h:b.h,R}}""")
        print('target', info, flush=True)
        await sim(4, 1500)
        await pg.screenshot(path=f'{OUT}/05_giant_before.png')
        await ev("()=>{const S=window.__game.S,b=window.__tb; window.__push=setInterval(()=>{ if(b.alive){S.h.pos.x-=0.08;} },30)}")
        for i in range(60):
            await pg.wait_for_timeout(200)
            if not await ev("window.__tb.alive"): break
        await ev("clearInterval(window.__push)")
        await pg.wait_for_function("window.__tb.collapse>0.75")
        await pg.screenshot(path=f'{OUT}/06_giant_smash.png'); print('smash ok', flush=True)
        await pg.wait_for_function("window.__tb.collapse>1.3||window.__tb.collapse<0")
        await pg.screenshot(path=f'{OUT}/07_giant_smash2.png')
        st = await ev("()=>({buildings:window.__game.S.buildings})"); print('smash', st, flush=True)
        assert st['buildings'] >= 1
        # ---- free AI chase for a while (real logic)
        await ev("()=>{const S=window.__game.S;S.invuln=0;S.h.stun=0;}")
        await sim(10, 4000)
        # ---- game over: caught on last heart
        await ev("()=>{const S=window.__game.S;S.hearts=1;S.invuln=0;window.__game.startGrab();}")
        await sim(3, 2500)
        await pg.screenshot(path=f'{OUT}/08_final_hug.png')
        await ev('window.__simSteps=6'); await pg.wait_for_function("window.__game.S.mode==='over'"); await ev('window.__simSteps=1')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'{OUT}/09_gameover.png'); print('over ok', flush=True)
        await pg.click('#retry-btn'); await pg.wait_for_timeout(1500)
        st = await ev("()=>window.__game.S.mode"); print('retry mode', st); assert st == 'play'
        voices = await ev("()=>Object.keys(window.__game.audio.buffers).length"); print('voices loaded', voices)
        await b.close()
    print('ERRORS:', len(errors)); [print(' ', e) for e in errors]
asyncio.run(main())
