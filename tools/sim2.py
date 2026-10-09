import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 640, 'height': 360}); pg.set_default_timeout(180000)
        errs=[]
        pg.on('console', lambda m: (errs.append(m.text), print('CONSOLE', m.type, m.text)) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: (errs.append(str(e)), print('PAGEERROR', e)))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__ready===true')
        await pg.click('#start-btn'); await pg.wait_for_function("window.__game.S.mode==='play'")
        print('calls', await pg.evaluate("window.__game.renderer.info.render.calls"), 'tris', await pg.evaluate("window.__game.renderer.info.render.triangles"))
        await pg.evaluate("window.__fixedDt=1/30; window.__simSteps=10")
        # player runs away in a loop pattern: auto-slap when grabbed
        await pg.evaluate("""()=>{const g=window.__game;setInterval(()=>{const S=g.S; if(S.mode==='grab') g.slap(); if(S.hearts<=1) S.hearts=3; const d=Math.hypot(S.pos.x-S.h.pos.x,S.pos.z-S.h.pos.z); if(d<9&&S.mode==='play'){ const R=[-70,-42,-14,14,42,70]; S.pos.set(R[(Math.random()*6)|0],0,R[(Math.random()*6)|0]+ (Math.random()-0.5)*20); g.world.collide(S.pos,0.4);} },50)}""")
        for i in range(30):
            await pg.wait_for_timeout(4000)
            st = await pg.evaluate("()=>{const S=window.__game.S;return {t:+S.time.toFixed(1),mode:S.mode,d:+Math.hypot(S.pos.x-S.h.pos.x,S.pos.z-S.h.pos.z).toFixed(1),stage:S.stage,irr:+S.irritation.toFixed(0),bld:S.buildings,catches:S.catches,esc:S.escapes,hp:[+S.h.pos.x.toFixed(1),+S.h.pos.z.toFixed(1)]}}")
            print(st, flush=True)
        print('errors', len(errs))
        await b.close()
asyncio.run(main())
