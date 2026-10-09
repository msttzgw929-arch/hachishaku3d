import asyncio, sys
from playwright.async_api import async_playwright
# pose.py out.png "<js run after start>" wait_ms [dt]
async def main():
    out, js, wait = sys.argv[1], sys.argv[2], int(sys.argv[3])
    dt = sys.argv[4] if len(sys.argv) > 4 else '1/30'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(180000)
        pg.on('console', lambda m: print('CONSOLE', m.type, m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__ready===true')
        await pg.click('#start-btn'); await pg.wait_for_function("window.__game.S.mode==='play'")
        await pg.evaluate(f"window.__fixedDt={dt}")
        await pg.evaluate("()=>{document.getElementById('announce').style.display='none'}")
        await pg.evaluate("()=>{" + js + "}")
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out); await b.close()
asyncio.run(main())
